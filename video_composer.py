"""
Video Composer Module
Phase B & C of Step 5: 分镜视频生成 + 最终合成

Phase B: Convert storyboard images to video clips via Seedance 2.0
Phase C: 7-stage composition pipeline with resume capability

Supports: image-to-video, batch generation, SRT subtitles, FFmpeg concat,
transitions, BGM mixing, staged pipeline with checkpoint/resume.
"""
from __future__ import annotations

import json
import logging
import os
import random
import re as _re
import shutil
import string
import subprocess
import tempfile
import threading
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from mysql_storage import get_storage

# ---------------------------------------------------------------------------
# Opener helper (Clash TUN DIRECT rule handles zlhub routing natively)
# ---------------------------------------------------------------------------


def _make_opener(target_url: str) -> urllib.request.OpenerDirector:
    """Return a plain urllib opener (no explicit proxy needed)."""
    return urllib.request.build_opener()

log = logging.getLogger("video_composer")

# Per-task file I/O lock
_task_locks: dict[str, threading.RLock] = {}
_task_locks_lock = threading.Lock()


def _get_task_lock(task_id: str) -> threading.RLock:
    with _task_locks_lock:
        if task_id not in _task_locks:
            _task_locks[task_id] = threading.RLock()
        return _task_locks[task_id]


def _validate_id(value: str) -> str:
    """Validate that an ID contains only safe characters."""
    if not _re.match(r"^[a-zA-Z0-9_-]+$", value):
        raise ValueError(f"Invalid ID (unsafe characters): {value!r}")
    return value

# ---------------------------------------------------------------------------
# Camera Movement Mapping (设计文档 §3.2)
# ---------------------------------------------------------------------------

CAMERA_MOVEMENT_MAP: dict[str, str] = {
    "push_in_slow": "push_in",
    "push_in": "push_in",
    "pull_back": "pull_back",
    "pan_left": "pan",
    "pan_right": "pan",
    "orbit": "orbit",
    "static": "auto",
    "handheld": "handheld",
    "tilt_up": "push_in",
    "crane_down": "pull_back",
    "auto": "auto",
}

# ---------------------------------------------------------------------------
# Compose Errors (设计文档 §7.2)
# ---------------------------------------------------------------------------

COMPOSE_ERRORS: dict[str, dict[str, Any]] = {
    "FORMAT_MISMATCH": {
        "message": "视频格式不一致",
        "detail": "部分分镜视频的分辨率或编码不匹配",
        "suggestion": "系统将自动转码后重试",
        "auto_fix": True,
    },
    "CONCAT_FAILED": {
        "message": "视频拼接失败",
        "detail": "FFmpeg concat 报错",
        "suggestion": "请检查是否有损坏的分镜视频，可尝试重新生成问题镜头",
        "auto_fix": False,
    },
    "SUBTITLE_BURN_FAILED": {
        "message": "字幕烧录失败",
        "detail": "SRT 文件格式错误或字体缺失",
        "suggestion": "可关闭硬字幕，改用外挂 SRT",
        "auto_fix": False,
    },
    "AUDIO_MIX_FAILED": {
        "message": "音频混缩失败",
        "detail": "BGM 或配音文件格式不兼容",
        "suggestion": "可关闭 BGM 后重试",
        "auto_fix": False,
    },
    "DISK_FULL": {
        "message": "磁盘空间不足",
        "detail": "输出目录可用空间不足",
        "suggestion": "请清理磁盘空间后重试",
        "auto_fix": False,
    },
    "FFMPEG_NOT_FOUND": {
        "message": "FFmpeg 未安装",
        "detail": "系统找不到 ffmpeg 命令",
        "suggestion": "请确认服务器已安装 FFmpeg 并加入 PATH",
        "auto_fix": False,
    },
}

# ---------------------------------------------------------------------------
# 7-Stage Composition Pipeline (设计文档 §4.1, §7.5)
# ---------------------------------------------------------------------------

COMPOSE_STAGES: list[str] = [
    "concat",
    "transition",
    "subtitle",
    "voiceover",
    "bgm",
    "audio_mix",
    "render",
]


def classify_compose_error(exc: Exception) -> dict[str, Any]:
    """Classify a composition error into a known category."""
    msg = str(exc).lower()
    if "no space left" in msg or "disk full" in msg:
        return COMPOSE_ERRORS["DISK_FULL"]
    if "ffmpeg" in msg and ("not found" in msg or "no such file" in msg):
        return COMPOSE_ERRORS["FFMPEG_NOT_FOUND"]
    if "subtitle" in msg or "srt" in msg:
        return COMPOSE_ERRORS["SUBTITLE_BURN_FAILED"]
    if "audio" in msg or "amix" in msg or "bgm" in msg:
        return COMPOSE_ERRORS["AUDIO_MIX_FAILED"]
    if "concat" in msg or "format" in msg:
        return COMPOSE_ERRORS["CONCAT_FAILED"]
    return {
        "message": "未知合成错误",
        "detail": str(exc)[:500],
        "suggestion": "请检查日志获取更多信息",
        "auto_fix": False,
    }


