import {
  STORY_TYPE_PROMPTS,
  QUALITY_ANCHOR_PROMPT,
  ASPECT_RATIO_PROMPTS,
} from "./prompt-system";

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
  if (!res.ok) {
    const raw = (data as Record<string, unknown>).error;
    const msg = typeof raw === "string" ? raw
      : (raw && typeof raw === "object" && "message" in raw) ? String((raw as { message: unknown }).message)
      : `请求失败：${res.status}`;
    throw new Error(msg);
  }
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
    const res = await fetch("/api/auth/me", { cache: "no-store" });
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

export function buildPayload(prompt: string, params: GenerationParams, storyType?: string) {
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
  if (["first_frame", "first_last_frame"].includes(params.mode) && params.firstFrame) extras.push("首帧请严格参考图片1。视频全程必须保持与首帧完全一致的画风和角色造型，禁止将画风转为真人写实风格。");
  if (params.mode === "first_last_frame" && params.lastFrame) extras.push("尾帧请严格定格为尾帧参考图。");
  if (params.mode === "extend_video" && params.taskReference) extras.push("请在已有视频风格和动作基础上自然延长，不要突兀跳剪。");

  // 注入故事类型专属提示词（Layer 1 + Layer 5 + Layer 0）
  const systemParts: string[] = [];
  if (storyType) {
    const typeEntry = STORY_TYPE_PROMPTS[storyType];
    if (typeEntry?.prompt) {
      systemParts.push(typeEntry.prompt);
    }
  }
  const ratioPrompt = ASPECT_RATIO_PROMPTS[params.ratio];
  if (storyType && ratioPrompt) {
    systemParts.push(ratioPrompt);
  }
  if (storyType) {
    systemParts.push(QUALITY_ANCHOR_PROMPT);
  }

  // 合成最终 prompt：用户内容 + 模式指导 + 类型系统提示词
  const userPrompt = [prompt, ...extras].filter(Boolean).join("\n");
  const systemPrompt = systemParts.length > 0 ? `\n[Style: ${systemParts.join(", ")}]` : "";
  const fullPrompt = userPrompt + systemPrompt;
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
    model: params.model || "veo-2",
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
    /** 完整的角色视觉描述提示词（由 LLM 生成），用于图像生成 */
    visual_prompt_template?: string;
    appearance_description?: string;
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
        optics?: string;
        composition?: string;
        lighting_note?: string;
        transition?: string;
        /** AI 生成的完整英文图像提示词 */
        visual_prompt?: string;
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
  expression_sheet: Record<string, string | null> | null;
  /** 每张视图的审核状态: approved / pending / rejected */
  view_status?: Record<string, "approved" | "pending" | "rejected">;
  status: "pending" | "generating" | "done";
}

export interface WfScene {
  id: string;
  name: string;
  description: string;
  six_view_prompts?: Record<string, string>;
  lighting?: Record<string, string>;
  views: Record<string, string | null>;
  /** 每张视图的审核状态 */
  view_status?: Record<string, "approved" | "pending" | "rejected">;
  /** 该场景中出现的角色ID列表（从镜头关联推导） */
  character_ids?: string[];
  status: "pending" | "generating" | "done";
}

// =====================================================
// 风格配置
// =====================================================

export interface StyleConfig {
  /** 短片类型 ID: drama | music_video | comic_adapt | promo | edu */
  story_type: string;
  /** 风格大类名称 */
  art_style_category: string;
  /** 风格子类名称（如"吉卜力"） */
  art_substyle: string;
  /** 画面比例 */
  aspect_ratio: "16:9" | "9:16" | "1:1";
  /** 目标总时长（秒） */
  duration_sec: number;
  /** 对白语言 */
  language: string;
  /** 单镜头时长（秒） */
  shot_duration_sec: number;
  /** 集数 */
  episode_count?: number;
  /** 合成后的总风格提示词（英文，注入到所有生成请求） */
  compiled_style_prompt: string;
  /** 合成后的反面提示词（英文） */
  compiled_negative_prompt: string;
  /** 是否被用户手动编辑过 */
  prompt_manually_edited: boolean;
  /** 编辑前的原始值（用于还原默认） */
  prompt_edit_history: string[];
  /** 风格参考图 URL 列表（1-3张），通过 wfUploadAsset 上传后获得 */
  style_reference_images?: string[];
  /** AI 分析参考图后提取的风格特征 */
  style_match_analysis?: StyleMatchAnalysis;
}

