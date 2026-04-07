"use client";

import { useState, type ReactNode } from "react";
import type { GenerationParams } from "@/lib/api";

export interface QuickTagSelection {
  prompt: string;
  storyType?: string;
  params?: Partial<GenerationParams>;
}

interface QuickTagDef {
  label: string;
  badge?: string;
  storyType?: string;
  icon: ReactNode;
  defaultPrompt: string;
  defaultParams?: Partial<GenerationParams>;
}

const tags: QuickTagDef[] = [
  {
    label: "快速图像 / 视频",
    badge: "多模态",
    icon: <SparkIcon />,
    defaultPrompt: "快速生成一个具有电影感的漫剧镜头",
    defaultParams: { mode: "text" },
  },
  {
    label: "剧情故事短片",
    badge: "推荐",
    storyType: "drama",
    icon: <PlayIcon />,
    defaultPrompt: "生成一支有起承转合的剧情短片",
    defaultParams: { ratio: "16:9", duration: 30 },
  },
  {
    label: "音乐概念短片",
    storyType: "music_video",
    icon: <WaveIcon />,
    defaultPrompt: "生成一支音乐概念短片",
    defaultParams: { ratio: "9:16", duration: 15 },
  },
  {
    label: "角色与周边设定",
    storyType: "merch",
    icon: <ShapeIcon />,
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
        flexWrap: "wrap",
        gap: 12,
        width: "100%",
      }}
    >
      {tags.map((tag) => (
        <QuickTagCard key={tag.label} tag={tag} onSelect={onSelect} />
      ))}
    </div>
  );
}

function QuickTagCard({
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
      onClick={() =>
        onSelect({
          prompt: tag.defaultPrompt,
          storyType: tag.storyType,
          params: tag.defaultParams,
        })
      }
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: "1 1 220px",
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        padding: "16px 18px",
        borderRadius: 22,
        border: hovered ? "1px solid rgba(130,182,255,0.24)" : "1px solid rgba(255,255,255,0.08)",
        background: hovered ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.04)",
        color: "var(--text-primary)",
        textAlign: "left",
        boxShadow: hovered ? "0 18px 34px rgba(0,0,0,0.16)" : "none",
        transition: "transform 0.18s ease, border-color 0.18s ease, background 0.18s ease",
        transform: hovered ? "translateY(-1px)" : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 14,
            background: "linear-gradient(180deg, rgba(130,182,255,0.22), rgba(130,182,255,0.08))",
            border: "1px solid rgba(130,182,255,0.14)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--accent-hot-pink)",
            flexShrink: 0,
          }}
        >
          {tag.icon}
        </span>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-primary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {tag.label}
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted)" }}>一键填充灵感模板</div>
        </div>
      </div>

      {tag.badge && (
        <span
          style={{
            flexShrink: 0,
            padding: "6px 10px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "var(--text-secondary)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.02em",
          }}
        >
          {tag.badge}
        </span>
      )}
    </button>
  );
}

function BaseIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function SparkIcon() {
  return (
    <BaseIcon>
      <path d="m12 3 1.8 4.7L18.5 9l-4.7 1.3L12 15l-1.8-4.7L5.5 9l4.7-1.3Z" />
    </BaseIcon>
  );
}

function PlayIcon() {
  return (
    <BaseIcon>
      <rect x="4" y="5" width="16" height="14" rx="3" />
      <path d="m10 9 5 3-5 3z" />
    </BaseIcon>
  );
}

function WaveIcon() {
  return (
    <BaseIcon>
      <path d="M4 14c1.2 0 1.8-4 3-4s1.8 8 3 8 1.8-12 3-12 1.8 8 3 8 1.8-4 3-4" />
    </BaseIcon>
  );
}

function ShapeIcon() {
  return (
    <BaseIcon>
      <circle cx="8" cy="8" r="3" />
      <rect x="12.5" y="5" width="6.5" height="6.5" rx="1.5" />
      <path d="M8 16.5 5.5 19h5Z" />
      <path d="M15.5 16.5h4" />
    </BaseIcon>
  );
}
