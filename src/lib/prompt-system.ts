/**
 * 提示词系统 — 5 层架构合成引擎
 *
 * Layer 0: 全局质量锚定词（固定，用户不可见）
 * Layer 1: 短片类型提示词（用户选择触发）
 * Layer 2: 风格子类提示词（从 styles-data.ts）
 * Layer 3: 角色/场景专属提示词（AI 生成）
 * Layer 4: 分镜提示词（AI 生成）
 * Layer 5: 反面提示词 + 比例构图提示词
 */

import { styleItems, type StyleItem } from "./styles-data";
import type { StyleConfig } from "./api";

// =====================================================
// Layer 0 — 全局质量锚定词
// =====================================================

export const QUALITY_ANCHOR_PROMPT =
  "masterpiece quality, professional animation production, consistent art style throughout all shots, cinematic composition, professional color grading, high detail, sharp focus";

export const QUALITY_ANCHOR_NEGATIVE =
  "low quality, blurry, deformed, extra limbs, bad anatomy, watermark, text, logo, signature, cropped, worst quality, jpeg artifacts, duplicate, morbid, mutilated, out of frame, extra fingers, mutated hands, poorly drawn hands, poorly drawn face";

// =====================================================
// Layer 1 — 短片类型提示词
// =====================================================

export interface StoryTypeInfo {
  id: string;
  label: string;
  icon: string;
  description: string;
  prompt: string;
  structure_hint: string;
}

export const STORY_TYPES: StoryTypeInfo[] = [
  {
    id: "drama",
    label: "剧情故事片",
    icon: "🎬",
    description: "完整叙事结构，起承转合，适合短剧",
    prompt:
      "narrative structure, three-act story, emotional arc, dramatic tension, character-driven plot, cliffhanger ending",
    structure_hint: "前3秒出钩子，每10秒一个爽点，结尾致命悬念",
  },
  {
    id: "music_video",
    label: "音乐概念片",
    icon: "🎵",
    description: "配合音乐节奏的视觉叙事，MV 风格",
    prompt:
      "music-driven pacing, visual rhythm sync, lyrical imagery, montage sequence, beat-matched cuts, dynamic transitions",
    structure_hint: "配合音乐节拍切镜，副歌处用最华丽的画面",
  },
  {
    id: "comic_adapt",
    label: "漫画转视频",
    icon: "📖",
    description: "静态漫画面板转动态视频",
    prompt:
      "panel-to-motion, manga layout reference, speech bubble integration, page turn transition, dynamic panel zoom",
    structure_hint: "保留漫画分格感，关键格放大动态化",
  },
  {
    id: "promo",
    label: "产品宣传片",
    icon: "📢",
    description: "品牌/产品动画广告",
    prompt:
      "product showcase, brand identity, call-to-action framing, clean composition, professional lighting, logo reveal",
    structure_hint: "开头3秒抓眼球，中间展示卖点，结尾CTA",
  },
  {
    id: "edu",
    label: "教育解说片",
    icon: "📚",
    description: "知识讲解动画",
    prompt:
      "educational clarity, diagram animation, step-by-step reveal, narrator-guided visual, infographic style, knowledge hierarchy",
    structure_hint: "先抛问题，再逐步拆解，最后总结",
  },
  {
    id: "merch",
    label: "衍生品设计",
    icon: "🎨",
    description: "IP角色衍生品设计，手办/海报/周边等",
    prompt:
      "merchandise design, product visualization, character IP adaptation, collectible figure concept, poster layout, clean background, product photography style, commercial quality, studio lighting",
    structure_hint: "先确定IP角色形象，再选择衍生品类型（手办/海报/钥匙扣等），最后调整材质和构图",
  },
  {
    id: "free_gen",
    label: "自由生图/生视频",
    icon: "✨",
    description: "无约束自由创作，支持多模型切换",
    prompt: "",
    structure_hint: "自由发挥，描述越详细效果越好",
  },
];

export const STORY_TYPE_PROMPTS: Record<
  string,
  { prompt: string; structure_hint: string }
> = Object.fromEntries(
  STORY_TYPES.map((t) => [
    t.id,
    { prompt: t.prompt, structure_hint: t.structure_hint },
  ]),
);

// =====================================================
// Layer 5 — 比例构图提示词
// =====================================================

export const ASPECT_RATIO_PROMPTS: Record<string, string> = {
  "16:9":
    "widescreen cinematic composition, horizontal storytelling, rule of thirds, cinematic letterbox framing, panoramic view",
  "9:16":
    "vertical composition, portrait framing, mobile-optimized layout, subject centered or slightly above center, close framing for emotional impact, short-form video optimized",
  "1:1":
    "square composition, centered subject, balanced symmetry, social media optimized, bold graphic framing, Instagram-ready",
};

// =====================================================
// 对白语言选项
// =====================================================

export const LANGUAGE_OPTIONS = [
  { value: "中文", label: "中文" },
  { value: "英文", label: "英文" },
  { value: "日文", label: "日文" },
  { value: "韩文", label: "韩文" },
  { value: "无对白", label: "无对白" },
] as const;

// =====================================================
// 时长选项
// =====================================================

export const DURATION_OPTIONS = [
  { value: 15, label: "15s" },
  { value: 30, label: "30s" },
  { value: 60, label: "60s" },
  { value: 120, label: "120s" },
] as const;

// =====================================================
// 合成函数
// =====================================================

export interface CompileStyleInput {
  storyType: string;
  artSubstyle: string; // 风格子类名称（如"吉卜力"）
  aspectRatio: string;
}

export interface CompileStyleResult {
  stylePrompt: string;
  negativePrompt: string;
}

