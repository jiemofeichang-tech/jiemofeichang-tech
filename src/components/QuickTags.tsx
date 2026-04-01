"use client";

import { useState } from "react";
import type { GenerationParams } from "@/lib/api";

export interface QuickTagSelection {
  prompt: string;
  storyType?: string;
  params?: Partial<GenerationParams>;
}

interface QuickTagDef {
  label: string;
  badge?: string;
  accent: string;
  storyType?: string;
  defaultPrompt: string;
  defaultParams?: Partial<GenerationParams>;
}

const tags: QuickTagDef[] = [
  {
    label: "快速图像 / 视频",
    badge: "多模态",
    accent: "var(--accent-blue)",
    defaultPrompt: "快速生成一个具有电影感的漫剧镜头",
    defaultParams: { mode: "text" },
  },
  {
    label: "剧情故事短片",
    badge: "推荐",
    accent: "var(--accent-pink)",
    storyType: "drama",
    defaultPrompt: "生成一支有起承转合的剧情短片",
    defaultParams: { ratio: "16:9", duration: 30 },
  },
  {
    label: "音乐概念短片",
    accent: "var(--accent-purple)",
    storyType: "music_video",
    defaultPrompt: "生成一支音乐概念短片",
    defaultParams: { ratio: "9:16", duration: 15 },
  },
  {
    label: "角色与周边设定",
    accent: "var(--accent-green)",
    storyType: "merch",
    defaultPrompt: "生成一套角色与衍生品设定",
    defaultParams: { mode: "text", ratio: "1:1" },
  },
];

interface QuickTagsProps {
  onSelect: (selection: QuickTagSelection) => void;
}

export default function QuickTags({ onSelect }: QuickTagsProps) {
  return (
    <div
      className="home-quick-tags"
      style={{
        display: "flex",
        gap: 10,
        justifyContent: "center",
        flexWrap: "wrap",
        width: "100%",
      }}
    >
      {tags.map((tag) => (
        <TagButton key={tag.label} tag={tag} onSelect={onSelect} />
      ))}
    </div>
  );
}

function TagButton({
  tag,
  onSelect,
}: {
  tag: QuickTagDef;
  onSelect: (selection: QuickTagSelection) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        onSelect({
          prompt: tag.defaultPrompt,
          storyType: tag.storyType,
          params: tag.defaultParams,
        });
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 16px",
        borderRadius: 2,
        background: hovered ? "var(--bg-hover)" : "var(--bg-card)",
        border: "1px solid var(--border)",
        borderColor: hovered ? "var(--accent-pink)" : "var(--border)",
        fontSize: 14,
        color: hovered ? "var(--text-primary)" : "var(--text-secondary)",
        transition: "all 0.2s",
        position: "relative",
      }}
    >
      <span style={{ color: tag.accent, fontSize: 12 }}>●</span>
      {tag.label}
      {tag.badge && (
        <span
          style={{
            padding: "2px 7px",
            borderRadius: 2,
            backgroundColor: tag.label === "快速图像 / 视频" ? "#c49a3a" : "#d4622a",
            color: "#fff",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {tag.badge}
        </span>
      )}
    </button>
  );
}
