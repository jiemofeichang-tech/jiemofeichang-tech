/**
 * Lightweight store using useSyncExternalStore (React 18+ built-in).
 * Zero dependencies — replaces zustand until npm network is available.
 */
import { useSyncExternalStore } from "react";
import type {
  WfProject,
  WfCharacter,
  WfScene,
  WfShot,
  WfEpisode,
  ChatMessage,
  ScriptAnalysis,
  StyleConfig,
} from "./api";
import {
  wfCreateProject,
  wfGetProject,
  wfUpdateProject,
  wfUploadAsset,
  wfAiChatStream,
  wfGenerateImage,
  wfListStep4Versions,
  wfCreateStep4Snapshot,
  wfRestoreStep4Version,
  wfCreateVersion,
  createTask,
  queryTask,
  buildPayload,
  fetchConfig,
  type GenerationParams,
  type Step4Version,
} from "./api";
import {
  convertAnalysisToProjectData,
  mapCameraToSeedance,
  generateAllAssets,
  regenerateView,
  buildScriptPrompt,
  analyzeScript,
} from "./workflow-engine";

export type WorkflowStage = "script" | "style" | "character" | "storyboard" | "video" | "post"; // "style" 保留兼容但不再作为独立步骤

/** 每个阶段的生命周期状态 */
export type StageStatus = "locked" | "active" | "generating" | "review" | "confirmed";

export interface SelectedBlock {
  type: "script" | "style" | "character" | "scene" | "shot" | "video" | "post";
  id: string;
  label?: string;
  /** shot 编辑时需要 episodeId */
  episodeId?: string;
}

/** 编辑面板目标 */
export interface EditPanelTarget {
  type: "script" | "character" | "scene" | "episode" | "shot";
  id: string;
  episodeId?: string;
}

interface AiConfig {
  chatModel: string;
  imageModel: string;
}

interface AssetGenProgress {
  total: number;
  completed: number;
  failed: number;
  current: string;
}

/** AI 处理进度 */
export interface StageProgress {
  stage: string;       // 当前阶段名
  step: string;        // 当前步骤描述
  percent: number;     // 0-100
  startedAt: number;   // Date.now()
}

interface StoreState {
  project: WfProject | null;
  loading: boolean;
  error: string | null;
  chatMessages: ChatMessage[];
  chatLoading: boolean;
  streamingContent: string;
  currentStage: WorkflowStage;
  selectedBlock: SelectedBlock | null;
  aiConfig: AiConfig;
  assetGenProgress: AssetGenProgress | null;
  /** AI 处理进度提示 */
  stageProgress: StageProgress | null;
  step4Versions: Step4Version[];
  /** 工作流模式：interactive=逐步交互, auto=全自动托管 */
  workflowMode: "interactive" | "auto";
  /** 各阶段状态 */
  stageStatuses: Record<WorkflowStage, StageStatus>;
  /** 右侧编辑面板目标 */
  editPanelTarget: EditPanelTarget | null;
}

const STAGE_ORDER: WorkflowStage[] = ["script", "character", "storyboard", "video", "post"];

const DEFAULT_STAGE_STATUSES: Record<WorkflowStage, StageStatus> = {
  script: "active",
  style: "confirmed", // style 合并到 script，始终 confirmed
  character: "locked",
  storyboard: "locked",
  video: "locked",
  post: "locked",
};

/** 根据已有项目数据推断各阶段状态（兼容旧项目） */
function inferStageStatuses(project: WfProject): Record<WorkflowStage, StageStatus> {
  const s: Record<WorkflowStage, StageStatus> = { ...DEFAULT_STAGE_STATUSES };

  const hasScript = !!project.script?.analysis;
  const hasStyle = !!project.style_config;
  const hasChars = project.characters.length > 0 && project.characters.some((c) => c.status === "done");
  const isAssetsLocked = project.status === "assets_locked";
  const hasStoryboard = project.episodes.some((ep) => ep.shots.some((sh) => sh.storyboard_image));
  const hasVideo = project.episodes.some((ep) => ep.shots.some((sh) => sh.video_url));
  const hasPost = !!project.post_production?.final_output;

  // script
  if (hasScript) s.script = "confirmed";
  else s.script = "active";

  // style（合并到 script，始终 confirmed）
  s.style = "confirmed";

  // character — script 完成即解锁（不再依赖 style）
  if (isAssetsLocked || hasStoryboard) s.character = "confirmed";
  else if (hasChars) s.character = "review";
  else if (hasScript) s.character = "active";
  else s.character = "locked";

  // storyboard — 角色完成即可进入分镜（不强制要求资产锁定）
  if (hasStoryboard && (hasVideo || project.episodes.every((ep) => ep.shots.every((sh) => sh.storyboard_image))))
    s.storyboard = "confirmed";
  else if (hasStoryboard) s.storyboard = "review";
  else if (isAssetsLocked || hasChars) s.storyboard = "active";
  else s.storyboard = "locked";

  // video
  if (hasVideo && project.episodes.every((ep) => ep.shots.every((sh) => sh.video_url)))
    s.video = "confirmed";
  else if (hasVideo) s.video = "review";
  else if (hasStoryboard) s.video = "active";
  else s.video = "locked";

  // post
  if (hasPost) s.post = "confirmed";
  else if (hasVideo) s.post = "active";
  else s.post = "locked";

  return s;
}

