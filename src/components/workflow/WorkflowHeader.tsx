"use client";
import { useState } from "react";
import type { WorkflowStage } from "@/lib/store";
import StageIndicator from "./StageIndicator";
import AiConfigDialog from "./AiConfigDialog";

interface WorkflowHeaderProps {
  projectTitle: string;
  projectStatus: string;
  currentStage: WorkflowStage;
  onStageChange: (stage: WorkflowStage) => void;
  onBack: () => void;
  onTitleChange?: (title: string) => void;
}

export default function WorkflowHeader({
  projectTitle,
  projectStatus,
  currentStage,
  onStageChange,
  onBack,
  onTitleChange,
}: WorkflowHeaderProps) {
  const [configOpen, setConfigOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(projectTitle);

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 16px",
          borderBottom: "1px solid #2a2a3a",
          background: "#13131d",
          height: 48,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={onBack}
            style={{
              background: "transparent",
              border: "none",
              color: "#888",
              fontSize: 18,
              cursor: "pointer",
              padding: "4px 8px",
            }}
            title="返回项目列表"
          >
            &larr;
          </button>
          {editing ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => { setEditing(false); onTitleChange?.(title); }}
            onKeyDown={(e) => { if (e.key === "Enter") { setEditing(false); onTitleChange?.(title); } }}
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#e0e0e0",
              background: "#252535",
              border: "1px solid #7c3aed",
              borderRadius: 6,
              padding: "2px 8px",
              outline: "none",
              width: 200,
            }}
          />
        ) : (
          <span
            onClick={() => setEditing(true)}
            style={{ fontSize: 14, fontWeight: 600, color: "#e0e0e0", cursor: "pointer" }}
            title="点击编辑项目名"
          >
            {projectTitle || "新项目"}
          </span>
        )}
          <span
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 10,
              background: "#252535",
              color: "#888",
            }}
          >
            {projectStatus}
          </span>
        </div>

        <StageIndicator currentStage={currentStage} onStageChange={onStageChange} />

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setConfigOpen(true)}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid #333",
              background: "transparent",
              color: "#888",
              fontSize: 11,
              cursor: "pointer",
            }}
            title="AI 模型配置"
          >
            AI配置
          </button>
        </div>
      </div>

      <AiConfigDialog open={configOpen} onClose={() => setConfigOpen(false)} />
    </>
  );
}
