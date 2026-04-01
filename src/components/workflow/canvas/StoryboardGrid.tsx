"use client";
import { useState, useEffect } from "react";
import type { WfEpisode, WfShot } from "@/lib/api";
import CanvasBlock from "./CanvasBlock";
import ImageLightbox from "@/components/ui/ImageLightbox";

interface StoryboardGridProps {
  episodes: WfEpisode[];
  onEditShot: (episodeId: string, shotId: string) => void;
  onRegenerateShot: (episodeId: string, shotId: string) => void;
  onApproveShot?: (episodeId: string, shotId: string) => void;
  onUpdatePrompt?: (episodeId: string, shotId: string, prompt: string) => void;
  selectedShotId: string | null;
}

// ── Status styles ──

const SHOT_STATUS: Record<string, { color: string; bg: string; label: string }> = {
  draft: { color: "#888", bg: "#333", label: "待处理" },
  pending: { color: "#888", bg: "#333", label: "待生成" },
  generating: { color: "#f0c040", bg: "#3a3a2a", label: "生成中" },
  done: { color: "#4ade80", bg: "#2a3a2a", label: "已完成" },
  approved: { color: "#60a5fa", bg: "#1e2a3a", label: "已通过" },
  storyboard: { color: "#4ade80", bg: "#2a3a2a", label: "已完成" },
  error: { color: "#f87171", bg: "#3a2a2a", label: "失败" },
  failed: { color: "#f87171", bg: "#3a2a2a", label: "失败" },
};

// ── Single Shot Card ──

