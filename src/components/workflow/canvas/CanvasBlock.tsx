"use client";
import { type ReactNode } from "react";

interface CanvasBlockProps {
  title: string;
  status?: "pending" | "generating" | "done" | "failed" | "draft";
  onEdit?: () => void;
  onRegenerate?: () => void;
  onDownload?: () => void;
  children: ReactNode;
  highlight?: boolean;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: "#3a3a4a", text: "#aaa", label: "待处理" },
  generating: { bg: "#3a3a2a", text: "#f0c040", label: "生成中..." },
  done: { bg: "#2a3a2a", text: "#4ade80", label: "已完成" },
  failed: { bg: "#3a2a2a", text: "#f87171", label: "失败" },
  draft: { bg: "#3a3a4a", text: "#888", label: "草稿" },
};

export default function CanvasBlock({
  title,
  status,
  onEdit,
  onRegenerate,
  onDownload,
  children,
  highlight,
}: CanvasBlockProps) {
  const s = status ? STATUS_COLORS[status] || STATUS_COLORS.pending : null;

  return (
    <div
      style={{
        background: "#1e1e2e",
        borderRadius: 12,
        border: highlight ? "2px solid #7c3aed" : "1px solid #333",
        padding: 16,
        marginBottom: 16,
        transition: "border-color 0.2s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#e0e0e0" }}>{title}</span>
          {s && (
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 10,
                background: s.bg,
                color: s.text,
              }}
            >
              {s.label}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {onEdit && (
            <button
              onClick={onEdit}
              style={{
                fontSize: 12,
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid #555",
                background: "transparent",
                color: "#ccc",
                cursor: "pointer",
              }}
            >
              编辑
            </button>
          )}
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              style={{
                fontSize: 12,
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid #555",
                background: "transparent",
                color: "#ccc",
                cursor: "pointer",
              }}
            >
              重新生成
            </button>
          )}
          {onDownload && (
            <button
              onClick={onDownload}
              style={{
                fontSize: 12,
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid #555",
                background: "transparent",
                color: "#ccc",
                cursor: "pointer",
              }}
            >
              下载
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
