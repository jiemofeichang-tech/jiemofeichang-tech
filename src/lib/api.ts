export interface TaskRecord {
  id: string;
  model?: string;
  status?: string;
  title?: string;
  content?: { video_url?: string };
  resolution?: string;
  ratio?: string;
  duration?: number;
  cost?: number;
  created_at?: string;
  updated_at?: string;
  tracked_at?: string;
  request_payload?: Record<string, unknown>;
  meta?: { title?: string; mode?: string };
  local_asset?: {
    task_id: string;
    title: string;
    saved_at: string;
    remote_url: string;
    local_url: string;
    download_url: string;
    filename: string;
    local_path: string;
    resolution?: string;
    ratio?: string;
    duration?: number;
  };
  local_asset_error?: string;
  proxy_meta?: { cost?: { total_cost?: number }; costs?: { CNY?: { total_cost?: number } } };
  _proxy?: { status?: number; videoUrls?: string[]; contentType?: string };
  progress?: number;
  progress_percent?: number;
  completed_percentage?: number;
  percentage?: number;
}

export interface AssetRecord {
  task_id: string;
  title: string;
  saved_at: string;
  source: string;
  remote_url: string;
  local_url: string;
  download_url: string;
  filename: string;
  local_path: string;
  resolution?: string;
  ratio?: string;
  duration?: number;
}

export interface ServerConfig {
  hasApiKey: boolean;
  userId: string;
  defaultModel: string;
  autoSave: boolean;
  storageDir: string;
  upstreamBase: string;
  modelHints: {
    resolution: string[];
    ratio: string[];
    duration: number[];
  };
}

export interface AuthUser {
  id: number;
  username: string;
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers as Record<string, string> || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `请求失败：${res.status}`);
  return data as T;
}

export function fetchConfig() {
  return api<ServerConfig>("/api/config");
}

export function createTask(payload: Record<string, unknown>, meta?: Record<string, unknown>) {
  return api<TaskRecord>("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ payload, meta }),
  });
}

export function queryTask(taskId: string) {
  return api<TaskRecord>(`/api/tasks/${taskId}`);
}

export function fetchHistory() {
  return api<{ tasks: TaskRecord[] }>("/api/history");
}

export function fetchLibrary() {
  return api<{ assets: AssetRecord[] }>("/api/library");
}

export function saveToLibrary(taskId: string) {
  return api<{ message: string; task: TaskRecord }>("/api/library/save", {
    method: "POST",
    body: JSON.stringify({ taskId }),
  });
}

export function updateSessionConfig(config: {
  apiKey?: string; userId?: string; defaultModel?: string; autoSave?: boolean;
  aiChatBase?: string; aiImageBase?: string; aiChatModel?: string; aiImageModel?: string;
}) {
  return api<{ hasApiKey: boolean; userId: string; defaultModel: string; autoSave: boolean; message: string }>("/api/session/key", {
    method: "POST",
    body: JSON.stringify(config),
  });
}

export function openStorage() {
  return api<{ message: string }>("/api/open-storage", { method: "POST" });
}

// --- 删除 / 回收站 / 收藏 ---

export function deleteTask(taskId: string) {
  return api<{ message: string }>(`/api/tasks/${taskId}`, { method: "DELETE" });
}

export function deleteLibraryAsset(taskId: string) {
  return api<{ message: string }>(`/api/library/${taskId}`, { method: "DELETE" });
}

export function fetchTrash() {
  return api<{ tasks: (TaskRecord & { trashed_at?: string })[]; assets: (AssetRecord & { trashed_at?: string })[] }>("/api/trash");
}

export function restoreFromTrash(type: "task" | "asset", id: string) {
  return api<{ message: string }>("/api/trash/restore", {
    method: "POST",
    body: JSON.stringify({ type, id }),
  });
}

export function emptyTrash() {
  return api<{ message: string }>("/api/trash/empty", { method: "POST" });
}

export function toggleFavorite(taskId: string) {
  return api<{ favorite: boolean; message: string }>(`/api/tasks/${taskId}/favorite`, { method: "POST" });
}

