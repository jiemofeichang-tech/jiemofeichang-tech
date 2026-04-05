"use client";

import { useState } from "react";

interface CanvasToolbarProps {
  onAddCard: (type: string, row: "script" | "character" | "scene" | "storyboard") => void;
}

const tools = [
  { icon: "📝", label: "剧本", type: "scriptCard", row: "script" as const },
  { icon: "🎭", label: "风格", type: "stylePresetCard", row: "script" as const },
  { icon: "🧑", label: "角色", type: "characterCard", row: "character" as const },
  { icon: "🏞️", label: "场景", type: "sceneCard", row: "scene" as const },
  { icon: "🖼️", label: "分镜", type: "storyboardCard", row: "storyboard" as const },
];

export default function CanvasToolbar({ onAddCard }: CanvasToolbarProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      width: 52,
      background: "#141420",
      borderRight: "1px solid #222",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      paddingTop: 12,
      gap: 4,
    }}>
      {/* 添加按钮 */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: 36,
          height: 36,
          borderRadius: 20,
          border: "none",
          background: expanded ? "#7c3aed" : "#2a2a3e",
          color: "#fff",
          fontSize: 18,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.2s",
        }}
      >
        +
      </button>

      {/* 展开的添加面板 */}
      {expanded && tools.map((t) => (
        <button
          key={t.type}
          onClick={() => { onAddCard(t.type, t.row); setExpanded(false); }}
          title={`添加${t.label}`}
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            border: "1px solid #333",
            background: "#1e1e2e",
            color: "#ccc",
            fontSize: 14,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {t.icon}
        </button>
      ))}

      <div style={{ height: 1, width: 28, background: "#333", margin: "8px 0" }} />

      {/* 工具按钮 */}
      {[
        { icon: "⊞", title: "自动布局" },
        { icon: "↓", title: "导出" },
      ].map((btn) => (
        <button
          key={btn.title}
          title={btn.title}
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            border: "none",
            background: "transparent",
            color: "#666",
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          {btn.icon}
        </button>
      ))}
    </div>
  );
}
