"use client";
import type { WorkflowStage } from "@/lib/store";

interface StageIndicatorProps {
  currentStage: WorkflowStage;
  onStageChange: (stage: WorkflowStage) => void;
}

const STAGES: { id: WorkflowStage; label: string; icon: string }[] = [
  { id: "script", label: "剧本", icon: "1" },
  { id: "character", label: "角色", icon: "2" },
  { id: "storyboard", label: "分镜", icon: "3" },
  { id: "video", label: "视频", icon: "4" },
  { id: "post", label: "后期", icon: "5" },
];

export default function StageIndicator({ currentStage, onStageChange }: StageIndicatorProps) {
  const currentIndex = STAGES.findIndex((s) => s.id === currentStage);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {STAGES.map((stage, i) => {
        const isActive = stage.id === currentStage;
        const isPast = i < currentIndex;
        return (
          <div key={stage.id} style={{ display: "flex", alignItems: "center" }}>
            <button
              onClick={() => onStageChange(stage.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 12px",
                borderRadius: 16,
                border: isActive ? "1px solid #7c3aed" : "1px solid transparent",
                background: isActive ? "#7c3aed22" : "transparent",
                color: isActive ? "#c084fc" : isPast ? "#4ade80" : "#666",
                fontSize: 12,
                fontWeight: isActive ? 600 : 400,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: isActive ? "#7c3aed" : isPast ? "#4ade80" : "#333",
                  color: "#fff",
                  fontSize: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {isPast ? "\u2713" : stage.icon}
              </span>
              {stage.label}
            </button>
            {i < STAGES.length - 1 && (
              <div style={{ width: 16, height: 1, background: isPast ? "#4ade80" : "#333" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