// ---- tiny external store ----
let state: StoreState = {
  project: null,
  loading: false,
  error: null,
  chatMessages: [],
  chatLoading: false,
  streamingContent: "",
  currentStage: "script",
  selectedBlock: null,
  aiConfig: { chatModel: "gemini-2.5-pro", imageModel: "imagen-4.0-generate-001" },
  assetGenProgress: null,
  stageProgress: null,
  step4Versions: [],
  workflowMode: "interactive",
  stageStatuses: { ...DEFAULT_STAGE_STATUSES },
  editPanelTarget: null,
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function setState(partial: Partial<StoreState>) {
  state = { ...state, ...partial };
  emit();
}

function getState(): StoreState {
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ---- helpers ----
function extractJson(text: string): string {
  const jsonBlock = text.match(/```json\s*([\s\S]*?)```/);
  if (jsonBlock) return jsonBlock[1].trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) return text.slice(first, last + 1);
  return text.trim();
}

// ---- React hook ----
export function useWorkflowStore() {
  const snap = useSyncExternalStore(subscribe, getState, getState);
  return {
    ...snap,
    // Actions
    loadProject,
    createProject,
    updateProjectData,
    sendMessage,
    addSystemMessage,
    clearChat,
    setStage,
    setSelectedBlock,
    updateCharacter,
    addCharacters,
    updateScene,
    addScenes,
    setEpisodes,
    updateShot,
    setScriptAnalysis,
    updateScriptAnalysis,
    setSubtitlesSrt,
    setFinalOutput,
    // Generation actions
    regenerateScript,
    generateCharacterImages,
    generateSceneImages,
    generateSingleSceneImages,
    generateStoryboardImages,
    generateVideos,
    regenerateSingleStoryboard,
    regenerateSingleVideo,
    updateProjectTitle,
    loadAiConfig,
    // Step 4: 资产生成 + 审核 + 锁定
    generateAllAssetsAction,
    regenerateViewAction,
    regenerateCharacterAction,
    approveView,
    uploadReplacementView,
    lockAssets,
    unlockAssets,
    // Step 2: 风格配置
    setStyleConfig,
    // Step 4: 版本历史
    loadStep4Versions,
    createStep4Snapshot,
    restoreStep4Version,
    // ---- 新增：双模式 + 阶段状态机 + 编辑 ----
    setWorkflowMode,
    setStageStatus,
    confirmStage,
    rollbackToStage,
    openEditPanel,
    closeEditPanel,
    runAutoWorkflow,
    // 深度编辑 actions
    updateCharacterDeep,
    updateSceneDeep,
    updateShotDeep,
    updateEpisodeDeep,
    addNewCharacter,
    removeCharacter,
    addNewScene,
    removeScene,
    addNewShot,
    removeShot,
    buildEditContext,
    fillMissingVisualPrompts,
  };
}

// ---- helpers ----
function nowIso(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function buildSystemPrompt(stage: WorkflowStage, project: WfProject | null): string {
  const ctx = project ? `当前项目: "${project.title}", 状态: ${project.status}` : "";

  const prompts: Record<WorkflowStage, string> = {
    script: buildScriptPrompt(project?.style_config),

    style: `你是一个视觉风格顾问（艺术总监）。${ctx}
帮助用户选择合适的短片类型、艺术风格和影片参数。可以推荐风格组合、解释不同风格的适用场景、优化提示词。`,

    character: `你是一个角色设计师（艺术总监）。${ctx}
根据剧本中的角色描述，帮助用户优化角色设计、三视图提示词。回答时直接给出修改后的JSON。`,

    storyboard: `你是一个分镜师（艺术总监）。${ctx}
根据剧本和角色设计，优化分镜，含镜头类型、运镜、构图、图像生成提示词(英文)。`,

    video: `你是一个视频导演（艺术总监）。${ctx}
帮助调整视频生成参数：运镜预设、运动速度、时长等Seedance参数。`,

    post: `你是一个后期制作师（艺术总监）。${ctx}
帮助处理字幕、音频、调色、导出。`,
  };
  return prompts[stage];
}

// ---- selectedBlock context builder ----

function buildSelectedBlockContext(block: SelectedBlock, project: WfProject): string | null {
  switch (block.type) {
    case "style": {
      const sc = project.style_config;
      return sc
        ? `[用户正在编辑风格配置]\n当前配置: 类型=${sc.story_type}, 风格=${sc.art_substyle}, 比例=${sc.aspect_ratio}, 时长=${sc.duration_sec}s\n提示词: ${sc.compiled_style_prompt || "(无)"}`
        : `[用户正在配置视觉风格]\n尚未配置，请帮助用户选择合适的风格。`;
    }

    case "script":
      return project.script?.analysis
        ? `[用户正在编辑剧本]\n当前剧本标题: "${project.script.analysis.title}"\n类型: ${project.script.analysis.genre} | 风格: ${project.script.analysis.style}\n角色数: ${project.script.analysis.characters.length}, 场景数: ${project.script.analysis.scenes.length}\n请根据用户的修改需求，输出完整的更新后JSON。`
        : `[用户正在编辑剧本]\n尚无剧本分析结果，请帮助用户创作剧本。`;

    case "character": {
      const char = project.characters.find((c) => c.id === block.id);
      if (!char) return null;
      const analysisChar = project.script?.analysis?.characters.find((c) => c.char_id === block.id);
      return `[用户正在编辑角色: ${char.name} (ID: ${block.id})]\n` +
        `角色描述: ${char.description}\n` +
        `角色定位: ${analysisChar?.role || "未知"}\n` +
        `性格: ${analysisChar?.personality || "未知"}\n` +
        `外观(英文): ${JSON.stringify(analysisChar?.appearance) || "未知"}\n` +
        `服装(英文): ${JSON.stringify(analysisChar?.costume) || "未知"}\n` +
        `三视图提示词:\n  front: "${analysisChar?.three_view_prompts?.front || ""}"\n  side: "${analysisChar?.three_view_prompts?.side || ""}"\n  back: "${analysisChar?.three_view_prompts?.back || ""}"\n` +
        `表情提示词: ${JSON.stringify(analysisChar?.expression_prompts || {})}\n` +
        `三视图状态: front=${char.front_view ? "✅" : "⬜"} side=${char.side_view ? "✅" : "⬜"} back=${char.back_view ? "✅" : "⬜"}\n` +
        `当前状态: ${char.status}\n\n` +
        `如需修改角色属性，请输出修改后的JSON对象（包含 char_id, name, role, personality, appearance, costume, three_view_prompts 等字段）。`;
    }

    case "scene": {
      const scene = project.scenes.find((s) => s.id === block.id);
      if (!scene) return null;
      const analysisScene = project.script?.analysis?.scenes.find((s) => s.scene_id === block.id);
      return `[用户正在编辑场景: ${scene.name} (ID: ${block.id})]\n` +
        `场景描述: ${analysisScene?.description || scene.name}\n` +
        `环境(英文): ${JSON.stringify(analysisScene?.environment) || "未知"}\n` +
        `光照: ${JSON.stringify(analysisScene?.lighting) || "未知"}\n` +
        `六视图提示词: ${JSON.stringify(analysisScene?.six_view_prompts || {})}\n` +
        `视图状态: ${Object.entries(scene.views || {}).map(([k, v]) => `${k}=${v ? "✅" : "⬜"}`).join(" ")}\n` +
        `当前状态: ${scene.status}\n\n` +
        `如需修改场景属性，请输出修改后的JSON对象（包含 scene_id, name, description, environment, six_view_prompts 等字段）。`;
    }

    case "shot": {
      const epId = block.episodeId || block.id.split("/")[0];
      const shotId = block.id.includes("/") ? block.id.split("/")[1] : block.id;
      const ep = project.episodes.find((e) => e.id === epId);
      const shot = ep?.shots.find((s) => s.id === shotId);
      if (!shot) return null;
      return `[用户正在编辑镜头: ${shotId} (集: ${epId})]\n` +
        `镜头描述: ${shot.raw_description}\n` +
        `镜头类型: ${shot.shot_type || "未知"}, 时长: ${shot.duration}s\n` +
        `运镜: ${shot.camera_movement || "无"}\n` +
        `图像提示词(prompt): ${shot.prompt}\n` +
        `对白: ${shot.dialogue || "(无)"}\n` +
        `情绪: ${shot.emotion || "(无)"}\n` +
        `分镜图: ${shot.storyboard_image ? "✅已生成" : "⬜未生成"}\n\n` +
        `如需修改镜头属性，请输出修改后的JSON对象（可包含 shot_type, duration, camera_movement, dialogue, emotion, prompt, raw_description 等字段）。`;
    }

    case "video": {
      const vEpId = block.episodeId || block.id.split("/")[0];
      const vShotId = block.id.includes("/") ? block.id.split("/")[1] : block.id;
      const vEp = project.episodes.find((e) => e.id === vEpId);
      const vShot = vEp?.shots.find((s) => s.id === vShotId);
      if (!vShot) return null;
      return `[用户正在编辑视频: ${vShotId} (集: ${vEpId})]\n` +
        `镜头描述: ${vShot.raw_description}\n` +
        `运镜: ${vShot.camera_movement || "无"}, 时长: ${vShot.duration}s\n` +
        `视频状态: ${vShot.status}\n` +
        `视频URL: ${vShot.video_url || "(未生成)"}\n\n` +
        `如需调整视频参数，请输出修改后的JSON对象。`;
    }

    case "post":
      return `[用户正在编辑后期制作]\n` +
        `字幕: ${project.post_production?.subtitles_srt ? "已有" : "未生成"}\n` +
        `最终输出: ${project.post_production?.final_output || "(未合成)"}\n` +
        `请帮助用户完成后期制作。`;

    default:
      return null;
  }
}

/**
 * 公开的编辑上下文构建函数 — 供 ChatPanel 显示编辑卡片时使用
 */
function buildEditContext(block: SelectedBlock, project: WfProject): {
  title: string;
  fields: { label: string; value: string }[];
  hints: string[];
} | null {
  switch (block.type) {
    case "script": {
      const a = project.script?.analysis;
      if (!a) return { title: "剧本", fields: [{ label: "状态", value: "尚未分析" }], hints: ["输入故事大纲让AI分析"] };
      return {
        title: `剧本: 《${a.title}》`,
        fields: [
          { label: "类型", value: `${a.genre} | ${a.style}` },
          { label: "角色", value: `${a.characters.length} 个` },
          { label: "场景", value: `${a.scenes.length} 个` },
          { label: "分集", value: `${a.episodes.length} 集` },
        ],
        hints: ["增加一个反派角色", "把结局改成大团圆", "增加更多笑点和反转", "优化剧情结构"],
      };
    }
    case "character": {
      const char = project.characters.find((c) => c.id === block.id);
      const ac = project.script?.analysis?.characters.find((c) => c.char_id === block.id);
      if (!char) return null;
      return {
        title: `角色: ${char.name}`,
        fields: [
          { label: "定位", value: ac?.role || "未知" },
          { label: "性格", value: (ac?.personality || "未知").slice(0, 60) + ((ac?.personality || "").length > 60 ? "..." : "") },
          { label: "外貌", value: (typeof ac?.appearance === "string" ? ac.appearance : JSON.stringify(ac?.appearance || "")).slice(0, 60) },
          { label: "三视图", value: `${char.front_view ? "✅" : "⬜"}正面 ${char.side_view ? "✅" : "⬜"}侧面 ${char.back_view ? "✅" : "⬜"}背面` },
        ],
        hints: [`修改${char.name}的外貌描述`, `优化${char.name}的三视图提示词`, `调整${char.name}的性格`, `给${char.name}增加标志性特征`],
      };
    }
    case "scene": {
      const scene = project.scenes.find((s) => s.id === block.id);
      const as2 = project.script?.analysis?.scenes.find((s) => s.scene_id === block.id);
      if (!scene) return null;
      const viewCount = Object.values(scene.views || {}).filter(Boolean).length;
      return {
        title: `场景: ${scene.name}`,
        fields: [
          { label: "描述", value: (as2?.description || scene.description || "").slice(0, 60) },
          { label: "视图", value: `${viewCount}/6 已生成` },
          { label: "状态", value: scene.status },
        ],
        hints: [`修改${scene.name}的环境描述`, `调整${scene.name}的光影氛围`, `优化${scene.name}的六视图提示词`],
      };
    }
    case "shot": {
      const epId = block.episodeId || block.id.split("/")[0];
      const shotId = block.id.includes("/") ? block.id.split("/")[1] : block.id;
      const ep = project.episodes.find((e) => e.id === epId);
      const shot = ep?.shots.find((s) => s.id === shotId);
      if (!shot) return null;
      return {
        title: `镜头 #${shotId}`,
        fields: [
          { label: "景别", value: shot.shot_type || "未设置" },
          { label: "时长", value: `${shot.duration}s` },
          { label: "运镜", value: shot.camera_movement || "无" },
          { label: "对白", value: shot.dialogue || "(无)" },
          { label: "画面", value: (shot.raw_description || "").slice(0, 50) + ((shot.raw_description || "").length > 50 ? "..." : "") },
          { label: "分镜图", value: shot.storyboard_image ? "✅已生成" : "⬜未生成" },
        ],
        hints: ["优化画面描述", "把景别改为特写", "增加角色对白", "调整镜头时长为5秒"],
      };
    }
    case "video": {
      const vEpId2 = block.episodeId || block.id.split("/")[0];
      const vShotId2 = block.id.includes("/") ? block.id.split("/")[1] : block.id;
      const vEp2 = project.episodes.find((e) => e.id === vEpId2);
      const vShot2 = vEp2?.shots.find((s) => s.id === vShotId2);
      if (!vShot2) return null;
      return {
        title: `视频 #${vShotId2}`,
        fields: [
          { label: "运镜", value: vShot2.camera_movement || "无" },
          { label: "时长", value: `${vShot2.duration}s` },
          { label: "状态", value: vShot2.video_url ? "✅已生成" : "⬜未生成" },
        ],
        hints: ["调整运镜为环绕", "修改时长", "加快运动速度", "重新生成视频"],
      };
    }
    case "post":
      return {
        title: "后期制作",
        fields: [
          { label: "字幕", value: project.post_production?.subtitles_srt ? "已有" : "未生成" },
          { label: "输出", value: project.post_production?.final_output || "(未合成)" },
        ],
        hints: ["生成字幕", "开始合成", "调整音量", "导出"],
      };
    default:
      return null;
  }
}

// ---- actions ----

async function loadAiConfig() {
  try {
    const cfg = await fetchConfig();
    const ai = (cfg as unknown as Record<string, unknown>).aiConfig as { chatModel?: string; imageModel?: string } | undefined;
    if (ai) {
      setState({
        aiConfig: {
          chatModel: ai.chatModel || "gemini-2.5-pro",
          imageModel: ai.imageModel || "imagen-4.0-generate-001",
        },
      });
    }
  } catch {
    // use defaults
  }
}

async function loadProject(id: string) {
  setState({ loading: true, error: null });
  try {
    const [project] = await Promise.all([wfGetProject(id), loadAiConfig()]);
    const stageStatuses = inferStageStatuses(project);
    // 推断当前应该在哪个阶段
    let currentStage: WorkflowStage = "script";
    for (const stage of STAGE_ORDER) {
      if (stageStatuses[stage] === "active" || stageStatuses[stage] === "review" || stageStatuses[stage] === "generating") {
        currentStage = stage;
        break;
      }
    }
    // 如果全部 confirmed，停在最后一个 confirmed 阶段
    if (STAGE_ORDER.every((s) => stageStatuses[s] === "confirmed")) {
      currentStage = "post";
    }
    setState({ project, loading: false, chatMessages: project.script?.chat_history || [], stageStatuses, currentStage });
  } catch (err) {
    setState({ loading: false, error: (err as Error).message });
  }
}

async function createProject(title: string, rawInput: string, referenceImages?: string[]): Promise<string> {
  setState({ loading: true, error: null });
  try {
    const project = await wfCreateProject({ title, raw_input: rawInput, reference_images: referenceImages });
    setState({ project, loading: false, chatMessages: [], currentStage: "script" });
    return project.id;
  } catch (err) {
    setState({ loading: false, error: (err as Error).message });
    throw err;
  }
}

async function updateProjectData(patch: Partial<WfProject>) {
  const { project } = getState();
  if (!project) return;
  try {
    const updated = await wfUpdateProject(project.id, patch);
    setState({ project: updated });
  } catch (err) {
    setState({ error: (err as Error).message });
  }
}

async function sendMessage(content: string, model?: string) {
  const { currentStage, project, chatMessages, selectedBlock } = getState();
  const userMsg: ChatMessage = { role: "user", content, timestamp: nowIso(), stage: currentStage };
  const updatedMessages = [...chatMessages, userMsg];
  const STAGE_LABELS_MAP: Record<string, string> = {
    script: "剧本分析", style: "风格定调", character: "角色设计",
    storyboard: "分镜生成", video: "视频生成", post: "后期制作",
  };
  const stageLabel = STAGE_LABELS_MAP[currentStage] || currentStage;
  setState({
    chatMessages: updatedMessages,
    chatLoading: true,
    streamingContent: "",
    stageProgress: { stage: stageLabel, step: "正在构建提示词...", percent: 10, startedAt: Date.now() },
  });

  const systemPrompt = buildSystemPrompt(currentStage, project);
  const apiMessages: { role: string; content: string }[] = [{ role: "system", content: systemPrompt }];

  // 在 script 阶段，将原始剧本文本注入上下文，让 AI 知道要分析什么
  if (currentStage === "script" && project?.script?.raw_input) {
    apiMessages.push({
      role: "system",
      content: `用户提交的原始剧本/故事大纲:\n\n${project.script.raw_input}`,
    });
  }

  if (project?.script?.analysis && currentStage !== "script") {
    apiMessages.push({
      role: "system",
      content: `当前剧本分析数据:\n${JSON.stringify(project.script.analysis, null, 2).slice(0, 8000)}`,
    });
  }

  // 注入 selectedBlock 上下文，让 AI 知道用户正在编辑什么对象
  if (selectedBlock && project) {
    const blockContext = buildSelectedBlockContext(selectedBlock, project);
    if (blockContext) {
      apiMessages.push({
        role: "system",
        content: blockContext,
      });
    }
  }

  for (const msg of updatedMessages.slice(-10)) {
    if (msg.role === "user" || msg.role === "assistant") {
      apiMessages.push({ role: msg.role, content: msg.content });
    }
  }

  try {
    setState({ stageProgress: { stage: stageLabel, step: `AI 正在${stageLabel}...`, percent: 30, startedAt: getState().stageProgress?.startedAt || Date.now() } });
    const fullResponse = await wfAiChatStream(
      { model: model || getState().aiConfig.chatModel, messages: apiMessages },
      (accumulated) => setState({ streamingContent: accumulated }),
    );
    setState({ stageProgress: { stage: stageLabel, step: "正在解析结果...", percent: 80, startedAt: getState().stageProgress?.startedAt || Date.now() } });
    let displayContent = fullResponse;
    const assistantMsg: ChatMessage = { role: "assistant", content: displayContent, timestamp: nowIso(), stage: currentStage };
    const finalMessages = [...updatedMessages, assistantMsg];
    setState({ chatMessages: finalMessages, chatLoading: false, streamingContent: "", stageProgress: null });

    // --- Auto-parse AI response based on current stage ---
    if (currentStage === "script" && project) {
      try {
        const parsed = JSON.parse(extractJson(fullResponse));
        if (parsed.title && parsed.characters && parsed.episodes) {
          // 如果已有剧本分析，先保存版本快照（对话式微调）
          if (project.script?.analysis) {
            wfCreateVersion(project.id, "step3", "AI微调前自动备份").catch((e: unknown) =>
              console.warn("[version] step3 auto-snapshot:", e),
            );
          }
          // Successfully parsed script analysis JSON — replace raw JSON in chat with a summary
          const analysis = parsed as ScriptAnalysis;
          const { characters, scenes, episodes } = convertAnalysisToProjectData(analysis);
          // Update the assistant message to show a summary instead of raw JSON
          assistantMsg.content = `✅ 已生成剧本结构：《${analysis.title}》\n类型：${analysis.genre} | 风格：${analysis.style}\n角色 ${characters.length} 个 · 场景 ${scenes.length} 个 · ${episodes.length} 集`;
          const summaryMessages = [...updatedMessages, assistantMsg];
          setState({ chatMessages: summaryMessages });

          // 从 visual_style_guide 生成 style_config
          const styleGuide = analysis.visual_style_guide || {};
          const stylePromptParts = [
            (styleGuide as Record<string, string>).art_style,
            (styleGuide as Record<string, string>).rendering,
            (styleGuide as Record<string, string>).line_work,
            (styleGuide as Record<string, string>).texture,
          ].filter(Boolean);

          const updatedProject: WfProject = {
            ...project,
            title: analysis.title || project.title,
            status: "scripting",
            script: { ...project.script, analysis, chat_history: finalMessages },
            characters,
            scenes,
            style_guide: analysis.visual_style_guide || null,
            style_config: stylePromptParts.length > 0
              ? {
                  story_type: "drama",
                  art_style_category: analysis.style || "custom",
                  art_substyle: analysis.style || "custom",
                  aspect_ratio: "9:16" as const,
                  duration_sec: 60,
                  language: "中文",
                  shot_duration_sec: 5,
                  compiled_style_prompt: stylePromptParts.join(", "),
                  compiled_negative_prompt: "",
                  prompt_manually_edited: false,
                  prompt_edit_history: [],
                }
              : null,
            episodes,
          };
          setState({ project: updatedProject });

          // Persist to backend
          wfUpdateProject(project.id, updatedProject).catch((e: unknown) => console.warn("[auto-save]", e));

          // 剧本分析完成后自动推进到风格阶段
          setStageStatus("script", "confirmed");
          setStageStatus("style", "active");
          setState({ currentStage: "style" });
          addSystemMessage(
            `剧本分析完成！提取了 ${characters.length} 个角色、${scenes.length} 个场景、${episodes.length} 集。\n` +
            `已自动进入风格配置阶段。`,
          );
          return;
        }
      } catch {
        // Not valid JSON — treat as normal chat message
      }
    }

    // --- Auto-apply: 当 selectedBlock 存在时，尝试解析 AI 回复为编辑指令 ---
    if (selectedBlock && project && currentStage !== "script") {
      try {
        const parsed = JSON.parse(extractJson(fullResponse));
        let applied = false;

        if (selectedBlock.type === "character" && (parsed.char_id || parsed.name || parsed.personality)) {
          updateCharacterDeep(selectedBlock.id, parsed);
          assistantMsg.content = `✅ 已更新角色「${parsed.name || selectedBlock.label || selectedBlock.id}」的属性。需要重新生成三视图吗？`;
          applied = true;
        } else if (selectedBlock.type === "scene" && (parsed.scene_id || parsed.name || parsed.description)) {
          updateSceneDeep(selectedBlock.id, parsed);
          assistantMsg.content = `✅ 已更新场景「${parsed.name || selectedBlock.label || selectedBlock.id}」的属性。需要重新生成视图吗？`;
          applied = true;
        } else if (selectedBlock.type === "shot" && (parsed.shot_type || parsed.visual_prompt || parsed.prompt || parsed.raw_description)) {
          const epId = selectedBlock.episodeId || selectedBlock.id.split("/")[0];
          const shotId = selectedBlock.id.includes("/") ? selectedBlock.id.split("/")[1] : selectedBlock.id;
          updateShotDeep(epId, shotId, parsed);
          assistantMsg.content = `✅ 已更新镜头 #${shotId} 的属性。需要重新生成分镜图吗？`;
          applied = true;
        }

        if (applied) {
          const editMessages = [...updatedMessages, assistantMsg];
          setState({ chatMessages: editMessages, chatLoading: false, streamingContent: "", stageProgress: null });
          if (project) {
            wfUpdateProject(project.id, { script: { ...project.script, chat_history: editMessages } } as Partial<WfProject>).catch((e: unknown) => console.warn("[auto-save]", e));
          }
          return;
        }
      } catch {
        // Not JSON — treat as normal chat message
      }
    }

    // Persist chat history
    if (project) {
      wfUpdateProject(project.id, { script: { ...project.script, chat_history: finalMessages } } as Partial<WfProject>).catch((e: unknown) => console.warn("[auto-save]", e));
    }
  } catch (err) {
    const errorMsg: ChatMessage = { role: "assistant", content: `[错误] ${(err as Error).message}`, timestamp: nowIso(), stage: currentStage };
    setState({ chatMessages: [...updatedMessages, errorMsg], chatLoading: false, streamingContent: "", stageProgress: null });
  }
}

/**
 * 直接调用 analyzeScript（完整提示词 + 校验），
 * 用于「重新生成」和「分析这个故事」按钮。
 */
async function regenerateScript() {
  const project = getState().project;
  if (!project) return;
  const rawInput = project.script?.raw_input;
  if (!rawInput) {
    addSystemMessage("请先在对话框中输入故事内容，然后再分析。");
    return;
  }

  setState({ chatLoading: true, stageProgress: { stage: "剧本分析", step: "AI 正在剧本分析...", percent: 30, startedAt: Date.now() } });
  addSystemMessage("正在使用完整分析引擎重新分析剧本...");

  try {
    const analysis = await analyzeScript(
      rawInput,
      (text) => setState({ streamingContent: text }),
      project.style_config,
    );
    setState({ stageProgress: { stage: "剧本分析", step: "正在解析结果...", percent: 80, startedAt: getState().stageProgress?.startedAt || Date.now() } });

    const { characters, scenes, episodes } = convertAnalysisToProjectData(analysis);

    // 从 visual_style_guide 生成 style_config
    const styleGuide = analysis.visual_style_guide || {};
    const stylePromptParts = [
      (styleGuide as Record<string, string>).art_style,
      (styleGuide as Record<string, string>).rendering,
      (styleGuide as Record<string, string>).line_work,
      (styleGuide as Record<string, string>).texture,
    ].filter(Boolean);

    const updatedProject: WfProject = {
      ...project,
      title: analysis.title || project.title,
      status: "scripting",
      script: { ...project.script, analysis },
      characters,
      scenes,
      style_guide: analysis.visual_style_guide || null,
      style_config: stylePromptParts.length > 0
        ? {
            story_type: "drama",
            art_style_category: analysis.style || "custom",
            art_substyle: analysis.style || "custom",
            aspect_ratio: "9:16" as const,
            duration_sec: 60,
            language: "中文",
            shot_duration_sec: 5,
            compiled_style_prompt: stylePromptParts.join(", "),
            compiled_negative_prompt: "",
            prompt_manually_edited: false,
            prompt_edit_history: [],
          }
        : project.style_config,
      episodes,
    };
    setState({ project: updatedProject, chatLoading: false, streamingContent: "", stageProgress: null });
    wfUpdateProject(project.id, updatedProject).catch((e: unknown) => console.warn("[auto-save]", e));

    setStageStatus("script", "confirmed");
    setStageStatus("character", "active");
    setState({ currentStage: "script" }); // 留在 script 页面让用户确认风格

    const totalShots = episodes.reduce((s, ep) => s + ep.shots.length, 0);
    addSystemMessage(
      `✅ 剧本分析完成！提取了 ${characters.length} 个角色、${scenes.length} 个场景、${episodes.length} 集、${totalShots} 个镜头。\n` +
      `请在下方确认风格配置后进入角色设计。`,
    );
  } catch (err) {
    setState({ chatLoading: false, streamingContent: "", stageProgress: null });
    addSystemMessage(`[错误] 剧本分析失败: ${(err as Error).message}`);
  }
}

// ---- Generation actions ----

async function generateCharacterImages(imageModel?: string) {
  const model = imageModel || getState().aiConfig.imageModel;
  const { project } = getState();
  if (!project?.script?.analysis) {
    addSystemMessage("请先完成剧本分析再生成角色三视图。");
    return;
  }

  addSystemMessage("开始生成角色三视图...");
  const analysisChars = project.script.analysis.characters;

  // 风格前缀
  const fullStylePrompt = project.style_config?.compiled_style_prompt
    || "anime illustration style, 2D character design, manga art style";
  const stylePrefix = fullStylePrompt.split(",").slice(0, 3).map((s) => s.trim()).join(", ");

  for (let i = 0; i < analysisChars.length; i++) {
    const ac = analysisChars[i];
    const charIndex = project.characters.findIndex((c) => c.id === ac.char_id);
    if (charIndex === -1) continue;

    addSystemMessage(`正在生成角色 ${ac.name} 的三视图 (${i + 1}/${analysisChars.length})...`);
    updateCharacter(ac.char_id, { status: "generating" });

    // 使用 visual_prompt_template（最完整的角色描述），避免与 identity 重复
    const characterDesc = ac.visual_prompt_template
      || ac.three_view_prompts?.front
      || (() => {
        const parts: string[] = [];
        const { appearance, costume } = ac;
        if (appearance) {
          if (appearance.face) parts.push(appearance.face);
          if (appearance.hair) parts.push(appearance.hair);
          if (appearance.body) parts.push(appearance.body);
          if (appearance.clothing) parts.push(appearance.clothing);
        }
        if (costume) {
          if (costume.main_outfit) parts.push(costume.main_outfit);
        }
        return parts.join(", ");
      })();

    // 构建三视图角色设定提示词 — 关键指令放首尾，角色描述缩短放中间
    const charDesc = characterDesc.slice(0, 300);
    const turnAroundPrompt = `character model sheet turnaround, front view, side view, back view, three full body standing poses of the same character from different angles, ${charDesc}, full body head to toe, white background, no text, character design turnaround sheet, ${stylePrefix}`;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await wfGenerateImage({
          model,
          prompt: turnAroundPrompt,
          n: 1,
          size: "1536x1024",  // 横向宽图，容纳三个视角
          project_id: project.id,
          asset_filename: `${ac.char_id}_turnaround.png`,
        });
        const url = result.saved_assets?.[0]?.asset_url || result.data?.[0]?.url || null;
        if (url) {
          // 三个视角槽位都使用同一张 turnaround sheet
          updateCharacter(ac.char_id, { front_view: url, side_view: url, back_view: url } as Partial<WfCharacter>);
        }
        break;
      } catch (err) {
        addSystemMessage(`生成 ${ac.name} 角色设计图失败: ${(err as Error).message}`);
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
        }
      }
    }

    updateCharacter(ac.char_id, { status: "done" });
    addSystemMessage(`角色 ${ac.name} 三视图生成完成。`);
  }

  // Persist
  const updated = getState().project;
  if (updated) {
    wfUpdateProject(updated.id, { characters: updated.characters }).catch((e: unknown) => console.warn("[auto-save]", e));
  }
  addSystemMessage('所有角色三视图生成完毕！接下来可以生成场景六视图或分镜图。');
}

