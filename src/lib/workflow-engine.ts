/**
 * AI漫剧工作流引擎
 * 封装所有 AI 调用的 prompt 工程、结果解析和参数映射
 */

import type {
  ScriptAnalysis,
  StyleConfig,
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
// 剧本分析 (Stage 1) — 设计文档 03
// =====================================================

/**
 * 系统提示词模板（含占位符，由 buildScriptPrompt 注入参数）
 * 参考：docs/03-剧本解析与结构化拆解.md §三
 */
const SCRIPT_SYSTEM_PROMPT_TEMPLATE = `你是世界级 AI 漫剧编剧 + 顶级分镜导演 + 奥斯卡级摄影指导 + AI 视频提示词工程师的联合体。
用户会给你一个故事创意或大纲，以及视觉风格总纲。

你的目标不是泛泛总结，而是以电影导演 / 顶级摄影指导 / 分镜设计师 / AI 视频提示词工程师的联合视角，对每一个镜头进行高精度可复现分析。

## 视觉风格约束
{COMPILED_STYLE_PROMPT}

## 项目参数
- 目标总时长: {DURATION_SEC}秒
- 画面比例: {ASPECT_RATIO}
- 对白语言: {LANGUAGE}
- 预计分镜数: {SHOT_COUNT}（每镜头约{SHOT_DURATION}秒）

## 专业分析标准

### 光学与相机分析
对每个镜头必须推断：
- 焦距：14mm / 24mm / 35mm / 50mm / 85mm / 135mm
- 光圈与景深：f/1.4 极浅 / f/2.8 中浅 / f/8 深景深 / f/11 深焦
- 机位高度：俯拍 / 平视 / 仰拍 / 贴地低机位 / 高位俯冲
- 摄影机运动：推入/拉出/卡车移动/摇摄/倾斜/吊臂/弧形轨道/手持/斯坦尼康/起重机
- 速度节奏：缓慢 / 匀速 / 加速 / 急停 / 甩动 / 悬停
- 空间关系：前景 / 中景 / 后景层次，视差 / 空间压缩

### 视觉构图标准
- 景别：大远景 ELS / 全景 LS / 中景 MS / 中近景 MCU / 近景 CU / 大特写 ECU / 插入镜头
- 构图法则：对称 / 三分法 / 黄金螺旋 / 引导线 / 框架式 / 中心 / 负空间 / 压迫式
- 前中后景关系：遮挡 / 景框 / 镜面反射 / 门框窗框框中框

### 主体与微动作标准
使用主谓宾结构描述动作，细化到微表情与生物力学：
- 眼神偏移、瞳孔收缩、下颌绷紧
- 肩部发力、重心前移、脚步启动
- 指尖触碰、手腕内旋、物体位移
- 衣摆、发丝、烟雾、水滴等次级运动

### 照明与色彩标准
- 主光源方向：侧光 / 顶光 / 逆光 / 底光 / 混合光
- 光质：硬光 / 柔光 / 漫射 / 体积光 / 伦勃朗光 / 轮廓光
- 色温：冷 3200K / 中性 5600K / 暖 6500K
- 明暗对比：高光阴影比、低调/高调照明
- 材质呈现：皮肤高光、金属反射、玻璃折射、潮湿反光、烟雾吃光

### 转场与剪辑标准
- 转场类型：硬切 / 匹配切 / 动作切 / J型切 / L型切 / 溶解 / 隐藏切
- 音画关系：先出声后见画 / 先见画后入声 / 音效桥接
- 剪辑逻辑：动势匹配 / 视线匹配 / 节奏对位 / 情绪反差切

## 提示词构建标准（极其重要）

### 角色三视图提示词公式
[Optics: lens, aperture] + [Full body, view angle] + [Detailed face: eye shape, nose, jaw, skin tone] + [Hair: style, color, length, texture] + [Body type: height, build, age] + [Costume: fabric, color, cut, layering] + [Accessories: jewelry, glasses, weapons, props] + [Lighting on character] + [Style keywords] + white background, character design sheet, model sheet, consistent design

### 角色表情提示词公式
[Character name] portrait, [lens focal length], [aperture/depth], [specific expression with micro-details: pupil dilation, brow tension, lip curl, jaw clench], [skin texture and lighting], [Style keywords]

### 场景六视图提示词公式
environment concept art, [view angle] view, [Optics: lens, aperture] + [Detailed spatial description: architecture, materials, textures, proportions] + [Time of day + weather + atmosphere] + [Key light direction, color temperature, shadow quality] + [Fill light, ambient, practicals] + [Color grading: warm/cool/contrast/saturation] + [Atmospheric effects: haze, dust, volumetric light, rain streaks] + [Style keywords], no characters, detailed background, {ASPECT_RATIO} aspect ratio

### 分镜 visual_prompt 公式（SeedEdit 2.0 标准）
每个 shot 的 visual_prompt 必须严格遵循以下英文短语结构化逗号分隔：
[Optics: focal length, aperture, depth of field] + [Shot size & composition: rule of thirds / golden ratio / leading lines] + [Subject appearance & precise action with micro-movements] + [Environment & background details with spatial layers] + [Lighting quality: key light direction, fill, color temperature, shadow ratio] + [Color palette & grading] + [Camera movement in 3D space: axis, direction, speed] + [Style keywords]

禁止空泛形容词：beautiful, cinematic, awesome, cool, stunning, amazing
鼓励高信息密度表达如：
- 35mm lens, f/2.0, medium close-up, rule of thirds composition
- subtle pupil contraction, right shoulder initiates turn, fingertips brushing table edge
- warm tungsten practicals 3200K, cool ambient fill 5600K, soft volumetric haze
- slow dolly-in on Z-axis with slight pan right parallax

## 输出 JSON 格式
{
  "title": "作品标题",
  "genre": "题材类型",
  "style": "视觉风格简述",
  "target_platform": "douyin/bilibili/kuaishou",
  "color_palette": ["#hex1", "#hex2", "#hex3", "#hex4"],

  "characters": [
    {
      "char_id": "char_001",
      "name": "角色名",
      "role": "主角/配角/反派/路人",
      "personality": "3~5个性格关键词",
      "appearance": {
        "face": "面部特征（五官、脸型、肤色、微特征如痣/疤痕/雀斑）",
        "hair": "发型、发色、长度、质感（丝滑/蓬松/卷曲）",
        "body": "体型、身高、年龄段、体态特征",
        "skin_tone": "肤色（精确到色调倾向）"
      },
      "costume": {
        "main_outfit": "主要服装详细描述（面料、剪裁、颜色、层次）",
        "accessories": "配饰（眼镜型号、首饰材质、武器款式、随身物品）",
        "color_scheme": "服装配色方案（主色+辅色+点缀色）"
      },
      "three_view_prompts": {
        "front": "85mm lens, f/4, character design sheet, front view, full body, [极详细的角色英文外貌: facial structure, eye shape/color, nose bridge, lip shape, skin texture], [发型发色详细], [精确服装描述: fabric, cut, layering, wrinkle detail], [配饰], {STYLE_KEYWORDS}, white background, consistent design, model sheet, even studio lighting",
        "side": "85mm lens, f/4, character design sheet, 3/4 side view, full body, [同上外貌但侧面角度细节], [服装侧面轮廓和褶皱], {STYLE_KEYWORDS}, white background, consistent design, model sheet, even studio lighting",
        "back": "85mm lens, f/4, character design sheet, back view, full body, [背面发型细节/后脑勺], [服装背面结构], [配饰背面], {STYLE_KEYWORDS}, white background, consistent design, model sheet, even studio lighting"
      },
      "expression_prompts": {
        "neutral": "[角色名] portrait, 85mm lens, f/2.0, shallow depth of field, neutral calm expression, relaxed brow, steady gaze, lips gently closed, natural skin texture with subtle specular highlights, {STYLE_KEYWORDS}",
        "happy": "[角色名] portrait, 85mm lens, f/2.0, genuine bright smile, crinkled eye corners, raised cheekbones, slight teeth showing, warm catch light in eyes, {STYLE_KEYWORDS}",
        "angry": "[角色名] portrait, 85mm lens, f/2.0, fierce expression, deeply furrowed brows, flared nostrils, clenched jaw, tense neck tendons, hard rim light, {STYLE_KEYWORDS}",
        "sad": "[角色名] portrait, 85mm lens, f/2.0, sorrowful downcast eyes, trembling lower lip, slight redness around nose, glistening tear forming, soft diffused light, {STYLE_KEYWORDS}",
        "surprised": "[角色名] portrait, 85mm lens, f/2.0, wide shocked eyes with dilated pupils, raised eyebrows, parted lips, slightly pulled-back head, bright catch light, {STYLE_KEYWORDS}",
        "determined": "[角色名] portrait, 85mm lens, f/2.0, resolute focused gaze, slightly narrowed eyes, set jaw, compressed lips, strong directional key light, {STYLE_KEYWORDS}"
      },
      "voice_profile": {
        "type": "成熟女声/少女音/少年音/低沉男声/...",
        "tone": "语调描述"
      }
    }
  ],

  "scenes": [
    {
      "scene_id": "scene_001",
      "name": "场景名",
      "description": "场景详细描述（中文，含空间尺度、材质、氛围）",
      "environment": {
        "time_of_day": "清晨/上午/正午/下午/傍晚/夜晚",
        "weather": "晴/阴/雨/雪/雾/暴风",
        "atmosphere": "氛围（温馨/紧张/神秘/压抑/欢乐）"
      },
      "six_view_prompts": {
        "front": "environment concept art, front entrance view, 24mm lens, f/8 deep focus, [场景英文描述: architecture style, wall materials, floor texture, furniture placement, spatial depth], [time of day lighting: key light direction, color temp, shadow length], [atmospheric effects: dust motes, volumetric light, haze], {STYLE_KEYWORDS}, no characters, detailed background",
        "back": "environment concept art, back wall view, 24mm lens, f/8, [背面墙壁/窗户/出口细节], [光线从前方打来的效果], {STYLE_KEYWORDS}, no characters",
        "left": "environment concept art, left side view, 24mm lens, f/8, [左侧空间细节: 家具/装饰/材质], [侧面光线效果], {STYLE_KEYWORDS}, no characters",
        "right": "environment concept art, right side view, 24mm lens, f/8, [右侧空间细节], [侧面光线效果], {STYLE_KEYWORDS}, no characters",
        "top": "environment concept art, bird's eye overhead view, 14mm lens, f/11, [俯视空间布局: 家具摆放/地面材质/路径], {STYLE_KEYWORDS}, no characters",
        "detail": "environment concept art, atmospheric detail close-up, 50mm lens, f/2.8, [关键道具/材质特写: 纹理/磨损/反光], [微距光线效果], {STYLE_KEYWORDS}, no characters"
      },
      "lighting": {
        "key_light": "主光源方向与强度（如：screen-left 45° warm tungsten 3200K）",
        "fill_light": "补光描述（如：cool ambient bounce from ceiling 5600K, 2-stop under key）",
        "ambient": "环境光色温与质感（如：diffused overcast daylight through frosted windows）",
        "mood": "光影氛围（如：Rembrandt triangle on face, deep shadows, intimate low-key）"
      },
      "color_grading": "调色描述（如：teal-orange split tone, lifted blacks, desaturated midtones, warm highlights）"
    }
  ],

  "episodes": [
    {
      "episode_id": 1,
      "title": "第一集标题",
      "duration_target": "60s",
      "emotion_curve": ["情绪节点1", "情绪节点2", "情绪节点3"],
      "scenes": [
        {
          "scene_id": "s01",
          "scene_ref": "scene_001",
          "description": "本场景描述",
          "emotion": "当前情绪",
          "dialogues": [
            {
              "character": "char_001",
              "text": "对白内容",
              "emotion": "说话时的情绪",
              "duration_hint": "3s"
            }
          ],
          "shots": [
            {
              "shot_type": "ELS/LS/FS/MS/MCU/CU/ECU",
              "subject": "镜头主体",
              "action": "动作描述（含微动作：眼神偏移/指尖动作/重心转移/衣摆飘动）",
              "camera_movement": "push_in_slow/pull_back/pan_left/orbit/static/handheld/tilt_up/crane_down/dolly_in/truck_right/arc_left/steadicam_follow",
              "duration": "5s",
              "optics": "焦距+光圈（如：35mm f/2.0）",
              "composition": "构图法则（如：rule of thirds, subject left third）",
              "lighting_note": "本镜头光线（如：warm side key from right, cool fill, rim light on hair）",
              "transition": "转场方式（如：hard cut / J-cut / match cut on motion）",
              "visual_prompt": "按SeedEdit 2.0公式生成的英文提示词: [Optics] + [Shot size & composition] + [Subject appearance & precise action] + [Environment & background] + [Lighting & color] + [Camera movement & speed] + {STYLE_KEYWORDS}"
            }
          ],
          "bgm_instruction": {
            "mood": "情绪（紧张/温馨/热血/悲伤）",
            "instrument": "主要乐器",
            "tempo": "快/中/慢"
          },
          "sfx": ["音效1", "音效2"]
        }
      ]
    }
  ],

  "visual_style_guide": {
    "art_style": "画风总结",
    "rendering": "渲染风格",
    "line_work": "线条风格",
    "texture": "纹理风格"
  },
  "camera_language_guide": {
    "dialogue_scenes": { "default_pattern": "正反打交替CU，85mm f/2.0，视线匹配切" },
    "action_scenes": { "default_pattern": "快切FS+MS组合，24-35mm，手持晃动，动势匹配切" },
    "emotion_scenes": { "default_pattern": "慢推CU→ECU，85-135mm f/1.4，浅景深，J-cut" }
  }
}

## 重要要求（必须严格遵守，违反任何一条视为输出无效）

0. 【最高优先级】每个 scene 的 "shots" 数组是 **必填字段**，绝对不能省略、不能为空数组。每个 scene 至少包含 2 个 shot。如果你的输出中任何 scene 缺少 shots 或 shots 为空，整个输出将被丢弃重做。
1. 所有图像提示词(prompts)必须用英文，其他描述用中文
2. 三视图提示词必须包含：镜头参数(85mm f/4) + 极致详细的角色外貌(面部骨骼结构/眼型/唇形/肤质) + 服装(面料/剪裁/褶皱/层次) + 配饰 + 风格关键词
3. 六视图提示词必须包含：镜头参数(24mm f/8) + 空间建筑材质纹理 + 精确光线方向与色温 + 大气效果(体积光/尘埃/雾气) + 风格关键词
4. 分镜 visual_prompt 必须严格按 SeedEdit 2.0 公式：[光学参数] + [景别构图] + [主体外貌+精确动作含微动作] + [环境背景] + [灯光色彩] + [摄影机运动+速度]
5. 禁止在提示词中使用空泛形容词：beautiful, cinematic, awesome, cool, stunning, amazing, gorgeous
6. 每集的镜头(shots)总时长应接近 duration_target
7. 分镜拆分标准（任一满足即新建镜头）：
   - 场景/地点变化
   - 时间跳转
   - 人物构成变化
   - 关键道具首次出现
   - 情绪明显转折
   - 重要动作开始或结束
   - 对话主体转换
   - 视角/距离需要改变
   - 景别显著变化
   - 摄影机运动逻辑改变
   - 构图重心迁移
   - 光线结构突变
8. 一个镜头只讲述一件事，不要在一个镜头中塞入过多信息
9. 景别与内容匹配：特写不描述大环境，远景不要求微表情
10. 对于 {SHOT_COUNT} 个镜头的分配：开头2镜建立世界观，中间推进剧情，最后1镜必须是悬念/高潮
11. 所有英文提示词末尾必须包含风格关键词
12. 只输出 JSON，不要代码块标记，不要其他文字`;

/**
 * 从 StyleConfig 构建完整的系统提示词（注入风格参数）
 * 参考：docs/03-剧本解析与结构化拆解.md §三.2
 */
export function buildScriptPrompt(styleConfig?: StyleConfig | null): string {
  if (!styleConfig) {
    // 无风格配置时使用精简默认值
    return SCRIPT_SYSTEM_PROMPT_TEMPLATE
      .replace("{COMPILED_STYLE_PROMPT}", "（用户未设置风格，请根据故事内容自行决定画风）")
      .replace("{DURATION_SEC}", "60")
      .replace("{ASPECT_RATIO}", "9:16")
      .replace("{LANGUAGE}", "中文")
      .replace("{SHOT_COUNT}", "12")
      .replace("{SHOT_DURATION}", "5")
      .replaceAll("{STYLE_KEYWORDS}", "high quality, detailed, cinematic lighting");
  }

  const shotCount = Math.ceil((styleConfig.duration_sec || 60) / (styleConfig.shot_duration_sec || 5));
  const styleKeywords = extractTopKeywords(styleConfig.compiled_style_prompt, 8);

  return SCRIPT_SYSTEM_PROMPT_TEMPLATE
    .replace("{COMPILED_STYLE_PROMPT}", styleConfig.compiled_style_prompt || "")
    .replace("{DURATION_SEC}", String(styleConfig.duration_sec || 60))
    .replace("{ASPECT_RATIO}", styleConfig.aspect_ratio || "9:16")
    .replace("{LANGUAGE}", styleConfig.language || "中文")
    .replace("{SHOT_COUNT}", String(shotCount))
    .replace("{SHOT_DURATION}", String(styleConfig.shot_duration_sec || 5))
    .replaceAll("{STYLE_KEYWORDS}", styleKeywords || "high quality, detailed");
}

/**
 * 两步生成剧本分析：
 * 第一步：生成基础结构（角色三视图提示词 + 场景 + 分集含 shots）
 * 第二步：补充场景六视图提示词 + 镜头 visual_prompt 等详细数据
 */
export async function analyzeScript(
  rawInput: string,
  onProgress: (text: string) => void,
  styleConfig?: StyleConfig | null,
): Promise<ScriptAnalysis> {
  // ── 第一步：多子步生成基础结构 ──
  const step1 = await analyzeScript_step1(rawInput, onProgress, styleConfig);

  // ── 补充角色三视图提示词 ──
  const styleKeywords = styleConfig?.compiled_style_prompt
    ? extractTopKeywords(styleConfig.compiled_style_prompt, 8)
    : "high quality, detailed, cinematic lighting";
  for (const char of step1.characters) {
    onProgress(`[1d] 正在生成「${char.name}」的三视图提示词...`);
    await step1d_charPrompts(char, styleKeywords, onProgress);
  }

  // ── 第二步：补充场景六视图提示词 + 镜头 visual_prompt ──
  const full = await analyzeScript_step2(step1, onProgress, styleConfig);

  return full;
}

/**
 * 第一步：多子步生成基础剧本结构（绕过代理 ~4000 字符输出限制）
 * 1a → 角色列表 + 分集大纲（仅标题）
 * 1b → 场景列表（含环境/光照，无六视图提示词）
 * 1c → 逐集 shots（每集单独一次请求）
 */
async function analyzeScript_step1(
  rawInput: string,
  onProgress: (text: string) => void,
  styleConfig?: StyleConfig | null,
): Promise<ScriptAnalysis> {
  const shotDuration = styleConfig?.shot_duration_sec || 5;
  const totalDuration = styleConfig?.duration_sec || 60;
  const shotCount = Math.ceil(totalDuration / shotDuration);

  // ── 子步 1a：角色 + 分集大纲 ──
  onProgress("[1a] 正在提取角色与分集大纲...");
  const step1aResult = await step1a_characters(rawInput, onProgress);

  const {
    title, genre, style, target_platform, color_palette,
    characters, episode_outline,
  } = step1aResult;

  // ── 子步 1b：场景 ──
  onProgress("[1b] 正在生成场景列表...");
  const scenes = await step1b_scenes(rawInput, onProgress);

  // ── 子步 1c：逐集 shots ──
  const episodes: ScriptAnalysis["episodes"] = [];
  for (const epOutline of episode_outline) {
    onProgress(`[1c] 正在生成第 ${epOutline.episode_id} 集分镜...`);
    const ep = await step1c_episode(
      rawInput, epOutline, characters, scenes, shotCount, shotDuration, onProgress,
    );
    episodes.push(ep);
  }

  return {
    title: title || "未命名作品",
    genre: genre || "",
    style: style || "",
    target_platform: target_platform || "douyin",
    color_palette: color_palette || [],
    characters,
    scenes,
    episodes,
  } as ScriptAnalysis;
}

/** 子步 1a：角色列表 + 分集大纲 */
async function step1a_characters(
  rawInput: string,
  onProgress: (text: string) => void,
): Promise<{
  title: string; genre: string; style: string; target_platform: string;
  color_palette: string[];
  characters: ScriptAnalysis["characters"];
  episode_outline: { episode_id: number; title: string }[];
}> {
  const systemPrompt = `你是AI漫剧编剧。分析故事，提取角色和分集大纲。只输出JSON，不要代码块。

JSON格式:
{"title":"标题","genre":"题材","style":"风格","target_platform":"douyin","color_palette":["#hex1"],
"characters":[{"char_id":"char_001","name":"名","role":"主角/配角","personality":"性格","appearance":{"face":"面部","hair":"发型","body":"体型","skin_tone":"肤色"},"costume":{"main_outfit":"服装","accessories":"配饰","color_scheme":"配色"},"three_view_prompts":{"front":"tbd","side":"tbd","back":"tbd"},"expression_prompts":{"neutral":"tbd"},"voice_profile":{"type":"声线","tone":"语调"}}],
"episode_outline":[{"episode_id":1,"title":"集标题"},{"episode_id":2,"title":"集标题"}]}

注意：三视图提示词填"tbd"即可，后续会补充。分集数量根据故事长度决定，一般3-5集。`;

  const result = await wfAiChatStream(
    { model: "gemini-2.5-pro", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: rawInput }], temperature: 0.7 },
    onProgress,
  );

  const parsed = JSON.parse(extractJson(result));
  if (!parsed.title) throw new Error("1a: 缺少 title");
  return {
    title: parsed.title,
    genre: parsed.genre || "",
    style: parsed.style || "",
    target_platform: parsed.target_platform || "douyin",
    color_palette: parsed.color_palette || [],
    characters: parsed.characters || [],
    episode_outline: parsed.episode_outline || [{ episode_id: 1, title: "第一集" }],
  };
}

