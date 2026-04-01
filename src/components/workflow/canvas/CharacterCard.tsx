"use client";
import { useState, useRef } from "react";
import type { WfCharacter } from "@/lib/api";
import CanvasBlock from "./CanvasBlock";
import ImageLightbox from "@/components/ui/ImageLightbox";

interface CharacterCardProps {
  character: WfCharacter;
  onEdit: () => void;
  onRegenerate: () => void;
  isSelected: boolean;
  blockKey?: string;
  onResize?: (key: string, height: number) => void;
  /** Step 4 审核回调 */
  onApproveView?: (charId: string, viewKey: string) => void;
  onRegenerateView?: (charId: string, viewKey: string) => void;
  onUploadReplacement?: (charId: string, viewKey: string, imageData: string) => void;
  onEditPrompt?: (charId: string, viewKey: string) => void;
  locked?: boolean;
}

const VIEW_KEYS = ["front", "side", "back"] as const;
const VIEW_LABELS: Record<string, string> = { front: "正面", side: "侧面", back: "背面" };

const EXPR_LABELS: Record<string, string> = {
  neutral: "平静",
  happy: "开心",
  angry: "愤怒",
  sad: "悲伤",
  surprised: "惊讶",
  determined: "坚定",
};

function StatusBadge({ status }: { status?: "approved" | "pending" | "rejected" }) {
  if (!status || status === "pending") return null;
  const color = status === "approved" ? "#4ade80" : "#f87171";
  const label = status === "approved" ? "已通过" : "已拒绝";
  return (
    <span style={{ fontSize: 9, color, fontWeight: 600 }}>{label}</span>
  );
}

function ImageSlot({
  src,
  label,
  viewKey,
  charId,
  viewStatus,
  locked,
  isGenerating,
  onApprove,
  onRegenerate,
  onUpload,
  onEditPrompt,
}: {
  src: string | null;
  label: string;
  viewKey: string;
  charId: string;
  viewStatus?: "approved" | "pending" | "rejected";
  locked?: boolean;
  isGenerating?: boolean;
  onApprove?: (charId: string, viewKey: string) => void;
  onRegenerate?: (charId: string, viewKey: string) => void;
  onUpload?: (charId: string, viewKey: string, imageData: string) => void;
  onEditPrompt?: (charId: string, viewKey: string) => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = () => {
    fileRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpload) return;
    // 安全校验：文件大小和类型
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_SIZE) {
      alert("文件过大，请选择 10MB 以内的图片");
      e.target.value = "";
      return;
    }
    if (!file.type.startsWith("image/")) {
      alert("仅支持图片文件");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      onUpload(charId, viewKey, base64);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div
      style={{ textAlign: "center", position: "relative", flex: 1, minWidth: 0 }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div
        style={{
          width: "100%",
          aspectRatio: "2 / 3",
          background: "#252535",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          border: viewStatus === "approved"
            ? "2px solid #4ade80"
            : viewStatus === "rejected"
              ? "2px solid #f87171"
              : isGenerating && !src
                ? "1px solid rgba(240, 192, 64, 0.5)"
                : "1px solid #333",
          animation: isGenerating && !src ? "pulse-border 1.5s ease-in-out infinite" : undefined,
          position: "relative",
        }}
      >
        {src ? (
          <img
            src={src}
            alt={label}
            onClick={() => setPreviewSrc(src)}
            style={{ width: "100%", height: "100%", objectFit: "contain", cursor: "zoom-in" }}
          />
        ) : isGenerating ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%",
              border: "3px solid #333", borderTopColor: "#f0c040",
              animation: "spin 0.8s linear infinite",
            }} />
            <span style={{ color: "#f0c040", fontSize: 10 }}>生成中</span>
          </div>
        ) : (
          <span style={{ color: "#555", fontSize: 24 }}>?</span>
        )}

        {/* 悬停操作按钮 */}
        {showActions && src && !locked && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.7)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
            }}
          >
            <button onClick={() => setPreviewSrc(src)} style={actionBtnStyle("#e2e8f0")}>
              查看
            </button>
            {viewStatus !== "approved" && onApprove && (
              <button onClick={() => onApprove(charId, viewKey)} style={actionBtnStyle("#4ade80")}>
                通过
              </button>
            )}
            {onRegenerate && (
              <button onClick={() => onRegenerate(charId, viewKey)} style={actionBtnStyle("#f0c040")}>
                重生
              </button>
            )}
            {onUpload && (
              <button onClick={handleUpload} style={actionBtnStyle("#60a5fa")}>
                替换
              </button>
            )}
            {onEditPrompt && (
              <button onClick={() => onEditPrompt(charId, viewKey)} style={actionBtnStyle("#c084fc")}>
                编辑词
              </button>
            )}
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: "#888", marginTop: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
        {label}
        <StatusBadge status={viewStatus} />
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileChange} />
      {previewSrc && <ImageLightbox src={previewSrc} onClose={() => setPreviewSrc(null)} />}
    </div>
  );
}

