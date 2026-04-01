"use client";
import { type ReactNode, useRef, useEffect } from "react";

interface CanvasBlockProps {
  title: string;
  status?: "pending" | "generating" | "done" | "failed" | "draft";
  /** 0-100 进度百分比，仅 generating 状态下显示 */
  progress?: number;
  /** 进度描述文本 */
  progressText?: string;
  onEdit?: () => void;
  onRegenerate?: () => void;
  onDownload?: () => void;
  children: ReactNode;
  highlight?: boolean;
  /** 用于 ResizeObserver 回报高度 */
  blockKey?: string;
  /** 当元素高度变化时回调 */
  onResize?: (key: string, height: number) => void;
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
  progress,
  progressText,
  onEdit,
  onRegenerate,
  onDownload,
  children,
  highlight,
  blockKey,
  onResize,
}: CanvasBlockProps) {
  const s = status ? STATUS_COLORS[status] || STATUS_COLORS.pending : null;
  const elRef = useRef<HTMLDivElement>(null);

  // ResizeObserver: 监听自身高度变化并通知父级
  useEffect(() => {
    if (!elRef.current || !onResize || !blockKey) return;
    const ro = new ResizeObserver(([entry]) => {
      onResize(blockKey, Math.round(entry.borderBoxSize[0].blockSize));
    });
    ro.observe(elRef.current);
    return () => ro.disconnect();
  }, [blockKey, onResize]);

  return (
    <div
      ref={elRef}
      style={{
        background: "#1e1e2e",
        borderRadius: 12,
        border: highlight ? "2px solid #7c3aed" : status === "generating" ? "1px solid rgba(240, 192, 64, 0.5)" : "1px solid #333",
        animation: !highlight && status === "generating" ? "pulse-border 1.5s ease-in-out infinite" : undefined,
        padding: 16,
        marginBottom: 16,
        transition: "border-color 0.2s",
        width: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
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
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {status === "generating" && (
                <span style={{
                  display: "inline-block",
                  width: 10, height: 10, borderRadius: "50%",
                  border: "2px solid transparent", borderTopColor: s.text,
                  animation: "spin 0.8s linear infinite",
                  flexShrink: 0,
                }} />
              )}
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
      {/* 进度条：generating 状态 + 有 progress 时显示 */}
      {status === "generating" && typeof progress === "number" && (
        <div style={{ marginBottom: 10 }}>
          {progressText && (
            <div style={{ fontSize: 11, color: "#f0c040", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                display: "inline-block", width: 6, height: 6, borderRadius: "50%",
                background: "#f0c040", animation: "blink 1.2s infinite",
              }} />
              {progressText}
            </div>
          )}
          <div style={{ height: 3, borderRadius: 2, background: "#2a2a3a", overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 2,
              background: "linear-gradient(90deg, #f0c040, #f59e0b)",
              width: `${progress}%`,
              transition: "width 0.6s ease",
            }} />
          </div>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {children}
      </div>
    </div>
  );
}
