"use client";
import { memo, useState } from "react";
import { Handle, Position } from "@xyflow/react";

const STYLE_PRESETS = [
  { id: "realistic", label: "写实", icon: "📷", desc: "电影级真实画面", color: "#059669" },
  { id: "anime", label: "动漫", icon: "🎨", desc: "日系动画风格", color: "#7c3aed" },
  { id: "cinematic", label: "电影感", icon: "🎬", desc: "宽银幕叙事质感", color: "#dc2626" },
  { id: "watercolor", label: "水彩", icon: "🖌️", desc: "手绘水彩插画", color: "#2563eb" },
  { id: "3d_render", label: "3D 渲染", icon: "🧊", desc: "Pixar 级 3D 画风", color: "#f59e0b" },
  { id: "comic", label: "漫画", icon: "💬", desc: "分格漫画风格", color: "#ec4899" },
];

interface StylePresetData {
  title?: string;
  selectedStyle?: string;
  onStyleChange?: (styleId: string, styleLabel: string) => void;
}

function StylePresetCard({ data }: { data: StylePresetData }) {
  const [selected, setSelected] = useState(data.selectedStyle || "realistic");

  const handleSelect = (preset: typeof STYLE_PRESETS[number]) => {
    setSelected(preset.id);
    data.onStyleChange?.(preset.id, preset.label);
  };

  const current = STYLE_PRESETS.find((s) => s.id === selected) ?? STYLE_PRESETS[0];

  return (
    <div style={{
      width: 220,
      background: "#fff",
      borderRadius: 10,
      border: `1.5px solid ${current.color}33`,
      boxShadow: `0 2px 12px ${current.color}15`,
      overflow: "visible",
      position: "relative",
    }}>
      {/* 标题 */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 12px",
        borderBottom: "1px solid #f0f0e8",
      }}>
        <span style={{ fontSize: 14 }}>🎭</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#333" }}>
          {data.title || "风格预设"}
        </span>
      </div>

      {/* 当前选中 */}
      <div style={{
        margin: "8px 10px 4px",
        padding: "6px 10px",
        background: `${current.color}10`,
        border: `1px solid ${current.color}33`,
        borderRadius: 6,
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}>
        <span style={{ fontSize: 16 }}>{current.icon}</span>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: current.color }}>{current.label}</div>
          <div style={{ fontSize: 9, color: "#999" }}>{current.desc}</div>
        </div>
      </div>

      {/* 风格网格 */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 4,
        padding: "6px 10px 10px",
      }}>
        {STYLE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => handleSelect(preset)}
            style={{
              padding: "5px 2px",
              borderRadius: 6,
              border: selected === preset.id
                ? `1.5px solid ${preset.color}`
                : "1px solid #eee",
              background: selected === preset.id ? `${preset.color}10` : "#fafaf6",
              cursor: "pointer",
              textAlign: "center",
              transition: "all 0.15s",
            }}
          >
            <div style={{ fontSize: 14 }}>{preset.icon}</div>
            <div style={{
              fontSize: 9,
              fontWeight: selected === preset.id ? 600 : 400,
              color: selected === preset.id ? preset.color : "#666",
              marginTop: 2,
            }}>
              {preset.label}
            </div>
          </button>
        ))}
      </div>

      <Handle
        type="target"
        position={Position.Left}
        style={{ width: 12, height: 12, background: "#94a3b8", border: "2px solid #fff" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 12,
          height: 12,
          background: current.color,
          border: "2px solid #fff",
          boxShadow: `0 0 4px ${current.color}66`,
        }}
      />
    </div>
  );
}

export default memo(StylePresetCard);