async function generateSceneImages(imageModel?: string) {
  const model = imageModel || getState().aiConfig.imageModel;
  const { project } = getState();
  if (!project?.script?.analysis) {
    addSystemMessage("请先完成剧本分析再生成场景视图。");
    return;
  }

  addSystemMessage("开始生成场景六视图...");
  const analysisScenes = project.script.analysis.scenes;

  for (let i = 0; i < analysisScenes.length; i++) {
    const as = analysisScenes[i];
    const sceneIndex = project.scenes.findIndex((s) => s.id === as.scene_id);
    if (sceneIndex === -1) continue;

    addSystemMessage(`正在生成场景 ${as.name} 的六视图 (${i + 1}/${analysisScenes.length})...`);
    updateScene(as.scene_id, { status: "generating" });

    const viewKeys = ["front", "back", "left", "right", "top", "detail"];
    const newViews: Record<string, string | null> = {};

    for (const view of viewKeys) {
      const prompt = as.six_view_prompts?.[view];
      if (!prompt) continue;

      try {
        const result = await wfGenerateImage({
          model,
          prompt,
          n: 1,
          size: "1920x1080",
          project_id: project.id,
          asset_filename: `${as.scene_id}_${view}.png`,
        });
        const url = result.saved_assets?.[0]?.asset_url || result.data?.[0]?.url || null;
        newViews[view] = url;
      } catch (err) {
        addSystemMessage(`生成 ${as.name} ${view} 视图失败: ${(err as Error).message}`);
        newViews[view] = null;
      }
    }

    updateScene(as.scene_id, { views: newViews, status: "done" });
    addSystemMessage(`场景 ${as.name} 六视图生成完成。`);
  }

  const updated = getState().project;
  if (updated) {
    wfUpdateProject(updated.id, { scenes: updated.scenes }).catch((e: unknown) => console.warn("[auto-save]", e));
  }
  addSystemMessage("所有场景六视图生成完毕！");
}

/** 确认提示词后生成单个场景的六视图 */
async function generateSingleSceneImages(sceneId: string, imageModel?: string) {
  const model = imageModel || getState().aiConfig.imageModel;
  const { project } = getState();
  if (!project?.script?.analysis) {
    addSystemMessage("请先完成剧本分析再生成场景视图。");
    return;
  }

  const as = project.script.analysis.scenes.find((s) => s.scene_id === sceneId);
  if (!as) {
    addSystemMessage(`未找到场景 ${sceneId} 的分析数据。`);
    return;
  }

  addSystemMessage(`正在生成场景「${as.name}」的六视图...`);
  updateScene(sceneId, { status: "generating" });

  const viewKeys = ["front", "back", "left", "right", "top", "detail"];
  const newViews: Record<string, string | null> = {};

  for (const view of viewKeys) {
    const prompt = as.six_view_prompts?.[view];
    if (!prompt) continue;

    try {
      const result = await wfGenerateImage({
        model,
        prompt,
        n: 1,
        size: "1920x1080",
        project_id: project.id,
        asset_filename: `${sceneId}_${view}.png`,
      });
      const url = result.saved_assets?.[0]?.asset_url || result.data?.[0]?.url || null;
      newViews[view] = url;
    } catch (err) {
      addSystemMessage(`生成 ${as.name} ${view} 视图失败: ${(err as Error).message}`);
      newViews[view] = null;
    }
  }

  updateScene(sceneId, { views: newViews, status: "done" });
  addSystemMessage(`场景「${as.name}」六视图生成完成。`);

  const updated = getState().project;
  if (updated) {
    wfUpdateProject(updated.id, { scenes: updated.scenes }).catch((e: unknown) => console.warn("[auto-save]", e));
  }
}

/** 重新生成单个角色的三视图（与分镜/视频的重新生成行为一致） */
async function regenerateCharacterAction(charId: string, imageModel?: string) {
  const model = imageModel || getState().aiConfig.imageModel;
  const { project } = getState();
  if (!project?.script?.analysis) {
    addSystemMessage("请先完成剧本分析。");
    return;
  }
  const ac = project.script.analysis.characters.find((c) => c.char_id === charId);
  if (!ac) {
    addSystemMessage(`找不到角色 ${charId}。`);
    return;
  }

  addSystemMessage(`正在重新生成角色「${ac.name}」的三视图...`);
  updateCharacter(charId, { status: "generating" });

  // 风格前缀：只取前 3 个关键词，防止组合后超出 API 字符限制
  const fullStylePrompt = project.style_config?.compiled_style_prompt
    || "anime illustration style, 2D character design, manga art style";
  const stylePrefix = fullStylePrompt.split(",").slice(0, 3).map((s) => s.trim()).join(", ");

  for (const view of ["front", "side", "back"] as const) {
    const rawPrompt = ac.three_view_prompts[view];
    if (!rawPrompt) continue;
    const topKw = stylePrefix.split(",")[0]?.trim();
    const prompt = (topKw && !rawPrompt.includes(topKw)
      ? `${stylePrefix}, ${rawPrompt}`
      : rawPrompt
    ).slice(0, 900);
    try {
      const result = await wfGenerateImage({
        model,
        prompt,
        n: 1,
        size: "1024x1536",
        project_id: project.id,
        asset_filename: `${charId}_${view}_${Date.now()}.png`,
      });
      const url = result.saved_assets?.[0]?.asset_url || result.data?.[0]?.url || null;
      if (url) {
        updateCharacter(charId, { [`${view}_view`]: url } as Partial<WfCharacter>);
      }
    } catch (err) {
      addSystemMessage(`重新生成 ${ac.name} ${view} 视图失败: ${(err as Error).message}`);
    }
  }

  updateCharacter(charId, { status: "done" });
  addSystemMessage(`角色「${ac.name}」三视图重新生成完成。`);

  const updated = getState().project;
  if (updated) {
    wfUpdateProject(updated.id, { characters: updated.characters }).catch((e: unknown) => console.warn("[auto-save]", e));
  }
}

