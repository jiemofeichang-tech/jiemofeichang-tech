/**
 * Workflow TypeScript type definitions for AI Comic Drama generation.
 * Matches the Python backend models in script_engine.py, character_factory.py,
 * storyboard_generator.py, and video_composer.py.
 */

// ---------------------------------------------------------------------------
// Script types
// ---------------------------------------------------------------------------

export interface WfDialogue {
  character: string;
  line: string;
  emotion: string;
}

export interface WfScene {
  scene_id: string;
  location: string;
  characters: string[];
  action: string;
  dialogue: WfDialogue[];
  panel_suggestion: string;
}

export interface WfEpisode {
  ep_num: number;
  title: string;
  scenes: WfScene[];
}

export interface WfScriptCharacter {
  name: string;
  role: string;
  personality: string;
  appearance: string;
}

export interface WfScript {
  script_id: string;
  project_id: string;
  title: string;
  synopsis: string;
  genre: string;
  theme: string;
  characters: WfScriptCharacter[];
  episodes: WfEpisode[];
}

// ---------------------------------------------------------------------------
// Character types
// ---------------------------------------------------------------------------

export type CharacterViewKey = 'front' | 'side' | 'back';
export type CharacterExpressionKey = 'happy' | 'sad' | 'angry' | 'surprised' | 'thinking' | 'shy';
export type CharacterImageKey = CharacterViewKey | CharacterExpressionKey;

export type CharacterStatus = 'pending' | 'generating' | 'done' | 'error';

export interface WfCharacter {
  character_id: string;
  project_id: string;
  name: string;
  personality: string;
  appearance_desc: string;
  role_type: string;
  status: CharacterStatus;
  tasks: Record<CharacterImageKey, string>;   // task_id per image slot
  images: Record<CharacterImageKey, string>;  // image_url per image slot
}

// ---------------------------------------------------------------------------
// Storyboard types
// ---------------------------------------------------------------------------

export type PanelStatus = 'pending' | 'generating' | 'done' | 'error';

export type ShotType = 'close_up' | 'medium' | 'full' | 'wide' | 'extreme_close_up' | 'aerial';
export type CameraAngle = 'eye_level' | 'low_angle' | 'high_angle' | 'dutch_angle';

export interface WfPanel {
  panel_id: string;
  scene_id: string;
  shot_type: ShotType;
  camera_angle: CameraAngle;
  image_prompt: string;
  dialogue_ref: string;
  duration_sec: number;
  task_id?: string;
  status: PanelStatus;
  image_url?: string;
}

export interface WfStoryboard {
  storyboard_id: string;
  project_id: string;
  script_id: string;
  episode_num: number;
  style: string;
  panels: WfPanel[];
}

// ---------------------------------------------------------------------------
// Video task types
// ---------------------------------------------------------------------------

export type VideoTaskStatus = 'processing' | 'done' | 'error';

export interface WfVideoTask {
  video_task_id: string;
  project_id: string;
  storyboard_id: string;
  status: VideoTaskStatus;
  progress: number;   // 0-100
  output_url?: string;
}

// ---------------------------------------------------------------------------
// Workflow status (aggregated state for the frontend)
// ---------------------------------------------------------------------------

export interface WfStepStatus {
  done: boolean;
  id?: string;       // id of the resource (script_id, etc.)
  count?: number;    // for characters: how many are done
  total?: number;    // for characters: how many total
}

export interface WfWorkflowStatus {
  project_id: string;
  steps: {
    script: WfStepStatus;
    characters: WfStepStatus;
    storyboard: WfStepStatus;
    video: WfStepStatus;
  };
}