# ---------------------------------------------------------------------------
# SRT Subtitle Generation (设计文档 §4.2)
# ---------------------------------------------------------------------------


def format_srt_time(seconds: float) -> str:
    """Format seconds into SRT timestamp: HH:MM:SS,mmm"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def generate_srt(shots_with_timing: list[dict[str, Any]]) -> str:
    """
    Generate SRT subtitle content from shot dialogue data.

    Each shot dict should have:
    - dialogue or dialogue_ref: the subtitle text
    - duration: shot duration in seconds
    """
    srt_entries: list[str] = []
    index = 1
    current_time = 0.0

    for shot in shots_with_timing:
        dialogue = shot.get("dialogue") or shot.get("dialogue_ref", "")
        duration = float(shot.get("duration", 5))

        if not dialogue or dialogue == "—":
            current_time += duration
            continue

        start = format_srt_time(current_time)
        end = format_srt_time(current_time + duration * 0.8)

        srt_entries.append(f"{index}\n{start} --> {end}\n{dialogue}\n")
        index += 1
        current_time += duration

    return "\n".join(srt_entries)


# ---------------------------------------------------------------------------
# FFmpeg Helper Functions (设计文档 §4.3)
# ---------------------------------------------------------------------------


def _check_ffmpeg() -> bool:
    """Check if ffmpeg is available."""
    try:
        subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True,
            check=True,
            timeout=10,
        )
        return True
    except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return False


def ffmpeg_concat(video_files: list[str | Path], output: str | Path) -> None:
    """Concatenate video files using ffmpeg concat demuxer.

    Uses filter_complex to handle videos with different resolutions/formats,
    scaling all inputs to a uniform size before concatenation.
    """
    if not _check_ffmpeg():
        raise RuntimeError("FFmpeg 未安装或不在 PATH 中")

    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)

    if len(video_files) == 1:
        # Single file — just re-encode to ensure consistent format
        cmd = [
            "ffmpeg", "-y",
            "-i", str(video_files[0]),
            "-c:v", "libx264", "-preset", "medium", "-crf", "18",
            "-r", "24", "-pix_fmt", "yuv420p",
            str(output),
        ]
        subprocess.run(cmd, capture_output=True, check=True, timeout=600)
        return

    # Build filter_complex to normalize all inputs to same resolution
    n = len(video_files)
    inputs: list[str] = []
    for vf in video_files:
        inputs.extend(["-i", str(vf)])

    # Scale all to 1080x1920 (portrait) or 1920x1080 (landscape) with padding
    # Use the first video's aspect to decide target
    filter_parts: list[str] = []
    for i in range(n):
        filter_parts.append(
            f"[{i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,"
            f"pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=24[v{i}]"
        )
        filter_parts.append(f"[{i}:a]aresample=44100,apad[a{i}]" if True else "")
    # Concat all
    video_labels = "".join(f"[v{i}]" for i in range(n))
    audio_labels = "".join(f"[a{i}]" for i in range(n))
    filter_parts.append(f"{video_labels}{audio_labels}concat=n={n}:v=1:a=1[outv][outa]")
    filter_str = ";".join(filter_parts)

    cmd = [
        "ffmpeg", "-y",
        *inputs,
        "-filter_complex", filter_str,
        "-map", "[outv]", "-map", "[outa]",
        "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-pix_fmt", "yuv420p",
        str(output),
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, check=True, timeout=1200)
    except subprocess.CalledProcessError as exc:
        # Fallback: try simple concat if filter_complex fails (e.g. no audio tracks)
        log.warning("filter_complex concat failed, falling back to simple concat: %s", exc.stderr[-500:] if exc.stderr else "")
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, encoding="utf-8") as f:
            for vf in video_files:
                f.write(f"file '{Path(vf).as_posix()}'\n")
            concat_file = f.name
        try:
            cmd_fallback = [
                "ffmpeg", "-y",
                "-f", "concat", "-safe", "0",
                "-i", concat_file,
                "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                "-r", "24", "-pix_fmt", "yuv420p",
                str(output),
            ]
            subprocess.run(cmd_fallback, capture_output=True, check=True, timeout=600)
        finally:
            os.unlink(concat_file)


def ffmpeg_add_transitions(
    input_path: str | Path,
    output: str | Path,
    style: str = "dissolve",
) -> None:
    """Add transition effects between clips."""
    input_path = str(input_path)
    output = str(output)

    if style == "none" or not Path(input_path).exists():
        shutil.copy(input_path, output)
        return

    # For now, copy through — advanced transitions require complex filter chains
    # which depend on knowing clip boundaries. This is a placeholder for future
    # implementation with xfade filter.
    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "18",
        str(output),
    ]
    subprocess.run(cmd, capture_output=True, check=True, timeout=600)


def ffmpeg_burn_subtitles(
    input_path: str | Path,
    output: str | Path,
    srt_path: str | Path,
) -> None:
    """Burn SRT subtitles into video. Copies SRT to safe temp path to avoid escaping issues."""
    # Copy SRT to a safe temp path (no special chars) to avoid FFmpeg filter escaping issues
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".srt", delete=False, encoding="utf-8"
    ) as tmp:
        tmp.write(Path(srt_path).read_text(encoding="utf-8"))
        safe_srt = tmp.name

    try:
        srt_posix = Path(safe_srt).as_posix()
        # Escape FFmpeg filter special chars
        srt_escaped = srt_posix.replace("\\", "/").replace(":", "\\:").replace("'", "\\'")
        cmd = [
            "ffmpeg", "-y",
            "-i", str(input_path),
            "-vf", f"subtitles='{srt_escaped}':force_style='FontSize=24,PrimaryColour=&HFFFFFF&'",
            "-c:a", "copy",
            str(output),
        ]
        subprocess.run(cmd, capture_output=True, check=True, timeout=600)
    finally:
        os.unlink(safe_srt)


def ffmpeg_add_voiceover(
    input_path: str | Path,
    output: str | Path,
    voiceover_path: str | Path,
) -> None:
    """Mix voiceover audio into video. Handles videos without audio track."""
    if not Path(voiceover_path).exists():
        shutil.copy(str(input_path), str(output))
        return

    # Use voiceover as sole audio if input has no audio track
    cmd = [
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-i", str(voiceover_path),
        "-filter_complex",
        "[1:a]apad[vo];[0:a]apad[orig];[orig][vo]amix=inputs=2:duration=first:dropout_transition=2[a]",
        "-map", "0:v", "-map", "[a]",
        "-c:v", "copy",
        str(output),
    ]
    try:
        subprocess.run(cmd, capture_output=True, check=True, timeout=600)
    except subprocess.CalledProcessError:
        # Fallback: input has no audio track, use voiceover directly
        cmd_fallback = [
            "ffmpeg", "-y",
            "-i", str(input_path),
            "-i", str(voiceover_path),
            "-map", "0:v", "-map", "1:a",
            "-c:v", "copy", "-shortest",
            str(output),
        ]
        subprocess.run(cmd_fallback, capture_output=True, check=True, timeout=600)


def ffmpeg_add_bgm(
    input_path: str | Path,
    output: str | Path,
    bgm_path: str | Path,
    bgm_volume: float = 0.3,
) -> None:
    """Add background music to video with volume control. Handles no-audio input."""
    if not Path(bgm_path).exists():
        shutil.copy(str(input_path), str(output))
        return

    cmd = [
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-i", str(bgm_path),
        "-filter_complex",
        f"[1:a]volume={bgm_volume}[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[a]",
        "-map", "0:v", "-map", "[a]",
        "-c:v", "copy",
        str(output),
    ]
    try:
        subprocess.run(cmd, capture_output=True, check=True, timeout=600)
    except subprocess.CalledProcessError:
        # Fallback: input has no audio, use BGM as sole audio
        cmd_fallback = [
            "ffmpeg", "-y",
            "-i", str(input_path),
            "-i", str(bgm_path),
            "-filter_complex", f"[1:a]volume={bgm_volume}[bgm]",
            "-map", "0:v", "-map", "[bgm]",
            "-c:v", "copy", "-shortest",
            str(output),
        ]
        subprocess.run(cmd_fallback, capture_output=True, check=True, timeout=600)


def ffmpeg_audio_mix(input_path: str | Path, output: str | Path) -> None:
    """Final audio normalization pass."""
    cmd = [
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
        "-c:v", "copy",
        str(output),
    ]
    try:
        subprocess.run(cmd, capture_output=True, check=True, timeout=600)
    except subprocess.CalledProcessError:
        # If audio normalization fails, just copy
        shutil.copy(str(input_path), str(output))


def ffmpeg_final_render(
    input_path: str | Path,
    output: str | Path,
    quality: str = "1080p",
) -> None:
    """Final render pass with quality settings."""
    scale_map = {
        "720p": "1280:720",
        "1080p": "1920:1080",
        "4k": "3840:2160",
    }
    scale = scale_map.get(quality, "1920:1080")

    cmd = [
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-vf", f"scale={scale}:force_original_aspect_ratio=decrease,pad={scale}:(ow-iw)/2:(oh-ih)/2",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "18",
        "-r", "24",
        "-c:a", "aac",
        "-b:a", "192k",
        str(output),
    ]
    subprocess.run(cmd, capture_output=True, check=True, timeout=600)


# ---------------------------------------------------------------------------
# VideoComposer Class
# ---------------------------------------------------------------------------


class VideoComposer:
    """Compose storyboard panels into a final video."""

    def __init__(self, config: dict[str, Any]):
        self.config = config
        self.video_tasks_dir = Path("data/video_tasks")
        self.video_tasks_dir.mkdir(parents=True, exist_ok=True)
        self.videos_dir = Path("storage/videos")
        self.videos_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def generate_id(prefix: str) -> str:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
        return f"{prefix}_{timestamp}_{suffix}"

    @staticmethod
    def now_iso() -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    def _save_task(self, task_id: str, data: dict[str, Any]) -> None:
        _validate_id(task_id)
        lock = _get_task_lock(task_id)
        with lock:
            get_storage().upsert_document(
                "video_task",
                task_id,
                data,
                project_id=data.get("project_id"),
                status=data.get("status"),
                title=data.get("video_task_id") or data.get("task_id") or task_id,
                created_at=data.get("created_at"),
                updated_at=data.get("updated_at"),
            )

    def _load_task(self, task_id: str) -> dict[str, Any] | None:
        _validate_id(task_id)
        lock = _get_task_lock(task_id)
        with lock:
            return get_storage().get_document("video_task", task_id)

    # ------------------------------------------------------------------
    # Video Prompt Construction (设计文档 §3.2)
    # ------------------------------------------------------------------

    @staticmethod
    def build_video_prompt(
        shot: dict[str, Any],
        style_config: dict[str, Any] | None = None,
    ) -> str:
        """
        Build video generation prompt combining:
        - Visual description
        - Camera movement
        - Character action
        - Style keywords
        """
        parts: list[str] = []

        # Visual description
        desc = shot.get("raw_description") or shot.get("image_prompt") or shot.get("prompt", "")
        if desc:
            parts.append(desc)

        # Camera movement
        camera = shot.get("camera_movement", "static")
        parts.append(f"camera: {camera}")

        # Character action
        action = shot.get("dialogue_ref") or shot.get("action", "")
        if action:
            parts.append(f"character action: {action}")

        # Style keywords
        if style_config:
            compiled = style_config.get("compiled_style_prompt", "")
            if compiled:
                keywords = [kw.strip() for kw in compiled.split(",") if kw.strip()][:5]
                if keywords:
                    parts.append(", ".join(keywords))

        return "\n".join(filter(None, parts))

    @staticmethod
    def map_camera_movement(movement: str) -> str:
        """Map camera movement description to API preset value."""
        return CAMERA_MOVEMENT_MAP.get(movement, "auto")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def compose_video(
        self,
        project_id: str,
        storyboard_id: str,
        script_id: str | None = None,
        episode_index: int = 0,
    ) -> str:
        """
        Start video composition asynchronously.
        Returns task_id immediately; composition runs in background.
        """
        task_id = self.generate_id("video")

        data = {
            "task_id": task_id,
            "video_task_id": task_id,
            "project_id": project_id,
            "storyboard_id": storyboard_id,
            "script_id": script_id,
            "episode_index": episode_index,
            "status": "pending",
            "progress": 0,
            "output_url": None,
            "error_message": None,
            "clips": [],
            "created_at": self.now_iso(),
            "updated_at": self.now_iso(),
        }
        self._save_task(task_id, data)

        thread = threading.Thread(
            target=self._compose_worker,
            args=(task_id, project_id, storyboard_id, script_id, episode_index),
            name=f"video_{task_id}",
            daemon=False,
        )
        thread.start()

        return task_id

    def get_task(self, task_id: str) -> dict[str, Any] | None:
        """Return video task data dict or None."""
        return self._load_task(task_id)

    def get_video_task(self, task_id: str) -> dict[str, Any] | None:
        """Alias for get_task."""
        return self._load_task(task_id)

    def generate_shot_video(
        self,
        shot: dict[str, Any],
        storyboard_image: str,
        style_config: dict[str, Any] | None = None,
    ) -> dict[str, str]:
        """
        Generate a video clip for a single shot using Seedance 2.0.

        Returns {"taskId": remote_task_id}.
        """
        video_prompt = self.build_video_prompt(shot, style_config)

        video_api_url = (
            self.config.get("ai_video_base")
            or self.config.get("video_api_url")
            or self.config.get("base_url", "")
        )
        api_key = self.config.get("api_key", "")
        video_model = self.config.get("ai_video_model", "doubao-seedance-2.0")

        mode = "first_frame" if storyboard_image else "text"
        aspect_ratio = "9:16"
        if style_config:
            aspect_ratio = style_config.get("aspect_ratio", "9:16")

        duration = int(shot.get("duration", 5))
        camera_preset = self.map_camera_movement(shot.get("camera_movement", "static"))

        # Build content array
        content: list[dict[str, Any]] = [
            {"type": "text", "text": video_prompt},
        ]
        if storyboard_image and mode == "first_frame":
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": storyboard_image},
                    "role": "reference_image",
                }
            )

        payload = json.dumps(
            {
                "model": video_model,
                "content": content,
                "resolution": "720p",
                "ratio": aspect_ratio,
                "duration": duration,
                "camera_preset": camera_preset,
                "motion_speed": "steady",
                "generate_audio": False,
            }
        ).encode("utf-8")

        # Submit to video API
        submit_url = video_api_url
        if not submit_url:
            raise RuntimeError("Video API URL not configured")

        req = urllib.request.Request(
            submit_url,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            method="POST",
        )

        opener = _make_opener(submit_url)
        with opener.open(req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))

        remote_task_id = result.get("task_id") or result.get("id")
        if not remote_task_id:
            raise RuntimeError("Video API returned no task_id")

        return {"taskId": remote_task_id}

    def generate_all_videos(
        self,
        shots: list[dict[str, Any]],
        style_config: dict[str, Any] | None = None,
        on_progress: Any = None,
    ) -> list[dict[str, Any]]:
        """
        Batch generate videos for all shots (设计文档 §3.3).

        Phase 1: Submit all tasks with 2s delay between submissions.
        Phase 2: Poll all tasks until completion.

        Returns list of shot dicts with video_task_id and video_url populated.
        """
        video_tasks: list[dict[str, Any]] = []
        query_base = self.config.get("base_url", "")
        api_key = self.config.get("api_key", "")

        # Phase 1: Submit
        for shot in shots:
            if shot.get("status") == "done" and shot.get("video_url"):
                continue  # Skip completed shots

            storyboard_image = shot.get("storyboard_image") or shot.get("image_url", "")
            try:
                result = self.generate_shot_video(shot, storyboard_image, style_config)
                shot["video_task_id"] = result["taskId"]
                shot["status"] = "filming"
                video_tasks.append({"shot": shot, "taskId": result["taskId"]})
            except Exception as exc:
                log.error(f"Failed to submit shot video: {exc}")
                shot["status"] = "failed"
                shot["error"] = str(exc)

            time.sleep(2)  # Rate limit avoidance

        # Phase 2: Poll
        self._poll_video_tasks(video_tasks, query_base, api_key)

        return shots

    def _poll_video_tasks(
        self,
        tasks: list[dict[str, Any]],
        query_base: str,
        api_key: str,
        timeout: int = 600,
    ) -> None:
        """Poll all video tasks until completion (设计文档 §3.3)."""
        pending = set(t["taskId"] for t in tasks)
        deadline = time.time() + timeout

        while pending and time.time() < deadline:
            for task in tasks:
                task_id = task["taskId"]
                if task_id not in pending:
                    continue

                try:
                    status_url = f"{query_base.rstrip('/')}/api/tasks/{task_id}"
                    req = urllib.request.Request(
                        status_url,
                        headers={"Authorization": f"Bearer {api_key}"},
                        method="GET",
                    )
                    opener = _make_opener(status_url)
                    with opener.open(req, timeout=30) as resp:
                        result = json.loads(resp.read().decode("utf-8"))

                    status = result.get("status", "")
                    if status in ("SUCCESS", "succeeded"):
                        pending.discard(task_id)
                        outputs = result.get("output", [])
                        if outputs:
                            task["shot"]["video_url"] = outputs[0].get("url", "")
                        task["shot"]["status"] = "done"
                    elif status in ("FAILED", "CANCELLED", "failed"):
                        pending.discard(task_id)
                        task["shot"]["status"] = "failed"
                        task["shot"]["error"] = result.get("error", "Unknown error")
                except Exception as exc:
                    log.warning(f"Poll error for task {task_id}: {exc}")

            if pending:
                time.sleep(5)

    # ------------------------------------------------------------------
    # 7-Stage Composition Pipeline (设计文档 §7.5)
    # ------------------------------------------------------------------

    def compose_video_staged(
        self,
        project_id: str,
        shot_videos: list[str | Path],
        config: dict[str, Any],
        resume_from: str | None = None,
        progress_callback: Any | None = None,
    ) -> dict[str, Any]:
        """
        7-stage composition pipeline with resume capability.

        Stages: concat → transition → subtitle → voiceover → bgm → audio_mix → render

        Args:
            project_id: Project ID for output directory
            shot_videos: List of local video file paths
            config: Composition config dict
            resume_from: Stage name to resume from (skip earlier stages)
            progress_callback: Optional callable(progress_dict) invoked after each stage

        Returns:
            Dict with stages_completed, stages_failed, final_output
        """
        project_dir = Path("storage/projects") / project_id
        output_dir = project_dir / "output"
        stages_dir = output_dir / "stages"
        stages_dir.mkdir(parents=True, exist_ok=True)

        current_input: str | None = None

        stages = list(COMPOSE_STAGES)
        if resume_from and resume_from in stages:
            resume_idx = COMPOSE_STAGES.index(resume_from)
            stages = stages[resume_idx:]
            # Find the output of the previous stage as starting input
            if resume_idx > 0:
                prev_stage = COMPOSE_STAGES[resume_idx - 1]
                prev_output = str(stages_dir / f"stage_{prev_stage}_output.mp4")
                if Path(prev_output).exists():
                    current_input = prev_output
                else:
                    log.warning("Previous stage output not found: %s", prev_output)

        if current_input is None and resume_from is None:
            pass  # Normal start, concat will create first output
        elif current_input is None and resume_from:
            log.error("Cannot resume: no previous stage output found")
            return {
                "stages_completed": [],
                "stages_failed": {
                    "stage": resume_from,
                    "error": {
                        "message": "无法恢复: 上一阶段的产物文件不存在",
                        "suggestion": "请尝试从头开始合成",
                        "auto_fix": False,
                    },
                },
            }

        results: dict[str, Any] = {
            "stages_completed": [],
            "stages_failed": None,
            "compose_progress": {
                "current_stage": None,
                "stages_completed": [],
                "stages_total": len(COMPOSE_STAGES),
                "percent": 0,
            },
        }

        for i, stage in enumerate(stages):
            results["compose_progress"]["current_stage"] = stage
            results["compose_progress"]["percent"] = int(
                (i / len(COMPOSE_STAGES)) * 100
            )

            try:
                output = str(stages_dir / f"stage_{stage}_output.mp4")

                if stage == "concat":
                    ffmpeg_concat(shot_videos, output)
                elif stage == "transition":
                    ffmpeg_add_transitions(
                        current_input or output,
                        output,
                        config.get("transition_style", "dissolve"),
                    )
                elif stage == "subtitle" and config.get("include_subtitles"):
                    if config.get("subtitle_mode") == "burn":
                        srt_path = config.get("srt_path", "")
                        if srt_path and Path(srt_path).exists():
                            ffmpeg_burn_subtitles(current_input or output, output, srt_path)
                        else:
                            shutil.copy(current_input or output, output)
                    else:
                        shutil.copy(current_input or output, output)
                elif stage == "voiceover" and config.get("include_voiceover"):
                    voiceover_path = config.get("voiceover_path", "")
                    ffmpeg_add_voiceover(current_input or output, output, voiceover_path)
                elif stage == "bgm" and config.get("include_bgm"):
                    bgm_path = config.get("bgm_path", "")
                    ffmpeg_add_bgm(
                        current_input or output,
                        output,
                        bgm_path,
                        config.get("bgm_volume", 0.3),
                    )
                elif stage == "audio_mix":
                    if current_input:
                        ffmpeg_audio_mix(current_input, output)
                    else:
                        # No input available, skip this stage
                        log.warning("audio_mix: no input available, skipping")
                        continue
                elif stage == "render":
                    if current_input:
                        ffmpeg_final_render(
                            current_input,
                            output,
                            config.get("output_quality", "1080p"),
                        )
                    else:
                        log.warning("render: no input available, skipping")
                        continue
                else:
                    # Stage skipped (disabled in config) — pass through
                    if current_input:
                        shutil.copy(current_input, output)
                    else:
                        # No input and stage disabled, skip entirely
                        continue

                current_input = output
                results["stages_completed"].append(stage)
                results["compose_progress"]["stages_completed"].append(stage)
                results["compose_progress"]["percent"] = int(
                    ((i + 1) / len(COMPOSE_STAGES)) * 100
                )

                # Notify caller of progress (for real-time UI updates)
                if progress_callback:
                    try:
                        progress_callback(results["compose_progress"])
                    except Exception:
                        pass  # Don't let callback errors break the pipeline

            except Exception as exc:
                log.error(f"Composition stage '{stage}' failed: {exc}")
                results["stages_failed"] = {
                    "stage": stage,
                    "error": classify_compose_error(exc),
                }
                break

        if not results["stages_failed"] and current_input:
            final_path = str(output_dir / "final_output.mp4")
            shutil.copy(current_input, final_path)
            results["final_output"] = final_path
            results["compose_progress"]["percent"] = 100

        return results

    # ------------------------------------------------------------------
    # Legacy compose_video (backward compatible)
    # ------------------------------------------------------------------

    def _compose_worker(
        self,
        task_id: str,
        project_id: str,
        storyboard_id: str,
        script_id: str | None,
        episode_index: int,
    ) -> None:
        """Main composition pipeline."""
        try:
            self._update_task(task_id, {"status": "processing", "progress": 0})

            # Step 1: Load storyboard
            storyboard = get_storage().get_document("storyboard", storyboard_id)
            if storyboard is None:
                raise FileNotFoundError(f"Storyboard {storyboard_id} not found")
            panels = [
                p
                for p in storyboard.get("panels", [])
                if p.get("status") == "done" and p.get("image_url")
            ]

            if not panels:
                raise ValueError("No completed panels with images found in storyboard")

            self._update_task(task_id, {"progress": 10})

            # Step 2: Convert panels to video clips
            clips: list[dict[str, Any]] = []
            total_panels = len(panels)

            for i, panel in enumerate(panels):
                clip = self._panel_to_clip(task_id, panel, i)
                clips.append(clip)
                progress = 10 + int(70 * (i + 1) / total_panels)
                self._update_task(task_id, {"progress": progress, "clips": clips})

            self._update_task(task_id, {"progress": 80})

            # Step 3: Merge clips with ffmpeg (if available)
            output_path = self._merge_clips(task_id, clips, project_id)

            # Step 4: Register output
            output_url = f"/media/videos/{output_path.name}" if output_path else None

            self._update_task(
                task_id,
                {
                    "status": "done",
                    "progress": 100,
                    "output_url": output_url,
                    "clips": clips,
                },
            )

        except Exception as exc:
            self._update_task(
                task_id,
                {"status": "error", "error_message": str(exc)},
            )

    def _panel_to_clip(
        self,
        task_id: str,
        panel: dict[str, Any],
        index: int,
    ) -> dict[str, Any]:
        """Convert a storyboard panel to a video clip."""
        clip: dict[str, Any] = {
            "panel_id": panel["panel_id"],
            "index": index,
            "image_url": panel.get("image_url", ""),
            "dialogue": panel.get("dialogue_ref", ""),
            "shot_type": panel.get("shot_type", "medium_shot"),
            "clip_url": None,
            "duration": float(panel.get("duration", 3.0)),
            "status": "pending",
        }

        image_url = panel.get("image_url", "")
        video_api_url = (
            self.config.get("ai_video_base")
            or self.config.get("video_api_url")
            or self.config.get("base_url", "")
        )
        api_key = self.config.get("api_key", "")

        if not image_url or image_url.startswith("/media/placeholder") or not video_api_url:
            clip["status"] = "static"
            return clip

        # Try Seedance image-to-video (doubao-seedance-2.0)
        try:
            video_url = self._image_to_video(
                video_api_url, api_key, image_url, panel
            )
            clip["clip_url"] = video_url
            clip["status"] = "done"
        except Exception as exc:
            clip["status"] = "static"
            clip["error"] = str(exc)

        return clip

    def _image_to_video(
        self,
        api_url: str,
        api_key: str,
        image_url: str,
        panel: dict[str, Any],
    ) -> str:
        """
        Submit image-to-video task via Seedance 2.0 API and poll until done.
        Returns video URL.
        """
        video_model = self.config.get("ai_video_model", "doubao-seedance-2.0")
        prompt = self.build_video_prompt(panel)
        camera_preset = self.map_camera_movement(
            panel.get("camera_movement", "static")
        )

        payload = json.dumps(
            {
                "model": video_model,
                "content": [
                    {"type": "image_url", "image_url": {"url": image_url}, "role": "reference_image"},
                    {"type": "text", "text": prompt},
                ],
                "resolution": "720p",
                "duration": int(panel.get("duration", 5)),
                "camera_preset": camera_preset,
                "generate_audio": False,
            }
        ).encode("utf-8")

        submit_url = api_url.rstrip("/")
        if "/api/tasks" not in submit_url:
            submit_url = submit_url + "/api/tasks"

        req = urllib.request.Request(
            submit_url,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            method="POST",
        )

        opener = _make_opener(submit_url)
        with opener.open(req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))

        remote_task_id = result.get("task_id") or result.get("id")
        if not remote_task_id:
            raise RuntimeError("Video API returned no task_id")

        # Poll
        status_url = api_url.rstrip("/")
        if "/api/tasks" not in status_url:
            status_url = status_url + f"/api/tasks/{remote_task_id}"
        else:
            status_url = status_url + f"/{remote_task_id}"

        deadline = time.time() + 600  # 10 min timeout per clip

        while time.time() < deadline:
            req = urllib.request.Request(
                status_url,
                headers={"Authorization": f"Bearer {api_key}"},
                method="GET",
            )
            opener = _make_opener(status_url)
            with opener.open(req, timeout=30) as resp:
                result = json.loads(resp.read().decode("utf-8"))

            status = result.get("status", "")
            if status in ("SUCCESS", "succeeded"):
                outputs = result.get("output", [])
                if outputs:
                    return outputs[0].get("url", "")
                raise RuntimeError("Video task succeeded but has no output URL")
            elif status in ("FAILED", "CANCELLED", "failed"):
                raise RuntimeError(
                    f"Video task {status.lower()}: {result.get('error', '')}"
                )

            time.sleep(10)

        raise TimeoutError(f"Video task {remote_task_id} timed out")

    def _merge_clips(
        self,
        task_id: str,
        clips: list[dict[str, Any]],
        project_id: str,
    ) -> Path | None:
        """Merge video clips into a single MP4 using ffmpeg."""
        if not _check_ffmpeg():
            output_name = f"{project_id}_{task_id[-6:]}.mp4"
            output_path = self.videos_dir / output_name
            output_path.write_bytes(b"")
            return output_path

        output_name = f"{project_id}_{task_id[-6:]}.mp4"
        output_path = self.videos_dir / output_name

        clip_urls: list[tuple[str, str]] = []
        for clip in clips:
            if clip.get("clip_url"):
                clip_urls.append(("video", clip["clip_url"]))
            elif clip.get("image_url") and not clip["image_url"].startswith(
                "/media/placeholder"
            ):
                clip_urls.append(("image", clip["image_url"]))

        if not clip_urls:
            return None

        temp_dir = self.video_tasks_dir / f"tmp_{task_id}"
        temp_dir.mkdir(exist_ok=True)

        local_files: list[tuple[str, Path]] = []
        for i, (media_type, url) in enumerate(clip_urls):
            try:
                ext = ".mp4" if media_type == "video" else ".jpg"
                local_path = temp_dir / f"clip_{i:03d}{ext}"
                urllib.request.urlretrieve(url, local_path)
                local_files.append((media_type, local_path))
            except Exception:
                continue

        if not local_files:
            return None

        concat_file = temp_dir / "concat.txt"
        concat_lines: list[str] = []
        for media_type, lp in local_files:
            if media_type == "video":
                concat_lines.append(f"file '{lp.as_posix()}'")
            else:
                img_clip = temp_dir / f"{lp.stem}_clip.mp4"
                subprocess.run(
                    [
                        "ffmpeg", "-y",
                        "-loop", "1", "-i", str(lp),
                        "-t", "3",
                        "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720",
                        "-pix_fmt", "yuv420p", "-r", "24",
                        str(img_clip),
                    ],
                    capture_output=True,
                    timeout=60,
                )
                if img_clip.exists():
                    concat_lines.append(f"file '{img_clip.as_posix()}'")

        if not concat_lines:
            return None

        concat_file.write_text("\n".join(concat_lines), encoding="utf-8")

        subprocess.run(
            [
                "ffmpeg", "-y",
                "-f", "concat", "-safe", "0",
                "-i", str(concat_file),
                "-c:v", "libx264", "-preset", "fast",
                "-pix_fmt", "yuv420p",
                str(output_path),
            ],
            capture_output=True,
            timeout=300,
            check=True,
        )

        return output_path if output_path.exists() else None

    # ------------------------------------------------------------------
    # State helpers
    # ------------------------------------------------------------------

    def _update_task(self, task_id: str, updates: dict[str, Any]) -> None:
        _validate_id(task_id)
        lock = _get_task_lock(task_id)
        with lock:
            data = self._load_task(task_id)
            if data is None:
                return
            data.update(updates)
            data["updated_at"] = self.now_iso()
            self._save_task(task_id, data)
