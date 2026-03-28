"""
Storyboard Generator Module
Generates storyboard panels from script scenes using LLM + image generation API.
"""

import json
import random
import string
import threading
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path


# Shot types for storyboard panels
SHOT_TYPES = [
    'close_up',
    'medium_shot',
    'wide_shot',
    'over_shoulder',
    'two_shot',
    'establishing',
]


class StoryboardGenerator:
    """Generator for storyboard panels from script scenes."""

    def __init__(self, config):
        """Initialize with API configuration."""
        self.config = config
        self.storyboards_dir = Path('data/storyboards')
        self.storyboards_dir.mkdir(parents=True, exist_ok=True)

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

    def _save_storyboard(self, storyboard_id, data):
        path = self.storyboards_dir / f"{storyboard_id}.json"
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')

    def _load_storyboard(self, storyboard_id):
        path = self.storyboards_dir / f"{storyboard_id}.json"
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding='utf-8'))

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def generate_storyboard(self, project_id, script_id, episode_index=0):
        """
        Start storyboard generation asynchronously.
        Returns storyboard_id immediately; generation runs in background.
        """
        storyboard_id = self.generate_id('storyboard')

        data = {
            'storyboard_id': storyboard_id,
            'project_id': project_id,
            'script_id': script_id,
            'episode_index': episode_index,
            'episode_num': episode_index + 1,  # 1-based for frontend
            'style': '',
            'status': 'pending',
            'panels': [],
            'error_message': None,
            'created_at': self.now_iso(),
            'updated_at': self.now_iso(),
        }
        self._save_storyboard(storyboard_id, data)

        thread = threading.Thread(
            target=self._generate_worker,
            args=(storyboard_id, project_id, script_id, episode_index),
            name=f"storyboard_{storyboard_id}",
            daemon=False,
        )
        thread.start()

        return storyboard_id

    def get_storyboard(self, storyboard_id):
        """Return storyboard data dict or None."""
        return self._load_storyboard(storyboard_id)

    def regenerate_panel(self, storyboard_id, panel_id):
        """Re-generate a single panel image."""
        data = self._load_storyboard(storyboard_id)
        if data is None:
            return False

        panel = next((p for p in data['panels'] if p['panel_id'] == panel_id), None)
        if panel is None:
            return False

        panel['status'] = 'pending'
        panel['image_url'] = None
        data['updated_at'] = self.now_iso()
        self._save_storyboard(storyboard_id, data)

        thread = threading.Thread(
            target=self._regenerate_panel_worker,
            args=(storyboard_id, panel_id),
            name=f"panel_{panel_id}",
            daemon=False,
        )
        thread.start()
        return True

    # ------------------------------------------------------------------
    # Background workers
    # ------------------------------------------------------------------

    def _generate_worker(self, storyboard_id, project_id, script_id, episode_index):
        """Background thread: load script → LLM → generate panel images."""
        try:
            self._update_status(storyboard_id, 'generating')

            # Load script data
            script_path = Path('data/scripts') / f"{script_id}.json"
            if not script_path.exists():
                raise FileNotFoundError(f"Script {script_id} not found")

            script_data = json.loads(script_path.read_text(encoding='utf-8'))
            episodes = script_data.get('episodes', [])

            if not episodes:
                raise ValueError("Script has no episodes")

            # Use episode_index (clamp to available range)
            ep_idx = min(episode_index, len(episodes) - 1)
            episode = episodes[ep_idx]
            scenes = episode.get('scenes', [])

            if not scenes:
                # Fall back to flat script description
                scenes = [{'scene_id': 'scene_1', 'description': script_data.get('synopsis', ''), 'dialogues': []}]

            # Generate panel descriptions via LLM
            panels_desc = self._llm_generate_panels(script_data, episode, scenes)

            # Build panel stubs
            panels = []
            for i, pd in enumerate(panels_desc):
                panels.append({
                    'panel_id': self.generate_id('panel'),
                    'index': i,
                    'scene_id': pd.get('scene_id', f'scene_{i}'),
                    'shot_type': pd.get('shot_type', 'medium_shot'),
                    'image_prompt': pd.get('image_prompt', ''),
                    'dialogue_ref': pd.get('dialogue_ref', ''),
                    'status': 'pending',
                    'image_url': None,
                })

            data = self._load_storyboard(storyboard_id)
            data['panels'] = panels
            data['updated_at'] = self.now_iso()
            self._save_storyboard(storyboard_id, data)

            # Generate images for each panel
            for panel in panels:
                self._generate_panel_image(storyboard_id, panel)

            # Mark overall done
            self._update_status(storyboard_id, 'done')

        except Exception as exc:
            self._mark_error(storyboard_id, str(exc))

    def _regenerate_panel_worker(self, storyboard_id, panel_id):
        """Re-generate a single panel image."""
        try:
            data = self._load_storyboard(storyboard_id)
            panel = next((p for p in data['panels'] if p['panel_id'] == panel_id), None)
            if panel is None:
                return
            self._generate_panel_image(storyboard_id, panel)
        except Exception as exc:
            # Mark panel as error
            data = self._load_storyboard(storyboard_id)
            if data:
                for p in data['panels']:
                    if p['panel_id'] == panel_id:
                        p['status'] = 'error'
                        p['error'] = str(exc)
                        break
                data['updated_at'] = self.now_iso()
                self._save_storyboard(storyboard_id, data)

    def _generate_panel_image(self, storyboard_id, panel):
        """Submit image generation request and poll until done."""
        # Mark generating
        self._update_panel(storyboard_id, panel['panel_id'], {'status': 'generating'})

        prompt = panel.get('image_prompt', '')
        if not prompt:
            self._update_panel(storyboard_id, panel['panel_id'], {
                'status': 'error',
                'error': 'No image prompt',
            })
            return

        image_api_url = self.config.get('image_api_url', '')
        image_api_key = self.config.get('image_api_key', '')

        if not image_api_url:
            # No image API configured — use placeholder
            self._update_panel(storyboard_id, panel['panel_id'], {
                'status': 'done',
                'image_url': f"/media/placeholder/storyboard_panel.png",
            })
            return

        try:
            # Submit image generation task
            task_id = self._submit_image_task(image_api_url, image_api_key, prompt)
            if not task_id:
                raise RuntimeError("Image API returned no task_id")

            # Poll until done (max 5 minutes)
            image_url = self._poll_image_task(image_api_url, image_api_key, task_id, timeout=300)

            self._update_panel(storyboard_id, panel['panel_id'], {
                'status': 'done',
                'image_url': image_url,
            })
        except Exception as exc:
            self._update_panel(storyboard_id, panel['panel_id'], {
                'status': 'error',
                'error': str(exc),
            })

    # ------------------------------------------------------------------
    # LLM: generate panel descriptions from script
    # ------------------------------------------------------------------

    def _llm_generate_panels(self, script_data, episode, scenes):
        """
        Call LLM to generate storyboard panel descriptions.
        Returns list of dicts with shot_type, image_prompt, dialogue_ref, scene_id.
        """
        api_key = self.config.get('api_key', '')
        base_url = self.config.get('base_url', 'https://api.anthropic.com')
        model = self.config.get('model', 'claude-opus-4-5')

        title = script_data.get('title', '')
        genre = script_data.get('genre', '')
        synopsis = script_data.get('synopsis', '')
        ep_title = episode.get('title', f"Episode {episode.get('episode_number', 1)}")

        # Build scene summary for prompt
        scene_summaries = []
        for sc in scenes[:10]:  # limit to 10 scenes
            desc = sc.get('description', '')
            dlgs = sc.get('dialogues', [])
            first_dlg = dlgs[0].get('text', '') if dlgs else ''
            scene_summaries.append(f"Scene: {desc}\nFirst line: {first_dlg}")

        scene_text = '\n\n'.join(scene_summaries)

        prompt = f"""You are a professional anime storyboard artist.
Create storyboard panel descriptions for this episode.

Script: {title} ({genre})
Synopsis: {synopsis}
Episode: {ep_title}

Scenes:
{scene_text}

Generate 8-12 storyboard panels. For each panel output a JSON object with:
- scene_id: which scene this panel belongs to (use "scene_1", "scene_2", etc.)
- shot_type: one of {SHOT_TYPES}
- image_prompt: detailed image generation prompt (English, describe the visual content)
- dialogue_ref: the dialogue or action shown (brief, in Chinese)

Return a JSON array of panel objects. No markdown, just raw JSON array."""

        if not api_key or not base_url:
            return self._fallback_panels(scenes)

        try:
            url = base_url.rstrip('/') + '/v1/messages'
            payload = json.dumps({
                'model': model,
                'max_tokens': 4096,
                'messages': [{'role': 'user', 'content': prompt}],
            }).encode('utf-8')

            req = urllib.request.Request(
                url,
                data=payload,
                headers={
                    'Content-Type': 'application/json',
                    'x-api-key': api_key,
                    'anthropic-version': '2023-06-01',
                },
                method='POST',
            )

            with urllib.request.urlopen(req, timeout=120) as resp:
                result = json.loads(resp.read().decode('utf-8'))

            text = result['content'][0]['text'].strip()

            # Extract JSON array from response
            if text.startswith('['):
                panels = json.loads(text)
            else:
                # Try to find JSON array in text
                start = text.find('[')
                end = text.rfind(']') + 1
                if start >= 0 and end > start:
                    panels = json.loads(text[start:end])
                else:
                    panels = self._fallback_panels(scenes)

            return panels

        except Exception:
            return self._fallback_panels(scenes)

    def _fallback_panels(self, scenes):
        """Generate minimal fallback panels when LLM is unavailable."""
        panels = []
        shot_cycle = SHOT_TYPES * 10
        for i, sc in enumerate(scenes[:8]):
            desc = sc.get('description', f'Scene {i + 1}')
            dlgs = sc.get('dialogues', [])
            dlg_text = dlgs[0].get('text', '') if dlgs else ''
            panels.append({
                'scene_id': sc.get('scene_id', f'scene_{i + 1}'),
                'shot_type': shot_cycle[i],
                'image_prompt': f"anime style, {desc}, cinematic composition, high quality",
                'dialogue_ref': dlg_text[:30] if dlg_text else desc[:30],
            })
        return panels if panels else [{
            'scene_id': 'scene_1',
            'shot_type': 'medium_shot',
            'image_prompt': 'anime style character, cinematic scene, high quality',
            'dialogue_ref': '—',
        }]

    # ------------------------------------------------------------------
    # Image API helpers
    # ------------------------------------------------------------------

    def _submit_image_task(self, api_url, api_key, prompt):
        """Submit image generation task, return task_id."""
        url = api_url.rstrip('/') + '/api/tasks'
        payload = json.dumps({
            'model': 'seedance-1',
            'mode': 'text',
            'content': [{'type': 'text', 'text': prompt}],
        }).encode('utf-8')

        req = urllib.request.Request(
            url,
            data=payload,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {api_key}',
            },
            method='POST',
        )

        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode('utf-8'))

        return result.get('task_id') or result.get('id')

    def _poll_image_task(self, api_url, api_key, task_id, timeout=300):
        """Poll image task until done, return image URL."""
        url = api_url.rstrip('/') + f'/api/tasks/{task_id}'
        deadline = time.time() + timeout

        while time.time() < deadline:
            req = urllib.request.Request(
                url,
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
                raise RuntimeError("Task succeeded but no output URL")
            elif status in ('FAILED', 'CANCELLED'):
                raise RuntimeError(f"Image task {status.lower()}: {result.get('error', '')}")

            time.sleep(5)

        raise TimeoutError(f"Image task {task_id} timed out after {timeout}s")

    # ------------------------------------------------------------------
    # State helpers
    # ------------------------------------------------------------------

    def _update_status(self, storyboard_id, status):
        data = self._load_storyboard(storyboard_id)
        if data:
            data['status'] = status
            data['updated_at'] = self.now_iso()
            self._save_storyboard(storyboard_id, data)

    def _mark_error(self, storyboard_id, message):
        data = self._load_storyboard(storyboard_id)
        if data:
            data['status'] = 'error'
            data['error_message'] = message
            data['updated_at'] = self.now_iso()
            self._save_storyboard(storyboard_id, data)

    def _update_panel(self, storyboard_id, panel_id, updates):
        data = self._load_storyboard(storyboard_id)
        if data:
            for p in data['panels']:
                if p['panel_id'] == panel_id:
                    p.update(updates)
                    break
            data['updated_at'] = self.now_iso()
            self._save_storyboard(storyboard_id, data)
