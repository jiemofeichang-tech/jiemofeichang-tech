/**
 * 资产管理中心 — 类型定义
 * 复用 api.ts 中的 WfCharacter / WfScene / WfShot / AssetRecord
 */

import type { WfCharacter, WfScene, WfShot, AssetRecord } from "@/lib/api";

// ---------------------------------------------------------------------------
// Tab 类型
// ---------------------------------------------------------------------------

export type AssetTab = "characters" | "storyboards" | "videos" | "scenes";

export const ASSET_TABS: { id: AssetTab; label: string }[] = [
  { id: "characters", label: "角色" },
  { id: "storyboards", label: "分镜" },
  { id: "videos", label: "视频" },
  { id: "scenes", label: "场景" },
];

// ---------------------------------------------------------------------------
// 带项目信息的资产项
// ---------------------------------------------------------------------------

export interface CharacterAssetItem {
  character: WfCharacter;
  projectId: string;
  projectName: string;
  index: number; // 全局编号（跨项目）
}

export interface SceneAssetItem {
  scene: WfScene;
  projectId: string;
  projectName: string;
}

export interface StoryboardAssetItem {
  shot: WfShot;
  projectId: string;
  projectName: string;
  episodeTitle: string;
}

export type VideoAssetItem =
  | { source: "library"; asset: AssetRecord }
  | { source: "workflow"; shot: WfShot; projectId: string; projectName: string };
