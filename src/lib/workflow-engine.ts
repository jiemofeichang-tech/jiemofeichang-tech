/**
 * AI漫剧工作流引擎
 * 封装所有 AI 调用的 prompt 工程、结果解析和参数映射
 */

import type {
  ScriptAnalysis,
  WfCharacter,
  WfScene,
  WfShot,
  WfEpisode,
  GenerationParams,
} from "./api";
import {
  wfAiChatStream,
  wfGenerateImage,
  createTask,
  queryTask,
  buildPayload,
} from "./api";

// =====================================================
// 剧本分析 (Stage 1)
// =====================================================

const SCRIPT_SYSTEM_PROMPT = `你是一个专业的AI漫剧编剧和导演。
用户会给你一个故事创意或大纲。请深度分析并输出严格的JSON格式。

输出JSON格式:
{
  "title": "作品标题",
  "genre": "题材类型",
  "style": "视觉风格描述",
  "target_platform": "douyin",
  "color_palette": ["#hex1", "#hex2", "#hex3", "#hex4"],
  "characters": [
    {
      "char_id": "char_001",
      "name": "角色名",
      "role": "主角/配角/反派",
      "personality": "性格描述",
      "appearance": {
        "face": "面部特征描述",
        "hair": "发型描述",
        "body": "体型描述",
        "skin_tone": "肤色描述"
      },
      "costume": {
        "main_outfit": "主要服装描述",
        "accessories": "配饰描述",
        "color_scheme": "服装配色"
      },
      "three_view_prompts": {
        "front": "英文前视图提示词, character design sheet, front view, full body, white background...",
        "side": "英文侧视图提示词, character design sheet, side view, full body, white background...",
        "back": "英文背视图提示词, character design sheet, back view, full body, white background..."
      },
      "expression_prompts": {
        "neutral": "英文平静表情提示词",
        "anger": "英文愤怒表情提示词",
        "sorrow": "英文悲伤表情提示词",
        "smirk": "英文得意表情提示词",
        "power_awakening": "英文觉醒表情提示词",
        "shock": "英文惊讶表情提示词"
      },
      "voice_profile": {
        "type": "声音类型",
        "tone": "语调描述"
      }
    }
  ],
  "scenes": [
    {
      "scene_id": "scene_001",
      "name": "场景名",
      "description": "场景描述",
      "environment": {
        "time_of_day": "时间",
        "weather": "天气",
        "atmosphere": "氛围"
      },
      "six_view_prompts": {
        "front": "英文正面提示词...",
        "back": "英文背面提示词...",
        "left": "英文左侧提示词...",
        "right": "英文右侧提示词...",
        "top": "英文俯视提示词...",
        "detail": "英文细节提示词..."
      },
      "lighting": {
        "key_light": "主光描述",
        "fill_light": "补光描述",
        "ambient": "环境光描述",
        "mood": "氛围"
      },
      "color_grading": "调色描述"
    }
  ],
  "episodes": [
    {
      "episode_id": 1,
      "title": "集名",
      "duration_target": "60s",
      "emotion_curve": ["压抑", "蓄力", "爆发", "悬念"],
      "scenes": [
        {
          "scene_id": "s01",
          "scene_ref": "scene_001",
          "description": "场景描述",
          "emotion": "情绪",
          "dialogues": [
            {
              "character": "char_001",
              "text": "对话内容",
              "emotion": "说话时情绪",
              "duration_hint": "3s"
            }
          ],
          "shots": [
            {
              "shot_type": "ELS/LS/FS/MS/CU/ECU",
              "subject": "主体",
              "action": "动作描述",
              "camera_movement": "push_in_slow/pull_back/pan_left/orbit/static/handheld",
              "duration": "3s",
              "lighting_note": "光线备注"
            }
          ],
          "bgm_instruction": {
            "mood": "情绪",
            "instrument": "乐器",
            "tempo": "节拍"
          },
          "sfx": ["音效1", "音效2"]
        }
      ]
    }
  ],
  "visual_style_guide": {
    "art_style": "画风描述",
    "rendering": "渲染风格",
    "line_work": "线条风格",
    "texture": "纹理风格"
  },
  "camera_language_guide": {
    "dialogue_scenes": { "default_pattern": "正反打" },
    "action_scenes": { "default_pattern": "快切" },
    "emotion_scenes": { "default_pattern": "慢推" }
  }
}

重要要求:
1. 所有图像提示词(prompts)必须用英文，其他描述用中文
2. 三视图提示词要包含完整的角色外貌、服装、配饰描述
3. 每集的镜头(shots)要遵循"前3秒出钩子、每10秒一个爽点、结尾致命悬念"的节奏
4. 只输出JSON，不要用代码块标记，不要其他文字`;

export async function analyzeScript(
  rawInput: string,
  onProgress: (text: string) => void,
): Promise<ScriptAnalysis> {
  const result = await wfAiChatStream(
    {
      model: "claude-opus-4-6",
      messages: [
        { role: "system", content: SCRIPT_SYSTEM_PROMPT },
        { role: "user", content: rawInput },
      ],
    },
    onProgress,
  );

  // Extract JSON from the response
  const jsonStr = extractJson(result);
  return JSON.parse(jsonStr);
}