async function generateStoryboardImages(imageModel?: string) {
  const model = imageModel || getState().aiConfig.imageModel;
  const { project } = getState();
  if (!project?.episodes.length) {
    addSystemMessage("请先完成剧本分析再生成分镜图。");
    return;
  }

  addSystemMessage("开始生成分镜图...");
  let total = 0;
  let done = 0;
  for (const ep of project.episodes) total += ep.shots.length;

  if (total === 0) {
    addSystemMessage("⚠️ 所有集的镜头(shots)数据为空，正在自动补充镜头数据...");
    // 自动发起AI请求补充 shots
    try {
      const analysis = project.script?.analysis;
      if (!analysis) {
        addSystemMessage("❌ 无法补充镜头：缺少剧本分析数据。请回到「剧本」阶段重新分析。");
        return;
      }
      const supplementPrompt =
        `当前剧本分析数据中 episodes 的 scenes 缺少 shots 数组。请基于以下已有数据，为每集的每个场景补充详细的 shots 镜头数据。\n\n` +
        `已有数据：\n${JSON.stringify(analysis, null, 2).slice(0, 6000)}\n\n` +
        `要求：\n` +
        `1. 保持原有的 episodes/scenes 结构不变\n` +
        `2. 为每个 scene 添加 shots 数组，每个 scene 至少 2 个 shot\n` +
        `3. 每个 shot 必须包含: shot_type, subject, action, camera_movement, duration, visual_prompt\n` +
        `4. visual_prompt 必须用英文，按 SeedEdit 2.0 公式\n` +
        `5. 只输出完整的 JSON（与原剧本分析格式相同），不要代码块标记`;
      setState({ chatLoading: true });
      addSystemMessage("正在让 AI 补充镜头数据，请稍等...");
      const { extractJson } = await import("./workflow-engine");
      const { convertAnalysisToProjectData } = await import("./workflow-engine");
      const fullResponse = await wfAiChatStream(
        { model: getState().aiConfig.chatModel, messages: [
          { role: "system", content: "你是专业的影视分镜师。用户会给你一个缺少 shots 的剧本分析 JSON，你需要补充完整的 shots 数据后返回完整 JSON。" },
          { role: "user", content: supplementPrompt },
        ] },
        () => {},
      );
      const parsed = JSON.parse(extractJson(fullResponse)) as ScriptAnalysis;
      if (parsed.episodes) {
        const { episodes } = convertAnalysisToProjectData(parsed);
        const totalShots = episodes.reduce((s, ep) => s + ep.shots.length, 0);
        if (totalShots > 0) {
          const updatedProject = { ...getState().project!, episodes };
          setState({ project: updatedProject, chatLoading: false });
          wfUpdateProject(updatedProject.id, { episodes }).catch((e: unknown) => console.warn("[auto-save]", e));
          addSystemMessage(`✅ 已自动补充 ${totalShots} 个镜头。重新开始生成分镜图...`);
          // 递归重新调用
          generateStoryboardImages(imageModel);
          return;
        }
      }
      setState({ chatLoading: false });
      addSystemMessage("❌ AI 补充镜头失败，请回到「剧本」阶段手动重新分析。");
      return;
    } catch (err) {
      setState({ chatLoading: false });
      addSystemMessage(`❌ 自动补充镜头失败: ${(err as Error).message}。请回到「剧本」阶段重新分析。`);
      return;
    }
  }

  // 构建所有镜头的扁平列表，用于叙事上下文
  const allShots = project.episodes.flatMap((ep) => ep.shots);
  // 前帧参考链：记录上一个成功生成的分镜图 URL
  let prevStoryboardUrl: string | null = null;

  for (const ep of project.episodes) {
    for (const shot of ep.shots) {
      done++;
      // 跳过已有真实图片的镜头（非空、非 1×1 占位图）
      if (shot.storyboard_image && !shot.storyboard_image.startsWith("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB")) {
        addSystemMessage(`分镜 ${done}/${total} 已有图片，跳过: ${shot.id}`);
        prevStoryboardUrl = shot.storyboard_image; // 记住已有图片，供下一帧参考
        continue;
      }
      addSystemMessage(`正在生成分镜 ${done}/${total}: ${shot.raw_description.slice(0, 30)}...`);
      updateShot(ep.id, shot.id, { status: "storyboard" });

      // 构建叙事上下文（前后镜头的动作）
      const shotIdx = allShots.findIndex((s) => s.id === shot.id);
      const prevShot = shotIdx > 0 ? allShots[shotIdx - 1] : undefined;
      const nextShot = shotIdx < allShots.length - 1 ? allShots[shotIdx + 1] : undefined;
      const narrativeContext = {
        shotIndex: shotIdx + 1,
        totalShots: allShots.length,
        prevAction: prevShot?.action || prevShot?.raw_description,
        nextAction: nextShot?.action || nextShot?.raw_description,
      };

      // 使用公共增强函数：注入风格前缀 + 角色外貌 + 参考图 + 叙事上下文
      const { prompt: storyboardPrompt, refImageUrls } = buildEnhancedStoryboardPrompt(shot, project, narrativeContext);

      // 前帧参考链：把上一帧的图片加入参考图列表（排在角色三视图之后）
      const allRefUrls = [...refImageUrls];
      if (prevStoryboardUrl && !prevStoryboardUrl.startsWith("data:")) {
        allRefUrls.push(prevStoryboardUrl);
      }

      // 最多重试 1 次（共 2 次尝试）
      let storyboardSuccess = false;
      for (let attempt = 0; attempt < 2 && !storyboardSuccess; attempt++) {
        try {
          if (attempt > 0) addSystemMessage(`分镜 ${shot.id} 重试中...`);
          const result = await wfGenerateImage({
            model,
            prompt: storyboardPrompt,
            n: 1,
            size: "1080x1920",
            project_id: project.id,
            asset_filename: `storyboard_${shot.id}.png`,
            // 角色三视图 + 前帧参考图，双重锚定一致性
            ...(allRefUrls.length > 0 ? { reference_image_urls: allRefUrls } : {}),
          });
          const url = result.saved_assets?.[0]?.asset_url || result.data?.[0]?.url || null;
          updateShot(ep.id, shot.id, { storyboard_image: url, status: url ? "storyboard" : "draft" });
          // 更新前帧参考链
          if (url) prevStoryboardUrl = url;
          // 立即持久化，防止刷新丢失
          const snap = getState().project;
          if (snap) wfUpdateProject(snap.id, { episodes: snap.episodes }).catch((e: unknown) => console.warn("[storyboard-save]", e));
          storyboardSuccess = true;
        } catch (err) {
          if (attempt === 1) {
            addSystemMessage(`分镜 ${shot.id} 生成失败: ${(err as Error).message}`);
            updateShot(ep.id, shot.id, { status: "failed" });
          } else {
            await new Promise((r) => setTimeout(r, 3000));
          }
        }
      }
    }
  }

  // Persist
  const updated = getState().project;
  if (updated) {
    wfUpdateProject(updated.id, { episodes: updated.episodes }).catch((e: unknown) => console.warn("[auto-save]", e));
  }
  // 分镜完成后自动确认并推进到视频阶段（两种模式统一行为）
  setStageStatus("storyboard", "confirmed");
  setStageStatus("video", "active");
  setState({ currentStage: "video" });
  addSystemMessage(`分镜图全部生成完毕！共 ${total} 帧。已自动进入视频生成阶段。`);
}

/**
 * 从三视图专用提示词中提取纯外貌描述，剥离摄影参数和模板指令。
 * 输入示例: "85mm lens, f/4, character design sheet, front view, full body, a young Chinese scholar..."
 * 输出示例: "a young Chinese scholar..."
 */
function extractAppearanceFromCharPrompt(raw: string): string {
  if (!raw) return "";
  // 移除三视图模板关键词和摄影参数
  const stripPatterns = [
    /\d+mm\s+lens/gi, /f\/[\d.]+/gi,
    /character\s+(design\s+)?sheet/gi, /model\s+sheet/gi, /turnaround/gi,
    /front\s+view/gi, /side\s+view/gi, /back\s+view/gi, /full\s+body/gi,
    /white\s+background/gi, /cinematic\s+lighting/gi, /studio\s+lighting/gi,
    /high\s+quality/gi, /detailed/gi, /no\s+text/gi,
  ];
  let cleaned = raw;
  for (const p of stripPatterns) {
    cleaned = cleaned.replace(p, "");
  }
  // 清理多余逗号和空格
  cleaned = cleaned.replace(/,\s*,+/g, ",").replace(/^\s*,\s*/, "").replace(/\s*,\s*$/, "").replace(/\s{2,}/g, " ").trim();
  return cleaned;
}

/**
 * 构建增强的分镜提示词 — 注入角色外貌、参考图 URL、统一风格前缀
 * 供 generateStoryboardImages / regenerateSingleStoryboard 共用，保持逻辑一致
 */
function buildEnhancedStoryboardPrompt(
  shot: WfShot,
  project: WfProject,
  narrativeContext?: { shotIndex: number; totalShots: number; prevAction?: string; nextAction?: string },
): { prompt: string; refImageUrls: string[] } {
  // 1. 风格前缀（与角色三视图使用完全相同的 stylePrefix，保持视觉一致）
  const fullStylePrompt = project.style_config?.compiled_style_prompt
    || "anime illustration style, manga art style, clean lineart, vibrant colors";
  const styleTop3 = fullStylePrompt.split(",").slice(0, 3).map((s: string) => s.trim()).join(", ");

  let storyboardPrompt = shot.prompt || shot.visual_prompt || shot.raw_description;

  // 1.5 叙事上下文注入：让分镜图知道自己在故事中的位置
  if (narrativeContext) {
    const ctxParts: string[] = [];
    ctxParts.push(`[Shot ${narrativeContext.shotIndex}/${narrativeContext.totalShots}]`);
    if (narrativeContext.prevAction) {
      ctxParts.push(`previous shot: ${narrativeContext.prevAction.slice(0, 60)}`);
    }
    if (narrativeContext.nextAction) {
      ctxParts.push(`next shot: ${narrativeContext.nextAction.slice(0, 60)}`);
    }
    if (shot.emotion) ctxParts.push(`mood: ${shot.emotion}`);
    storyboardPrompt = `${ctxParts.join(", ")}, ${storyboardPrompt}`;
  }

  // 2. 将角色 ID（char_001 等）替换为角色纯外貌描述，同时收集参考图 URL
  const analysisChars = project.script?.analysis?.characters || [];
  const refImageUrls: string[] = [];
  const collectedCharIds = new Set<string>();
  for (const ac of analysisChars) {
    const charId = ac.char_id;
    const rawCharDesc = ac.visual_prompt_template || ac.three_view_prompts?.front || "";
    const appearanceParts: string[] = [];
    if (ac.appearance) {
      if (ac.appearance.face) appearanceParts.push(ac.appearance.face);
      if (ac.appearance.hair) appearanceParts.push(ac.appearance.hair);
      if (ac.appearance.body) appearanceParts.push(ac.appearance.body);
      if ((ac.appearance as Record<string, string>).clothing) appearanceParts.push((ac.appearance as Record<string, string>).clothing);
    }
    const charDesc = appearanceParts.length > 0
      ? appearanceParts.join(", ")
      : extractAppearanceFromCharPrompt(rawCharDesc);
    // 如果提示词中有 charId 引用，替换为外貌描述
    if (charDesc && storyboardPrompt.includes(charId)) {
      const shortDesc = charDesc.slice(0, 120);
      storyboardPrompt = storyboardPrompt.replace(
        new RegExp(charId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "g"),
        `(${ac.name}: ${shortDesc})`
      );
      collectedCharIds.add(charId);
    }
    // 始终收集所有角色的三视图作为参考图（即使 prompt 中没有 charId 引用）
    const wfChar = project.characters.find((c) => c.id === charId);
    if (wfChar?.front_view && !wfChar.front_view.startsWith("data:")) {
      refImageUrls.push(wfChar.front_view);
      collectedCharIds.add(charId);
    }
  }
  // 补充：通过 shot.character_ids 收集出镜角色的参考图（兜底）
  if (shot.character_ids?.length) {
    for (const cid of shot.character_ids) {
      if (collectedCharIds.has(cid)) continue;
      const wfChar = project.characters.find((c) => c.id === cid);
      if (wfChar?.front_view && !wfChar.front_view.startsWith("data:")) {
        refImageUrls.push(wfChar.front_view);
      }
    }
  }

  // 3. 过滤冲突关键词：写实风格 + 三视图专用术语（可能从 shot.prompt 中泄漏）
  const conflictingPatterns = [
    // 写实风格词
    /cinematic/gi, /realistic/gi, /photorealistic/gi, /raw\s+photo/gi,
    /ultra\s+realistic/gi, /hyperrealistic/gi, /film\s+grain/gi, /movie\s+still/gi,
    // 三视图专用术语（不应出现在场景描述中）
    /\d+mm\s+lens/gi, /f\/[\d.]+/gi, /character\s+(design\s+)?sheet/gi,
    /model\s+sheet/gi, /turnaround/gi, /white\s+background/gi,
    /front\s+view/gi, /side\s+view/gi, /back\s+view/gi,
    /cinematic\s+lighting/gi, /studio\s+lighting/gi,
  ];
  for (const pat of conflictingPatterns) {
    storyboardPrompt = storyboardPrompt.replace(pat, "");
  }
  storyboardPrompt = storyboardPrompt.replace(/,\s*,+/g, ",").replace(/^\s*,/, "").replace(/,\s*$/, "");

  // 4. 注入风格前缀（与三视图保持一致）
  const topKeyword = styleTop3.split(",")[0]?.trim();
  if (topKeyword && !storyboardPrompt.includes(topKeyword)) {
    storyboardPrompt = `${styleTop3}, ${storyboardPrompt}`;
  }

  // 5. 添加角色一致性强化指令
  if (refImageUrls.length > 0) {
    storyboardPrompt += ", maintain exact character design from reference sheet, same face and outfit";
  }

  storyboardPrompt = storyboardPrompt.replace(/\s{2,}/g, " ").trim().slice(0, 1200);

  return { prompt: storyboardPrompt, refImageUrls };
}

