"use client";
import { useState, useRef } from "react";
import type { WfScene } from "@/lib/api";
import CanvasBlock from "./CanvasBlock";

interface SceneCardProps {
  scene: WfScene;
  onEdit: () => void;
  onRegenerate: () => void;
  isSelected: boolean;
  blockKey?: string;
  onResize?: (key: string, height: number) => void;
  /** Step 4 审核回调 */
  onApproveView?: (sceneId: string, viewKey: string) => void;
  onRegenerateView?: (sceneId: string, viewKey: string) => void;
  onUploadReplacement?: (sceneId: string, viewKey: string, imageData: string) => void;
  onEditPrompt?: (sceneId: string, viewKey: string) => void;
  locked?: boolean;
  /** AI 生成的六视图提示词（剧本分析阶段） */
  sixViewPrompts?: Record<string, string>;
  /** 确认生成回调：用户确认提示词后触发单个场景的图片生成 */
  onConfirmGenerate?: (sceneId: string) => void;
  /** 该场景关联的角色（用于展示角色头像 chips） */
  characters?: Array<{ id: string; name: string; front_view: string | null }>;
}

const VIEW_LABELS: Record<string, string> = {
  front: "正面",
  back: "背面",
  left: "左侧",
  right: "右侧",
  top: "俯视",
  detail: "细节",
};

function actionBtnStyle(color: string): React.CSSProperties {
  return {
    fontSize: 9,
    padding: "2px 8px",
    borderRadius: 4,
    border: `1px solid ${color}`,
    background: "transparent",
    color,
    cursor: "pointer",
    fontWeight: 600,
  };
}

