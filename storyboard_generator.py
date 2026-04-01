"""
Storyboard Generator Module
Generates storyboard panels from script scenes using LLM + image generation API.

Phase A of Step 5: 分镜图生成
- LLM generates panel descriptions from script scenes
- Image API (Nano Banana 2) generates storyboard images
- Supports style_config for consistent visual style
- Concurrent generation with configurable parallelism
"""
from __future__ import annotations

import json
import logging
import os
import random
import re as _re
import string
import threading
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from mysql_storage import get_storage

log = logging.getLogger("storyboard")

# ---------------------------------------------------------------------------
# Opener helper (Clash TUN DIRECT rule handles zlhub routing natively)
# ---------------------------------------------------------------------------


def _make_opener(target_url: str) -> urllib.request.OpenerDirector:
    """Return a plain urllib opener (no explicit proxy needed)."""
    return urllib.request.build_opener()

# Per-storyboard file I/O lock to prevent concurrent read-modify-write races
_storyboard_locks: dict[str, threading.RLock] = {}
_locks_lock = threading.Lock()


def _get_lock(storyboard_id: str) -> threading.RLock:
    """Get or create a per-storyboard lock for thread-safe file I/O."""
    with _locks_lock:
        if storyboard_id not in _storyboard_locks:
            _storyboard_locks[storyboard_id] = threading.RLock()
        return _storyboard_locks[storyboard_id]


def _validate_id(value: str) -> str:
    """Validate that an ID contains only safe characters (prevent path traversal)."""
    if not _re.match(r"^[a-zA-Z0-9_-]+$", value):
        raise ValueError(f"Invalid ID (unsafe characters): {value!r}")
    return value

# ---------------------------------------------------------------------------
# 景别映射（Shot Size Map）
# ---------------------------------------------------------------------------

SHOT_SIZE_MAP: dict[str, str] = {
    "ELS": "extreme long shot, vast landscape",
    "LS": "long shot, full environment visible",
    "FS": "full shot, character full body in frame",
    "MS": "medium shot, character from waist up",
    "CU": "close-up shot, face and shoulders",
    "ECU": "extreme close-up, eyes or detail fill frame",
    # Legacy names (from old SHOT_TYPES)
    "close_up": "close-up shot, face and shoulders",
    "medium_shot": "medium shot, character from waist up",
    "wide_shot": "long shot, full environment visible",
    "over_shoulder": "over-the-shoulder shot",
    "two_shot": "two-shot, two characters in frame",
    "establishing": "establishing shot, wide establishing view",
}

# Shot types for LLM panel generation
SHOT_TYPES = [
    "close_up",
    "medium_shot",
    "wide_shot",
    "over_shoulder",
    "two_shot",
    "establishing",
]

# Maximum concurrent image generation requests
MAX_IMAGE_CONCURRENCY = 3