/** 参考图风格分析结果 */
export interface StyleMatchAnalysis {
  /** 提取的主色调（hex） */
  color_palette: string[];
  /** 构图风格描述 */
  composition_style: string;
  /** 氛围关键词 */
  mood_keywords: string[];
  /** 英文风格描述片段，用于注入提示词 */
  style_descriptors: string;
  /** 匹配置信度 0-1 */
  confidence: number;
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
  action?: string;
  optics?: string;
  composition?: string;
  lighting_note?: string;
  transition?: string;
  visual_prompt?: string;
  dialogue?: string;
  emotion?: string;
  storyboard_image: string | null;
  video_task_id: string | null;
  video_url: string | null;
  video_local_path: string | null;
  approved?: boolean;
  video_approved?: boolean;
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
  status: "draft" | "configured" | "scripting" | "script_parsed" | "designing" | "assets_locked" | "storyboarding" | "filming" | "compositing" | "compositing_failed" | "post" | "done";
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
  style_config: StyleConfig | null;
  reference_images: string[];
  episodes: WfEpisode[];
  post_production: {
    subtitles_srt: string | null;
    subtitles_srt_path?: string | null;
    final_output: string | null;
    compose_config?: ComposeConfig;
    compose_progress?: ComposeProgress;
    last_error?: ComposeError | null;
  };
}

// ── Compose Types (Step 5 Phase C) ──

export interface ComposeConfig {
  include_subtitles: boolean;
  subtitle_mode: "burn" | "external" | "off";
  include_voiceover: boolean;
  include_bgm: boolean;
  bgm_source: "auto" | "custom";
  bgm_path?: string;
  bgm_volume?: number;
  output_quality: "720p" | "1080p" | "4k";
  transition_style: "dissolve" | "fade" | "cut" | "none";
  resume_from_stage?: string | null;
}

export interface ComposeProgress {
  current_stage: string | null;
  stages_completed: string[];
  stages_total: number;
  percent: number;
}

export interface ComposeError {
  code?: string;
  message: string;
  detail?: string;
  suggestion?: string;
  auto_fix?: boolean;
  failed_stage?: string;
}

export const COMPOSE_STAGE_LABELS: Record<string, string> = {
  concat: "拼接",
  transition: "转场",
  subtitle: "字幕",
  voiceover: "配音",
  bgm: "BGM",
  audio_mix: "混缩",
  render: "渲染",
};

export const COMPOSE_STAGES_ORDER = ["concat", "transition", "subtitle", "voiceover", "bgm", "audio_mix", "render"];

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