async function regenerateSingleStoryboard(episodeId: string, shotId: string) {
  const { project, aiConfig } = getState();
  if (!project) return;
  const ep = project.episodes.find((e) => e.id === episodeId);
  const shot = ep?.shots.find((s) => s.id === shotId);
  if (!shot) return;

  addSystemMessage(`正在重新生成分镜: ${shot.raw_description.slice(0, 30)}...`);
  updateShot(episodeId, shotId, { status: "storyboard" });

  // 构建叙事上下文
  const allShots = project.episodes.flatMap((e) => e.shots);
  const shotIdx = allShots.findIndex((s) => s.id === shotId);
  const prevShot = shotIdx > 0 ? allShots[shotIdx - 1] : undefined;
  const nextShot = shotIdx < allShots.length - 1 ? allShots[shotIdx + 1] : undefined;
  const narrativeCtx = {
    shotIndex: shotIdx + 1,
    totalShots: allShots.length,
    prevAction: prevShot?.action || prevShot?.raw_description,
    nextAction: nextShot?.action || nextShot?.raw_description,
  };

  // 使用公共增强函数，注入风格+角色+参考图+叙事上下文
  const { prompt: enhancedPrompt, refImageUrls } = buildEnhancedStoryboardPrompt(shot, project, narrativeCtx);

  try {
    const result = await wfGenerateImage({
      model: aiConfig.imageModel,
      prompt: enhancedPrompt,
      n: 1,
      size: "1080x1920",
      project_id: project.id,
      asset_filename: `storyboard_${shot.id}_${Date.now()}.png`,
      ...(refImageUrls.length > 0 ? { reference_image_urls: refImageUrls } : {}),
    });
    const url = result.saved_assets?.[0]?.asset_url || result.data?.[0]?.url || null;
    updateShot(episodeId, shotId, { storyboard_image: url, status: url ? "storyboard" : "failed" });
    addSystemMessage(url ? "分镜重新生成完成。" : "分镜重新生成失败。");
  } catch (err) {
    updateShot(episodeId, shotId, { status: "failed" });
    addSystemMessage(`分镜重新生成失败: ${(err as Error).message}`);
  }

  const updated = getState().project;
  if (updated) wfUpdateProject(updated.id, { episodes: updated.episodes }).catch((e: unknown) => console.warn("[auto-save]", e));
}

/**
 * 串联提示词组装：沿画布链路收集 角色→场景→分镜 的详细提示词
 * shot.prompt / visual_prompt 优先，再追加角色外貌 + 场景灯光摘要
 */
function assembleVideoPrompt(shot: WfShot, project: WfProject): string {
  // 0. 风格前缀：与分镜/三视图保持一致
  const fullStylePrompt = project.style_config?.compiled_style_prompt || "";
  const styleTop3 = fullStylePrompt.split(",").slice(0, 3).map((s: string) => s.trim()).filter(Boolean).join(", ");

  // 1. 分镜级：优先使用详细提示词
  let base = shot.prompt || shot.visual_prompt || shot.raw_description;

  // 1.5 注入视频专属镜头语言（动作、景别、运镜、构图、情绪）
  const cinematicParts: string[] = [];

  // 动作描述（视频最核心的运动语义）
  if (shot.action) cinematicParts.push(shot.action);

  // 景别转自然语言
  const SHOT_TYPE_DESC: Record<string, string> = {
    WS: "wide shot", EWS: "extreme wide shot",
    MS: "medium shot", MCU: "medium close-up",
    CU: "close-up", ECU: "extreme close-up",
    OTS: "over-the-shoulder", POV: "point of view",
  };
  if (shot.shot_type) {
    const stDesc = SHOT_TYPE_DESC[shot.shot_type] || `${shot.shot_type} shot`;
    if (!base.toLowerCase().includes(stDesc)) cinematicParts.push(stDesc);
  }

  // 运镜文本描述
  const CAMERA_DESC: Record<string, string> = {
    push_in_slow: "slow push in", pull_back: "pull back",
    pan_left: "pan left", pan_right: "pan right",
    orbit: "orbiting camera", static: "static shot",
    handheld: "handheld camera", handheld_subtle: "subtle handheld sway",
    tilt_up: "tilt up", tilt_down: "tilt down",
    crane_down: "crane down", crane_down_fast: "fast crane down",
    crane_up: "crane up", pan_down: "pan down",
    vertical_descend_slow: "slow vertical descent",
    dolly_in: "dolly in", dolly_out: "dolly out",
    tracking: "tracking shot",
  };
  if (shot.camera_movement) {
    const camDesc = CAMERA_DESC[shot.camera_movement] || shot.camera_movement.replace(/_/g, " ");
    cinematicParts.push(`camera movement: ${camDesc}`);
  }

  // 构图
  if (shot.composition) cinematicParts.push(`composition: ${shot.composition}`);

  // 打光（shot 级比 scene 级更精确）
  if (shot.lighting_note) cinematicParts.push(`lighting: ${shot.lighting_note}`);

  // 情绪基调
  if (shot.emotion) cinematicParts.push(`mood: ${shot.emotion}`);

  // 景深（从 optics 提取语义）
  if (shot.optics) {
    const fMatch = shot.optics.match(/f\/([\d.]+)/);
    if (fMatch && parseFloat(fMatch[1]) <= 2.0) {
      cinematicParts.push("shallow depth of field, bokeh background");
    }
  }

  if (cinematicParts.length > 0) {
    base += ", " + cinematicParts.join(", ");
  }

  // 2. 角色级：将 char_xxx ID 替换为角色纯外貌描述（剥离三视图/摄影术语）
  const analysisChars = project.script?.analysis?.characters || [];
  for (const ac of analysisChars) {
    const charId = ac.char_id;
    const rawCharDesc = ac.visual_prompt_template || ac.three_view_prompts?.front || "";
    const appearanceParts: string[] = [];
    if (ac.appearance) {
      if (ac.appearance.face) appearanceParts.push(ac.appearance.face);
      if (ac.appearance.hair) appearanceParts.push(ac.appearance.hair);
      if (ac.appearance.body) appearanceParts.push(ac.appearance.body);
      if ((ac.appearance as Record<string, string>).clothing) appearanceParts.push((ac.appearance as Record<string, string>).clothing);
    }
    const charDesc = appearanceParts.length > 0
      ? appearanceParts.join(", ")
      : extractAppearanceFromCharPrompt(rawCharDesc);
    if (charDesc && base.includes(charId)) {
      const shortDesc = charDesc.slice(0, 120);
      base = base.replace(
        new RegExp(charId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "g"),
        `(${ac.name}: ${shortDesc})`
      );
    }
  }

  // 追加出镜角色外貌（兜底：如果 prompt 中没有角色 ID 引用）
  if (shot.character_ids?.length) {
    const charHints = shot.character_ids
      .map((id) => {
        const ac = analysisChars.find((c) => c.char_id === id);
        if (ac) {
          const parts: string[] = [];
          if (ac.appearance?.face) parts.push(ac.appearance.face);
          if (ac.appearance?.hair) parts.push(ac.appearance.hair);
          if (ac.appearance?.body) parts.push(ac.appearance.body);
          if ((ac.appearance as Record<string, string>)?.clothing) parts.push((ac.appearance as Record<string, string>).clothing);
          if ((ac.appearance as Record<string, string>)?.skin_tone) parts.push((ac.appearance as Record<string, string>).skin_tone);
          return parts.length > 0 ? `${ac.name}: ${parts.join(", ")}`.slice(0, 200) : extractAppearanceFromCharPrompt(ac.visual_prompt_template || ac.three_view_prompts?.front || "").slice(0, 200);
        }
        const wc = project.characters.find((c) => c.id === id);
        return wc?.appearance_prompt ? extractAppearanceFromCharPrompt(wc.appearance_prompt).slice(0, 200) : undefined;
      })
      .filter(Boolean);
    if (charHints.length) base += `, characters: ${charHints.join("; ")}`;
  }

  // 3. 场景级：注入灯光氛围
  if (shot.scene_id) {
    const scene = project.scenes.find((s) => s.id === shot.scene_id);
    if (scene?.lighting) {
      const mood = scene.lighting.mood || scene.lighting.ambient;
      if (mood) base += `, lighting: ${mood}`;
    }
  }

  // 3.5 过滤冲突写实关键词（与分镜生成一致）— 防止 visual_prompt 中残留的写实词污染视频
  const conflictingPatterns = [
    /\brealistic\b/gi, /\bphotorealistic\b/gi, /\braw\s+photo\b/gi,
    /\bultra\s+realistic\b/gi, /\bhyperrealistic\b/gi, /\bfilm\s+grain\b/gi, /\bmovie\s+still\b/gi,
    /\breal\s+human\b/gi, /\breal\s+person\b/gi, /\breal\s+face\b/gi, /\bphoto\b/gi,
    /\d+mm\s+lens/gi, /f\/[\d.]+/gi,
    /\bcharacter\s+(design\s+)?sheet\b/gi, /\bmodel\s+sheet\b/gi, /\bturnaround\b/gi,
    /\bwhite\s+background\b/gi, /\bfront\s+view\b/gi, /\bside\s+view\b/gi, /\bback\s+view\b/gi,
  ];
  for (const pat of conflictingPatterns) {
    base = base.replace(pat, "");
  }
  base = base.replace(/,\s*,+/g, ",").replace(/^\s*,/, "").replace(/,\s*$/, "");

  // 4. 注入风格前缀（与分镜/三视图一致的画风锚点）
  if (styleTop3) {
    const topKeyword = styleTop3.split(",")[0]?.trim();
    if (topKeyword && !base.includes(topKeyword)) {
      base = `${styleTop3}, ${base}`;
    }
  }

  // 5. 首帧存在时，强化画风 + 角色一致性指令
  if (shot.storyboard_image) {
    const charNames = shot.character_ids
      ?.map((id) => analysisChars.find((c) => c.char_id === id)?.name)
      .filter(Boolean);
    base += ", strictly follow the first frame image: same characters";
    if (charNames?.length) base += ` (${charNames.join(", ")})`;
    base += ", same face features, same hairstyle, same outfit, same art style and color palette throughout the entire video, DO NOT change character appearance or art style mid-video";
  }

  // 6. 明确禁止字幕、写实化、文字叠加
  base += ", no subtitles, no text overlay, no watermark, no captions, no speech bubbles, no background music, silent video, NOT photorealistic, NOT real human faces";

  return base;
}

/** 收集镜头出镜角色的三视图 URL 作为视频生成参考图 */
function collectCharRefImagesForVideo(shot: WfShot, project: WfProject): string[] {
  const refUrls: string[] = [];
  const collected = new Set<string>();

  // 从剧本分析角色列表中按 prompt 引用收集
  const analysisChars = project.script?.analysis?.characters || [];
  const base = shot.prompt || shot.visual_prompt || shot.raw_description || "";
  for (const ac of analysisChars) {
    if (base.includes(ac.char_id) && !collected.has(ac.char_id)) {
      const wfChar = project.characters.find((c) => c.id === ac.char_id);
      if (wfChar?.front_view && !wfChar.front_view.startsWith("data:")) {
        refUrls.push(wfChar.front_view);
        collected.add(ac.char_id);
      }
    }
  }

  // 兜底：通过 shot.character_ids 收集
  if (shot.character_ids?.length) {
    for (const cid of shot.character_ids) {
      if (collected.has(cid)) continue;
      const wfChar = project.characters.find((c) => c.id === cid);
      if (wfChar?.front_view && !wfChar.front_view.startsWith("data:")) {
        refUrls.push(wfChar.front_view);
        collected.add(cid);
      }
    }
  }

  // 限制最多 3 张参考图，避免超限
  return refUrls.slice(0, 3);
}

/**
 * AI 重新生成所有镜头的 visual_prompt。
 * forceAll=true: 重新生成所有镜头（包括已有 visual_prompt 的）
 * forceAll=false: 只补填缺失的
 * 携带前集摘要防止跨集重复。
 */
