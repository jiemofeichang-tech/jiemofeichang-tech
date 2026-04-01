/**
 * canvasLayout.ts — 纯函数，计算工作流各区块在无限画布上的位置。
 * 无 React 依赖，可独立测试。
 */

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

export const LAYOUT = {
  PADDING: 40,          // 画布左/上边距
  SECTION_GAP: 48,      // 区段间垂直间距
  SECTION_HEADER: 32,   // 区段标题高度
  CARD_GAP: 16,         // 同区段卡片间距
  CARDS_PER_ROW: 3,     // 卡片每行最多数量
  WIDE_WIDTH: 700,      // 宽块（剧本、分镜、视频、后期）
  CARD_WIDTH: 420,      // 卡片（角色、场景）
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BlockType =
  | "section-label"
  | "script"
  | "style-config"
  | "generate-assets"
  | "asset-lock"
  | "character"
  | "storyboard"
  | "video"
  | "post"
  | "stage-confirm";

export interface LayoutBlock {
  key: string;         // 唯一标识，如 "script", "character-abc", "section-角色设计"
  type: BlockType;
  x: number;
  y: number;
  width: number;
  height: number;      // 预估高度，可被 measuredHeights 覆盖
}

export interface LayoutInput {
  hasScript: boolean;
  /** 是否需要显示风格配置区块（剧本分析完成后） */
  showStyleConfig: boolean;
  /** 风格配置是否已完成 */
  styleConfigDone: boolean;
  characterIds: string[];
  /** 是否显示"生成资产"按钮（有剧本但无角色） */
  showGenerateAssets: boolean;
  /** 是否显示资产锁定栏（有角色且部分完成） */
  showAssetLock: boolean;
  hasStoryboard: boolean;
  hasVideos: boolean;
  hasPostProduction: boolean;
  /** 由 ResizeObserver 提供的实际高度，key → px */
  measuredHeights?: Map<string, number>;
  /** 各阶段状态（interactive 模式的门控依据） */
  stageStatuses?: Record<string, string>;
  /** 工作流模式 */
  workflowMode?: "interactive" | "auto";
  /** 用户手动调整的尺寸，key → { width, height } */
  customSizes?: Map<string, { width: number; height: number }>;
}

// ---------------------------------------------------------------------------
// 默认高度估计
// ---------------------------------------------------------------------------

const DEFAULT_HEIGHTS: Record<string, number> = {
  script: 280,
  "style-config": 160,
  "generate-assets": 120,
  "asset-lock": 60,
  character: 320,
  storyboard: 300,
  video: 300,
  post: 260,
  "stage-confirm": 80,
};

function h(key: string, type: string, measured?: Map<string, number>, customSizes?: Map<string, { width: number; height: number }>): number {
  return customSizes?.get(key)?.height ?? measured?.get(key) ?? DEFAULT_HEIGHTS[type] ?? 200;
}

function w(key: string, defaultWidth: number, customSizes?: Map<string, { width: number; height: number }>): number {
  return customSizes?.get(key)?.width ?? defaultWidth;
}

// ---------------------------------------------------------------------------
// 主函数
// ---------------------------------------------------------------------------

export function computeLayout(input: LayoutInput): LayoutBlock[] {
  const { PADDING, SECTION_GAP, SECTION_HEADER, CARD_GAP, CARDS_PER_ROW, WIDE_WIDTH, CARD_WIDTH } = LAYOUT;
  const blocks: LayoutBlock[] = [];
  let cursorY = PADDING;
  const measured = input.measuredHeights;
  const custom = input.customSizes;
  const ss = input.stageStatuses;
  const isInteractive = input.workflowMode === "interactive";
  const isLocked = (stage: string) => isInteractive && ss && ss[stage] === "locked";
  const isReview = (stage: string) => isInteractive && ss && ss[stage] === "review";

  // ── 剧本分析 ──
  if (input.hasScript) {
    const scriptW = w("script", WIDE_WIDTH, custom);
    blocks.push({
      key: "section-剧本分析",
      type: "section-label",
      x: PADDING,
      y: cursorY,
      width: scriptW,
      height: SECTION_HEADER,
    });
    cursorY += SECTION_HEADER;

    const scriptH = h("script", "script", measured, custom);
    blocks.push({
      key: "script",
      type: "script",
      x: PADDING,
      y: cursorY,
      width: scriptW,
      height: scriptH,
    });
    cursorY += scriptH + CARD_GAP;

    if (isReview("script")) {
      const confirmH = h("stage-confirm-script", "stage-confirm", measured, custom);
      blocks.push({ key: "stage-confirm-script", type: "stage-confirm" as BlockType, x: PADDING, y: cursorY, width: scriptW, height: confirmH });
      cursorY += confirmH + CARD_GAP;
    }

    cursorY += SECTION_GAP - CARD_GAP;
  }

  // ── 风格配置（剧本分析之后、角色设计之前） ──
  if (isLocked("style")) { /* 跳过风格配置 */ }
  else if (input.showStyleConfig) {
    const scW = w("style-config", WIDE_WIDTH, custom);
    const scH = h("style-config", "style-config", measured, custom);
    blocks.push({
      key: "style-config",
      type: "style-config",
      x: PADDING,
      y: cursorY,
      width: scW,
      height: scH,
    });
    cursorY += scH + CARD_GAP;

    if (isReview("style")) {
      const confirmH = h("stage-confirm-style", "stage-confirm", measured, custom);
      blocks.push({ key: "stage-confirm-style", type: "stage-confirm" as BlockType, x: PADDING, y: cursorY, width: scW, height: confirmH });
      cursorY += confirmH + CARD_GAP;
    }

    cursorY += SECTION_GAP - CARD_GAP;
  }

  // ── 角色设计（风格配置之后） ──
  if (isLocked("character")) { /* 跳过角色设计 */ }
  else if (input.characterIds.length > 0 || input.showGenerateAssets) {
    blocks.push({
      key: "section-角色设计",
      type: "section-label",
      x: PADDING,
      y: cursorY,
      width: WIDE_WIDTH,
      height: SECTION_HEADER,
    });
    cursorY += SECTION_HEADER;

    // 如果有剧本但角色三视图未生成 → 显示"生成资产"按钮
    if (input.showGenerateAssets) {
      const gaW = w("generate-assets", WIDE_WIDTH, custom);
      const gaH = h("generate-assets", "generate-assets", measured, custom);
      blocks.push({
        key: "generate-assets",
        type: "generate-assets",
        x: PADDING,
        y: cursorY,
        width: gaW,
        height: gaH,
      });
      cursorY += gaH + SECTION_GAP;
    }
    if (input.characterIds.length > 0) {
      let maxRowH = 0;
      input.characterIds.forEach((id, i) => {
        const col = i % CARDS_PER_ROW;
        const key = `character-${id}`;
        const cardW = w(key, CARD_WIDTH, custom);
        const cardH = h(key, "character", measured, custom);

        if (col === 0 && i > 0) {
          cursorY += maxRowH + CARD_GAP;
          maxRowH = 0;
        }
        maxRowH = Math.max(maxRowH, cardH);

        blocks.push({
          key,
          type: "character",
          x: PADDING + col * (CARD_WIDTH + CARD_GAP),
          y: cursorY,
          width: cardW,
          height: cardH,
        });
      });
      cursorY += maxRowH + CARD_GAP;
    }

    if (isReview("character")) {
      const confirmH = h("stage-confirm-character", "stage-confirm", measured, custom);
      blocks.push({ key: "stage-confirm-character", type: "stage-confirm" as BlockType, x: PADDING, y: cursorY, width: WIDE_WIDTH, height: confirmH });
      cursorY += confirmH + CARD_GAP;
    }
  }


  // ── 资产锁定栏 ──
  if (input.showAssetLock) {
    const alW = w("asset-lock", WIDE_WIDTH, custom);
    const alH = h("asset-lock", "asset-lock", measured, custom);
    blocks.push({
      key: "asset-lock",
      type: "asset-lock",
      x: PADDING,
      y: cursorY,
      width: alW,
      height: alH,
    });
    cursorY += alH + SECTION_GAP;
  } else if (input.characterIds.length > 0) {
    // 有角色/场景但没有锁定栏时，补足间距
    cursorY += SECTION_GAP - CARD_GAP;
  }

  // ── 分镜图 ──
  if (isLocked("storyboard")) { /* 跳过分镜图 */ }
  else if (input.hasStoryboard) {
    const sbW = w("storyboard", WIDE_WIDTH, custom);
    blocks.push({
      key: "section-分镜图",
      type: "section-label",
      x: PADDING,
      y: cursorY,
      width: sbW,
      height: SECTION_HEADER,
    });
    cursorY += SECTION_HEADER;

    const sbH = h("storyboard", "storyboard", measured, custom);
    blocks.push({
      key: "storyboard",
      type: "storyboard",
      x: PADDING,
      y: cursorY,
      width: sbW,
      height: sbH,
    });
    cursorY += sbH + CARD_GAP;

    if (isReview("storyboard")) {
      const confirmH = h("stage-confirm-storyboard", "stage-confirm", measured, custom);
      blocks.push({ key: "stage-confirm-storyboard", type: "stage-confirm" as BlockType, x: PADDING, y: cursorY, width: sbW, height: confirmH });
      cursorY += confirmH + CARD_GAP;
    }

    cursorY += SECTION_GAP - CARD_GAP;
  }

  // ── 视频生成 ──
  if (isLocked("video")) { /* 跳过视频生成 */ }
  else if (input.hasVideos) {
    const vidW = w("video", WIDE_WIDTH, custom);
    blocks.push({
      key: "section-视频生成",
      type: "section-label",
      x: PADDING,
      y: cursorY,
      width: vidW,
      height: SECTION_HEADER,
    });
    cursorY += SECTION_HEADER;

    const videoH = h("video", "video", measured, custom);
    blocks.push({
      key: "video",
      type: "video",
      x: PADDING,
      y: cursorY,
      width: vidW,
      height: videoH,
    });
    cursorY += videoH + CARD_GAP;

    if (isReview("video")) {
      const confirmH = h("stage-confirm-video", "stage-confirm", measured, custom);
      blocks.push({ key: "stage-confirm-video", type: "stage-confirm" as BlockType, x: PADDING, y: cursorY, width: vidW, height: confirmH });
      cursorY += confirmH + CARD_GAP;
    }

    cursorY += SECTION_GAP - CARD_GAP;
  }

  // ── 后期合成 ──
  if (isLocked("post")) { /* 跳过后期合成 */ }
  else if (input.hasPostProduction) {
    const postW = w("post", WIDE_WIDTH, custom);
    blocks.push({
      key: "section-后期合成",
      type: "section-label",
      x: PADDING,
      y: cursorY,
      width: postW,
      height: SECTION_HEADER,
    });
    cursorY += SECTION_HEADER;

    const postH = h("post", "post", measured, custom);
    blocks.push({
      key: "post",
      type: "post",
      x: PADDING,
      y: cursorY,
      width: postW,
      height: postH,
    });
    cursorY += postH + CARD_GAP;

    if (isReview("post")) {
      const confirmH = h("stage-confirm-post", "stage-confirm", measured, custom);
      blocks.push({ key: "stage-confirm-post", type: "stage-confirm" as BlockType, x: PADDING, y: cursorY, width: postW, height: confirmH });
      cursorY += confirmH + CARD_GAP;
    }

    cursorY += SECTION_GAP - CARD_GAP;
  }

  return blocks;
}

/**
 * 计算画布内容的总边界框（用于 fit-to-view 等功能）
 */
export function computeBounds(blocks: LayoutBlock[]): { width: number; height: number } {
  let maxX = 0;
  let maxY = 0;
  for (const b of blocks) {
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { width: maxX + LAYOUT.PADDING, height: maxY + LAYOUT.PADDING };
}
