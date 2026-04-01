"use client";

import type { WorkflowStage } from "@/lib/store";

const NEXT_STAGE_LABELS: Record<WorkflowStage, string> = {
  script: "风格定调",
  style: "角色设计",
  character: "分镜生成",
  storyboard: "视频合成",
  video: "后期输出",
  post: "完成",
};

interface StageConfirmBarProps {
  stage: WorkflowStage;
  summary: string;
  onConfirm: () => void;
  onRegenerate?: () => void;
}

export default function StageConfirmBar({ stage, summary, onConfirm, onRegenerate }: StageConfirmBarProps) {
  const nextLabel = NEXT_STAGE_LABELS[stage];
  return (
    <div
      style={{
        background: "linear-gradient(135deg, #1a2e1a 0%, #1e1e2e 100%)",
        borderRadius: 12,
        border: "1px solid #4ade80",
        padding: "16px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#4ade80", marginBottom: 4 }}>
          ✅ 阶段完成
        </div>
        <div style={{ fontSize: 12, color: "#aaa" }}>{summary}</div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {onRegenerate && (
          <button
            onClick={onRegenerate}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid #555",
              background: "transparent",
              color: "#aaa",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            ← 重新生成
          </button>
        )}
        <button
          onClick={onConfirm}
          style={{
            padding: "8px 20px",
            borderRadius: 8,
            border: "none",
            background: "#4ade80",
            color: "#111",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          确认，进入{nextLabel} →
        </button>
      </div>
    </div>
  );
}