async function fillMissingVisualPrompts(forceAll = false) {
  const { project } = getState();
  if (!project) return;

  // 收集需要处理的镜头
  const targets: { epId: string; epTitle: string; shot: WfShot }[] = [];
  for (const ep of project.episodes) {
    for (const shot of ep.shots) {
      if (forceAll || !shot.visual_prompt) {
        targets.push({ epId: ep.id, epTitle: ep.title, shot });
      }
    }
  }

  if (targets.length === 0) {
    addSystemMessage("所有镜头的 visual_prompt 均已填充，无需补填。");
    return;
  }

  addSystemMessage(`开始为 ${targets.length} 个镜头 ${forceAll ? "重新生成" : "AI 补填"}提示词...`);

  const styleKeywords = project.style_config?.compiled_style_prompt?.split(",").slice(0, 3).map((s: string) => s.trim()).join(", ") || "cinematic";

  // 按集分组
  const byEpisode: { epId: string; epTitle: string; items: { shot: WfShot }[] }[] = [];
  for (const ep of project.episodes) {
    const epItems = targets.filter((t) => t.epId === ep.id).map((t) => ({ shot: t.shot }));
    if (epItems.length > 0) byEpisode.push({ epId: ep.id, epTitle: ep.title, items: epItems });
  }

  let filled = 0;
  const prevEpSummaries: string[] = [];

  for (const { epId, epTitle, items } of byEpisode) {
    const keyMap = new Map<string, WfShot>();
    const shotLines: string[] = [];
    let shotIdx = 0;
    for (const { shot } of items) {
      shotIdx++;
      const key = `${shot.id}`;
      keyMap.set(key, shot);
      shotLines.push(`${key} [镜头${shotIdx}]: ${shot.shot_type} | 主体:${shot.raw_description} | 动作:${shot.action || ""} | 运镜:${shot.camera_movement} | 情绪:${shot.emotion || ""}`);
    }

    const prevContext = prevEpSummaries.length > 0
      ? `\n\n前面已完成的集数摘要（本集必须与这些完全不同）:\n${prevEpSummaries.join("\n")}\n`
      : "";

    const systemPrompt = `你是AI分镜提示词专家。为第"${epTitle}"集的 ${items.length} 个镜头按叙事顺序生成英文 visual_prompt。只输出JSON，不要代码块。${prevContext}

关键要求：
1. 每个 visual_prompt 约80-120个英文单词
2. 镜头之间必须体现叙事递进：动作、情绪、环境细节随剧情推进变化，严禁重复
3. 同一角色在不同镜头中外貌描述必须完全一致
4. 每个镜头必须有明确的角色动作（不能只有站立/静止）
5. 本集画面必须与前面集数完全不同——不同的角色动作、不同的场景状态

格式：[光学参数] + [景别构图] + [主体外貌+精确动作] + [环境背景] + [灯光色彩] + [摄影机运动] + ${styleKeywords}

key 必须与输入完全一致。
输出格式: {"镜头key1":"english prompt...","镜头key2":"english prompt..."}`;

    try {
      const result = await wfAiChatStream(
        {
          model: getState().aiConfig.chatModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `镜头列表:\n${shotLines.join("\n")}` },
          ],
          temperature: 0.7,
        },
        () => {},
      );

      const jsonStr = extractJson(result);
      const prompts = JSON.parse(jsonStr) as Record<string, string>;
      let epFilled = 0;

      for (const [key, shot] of keyMap) {
        if (prompts[key]) {
          // 找到对应的 episodeId 和 shotId 更新
          const ep = project.episodes.find((e) => e.id === epId);
          if (ep) {
            const idx = ep.shots.findIndex((s) => s.id === shot.id);
            if (idx !== -1) {
              ep.shots[idx] = { ...ep.shots[idx], visual_prompt: prompts[key], prompt: prompts[key] };
              epFilled++;
              filled++;
            }
          }
        }
      }

      // 批量更新 store 状态
      setState({ project: { ...getState().project! } });

      if (epFilled > 0) {
        addSystemMessage(`${epTitle}: ${forceAll ? "重新生成" : "补填"}了 ${epFilled} 个镜头提示词`);
        // 收集本集摘要给下一集参考
        const epActions = items.map((it) => it.shot.action || it.shot.raw_description).filter(Boolean).slice(0, 5);
        prevEpSummaries.push(`${epTitle}: ${epActions.join("; ")}`);
      } else {
        addSystemMessage(`${epTitle}: AI 返回 key 不匹配，样本: ${Object.keys(prompts).slice(0, 2).join(", ")}`);
      }
    } catch (e) {
      addSystemMessage(`${epTitle} 失败: ${(e as Error).message}`);
    }
  }

  // 持久化
  const updated = getState().project;
  if (updated && filled > 0) {
    wfUpdateProject(updated.id, { episodes: updated.episodes }).catch((e: unknown) => console.warn("[auto-save]", e));
    addSystemMessage(`✅ 补填完成，共更新 ${filled} 个镜头。`);
  }
}

async function regenerateSingleVideo(episodeId: string, shotId: string) {
  const { project } = getState();
  if (!project) return;
  const ep = project.episodes.find((e) => e.id === episodeId);
  const shot = ep?.shots.find((s) => s.id === shotId);
  if (!shot) return;

  addSystemMessage(`正在重新生成视频: ${shot.raw_description.slice(0, 30)}...`);
  updateShot(episodeId, shotId, { status: "filming", video_task_id: null, video_url: null, video_local_path: null });

  const { cameraPreset, motionSpeed } = mapCameraToSeedance(shot.camera_movement);
  const hasStoryboard = !!shot.storyboard_image;
  const isDialogue = !!shot.dialogue;

  // 收集角色三视图作为视频参考图
  const charRefImages = collectCharRefImagesForVideo(shot, project);

  const params: GenerationParams = {
    mode: hasStoryboard ? "first_frame" : "text",
    model: "veo-3.1",
    resolution: "720p",
    ratio: "9:16",
    duration: Math.min(Math.max(shot.duration, 4), 10),
    cameraPreset,
    motionSpeed: isDialogue ? "steady" : motionSpeed,
    generateAudio: false,
    firstFrame: hasStoryboard ? shot.storyboard_image! : undefined,
    imageRefs: charRefImages.length > 0 ? charRefImages : undefined,
  };

  const assembled = assembleVideoPrompt(shot, project);
  const promptText = isDialogue
    ? `${assembled}, subtle movement, talking`
    : assembled;
  const storyType = project.style_config?.story_type;

  try {
    const payload = buildPayload(promptText, params, storyType);
    const task = await createTask(payload, { title: shot.id, mode: "workflow" });
    updateShot(episodeId, shotId, { video_task_id: task.id });

    let attempts = 0;
    while (attempts < 60) {
      await new Promise((r) => setTimeout(r, 6000));
      attempts++;
      try {
        const updated = await queryTask(task.id);
        if (updated.status === "succeeded") {
          const videoUrl = updated.content?.video_url || updated._proxy?.videoUrls?.[0] || null;
          const localPath = updated.local_asset?.local_url || null;
          updateShot(episodeId, shotId, { video_url: videoUrl, video_local_path: localPath, status: "done" });
          // 立即持久化
          const snap = getState().project;
          if (snap) wfUpdateProject(snap.id, { episodes: snap.episodes }).catch((e: unknown) => console.warn("[video-save]", e));
          addSystemMessage("视频生成完成。");
          break;
        }
        if (updated.status === "failed" || updated.status === "cancelled") {
          updateShot(episodeId, shotId, { status: "failed" });
          addSystemMessage(`视频重新生成失败: ${updated.status}`);
          break;
        }
      } catch { /* retry */ }
    }
  } catch (err) {
    updateShot(episodeId, shotId, { status: "failed" });
    addSystemMessage(`视频创建失败: ${(err as Error).message}`);
  }

  const updated = getState().project;
  if (updated) wfUpdateProject(updated.id, { episodes: updated.episodes }).catch((e: unknown) => console.warn("[auto-save]", e));
}

function updateProjectTitle(title: string) {
  const { project } = getState();
  if (!project) return;
  setState({ project: { ...project, title } });
  wfUpdateProject(project.id, { title }).catch((e: unknown) => console.warn("[auto-save]", e));
}

async function generateVideos() {
  const { project } = getState();
  if (!project?.episodes.length) {
    addSystemMessage("请先完成分镜生成再制作视频。");
    return;
  }

  addSystemMessage("开始生成视频片段...");
  let total = 0;
  let done = 0;
  for (const ep of project.episodes) total += ep.shots.length;

  if (total === 0) {
    addSystemMessage("⚠️ 没有可用的镜头数据，无法生成视频。请先完成剧本分析和分镜生成。");
    return;
  }

  for (const ep of project.episodes) {
    for (const shot of ep.shots) {
      done++;
      // 跳过已有视频的镜头，按顺序只生成缺失的
      if (shot.video_url || shot.video_local_path) {
        addSystemMessage(`视频 ${done}/${total} 已有，跳过: ${shot.id}`);
        continue;
      }
      const { cameraPreset, motionSpeed } = mapCameraToSeedance(shot.camera_movement);
      const hasStoryboard = !!shot.storyboard_image;
      const isDialogue = !!shot.dialogue;

      addSystemMessage(`正在生成视频 ${done}/${total}: ${shot.raw_description.slice(0, 30)}...`);
      updateShot(ep.id, shot.id, { status: "filming" });

      // 收集角色三视图作为视频参考图
      const charRefImages = collectCharRefImagesForVideo(shot, project);

      const params: GenerationParams = {
        mode: hasStoryboard ? "first_frame" : "text",
        model: "veo-3.1",
        resolution: "720p",
        ratio: "9:16",
        duration: Math.min(Math.max(shot.duration, 4), 10),
        cameraPreset,
        motionSpeed: isDialogue ? "steady" : motionSpeed,
        generateAudio: false,
        firstFrame: hasStoryboard ? shot.storyboard_image! : undefined,
        imageRefs: charRefImages.length > 0 ? charRefImages : undefined,
      };

      const assembled = assembleVideoPrompt(shot, project);
      const promptText = isDialogue
        ? `${assembled}, subtle lip movement, character is talking, minimal camera motion, no speech bubbles, no subtitles, no audio`
        : assembled;
      const storyType = project.style_config?.story_type;

      try {
        const payload = buildPayload(promptText, params, storyType);
        const task = await createTask(payload, { title: shot.id, mode: "workflow" });
        updateShot(ep.id, shot.id, { video_task_id: task.id });

        // Poll until complete
        let attempts = 0;
        while (attempts < 60) {
          await new Promise((r) => setTimeout(r, 6000));
          attempts++;
          try {
            const updated = await queryTask(task.id);
            const status = updated.status || "unknown";
            if (status === "succeeded") {
              const videoUrl = updated.content?.video_url || updated._proxy?.videoUrls?.[0] || null;
              const localPath = updated.local_asset?.local_url || null;
              updateShot(ep.id, shot.id, {
                video_url: videoUrl,
                video_local_path: localPath,
                status: "done",
              });
              // 立即持久化，防止刷新丢失
              const snap = getState().project;
              if (snap) wfUpdateProject(snap.id, { episodes: snap.episodes }).catch((e: unknown) => console.warn("[video-save]", e));
              addSystemMessage(`视频 ${done}/${total} 生成完成。`);
              break;
            }
            if (status === "failed" || status === "cancelled") {
              updateShot(ep.id, shot.id, { status: "failed" });
              addSystemMessage(`视频 ${shot.id} 生成失败: ${status}`);
              break;
            }
          } catch (pollErr) {
            console.warn(`[video-poll] ${shot.id} attempt ${attempts} failed:`, pollErr);
          }
        }
        // If we exhausted all attempts without break, mark as failed (timeout)
        if (attempts >= 60) {
          const currentShot = getState().project?.episodes.flatMap((e) => e.shots).find((s) => s.id === shot.id);
          if (currentShot && currentShot.status !== "done" && currentShot.status !== "failed") {
            updateShot(ep.id, shot.id, { status: "failed" });
            addSystemMessage(`视频 ${shot.id} 生成超时（6分钟未完成）。`);
          }
        }
      } catch (err) {
        addSystemMessage(`视频 ${shot.id} 创建失败: ${(err as Error).message}`);
        updateShot(ep.id, shot.id, { status: "failed" });
      }
    }
  }

  // Persist
  const updated = getState().project;
  if (updated) {
    wfUpdateProject(updated.id, { episodes: updated.episodes, status: "post" }).catch((e: unknown) => console.warn("[auto-save]", e));
  }
  // 视频完成后自动确认并推进到后期制作（两种模式统一行为）
  setStageStatus("video", "confirmed");
  setStageStatus("post", "active");
  setState({ currentStage: "post" });
  addSystemMessage(`视频全部生成完毕！共 ${total} 个片段。已自动进入后期制作阶段。`);
}

function addSystemMessage(content: string) {
  const { chatMessages, currentStage } = getState();
  setState({ chatMessages: [...chatMessages, { role: "system" as const, content, timestamp: nowIso(), stage: currentStage }] });
}

function clearChat() { setState({ chatMessages: [] }); }
function setStage(stage: WorkflowStage) { setState({ currentStage: stage }); }
function setSelectedBlock(block: SelectedBlock | null) { setState({ selectedBlock: block }); }

function updateCharacter(id: string, patch: Partial<WfCharacter>) {
  const { project } = getState();
  if (!project) return;
  setState({ project: { ...project, characters: project.characters.map((c) => c.id === id ? { ...c, ...patch } : c) } });
}

function addCharacters(chars: WfCharacter[]) {
  const { project } = getState();
  if (!project) return;
  setState({ project: { ...project, characters: [...project.characters, ...chars] } });
}

function updateScene(id: string, patch: Partial<WfScene>) {
  const { project } = getState();
  if (!project) return;
  setState({ project: { ...project, scenes: project.scenes.map((s) => s.id === id ? { ...s, ...patch } : s) } });
}

function addScenes(scenes: WfScene[]) {
  const { project } = getState();
  if (!project) return;
  setState({ project: { ...project, scenes: [...project.scenes, ...scenes] } });
}

function setEpisodes(episodes: WfEpisode[]) {
  const { project } = getState();
  if (!project) return;
  setState({ project: { ...project, episodes } });
}

function updateShot(episodeId: string, shotId: string, patch: Partial<WfShot>) {
  const { project } = getState();
  if (!project) return;
  const episodes = project.episodes.map((ep) =>
    ep.id !== episodeId ? ep : { ...ep, shots: ep.shots.map((s) => s.id === shotId ? { ...s, ...patch } : s) },
  );
  setState({ project: { ...project, episodes } });
}

function setScriptAnalysis(analysis: ScriptAnalysis) {
  const { project } = getState();
  if (!project) return;
  setState({ project: { ...project, script: { ...project.script, analysis }, status: "scripting" } });
}