// =====================================================
// 角色三视图生成 (Stage 2)
// =====================================================

export async function generateCharacterViews(
  character: ScriptAnalysis["characters"][0],
  projectId: string,
  imageModel: string = "nano-banana-2",
): Promise<{ front: string | null; side: string | null; back: string | null }> {
  const views: { front: string | null; side: string | null; back: string | null } = {
    front: null,
    side: null,
    back: null,
  };

  for (const view of ["front", "side", "back"] as const) {
    const prompt = character.three_view_prompts[view];
    if (!prompt) continue;

    try {
      const result = await wfGenerateImage({
        model: imageModel,
        prompt,
        n: 1,
        size: "1024x1536",
        project_id: projectId,
        asset_filename: `${character.char_id}_${view}.png`,
      });
      if (result.saved_assets?.[0]?.asset_url) {
        views[view] = result.saved_assets[0].asset_url;
      } else if (result.data?.[0]?.url) {
        views[view] = result.data[0].url;
      }
    } catch (err) {
      console.error(`生成${character.name}${view}视图失败:`, err);
    }
  }

  return views;
}

export async function generateSceneViews(
  scene: ScriptAnalysis["scenes"][0],
  projectId: string,
  imageModel: string = "nano-banana-2",
): Promise<Record<string, string | null>> {
  const views: Record<string, string | null> = {};
  const viewKeys = ["front", "back", "left", "right", "top", "detail"];

  for (const view of viewKeys) {
    const prompt = scene.six_view_prompts[view];
    if (!prompt) continue;

    try {
      const result = await wfGenerateImage({
        model: imageModel,
        prompt,
        n: 1,
        size: "1920x1080",
        project_id: projectId,
        asset_filename: `${scene.scene_id}_${view}.png`,
      });
      if (result.saved_assets?.[0]?.asset_url) {
        views[view] = result.saved_assets[0].asset_url;
      } else if (result.data?.[0]?.url) {
        views[view] = result.data[0].url;
      }
    } catch (err) {
      console.error(`生成${scene.name}${view}视图失败:`, err);
    }
  }

  return views;
}

// =====================================================
// 分镜提示词组装 (Stage 3)
// =====================================================

export function buildShotPrompt(
  shot: ScriptAnalysis["episodes"][0]["scenes"][0]["shots"][0],
  characters: ScriptAnalysis["characters"],
  scene: ScriptAnalysis["scenes"][0],
  styleGuide: ScriptAnalysis["visual_style_guide"],
): string {
  const parts: string[] = [];

  // Style prefix
  if (styleGuide) {
    const artStyle = (styleGuide as Record<string, string>).art_style || "";
    const rendering = (styleGuide as Record<string, string>).rendering || "";
    if (artStyle) parts.push(artStyle);
    if (rendering) parts.push(rendering);
  }

  // Shot description
  parts.push(`${shot.shot_type} shot`);
  parts.push(shot.action);

  // Scene context
  if (scene.environment) {
    const env = scene.environment;
    if (env.time_of_day) parts.push(env.time_of_day);
    if (env.weather) parts.push(env.weather);
    if (env.atmosphere) parts.push(env.atmosphere);
  }

  // Camera suffix
  const cameraMap: Record<string, string> = {
    push_in_slow: "slow push in camera movement",
    pull_back: "slow pull back camera movement",
    pan_left: "pan left camera movement",
    pan_right: "pan right camera movement",
    orbit: "orbiting camera movement",
    static: "static shot",
    handheld: "handheld documentary style",
    vertical_descend_slow: "vertical descending camera",
  };
  const cameraDesc = cameraMap[shot.camera_movement] || shot.camera_movement;
  if (cameraDesc) parts.push(cameraDesc);

  // Quality suffix
  parts.push("masterpiece, best quality, highly detailed, 9:16 vertical, 1080x1920");

  return parts.filter(Boolean).join(", ");
}

