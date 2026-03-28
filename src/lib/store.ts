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
} from "./api";
import {
  wfCreateProject,
  wfGetProject,
  wfUpdateProject,
  wfAiChatStream,
  wfGenerateImage,
  createTask,
  queryTask,
  buildPayload,
  fetchConfig,
  type GenerationParams,
} from "./api";
import {
  convertAnalysisToProjectData,
  mapCameraToSeedance,
} from "./workflow-engine";

export type WorkflowStage = "script" | "character" | "storyboard" | "video" | "post";

export interface SelectedBlock {
  type: "script" | "character" | "scene" | "shot" | "video" | "post";
  id: string;
  label?: string;
}

interface AiConfig {
  chatModel: string;
  imageModel: string;
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
  aiConfig: { chatModel: "claude-opus-4-6", imageModel: "nano-banana-2" },
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
    setSubtitlesSrt,
    setFinalOutput,
    // Generation actions
    generateCharacterImages,
    generateSceneImages,
    generateStoryboardImages,
    generateVideos,
    regenerateSingleStoryboard,
    regenerateSingleVideo,
    updateProjectTitle,
    loadAiConfig,
  };
}

// ---- helpers ----
function nowIso(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function buildSystemPrompt(stage: WorkflowStage, project: WfProject | null): string {
  const ctx = project ? `当前项目: "${project.title}", 状态: ${project.status}` : "";

  const prompts: Record<WorkflowStage, string> = {
    script: `你是一个专业的AI漫剧编剧和导演（艺术总监）。${ctx}

用户会给你一个故事创意或大纲。请深度分析并输出严格的JSON格式剧本。

输出JSON必须包含以下字段:
- title, genre, style, color_palette
- characters: 含 char_id, name, role, personality, appearance, costume, three_view_prompts(front/side/back英文), expression_prompts, voice_profile
- scenes: 含 scene_id, name, description, environment, six_view_prompts(front/back/left/right/top/detail英文), lighting, color_grading
- episodes: 含 episode_id, title, duration_target, emotion_curve, scenes数组(含dialogues/shots)
- visual_style_guide, camera_language_guide

所有图像提示词用英文，其他中文。只输出JSON。`,

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

// ---- actions ----

async function loadAiConfig() {
  try {
    const cfg = await fetchConfig();
    const ai = (cfg as Record<string, unknown>).aiConfig as { chatModel?: string; imageModel?: string } | undefined;
    if (ai) {
      setState({
        aiConfig: {
          chatModel: ai.chatModel || "claude-opus-4-6",
          imageModel: ai.imageModel || "nano-banana-2",
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
    setState({ project, loading: false, chatMessages: project.script?.chat_history || [] });
  } catch (err) {
    setState({ loading: false, error: (err as Error).message });
  }
}

async function createProject(title: string, rawInput: string): Promise<string> {
  setState({ loading: true, error: null });
  try {
    const project = await wfCreateProject({ title, raw_input: rawInput });
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
  const { currentStage, project, chatMessages } = getState();
  const userMsg: ChatMessage = { role: "user", content, timestamp: nowIso(), stage: currentStage };
  const updatedMessages = [...chatMessages, userMsg];
  setState({ chatMessages: updatedMessages, chatLoading: true, streamingContent: "" });

  const systemPrompt = buildSystemPrompt(currentStage, project);
  const apiMessages: { role: string; content: string }[] = [{ role: "system", content: systemPrompt }];

  if (project?.script?.analysis && currentStage !== "script") {
    apiMessages.push({
      role: "system",
      content: `当前剧本分析数据:\n${JSON.stringify(project.script.analysis, null, 2).slice(0, 8000)}`,
    });
  }

  for (const msg of updatedMessages.slice(-10)) {
    if (msg.role === "user" || msg.role === "assistant") {
      apiMessages.push({ role: msg.role, content: msg.content });
    }
  }

  try {
    const fullResponse = await wfAiChatStream(
      { model: model || getState().aiConfig.chatModel, messages: apiMessages },
      (accumulated) => setState({ streamingContent: accumulated }),
    );
    const assistantMsg: ChatMessage = { role: "assistant", content: fullResponse, timestamp: nowIso(), stage: currentStage };
    const finalMessages = [...updatedMessages, assistantMsg];
    setState({ chatMessages: finalMessages, chatLoading: false, streamingContent: "" });

    // --- Auto-parse AI response based on current stage ---
    if (currentStage === "script" && project) {
      try {
        const parsed = JSON.parse(extractJson(fullResponse));
        if (parsed.title && parsed.characters && parsed.episodes) {
          // Successfully parsed script analysis JSON
          const analysis = parsed as ScriptAnalysis;
          const { characters, scenes, episodes } = convertAnalysisToProjectData(analysis);

          const updatedProject: WfProject = {
            ...project,
            title: analysis.title || project.title,
            status: "scripting",
            script: { ...project.script, analysis, chat_history: finalMessages },
            characters,
            scenes,
            style_guide: analysis.visual_style_guide || null,
            episodes,
          };
          setState({ project: updatedProject });

          // Persist to backend
          wfUpdateProject(project.id, updatedProject).catch(() => {});

          // Add system message
          addSystemMessage(
            `剧本分析完成！提取了 ${characters.length} 个角色、${scenes.length} 个场景、${episodes.length} 集。\n` +
            `画布已更新。你可以:\n` +
            `- 在右侧画布查看和编辑剧本\n` +
            `- 说"生成角色三视图"开始角色设计\n` +
            `- 说"生成分镜图"开始分镜`,
          );
          return;
        }
      } catch {
        // Not valid JSON — treat as normal chat message
      }
    }

    // Persist chat history
    if (project) {
      wfUpdateProject(project.id, { script: { ...project.script, chat_history: finalMessages } } as Partial<WfProject>).catch(() => {});
    }
  } catch (err) {
    const errorMsg: ChatMessage = { role: "assistant", content: `[错误] ${(err as Error).message}`, timestamp: nowIso(), stage: currentStage };
    setState({ chatMessages: [...updatedMessages, errorMsg], chatLoading: false, streamingContent: "" });
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

  for (let i = 0; i < analysisChars.length; i++) {
    const ac = analysisChars[i];
    const charIndex = project.characters.findIndex((c) => c.id === ac.char_id);
    if (charIndex === -1) continue;

    addSystemMessage(`正在生成角色 ${ac.name} 的三视图 (${i + 1}/${analysisChars.length})...`);
    updateCharacter(ac.char_id, { status: "generating" });

    for (const view of ["front", "side", "back"] as const) {
      const prompt = ac.three_view_prompts[view];
      if (!prompt) continue;

      try {
        const result = await wfGenerateImage({
          model,
          prompt,
          n: 1,
          size: "1024x1536",
          project_id: project.id,
          asset_filename: `${ac.char_id}_${view}.png`,
        });
        const url = result.saved_assets?.[0]?.asset_url || result.data?.[0]?.url || null;
        if (url) {
          updateCharacter(ac.char_id, { [`${view}_view`]: url } as Partial<WfCharacter>);
        }
      } catch (err) {
        addSystemMessage(`生成 ${ac.name} ${view} 视图失败: ${(err as Error).message}`);
      }
    }

    updateCharacter(ac.char_id, { status: "done" });
    addSystemMessage(`角色 ${ac.name} 三视图生成完成。`);
  }

  // Persist
  const updated = getState().project;
  if (updated) {
    wfUpdateProject(updated.id, { characters: updated.characters }).catch(() => {});
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
    wfUpdateProject(updated.id, { scenes: updated.scenes }).catch(() => {});
  }
  addSystemMessage("所有场景六视图生成完毕！");
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

  for (const ep of project.episodes) {
    for (const shot of ep.shots) {
      done++;
      addSystemMessage(`正在生成分镜 ${done}/${total}: ${shot.raw_description.slice(0, 30)}...`);
      updateShot(ep.id, shot.id, { status: "storyboard" });

      try {
        const result = await wfGenerateImage({
          model,
          prompt: shot.prompt,
          n: 1,
          size: "1080x1920",
          project_id: project.id,
          asset_filename: `storyboard_${shot.id}.png`,
        });
        const url = result.saved_assets?.[0]?.asset_url || result.data?.[0]?.url || null;
        updateShot(ep.id, shot.id, { storyboard_image: url, status: url ? "storyboard" : "draft" });
      } catch (err) {
        addSystemMessage(`分镜 ${shot.id} 生成失败: ${(err as Error).message}`);
        updateShot(ep.id, shot.id, { status: "failed" });
      }
    }
  }

  // Persist
  const updated = getState().project;
  if (updated) {
    wfUpdateProject(updated.id, { episodes: updated.episodes }).catch(() => {});
  }
  addSystemMessage(`分镜图全部生成完毕！共 ${total} 帧。你可以说"生成视频"继续。`);
}

async function regenerateSingleStoryboard(episodeId: string, shotId: string) {
  const { project, aiConfig } = getState();
  if (!project) return;
  const ep = project.episodes.find((e) => e.id === episodeId);
  const shot = ep?.shots.find((s) => s.id === shotId);
  if (!shot) return;

  addSystemMessage(`正在重新生成分镜: ${shot.raw_description.slice(0, 30)}...`);
  updateShot(episodeId, shotId, { status: "storyboard" });

  try {
    const result = await wfGenerateImage({
      model: aiConfig.imageModel,
      prompt: shot.prompt,
      n: 1,
      size: "1080x1920",
      project_id: project.id,
      asset_filename: `storyboard_${shot.id}_${Date.now()}.png`,
    });
    const url = result.saved_assets?.[0]?.asset_url || result.data?.[0]?.url || null;
    updateShot(episodeId, shotId, { storyboard_image: url, status: url ? "storyboard" : "failed" });
    addSystemMessage(url ? "分镜重新生成完成。" : "分镜重新生成失败。");
  } catch (err) {
    updateShot(episodeId, shotId, { status: "failed" });
    addSystemMessage(`分镜重新生成失败: ${(err as Error).message}`);
  }

  const updated = getState().project;
  if (updated) wfUpdateProject(updated.id, { episodes: updated.episodes }).catch(() => {});
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

  const params: GenerationParams = {
    mode: hasStoryboard ? "first_frame" : "text",
    model: "doubao-seedance-2.0",
    resolution: "720p",
    ratio: "9:16",
    duration: Math.min(Math.max(shot.duration, 4), 10),
    cameraPreset,
    motionSpeed: isDialogue ? "steady" : motionSpeed,
    generateAudio: true,
    firstFrame: hasStoryboard ? shot.storyboard_image! : undefined,
  };

  const promptText = isDialogue
    ? `${shot.raw_description}, subtle movement, talking`
    : shot.raw_description;

  try {
    const payload = buildPayload(promptText, params);
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
          addSystemMessage("视频重新生成完成。");
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
  if (updated) wfUpdateProject(updated.id, { episodes: updated.episodes }).catch(() => {});
}

function updateProjectTitle(title: string) {
  const { project } = getState();
  if (!project) return;
  setState({ project: { ...project, title } });
  wfUpdateProject(project.id, { title }).catch(() => {});
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

  for (const ep of project.episodes) {
    for (const shot of ep.shots) {
      done++;
      const { cameraPreset, motionSpeed } = mapCameraToSeedance(shot.camera_movement);
      const hasStoryboard = !!shot.storyboard_image;
      const isDialogue = !!shot.dialogue;

      addSystemMessage(`正在生成视频 ${done}/${total}: ${shot.raw_description.slice(0, 30)}...`);
      updateShot(ep.id, shot.id, { status: "filming" });

      const params: GenerationParams = {
        mode: hasStoryboard ? "first_frame" : "text",
        model: "doubao-seedance-2.0",
        resolution: "720p",
        ratio: "9:16",
        duration: Math.min(Math.max(shot.duration, 4), 10),
        cameraPreset,
        motionSpeed: isDialogue ? "steady" : motionSpeed,
        generateAudio: true,
        firstFrame: hasStoryboard ? shot.storyboard_image! : undefined,
      };

      const promptText = isDialogue
        ? `${shot.raw_description}, subtle movement, talking, minimal camera motion`
        : shot.raw_description;

      try {
        const payload = buildPayload(promptText, params);
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
              addSystemMessage(`视频 ${done}/${total} 生成完成。`);
              break;
            }
            if (status === "failed" || status === "cancelled") {
              updateShot(ep.id, shot.id, { status: "failed" });
              addSystemMessage(`视频 ${shot.id} 生成失败: ${status}`);
              break;
            }
          } catch {
            // Ignore poll errors, retry
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
    wfUpdateProject(updated.id, { episodes: updated.episodes, status: "post" }).catch(() => {});
  }
  addSystemMessage(`视频全部生成完毕！共 ${total} 个片段。你可以进入"后期"阶段合成导出。`);
}

function addSystemMessage(content: string) {
  const { chatMessages, currentStage } = getState();
  setState({ chatMessages: [...chatMessages, { role: "system" as const, content, timestamp: nowIso(), stage: currentStage }] });
}

function clearChat() { setState({ chatMessages: [] }); }
function setStage(stage: WorkflowStage) { setState({ currentStage: stage, selectedBlock: null }); }
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
