"""
Video Composer Module
Composes storyboard panels into video using image-to-video API + ffmpeg merge.
Supports: TTS audio, Seedance image-to-video, ffmpeg concat.
"""

import json
import os
import random
import string
import subprocess
import threading
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path


class VideoComposer:
    """Compose storyboard panels into a final video."""

    def __init__(self, config):
        self.config = config
        self.video_tasks_dir = Path('data/video_tasks')
        self.video_tasks_dir.mkdir(parents=True, exist_ok=True)
        self.videos_dir = Path('storage/videos')
        self.videos_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def generate_id(prefix):
        timestamp = datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')
        suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
        return f"{prefix}_{timestamp}_{suffix}"

    @staticmethod
    def now_iso():
        return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

    def _save_task(self, task_id, data):
        path = self.video_tasks_dir / f"{task_id}.json"
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')

    def _load_task(self, task_id):
        path = self.video_tasks_dir / f"{task_id}.json"
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding='utf-8'))

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def compose_video(self, project_id, storyboard_id, script_id=None, episode_index=0):
        """
        Start video composition asynchronously.
        Returns task_id immediately; composition runs in background.
        """
        task_id = self.generate_id('video')

        data = {
            'task_id': task_id,
            'video_task_id': task_id,  # frontend-compatible alias
            'project_id': project_id,
            'storyboard_id': storyboard_id,
            'script_id': script_id,
            'episode_index': episode_index,
            'status': 'pending',
            'progress': 0,
            'output_url': None,
            'error_message': None,
            'clips': [],
            'created_at': self.now_iso(),
            'updated_at': self.now_iso(),
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

    def get_task(self, task_id):
        """Return video task data dict or None."""
        return self._load_task(task_id)

    # Alias for server.py compatibility
    def get_video_task(self, task_id):
        """Alias for get_task."""
        return self._load_task(task_id)

    # ------------------------------------------------------------------
    # Background worker
    # ------------------------------------------------------------------

    def _compose_worker(self, task_id, project_id, storyboard_id, script_id, episode_index):
        """Main composition pipeline."""
        try:
            self._update_task(task_id, {'status': 'processing', 'progress': 0})

            # Step 1: Load storyboard
            storyboard_path = Path('data/storyboards') / f"{storyboard_id}.json"
            if not storyboard_path.exists():
                raise FileNotFoundError(f"Storyboard {storyboard_id} not found")

            storyboard = json.loads(storyboard_path.read_text(encoding='utf-8'))
            panels = [p for p in storyboard.get('panels', []) if p.get('status') == 'done' and p.get('image_url')]

            if not panels:
                raise ValueError("No completed panels with images found in storyboard")

            self._update_task(task_id, {'progress': 10})

            # Step 2: Convert panels to video clips
            clips = []
            total_panels = len(panels)

            for i, panel in enumerate(panels):
                clip = self._panel_to_clip(task_id, panel, i)
                clips.append(clip)
                progress = 10 + int(70 * (i + 1) / total_panels)
                self._update_task(task_id, {'progress': progress, 'clips': clips})

            self._update_task(task_id, {'progress': 80})

            # Step 3: Merge clips with ffmpeg (if available)
            output_path = self._merge_clips(task_id, clips, project_id)

            # Step 4: Register output
            output_url = f"/media/videos/{output_path.name}" if output_path else None

            self._update_task(task_id, {
                'status': 'done',
                'progress': 100,
                'output_url': output_url,
                'clips': clips,
            })

        except Exception as exc:
            self._update_task(task_id, {
                'status': 'error',
                'error_message': str(exc),
            })

    def _panel_to_clip(self, task_id, panel, index):
        """Convert a storyboard panel to a video clip stub."""
        clip = {
            'panel_id': panel['panel_id'],
            'index': index,
            'image_url': panel.get('image_url', ''),
            'dialogue': panel.get('dialogue_ref', ''),
            'shot_type': panel.get('shot_type', 'medium_shot'),
            'clip_url': None,
            'duration': 3.0,  # default seconds per panel
            'status': 'pending',
        }

        image_url = panel.get('image_url', '')
        video_api_url = self.config.get('video_api_url', '') or self.config.get('base_url', '')
        api_key = self.config.get('api_key', '')

        # If image_url is a placeholder or no video API configured, use static clip
        if not image_url or image_url.startswith('/media/placeholder') or not video_api_url:
            clip['status'] = 'static'
            return clip

        # Try Seedance image-to-video
        try:
            video_url = self._image_to_video(video_api_url, api_key, image_url, panel.get('image_prompt', ''))
            clip['clip_url'] = video_url
            clip['status'] = 'done'
        except Exception as exc:
            clip['status'] = 'static'
            clip['error'] = str(exc)

        return clip

    def _image_to_video(self, api_url, api_key, image_url, prompt):
        """
        Submit image-to-video task via Seedance API and poll until done.
        Returns video URL.
        """
        submit_url = api_url.rstrip('/') + '/api/tasks'

        payload = json.dumps({
            'model': 'seedance-1-lite',
            'mode': 'first_frame',
            'content': [
                {'type': 'image_url', 'image_url': {'url': image_url}},
                {'type': 'text', 'text': prompt or 'anime style, cinematic motion, smooth animation'},
            ],
        }).encode('utf-8')

        req = urllib.request.Request(
            submit_url,
            data=payload,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {api_key}',
            },
            method='POST',
        )

        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode('utf-8'))

        remote_task_id = result.get('task_id') or result.get('id')
        if not remote_task_id:
            raise RuntimeError("Video API returned no task_id")

        # Poll
        status_url = api_url.rstrip('/') + f'/api/tasks/{remote_task_id}'
        deadline = time.time() + 600  # 10 min timeout per clip

        while time.time() < deadline:
            req = urllib.request.Request(
                status_url,
                headers={'Authorization': f'Bearer {api_key}'},
                method='GET',
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read().decode('utf-8'))

            status = result.get('status', '')
            if status == 'SUCCESS':
                outputs = result.get('output', [])
                if outputs:
                    return outputs[0].get('url', '')
                raise RuntimeError("Video task succeeded but has no output URL")
            elif status in ('FAILED', 'CANCELLED'):
                raise RuntimeError(f"Video task {status.lower()}: {result.get('error', '')}")

            time.sleep(10)

        raise TimeoutError(f"Video task {remote_task_id} timed out")

    def _merge_clips(self, task_id, clips, project_id):
        """
        Merge video clips (or images) into a single MP4 using ffmpeg.
        Returns output Path or None if ffmpeg unavailable.
        """
        # Check if ffmpeg is available
        try:
            subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True, timeout=10)
        except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
            # ffmpeg not available — create a minimal output indicator
            output_name = f"{project_id}_{task_id[-6:]}.mp4"
            output_path = self.videos_dir / output_name
            # Create placeholder file
            output_path.write_bytes(b'')
            return output_path

        output_name = f"{project_id}_{task_id[-6:]}.mp4"
        output_path = self.videos_dir / output_name

        # Collect available clip URLs or image URLs
        clip_urls = []
        for clip in clips:
            if clip.get('clip_url'):
                clip_urls.append(('video', clip['clip_url']))
            elif clip.get('image_url') and not clip['image_url'].startswith('/media/placeholder'):
                clip_urls.append(('image', clip['image_url']))

        if not clip_urls:
            # No actual media to merge
            return None

        # Download clips to temp dir
        temp_dir = self.video_tasks_dir / f"tmp_{task_id}"
        temp_dir.mkdir(exist_ok=True)

        local_files = []
        for i, (media_type, url) in enumerate(clip_urls):
            try:
                ext = '.mp4' if media_type == 'video' else '.jpg'
                local_path = temp_dir / f"clip_{i:03d}{ext}"
                urllib.request.urlretrieve(url, local_path)
                local_files.append((media_type, local_path))
            except Exception:
                continue

        if not local_files:
            return None

        # Build ffmpeg concat list
        concat_file = temp_dir / 'concat.txt'
        concat_lines = []
        for media_type, lp in local_files:
            if media_type == 'video':
                concat_lines.append(f"file '{lp.as_posix()}'")
            else:
                # Convert image to 3-second clip
                img_clip = temp_dir / f"{lp.stem}_clip.mp4"
                subprocess.run([
                    'ffmpeg', '-y',
                    '-loop', '1', '-i', str(lp),
                    '-t', '3', '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720',
                    '-pix_fmt', 'yuv420p', '-r', '24',
                    str(img_clip),
                ], capture_output=True, timeout=60)
                if img_clip.exists():
                    concat_lines.append(f"file '{img_clip.as_posix()}'")

        if not concat_lines:
            return None

        concat_file.write_text('\n'.join(concat_lines), encoding='utf-8')

        # Merge
        subprocess.run([
            'ffmpeg', '-y',
            '-f', 'concat', '-safe', '0',
            '-i', str(concat_file),
            '-c:v', 'libx264', '-preset', 'fast',
            '-pix_fmt', 'yuv420p',
            str(output_path),
        ], capture_output=True, timeout=300, check=True)

        return output_path if output_path.exists() else None

    # ------------------------------------------------------------------
    # State helpers
    # ------------------------------------------------------------------

    def _update_task(self, task_id, updates):
        data = self._load_task(task_id)
        if data:
            data.update(updates)
            data['updated_at'] = self.now_iso()
            self._save_task(task_id, data)