export function wfCreateProject(data: { title: string; raw_input: string; reference_images?: string[] }) {
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

export type AiChatContent = string | Array<{ type: string; [key: string]: unknown }>;

export function wfAiChat(payload: { model: string; messages: { role: string; content: AiChatContent }[] }) {
  return api<{ choices: { message: { content: string } }[] }>("/api/ai/chat", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function wfAiChatStream(
  payload: { model: string; messages: { role: string; content: string }[]; max_tokens?: number; temperature?: number },
  onChunk: (text: string) => void,
): Promise<string> {
  // Call Python backend directly to avoid Next.js dev proxy 30s timeout.
  // AI responses (especially long JSON) can take 60s+.
  const backendBase = `http://127.0.0.1:8787`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000); // 5 分钟超时
  let res: Response;
  try {
    res = await fetch(`${backendBase}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, stream: false }),
      signal: controller.signal,
      credentials: "include",
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("AI 请求超时（5分钟），请检查网络后重试。");
    }
    throw err;
  }
  clearTimeout(timeoutId);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AI 请求失败: ${err}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";
  onChunk(content);
  return content;
}

export async function wfGenerateImage(payload: {
  model: string;
  prompt: string;
  n?: number;
  size?: string;
  project_id?: string;
  asset_filename?: string;
  /** 角色三视图 URL 列表，用于锚定分镜中的角色外貌 */
  reference_image_urls?: string[];
}): Promise<{ data: { url: string }[]; saved_assets?: { filename: string; asset_url: string }[] }> {
  // Start async job
  const startRes = await api<{ job_id: string; status: string }>("/api/ai/image", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const { job_id } = startRes;

  // Poll until done (max 5 minutes, every 2 seconds)
  const maxWaitMs = 5 * 60 * 1000;
  const pollInterval = 2000;
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollInterval));
    const jobRes = await api<{
      status: string;
      result?: { data: { url: string }[]; saved_assets?: { filename: string; asset_url: string }[] };
      error?: string;
    }>(`/api/ai/image/job/${job_id}`);
    if (jobRes.status === "done") {
      return jobRes.result!;
    }
    if (jobRes.status === "error") {
      throw new Error(jobRes.error || "图像生成失败");
    }
    // still "pending" — keep polling
  }
  throw new Error("图像生成超时（等待超过5分钟）");
}

// =====================================================
// Step 4 版本历史
// =====================================================

export interface Step4Version {
  version: number;
  timestamp: string;
  reason: string;
  summary: string;
  filename: string;
}

// Step 3 版本历史

export interface Step3Version {
  version: number;
  timestamp: string;
  reason: string;
  summary: string;
  filename: string;
}

export function wfListStep3Versions(projectId: string) {
  return api<{ versions: Step3Version[] }>(`/api/projects/${projectId}/versions/step3`);
}

export function wfCreateStep3Snapshot(projectId: string, reason: string) {
  return api<{ snapshot: Record<string, unknown> }>(`/api/projects/${projectId}/versions/step3/snapshot`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function wfRestoreStep3Version(projectId: string, filename: string) {
  return api<WfProject>(`/api/projects/${projectId}/versions/step3/restore`, {
    method: "POST",
    body: JSON.stringify({ filename }),
  });
}

// Step 4 版本历史

export function wfListStep4Versions(projectId: string) {
  return api<{ versions: Step4Version[] }>(`/api/projects/${projectId}/versions/step4`);
}

export function wfCreateStep4Snapshot(projectId: string, reason: string) {
  return api<{ snapshot: Record<string, unknown> }>(`/api/projects/${projectId}/versions/step4/snapshot`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function wfRestoreStep4Version(projectId: string, filename: string) {
  return api<WfProject>(`/api/projects/${projectId}/versions/step4/restore`, {
    method: "POST",
    body: JSON.stringify({ filename }),
  });
}

export function wfRenderProject(projectId: string, config?: Partial<ComposeConfig>) {
  return api<{ message: string; status: string; resume_from?: string | null; stages_total?: number; output_url?: string; output_path?: string }>(
    `/api/projects/${projectId}/render`,
    {
      method: "POST",
      body: config ? JSON.stringify(config) : undefined,
    },
  );
}

// ── Batch Shot Generation ──

export function wfBatchGenerateShots(projectId: string, opts: { shot_ids?: string[]; generate_all?: boolean }) {
  return api<{ message: string; total: number; submitted: number }>(
    `/api/projects/${projectId}/shots/generate-batch`,
    { method: "POST", body: JSON.stringify(opts) },
  );
}

// ── Version History (Step 5) ──

export function wfListVersions(projectId: string, step: string) {
  return api<{ step: string; versions: { version_id: string; created_at: string; trigger: string; label?: string | null; preview?: Record<string, unknown> }[]; max_versions: number }>(
    `/api/projects/${projectId}/versions?step=${step}`,
  );
}

export function wfCreateVersion(projectId: string, step: string, label?: string) {
  return api<{ version_id: string; created_at: string; trigger: string; label?: string | null }>(
    `/api/projects/${projectId}/versions`,
    { method: "POST", body: JSON.stringify({ step, label }) },
  );
}

export function wfRestoreVersion(projectId: string, step: string, versionId: string) {
  return api<{ message: string; auto_saved_as?: string }>(
    `/api/projects/${projectId}/versions/${step}/${versionId}/restore`,
    { method: "POST" },
  );
}

export function wfDeleteVersion(projectId: string, step: string, versionId: string) {
  return api<{ message: string }>(
    `/api/projects/${projectId}/versions/${step}/${versionId}`,
    { method: "DELETE" },
  );
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

// ---------------------------------------------------------------------------
// Grid Generator API
// ---------------------------------------------------------------------------

export interface GridJobResult {
  key: string;
  label: string;
  status: "pending" | "generating" | "done" | "failed";
  image_url: string | null;
  error?: string;
}

export interface GridJobStatus {
  job_id: string;
  status: "pending" | "generating" | "done" | "failed" | "partial";
  grid_size: number;
  completed: number;
  total: number;
  results: GridJobResult[];
}

export function gridGenerate(payload: {
  reference_image: string;
  grid_size: 9 | 25;
  mode?: "expression" | "scene" | "body";
}): Promise<{ job_id: string; status: string }> {
  return api("/api/grid/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function gridJobStatus(jobId: string): Promise<GridJobStatus> {
  return api(`/api/grid/job/${jobId}`);
}

// --- Scene 360 API ---

export interface Scene360StyleAnchor {
  rendering_type: string;
  material_aging: string;
  texture_density: string;
  surface_wear: string;
  vegetation: string;
  color_style: string;
  lighting: string;
  atmosphere: string;
}

export interface Scene360SceneInfo {
  scene_type: string;
  ref_angle: string;
  observer_position: string;
  covered_fov: string;
  main_light: string;
  time_of_day: string;
}

export interface Scene360SpatialElement {
  direction: string;
  visible: string[];
  inferred: string[];
  reasoning: string;
  image_prompt: string;
}

export interface Scene360Analysis {
  style_anchor: Scene360StyleAnchor;
  scene_info: Scene360SceneInfo;
  spatial_elements: Scene360SpatialElement[];
}

export interface Scene360ViewResult {
  key: string;
  label: string;
  direction: string;
  status: "pending" | "generating" | "done" | "failed";
  image_url: string | null;
  error?: string;
}

export interface Scene360JobStatus {
  job_id: string;
  status: "pending" | "generating" | "done" | "failed" | "partial";
  view_count: number;
  completed: number;
  total: number;
  results: Scene360ViewResult[];
  stitch_guide: string | null;
}

export async function scene360Analyze(payload: {
  reference_image: string;
}): Promise<Scene360Analysis> {
  // Try direct OAI relay from browser first
  try {
    const keyRes = await api<{ oai_image_key: string }>("/api/grid/oai-key");
    const config = await fetchConfig();
    const ai = (config as unknown as Record<string, unknown>).aiConfig as Record<string, string> | undefined;
    const oaiBase = ai?.oaiImageBase || "";
    const key = keyRes.oai_image_key;

    if (oaiBase && key) {
      const content = await _oaiBrowserChat(oaiBase, key, "[官逆C]gemini-3-flash-preview", payload.reference_image, SCENE_360_ANALYSIS_PROMPT);
      return _parseAiJson<Scene360Analysis>(content);
    }
  } catch (e) {
    console.warn("[scene360] Browser OAI analysis failed, falling back:", e);
  }

  // Fallback: server-side
  const startRes = await api<{ job_id: string }>("/api/grid/scene360/analyze", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const maxWait = Date.now() + 120_000;
  while (Date.now() < maxWait) {
    await new Promise((r) => setTimeout(r, 2000));
    const job = await api<{ status: string; result?: Scene360Analysis; error?: string }>(`/api/ai/image/job/${startRes.job_id}`);
    if (job.status === "done" && job.result) return job.result;
    if (job.status === "error") throw new Error(job.error || "分析失败");
  }
  throw new Error("AI 分析超时");
}

const SCENE_360_ANALYSIS_PROMPT = `你是一个专业的场景空间分析师和图像prompt工程师。分析参考图片，完成画风锚定、场景信息、360°视图画面描述。
为6个方向各写一段完整的英文image_prompt（可直接用于AI绘画）。
输出JSON格式:
{"style_anchor":{"rendering_type":"","material_aging":"","texture_density":"","surface_wear":"","vegetation":"","color_style":"","lighting":"","atmosphere":""},"scene_info":{"scene_type":"","ref_angle":"","observer_position":"","covered_fov":"","main_light":"","time_of_day":""},"spatial_elements":[{"direction":"0°(正前方)","visible":[],"inferred":[],"reasoning":"","image_prompt":"English scene description 50-80 words"},{"direction":"90°(右侧)","visible":[],"inferred":[],"reasoning":"","image_prompt":""},{"direction":"180°(后方)","visible":[],"inferred":[],"reasoning":"","image_prompt":""},{"direction":"270°(左侧)","visible":[],"inferred":[],"reasoning":"","image_prompt":""},{"direction":"up(上方)","visible":[],"inferred":[],"reasoning":"","image_prompt":""},{"direction":"down(下方)","visible":[],"inferred":[],"reasoning":"","image_prompt":""}]}
仅输出JSON。`;

export async function scene360Generate(payload: {
  reference_image: string;
  analysis: Scene360Analysis;
  view_count: 4 | 6 | 8;
  aspect_ratio: string;
}): Promise<{ job_id: string; status: string }> {
  const backendBase = "http://127.0.0.1:8787";
  const res = await fetch(`${backendBase}/api/grid/scene360/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as Record<string, unknown>).error;
    throw new Error(typeof msg === "string" ? msg : `请求失败：${res.status}`);
  }
  return data as { job_id: string; status: string };
}

export function scene360JobStatus(jobId: string): Promise<Scene360JobStatus> {
  return api(`/api/grid/scene360/job/${jobId}`);
}

export function scene360Regenerate(payload: {
  job_id: string;
  view_key: string;
}): Promise<{ ok: boolean; status: string }> {
  return api("/api/grid/scene360/regenerate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// --- Storyboard Grid ---

export interface StoryboardAnalysis {
  style_anchor: {
    rendering_type: string;
    color_style: string;
    lighting: string;
    atmosphere: string;
  };
  story: {
    subject: string;
    narrative: string;
    time_span: string;
    emotion_curve: string;
  };
  frames: StoryboardFrame[];
}

export interface StoryboardFrame {
  id: string;
  act: string;
  shot_type: string;
  description: string;
  image_prompt: string;
}

export interface StoryboardJobStatus {
  job_id: string;
  status: "pending" | "generating" | "done" | "failed" | "partial";
  grid_size: number;
  completed: number;
  total: number;
  results: {
    key: string;
    label: string;
    shot_type: string;
    description: string;
    status: "pending" | "generating" | "done" | "failed";
    image_url: string | null;
  }[];
}

export async function storyboardAnalyze(payload: {
  reference_image: string;
  grid_size: 9 | 25;
}): Promise<StoryboardAnalysis> {
  // Try direct OAI relay from browser first (bypasses proxy issues)
  const config = await fetchConfig();
  const ai = (config as unknown as Record<string, unknown>).aiConfig as Record<string, string> | undefined;
  const oaiBase = ai?.oaiImageBase || "";
  const oaiKey = (config as unknown as Record<string, Record<string, string>>).aiConfig?.oaiImageKey || "";

  if (oaiBase) {
    // Get the key from server config (stored in .local-secrets.json)
    const keyRes = await api<{ oai_image_key: string }>("/api/grid/oai-key");
    const key = keyRes.oai_image_key;
    if (key) {
      try {
        return await _analyzeViaOai(payload, oaiBase, key);
      } catch (e) {
        console.warn("[storyboard] Browser OAI analysis failed, falling back to server:", e);
      }
    }
  }

  // Fallback: server-side analysis (async job)
  const startRes = await api<{ job_id: string; status: string }>("/api/grid/storyboard/analyze", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const { job_id } = startRes;

  const maxWaitMs = 120_000;
  const pollInterval = 2000;
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollInterval));
    const jobRes = await api<{
      status: string;
      result?: StoryboardAnalysis;
      error?: string;
    }>(`/api/ai/image/job/${job_id}`);
    if (jobRes.status === "done" && jobRes.result) return jobRes.result;
    if (jobRes.status === "error") throw new Error(jobRes.error || "AI 分析失败");
  }
  throw new Error("AI 分析超时");
}

/** Compress an image data URL to max 100x100 JPEG for analysis (reduces payload size) */
async function _compressImageForAnalysis(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 100;
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > MAX || h > MAX) {
        const scale = MAX / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      cv.getContext("2d")!.drawImage(img, 0, 0, w, h);
      resolve(cv.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => resolve(dataUrl); // fallback to original
    img.src = dataUrl;
  });
}

/** Call OAI chat API directly from browser */
async function _oaiBrowserChat(
  oaiBase: string, oaiKey: string, model: string,
  imageDataUrl: string, textPrompt: string,
): Promise<string> {
  const compressed = await _compressImageForAnalysis(imageDataUrl);
  const url = `${oaiBase.replace(/\/+$/, "")}/v1/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${oaiKey}` },
    body: JSON.stringify({
      model,
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: compressed } },
          { type: "text", text: textPrompt },
        ],
      }],
      max_tokens: 8000,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`OAI API error: ${res.status}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";
  if (!content) throw new Error("AI 未返回内容");
  return content;
}

/** Parse JSON from AI text response (handles fenced markdown) */
function _parseAiJson<T>(text: string): T {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
  return JSON.parse(jsonStr.trim());
}

async function _analyzeViaOai(
  payload: { reference_image: string; grid_size: 9 | 25 },
  oaiBase: string,
  oaiKey: string,
): Promise<StoryboardAnalysis> {
  const gridSize = payload.grid_size;
  const structureDesc = gridSize === 9
    ? "三段式: P1-P3 Setup, P4-P6 Action, P7-P9 Resolution"
    : "五段式: P1-P5 Prologue, P6-P10 Setup, P11-P15 Confrontation, P16-P20 Climax, P21-P25 Resolution";

  const systemPrompt = `你是一位电影摄影指导。分析参考图片，设计${gridSize}帧分镜。结构: ${structureDesc}。