export function convertAnalysisToProjectData(analysis: ScriptAnalysis): {
  characters: WfCharacter[];
  scenes: WfScene[];
  episodes: WfEpisode[];
} {
  const characters: WfCharacter[] = analysis.characters.map((c) => ({
    id: c.char_id,
    name: c.name,
    description: `${c.role} | ${c.personality}`,
    appearance_prompt: c.three_view_prompts.front,
    front_view: null,
    side_view: null,
    back_view: null,
    expression_sheet: null,
    status: "pending" as const,
  }));

  const scenes: WfScene[] = analysis.scenes.map((s) => ({
    id: s.scene_id,
    name: s.name,
    description: s.description,
    views: { front: null, back: null, left: null, right: null, top: null, detail: null },
    status: "pending" as const,
  }));

  const episodes: WfEpisode[] = analysis.episodes.map((ep) => {
    let shotIndex = 0;
    const allShots: WfShot[] = [];

    for (const sc of ep.scenes) {
      for (const shot of sc.shots) {
        shotIndex++;
        const shotId = `ep${ep.episode_id}_shot_${String(shotIndex).padStart(3, "0")}`;

        // Find relevant character IDs from dialogues
        const charIds = sc.dialogues?.map((d) => d.character) || [];
        const dialogue = sc.dialogues?.map((d) => d.text).join(" ") || "";

        // Build prompt
        const prompt = buildShotPrompt(
          shot,
          analysis.characters,
          analysis.scenes.find((s) => s.scene_id === sc.scene_ref) || analysis.scenes[0],
          analysis.visual_style_guide || null,
        );

        allShots.push({
          id: shotId,
          episode_id: String(ep.episode_id),
          scene_id: sc.scene_ref || sc.scene_id,
          character_ids: [...new Set(charIds)],
          prompt,
          raw_description: `${shot.subject}: ${shot.action}`,
          shot_type: shot.shot_type,
          camera_movement: shot.camera_movement,
          duration: parseInt(shot.duration) || 5,
          dialogue: dialogue || undefined,
          emotion: sc.emotion,
          storyboard_image: null,
          video_task_id: null,
          video_url: null,
          video_local_path: null,
          status: "draft",
        });
      }
    }

    return {
      id: String(ep.episode_id),
      title: ep.title,
      shots: allShots,
    };
  });

  return { characters, scenes, episodes };
}

// =====================================================
// 分镜图生成 (Stage 3)
// =====================================================

export async function generateStoryboardImage(
  shot: WfShot,
  projectId: string,
  imageModel: string = "nano-banana-2",
): Promise<string | null> {
  try {
    const result = await wfGenerateImage({
      model: imageModel,
      prompt: shot.prompt,
      n: 1,
      size: "1080x1920",
      project_id: projectId,
      asset_filename: `storyboard_${shot.id}.png`,
    });
    return result.saved_assets?.[0]?.asset_url || result.data?.[0]?.url || null;
  } catch (err) {
    console.error(`生成分镜图失败 (${shot.id}):`, err);
    return null;
  }
}

// =====================================================
// 视频生成 (Stage 4)
// =====================================================

const CAMERA_TO_SEEDANCE: Record<string, { cameraPreset: string; motionSpeed: string }> = {
  push_in_slow: { cameraPreset: "push_in", motionSpeed: "slow" },
  pull_back: { cameraPreset: "pull_back", motionSpeed: "slow" },
  pan_left: { cameraPreset: "pan", motionSpeed: "steady" },
  pan_right: { cameraPreset: "pan", motionSpeed: "steady" },
  orbit: { cameraPreset: "orbit", motionSpeed: "steady" },
  static: { cameraPreset: "auto", motionSpeed: "steady" },
  handheld: { cameraPreset: "handheld", motionSpeed: "steady" },
  vertical_descend_slow: { cameraPreset: "auto", motionSpeed: "slow" },
};

export function mapCameraToSeedance(movement: string): { cameraPreset: string; motionSpeed: string } {
  return CAMERA_TO_SEEDANCE[movement] || { cameraPreset: "auto", motionSpeed: "steady" };
}

export async function generateVideoForShot(
  shot: WfShot,
  onProgress?: (taskId: string, status: string, percent: number) => void,
): Promise<{ taskId: string; videoUrl: string | null; localPath: string | null }> {
  const { cameraPreset, motionSpeed } = mapCameraToSeedance(shot.camera_movement);

  // Determine generation mode based on available assets
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
    ? `${shot.raw_description}, subtle movement, talking, minimal camera motion`
    : shot.raw_description;

  const payload = buildPayload(promptText, params);
  const task = await createTask(payload, { title: shot.id, mode: "workflow" });
  const taskId = task.id;

  onProgress?.(taskId, "created", 10);

  // Poll until complete
  let videoUrl: string | null = null;
  let localPath: string | null = null;

  const poll = async (): Promise<void> => {
    const updated = await queryTask(taskId);
    const status = updated.status || "unknown";
    const percent = updated.progress_percent || updated.completed_percentage || 0;

    onProgress?.(taskId, status, Number(percent));

    if (status === "succeeded") {
      videoUrl = updated.content?.video_url || updated._proxy?.videoUrls?.[0] || null;
      localPath = updated.local_asset?.local_url || null;
      return;
    }
    if (status === "failed" || status === "cancelled") {
      throw new Error(`视频生成失败: ${status}`);
    }

    // Wait and retry
    await new Promise((r) => setTimeout(r, 6000));
    return poll();
  };

  await poll();
  return { taskId, videoUrl, localPath };
}

// =====================================================
// 辅助函数
// =====================================================

function extractJson(text: string): string {
  // Try to find JSON block in markdown
  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (jsonBlockMatch) return jsonBlockMatch[1].trim();

  // Try to find raw JSON object
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  // Return as-is and let JSON.parse handle it
  return text.trim();
}
