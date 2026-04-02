"""
Script Generation Engine
Handles LLM-powered script generation with structured JSON output.
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

from mysql_storage import get_storage


class ScriptEngine:
    """Engine for generating comedy drama scripts using LLM."""
    
    def __init__(self, config):
        """Initialize the script engine with API configuration."""
        self.config = config
        self.scripts_dir = Path('data/scripts')
        self.scripts_dir.mkdir(parents=True, exist_ok=True)
    
    @staticmethod
    def generate_id(prefix):
        """Generate unique ID with format: {prefix}_{timestamp}_{random6}"""
        timestamp = datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')
        random_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
        return f"{prefix}_{timestamp}_{random_suffix}"
    
    @staticmethod
    def now_iso():
        """Return current timestamp in ISO 8601 format."""
        return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    
    def generate_script(self, project_id, genre, theme, characters_count, episodes_count):
        """
        Initiate script generation asynchronously.
        Returns script_id immediately and generates in background thread.
        """
        script_id = self.generate_id('script')
        
        # Create initial script file with pending status
        script_data = {
            'script_id': script_id,
            'project_id': project_id,
            'genre': genre,
            'theme': theme,
            'characters_count': characters_count,
            'episodes_count': episodes_count,
            'status': 'pending',
            'title': None,
            'synopsis': None,
            'story_bible': {},
            'characters': [],
            'scenes': [],
            'episodes': [],
            'error_message': None,
            'created_at': self.now_iso(),
            'updated_at': self.now_iso()
        }
        
        self._save_script(script_id, script_data)
        
        # Start background thread for generation
        thread = threading.Thread(
            target=self._generate_script_worker,
            args=(script_id, project_id, genre, theme, characters_count, episodes_count),
            name=f"script_gen_{script_id}",
            daemon=False
        )
        thread.start()
        
        return script_id
    
    def _generate_script_worker(self, script_id, project_id, genre, theme, characters_count, episodes_count):
        """Background worker thread for script generation."""
        max_attempts = 3
        
        for attempt in range(1, max_attempts + 1):
            try:
                # Update status
                script_data = self._load_script(script_id)
                script_data['status'] = 'generating'
                script_data['updated_at'] = self.now_iso()
                self._save_script(script_id, script_data)
                
                # Generate script via LLM
                generated = self._call_llm_for_script(genre, theme, characters_count, episodes_count)
                
                # Parse and validate
                script_content = self._parse_script_response(generated)
                
                # Update with generated content — persist all top-level fields
                script_data.update({
                    'status': 'completed',
                    'title': script_content['title'],
                    'synopsis': script_content['synopsis'],
                    'story_bible': script_content.get('story_bible', {}),
                    'characters': script_content['characters'],
                    'scenes': script_content.get('scenes', []),
                    'episodes': script_content['episodes'],
                    'updated_at': self.now_iso()
                })
                self._save_script(script_id, script_data)
                
                print(f"[ScriptEngine] Successfully generated script {script_id}")
                return
                
            except urllib.error.HTTPError as e:
                # Handle HTTP errors
                if e.code == 401:
                    # Authentication error - don't retry
                    script_data = self._load_script(script_id)
                    script_data['status'] = 'failed'
                    script_data['error_message'] = 'Authentication failed: check API key configuration'
                    script_data['updated_at'] = self.now_iso()
                    self._save_script(script_id, script_data)
                    print(f"[ScriptEngine] Authentication failed for script {script_id}")
                    return
                elif e.code in [429, 503]:
                    # Rate limit or service unavailable - wait and retry
                    print(f"[ScriptEngine] Attempt {attempt}/{max_attempts} failed with {e.code}, waiting 5s...")
                    time.sleep(5)
                    continue
                else:
                    # Other HTTP errors
                    error_msg = f"HTTP error {e.code}: {str(e)}"
                    if attempt == max_attempts:
                        script_data = self._load_script(script_id)
                        script_data['status'] = 'failed'
                        script_data['error_message'] = f'Script generation failed after {max_attempts} attempts: {error_msg}'
                        script_data['updated_at'] = self.now_iso()
                        self._save_script(script_id, script_data)
                        print(f"[ScriptEngine] Failed script {script_id} after {max_attempts} attempts")
                        return
                    print(f"[ScriptEngine] Attempt {attempt}/{max_attempts} failed: {error_msg}")
                    time.sleep(2)
                    
            except urllib.error.URLError as e:
                # Connection timeout or network error
                error_msg = 'LLM API connection timeout'
                if attempt == max_attempts:
                    script_data = self._load_script(script_id)
                    script_data['status'] = 'failed'
                    script_data['error_message'] = error_msg
                    script_data['updated_at'] = self.now_iso()
                    self._save_script(script_id, script_data)
                    print(f"[ScriptEngine] Connection timeout for script {script_id}")
                    return
                print(f"[ScriptEngine] Attempt {attempt}/{max_attempts}: Connection error, retrying...")
                time.sleep(2)
                
            except Exception as e:
                # Generic error - retry
                error_msg = str(e)
                if attempt == max_attempts:
                    script_data = self._load_script(script_id)
                    script_data['status'] = 'failed'
                    script_data['error_message'] = f'Script generation failed after {max_attempts} attempts: {error_msg}'
                    script_data['updated_at'] = self.now_iso()
                    self._save_script(script_id, script_data)
                    print(f"[ScriptEngine] Failed script {script_id} after {max_attempts} attempts: {error_msg}")
                    return
                print(f"[ScriptEngine] Attempt {attempt}/{max_attempts} failed: {error_msg}")
                time.sleep(2)
    
    def _call_llm_for_script(self, genre, theme, characters_count, episodes_count):
        """Call LLM API to generate script content."""
        system_prompt = """You are a professional screenwriter and visual consistency architect.