/**
 * 更新剧本分析数据（从 ScriptBlock 编辑触发）
 * 自动保存版本快照 + 重新转换 project 数据 + 持久化
 */
async function updateScriptAnalysis(analysis: ScriptAnalysis) {
  const { project } = getState();
  if (!project) return;

  // 自动保存版本快照（修改前）
  try {
    await wfCreateVersion(project.id, "step3", "编辑前自动备份");
  } catch (e) {
    console.warn("[version] step3 snapshot failed:", e);
  }

  // 重新转换为 project 数据
  const { characters, scenes, episodes } = convertAnalysisToProjectData(analysis);

  const updatedProject: WfProject = {
    ...project,
    title: analysis.title || project.title,
    script: { ...project.script, analysis },
    characters,
    scenes,
    episodes,
  };
  setState({ project: updatedProject });

  // 持久化到后端
  wfUpdateProject(project.id, updatedProject).catch((e: unknown) =>
    console.warn("[auto-save] updateScriptAnalysis:", e),
  );

  addSystemMessage(`剧本已更新。角色: ${characters.length}, 场景: ${scenes.length}, 分集: ${episodes.length}`);
}

function setSubtitlesSrt(srt: string) {
  const { project } = getState();
  if (!project) return;
  setState({ project: { ...project, post_production: { ...project.post_production, subtitles_srt: srt } } });
}

function setFinalOutput(url: string) {
  const { project } = getState();
  if (!project) return;
  setState({ project: { ...project, post_production: { ...project.post_production, final_output: url }, status: "done" } });
}

// =====================================================
// Step 4: 资产生成 + 审核 + 锁定
// =====================================================

async function generateAllAssetsAction(imageModel?: string) {
  const model = imageModel || getState().aiConfig.imageModel;
  const { project } = getState();
  if (!project?.script?.analysis) {
    addSystemMessage("请先完成剧本分析再生成资产。");
    return;
  }

  const analysis = project.script.analysis;
  const charCount = analysis.characters.length;
  const sceneCount = analysis.scenes.length;
  const mainCharCount = analysis.characters.filter((c) => c.role === "主角").length;
  const totalImages = charCount * 3 + mainCharCount * 6 + sceneCount * 6;

  addSystemMessage(
    `资产生成计划: ${charCount} 个角色 × 3 视图, ${mainCharCount} 个主角 × 6 表情, ` +
    `${sceneCount} 个场景 × 6 视图。共 ${totalImages} 张图片。`,
  );

  setState({
    project: { ...project, status: "designing" as WfProject["status"] },
    assetGenProgress: { total: 0, completed: 0, failed: 0, current: "准备中..." },
  });

  for (const char of project.characters) updateCharacter(char.id, { status: "generating" });
  for (const scene of project.scenes) updateScene(scene.id, { status: "generating" });

  try {
    const results = await generateAllAssets(
      analysis, project.id, project.style_config || null, model,
      (completed, total, current) => {
        setState({ assetGenProgress: { total, completed, failed: 0, current } });
      },
      // 实时更新角色视图（每张图完成后立刻显示）
      (charId, view, url) => {
        const viewKey = view === "front" ? "front_view" : view === "side" ? "side_view" : "back_view";
        updateCharacter(charId, { [viewKey]: url } as Parameters<typeof updateCharacter>[1]);
      },
      // 实时更新场景视图
      (sceneId, view, url) => {
        const p = getState().project;
        if (!p) return;
        const scenes = p.scenes.map((s) =>
          s.id === sceneId ? { ...s, views: { ...(s.views || {}), [view]: url } } : s
        );
        setState({ project: { ...p, scenes } });
      },
    );

    for (const char of analysis.characters) {
      const r = results.characters[char.char_id];
      if (r) {
        updateCharacter(char.char_id, {
          front_view: r.views.front, side_view: r.views.side, back_view: r.views.back,
          expression_sheet: Object.keys(r.expressions).length > 0 ? r.expressions : null,
          status: "done",
          view_status: {
            front: r.views.front ? "pending" : "rejected",
            side: r.views.side ? "pending" : "rejected",
            back: r.views.back ? "pending" : "rejected",
          },
        });
      }
    }

    for (const scene of analysis.scenes) {
      const r = results.scenes[scene.scene_id];
      if (r) {
        const vs: Record<string, "approved" | "pending" | "rejected"> = {};
        for (const [k, v] of Object.entries(r)) vs[k] = v ? "pending" : "rejected";
        updateScene(scene.scene_id, { views: r, status: "done", view_status: vs });
      }
    }

    const updated = getState().project;
    if (updated) {
      wfUpdateProject(updated.id, { characters: updated.characters, scenes: updated.scenes, status: "designing" as WfProject["status"] })
        .catch((e: unknown) => console.warn("[auto-save]", e));
    }
    setState({ assetGenProgress: null });
    // 角色生成完毕后自动确认并推进到分镜（两种模式统一行为）
    setStageStatus("character", "confirmed");
    setStageStatus("storyboard", "active");
    setState({ currentStage: "storyboard" });
    addSystemMessage("所有资产生成完毕！已自动进入分镜阶段。你可以点击「批量生成分镜图」开始。");
  } catch (err) {
    setState({ assetGenProgress: null });
    addSystemMessage(`资产生成出错: ${(err as Error).message}`);
  }
}

async function regenerateViewAction(
  type: "character" | "scene", entityId: string, viewKey: string, customPrompt?: string,
) {
  const { project, aiConfig } = getState();
  if (!project) return;

  wfCreateStep4Snapshot(project.id, `重新生成 ${entityId} ${viewKey}`).catch((e: unknown) => console.warn("[snapshot]", e));

  let originalPrompt = customPrompt;
  if (!originalPrompt && project.script?.analysis) {
    if (type === "character") {
      const char = project.script.analysis.characters.find((c) => c.char_id === entityId);
      originalPrompt = char?.three_view_prompts[viewKey as "front" | "side" | "back"] || char?.expression_prompts?.[viewKey] || "";
    } else {
      const scene = project.script.analysis.scenes.find((s) => s.scene_id === entityId);
      originalPrompt = scene?.six_view_prompts?.[viewKey] || "";
    }
  }

  addSystemMessage(`正在重新生成 ${entityId} 的 ${viewKey} 视图...`);
  try {
    const url = await regenerateView(type, entityId, viewKey, project.id, originalPrompt, aiConfig.imageModel);
    if (type === "character") {
      if (["front", "side", "back"].includes(viewKey)) {
        updateCharacter(entityId, { [`${viewKey}_view`]: url } as Partial<WfCharacter>);
      } else {
        const char = getState().project?.characters.find((c) => c.id === entityId);
        if (char) updateCharacter(entityId, { expression_sheet: { ...(char.expression_sheet || {}), [viewKey]: url } });
      }
    } else {
      const scene = getState().project?.scenes.find((s) => s.id === entityId);
      if (scene) updateScene(entityId, { views: { ...scene.views, [viewKey]: url } });
    }
    addSystemMessage(url ? `${viewKey} 视图重新生成完成。` : `${viewKey} 视图重新生成失败。`);
    const updated = getState().project;
    if (updated) wfUpdateProject(updated.id, { characters: updated.characters, scenes: updated.scenes }).catch((e: unknown) => console.warn("[auto-save]", e));
  } catch (err) {
    addSystemMessage(`重新生成失败: ${(err as Error).message}`);
  }
}

function approveView(type: "character" | "scene", entityId: string, viewKey: string) {
  const { project } = getState();
  if (!project) return;
  if (type === "character") {
    const char = project.characters.find((c) => c.id === entityId);
    if (char) updateCharacter(entityId, { view_status: { ...(char.view_status || {}), [viewKey]: "approved" } });
  } else {
    const scene = project.scenes.find((s) => s.id === entityId);
    if (scene) updateScene(entityId, { view_status: { ...(scene.view_status || {}), [viewKey]: "approved" } });
  }
  const updated = getState().project;
  if (updated) wfUpdateProject(updated.id, { characters: updated.characters, scenes: updated.scenes }).catch((e: unknown) => console.warn("[auto-save]", e));
}

async function uploadReplacementView(type: "character" | "scene", entityId: string, viewKey: string, imageData: string) {
  const { project } = getState();
  if (!project) return;
  wfCreateStep4Snapshot(project.id, `上传替代 ${entityId} ${viewKey}`).catch((e: unknown) => console.warn("[snapshot]", e));
  try {
    const filename = `${entityId}_${viewKey}_custom.png`;
    const result = await wfUploadAsset(project.id, imageData, filename);
    const url = result.asset_url;
    if (type === "character" && ["front", "side", "back"].includes(viewKey)) {
      updateCharacter(entityId, {
        [`${viewKey}_view`]: url,
        view_status: { ...(project.characters.find((c) => c.id === entityId)?.view_status || {}), [viewKey]: "approved" },
      } as Partial<WfCharacter>);
    } else if (type === "scene") {
      const scene = project.scenes.find((s) => s.id === entityId);
      if (scene) updateScene(entityId, { views: { ...scene.views, [viewKey]: url }, view_status: { ...(scene.view_status || {}), [viewKey]: "approved" } });
    }
    addSystemMessage(`已上传替代图片: ${entityId} ${viewKey}`);
    const updated = getState().project;
    if (updated) wfUpdateProject(updated.id, { characters: updated.characters, scenes: updated.scenes }).catch((e: unknown) => console.warn("[auto-save]", e));
  } catch (err) {
    addSystemMessage(`上传失败: ${(err as Error).message}`);
  }
}

async function lockAssets() {
  const { project } = getState();
  if (!project) return;
  for (const char of project.characters) {
    if (!char.front_view) { addSystemMessage(`无法锁定: 角色 ${char.name} 的正面视图未生成。`); return; }
  }
  // 场景视图为可选 — 部分失败不阻塞锁定，仅警告
  for (const scene of project.scenes) {
    if (!scene.views?.front) { addSystemMessage(`⚠️ 场景 ${scene.name} 的正面视图未生成，已跳过。`); }
  }
  for (const char of project.characters) updateCharacter(char.id, { status: "done" });
  for (const scene of project.scenes) updateScene(scene.id, { status: "done" });
  const updated = getState().project;
  if (updated) {
    try {
      await wfUpdateProject(updated.id, { characters: updated.characters, scenes: updated.scenes, status: "assets_locked" as WfProject["status"] });
      setState({ project: { ...getState().project!, status: "assets_locked" as WfProject["status"] } });
      addSystemMessage("资产已锁定！可以进入 Step 5 分镜视频生成。");
    } catch (err) { addSystemMessage(`锁定失败: ${(err as Error).message}`); }
  }
}

async function unlockAssets() {
  const { project } = getState();
  if (!project) return;
  try {
    await wfUpdateProject(project.id, { status: "designing" as WfProject["status"] });
    setState({ project: { ...project, status: "designing" as WfProject["status"] } });
    addSystemMessage("资产已解锁，可以重新编辑。");
  } catch (err) { addSystemMessage(`解锁失败: ${(err as Error).message}`); }
}

// =====================================================
// Step 4: 版本历史
// =====================================================

async function loadStep4Versions() {
  const { project } = getState();
  if (!project) return;
  try {
    const { versions } = await wfListStep4Versions(project.id);
    setState({ step4Versions: versions });
  } catch { /* ignore */ }
}

async function createStep4Snapshot(reason: string) {
  const { project } = getState();
  if (!project) return;
  try {
    await wfCreateStep4Snapshot(project.id, reason);
    addSystemMessage(`版本快照已创建: ${reason}`);
    await loadStep4Versions();
  } catch (err) { addSystemMessage(`创建快照失败: ${(err as Error).message}`); }
}

async function restoreStep4Version(filename: string) {
  const { project } = getState();
  if (!project) return;
  try {
    const restored = await wfRestoreStep4Version(project.id, filename);
    setState({ project: restored });
    addSystemMessage("已恢复到指定版本。资产状态已回退到「未锁定」。");
    await loadStep4Versions();
  } catch (err) { addSystemMessage(`恢复失败: ${(err as Error).message}`); }
}

// =====================================================
// Step 2: 风格配置
// =====================================================

async function setStyleConfig(config: StyleConfig) {
  const { project } = getState();
  if (!project) return;
  const updated: WfProject = {
    ...project,
    style_config: config,
    status: "configured" as WfProject["status"],
  };
  setState({ project: updated });
  addSystemMessage(
    `风格配置已保存！类型: ${config.story_type}, 风格: ${config.art_substyle}, 比例: ${config.aspect_ratio}`,
  );
  // 更新阶段状态（style 已合并到 script）
  if (getState().workflowMode === "interactive") {
    setStageStatus("script", "confirmed");
    setStageStatus("character", "active");
    setState({ currentStage: "character" });
  }
  try {
    await wfUpdateProject(project.id, { style_config: config, status: "configured" as WfProject["status"] });
  } catch (err) {
    addSystemMessage(`保存风格配置失败: ${(err as Error).message}`);
  }
}

// =====================================================
// 新增：双模式 + 阶段状态机 + 编辑面板
// =====================================================

function setWorkflowMode(mode: "interactive" | "auto") {
  setState({ workflowMode: mode });
}

function setStageStatus(stage: WorkflowStage, status: StageStatus) {
  const { stageStatuses } = getState();
  setState({ stageStatuses: { ...stageStatuses, [stage]: status } });
}

const STAGE_LABELS_INTERNAL: Record<WorkflowStage, string> = {
  script: "剧本分析", style: "风格定调", character: "角色设计",
  storyboard: "分镜生成", video: "视频合成", post: "后期输出",
};