/** 子步 1b：场景列表（始终用对象格式以支持截断修复） */
async function step1b_scenes(
  rawInput: string,
  onProgress: (text: string) => void,
): Promise<ScriptAnalysis["scenes"]> {
  const systemPrompt = `你是AI漫剧场景设计师。分析故事，提取所有场景。只输出JSON，不要代码块。

JSON格式（对象包裹）:
{"scenes":[{"scene_id":"scene_001","name":"场景名","description":"详细场景描述50字以上","environment":{"time_of_day":"时段","weather":"天气","atmosphere":"氛围"},"lighting":{"key_light":"主光源方向","fill_light":"补光","ambient":"环境光","mood":"光影氛围"},"color_grading":"调色风格"}]}

每个场景只需中文描述，不需要英文提示词（后续会单独生成）。一般3-6个场景。`;

  const result = await wfAiChatStream(
    { model: "gemini-2.5-pro", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: rawInput }], temperature: 0.7 },
    onProgress,
  );

  const jsonStr = extractJson(result);
  const obj = JSON.parse(jsonStr);
  if (Array.isArray(obj.scenes)) return obj.scenes;
  if (Array.isArray(obj)) return obj; // 兜底：AI 仍输出数组
  return [];
}

/** 子步 1c：单集 shots */
async function step1c_episode(
  rawInput: string,
  epOutline: { episode_id: number; title: string },
  characters: ScriptAnalysis["characters"],
  scenes: ScriptAnalysis["scenes"],
  shotCount: number,
  shotDuration: number,
  onProgress: (text: string) => void,
): Promise<ScriptAnalysis["episodes"][0]> {
  const charNames = characters.map((c) => `${c.char_id}:${c.name}`).join(", ");
  const sceneIds = scenes.map((s) => `${s.scene_id}:${s.name}`).join(", ");
  const shotsPerEp = Math.ceil(shotCount / Math.max(1, 1)); // per episode estimate

  const systemPrompt = `你是AI分镜导演。为指定分集生成分镜结构。只输出JSON，不要代码块。

可用角色: ${charNames}
可用场景: ${sceneIds}
每集预计镜头数约${shotsPerEp}个，每镜头约${shotDuration}秒。

JSON格式:
{"episode_id":${epOutline.episode_id},"title":"${epOutline.title}","duration_target":"60s","emotion_curve":["开始","发展","高潮"],
"scenes":[{"scene_id":"s01","scene_ref":"scene_001","description":"场景描述","emotion":"情绪",
"dialogues":[{"character":"char_001","text":"对白","emotion":"情绪","duration_hint":"3s"}],
"shots":[{"shot_type":"MS","subject":"主体","action":"动作描述含微动作如眼神偏移/指尖触碰","camera_movement":"push_in_slow","duration":"5s","optics":"35mm f/2.0","composition":"rule of thirds","lighting_note":"光线","transition":"hard cut"}]}]}

注意：visual_prompt 留空，后续会补充。每个scene至少2个shot。`;

  const userContent = `故事:\n${rawInput.slice(0, 800)}\n\n请为「第${epOutline.episode_id}集：${epOutline.title}」生成分镜。`;

  const result = await wfAiChatStream(
    { model: "gemini-2.5-pro", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userContent }], temperature: 0.7 },
    onProgress,
  );

  try {
    const jsonStr = extractJson(result);
    const ep = JSON.parse(jsonStr);
    if (!ep.episode_id) ep.episode_id = epOutline.episode_id;
    if (!ep.title) ep.title = epOutline.title;
    if (!ep.scenes) ep.scenes = [];
    return ep as ScriptAnalysis["episodes"][0];
  } catch {
    // 降级：返回空集
    return {
      episode_id: epOutline.episode_id,
      title: epOutline.title,
      duration_target: "60s",
      emotion_curve: [],
      scenes: [],
    } as ScriptAnalysis["episodes"][0];
  }
}

