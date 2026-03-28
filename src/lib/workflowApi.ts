/**
 * Workflow API client functions.
 * All requests go to /api/workflow/* which are handled by server.py.
 */

import type {
  WfScript,
  WfCharacter,
  WfStoryboard,
  WfPanel,
  WfVideoTask,
  WfWorkflowStatus,
} from '@/types/workflow';

const BASE = '/api/workflow';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`API ${path}: ${res.status} ${err}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Script
// ---------------------------------------------------------------------------

export interface GenerateScriptParams {
  project_id: string;
  genre: string;
  theme: string;
  characters_count: number;
  episodes_count: number;
}

export function wfGenerateScript(params: GenerateScriptParams): Promise<{ script_id: string }> {
  return apiFetch<{ script_id: string }>('/script/generate', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function wfGetScript(scriptId: string): Promise<WfScript> {
  return apiFetch<WfScript>(`/script/${scriptId}`);
}

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

export interface CreateCharacterParams {
  project_id: string;
  name: string;
  personality: string;
  appearance_desc: string;
  role_type: string;
}

export function wfCreateCharacter(params: CreateCharacterParams): Promise<{ character_id: string }> {
  return apiFetch<{ character_id: string }>('/character/create', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function wfGetCharacter(characterId: string): Promise<WfCharacter> {
  return apiFetch<WfCharacter>(`/character/${characterId}`);
}

export function wfListCharacters(projectId: string): Promise<WfCharacter[]> {
  return apiFetch<WfCharacter[]>(`/character/list/${projectId}`);
}

// ---------------------------------------------------------------------------
// Storyboard
// ---------------------------------------------------------------------------

export interface GenerateStoryboardParams {
  project_id: string;
  script_id: string;
  episode_num: number;
  style: string;
}

export function wfGenerateStoryboard(params: GenerateStoryboardParams): Promise<{ storyboard_id: string }> {
  return apiFetch<{ storyboard_id: string }>('/storyboard/generate', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function wfGetStoryboard(storyboardId: string): Promise<WfStoryboard> {
  return apiFetch<WfStoryboard>(`/storyboard/${storyboardId}`);
}

export function wfRegeneratePanel(panelId: string): Promise<WfPanel> {
  return apiFetch<WfPanel>(`/storyboard/panel/${panelId}/regenerate`, {
    method: 'POST',
  });
}

// ---------------------------------------------------------------------------
// Video composition
// ---------------------------------------------------------------------------

export interface ComposeVideoParams {
  project_id: string;
  storyboard_id: string;
  voice_config: {
    speaker: string;
    speed: number;
  };
}

export function wfComposeVideo(params: ComposeVideoParams): Promise<{ video_task_id: string }> {
  return apiFetch<{ video_task_id: string }>('/video/compose', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function wfGetVideoTask(taskId: string): Promise<WfVideoTask> {
  return apiFetch<WfVideoTask>(`/video/task/${taskId}`);
}

// ---------------------------------------------------------------------------
// Workflow status
// ---------------------------------------------------------------------------

export function wfGetWorkflowStatus(projectId: string): Promise<WfWorkflowStatus> {
  return apiFetch<WfWorkflowStatus>(`/status/${projectId}`);
}