Your task: generate a PRODUCTION BIBLE — the single source of truth for all downstream image generation. You produce the archives (story_bible, characters, scenes) and the narrative structure (episode beats). You do NOT produce per-panel image prompts; downstream code will assemble those by referencing your archives.

Return a JSON object with the structure below. Field comments after // explain what is expected.

{
  "title": "Script title",
  "synopsis": "20+ word synopsis",

  "story_bible": {
    "genre": "e.g. cyberpunk thriller",
    "era": "e.g. 2077 Neo-Tokyo",
    "art_style": "English keyword string for image generation, e.g. anime cel-shading style, detailed illustration, clean lineart",
    "color_palette": "master palette keywords, e.g. cold blue shadows, neon cyan and pink accents, warm amber highlights",
    "lighting_style": "global lighting keywords, e.g. cinematic side lighting, strong rim light, film noir shadows",
    "tone": "e.g. oppressive yet warm",
    "theme": "core theme in one sentence",
    "world_rules": ["rule 1", "rule 2"]
  },

  "characters": [
    // IMPORTANT: If a character is an animal, creature, spirit, monster, or any non-human entity,
    // the appearance fields MUST describe its actual non-human form (e.g. a sparrow should be described as a small bird with brown feathers, not as a human).
    // Only describe humanoid appearance for characters that are actually human or humanoid in the story.
    {
      "id": "char_01",
      "name": "Display Name",
      "name_en": "English name for prompts",
      "role": "protagonist|antagonist|supporting|comic_relief",
      "species": "human|animal|spirit|creature — specify actual species if non-human (e.g. sparrow, fox, dragon)",
      "personality": "20+ word personality description",
      "speaking_style": "e.g. cold and terse",
      "appearance": {
        // For non-human characters (animals, creatures, spirits): describe their actual animal/creature form instead of human features.
        // e.g. for a sparrow: face="small round head, black bead-like eyes, short pointed beak", body="tiny 14cm bird, round body, brown and grey feathers", etc.
        "face": "face shape, eye color+shape, eyebrow, jaw, skin tone, marks (or animal head/face features if non-human)",
        "hair": "exact color+tone, style, length, texture, accessories (or fur/feathers/scales if non-human)",
        "body": "height cm, build, posture (or animal body shape, size, coloring if non-human)",
        "clothing": "top (material+color), bottom, footwear, layers (omit or use 'none' for animals)",
        "accessories": "jewelry, weapons, bags — specific (omit or use 'none' for animals)",
        "signature_traits": "2-3 identifiers visible in wide shots"
      },
      "appearance_description": "80+ word English paragraph combining ALL appearance fields into one continuous image-generation prompt prefix. Must be detailed enough to recreate the exact same character consistently across multiple images.",
      "visual_prompt_template": "Comma-separated English keywords optimized for character turnaround sheet generation. Must include: gender, age range, ethnicity/skin tone, face details, hair (color+style+length), body type (height+build), complete outfit description (top+bottom+shoes), accessories, and 2-3 signature visual traits. Example format: young Asian woman, early 20s, fair skin, oval face, large brown eyes, long straight black hair with bangs, petite 160cm slender build, white blouse with peter pan collar, navy pleated midi skirt, brown loafers, small gold stud earrings, red leather shoulder bag",
      "expression_library": {
        "neutral": "calm expression, relaxed brows, steady gaze",
        "happy": "bright eyes, natural smile, raised cheeks",
        "angry": "furrowed brows, clenched jaw, flared nostrils",
        "sad": "downcast eyes, drooping mouth, furrowed inner brows",
        "shocked": "wide eyes, raised brows, open mouth",
        "determined": "narrowed eyes, set jaw, forward lean",
        "thinking": "one brow raised, eyes upward, lips pursed",
        "shy": "averted eyes, slight blush, chin tucked"
      }
    }
  ],

  "scenes": [
    {
      "scene_id": "sc_01",
      "scene_name": "e.g. Lin's Apartment",
      "location": "location name",
      "type": "interior|exterior|virtual",
      "time_of_day": "morning|afternoon|evening|night",
      "mood": "tense|peaceful|chaotic|romantic|mysterious|humorous|melancholic|epic",
      "characters_present": ["char_01"],
      "environment_anchors": {
        "architecture": "style + materials, e.g. cramped cyberpunk apartment, low ceiling, exposed pipes",
        "key_objects": ["landmark 1", "landmark 2", "landmark 3"],
        "materials_textures": "dominant surfaces, e.g. concrete walls, metallic, cracked asphalt",
        "ground_surface": "e.g. wet concrete floor with oil stains",
        "color_palette": "scene palette inheriting from story_bible",
        "lighting": "source + direction + temperature, e.g. dim monitor glow from left, cold neon from right window",
        "atmosphere": "keywords, e.g. claustrophobic, tech-cluttered"
      },
      "visual_prompt_template": "English keyword string combining ALL environment_anchors — used by code to build panel backgrounds",
      "variant_conditions": {
        "action": "atmosphere shift for tension (optional, omit if not applicable)",
        "emotional": "atmosphere shift for emotional beats (optional)"
      },
      "character_scene_notes": [
        {
          "character_id": "char_01",
          "emotional_state": "start → end arc, e.g. wary → trusting",
          "expression_key": "primary key from expression_library, e.g. determined",
          "clothing_change": "delta from base (e.g. jacket removed, blood on shirt) or same as base",
          "spatial_position": "fixed position, e.g. standing left of broken window, leaning on wall"
        }
      ]
    }
  ],

  "episodes": [
    {
      "episode_number": 1,
      "title": "Episode Title",
      "episode_scenes": ["sc_01", "sc_02", "sc_03"],
      "scenes": [
        {
          "scene_id": "sc_01",
          "description": "scene action summary for this episode",
          "dialogues": [{"character": "char_01", "text": "line"}]
        }
      ],
      "beats": [
        {
          "beat_number": 1,
          "scene_id": "sc_01",
          "emotion": "core emotion",
          "narrative_function": "setup|escalation|turning-point|climax|resolution|cliffhanger",
          "action_description": "20+ word description of what happens",
          "characters_involved": ["char_01"],
          "dialogue": [
            {
              "character_id": "char_01",
              "expression_key": "key from expression_library",
              "text": "dialogue text",
              "tone": "e.g. whispered, shouted, deadpan"
            }
          ],
          "suggested_shots": [
            {
              "shot_size": "wide|medium|close-up|extreme-close-up",
              "focal_length": "24mm|50mm|85mm|135mm",
              "composition": "rule-of-thirds|center|diagonal|frame-within-frame",
              "camera_movement": "static|push-in|pull-back|pan|tracking|whip-pan|handheld",
              "char_refs": ["char_01"],
              "action": "what the character is doing",
              "lighting_shift": "any shift from scene base lighting, or null",
              "transition": "hard-cut|dissolve|match-cut|fade",
              "narrative_purpose": "why this shot exists"
            }
          ]
        }
      ]
    }
  ]
}