function TurnaroundSheet({
  src,
  charId,
  locked,
  isGenerating,
  onRegenerate,
}: {
  src: string;
  charId: string;
  locked?: boolean;
  isGenerating?: boolean;
  onRegenerate?: (charId: string, viewKey: string) => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  return (
    <div
      style={{ width: "100%", position: "relative" }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div
        style={{
          width: "100%",
          aspectRatio: "3 / 2",
          background: "#252535",
          borderRadius: 8,
          overflow: "hidden",
          border: "1px solid #333",
          position: "relative",
          cursor: "zoom-in",
        }}
        onClick={() => setPreviewSrc(src)}
      >
        {src ? (
          <img
            src={src}
            alt="角色三视图"
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        ) : isGenerating ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              border: "3px solid #333", borderTopColor: "#f0c040",
              animation: "spin 0.8s linear infinite",
            }} />
            <span style={{ color: "#f0c040", fontSize: 11 }}>三视图生成中</span>
          </div>
        ) : (
          <span style={{ color: "#555", fontSize: 24 }}>?</span>
        )}

        {showActions && !locked && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <button onClick={(e) => { e.stopPropagation(); setPreviewSrc(src); }} style={actionBtnStyle("#e2e8f0")}>
              查看
            </button>
            {onRegenerate && (
              <button onClick={(e) => { e.stopPropagation(); onRegenerate(charId, "front"); }} style={actionBtnStyle("#f0c040")}>
                重生
              </button>
            )}
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: "#888", marginTop: 4, textAlign: "center" }}>
        正面 · 侧面 · 背面
      </div>
      {previewSrc && <ImageLightbox src={previewSrc} onClose={() => setPreviewSrc(null)} />}
    </div>
  );
}

function actionBtnStyle(color: string): React.CSSProperties {
  return {
    fontSize: 10,
    padding: "3px 10px",
    borderRadius: 4,
    border: `1px solid ${color}`,
    background: "transparent",
    color,
    cursor: "pointer",
    fontWeight: 600,
    width: 60,
  };
}

export default function CharacterCard({
  character,
  onEdit,
  onRegenerate,
  isSelected,
  blockKey,
  onResize,
  onApproveView,
  onRegenerateView,
  onUploadReplacement,
  onEditPrompt,
  locked,
}: CharacterCardProps) {
  const viewStatus = character.view_status || {};

  return (
    <CanvasBlock
      title={`角色: ${character.name}`}
      status={character.status}
      onEdit={locked ? undefined : onEdit}
      onRegenerate={locked ? undefined : onRegenerate}
      highlight={isSelected}
      blockKey={blockKey}
      onResize={onResize}
    >
      <p style={{ fontSize: 12, color: "#aaa", marginBottom: 10 }}>
        {character.description.slice(0, 120)}
        {character.description.length > 120 ? "..." : ""}
      </p>

      {/* 三视图（单张宽图） */}
      {(() => {
        const src = character.front_view || character.side_view || character.back_view;
        if (src) {
          return (
            <TurnaroundSheet
              src={src}
              charId={character.id}
              locked={locked}
              isGenerating={character.status === "generating"}
              onRegenerate={onRegenerateView}
            />
          );
        }
        if (character.status === "generating") {
          return (
            <TurnaroundSheet
              src=""
              charId={character.id}
              locked={locked}
              isGenerating={true}
              onRegenerate={onRegenerateView}
            />
          );
        }
        return null;
      })()}

      {/* 表情图 */}
      {character.expression_sheet && typeof character.expression_sheet === "object" && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>表情图</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
            {Object.entries(character.expression_sheet).map(([key, url]) => (
              <div key={key} style={{ textAlign: "center", flex: "1 1 40px", minWidth: 40, maxWidth: 80 }}>
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "1",
                    background: "#252535",
                    borderRadius: 6,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    border: "1px solid #333",
                  }}
                >
                  {url ? (
                    <img src={url} alt={key} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  ) : (
                    <span style={{ color: "#444", fontSize: 10 }}>?</span>
                  )}
                </div>
                <div style={{ fontSize: 9, color: "#666", marginTop: 2 }}>{EXPR_LABELS[key] || key}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 快捷操作 */}
      {character.status === "done" && !locked && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "center" }}>
          {Object.keys(viewStatus).length > 0 && Object.values(viewStatus).every((s) => s === "approved") ? (
            <span style={{ fontSize: 11, color: "#4ade80", fontWeight: 600 }}>全部通过</span>
          ) : (
            <span style={{ fontSize: 11, color: "#f0c040" }}>
              {Object.values(viewStatus).filter((s) => s === "approved").length}/{Object.keys(viewStatus).length} 已通过
            </span>
          )}
        </div>
      )}

      {locked && (
        <div style={{ marginTop: 8, textAlign: "center" }}>
          <span style={{ fontSize: 11, color: "#4ade80", background: "#1a2e1a", padding: "2px 10px", borderRadius: 6 }}>
            已锁定
          </span>
        </div>
      )}
    </CanvasBlock>
  );
}