/** 子步 1d：为单个角色生成三视图+表情提示词，直接写入 character 对象 */
async function step1d_charPrompts(
  char: ScriptAnalysis["characters"][0],
  styleKeywords: string,
  onProgress: (text: string) => void,
): Promise<void> {
  const charDesc = `名字:${char.name} | 性格:${char.personality} | 面部:${char.appearance?.face} | 发型:${char.appearance?.hair} | 体型:${char.appearance?.body} | 肤色:${char.appearance?.skin_tone} | 服装:${char.costume?.main_outfit} | 配饰:${char.costume?.accessories}`;

  const systemPrompt = `你是AI角色设计师。为角色生成三视图和表情英文提示词。只输出JSON，不要代码块。

三视图格式（每个约80字）：
85mm lens, f/4, character design sheet, [角度] view, full body, [面部骨骼/眼型/唇形/肤质], [发型发色], [服装面料/剪裁/褶皱], [配饰], ${styleKeywords}, white background, model sheet

表情格式（每个约50字）：
[角色名] portrait, 85mm lens, f/2.0, [具体表情含微动作], [光线], ${styleKeywords}

输出格式:
{"three_view_prompts":{"front":"...","side":"...","back":"..."},"expression_prompts":{"neutral":"...","happy":"...","angry":"...","sad":"...","surprised":"...","determined":"..."}}`;

  const result = await wfAiChatStream(
    { model: "gemini-2.5-pro", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: `角色信息:\n${charDesc}` }], temperature: 0.7 },
    onProgress,
  );

  try {
    const jsonStr = extractJson(result);
    const data = JSON.parse(jsonStr);
    if (data.three_view_prompts) char.three_view_prompts = data.three_view_prompts;
    if (data.expression_prompts) char.expression_prompts = data.expression_prompts;
  } catch (e) {
    console.warn(`[step1d] ${char.name} 提示词解析失败，跳过:`, e);
  }
}