RULES:
1. NO text/subtitles/watermarks/speech-bubbles in any visual description
2. NO music references in visual descriptions
3. NO prologues or narrated introductions — story starts with action
4. visual_prompt_template for characters = complete English image prompt prefix; downstream code copies this into every panel
5. visual_prompt_template for scenes = complete English environment prompt; downstream code copies this into every panel
6. expression_library: each value is a precise English facial description; downstream code selects by key
7. Protagonists: fill all 8 expression keys. Supporting characters: fill neutral + 2-3 that the story actually uses
8. variant_conditions: only fill variants the story actually uses; omit unused ones
9. character_scene_notes.clothing_change: if a character is injured/dirtied in scene N, ALL subsequent scenes must reflect the damage unless explicitly healed/changed
10. Time-of-day progression must be logical across episodes (morning → afternoon → evening)
11. environment_anchors.key_objects: exactly 3 landmark objects per scene; these will be tracked as recurring props

CRITICAL STORY STRUCTURE RULES:
12. Each episode MUST have a UNIQUE central conflict and resolution — NO two episodes may share the same dramatic question
13. Episodes must form a clear narrative arc: Episode 1 = setup/introduction, middle episodes = escalation/complications, final episode = climax/resolution
14. Each episode's opening scene MUST be visually and narratively DIFFERENT from other episodes' openings — different location, different time of day, different character state
15. Across episodes, characters must EVOLVE: their emotional state, relationships, skills, and circumstances must visibly change
16. NEVER repeat the same scene setup across episodes (e.g., "character stands at door" cannot appear as the opening of multiple episodes)
17. Each episode's suggested_shots must depict UNIQUE actions — if Episode 1 shows "character enters the shop", Episode 2 must NOT show the same entrance again
18. The story must PROGRESS: new information, new challenges, new character dynamics in every episode