// --- Auth ---

export function authRegister(username: string, password: string) {
  return api<{ ok: boolean; user: AuthUser }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function authLogin(username: string, password: string) {
  return api<{ ok: boolean; user: AuthUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function authLogout() {
  return api<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}

export async function authMe(): Promise<{ ok: boolean; user?: AuthUser }> {
  try {
    const res = await fetch("/api/auth/me");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false };
    return data as { ok: boolean; user?: AuthUser };
  } catch {
    return { ok: false };
  }
}

// Payload building helpers

export const MODES = [
  { id: "text", label: "纯文生", desc: "只写提示词，直接生成一段完整视频。" },
  { id: "first_frame", label: "首帧控制", desc: "指定开场画面，用首帧锁住起始视觉。" },
  { id: "first_last_frame", label: "首尾帧", desc: "同时约束开头与结尾，让镜头收束更稳定。" },
  { id: "image_to_video", label: "图生视频", desc: "给一张主参考图，直接围绕这张图生成动态镜头。" },
  { id: "video_reference", label: "视频参考", desc: "基于已有视频节奏、动作和镜头语言生成。" },
  { id: "extend_video", label: "延长视频", desc: "基于已有任务继续往后延长镜头和动作。" },
];

export const CAMERA_PRESETS = [
  { value: "auto", label: "自动", helper: "" },
  { value: "push_in", label: "缓慢推近", helper: "镜头要求：整体为缓慢推近镜头，动作自然，避免大幅抖动。" },
  { value: "pull_back", label: "缓慢拉远", helper: "镜头要求：整体为缓慢拉远镜头，强调空间层次。" },
  { value: "pan", label: "平移跟随", helper: "镜头要求：以横向平移和主体跟拍为主，动线流畅。" },
  { value: "orbit", label: "环绕展示", helper: "镜头要求：围绕主体轻微环绕，强调空间感和质感。" },
  { value: "handheld", label: "手持纪实", helper: "镜头要求：保留轻微手持纪实感，但画面不能晃得过头。" },
];

export const MOTION_SPEEDS = [
  { value: "steady", label: "稳定", helper: "镜头节奏稳定，不要突然加速。" },
  { value: "slow", label: "偏慢", helper: "镜头节奏偏慢，动作舒展，转场自然。" },
  { value: "dynamic", label: "偏快", helper: "镜头节奏偏快，画面更有广告片冲击力。" },
];

export interface GenerationParams {
  mode: string;
  model: string;
  resolution: string;
  ratio: string;
  duration: number;
  cameraPreset: string;
  motionSpeed: string;
  generateAudio: boolean;
  sourceImage?: string;
  firstFrame?: string;
  lastFrame?: string;
  imageRefs?: string[];
  videoRefs?: string[];
  taskReference?: string;
}

export function buildPayload(prompt: string, params: GenerationParams) {
  const content: Record<string, unknown>[] = [];

  // Build enhanced prompt
  const extras: string[] = [];
  if (params.mode === "image_to_video" && params.sourceImage) {
    extras.push("请严格参考主参考图中的主体、构图、服装和场景质感，在此基础上生成连贯自然的动态镜头。");
  }
  const camera = CAMERA_PRESETS.find((c) => c.value === params.cameraPreset);
  if (camera && camera.value !== "auto" && camera.helper) extras.push(camera.helper);
  const speed = MOTION_SPEEDS.find((s) => s.value === params.motionSpeed);
  if (speed) extras.push(speed.helper);
  if (["first_frame", "first_last_frame"].includes(params.mode) && params.firstFrame) extras.push("首帧请严格参考图片1。");
  if (params.mode === "first_last_frame" && params.lastFrame) extras.push("尾帧请严格定格为尾帧参考图。");
  if (params.mode === "extend_video" && params.taskReference) extras.push("请在已有视频风格和动作基础上自然延长，不要突兀跳剪。");

  const fullPrompt = [prompt, ...extras].filter(Boolean).join("\n");
  if (fullPrompt) content.push({ type: "text", text: fullPrompt });

  // Source image (image_to_video mode)
  if (params.mode === "image_to_video" && params.sourceImage) {
    content.push({ type: "image_url", image_url: { url: params.sourceImage }, role: "reference_image" });
  }

  // First frame
  if (["first_frame", "first_last_frame"].includes(params.mode) && params.firstFrame) {
    content.push({ type: "image_url", image_url: { url: params.firstFrame }, role: "reference_image" });
  }

  // Additional image refs
  if (["image_to_video", "first_frame", "first_last_frame"].includes(params.mode) && params.imageRefs) {
    for (const url of params.imageRefs) {
      content.push({ type: "image_url", image_url: { url }, role: "reference_image" });
    }
  }

  // Last frame
  if (params.mode === "first_last_frame" && params.lastFrame) {
    content.push({ type: "image_url", image_url: { url: params.lastFrame }, role: "reference_image" });
  }

  // Video refs
  if (params.videoRefs) {
    for (const url of params.videoRefs) {
      content.push({ type: "video_url", video_url: { url }, role: "reference_video" });
    }
  }

  // Task reference for extend
  if (params.taskReference) {
    content.push({ type: "task_id", task_id: params.taskReference });
  }

  return {
    model: params.model || "doubao-seedance-2.0",
    content,
    resolution: params.resolution,
    ratio: params.ratio,
    duration: params.duration,
    generate_audio: params.generateAudio,
  };
}

export function extractTaskCost(record: TaskRecord): string {
  const cost = record?.proxy_meta?.cost?.total_cost || record?.proxy_meta?.costs?.CNY?.total_cost;
  return cost ? `${cost} CNY` : "-";
}

export function extractVideoUrl(record: TaskRecord): string | null {
  return record?.content?.video_url || (record?._proxy?.videoUrls?.[0]) || null;
}

// =====================================================
// 漫剧工作流 — 类型定义
// =====================================================

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  stage?: string;
  attachments?: string[];
}

export interface ScriptAnalysis {
  title: string;
  genre: string;
  style: string;
  target_platform?: string;
  color_palette?: string[];
  characters: {
    char_id: string;
    name: string;
    role: string;
    personality: string;
    appearance: Record<string, string>;
    costume: Record<string, string>;
    three_view_prompts: { front: string; side: string; back: string };
    expression_prompts: Record<string, string>;
    voice_profile?: Record<string, string>;
  }[];
  scenes: {
    scene_id: string;
    name: string;
    description: string;
    environment: Record<string, string>;
    six_view_prompts: Record<string, string>;
    lighting: Record<string, string>;
    color_grading: string;
  }[];
  episodes: {
    episode_id: number;
    title: string;
    duration_target: string;
    emotion_curve: string[];
    scenes: {
      scene_id: string;
      scene_ref: string;
      description: string;
      emotion: string;
      dialogues: { character: string; text: string; emotion: string; duration_hint: string }[];
      shots: {
        shot_type: string;
        subject: string;
        action: string;
        camera_movement: string;
        duration: string;
        lighting_note?: string;
      }[];
      bgm_instruction?: Record<string, string>;
      sfx?: string[];
    }[];
  }[];
  visual_style_guide?: Record<string, unknown>;
  camera_language_guide?: Record<string, unknown>;
}

export interface WfCharacter {
  id: string;
  name: string;
  description: string;
  appearance_prompt: string;
  front_view: string | null;
  side_view: string | null;
  back_view: string | null;
  expression_sheet: string | null;
  status: "pending" | "generating" | "done";
}

export interface WfScene {
  id: string;
  name: string;
  description: string;
  views: Record<string, string | null>;
  status: "pending" | "generating" | "done";
}

export interface WfShot {
  id: string;
  episode_id: string;
  scene_id: string;
  character_ids: string[];
  prompt: string;
  raw_description: string;
  shot_type: string;
  camera_movement: string;
  duration: number;
  dialogue?: string;
  emotion?: string;
  storyboard_image: string | null;
  video_task_id: string | null;
  video_url: string | null;
  video_local_path: string | null;
  status: "draft" | "storyboard" | "filming" | "done" | "failed";
}

export interface WfEpisode {
  id: string;
  title: string;
  shots: WfShot[];
}

export interface WfProject {
  id: string;
  title: string;
  status: "draft" | "scripting" | "designing" | "storyboarding" | "filming" | "post" | "done";
  created_at: string;
  updated_at: string;
  script: {
    raw_input: string;
    analysis: ScriptAnalysis | null;
    chat_history: ChatMessage[];
  };
  characters: WfCharacter[];
  scenes: WfScene[];
  style_guide: Record<string, unknown> | null;
  episodes: WfEpisode[];
  post_production: {
    subtitles_srt: string | null;
    final_output: string | null;
  };
}

export interface WfProjectSummary {
  id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
  genre: string;
  character_count: number;
  episode_count: number;
}

// =====================================================
// 漫剧工作流 — API 函数
// =====================================================

export function wfCreateProject(data: { title: string; raw_input: string }) {
  return api<WfProject>("/api/projects", { method: "POST", body: JSON.stringify(data) });
}

export function wfListProjects() {
  return api<{ projects: WfProjectSummary[] }>("/api/projects");
}

export function wfGetProject(id: string) {
  return api<WfProject>(`/api/projects/${id}`);
}

export function wfUpdateProject(id: string, data: Partial<WfProject>) {
  return api<WfProject>(`/api/projects/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export function wfDeleteProject(id: string) {
  return api<{ message: string }>(`/api/projects/${id}`, { method: "DELETE" });
}

export function wfAiChat(payload: { model: string; messages: { role: string; content: string }[] }) {
  return api<{ choices: { message: { content: string } }[] }>("/api/ai/chat", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function wfAiChatStream(
  payload: { model: string; messages: { role: string; content: string }[] },
  onChunk: (text: string) => void,
): Promise<string> {
  const res = await fetch("/api/ai/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AI 请求失败: ${err}`);
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      if (line.startsWith("data: ") && line.trim() !== "data: [DONE]") {
        try {
          const json = JSON.parse(line.slice(6));
          const content = json.choices?.[0]?.delta?.content;
          if (content) {
            accumulated += content;
            onChunk(accumulated);
          }
        } catch {
          // skip malformed lines
        }
      }
    }
  }
  return accumulated;
}