/**
 * 第二步：补充场景六视图提示词 + 镜头 visual_prompt
 * 为绕过代理输出限制，拆分为：
 *   2a) 场景六视图提示词（每次最多2个场景）
 *   2b) 镜头 visual_prompt（每集单独一次请求）
 */
async function analyzeScript_step2(
  base: ScriptAnalysis,
  onProgress: (text: string) => void,
  styleConfig?: StyleConfig | null,
): Promise<ScriptAnalysis> {
  const styleKeywords = styleConfig?.compiled_style_prompt
    ? extractTopKeywords(styleConfig.compiled_style_prompt, 8)
    : "high quality, detailed, cinematic lighting";

  // ── 2a：场景六视图提示词（每批最多2个场景）──
  const SCENE_BATCH = 2;
  for (let i = 0; i < base.scenes.length; i += SCENE_BATCH) {
    const batch = base.scenes.slice(i, i + SCENE_BATCH);
    onProgress(`[2a] 正在生成场景提示词 (${i + 1}~${Math.min(i + SCENE_BATCH, base.scenes.length)}/${base.scenes.length})...`);
    await step2a_scenePrompts(batch, styleKeywords, onProgress);
  }

  // ── 2b：镜头 visual_prompt（逐集）──
  for (const ep of base.episodes) {
    const totalShots = ep.scenes.reduce((n, sc) => n + (sc.shots?.length || 0), 0);
    if (totalShots === 0) continue;
    onProgress(`[2b] 正在生成第 ${ep.episode_id} 集镜头提示词 (${totalShots} 个镜头)...`);
    await step2b_shotPrompts(ep, styleKeywords, onProgress);
  }

  return base;
}