输出JSON格式:
{"style_anchor":{"rendering_type":"","color_style":"","lighting":"","atmosphere":""},"story":{"subject":"","narrative":"","time_span":"","emotion_curve":""},"frames":[{"id":"P1","act":"Setup","shot_type":"Wide Shot","description":"中文描述","image_prompt":"English prompt 50-80 words"}]}
image_prompt必须是完整英文画面描述，禁止角度数字。仅输出JSON。`;

  const content = await _oaiBrowserChat(oaiBase, oaiKey, "[官逆C]gemini-3-flash-preview", payload.reference_image, systemPrompt);
  return _parseAiJson<StoryboardAnalysis>(content);
}

export async function storyboardGenerate(payload: {
  reference_image: string;
  analysis: StoryboardAnalysis;
  grid_size: 9 | 25;
  aspect_ratio: string;
}): Promise<{ job_id: string; status: string }> {
  const urls = ["http://127.0.0.1:8787/api/grid/storyboard/generate", "/api/grid/storyboard/generate"];
  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data as Record<string, unknown>).error;
        throw new Error(typeof msg === "string" ? msg : `请求失败：${res.status}`);
      }
      return data as { job_id: string; status: string };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (url.startsWith("http://127")) continue;
      throw lastError;
    }
  }
  throw lastError ?? new Error("请求失败");
}

export function storyboardJobStatus(jobId: string): Promise<StoryboardJobStatus> {
  return api(`/api/grid/storyboard/job/${jobId}`);
}

export function storyboardRegenerate(payload: {
  job_id: string;
  frame_key: string;
}): Promise<{ ok: boolean; status: string }> {
  return api("/api/grid/storyboard/regenerate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function gridRegenerate(payload: {
  job_id: string;
  expression_key: string;
}): Promise<{ ok: boolean; status: string }> {
  return api("/api/grid/regenerate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
