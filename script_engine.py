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
            'characters': [],
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
                
                # Update with generated content
                script_data.update({
                    'status': 'completed',
                    'title': script_content['title'],
                    'synopsis': script_content['synopsis'],
                    'characters': script_content['characters'],
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
        system_prompt = """You are a professional screenwriter specializing in comedy drama. Generate a complete script in JSON format with the following structure:

{
  "title": "Script Title",
  "synopsis": "Brief synopsis (minimum 20 words)",
  "characters": [
    {
      "name": "Character Name",
      "role": "protagonist|antagonist|supporting|comic_relief",
      "personality": "Detailed personality description (minimum 20 words)",
      "appearance_description": "Detailed visual description for image generation (minimum 50 words, include hair color/style, clothing, body build, facial features, distinctive characteristics)"
    }
  ],
  "episodes": [
    {
      "episode_number": 1,
      "title": "Episode Title",
      "scenes": [
        {
          "scene_number": 1,
          "location": "Location name",
          "time_of_day": "morning|afternoon|evening|night",
          "action_description": "What happens in the scene (minimum 20 words)",
          "dialogue": [
            {
              "character_name": "Character Name",
              "emotion": "neutral|happy|sad|angry|surprised|thinking|shy",
              "text": "Dialogue text (minimum 5 words)"
            }
          ],
          "panel_suggestions": [
            {
              "suggested_shot_type": "close-up|medium|full-body|wide|establishing",
              "description": "Shot description (minimum 15 words)"
            }
          ]
        }
      ]
    }
  ]
}

IMPORTANT: Return ONLY valid JSON. Do not include markdown code blocks or explanatory text."""

        user_prompt = f"""Generate a {genre} script with the following parameters:

Theme: {theme}
Number of Characters: {characters_count}
Number of Episodes: {episodes_count}

Create detailed, engaging content with:
- {characters_count} unique characters with distinct personalities and visual descriptions
- {episodes_count} episode(s), each with at least 3 scenes
- Each scene should have at least 2 dialogue exchanges
- Each scene should have 2-3 panel suggestions

Return the complete script as a JSON object matching the schema provided."""

        # Prepare API request
        url = f"{self.config['base_url']}/messages"
        headers = {
            'Content-Type': 'application/json',
            'x-api-key': self.config['api_key'],
            'anthropic-version': '2023-06-01'
        }
        
        data = {
            'model': 'claude-opus-4-20250514',
            'max_tokens': 8000,
            'system': system_prompt,
            'messages': [
                {'role': 'user', 'content': user_prompt}
            ]
        }
        
        # Make request
        req = urllib.request.Request(
            url,
            data=json.dumps(data).encode(),
            headers=headers,
            method='POST'
        )
        
        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode())
            return result['content'][0]['text']
    
    def _parse_script_response(self, response):
        """Parse LLM response and extract JSON, handling markdown code blocks."""
        # Try to extract JSON from markdown code blocks
        response = response.strip()
        
        # Check for markdown code blocks
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
        
        # Parse JSON
        script_data = json.loads(response)
        
        # Basic validation
        if 'title' not in script_data or not script_data['title']:
            raise ValueError('Script missing title')
        if 'synopsis' not in script_data or not script_data['synopsis']:
            raise ValueError('Script missing synopsis')
        if 'characters' not in script_data or not isinstance(script_data['characters'], list):
            raise ValueError('Script missing characters array')
        if 'episodes' not in script_data or not isinstance(script_data['episodes'], list):
            raise ValueError('Script missing episodes array')
        
        return script_data
    
    def _save_script(self, script_id, script_data):
        """Save script data to file."""
        script_path = self.scripts_dir / f"{script_id}.json"
        with open(script_path, 'w', encoding='utf-8') as f:
            json.dump(script_data, f, indent=2, ensure_ascii=False)
    
    def _load_script(self, script_id):
        """Load script data from file."""
        script_path = self.scripts_dir / f"{script_id}.json"
        if not script_path.exists():
            return None
        with open(script_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    
    def get_script(self, script_id):
        """Get script by ID."""
        return self._load_script(script_id)