export default function SceneCard({
  scene,
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
  sixViewPrompts,
  onConfirmGenerate,
  characters,
}: SceneCardProps) {
  const viewEntries = Object.entries(scene.views || {});
  const hasAnyView = viewEntries.some(([, v]) => v);
  const viewStatus = scene.view_status || {};
  const [hoveredView, setHoveredView] = useState<string | null>(null);
  const [promptsExpanded, setPromptsExpanded] = useState(false);

  // 判断是否处于"待确认提示词"状态：有提示词但还没生成图片
  const hasSixViewPrompts = sixViewPrompts && Object.values(sixViewPrompts).some(Boolean);
  const isPromptPreviewMode = hasSixViewPrompts && !hasAnyView && scene.status === "pending";

  return (
    <CanvasBlock
      title={`场景: ${scene.name}`}
      status={scene.status}
      onEdit={locked ? undefined : onEdit}
      onRegenerate={locked ? undefined : onRegenerate}
      highlight={isSelected}
      blockKey={blockKey}
      onResize={onResize}
    >
      <p style={{ fontSize: 12, color: "#aaa", marginBottom: 8 }}>
        {scene.description.slice(0, 120)}
        {scene.description.length > 120 ? "..." : ""}
      </p>

      {/* 关联角色 */}
      {characters && characters.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {characters.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 4, background: "#27272a", borderRadius: 12, padding: "2px 8px 2px 2px" }}>
              {c.front_view ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.front_view} alt={c.name} style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover" }} />
              ) : (
                <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#3f3f46", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#a1a1aa" }}>
                  {c.name[0]}
                </div>
              )}
              <span style={{ fontSize: 10, color: "#d4d4d8", fontWeight: 500 }}>{c.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* 提示词预览模式：展示 AI 生成的提示词，等待用户确认 */}
      {isPromptPreviewMode ? (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: "#a78bfa", fontWeight: 600 }}>六视图提示词</span>
            <button
              onClick={() => setPromptsExpanded(!promptsExpanded)}
              style={{
                fontSize: 10, background: "transparent", border: "1px solid #444",
                color: "#888", borderRadius: 4, padding: "2px 8px", cursor: "pointer",
              }}
            >
              {promptsExpanded ? "收起" : "展开全部"}
            </button>
          </div>

          {/* 提示词列表 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
            {Object.entries(VIEW_LABELS).map(([key, label]) => {
              const prompt = sixViewPrompts?.[key];
              if (!prompt) return null;
              return (
                <div key={key} style={{ fontSize: 11, lineHeight: 1.4 }}>
                  <span style={{ color: "#7c3aed", fontWeight: 600 }}>{label}：</span>
                  <span style={{ color: "#999" }}>
                    {promptsExpanded ? prompt : (prompt.length > 60 ? prompt.slice(0, 60) + "..." : prompt)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* 操作按钮 */}
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            {onEdit && (
              <button
                onClick={onEdit}
                style={{
                  fontSize: 12, padding: "6px 16px", borderRadius: 6,
                  border: "1px solid #7c3aed", background: "transparent",
                  color: "#a78bfa", cursor: "pointer", fontWeight: 600,
                }}
              >
                编辑
              </button>
            )}
            {onConfirmGenerate && (
              <button
                onClick={() => onConfirmGenerate(scene.id)}
                style={{
                  fontSize: 12, padding: "6px 16px", borderRadius: 6,
                  border: "none", background: "#7c3aed",
                  color: "#fff", cursor: "pointer", fontWeight: 600,
                }}
              >
                确认生成
              </button>
            )}
          </div>
        </div>
      ) : (
        /* 正常的视图格子模式 */
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(hasAnyView ? viewEntries : Object.entries(VIEW_LABELS).map(([k]) => [k, null] as [string, string | null])).map(
            ([key, url]) => (
              <ViewSlot
                key={key}
                viewKey={key}
                url={url}
                label={VIEW_LABELS[key] || key}
                sceneId={scene.id}
                viewStatus={viewStatus[key]}
                locked={locked}
                isGenerating={scene.status === "generating"}
                isHovered={hoveredView === key}
                onMouseEnter={() => setHoveredView(key)}
                onMouseLeave={() => setHoveredView(null)}
                onApprove={onApproveView}
                onRegenerate={onRegenerateView}
                onUpload={onUploadReplacement}
                onEditPrompt={onEditPrompt}
              />
            ),
          )}
        </div>
      )}

      {/* 审核状态汇总 */}
      {scene.status === "done" && !locked && Object.keys(viewStatus).length > 0 && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "center" }}>
          {Object.values(viewStatus).every((s) => s === "approved") ? (
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

function ViewSlot({
  viewKey,
  url,
  label,
  sceneId,
  viewStatus,
  locked,
  isGenerating,
  isHovered,
  onMouseEnter,
  onMouseLeave,
  onApprove,
  onRegenerate,
  onUpload,
  onEditPrompt,
}: {
  viewKey: string;
  url: string | null;
  label: string;
  sceneId: string;
  viewStatus?: "approved" | "pending" | "rejected";
  locked?: boolean;
  isGenerating?: boolean;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onApprove?: (id: string, key: string) => void;
  onRegenerate?: (id: string, key: string) => void;
  onUpload?: (id: string, key: string, data: string) => void;
  onEditPrompt?: (id: string, key: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpload) return;
    const MAX_SIZE = 10 * 1024 * 1024;
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
      onUpload(sceneId, viewKey, base64);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div
      style={{ textAlign: "center", position: "relative" }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div
        style={{
          width: 100,
          height: 60,
          background: "#252535",
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          border: viewStatus === "approved"
            ? "2px solid #4ade80"
            : viewStatus === "rejected"
              ? "2px solid #f87171"
              : isGenerating && !url
                ? "1px solid rgba(240, 192, 64, 0.5)"
                : "1px solid #333",
          animation: isGenerating && !url ? "pulse-border 1.5s ease-in-out infinite" : undefined,
          position: "relative",
        }}
      >
        {url ? (
          <img src={url} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : isGenerating ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{
              width: 18, height: 18, borderRadius: "50%",
              border: "2px solid #333", borderTopColor: "#f0c040",
              animation: "spin 0.8s linear infinite",
            }} />
            <span style={{ color: "#f0c040", fontSize: 9 }}>生成中</span>
          </div>
        ) : (
          <span style={{ color: "#444", fontSize: 10 }}>?</span>
        )}

        {/* 悬停操作 */}
        {isHovered && url && !locked && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.75)",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              padding: 2,
            }}
          >
            {viewStatus !== "approved" && onApprove && (
              <button onClick={() => onApprove(sceneId, viewKey)} style={actionBtnStyle("#4ade80")}>
                通过
              </button>
            )}
            {onRegenerate && (
              <button onClick={() => onRegenerate(sceneId, viewKey)} style={actionBtnStyle("#f0c040")}>
                重生
              </button>
            )}
            {onUpload && (
              <button onClick={() => fileRef.current?.click()} style={actionBtnStyle("#60a5fa")}>
                替换
              </button>
            )}
          </div>
        )}
      </div>
      <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>
        {label}
        {viewStatus === "approved" && <span style={{ color: "#4ade80", marginLeft: 2 }}></span>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileChange} />
    </div>
  );
}