class StoryboardGenerator:
    """Generator for storyboard panels from script scenes."""

    def __init__(self, config: dict[str, Any]):
        """Initialize with API configuration."""
        self.config = config
        self.storyboards_dir = Path("data/storyboards")
        self.storyboards_dir.mkdir(parents=True, exist_ok=True)

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

    def _save_storyboard(self, storyboard_id: str, data: dict[str, Any]) -> None:
        _validate_id(storyboard_id)
        lock = _get_lock(storyboard_id)
        with lock:
            get_storage().upsert_document(
                "storyboard",
                storyboard_id,
                data,
                project_id=data.get("project_id"),
                status=data.get("status"),
                title=data.get("storyboard_id") or storyboard_id,
                created_at=data.get("created_at"),
                updated_at=data.get("updated_at"),
            )

    def _load_storyboard(self, storyboard_id: str) -> dict[str, Any] | None:
        _validate_id(storyboard_id)
        lock = _get_lock(storyboard_id)
        with lock:
            return get_storage().get_document("storyboard", storyboard_id)

    # ------------------------------------------------------------------
    # Prompt Construction (设计文档 §2.1)
    # ------------------------------------------------------------------

    @staticmethod
    def build_shot_image_prompt(
        panel: dict[str, Any],
        scene_info: dict[str, Any] | None = None,
        characters: list[dict[str, Any]] | None = None,
        style_config: dict[str, Any] | None = None,
        story_bible: dict[str, Any] | None = None,
    ) -> str:
        """
        Build image prompt by ASSEMBLING from production bible archives.

        Assembly order:
        1. Art style + color palette (from story_bible)
        2. Shot size / focal length / composition
        3. Character visual_prompt_template (verbatim from archive)
           + expression_library[key] (verbatim from archive)
           + pose/action from panel
        4. Scene visual_prompt_template (verbatim from archive)
           + variant condition overlay
        5. Style keywords (from compiled_style_prompt)
        6. Cinematic quality anchor
        """
        parts: list[str] = []

        # 1. Global style anchors from story_bible
        if story_bible:
            art = story_bible.get("art_style", "")
            if art:
                parts.append(art)
            palette = story_bible.get("color_palette", "")
            if palette:
                parts.append(palette)
            lighting_global = story_bible.get("lighting_style", "")
            if lighting_global:
                parts.append(lighting_global)

        # 2. Shot size / focal length / composition
        shot_type = panel.get("shot_type") or panel.get("shot_size", "medium_shot")
        shot_size_text = SHOT_SIZE_MAP.get(shot_type, "medium shot")
        parts.append(shot_size_text)
        focal = panel.get("focal_length")
        if focal:
            parts.append(f"shot on {focal} lens")
        comp = panel.get("composition")
        if comp:
            parts.append(f"{comp} composition")

        # 3. Character visual — assemble from archive, not from panel text
        char_index = {}
        if characters:
            char_index = {
                c.get("id") or c.get("char_id") or c.get("name", ""): c
                for c in characters
            }

        # Resolve which characters are in frame
        chars_in_frame = panel.get("characters_in_frame") or panel.get("char_refs") or []
        # Normalize: could be list of strings or list of dicts
        char_ref_list = []
        for item in chars_in_frame:
            if isinstance(item, dict):
                char_ref_list.append(item)
            elif isinstance(item, str):
                char_ref_list.append({"char_ref": item})

        for cif in char_ref_list:
            ref = cif.get("char_ref", "")
            char_data = char_index.get(ref)
            if not char_data:
                # Try matching by name
                for c in (characters or []):
                    if c.get("name") == ref or c.get("name_en") == ref:
                        char_data = c
                        break
            if char_data:
                # Visual template — the core verbatim anchor
                vpt = char_data.get("visual_prompt_template") or char_data.get("appearance_description", "")
                if vpt:
                    parts.append(vpt)
                # Expression from library
                expr_key = cif.get("expression_ref") or cif.get("expression_key", "neutral")
                expr_lib = char_data.get("expression_library", {})
                expr_text = expr_lib.get(expr_key) or expr_lib.get("neutral", "")
                if expr_text:
                    parts.append(expr_text)
                # Facing / position
                facing = cif.get("facing")
                if facing:
                    parts.append(facing)
                position = cif.get("position")
                if position:
                    parts.append(position)

        # Panel-level action / subject description (additional detail on top of archive)
        action = panel.get("action") or panel.get("action_detail") or panel.get("image_prompt") or ""
        if action:
            parts.append(action)

        # 4. Scene visual — assemble from archive
        if scene_info:
            scene_vpt = scene_info.get("visual_prompt_template", "")
            if scene_vpt:
                parts.append(scene_vpt)
            else:
                # Legacy fallback: build from environment_anchors or environment dict
                env = scene_info.get("environment_anchors") or scene_info.get("environment", {})
                if isinstance(env, dict):
                    for key in ("architecture", "materials_textures", "ground_surface",
                                "atmosphere", "time_of_day", "weather"):
                        val = env.get(key)
                        if val:
                            parts.append(str(val))
                    # key_objects
                    for obj in env.get("key_objects", []):
                        if obj:
                            parts.append(str(obj))
                elif isinstance(env, str) and env:
                    parts.append(env)

            # Scene lighting
            anchors = scene_info.get("environment_anchors", {})
            scene_light = anchors.get("lighting") or ""
            if not scene_light:
                light_dict = scene_info.get("lighting", {})
                if isinstance(light_dict, dict):
                    scene_light = light_dict.get("mood", "")
            if scene_light:
                parts.append(str(scene_light))

            # Variant condition overlay
            variant = panel.get("time_variant")
            if variant:
                variants = scene_info.get("variant_conditions", {})
                overlay = variants.get(variant, "")
                if overlay:
                    parts.append(overlay)

        # 5. Style keywords from compiled_style_prompt
        if style_config:
            compiled = style_config.get("compiled_style_prompt", "")
            if compiled:
                keywords = [kw.strip() for kw in compiled.split(",") if kw.strip()][:6]
                if keywords:
                    parts.append(", ".join(keywords))

        # 6. Cinematic quality anchor
        parts.append("cinematic composition, high quality, masterpiece")

        return ", ".join(filter(None, parts))

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def generate_storyboard(
        self,
        project_id: str,
        script_id: str,
        episode_index: int = 0,
        style_config: dict[str, Any] | None = None,
    ) -> str:
        """
        Start storyboard generation asynchronously.
        Returns storyboard_id immediately; generation runs in background.
        """
        storyboard_id = self.generate_id("storyboard")

        data = {
            "storyboard_id": storyboard_id,
            "project_id": project_id,
            "script_id": script_id,
            "episode_index": episode_index,
            "episode_num": episode_index + 1,
            "style": "",
            "style_config": style_config,
            "status": "pending",
            "panels": [],
            "error_message": None,
            "created_at": self.now_iso(),
            "updated_at": self.now_iso(),
        }
        self._save_storyboard(storyboard_id, data)

        thread = threading.Thread(
            target=self._generate_worker,
            args=(storyboard_id, project_id, script_id, episode_index, style_config),
            name=f"storyboard_{storyboard_id}",
            daemon=False,
        )
        thread.start()

        return storyboard_id

    def get_storyboard(self, storyboard_id: str) -> dict[str, Any] | None:
        """Return storyboard data dict or None."""
        return self._load_storyboard(storyboard_id)

    def regenerate_panel(self, storyboard_id: str, panel_id: str) -> bool:
        """Re-generate a single panel image."""
        data = self._load_storyboard(storyboard_id)
        if data is None:
            return False

        panel = next((p for p in data["panels"] if p["panel_id"] == panel_id), None)
        if panel is None:
            return False

        panel["status"] = "pending"
        panel["image_url"] = None
        data["updated_at"] = self.now_iso()
        self._save_storyboard(storyboard_id, data)

        thread = threading.Thread(
            target=self._regenerate_panel_worker,
            args=(storyboard_id, panel_id, data.get("style_config")),
            name=f"panel_{panel_id}",
            daemon=False,
        )
        thread.start()
        return True

    # ------------------------------------------------------------------
    # Background workers
    # ------------------------------------------------------------------

    def _generate_worker(
        self,
        storyboard_id: str,
        project_id: str,
        script_id: str,
        episode_index: int,
        style_config: dict[str, Any] | None = None,
    ) -> None:
        """Background thread: load script -> LLM -> generate panel images."""
        try:
            self._update_status(storyboard_id, "generating")

            # Load script data
            script_data = get_storage().get_document("script", script_id)
            if script_data is None:
                raise FileNotFoundError(f"Script {script_id} not found")
            episodes = script_data.get("episodes", [])

            if not episodes:
                raise ValueError("Script has no episodes")

            ep_idx = min(episode_index, len(episodes) - 1)
            episode = episodes[ep_idx]
            scenes = episode.get("scenes", [])

            if not scenes:
                scenes = [
                    {
                        "scene_id": "scene_1",
                        "description": script_data.get("synopsis", ""),
                        "dialogues": [],
                    }
                ]

            # Load scene details from script analysis if available
            scene_details = {
                s.get("scene_id", f"scene_{i}"): s
                for i, s in enumerate(script_data.get("scenes", []))
            }
            characters = script_data.get("characters", [])
            story_bible = script_data.get("story_bible", {})

            # Generate panel descriptions via LLM
            panels_desc = self._llm_generate_panels(script_data, episode, scenes)

            # Build panel stubs — preserve all fields from LLM for assembly
            panels: list[dict[str, Any]] = []
            for i, pd in enumerate(panels_desc):
                scene_id = pd.get("scene_id", f"scene_{i}")
                stub: dict[str, Any] = {
                    "panel_id": self.generate_id("panel"),
                    "index": i,
                    "scene_id": scene_id,
                    "shot_type": pd.get("shot_type", "medium_shot"),
                    "image_prompt": pd.get("image_prompt", ""),
                    "dialogue_ref": pd.get("dialogue_ref", ""),
                    "duration": pd.get("duration", 5),
                    "camera_movement": pd.get("camera_movement", "static"),
                    "status": "pending",
                    "image_url": None,
                }
                # Pass through new fields for assembly
                for fwd_key in ("shot_size", "focal_length", "composition",
                                "characters_in_frame", "char_refs",
                                "action_detail", "time_variant", "expression_ref"):
                    if pd.get(fwd_key):
                        stub[fwd_key] = pd[fwd_key]
                panels.append(stub)

            data = self._load_storyboard(storyboard_id)
            if data is None:
                return
            data["panels"] = panels
            data["updated_at"] = self.now_iso()
            self._save_storyboard(storyboard_id, data)

            # Generate images concurrently (max 3 parallel)
            self._generate_panels_concurrent(
                storyboard_id, panels, scene_details, characters, style_config,
                story_bible=story_bible,
            )

            # Check panel statuses to determine overall status
            data = self._load_storyboard(storyboard_id)
            if data:
                error_panels = [p for p in data["panels"] if p.get("status") == "error"]
                if error_panels:
                    log.warning(
                        "%d/%d panels failed, marking as partial",
                        len(error_panels), len(data["panels"]),
                    )
                    self._update_status(storyboard_id, "partial")
                else:
                    self._update_status(storyboard_id, "done")

        except Exception as exc:
            log.exception(f"Storyboard generation failed: {exc}")
            self._mark_error(storyboard_id, str(exc))

    def _generate_panels_concurrent(
        self,
        storyboard_id: str,
        panels: list[dict[str, Any]],
        scene_details: dict[str, dict[str, Any]],
        characters: list[dict[str, Any]],
        style_config: dict[str, Any] | None,
        story_bible: dict[str, Any] | None = None,
    ) -> None:
        """Generate panel images with concurrent execution (max 3)."""
        with ThreadPoolExecutor(max_workers=MAX_IMAGE_CONCURRENCY) as executor:
            futures = {}
            for panel in panels:
                scene_info = scene_details.get(panel.get("scene_id", ""))
                future = executor.submit(
                    self._generate_panel_image,
                    storyboard_id,
                    panel,
                    scene_info,
                    characters,
                    style_config,
                    story_bible,
                )
                futures[future] = panel["panel_id"]

            for future in as_completed(futures):
                panel_id = futures[future]
                try:
                    future.result()
                except Exception as exc:
                    log.error(f"Panel {panel_id} generation failed: {exc}")

    def _regenerate_panel_worker(
        self,
        storyboard_id: str,
        panel_id: str,
        style_config: dict[str, Any] | None = None,
    ) -> None:
        """Re-generate a single panel image."""
        try:
            data = self._load_storyboard(storyboard_id)
            if data is None:
                return
            panel = next((p for p in data["panels"] if p["panel_id"] == panel_id), None)
            if panel is None:
                return
            self._generate_panel_image(storyboard_id, panel, style_config=style_config)
        except Exception as exc:
            data = self._load_storyboard(storyboard_id)
            if data:
                for p in data["panels"]:
                    if p["panel_id"] == panel_id:
                        p["status"] = "error"
                        p["error"] = str(exc)
                        break
                data["updated_at"] = self.now_iso()
                self._save_storyboard(storyboard_id, data)

    def _generate_panel_image(
        self,
        storyboard_id: str,
        panel: dict[str, Any],
        scene_info: dict[str, Any] | None = None,
        characters: list[dict[str, Any]] | None = None,
        style_config: dict[str, Any] | None = None,
        story_bible: dict[str, Any] | None = None,
    ) -> None:
        """Generate a panel image using the image generation API (Nano Banana 2)."""
        self._update_panel(storyboard_id, panel["panel_id"], {"status": "generating"})

        # Build enriched prompt — code-level assembly from archives
        prompt = self.build_shot_image_prompt(panel, scene_info, characters, style_config, story_bible)
        if not prompt:
            self._update_panel(
                storyboard_id,
                panel["panel_id"],
                {"status": "error", "error": "No image prompt"},
            )
            return

        image_api_url = self.config.get("image_api_url") or self.config.get("ai_image_base", "")
        image_model = self.config.get("image_model") or self.config.get("ai_image_model", "imagen-4.0-generate-001")
        # Use Gemini API key for Imagen models, fall back to general API key
        if image_model.startswith("imagen") or "generativelanguage.googleapis.com" in image_api_url:
            image_api_key = self.config.get("gemini_api_key") or self.config.get("image_api_key") or self.config.get("api_key", "")
        else:
            image_api_key = self.config.get("image_api_key") or self.config.get("api_key", "")

        if not image_api_url:
            # No image API configured — use placeholder
            self._update_panel(
                storyboard_id,
                panel["panel_id"],
                {"status": "done", "image_url": "/media/placeholder/storyboard_panel.png"},
            )
            return

        # Determine size from style_config aspect ratio
        aspect_ratio = "9:16"
        if style_config:
            aspect_ratio = style_config.get("aspect_ratio", "9:16")
        size_map: dict[str, str] = {
            "16:9": "1536x1024",
            "9:16": "1024x1536",
            "1:1": "1024x1024",
        }
        size = size_map.get(aspect_ratio, "1024x1536")

        try:
            # Direct image generation via Nano Banana 2 API
            image_url = self._generate_image_direct(
                api_url=image_api_url,
                api_key=image_api_key,
                model=image_model,
                prompt=prompt,
                size=size,
            )

            self._update_panel(
                storyboard_id,
                panel["panel_id"],
                {"status": "done", "image_url": image_url},
            )

        except Exception as exc:
            log.error(f"Panel image generation error: {exc}")
            # Retry once
            try:
                time.sleep(2)
                image_url = self._generate_image_direct(
                    api_url=image_api_url,
                    api_key=image_api_key,
                    model=image_model,
                    prompt=prompt,
                    size=size,
                )
                self._update_panel(
                    storyboard_id,
                    panel["panel_id"],
                    {"status": "done", "image_url": image_url},
                )
            except Exception as retry_exc:
                self._update_panel(
                    storyboard_id,
                    panel["panel_id"],
                    {"status": "error", "error": str(retry_exc)},
                )

    # ------------------------------------------------------------------
    # Image Generation API (Nano Banana 2)
    # ------------------------------------------------------------------

    @staticmethod
    def _generate_image_direct(
        api_url: str,
        api_key: str,
        model: str,
        prompt: str,
        size: str = "1024x1536",
        n: int = 1,
    ) -> str:
        """
        Direct image generation via API.

        Supports Gemini Imagen (when model starts with 'imagen') and
        legacy Zhonglian MAAS chat/completions endpoint.
        Returns the generated image URL.
        """
        # Detect Gemini Imagen mode
        if model.startswith("imagen") or model.startswith("nano-banana") or "generativelanguage.googleapis.com" in api_url:
            return StoryboardGenerator._generate_image_gemini(api_url, api_key, model, prompt, size)

        # Legacy Zhonglian path
        api_size = size

        payload = json.dumps(
            {
                "model": model,
                "prompt": prompt,
                "sequential_image_generation": "disabled",
                "response_format": "url",
                "size": api_size,
                "stream": False,
                "watermark": False,
            }
        ).encode("utf-8")

        req = urllib.request.Request(
            api_url,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            method="POST",
        )

        opener = _make_opener(api_url)
        with opener.open(req, timeout=120) as resp:
            result = json.loads(resp.read().decode("utf-8"))

        # OpenAI images/generations response format
        data_list = result.get("data", [])
        if data_list:
            url = data_list[0].get("url", "")
            if url:
                return url

        # Fallback: check saved_assets (server.py auto-save format)
        saved = result.get("saved_assets", [])
        if saved:
            asset_url = saved[0].get("asset_url", "")
            if asset_url:
                return asset_url

        raise RuntimeError(f"Image API returned no URL: {json.dumps(result)[:300]}")

    @staticmethod
    def _generate_image_gemini(
        api_url: str,
        api_key: str,
        model: str,
        prompt: str,
        size: str = "1024x1536",
    ) -> str:
        """Generate image via Gemini API. Supports both predict (Imagen) and generateContent (nano-banana, gemini-image) models."""

        base = api_url.rstrip("/")
        # Choose endpoint based on model type
        if model.startswith("imagen"):
            action = "predict"
        else:
            action = "generateContent"

        if "/models/" not in base:
            url = f"{base}/models/{model}:{action}"
        else:
            url = base
        separator = "&" if "?" in url else "?"
        full_url = f"{url}{separator}key={api_key}"

        if action == "predict":
            # Imagen predict format
            ar_map = {
                "1024x1024": "1:1", "1024x1536": "3:4", "1536x1024": "4:3",
                "9:16": "9:16", "16:9": "16:9", "1:1": "1:1", "3:4": "3:4", "4:3": "4:3",
            }
            aspect_ratio = ar_map.get(size, "3:4")
            payload_dict = {
                "instances": [{"prompt": prompt}],
                "parameters": {
                    "sampleCount": 1,
                    "aspectRatio": aspect_ratio,
                    "outputOptions": {"mimeType": "image/png"},
                    "personGeneration": "allow_adult",
                },
            }
        else:
            # generateContent format (nano-banana, gemini-*-image)
            payload_dict = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"responseModalities": ["IMAGE"]},
            }

        payload = json.dumps(payload_dict).encode("utf-8")
        req = urllib.request.Request(
            full_url, data=payload,
            headers={"Content-Type": "application/json"}, method="POST",
        )
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(req, timeout=300) as resp:
            result = json.loads(resp.read().decode("utf-8"))

        # Extract base64 image data
        b64_data = ""
        mime = "image/png"

        if action == "predict":
            predictions = result.get("predictions", [])
            if predictions:
                b64_data = predictions[0].get("bytesBase64Encoded", "")
                mime = predictions[0].get("mimeType", "image/png")
        else:
            for candidate in result.get("candidates", []):
                for part in candidate.get("content", {}).get("parts", []):
                    inline = part.get("inlineData")
                    if inline and inline.get("data"):
                        b64_data = inline["data"]
                        mime = inline.get("mimeType", "image/png")
                        break
                if b64_data:
                    break

        if not b64_data:
            raise RuntimeError(f"Gemini API returned no image: {json.dumps(result)[:300]}")

        return f"data:{mime};base64,{b64_data}"

    # ------------------------------------------------------------------
    # LLM: generate panel descriptions from script
    # ------------------------------------------------------------------

    def _llm_generate_panels(
        self,
        script_data: dict[str, Any],
        episode: dict[str, Any],
        scenes: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """
        Call LLM to generate storyboard panel descriptions.
        Returns list of dicts with shot_type, image_prompt, dialogue_ref, scene_id.
        """
        api_key = self.config.get("ai_chat_key") or self.config.get("api_key", "")
        base_url = self.config.get("ai_chat_base") or self.config.get("base_url", "")
        model = self.config.get("ai_chat_model") or self.config.get("model", "claude-opus-4-6")

        title = script_data.get("title", "")
        story_bible = script_data.get("story_bible", {})
        genre = story_bible.get("genre") or script_data.get("genre", "")
        synopsis = script_data.get("synopsis", "")
        ep_title = episode.get("title", f"Episode {episode.get('episode_number', 1)}")

        # Build character reference block from archives
        char_refs: list[str] = []
        for ch in script_data.get("characters", [])[:6]:
            vpt = ch.get("visual_prompt_template") or ch.get("appearance_description", "")
            char_refs.append(f"[{ch.get('id', ch.get('name', ''))}] {ch.get('name', '')}: {vpt[:200]}")
        char_block = "\n".join(char_refs) if char_refs else "(no character data)"

        # Build scene reference block from archives
        scene_refs: list[str] = []
        scene_archive = script_data.get("scenes", [])
        for sc in scene_archive[:8]:
            svpt = sc.get("visual_prompt_template", "")
            scene_refs.append(f"[{sc.get('scene_id', '')}] {sc.get('scene_name', sc.get('location', ''))}: {svpt[:200]}")
        scene_block = "\n".join(scene_refs) if scene_refs else "(no scene data)"

        # Build beat summaries from episode
        beat_summaries: list[str] = []
        for beat in episode.get("beats", []):
            beat_summaries.append(
                f"Beat {beat.get('beat_number', '?')} (scene: {beat.get('scene_id', '?')}, "
                f"emotion: {beat.get('emotion', '?')}): {beat.get('action_description', '')}"
            )
        # Fallback to old scene format
        if not beat_summaries:
            for sc in scenes[:10]:
                desc = sc.get("description", "")
                dlgs = sc.get("dialogues", [])
                first_dlg = dlgs[0].get("text", "") if dlgs else ""
                beat_summaries.append(f"Scene: {desc}\nFirst line: {first_dlg}")
        beat_text = "\n".join(beat_summaries)

        prompt = f"""You are a professional storyboard artist. Generate panel descriptions for one episode.

Script: {title} ({genre})
Synopsis: {synopsis}
Art style: {story_bible.get('art_style', '')}
Color palette: {story_bible.get('color_palette', '')}
Episode: {ep_title}

CHARACTER ARCHIVES (use char IDs in char_refs):
{char_block}

SCENE ARCHIVES (use scene IDs in scene_id):
{scene_block}

NARRATIVE BEATS:
{beat_text}

Generate 8-16 panels. For each panel, output a JSON object:
- scene_id: ID from scene archives above
- shot_type: one of {SHOT_TYPES}
- shot_size: wide|medium|close-up|extreme-close-up
- focal_length: 24mm|35mm|50mm|85mm|135mm
- composition: rule-of-thirds|center|diagonal|frame-within-frame|leading-lines
- char_refs: array of character IDs in this shot
- expression_ref: expression key (neutral|happy|angry|sad|shocked|determined|thinking|shy)
- action_detail: specific action + physics (hair sway, cloth flutter, etc.)
- image_prompt: additional visual detail NOT already in character/scene templates (pose, interaction, unique moment detail)
- dialogue_ref: dialogue or action shown (brief, in Chinese)
- duration: seconds (3-8)
- camera_movement: static|push_in_slow|pull_back|pan_left|pan_right|orbit|handheld|tilt_up|crane_down
- time_variant: null|action|emotional
- transition: hard-cut|dissolve|match-cut|fade + narrative reason
- narrative_purpose: why this shot exists in the story

RULES:
- Do NOT repeat character appearance descriptions in image_prompt — downstream code inserts them from archives
- Do NOT repeat scene environment in image_prompt — downstream code inserts from archives
- image_prompt should ONLY contain: pose, gesture, interaction detail, unique moment-specific visual elements
- Vary shot_size: no 3+ consecutive same size. Mix focal lengths. Static ≤ 40%.
- Follow 180° axis rule in dialogue sequences

Return a JSON array. No markdown, just raw JSON."""

        if not api_key or not base_url:
            return self._fallback_panels(scenes)

        try:
            # Use OpenAI-compatible chat completions API
            url = base_url.rstrip("/")
            if not url.endswith("/chat/completions"):
                url = url.rstrip("/") + "/chat/completions"

            payload = json.dumps(
                {
                    "model": model,
                    "max_tokens": 4096,
                    "temperature": 0.7,
                    "messages": [{"role": "user", "content": prompt}],
                }
            ).encode("utf-8")

            req = urllib.request.Request(
                url,
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                },
                method="POST",
            )

            with urllib.request.urlopen(req, timeout=120) as resp:
                result = json.loads(resp.read().decode("utf-8"))

            # OpenAI chat completions format
            text = ""
            choices = result.get("choices", [])
            if choices:
                msg = choices[0].get("message", {})
                text = msg.get("content", "").strip()
            else:
                # Anthropic messages format fallback
                content = result.get("content", [])
                if content:
                    text = content[0].get("text", "").strip()

            if not text:
                return self._fallback_panels(scenes)

            # Extract JSON array from response
            if text.startswith("["):
                panels = json.loads(text)
            else:
                start = text.find("[")
                end = text.rfind("]") + 1
                if start >= 0 and end > start:
                    panels = json.loads(text[start:end])
                else:
                    panels = self._fallback_panels(scenes)

            return panels

        except Exception as exc:
            log.error(f"LLM panel generation failed: {exc}")
            return self._fallback_panels(scenes)

    def _fallback_panels(self, scenes: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Generate minimal fallback panels when LLM is unavailable."""
        panels: list[dict[str, Any]] = []
        shot_cycle = SHOT_TYPES * 10
        for i, sc in enumerate(scenes[:8]):
            desc = sc.get("description", f"Scene {i + 1}")
            dlgs = sc.get("dialogues", [])
            dlg_text = dlgs[0].get("text", "") if dlgs else ""
            panels.append(
                {
                    "scene_id": sc.get("scene_id", f"scene_{i + 1}"),
                    "shot_type": shot_cycle[i],
                    "image_prompt": f"anime style, {desc}, cinematic composition, high quality",
                    "dialogue_ref": dlg_text[:30] if dlg_text else desc[:30],
                    "duration": 5,
                    "camera_movement": "static",
                }
            )
        return panels if panels else [
            {
                "scene_id": "scene_1",
                "shot_type": "medium_shot",
                "image_prompt": "anime style character, cinematic scene, high quality",
                "dialogue_ref": "—",
                "duration": 5,
                "camera_movement": "static",
            }
        ]

    # ------------------------------------------------------------------
    # State helpers
    # ------------------------------------------------------------------

    def _update_status(self, storyboard_id: str, status: str) -> None:
        _validate_id(storyboard_id)
        lock = _get_lock(storyboard_id)
        with lock:
            data = self._load_storyboard(storyboard_id)
            if data is None:
                return
            data["status"] = status
            data["updated_at"] = self.now_iso()
            self._save_storyboard(storyboard_id, data)

    def _mark_error(self, storyboard_id: str, message: str) -> None:
        _validate_id(storyboard_id)
        lock = _get_lock(storyboard_id)
        with lock:
            data = self._load_storyboard(storyboard_id)
            if data is None:
                return
            data["status"] = "error"
            data["error_message"] = message
            data["updated_at"] = self.now_iso()
            self._save_storyboard(storyboard_id, data)

    def _update_panel(
        self, storyboard_id: str, panel_id: str, updates: dict[str, Any]
    ) -> None:
        _validate_id(storyboard_id)
        lock = _get_lock(storyboard_id)
        with lock:
            data = self._load_storyboard(storyboard_id)
            if data is None:
                return
            for p in data["panels"]:
                if p["panel_id"] == panel_id:
                    p.update(updates)
                    break
            data["updated_at"] = self.now_iso()
            self._save_storyboard(storyboard_id, data)