/** 子步 2a：为一批（1-2个）场景生成六视图提示词，结果直接写入 scene 对象 */
async function step2a_scenePrompts(
  scenes: ScriptAnalysis["scenes"],
  styleKeywords: string,
  onProgress: (text: string) => void,
): Promise<void> {
  const scenesDesc = scenes.map((s) =>
    `${s.scene_id}: ${s.name} — ${s.description} | 时段:${s.environment?.time_of_day} | 氛围:${s.environment?.atmosphere}`
  ).join("\n");

  const expectedKeys = scenes.map((s) => `"${s.scene_id}"`).join(", ");

  const systemPrompt = `你是AI场景视觉提示词专家。为给定场景生成六视图英文提示词。只输出JSON，不要代码块。

每个场景需要6个视角(front/back/left/right/top/detail)，每个提示词约80-120个英文单词，格式：
environment concept art, [角度] view, [镜头参数], [空间建筑材质], [光线色温], [大气效果], ${styleKeywords}, no characters

输出格式（只输出 ${expectedKeys} 的数据）:
{"${scenes[0].scene_id}":{"front":"...","back":"...","left":"...","right":"...","top":"...","detail":"..."}${scenes[1] ? `,"${scenes[1].scene_id}":{"front":"...","back":"...","left":"...","right":"...","top":"...","detail":"..."}` : ""}}`;

  const result = await wfAiChatStream(
    { model: "gemini-2.5-pro", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: `场景:\n${scenesDesc}` }], temperature: 0.7 },
    onProgress,
  );

  try {
    const jsonStr = extractJson(result);
    const data = JSON.parse(jsonStr) as Record<string, Record<string, string>>;
    for (const scene of scenes) {
      const prompts = data[scene.scene_id];
      if (prompts && typeof prompts === "object") {
        scene.six_view_prompts = prompts;
      }
    }
  } catch (e) {
    console.warn("[step2a] 场景提示词解析失败，跳过:", e);
  }
}

/** 子步 2b：为单集所有镜头生成 visual_prompt，结果直接写入 shot 对象 */
async function step2b_shotPrompts(
  ep: ScriptAnalysis["episodes"][0],
  styleKeywords: string,
  onProgress: (text: string) => void,
): Promise<void> {
  const shotLines: string[] = [];
  for (const sc of ep.scenes) {
    for (let i = 0; i < (sc.shots || []).length; i++) {
      const shot = sc.shots[i];
      const key = `ep${ep.episode_id}_${sc.scene_ref || sc.scene_id}_shot${i + 1}`;
      shotLines.push(`${key}: ${shot.shot_type} | ${shot.subject} | ${shot.action} | cam:${shot.camera_movement} | ${shot.optics || ""}`);
    }
  }

  if (shotLines.length === 0) return;

  // 构建示例 key（使用第一个真实 scene_ref，避免 AI 按 s01 硬编码格式输出）
  const firstSceneRef = ep.scenes[0]?.scene_ref || ep.scenes[0]?.scene_id || "s01";
  const exampleKey1 = `ep${ep.episode_id}_${firstSceneRef}_shot1`;
  const exampleKey2 = `ep${ep.episode_id}_${firstSceneRef}_shot2`;

  const systemPrompt = `你是AI分镜提示词专家。为给定镜头生成英文 visual_prompt。只输出JSON，不要代码块。

每个 visual_prompt 约80-120个英文单词，格式：
[光学参数(focal length,aperture)] + [景别构图] + [主体外貌+精确动作含微动作] + [环境背景] + [灯光色彩] + [摄影机运动] + ${styleKeywords}

输出格式（key 必须与输入的镜头列表 key 完全一致）:
{"${exampleKey1}":"...","${exampleKey2}":"..."}`;

  const result = await wfAiChatStream(
    { model: "gemini-2.5-pro", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: `镜头列表:\n${shotLines.join("\n")}` }], temperature: 0.7 },
    onProgress,
  );

  try {
    const jsonStr = extractJson(result);
    const shotPrompts = JSON.parse(jsonStr) as Record<string, string>;
    let matched = 0;
    for (const sc of ep.scenes) {
      for (let i = 0; i < (sc.shots || []).length; i++) {
        const key = `ep${ep.episode_id}_${sc.scene_ref || sc.scene_id}_shot${i + 1}`;
        if (shotPrompts[key]) {
          sc.shots[i].visual_prompt = shotPrompts[key];
          matched++;
        }
      }
    }
    if (matched === 0) {
      console.warn(`[step2b] ep${ep.episode_id} JSON 解析成功但 key 全部不匹配，AI 返回的 key 样本:`, Object.keys(shotPrompts).slice(0, 3), "期望格式:", `ep${ep.episode_id}_${firstSceneRef}_shot1`);
    }
  } catch (e) {
    console.warn(`[step2b] ep${ep.episode_id} 镜头提示词解析失败:`, e, "\nAI原始输出(前200字):", result?.slice(0, 200));
  }
}