/**
 * 将各层提示词合成为最终的 stylePrompt 和 negativePrompt
 *
 * 合成公式:
 *   stylePrompt  = Layer2(风格) + Layer1(类型) + 比例构图 + Layer0(质量锚定)
 *   negativePrompt = 风格反面词 + 通用反面词
 */
export function compileStylePrompt(
  input: CompileStyleInput,
): CompileStyleResult {
  // Layer 1 — 短片类型
  const typeEntry = STORY_TYPE_PROMPTS[input.storyType];
  const typePrompt = typeEntry?.prompt || "";

  // Layer 2 — 风格子类
  const style = styleItems.find((s) => s.name === input.artSubstyle);
  const artPrompt = style?.prompt || "";
  const artNegative = style?.negativePrompt || "";

  // 比例构图
  const ratioPrompt = ASPECT_RATIO_PROMPTS[input.aspectRatio] || "";

  // 合成
  const stylePrompt = [artPrompt, typePrompt, ratioPrompt, QUALITY_ANCHOR_PROMPT]
    .filter(Boolean)
    .join(", ");

  const negativePrompt = [artNegative, QUALITY_ANCHOR_NEGATIVE]
    .filter(Boolean)
    .join(", ");

  return { stylePrompt, negativePrompt };
}

/**
 * 从 StyleConfig 对象快速重新合成提示词
 */
export function recompileFromConfig(
  config: Pick<StyleConfig, "story_type" | "art_substyle" | "aspect_ratio">,
): CompileStyleResult {
  return compileStylePrompt({
    storyType: config.story_type,
    artSubstyle: config.art_substyle,
    aspectRatio: config.aspect_ratio,
  });
}

// =====================================================
// 风格冲突检测
// =====================================================

const CONFLICT_RULES: [string[], string[]][] = [
  // 科幻 vs 传统东方
  [
    ["赛博朋克", "科幻", "未来", "机甲", "太空", "AI", "机器人"],
    ["国风水墨", "东方淡彩", "东方古典装饰", "3D国创", "浮世绘超现实主义"],
  ],
  // 恐怖 vs 治愈可爱
  [
    ["恐怖", "暗黑", "血腥", "惊悚", "鬼", "丧尸", "死亡"],
    ["治愈Q萌", "治愈柔和Q版", "温馨彩绘", "治愈童趣颗粒彩铅", "温暖治愈Q版", "可爱马卡龙", "甜美粉彩", "清新童趣Q版", "动森", "史努比", "蜡笔小新"],
  ],
  // 古代 vs 像素/现代
  [
    ["古代", "古风", "仙侠", "武侠", "三国", "唐宋", "皇宫"],
    ["像素", "复古掌机", "方块世界", "光栅像素艺术", "棱镜故障艺术", "风格化撞色赛博"],
  ],
  // 儿童/低幼 vs 暗黑风格
  [
    ["儿童", "幼儿", "早教", "亲子", "童话", "宝宝"],
    ["炭笔暗黑朋克", "空灵哥特", "恐怖悬疑", "魅惑哥特霓虹", "怪诞哥特卡通"],
  ],
  // 写实/纪实 vs 夸张卡通
  [
    ["纪实", "真人", "写实", "纪录片", "新闻"],
    ["火柴人", "粗线超级Q版", "比奇堡", "辛普森", "南方公园", "蜡笔小新"],
  ],
  // 浪漫/爱情 vs 暴力动作
  [
    ["浪漫", "爱情", "甜蜜", "约会", "表白", "婚礼"],
    ["尸魂界-死神", "JoJo", "炭笔暗黑朋克", "粗犷墨线"],
  ],
  // 商业/品牌 vs 粗糙手绘
  [
    ["品牌", "产品", "商务", "企业", "广告", "发布会"],
    ["火柴人", "表现主义儿童涂鸦", "可爱抽象涂鸦", "童趣速写", "童趣蜡笔插画"],
  ],
];

/**
 * 检测剧本内容与所选风格之间的潜在冲突
 * @returns 冲突提示字符串，无冲突时返回 null
 */
export function detectStyleConflict(
  scriptContent: string,
  selectedStyle: string,
): string | null {
  for (const [keywords, styles] of CONFLICT_RULES) {
    const matchedKeyword = keywords.find((k) => scriptContent.includes(k));
    const isConflictStyle = styles.includes(selectedStyle);
    if (matchedKeyword && isConflictStyle) {
      return `提示: 您的剧本包含「${matchedKeyword}」相关内容，但选择了「${selectedStyle}」风格。建议考虑是否更换风格以获得更好效果。`;
    }
  }
  return null;
}

// =====================================================
// 提示词长度检查
// =====================================================

/** 粗略估算英文 token 数 (按空格 + 逗号分割) */
function estimateTokens(text: string): number {
  if (!text) return 0;
  return text.split(/[\s,]+/).filter(Boolean).length;
}

export interface PromptLengthCheck {
  ok: boolean;
  totalTokens: number;
  warning?: string;
}

export function checkPromptLength(
  stylePrompt: string,
  negativePrompt: string,
): PromptLengthCheck {
  const total = estimateTokens(stylePrompt) + estimateTokens(negativePrompt);
  if (total > 350) {
    return {
      ok: false,
      totalTokens: total,
      warning: `提示词总长度约 ${total} tokens，超过推荐上限 350 tokens，可能影响生成质量。`,
    };
  }
  return { ok: true, totalTokens: total };
}

/**
 * 计算预计分镜数
 */
export function calcShotCount(
  durationSec: number,
  shotDurationSec: number,
): number {
  return Math.ceil(durationSec / shotDurationSec);
}