export function wfGenerateImage(payload: {
  model: string;
  prompt: string;
  n?: number;
  size?: string;
  project_id?: string;
  asset_filename?: string;
}) {
  return api<{ data: { url: string }[]; saved_assets?: { filename: string; asset_url: string }[] }>("/api/ai/image", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function wfRenderProject(projectId: string) {
  return api<{ message: string; output_url: string; output_path: string }>(`/api/projects/${projectId}/render`, {
    method: "POST",
  });
}

export function wfUploadAsset(projectId: string, imageData: string, filename?: string) {
  return api<{ filename: string; asset_url: string }>(`/api/projects/${projectId}/assets`, {
    method: "POST",
    body: JSON.stringify({ image_data: imageData, filename }),
  });
}

export function deriveProgress(record: TaskRecord): { percent: number; label: string; stage: number } {
  const status = record?.status || "idle";
  const candidates = [record?.progress, record?.progress_percent, record?.completed_percentage, record?.percentage];
  let actualPercent: number | null = null;
  for (const v of candidates) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0 && n <= 100) { actualPercent = Math.round(n); break; }
  }

  const map: Record<string, { percent: number; label: string; stage: number }> = {
    idle: { percent: 0, label: "等待中", stage: 0 },
    created: { percent: 10, label: "已创建", stage: 0 },
    queued: { percent: 20, label: "排队中", stage: 1 },
    pending: { percent: 30, label: "准备中", stage: 1 },
    running: { percent: actualPercent ?? 60, label: "生成中", stage: 2 },
    succeeded: { percent: 100, label: "已完成", stage: 3 },
    failed: { percent: 100, label: "失败", stage: 3 },
    cancelled: { percent: 100, label: "已取消", stage: 3 },
  };
  return map[status] || { percent: 0, label: status, stage: 0 };
}
