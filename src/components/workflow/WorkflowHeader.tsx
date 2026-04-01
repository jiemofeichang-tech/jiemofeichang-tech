"use client";
import { useState, useEffect, useRef } from "react";
import type { WorkflowStage, StageStatus } from "@/lib/store";
import StageIndicator from "./StageIndicator";
import AiConfigDialog from "./AiConfigDialog";

interface WorkflowHeaderProps {
  projectTitle: string;
  projectStatus: string;
  currentStage: WorkflowStage;
  onStageChange: (stage: WorkflowStage) => void;
  onBack: () => void;
  onTitleChange?: (title: string) => void;
  stageStatuses?: Record<WorkflowStage, StageStatus>;
  workflowMode?: "interactive" | "auto";
}

export default function WorkflowHeader({
  projectTitle,
  projectStatus,
  currentStage,
  onStageChange,
  onBack,
  onTitleChange,
  stageStatuses,
  workflowMode,
}: WorkflowHeaderProps) {
  const [configOpen, setConfigOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(projectTitle);
  const savedRef = useRef(false);  // 防止 onBlur + Enter 双重触发

  // 同步 prop 变化
  useEffect(() => { setTitle(projectTitle); }, [projectTitle]);

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
            onBlur={() => {
              if (!savedRef.current) { onTitleChange?.(title); }
              savedRef.current = false;
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                savedRef.current = true;
                onTitleChange?.(title);
                setEditing(false);
              }
            }}
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
            {{ draft: "草稿", script_parsed: "剧本已解析", assets_locked: "资产已锁定", storyboard_done: "分镜完成", video_done: "视频完成", compositing: "合成中", done: "已完成" }[projectStatus] || projectStatus}
          </span>
        </div>

        <StageIndicator currentStage={currentStage} onStageChange={onStageChange} stageStatuses={stageStatuses} />

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