IMPORTANT: Return ONLY valid JSON. No markdown code blocks. No explanatory text."""

        user_prompt = f"""Generate a {genre} production bible:

Theme: {theme}
Characters: {characters_count}
Episodes: {episodes_count}

Requirements:
- story_bible: art_style, color_palette, lighting_style as English keyword strings for image generation
- {characters_count} characters with full appearance object + visual_prompt_template + expression_library
- Minimum 3 scenes per episode with environment_anchors + visual_prompt_template + character_scene_notes
- {episodes_count} episode(s), each with 3-6 narrative beats
- Each beat has: scene_id, emotion, characters_involved, dialogue with expression_keys, and 1-3 suggested_shots (shot_size, focal_length, composition, camera_movement, action, transition, narrative_purpose)
- suggested_shots are lightweight — downstream code will build full image prompts by assembling character and scene templates
- Clothing damage, environmental damage, and prop state changes must accumulate across scenes

CRITICAL — Episode Differentiation:
- Each episode MUST tell a different chapter of the story with unique conflicts and new situations
- Episode 1: introduce characters and world. Episode 2+: escalate conflict, introduce new challenges. Final episode: climax and resolution
- NO two episodes may open with the same scene or similar character entrance
- Each episode's scenes must feature DIFFERENT actions, locations, or time periods from other episodes
- Characters must show visible emotional/physical changes across episodes (e.g., growing confidence, new injuries, changed clothing)
- suggested_shots across episodes must depict UNIQUE moments — absolutely NO recycling of the same camera setup + action combination

