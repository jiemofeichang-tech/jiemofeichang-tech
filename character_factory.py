"""
Character Factory Module
Handles character asset generation with 9 assets per character.
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


class CharacterFactory:
    """Factory for generating character assets via image generation API."""
    
    # Asset types with their generation prompts
    ASSET_TYPES = {
        'front_view': {
            'type': 'view',
            'prompt_suffix': 'full body front view, standing pose, anime style, white background, high quality line art, character reference sheet'
        },
        'side_view': {
            'type': 'view',
            'prompt_suffix': 'full body side view, standing pose, anime style, white background, high quality line art, character reference sheet'
        },
        'back_view': {
            'type': 'view',
            'prompt_suffix': 'full body back view, standing pose, anime style, white background, high quality line art, character reference sheet'
        },
        'expression_happy': {
            'type': 'expression',
            'prompt_suffix': 'portrait, happy expression, joyful smile, anime style, white background, high quality line art, facial expression reference'
        },
        'expression_sad': {
            'type': 'expression',
            'prompt_suffix': 'portrait, sad expression, downcast eyes, anime style, white background, high quality line art, facial expression reference'
        },
        'expression_angry': {
            'type': 'expression',
            'prompt_suffix': 'portrait, angry expression, furrowed brows, anime style, white background, high quality line art, facial expression reference'
        },
        'expression_surprised': {
            'type': 'expression',
            'prompt_suffix': 'portrait, surprised expression, wide eyes, anime style, white background, high quality line art, facial expression reference'
        },
        'expression_thinking': {
            'type': 'expression',
            'prompt_suffix': 'portrait, thinking expression, contemplative look, anime style, white background, high quality line art, facial expression reference'
        },
        'expression_shy': {
            'type': 'expression',
            'prompt_suffix': 'portrait, shy expression, blushing, anime style, white background, high quality line art, facial expression reference'
        }
    }
    
    def __init__(self, config):
        """Initialize the character factory with API configuration."""
        self.config = config
        self.characters_dir = Path('data/characters')
        self.characters_dir.mkdir(parents=True, exist_ok=True)
        
        # Track active polling threads
        self.active_threads = {}
        self.thread_lock = threading.Lock()
    
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
    
    def generate_from_script(self, script):
        """
        Generate character assets for all characters in a script.
        Returns list of character_ids.
        """
        character_ids = []
        
        for char_data in script.get('characters', []):
            character_id = self.generate_id('character')
            
            # Create initial character data
            character = {
                'character_id': character_id,
                'name': char_data.get('name', ''),
                'project_id': script.get('project_id', ''),
                'script_id': script.get('script_id', ''),
                'personality': char_data.get('personality', ''),
                'appearance_description': char_data.get('appearance_description', ''),
                'role': char_data.get('role', ''),
                'generation_status': 'pending',
                'assets': {},
                'created_at': self.now_iso(),
                'updated_at': self.now_iso()
            }
            
            # Initialize all 9 assets
            for asset_key, asset_config in self.ASSET_TYPES.items():
                prompt = self._build_asset_prompt(
                    char_data.get('appearance_description', ''),
                    asset_config['prompt_suffix']
                )
                character['assets'][asset_key] = {
                    'asset_type': asset_key,
                    'task_id': None,
                    'status': 'pending',
                    'image_url': None,
                    'prompt': prompt,
                    'error_message': None,
                    'attempts': 0
                }
            
            self._save_character(character_id, character)
            character_ids.append(character_id)
            
            # Start asset generation in background
            thread = threading.Thread(
                target=self._generate_assets_worker,
                args=(character_id,),
                name=f"character_gen_{character_id}",
                daemon=False
            )
            thread.start()
        
        return character_ids
    
    def _build_asset_prompt(self, appearance_description, prompt_suffix):
        """Build complete prompt for asset generation."""
        return f"{appearance_description}. {prompt_suffix}"
    
    def _generate_assets_worker(self, character_id):
        """Background worker to generate all assets for a character."""
        try:
            character = self._load_character(character_id)
            if not character:
                return
            
            # Update status
            character['generation_status'] = 'generating'
            character['updated_at'] = self.now_iso()
            self._save_character(character_id, character)
            
            # Submit all asset generation tasks
            for asset_key in self.ASSET_TYPES.keys():
                self._submit_asset_generation(character_id, asset_key)
            
            # Start polling thread
            poll_thread = threading.Thread(
                target=self._poll_asset_status_worker,
                args=(character_id,),
                name=f"character_poll_{character_id}",
                daemon=False
            )
            
            with self.thread_lock:
                self.active_threads[character_id] = poll_thread
            
            poll_thread.start()
            
        except Exception as e:
            print(f"[CharacterFactory] Error in assets worker for {character_id}: {e}")
            character = self._load_character(character_id)
            if character:
                character['generation_status'] = 'failed'
                character['updated_at'] = self.now_iso()
                self._save_character(character_id, character)
    
    def _submit_asset_generation(self, character_id, asset_key, retry_count=0):
        """Submit single asset generation request to image API."""
        max_attempts = 3
        
        try:
            character = self._load_character(character_id)
            if not character:
                return
            
            asset = character['assets'][asset_key]
            asset['attempts'] = retry_count + 1
            asset['status'] = 'generating'
            character['updated_at'] = self.now_iso()
            self._save_character(character_id, character)
            
            # Call image generation API
            task_id = self._call_image_api(asset['prompt'])
            
            # Update with task_id
            asset['task_id'] = task_id
            character['updated_at'] = self.now_iso()
            self._save_character(character_id, character)
            
            print(f"[CharacterFactory] Submitted {asset_key} for {character_id}, task_id: {task_id}")
            
        except urllib.error.URLError as e:
            # Connection timeout
            character = self._load_character(character_id)
            if character:
                asset = character['assets'][asset_key]
                if retry_count + 1 >= max_attempts:
                    asset['status'] = 'failed'
                    asset['error_message'] = 'Image API connection timeout'
                    print(f"[CharacterFactory] Failed {asset_key} for {character_id} after {max_attempts} attempts")
                else:
                    asset['status'] = 'pending'
                    print(f"[CharacterFactory] Retry {retry_count + 1}/{max_attempts} for {asset_key}")
                    time.sleep(2)
                    self._submit_asset_generation(character_id, asset_key, retry_count + 1)
                character['updated_at'] = self.now_iso()
                self._save_character(character_id, character)
                
        except Exception as e:
            # Other errors
            character = self._load_character(character_id)
            if character:
                asset = character['assets'][asset_key]
                if retry_count + 1 >= max_attempts:
                    asset['status'] = 'failed'
                    asset['error_message'] = str(e)
                    print(f"[CharacterFactory] Failed {asset_key} for {character_id}: {e}")
                else:
                    asset['status'] = 'pending'
                    print(f"[CharacterFactory] Retry {retry_count + 1}/{max_attempts} for {asset_key}: {e}")
                    time.sleep(2)
                    self._submit_asset_generation(character_id, asset_key, retry_count + 1)
                character['updated_at'] = self.now_iso()
                self._save_character(character_id, character)
    
    def _call_image_api(self, prompt):
        """
        Call image generation API and return task_id.
        This is a mock implementation - replace with actual API call.
        """
        # For testing/demo purposes, we'll simulate an async API that returns task_id
        # In production, this would call the actual image API
        
        # Mock implementation that returns a fake task_id
        task_id = self.generate_id('task')
        
        # In a real implementation, you would do:
        # url = self.config['image_api_url'] + '/generate'
        # headers = {
        #     'Authorization': f"Bearer {self.config['image_api_key']}",
        #     'Content-Type': 'application/json'
        # }
        # data = {'prompt': prompt, 'style': 'anime'}
        # req = urllib.request.Request(url, data=json.dumps(data).encode(), headers=headers)
        # with urllib.request.urlopen(req, timeout=30) as response:
        #     result = json.loads(response.read().decode())
        #     return result['task_id']
        
        return task_id
    
    def _poll_asset_status_worker(self, character_id):
        """Background worker to poll asset generation status."""
        try:
            start_time = time.time()
            timeout_seconds = 30 * 60  # 30 minutes
            poll_interval = 10  # seconds
            
            while True:
                # Check timeout
                if time.time() - start_time > timeout_seconds:
                    print(f"[CharacterFactory] Polling timeout for {character_id}")
                    character = self._load_character(character_id)
                    if character:
                        for asset_key, asset in character['assets'].items():
                            if asset['status'] == 'generating':
                                asset['status'] = 'failed'
                                asset['error_message'] = 'Generation timeout after 30 minutes'
                        self._update_character_status(character)
                        self._save_character(character_id, character)
                    break
                
                # Load current character state
                character = self._load_character(character_id)
                if not character:
                    break
                
                # Check each generating asset
                has_generating = False
                for asset_key, asset in character['assets'].items():
                    if asset['status'] == 'generating' and asset['task_id']:
                        has_generating = True
                        # Poll status from API
                        status, image_url, error = self._check_task_status(asset['task_id'])
                        
                        if status == 'completed':
                            asset['status'] = 'completed'
                            asset['image_url'] = image_url
                            asset['error_message'] = None
                            print(f"[CharacterFactory] Completed {asset_key} for {character_id}")
                        elif status == 'failed':
                            asset['status'] = 'failed'
                            asset['error_message'] = error or 'Image generation failed'
                            # Retry if under max attempts
                            if asset['attempts'] < 3:
                                print(f"[CharacterFactory] Retrying {asset_key} for {character_id}")
                                asset['status'] = 'pending'
                                asset['task_id'] = None
                                self._save_character(character_id, character)
                                self._submit_asset_generation(character_id, asset_key, asset['attempts'])
                            else:
                                print(f"[CharacterFactory] Failed {asset_key} for {character_id} after retries")
                
                # Update character status
                self._update_character_status(character)
                character['updated_at'] = self.now_iso()
                self._save_character(character_id, character)
                
                # If no more generating assets, we're done
                if not has_generating:
                    print(f"[CharacterFactory] All assets completed for {character_id}")
                    break
                
                # Wait before next poll
                time.sleep(poll_interval)
            
            # Clean up thread reference
            with self.thread_lock:
                if character_id in self.active_threads:
                    del self.active_threads[character_id]
                    
        except Exception as e:
            print(f"[CharacterFactory] Error in polling worker for {character_id}: {e}")
            with self.thread_lock:
                if character_id in self.active_threads:
                    del self.active_threads[character_id]
    
    def _check_task_status(self, task_id):
        """
        Check status of an image generation task.
        Returns (status, image_url, error_message)
        
        This is a mock implementation - replace with actual API call.
        """
        # Mock implementation that simulates completion
        # In production, this would call the actual image API status endpoint
        
        # Simulate random completion for demo
        # In real implementation:
        # url = f"{self.config['image_api_url']}/status/{task_id}"
        # headers = {'Authorization': f"Bearer {self.config['image_api_key']}"}
        # req = urllib.request.Request(url, headers=headers)
        # with urllib.request.urlopen(req, timeout=10) as response:
        #     result = json.loads(response.read().decode())
        #     return result['status'], result.get('image_url'), result.get('error')
        
        # Mock: return completed with fake URL
        return ('completed', f'https://example.com/images/{task_id}.png', None)
    
    def _update_character_status(self, character):
        """Update overall character generation status based on asset statuses."""
        statuses = [asset['status'] for asset in character['assets'].values()]
        
        if all(status == 'completed' for status in statuses):
            character['generation_status'] = 'completed'
        elif all(status == 'failed' for status in statuses):
            character['generation_status'] = 'failed'
        elif any(status in ['pending', 'generating'] for status in statuses):
            character['generation_status'] = 'generating'
        else:
            # Some completed, some failed
            character['generation_status'] = 'partial'
    
    def _save_character(self, character_id, character_data):
        """Save character data to file."""
        char_path = self.characters_dir / f"{character_id}.json"
        with open(char_path, 'w', encoding='utf-8') as f:
            json.dump(character_data, f, indent=2, ensure_ascii=False)
    
    def _load_character(self, character_id):
        """Load character data from file."""
        char_path = self.characters_dir / f"{character_id}.json"
        if not char_path.exists():
            return None
        with open(char_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    
    def create_character(self, project_id, name, personality, appearance_desc, role_type, script_id=''):
        """
        Create and start generating a single character.
        Returns character_id immediately; asset generation runs in background.
        """
        character_id = self.generate_id('character')

        character = {
            'character_id': character_id,
            'name': name,
            'project_id': project_id,
            'script_id': script_id,
            'personality': personality,
            'appearance_description': appearance_desc,
            'role': role_type,
            'generation_status': 'pending',
            'assets': {},
            'created_at': self.now_iso(),
            'updated_at': self.now_iso(),
        }

        for asset_key, asset_config in self.ASSET_TYPES.items():
            prompt = self._build_asset_prompt(appearance_desc, asset_config['prompt_suffix'])
            character['assets'][asset_key] = {
                'asset_type': asset_key,
                'task_id': None,
                'status': 'pending',
                'image_url': None,
                'prompt': prompt,
                'error_message': None,
                'attempts': 0,
            }

        self._save_character(character_id, character)

        thread = threading.Thread(
            target=self._generate_assets_worker,
            args=(character_id,),
            name=f"character_gen_{character_id}",
            daemon=False,
        )
        thread.start()

        return character_id

    # ------------------------------------------------------------------
    # Frontend-compatible serializers
    # ------------------------------------------------------------------

    # Asset key mapping: internal → frontend key names
    _ASSET_KEY_MAP = {
        'front_view': 'front',
        'side_view': 'side',
        'back_view': 'back',
        'expression_happy': 'happy',
        'expression_sad': 'sad',
        'expression_angry': 'angry',
        'expression_surprised': 'surprised',
        'expression_thinking': 'thinking',
        'expression_shy': 'shy',
    }

    def _to_frontend_format(self, char_data):
        """Convert internal character data to the WfCharacter frontend format."""
        assets = char_data.get('assets', {})
        images = {}
        tasks = {}
        for internal_key, frontend_key in self._ASSET_KEY_MAP.items():
            asset = assets.get(internal_key, {})
            images[frontend_key] = asset.get('image_url') or ''
            tasks[frontend_key] = asset.get('task_id') or ''

        # Determine overall status
        gen_status = char_data.get('generation_status', 'pending')
        if gen_status == 'completed':
            status = 'done'
        elif gen_status in ('generating',):
            status = 'generating'
        elif gen_status == 'error':
            status = 'error'
        else:
            status = gen_status  # 'pending', etc.

        return {
            'character_id': char_data.get('character_id', ''),
            'project_id': char_data.get('project_id', ''),
            'name': char_data.get('name', ''),
            'personality': char_data.get('personality', ''),
            'appearance_desc': char_data.get('appearance_description', ''),
            'role_type': char_data.get('role', ''),
            'status': status,
            'tasks': tasks,
            'images': images,
        }

    def get_character(self, character_id):
        """Get character by ID in frontend-compatible format."""
        data = self._load_character(character_id)
        if data is None:
            return None
        return self._to_frontend_format(data)

    def list_characters(self, project_id):
        """List all characters for a project in frontend-compatible format."""
        characters = []

        for char_file in self.characters_dir.glob('*.json'):
            try:
                with open(char_file, 'r', encoding='utf-8') as f:
                    char_data = json.load(f)

                if char_data.get('project_id') == project_id:
                    characters.append(self._to_frontend_format(char_data))
            except Exception as e:
                print(f"[CharacterFactory] Error reading character file {char_file}: {e}")
                continue

        return characters
