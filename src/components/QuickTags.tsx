"use client";

import { useState } from "react";

const tags = [
  { label: "自由生图/生视频", badge: "多模型", badgeColor: "#00cc99" },
  { label: "剧情故事短片", badge: "推荐", badgeColor: "#ef319f" },
  { label: "音乐概念短片" },
  { label: "衍生品设计" },
];

interface QuickTagsProps {
  onSelect: (text: string) => void;
}

export default function QuickTags({ onSelect }: QuickTagsProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        justifyContent: "center",
        flexWrap: "wrap",
        maxWidth: 900,
        margin: "18px auto 0",
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
  tag: { label: string; badge?: string; badgeColor?: string };
  onSelect: (text: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={() => onSelect(`帮我创作一个${tag.label}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 18px",
        borderRadius: 12,
        backgroundColor: hovered ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.08)",
        border: "none",
        fontSize: 15,
        color: hovered ? "var(--text-primary)" : "rgba(255,255,255,0.8)",
        cursor: "pointer",
        transition: "all 0.2s",
        position: "relative",
      }}
    >
      <span style={{ color: "var(--accent-pink)", fontSize: 12 }}>✦</span>
      {tag.label}
      {tag.badge && (
        <span
          style={{
            position: "absolute",
            top: -8,
            right: -4,
            padding: "1px 6px",
            borderRadius: 4,
            backgroundColor: tag.badgeColor,
            color: "#fff",
            fontSize: 9,
            fontWeight: 600,
          }}
        >
          {tag.badge}
        </span>
      )}
    </button>
  );
}