Return JSON only."""

        # Prepare API request (OpenAI Chat Completions 兼容格式)
        url = self.config.get('ai_chat_base') or self.config.get('base_url', '')
        if not url.endswith('/chat/completions'):
            url = url.rstrip('/') + '/chat/completions' if '/v1' in url else url
        api_key = self.config.get('ai_chat_key') or self.config.get('api_key', '')
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {api_key}',
        }

        data = {
            'model': self.config.get('model', 'gemini-2.5-pro'),
            'max_tokens': 16000,
            'messages': [
                {'role': 'user', 'content': f"[System Instructions]\n{system_prompt}\n\n[User Request]\n{user_prompt}"},
            ]
        }

        req = urllib.request.Request(
            url,
            data=json.dumps(data).encode(),
            headers=headers,
            method='POST'
        )

        # 绕过系统代理，避免 SSL 握手失败
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(req, timeout=300) as response:
            result = json.loads(response.read().decode())
            return result['choices'][0]['message']['content']
    
    def _parse_script_response(self, response):
        """Parse LLM response and extract JSON, handling markdown code blocks."""
        response = response.strip()

        if '```json' in response:
            start = response.find('```json') + 7
            end = response.find('```', start)
            if end != -1:
                response = response[start:end].strip()
        elif '```' in response:
            start = response.find('```') + 3
            end = response.find('```', start)
            if end != -1:
                response = response[start:end].strip()

        script_data = json.loads(response)

        # --- required top-level fields ---
        if not script_data.get('title'):
            raise ValueError('Script missing title')
        if not script_data.get('synopsis'):
            raise ValueError('Script missing synopsis')
        if not isinstance(script_data.get('characters'), list) or not script_data['characters']:
            raise ValueError('Script missing characters array')
        if not isinstance(script_data.get('episodes'), list) or not script_data['episodes']:
            raise ValueError('Script missing episodes array')

        # --- character archive validation ---
        for char in script_data['characters']:
            name = char.get('name', '?')
            if not char.get('visual_prompt_template'):
                raise ValueError(f"Character '{name}' missing visual_prompt_template")
            if not char.get('expression_library'):
                raise ValueError(f"Character '{name}' missing expression_library")
            # Ensure appearance_description exists for downstream compatibility
            if not char.get('appearance_description') and char.get('visual_prompt_template'):
                char['appearance_description'] = char['visual_prompt_template']

        # --- scene archive validation ---
        for scene in script_data.get('scenes', []):
            sid = scene.get('scene_id', '?')
            if not scene.get('visual_prompt_template'):
                raise ValueError(f"Scene '{sid}' missing visual_prompt_template")
            if not scene.get('environment_anchors'):
                raise ValueError(f"Scene '{sid}' missing environment_anchors")

        # --- episode/beat validation (lightweight — no panels to check) ---
        for ep in script_data['episodes']:
            if not ep.get('beats') and not ep.get('scenes'):
                raise ValueError(f"Episode {ep.get('episode_number', '?')} has no beats and no scenes")

        # --- Frontend compatibility mapping ---
        # Frontend ScriptAnalysis expects different field names than production bible schema.
        # Map backend fields → frontend fields while preserving originals for backend consumers.

        # Characters: visual_prompt_template → three_view_prompts, expression_library → expression_prompts
        for char in script_data['characters']:
            vpt = char.get('visual_prompt_template', '')
            if vpt and not char.get('three_view_prompts'):
                char['three_view_prompts'] = {'front': vpt, 'side': vpt, 'back': vpt}
            el = char.get('expression_library', {})
            if el and not char.get('expression_prompts'):
                char['expression_prompts'] = el
            # Map id → char_id for frontend
            if char.get('id') and not char.get('char_id'):
                char['char_id'] = char['id']
            # Ensure costume field exists (frontend expects separate costume object)
            if not char.get('costume') and char.get('appearance', {}).get('clothing'):
                char['costume'] = {'main': char['appearance']['clothing']}
                if char['appearance'].get('accessories'):
                    char['costume']['accessories'] = char['appearance']['accessories']

        # Scenes: visual_prompt_template → six_view_prompts, environment_anchors → environment/lighting
        for scene in script_data.get('scenes', []):
            vpt = scene.get('visual_prompt_template', '')
            if vpt and not scene.get('six_view_prompts'):
                scene['six_view_prompts'] = {
                    'front': vpt, 'left': vpt, 'right': vpt,
                    'back': vpt, 'top': vpt, 'detail': vpt
                }
            anchors = scene.get('environment_anchors', {})
            if anchors and not scene.get('environment'):
                scene['environment'] = anchors
            if not scene.get('name'):
                scene['name'] = scene.get('scene_name', scene.get('scene_id', ''))
            if not scene.get('description'):
                scene['description'] = scene.get('location', '')
            if not scene.get('lighting') and anchors.get('lighting'):
                scene['lighting'] = {'main': anchors['lighting']}
            if not scene.get('color_grading') and anchors.get('color_palette'):
                scene['color_grading'] = anchors['color_palette']

        # Episodes: flatten beats.suggested_shots → scenes.shots for frontend
        # CRITICAL: shots must follow BEAT ORDER (narrative order), not scene grouping
        for ep in script_data['episodes']:
            # Map episode_number → episode_id
            if ep.get('episode_number') and not ep.get('episode_id'):
                ep['episode_id'] = ep['episode_number']

            # Ensure scene_ref exists on all ep scenes
            for ep_scene in ep.get('scenes', []):
                sid = ep_scene.get('scene_id', '')
                if not ep_scene.get('scene_ref'):
                    ep_scene['scene_ref'] = sid

            # Build shots in BEAT ORDER (narrative chronological sequence)
            if ep.get('beats'):
                # First: collect ALL shots in beat order into a single flat list
                all_shots_in_order = []
                for beat in ep.get('beats', []):
                    beat_sid = beat.get('scene_id', '')
                    beat_emotion = beat.get('emotion', '')
                    for ss in beat.get('suggested_shots', []):
                        all_shots_in_order.append({
                            'shot_type': ss.get('shot_size', 'medium'),
                            'subject': ', '.join(ss.get('char_refs', [])),
                            'action': ss.get('action', ''),
                            'camera_movement': ss.get('camera_movement', 'static'),
                            'duration': '2-4s',
                            'lighting_note': ss.get('lighting_shift'),
                            'composition': ss.get('composition', ''),
                            'optics': ss.get('focal_length', ''),
                            'transition': ss.get('transition', ''),
                            '_scene_id': beat_sid,
                            '_emotion': beat_emotion,
                            '_narrative_order': len(all_shots_in_order),
                        })

                # Create a single virtual scene that contains ALL shots in narrative order
                # This ensures the frontend renders shots in story sequence, not scene grouping
                narrative_scene = {
                    'scene_id': f"ep{ep.get('episode_id', '?')}_narrative",
                    'scene_ref': ep.get('scenes', [{}])[0].get('scene_id', 'sc_01') if ep.get('scenes') else 'sc_01',
                    'emotion': all_shots_in_order[0].get('_emotion', '') if all_shots_in_order else '',
                    'shots': all_shots_in_order,
                }

                # Collect dialogues from all beats in order
                dlgs = []
                for beat in ep.get('beats', []):
                    for d in beat.get('dialogue', []):
                        dlgs.append({
                            'character': d.get('character_id', ''),
                            'text': d.get('text', ''),
                            'emotion': d.get('expression_key', ''),
                            'duration_hint': ''
                        })
                if dlgs:
                    narrative_scene['dialogues'] = dlgs

                # Replace episode scenes with single narrative-ordered scene
                ep['scenes'] = [narrative_scene]

        # Ensure top-level fields frontend expects
        if not script_data.get('genre'):
            script_data['genre'] = script_data.get('story_bible', {}).get('genre', '')
        if not script_data.get('style'):
            script_data['style'] = script_data.get('story_bible', {}).get('art_style', '')
        if not script_data.get('visual_style_guide') and script_data.get('story_bible'):
            script_data['visual_style_guide'] = script_data['story_bible']

        return script_data
    
    def _save_script(self, script_id, script_data):
        """Save script data to MySQL."""
        get_storage().upsert_document(
            "script",
            script_id,
            script_data,
            project_id=script_data.get("project_id"),
            status=script_data.get("status"),
            title=script_data.get("title"),
            created_at=script_data.get("created_at"),
            updated_at=script_data.get("updated_at"),
        )

    def _load_script(self, script_id):
        """Load script data from MySQL."""
        return get_storage().get_document("script", script_id)
    
    def get_script(self, script_id):
        """Get script by ID."""
        return self._load_script(script_id)