/**
 * 校验 ScriptAnalysis 结构完整性
 * 参考：docs/03-剧本解析与结构化拆解.md §四.3
 */
export function validateScriptAnalysis(data: ScriptAnalysis): string[] {
  const warnings: string[] = [];

  if (!data.title) warnings.push("缺少 title");
  if (!data.characters?.length) warnings.push("缺少角色列表");
  if (!data.scenes?.length) warnings.push("缺少场景列表");
  if (!data.episodes?.length) warnings.push("缺少分集信息");

  for (const char of data.characters || []) {
    if (!char.char_id) warnings.push(`角色 ${char.name} 缺少 char_id`);
    if (!char.three_view_prompts?.front) warnings.push(`角色 ${char.name} 缺少正面提示词`);
  }

  for (const scene of data.scenes || []) {
    if (!scene.scene_id) warnings.push(`场景 ${scene.name} 缺少 scene_id`);
    if (!scene.six_view_prompts?.front) warnings.push(`场景 ${scene.name} 缺少六视图提示词(six_view_prompts)`);
    if (!scene.lighting) warnings.push(`场景 ${scene.name} 缺少光照信息(lighting)`);
  }

  // 检查分集中的镜头
  let totalShots = 0;
  for (const ep of data.episodes || []) {
    for (const sc of ep.scenes || []) {
      if (!sc.shots?.length) {
        warnings.push(`分集 ${ep.episode_id} 场景 "${sc.scene_ref || sc.scene_id}" 缺少镜头(shots)`);
      } else {
        totalShots += sc.shots.length;
        for (const shot of sc.shots) {
          if (!shot.visual_prompt) warnings.push(`分集 ${ep.episode_id} 镜头缺少 visual_prompt`);
        }
      }
      if (!sc.scene_ref) warnings.push(`分集 ${ep.episode_id} 场景缺少 scene_ref`);
    }
  }
  if (totalShots === 0 && (data.episodes?.length ?? 0) > 0) {
    warnings.push("所有分集的镜头(shots)均为空，输出严重不完整");
  }

  if (data.characters?.length > 10) {
    warnings.push(`角色过多 (${data.characters.length})，可能影响一致性，建议控制在 5 个以内`);
  }

  if (warnings.length > 0) {
    console.warn("剧本解析结果校验警告:", warnings);
  }

  return warnings;
}

// =====================================================
// 风格工具函数
// =====================================================

/**
 * 从逗号分隔的风格提示词中提取前 N 个关键词
 */
export function extractTopKeywords(stylePrompt: string, n: number = 5): string {
  if (!stylePrompt) return "";
  return stylePrompt
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, n)
    .join(", ");
}

// =====================================================
// 并发控制
// =====================================================

/**
 * 并发执行任务，限制最大并发数
 */