function ShotCard({
  shot,
  index,
  onEdit,
  onRegenerate,
  onApprove,
  onUpdatePrompt,
  isSelected,
}: {
  shot: WfShot;
  index: number;
  onEdit: () => void;
  onRegenerate: () => void;
  onApprove?: () => void;
  onUpdatePrompt?: (prompt: string) => void;
  isSelected: boolean;
}) {
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [promptText, setPromptText] = useState(shot.prompt || shot.raw_description || "");
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  // 同步外部 shot 数据变化
  useEffect(() => {
    setPromptText(shot.prompt || shot.raw_description || "");
  }, [shot.prompt, shot.raw_description]);
  const isApproved = shot.approved === true;
  const statusKey = isApproved ? "approved" : (shot.storyboard_image ? "done" : (shot.status || "pending"));
  const s = SHOT_STATUS[statusKey] || SHOT_STATUS.pending;

  return (
    <div
      style={{
        background: isApproved ? "#1a2a25" : "#252535",
        borderRadius: 8,
        border: isSelected ? "2px solid #7c3aed" : isApproved ? "1px solid #4ade80" : ((shot.status as string) === "generating") ? "1px solid rgba(240, 192, 64, 0.5)" : "1px solid #333",
        animation: ((shot.status as string) === "generating") ? "pulse-border 1.5s ease-in-out infinite" : undefined,
        overflow: "hidden",
        flex: "1 1 150px",
        minWidth: 130,
        maxWidth: 280,
        transition: "border-color 0.2s, background 0.2s",
      }}
    >
      {/* Thumbnail */}
      <div
        style={{
          width: "100%",
          aspectRatio: "16 / 9",
          background: "#1a1a2a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {shot.storyboard_image ? (
          <img
            src={shot.storyboard_image}
            alt={`镜头${index + 1}`}
            onClick={() => setPreviewSrc(shot.storyboard_image!)}
            style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "zoom-in" }}
          />
        ) : ((shot.status as string) === "generating") ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%",
              border: "3px solid #333", borderTopColor: "#f0c040",
              animation: "spin 0.8s linear infinite",
            }} />
            <span style={{ color: "#f0c040", fontSize: 10 }}>生成中</span>
          </div>
        ) : (
          <span style={{ color: "#555", fontSize: 12 }}>待生成</span>
        )}
        {/* Top-left: shot number + type */}
        <div
          style={{
            position: "absolute",
            top: 4,
            left: 4,
            background: "rgba(0,0,0,0.7)",
            borderRadius: 4,
            padding: "1px 6px",
            fontSize: 10,
            color: "#fff",
          }}
        >
          #{index + 1} {shot.shot_type}
        </div>
        {/* Top-right: duration */}
        <div
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            background: "rgba(0,0,0,0.7)",
            borderRadius: 4,
            padding: "1px 6px",
            fontSize: 10,
            color: "#aaa",
          }}
        >
          {shot.duration}s
        </div>
        {/* Bottom-right: status badge */}
        <div
          style={{
            position: "absolute",
            bottom: 4,
            right: 4,
            background: s.bg,
            borderRadius: 4,
            padding: "1px 6px",
            fontSize: 9,
            color: s.color,
            fontWeight: 600,
          }}
        >
          {s.label}
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: 8 }}>
        <div style={{ fontSize: 11, color: "#ccc", marginBottom: 4, lineHeight: 1.3 }}>
          {(shot.raw_description || "").slice(0, 55)}
          {(shot.raw_description || "").length > 55 ? "..." : ""}
        </div>
        {shot.dialogue && (
          <div style={{ fontSize: 10, color: "#888", fontStyle: "italic", marginBottom: 4 }}>
            &ldquo;{shot.dialogue.slice(0, 30)}&rdquo;
          </div>
        )}

        {/* Prompt editor */}
        {editingPrompt && (
          <div style={{ marginBottom: 6 }}>
            <textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              style={{
                width: "100%",
                height: 60,
                background: "#1a1a2a",
                border: "1px solid #555",
                borderRadius: 4,
                color: "#ccc",
                fontSize: 10,
                padding: 4,
                resize: "vertical",
              }}
            />
            <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
              <button
                onClick={() => {
                  onUpdatePrompt?.(promptText);
                  setEditingPrompt(false);
                }}
                style={{
                  fontSize: 9,
                  padding: "2px 6px",
                  borderRadius: 3,
                  border: "none",
                  background: "#7c3aed",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                保存并重生
              </button>
              <button
                onClick={() => setEditingPrompt(false)}
                style={{
                  fontSize: 9,
                  padding: "2px 6px",
                  borderRadius: 3,
                  border: "1px solid #555",
                  background: "transparent",
                  color: "#aaa",
                  cursor: "pointer",
                }}
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {onApprove && shot.storyboard_image && !isApproved && (
            <button
              onClick={onApprove}
              style={{
                fontSize: 10,
                padding: "2px 8px",
                borderRadius: 4,
                border: "none",
                background: "#059669",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              通过
            </button>
          )}
          <button
            onClick={() => setEditingPrompt(!editingPrompt)}
            style={{
              fontSize: 10,
              padding: "2px 8px",
              borderRadius: 4,
              border: "1px solid #444",
              background: "transparent",
              color: "#aaa",
              cursor: "pointer",
            }}
          >
            编辑
          </button>
          <button
            onClick={onRegenerate}
            style={{
              fontSize: 10,
              padding: "2px 8px",
              borderRadius: 4,
              border: "1px solid #444",
              background: "transparent",
              color: "#aaa",
              cursor: "pointer",
            }}
          >
            重生
          </button>
        </div>
      </div>
      {previewSrc && <ImageLightbox src={previewSrc} onClose={() => setPreviewSrc(null)} />}
    </div>
  );
}

// ── Progress Bar ──

function ProgressBar({ done, approved, total }: { done: number; approved: number; total: number }) {
  const pctDone = total > 0 ? Math.round((done / total) * 100) : 0;
  const pctApproved = total > 0 ? Math.round((approved / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#aaa", marginBottom: 4 }}>
        <span>{done}/{total} 已生成 · {approved} 已通过</span>
        <span>{pctDone}%</span>
      </div>
      <div style={{ height: 4, background: "#333", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pctDone}%`, background: "#4ade80", borderRadius: 2, transition: "width 0.3s" }} />
      </div>
      {approved > 0 && (
        <div style={{ height: 2, background: "#333", borderRadius: 1, marginTop: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pctApproved}%`, background: "#60a5fa", borderRadius: 1, transition: "width 0.3s" }} />
        </div>
      )}
    </div>
  );
}

// ── Main Grid ──

export default function StoryboardGrid({
  episodes,
  onEditShot,
  onRegenerateShot,
  onApproveShot,
  onUpdatePrompt,
  selectedShotId,
}: StoryboardGridProps) {
  if (episodes.length === 0) {
    return (
      <CanvasBlock title="分镜图" status="pending">
        <p style={{ color: "#888", fontSize: 13 }}>完成剧本分析和角色设计后，将自动生成分镜图。</p>
      </CanvasBlock>
    );
  }

  return (
    <>
      {episodes.map((ep) => {
        const total = ep.shots.length;
        const done = ep.shots.filter((s) => s.storyboard_image).length;
        const approved = ep.shots.filter((s) => s.approved === true).length;

        return (
          <CanvasBlock
            key={ep.id}
            title={`分镜: ${ep.title}`}
            status={done === total && total > 0 ? "done" : done > 0 ? "generating" : "pending"}
          >
            <ProgressBar done={done} approved={approved} total={total} />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", paddingBottom: 8 }}>
              {ep.shots.map((shot, i) => (
                <ShotCard
                  key={shot.id}
                  shot={shot}
                  index={i}
                  onEdit={() => onEditShot(ep.id, shot.id)}
                  onRegenerate={() => onRegenerateShot(ep.id, shot.id)}
                  onApprove={onApproveShot ? () => onApproveShot(ep.id, shot.id) : undefined}
                  onUpdatePrompt={
                    onUpdatePrompt ? (prompt) => onUpdatePrompt(ep.id, shot.id, prompt) : undefined
                  }
                  isSelected={selectedShotId === shot.id}
                />
              ))}
            </div>
          </CanvasBlock>
        );
      })}
    </>
  );
}