/** 确认当前阶段，解锁下一阶段 */
function confirmStage(stage: WorkflowStage) {
  const { stageStatuses } = getState();
  const updated = { ...stageStatuses, [stage]: "confirmed" as StageStatus };
  const idx = STAGE_ORDER.indexOf(stage);
  if (idx >= 0 && idx < STAGE_ORDER.length - 1) {
    const next = STAGE_ORDER[idx + 1];
    if (updated[next] === "locked") {
      updated[next] = "active";
    }
  }
  setState({ stageStatuses: updated, currentStage: idx < STAGE_ORDER.length - 1 ? STAGE_ORDER[idx + 1] : stage });
  addSystemMessage(`「${STAGE_LABELS_INTERNAL[stage]}」已确认，进入下一步。`);

  // Persist stage status to backend
  const { project } = getState();
  if (project) {
    const stageToProjectStatus: Record<string, WfProject["status"]> = {
      script: "script_parsed", style: "configured", character: "designing",
      storyboard: "storyboarding", video: "filming", post: "done",
    };
    const projectStatus = stageToProjectStatus[stage] || "draft";
    wfUpdateProject(project.id, { status: projectStatus }).catch((e: unknown) => console.warn("[confirmStage] persist failed:", e));
  }
}

/** 回退到指定阶段，后续阶段变 locked */
function rollbackToStage(stage: WorkflowStage) {
  const { stageStatuses } = getState();
  const updated = { ...stageStatuses };
  const idx = STAGE_ORDER.indexOf(stage);
  updated[stage] = "active";
  for (let i = idx + 1; i < STAGE_ORDER.length; i++) {
    updated[STAGE_ORDER[i]] = "locked";
  }
  setState({ stageStatuses: updated, currentStage: stage });
  addSystemMessage(`已回退到「${STAGE_LABELS_INTERNAL[stage]}」阶段。`);
}

/** 打开编辑面板 + 联动 selectedBlock */
function openEditPanel(target: EditPanelTarget) {
  const block: SelectedBlock = {
    type: target.type === "episode" ? "shot" : target.type,
    id: target.episodeId ? `${target.episodeId}/${target.id}` : target.id,
    label: _getEditLabel(target),
    episodeId: target.episodeId,
  };
  setState({ editPanelTarget: target, selectedBlock: block });
}

function _getEditLabel(target: EditPanelTarget): string {
  const { project } = getState();
  if (!project) return target.id;
  switch (target.type) {
    case "script": return project.script?.analysis?.title || "剧本";
    case "character": return project.characters.find((c) => c.id === target.id)?.name || target.id;
    case "scene": return project.scenes.find((s) => s.id === target.id)?.name || target.id;
    case "episode": return project.episodes.find((e) => e.id === target.id)?.title || target.id;
    case "shot": {
      const ep = project.episodes.find((e) => e.id === target.episodeId);
      const idx = ep?.shots.findIndex((s) => s.id === target.id) ?? -1;
      return `镜头 #${idx + 1}`;
    }
    default: return target.id;
  }
}

function closeEditPanel() {
  setState({ editPanelTarget: null });
}

/** 全自动流水线执行 */
async function runAutoWorkflow() {
  const { project } = getState();
  if (!project) return;

  setState({ workflowMode: "auto" });
  addSystemMessage("🤖 进入托管模式，全自动执行工作流...");

  if (!project.script?.analysis) {
    addSystemMessage("托管模式需要先完成剧本分析。请在对话中输入故事大纲。");
    setStageStatus("script", "active");
    return;
  }
  setStageStatus("script", "confirmed");

  if (!project.style_config) {
    addSystemMessage("使用默认风格配置...");
  }
  setStageStatus("style", "confirmed");

  setStageStatus("character", "generating");
  setState({ currentStage: "character" });
  await generateAllAssetsAction();

  const afterAssets = getState().project;
  if (afterAssets && afterAssets.characters.some((c) => c.status === "done")) {
    await lockAssets();
  }
  setStageStatus("character", "confirmed");

  setStageStatus("storyboard", "generating");
  setState({ currentStage: "storyboard" });
  await generateStoryboardImages();

  setStageStatus("video", "generating");
  setState({ currentStage: "video" });
  await generateVideos();

  setStageStatus("post", "active");
  setState({ currentStage: "post" });
  addSystemMessage("🎉 托管生成完成！所有视频已生成，可以进入后期制作。\n你可以切换为交互模式进行微调。");
}

// =====================================================
// 深度编辑 Actions
// =====================================================

/** 深度编辑角色（同步 script.analysis.characters + project.characters） */
function updateCharacterDeep(charId: string, patch: Record<string, unknown>) {
  const { project } = getState();
  if (!project) return;

  if (project.script?.analysis) {
    const updatedAnalysis = {
      ...project.script.analysis,
      characters: project.script.analysis.characters.map((c) =>
        c.char_id === charId ? { ...c, ...patch } : c,
      ),
    };
    const updatedScript = { ...project.script, analysis: updatedAnalysis };

    const charPatch: Partial<WfCharacter> = {};
    if (patch.name) charPatch.name = patch.name as string;
    if (patch.personality || patch.appearance) {
      charPatch.description = `${patch.personality || ""} ${typeof patch.appearance === "string" ? patch.appearance : JSON.stringify(patch.appearance || "")}`.trim();
    }

    const updatedChars = project.characters.map((c) =>
      c.id === charId ? { ...c, ...charPatch } : c,
    );

    setState({ project: { ...project, script: updatedScript, characters: updatedChars } });
    wfUpdateProject(project.id, { script: updatedScript, characters: updatedChars } as Partial<WfProject>)
      .catch((e: unknown) => console.warn("[auto-save]", e));
  }
}

/** 深度编辑场景 */
function updateSceneDeep(sceneId: string, patch: Record<string, unknown>) {
  const { project } = getState();
  if (!project) return;

  if (project.script?.analysis) {
    const updatedAnalysis = {
      ...project.script.analysis,
      scenes: project.script.analysis.scenes.map((s) =>
        s.scene_id === sceneId ? { ...s, ...patch } : s,
      ),
    };
    const updatedScript = { ...project.script, analysis: updatedAnalysis };

    const scenePatch: Partial<WfScene> = {};
    if (patch.name) scenePatch.name = patch.name as string;
    if (patch.description) scenePatch.description = patch.description as string;

    const updatedScenes = project.scenes.map((s) =>
      s.id === sceneId ? { ...s, ...scenePatch } : s,
    );

    setState({ project: { ...project, script: updatedScript, scenes: updatedScenes } });
    wfUpdateProject(project.id, { script: updatedScript, scenes: updatedScenes } as Partial<WfProject>)
      .catch((e: unknown) => console.warn("[auto-save]", e));
  }
}

/** 深度编辑镜头 */
function updateShotDeep(episodeId: string, shotId: string, patch: Record<string, unknown>) {
  const { project } = getState();
  if (!project) return;

  const shotPatch: Partial<WfShot> = {};
  if (patch.shot_type !== undefined) shotPatch.shot_type = patch.shot_type as string;
  if (patch.duration !== undefined) shotPatch.duration = Number(patch.duration);
  if (patch.camera_movement !== undefined) shotPatch.camera_movement = patch.camera_movement as string;
  if (patch.dialogue !== undefined) shotPatch.dialogue = patch.dialogue as string;
  if (patch.emotion !== undefined) shotPatch.emotion = patch.emotion as string;
  if (patch.prompt !== undefined) shotPatch.prompt = patch.prompt as string;
  if (patch.visual_prompt !== undefined) {
    shotPatch.visual_prompt = patch.visual_prompt as string;
    shotPatch.prompt = patch.visual_prompt as string;
  }
  if (patch.raw_description !== undefined) shotPatch.raw_description = patch.raw_description as string;

  updateShot(episodeId, shotId, shotPatch);
  const updated = getState().project;
  if (updated) {
    wfUpdateProject(updated.id, { episodes: updated.episodes }).catch((e: unknown) => console.warn("[auto-save]", e));
  }
}

/** 深度编辑分集 */
function updateEpisodeDeep(episodeId: string, patch: Record<string, unknown>) {
  const { project } = getState();
  if (!project) return;
  const episodes = project.episodes.map((ep) =>
    ep.id === episodeId ? { ...ep, ...patch } : ep,
  );
  setState({ project: { ...project, episodes } });
  wfUpdateProject(project.id, { episodes }).catch((e: unknown) => console.warn("[auto-save]", e));
}

/** 新增角色 */
function addNewCharacter(data: { name: string; role?: string; personality?: string; appearance?: string }) {
  const { project } = getState();
  if (!project) return;
  const charId = `char_${Date.now()}`;
  const newChar: WfCharacter = {
    id: charId, name: data.name,
    description: `${data.personality || ""} ${data.appearance || ""}`.trim(),
    appearance_prompt: data.appearance || "",
    front_view: null, side_view: null, back_view: null,
    expression_sheet: null, status: "pending",
  };
  if (project.script?.analysis) {
    const newAC = {
      char_id: charId, name: data.name, role: data.role || "配角",
      personality: data.personality || "",
      appearance: { description: data.appearance || "" } as Record<string, string>,
      costume: {} as Record<string, string>,
      three_view_prompts: { front: "", side: "", back: "" },
      expression_prompts: {} as Record<string, string>,
    };
    setState({ project: {
      ...project,
      script: { ...project.script, analysis: { ...project.script.analysis, characters: [...project.script.analysis.characters, newAC] } },
      characters: [...project.characters, newChar],
    } });
  } else {
    setState({ project: { ...project, characters: [...project.characters, newChar] } });
  }
  addSystemMessage(`已添加新角色「${data.name}」。`);
  const updated = getState().project;
  if (updated) wfUpdateProject(updated.id, updated).catch((e: unknown) => console.warn("[auto-save]", e));
}

/** 删除角色 */
function removeCharacter(charId: string) {
  const { project } = getState();
  if (!project) return;
  const charName = project.characters.find((c) => c.id === charId)?.name || charId;
  const updatedChars = project.characters.filter((c) => c.id !== charId);
  if (project.script?.analysis) {
    setState({ project: {
      ...project,
      script: { ...project.script, analysis: { ...project.script.analysis, characters: project.script.analysis.characters.filter((c) => c.char_id !== charId) } },
      characters: updatedChars,
    } });
  } else {
    setState({ project: { ...project, characters: updatedChars } });
  }
  addSystemMessage(`已删除角色「${charName}」。`);
  const updated = getState().project;
  if (updated) wfUpdateProject(updated.id, updated).catch((e: unknown) => console.warn("[auto-save]", e));
}

/** 新增场景 */
function addNewScene(data: { name: string; description?: string }) {
  const { project } = getState();
  if (!project) return;
  const sceneId = `scene_${Date.now()}`;
  const newScene: WfScene = { id: sceneId, name: data.name, description: data.description || "", views: {}, status: "pending" };
  if (project.script?.analysis) {
    const newAS = {
      scene_id: sceneId, name: data.name, description: data.description || "",
      environment: {} as Record<string, string>, six_view_prompts: {} as Record<string, string>,
      lighting: {} as Record<string, string>, color_grading: "",
    };
    setState({ project: {
      ...project,
      script: { ...project.script, analysis: { ...project.script.analysis, scenes: [...project.script.analysis.scenes, newAS] } },
      scenes: [...project.scenes, newScene],
    } });
  } else {
    setState({ project: { ...project, scenes: [...project.scenes, newScene] } });
  }
  addSystemMessage(`已添加新场景「${data.name}」。`);
  const updated = getState().project;
  if (updated) wfUpdateProject(updated.id, updated).catch((e: unknown) => console.warn("[auto-save]", e));
}

/** 删除场景 */
function removeScene(sceneId: string) {
  const { project } = getState();
  if (!project) return;
  const sceneName = project.scenes.find((s) => s.id === sceneId)?.name || sceneId;
  if (project.script?.analysis) {
    setState({ project: {
      ...project,
      script: { ...project.script, analysis: { ...project.script.analysis, scenes: project.script.analysis.scenes.filter((s) => s.scene_id !== sceneId) } },
      scenes: project.scenes.filter((s) => s.id !== sceneId),
    } });
  } else {
    setState({ project: { ...project, scenes: project.scenes.filter((s) => s.id !== sceneId) } });
  }
  addSystemMessage(`已删除场景「${sceneName}」。`);
  const updated = getState().project;
  if (updated) wfUpdateProject(updated.id, updated).catch((e: unknown) => console.warn("[auto-save]", e));
}

/** 新增镜头 */
function addNewShot(episodeId: string, data?: Partial<WfShot>) {
  const { project } = getState();
  if (!project) return;
  const shotId = `shot_${Date.now()}`;
  const newShot: WfShot = {
    id: shotId, episode_id: episodeId, scene_id: "", character_ids: [],
    prompt: data?.prompt || "", raw_description: data?.raw_description || "新镜头",
    shot_type: data?.shot_type || "MS", camera_movement: data?.camera_movement || "",
    duration: data?.duration || 5, dialogue: data?.dialogue, emotion: data?.emotion,
    storyboard_image: null, video_task_id: null, video_url: null, video_local_path: null, status: "draft",
  };
  const episodes = project.episodes.map((ep) =>
    ep.id === episodeId ? { ...ep, shots: [...ep.shots, newShot] } : ep,
  );
  setState({ project: { ...project, episodes } });
  addSystemMessage(`已在集 ${episodeId} 中添加新镜头。`);
  wfUpdateProject(project.id, { episodes }).catch((e: unknown) => console.warn("[auto-save]", e));
}

/** 删除镜头 */
function removeShot(episodeId: string, shotId: string) {
  const { project } = getState();
  if (!project) return;
  const episodes = project.episodes.map((ep) =>
    ep.id === episodeId ? { ...ep, shots: ep.shots.filter((s) => s.id !== shotId) } : ep,
  );
  setState({ project: { ...project, episodes } });
  addSystemMessage(`已删除镜头 ${shotId}。`);
  wfUpdateProject(project.id, { episodes }).catch((e: unknown) => console.warn("[auto-save]", e));
}