export async function parallelLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
  onProgress?: (completed: number, total: number) => void,
): Promise<T[]> {
  const results: T[] = [];
  let completed = 0;
  let index = 0;

  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const i = index++;
      try {
        results[i] = await tasks[i]();
      } catch (err) {
        // Store error as undefined, caller handles
        results[i] = undefined as unknown as T;
      }
      completed++;
      onProgress?.(completed, tasks.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

// =====================================================
// 角色三视图生成 (Stage 2)
// =====================================================

export async function generateCharacterViews(
  character: ScriptAnalysis["characters"][0],
  projectId: string,
  styleConfig?: StyleConfig,
  imageModel: string = "imagen-4.0-generate-001",
  onViewDone?: (view: string, url: string) => void,
): Promise<{ front: string | null; side: string | null; back: string | null }> {
  const views: { front: string | null; side: string | null; back: string | null } = {
    front: null,
    side: null,
    back: null,
  };

  // 构建角色身份描述
  const fullStyle = styleConfig?.compiled_style_prompt
    || "anime illustration style, 2D character design, manga art style";
  const stylePrefix = fullStyle.split(",").slice(0, 3).map((s) => s.trim()).join(", ");

  // 使用 visual_prompt_template（最完整的角色描述），避免重复拼接
  const characterDesc = character.visual_prompt_template
    || character.three_view_prompts?.front
    || (() => {
      const parts: string[] = [];
      const { appearance, costume } = character;
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

  // 最多重试 2 次（共 3 次尝试）
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await wfGenerateImage({
        model: imageModel,
        prompt: turnAroundPrompt,
        n: 1,
        size: "1536x1024",  // 横向宽图，容纳三个视角
        project_id: projectId,
        asset_filename: `${character.char_id}_turnaround.png`,
      });
      const url = result.saved_assets?.[0]?.asset_url || result.data?.[0]?.url || null;
      if (url) {
        // 三个视角槽位都使用同一张 turnaround sheet
        views.front = url;
        views.side = url;
        views.back = url;
        onViewDone?.("front", url);
        onViewDone?.("side", url);
        onViewDone?.("back", url);
      }
      break;
    } catch (err) {
      console.error(`生成${character.name}角色设计图失败 (尝试${attempt + 1}/3):`, err);
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
      }
    }
  }

  return views;
}

export async function generateSceneViews(
  scene: ScriptAnalysis["scenes"][0],
  projectId: string,
  styleConfig?: StyleConfig,
  imageModel: string = "imagen-4.0-generate-001",
  onViewDone?: (view: string, url: string) => void,
): Promise<Record<string, string | null>> {
  const views: Record<string, string | null> = {};
  const viewKeys = ["front", "back", "left", "right", "top", "detail"];

  for (const view of viewKeys) {
    let prompt = scene.six_view_prompts[view];
    if (!prompt) continue;

    // 注入风格关键词（前3个），总长控制在 900 字符以内
    if (styleConfig?.compiled_style_prompt) {
      const styleTop = styleConfig.compiled_style_prompt.split(",").slice(0, 3).map((s) => s.trim()).join(", ");
      const topKw = styleTop.split(",")[0]?.trim();
      if (topKw && !prompt.includes(topKw)) {
        prompt = `${styleTop}, ${prompt}`;
      }
    }
    prompt = prompt.slice(0, 900);

    try {
      const result = await wfGenerateImage({
        model: imageModel,
        prompt,
        n: 1,
        size: "1536x1024",
        project_id: projectId,
        asset_filename: `${scene.scene_id}_${view}.png`,
      });
      const url = result.saved_assets?.[0]?.asset_url || result.data?.[0]?.url || null;
      if (url) {
        views[view] = url;
        onViewDone?.(view, url); // 实时通知
      }
    } catch (err) {
      console.error(`生成${scene.name}${view}视图失败:`, err);
    }
  }

  return views;
}

// =====================================================
// 表情图生成
// =====================================================

const EXPRESSION_KEYS = ["neutral", "happy", "angry", "sad", "surprised", "determined"] as const;

export async function generateCharacterExpressions(
  character: ScriptAnalysis["characters"][0],
  projectId: string,
  imageModel: string = "imagen-4.0-generate-001",
): Promise<Record<string, string | null>> {
  const expressions: Record<string, string | null> = {};

  for (const expr of EXPRESSION_KEYS) {
    const prompt = character.expression_prompts?.[expr];
    if (!prompt) continue;

    try {
      const result = await wfGenerateImage({
        model: imageModel,
        prompt,
        n: 1,
        size: "512x512",
        project_id: projectId,
        asset_filename: `${character.char_id}_expr_${expr}.png`,
      });
      expressions[expr] = result.saved_assets?.[0]?.asset_url
        || result.data?.[0]?.url
        || null;
    } catch (err) {
      console.error(`生成 ${character.name} ${expr} 表情失败:`, err);
      expressions[expr] = null;
    }
  }

  return expressions;
}

// =====================================================
// 单张视图重新生成
// =====================================================

export async function regenerateView(
  type: "character" | "scene",
  entityId: string,
  viewKey: string,
  projectId: string,
  customPrompt?: string,
  imageModel: string = "imagen-4.0-generate-001",
): Promise<string | null> {
  const prompt = customPrompt || "";
  if (!prompt) return null;

  const result = await wfGenerateImage({
    model: imageModel,
    prompt,
    n: 1,
    size: type === "character" ? "1024x1536" : "1536x1024",
    project_id: projectId,
    asset_filename: `${entityId}_${viewKey}_v${Date.now()}.png`,
  });

  return result.saved_assets?.[0]?.asset_url || result.data?.[0]?.url || null;
}

// =====================================================
// 全量资产生成编排
// =====================================================

export async function generateAllAssets(
  analysis: ScriptAnalysis,
  projectId: string,
  styleConfig: StyleConfig | null,
  imageModel: string = "imagen-4.0-generate-001",
  onProgress?: (completed: number, total: number, current: string) => void,
  onCharViewDone?: (charId: string, view: string, url: string) => void,
  onSceneViewDone?: (sceneId: string, view: string, url: string) => void,
): Promise<{
  characters: Record<string, { views: Record<string, string | null>; expressions: Record<string, string | null> }>;
  scenes: Record<string, Record<string, string | null>>;
}> {
  const characterResults: Record<string, { views: Record<string, string | null>; expressions: Record<string, string | null> }> = {};
  const sceneResults: Record<string, Record<string, string | null>> = {};

  type TaskEntry = { label: string; run: () => Promise<void> };
  const tasks: TaskEntry[] = [];

  // 收集角色三视图任务
  for (const char of analysis.characters) {
    characterResults[char.char_id] = { views: { front: null, side: null, back: null }, expressions: {} };

    tasks.push({
      label: `角色 ${char.name} 三视图`,
      run: async () => {
        const views = await generateCharacterViews(
          char, projectId, styleConfig || undefined, imageModel,
          (view, url) => onCharViewDone?.(char.char_id, view, url),
        );
        characterResults[char.char_id].views = views;
      },
    });

    // 主角生成表情图
    if (char.role === "主角") {
      tasks.push({
        label: `角色 ${char.name} 表情图`,
        run: async () => {
          const exprs = await generateCharacterExpressions(char, projectId, imageModel);
          characterResults[char.char_id].expressions = exprs;
        },
      });
    }
  }

  // 收集场景六视图任务
  for (const scene of analysis.scenes) {
    sceneResults[scene.scene_id] = {};

    tasks.push({
      label: `场景 ${scene.name} 六视图`,
      run: async () => {
        const views = await generateSceneViews(
          scene, projectId, styleConfig || undefined, imageModel,
          (view, url) => onSceneViewDone?.(scene.scene_id, view, url),
        );
        sceneResults[scene.scene_id] = views;
      },
    });
  }

  // 顺序执行（一个一个出）
  let currentLabel = "";
  await parallelLimit(
    tasks.map((t) => () => {
      currentLabel = t.label;
      return t.run();
    }),
    1,
    (completed, total) => {
      onProgress?.(completed, total, currentLabel);
    },
  );

  return { characters: characterResults, scenes: sceneResults };
}

// =====================================================
// 分镜提示词组装 (Stage 3)
// =====================================================

/**
 * 构建分镜图像提示词。
 * 优先使用 AI 生成的 visual_prompt（设计文档 §三 要求），
 * 回退到手动拼接逻辑。
 */
export function buildShotPrompt(
  shot: ScriptAnalysis["episodes"][0]["scenes"][0]["shots"][0],
  characters: ScriptAnalysis["characters"],
  scene: ScriptAnalysis["scenes"][0],
  styleGuide: ScriptAnalysis["visual_style_guide"],
): string {
  // 优先使用 AI 生成的完整提示词
  if (shot.visual_prompt) {
    return shot.visual_prompt;
  }

  // 回退：手动拼接
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
    tilt_up: "tilt up camera movement",
    crane_down: "crane down camera movement",
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
    six_view_prompts: s.six_view_prompts || undefined,
    lighting: s.lighting || undefined,
    views: { front: null, back: null, left: null, right: null, top: null, detail: null },
    status: "pending" as const,
  }));

  const episodes: WfEpisode[] = analysis.episodes.map((ep) => {
    let shotIndex = 0;
    const allShots: WfShot[] = [];

    for (const sc of ep.scenes) {
      if (!sc.shots || sc.shots.length === 0) {
        console.warn(`[workflow] Episode ${ep.episode_id} scene "${sc.scene_ref || sc.scene_id}" has no shots — this scene will produce 0 frames`);
      }
      for (const shot of (sc.shots || [])) {
        shotIndex++;
        const shotId = `ep${ep.episode_id}_shot_${String(shotIndex).padStart(3, "0")}`;

        // Find relevant character IDs from dialogues
        const charIds = sc.dialogues?.map((d) => d.character) || [];
        const dialogue = sc.dialogues?.map((d) => d.text).join(" ") || "";

        // Build prompt — 优先使用 AI 生成的 visual_prompt
        const prompt = shot.visual_prompt || buildShotPrompt(
          shot,
          analysis.characters,
          analysis.scenes.find((s) => s.scene_id === sc.scene_ref) || analysis.scenes[0],
          analysis.visual_style_guide || undefined,
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
          action: shot.action || undefined,
          optics: shot.optics || undefined,
          composition: shot.composition || undefined,
          lighting_note: shot.lighting_note || undefined,
          transition: shot.transition || undefined,
          visual_prompt: shot.visual_prompt || prompt || undefined,
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
  imageModel: string = "imagen-4.0-generate-001",
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
  options?: {
    characters?: WfCharacter[];
    scenes?: WfScene[];
    storyType?: string;
    onProgress?: (taskId: string, status: string, percent: number) => void;
  },
): Promise<{ taskId: string; videoUrl: string | null; localPath: string | null }> {
  const onProgress = options?.onProgress;
  const { cameraPreset, motionSpeed } = mapCameraToSeedance(shot.camera_movement);

  // Determine generation mode based on available assets
  const hasStoryboard = !!shot.storyboard_image;
  const isDialogue = !!shot.dialogue;

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
  };

  // 串联提示词：风格前缀 + 分镜详细提示词 + 角色外貌 + 场景灯光 + 一致性指令
  let base = shot.prompt || shot.visual_prompt || shot.raw_description;

  if (shot.character_ids?.length && options?.characters) {
    const charHints = shot.character_ids
      .map((id) => options.characters!.find((c) => c.id === id))
      .filter(Boolean)
      .map((c) => c!.appearance_prompt?.slice(0, 100))
      .filter(Boolean);
    if (charHints.length) base += `, characters: ${charHints.join("; ")}`;
  }

  if (shot.scene_id && options?.scenes) {
    const scene = options.scenes.find((s) => s.id === shot.scene_id);
    if (scene?.lighting) {
      const mood = scene.lighting.mood || scene.lighting.ambient;
      if (mood) base += `, lighting: ${mood}`;
    }
  }

  // 首帧存在时，强化画风一致性
  if (hasStoryboard) {
    base += ", strictly match the art style, color palette, and character design of the first frame image, maintain visual consistency throughout the video";
  }

  // 禁止字幕和文字叠加
  base += ", no subtitles, no text overlay, no watermark, no captions";

  const promptText = isDialogue
    ? `${base}, subtle movement, talking, minimal camera motion`
    : base;

  const payload = buildPayload(promptText, params, options?.storyType);
  const task = await createTask(payload, { title: shot.id, mode: "workflow" });
  const taskId = task.id;

  onProgress?.(taskId, "created", 10);

  // Poll until complete (最大重试 120 次 × 6 秒 = 12 分钟)
  let videoUrl: string | null = null;
  let localPath: string | null = null;
  const MAX_POLL_ATTEMPTS = 120;

  let attempts = 0;
  while (attempts < MAX_POLL_ATTEMPTS) {
    const updated = await queryTask(taskId);
    const status = updated.status || "unknown";
    const percent = updated.progress_percent || updated.completed_percentage || 0;

    onProgress?.(taskId, status, Number(percent));

    if (status === "succeeded") {
      videoUrl = updated.content?.video_url || updated._proxy?.videoUrls?.[0] || null;
      localPath = updated.local_asset?.local_url || null;
      break;
    }
    if (status === "failed" || status === "cancelled") {
      throw new Error(`视频生成失败: ${status}`);
    }

    attempts++;
    await new Promise((r) => setTimeout(r, 6000));
  }

  if (attempts >= MAX_POLL_ATTEMPTS) {
    throw new Error(`视频生成超时（已等待 ${MAX_POLL_ATTEMPTS * 6} 秒）`);
  }
  return { taskId, videoUrl, localPath };
}

// =====================================================
// 辅助函数
// =====================================================

/**
 * 从 AI 响应文本中提取 JSON，带 4 层修复策略
 * 参考：docs/03-剧本解析与结构化拆解.md §四.2
 */
export function extractJson(text: string): string {
  // 1. 尝试直接解析
  try {
    JSON.parse(text);
    return text;
  } catch { /* continue */ }

  // 2. 从 markdown 代码块中提取
  const codeBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlock) {
    try {
      JSON.parse(codeBlock[1]);
      return codeBlock[1];
    } catch { /* continue */ }
  }

  // 3. 找 { ... } 范围
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) {
    const candidate = text.slice(first, last + 1);
    try {
      JSON.parse(candidate);
      return candidate;
    } catch { /* continue */ }

    // 4. 逐步修复常见 AI 输出问题
    let fixed = candidate
      .replace(/,\s*([}\]])/g, "$1")                          // 尾部逗号
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")         // 控制字符
      .replace(/\n/g, "\\n").replace(/\r/g, "\\r")            // 未转义换行
      .replace(/\t/g, "\\t");                                  // 未转义制表符
    try {
      JSON.parse(fixed);
      return fixed;
    } catch { /* continue */ }

    // 5. 还原换行修复（可能破坏了合法字符串内容），尝试只修复结构性问题
    fixed = candidate
      .replace(/,\s*([}\]])/g, "$1")                          // 尾部逗号
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")         // 控制字符
      .replace(/([^\\])'/g, '$1"')                             // 单引号→双引号（非转义的）
      .replace(/^'/g, '"');                                     // 行首单引号
    try {
      JSON.parse(fixed);
      return fixed;
    } catch { /* continue */ }

    // 6. 最后尝试：移除所有不可见字符和BOM
    fixed = candidate
      .replace(/^\uFEFF/, "")                                  // BOM
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/[\x00-\x1f]/g, (ch) => {
        if (ch === "\n" || ch === "\r" || ch === "\t") return ch;
        return "";
      });
    try {
      JSON.parse(fixed);
      return fixed;
    } catch { /* continue */ }
  }

  // 7. 尝试修复截断的 JSON（代理输出限制导致）
  const jsonStart = text.indexOf("{");
  if (jsonStart !== -1) {
    const truncated = text.slice(jsonStart);
    const repaired = repairTruncatedJson(truncated);
    if (repaired) {
      try {
        JSON.parse(repaired);
        console.warn("[extractJson] 使用截断修复解析成功，部分数据可能丢失");
        return repaired;
      } catch { /* continue */ }
    }
  }

  // 给出可诊断的错误信息
  const preview = text.slice(0, 200).replace(/\n/g, "\\n");
  throw new Error(`无法从 AI 响应中提取有效 JSON。响应开头: "${preview}..."`);
}

/**
 * 修复被截断的 JSON：
 * 1. 找到最后一个在字符串外的逗号/闭合括号位置，截断到该处
 * 2. 关闭所有未匹配的括号和引号
 */
function repairTruncatedJson(text: string): string | null {
  // 清理控制字符
  let s = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");

  // 扫描找到最后一个「结构完整点」：在字符串外的逗号或闭合括号
  let inString = false;
  let escape = false;
  let lastSafePos = -1;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "," || ch === "}" || ch === "]" || ch === '"') {
      lastSafePos = i + 1;
    }
  }

  if (lastSafePos > 0) {
    s = s.slice(0, lastSafePos);
  }

  // 移除尾部逗号
  s = s.replace(/,\s*$/g, "");

  // 重新扫描计算未关闭的括号
  inString = false;
  escape = false;
  const stack: string[] = [];

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") {
      if (stack.length > 0 && stack[stack.length - 1] === ch) stack.pop();
    }
  }

  // 如果在字符串中间截断
  if (inString) s += '"';

  // 关闭所有未匹配的括号
  while (stack.length > 0) s += stack.pop();

  return s;
}
