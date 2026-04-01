"use client";
import type { WorkflowStage, StageStatus } from "@/lib/store";

interface StageIndicatorProps {
  currentStage: WorkflowStage;
  onStageChange: (stage: WorkflowStage) => void;
  stageStatuses?: Record<WorkflowStage, StageStatus>;
}

const STAGES: { id: WorkflowStage; label: string; icon: string }[] = [
  { id: "script", label: "剧本", icon: "1" },
  { id: "style", label: "风格", icon: "2" },
  { id: "character", label: "角色", icon: "3" },
  { id: "storyboard", label: "分镜", icon: "4" },
  { id: "video", label: "视频", icon: "5" },
  { id: "post", label: "后期", icon: "6" },
];

const STATUS_STYLES: Record<StageStatus, { bg: string; color: string; borderColor: string; icon?: string }> = {
  locked: { bg: "#333", color: "#555", borderColor: "transparent" },
  active: { bg: "#2563eb", color: "#60a5fa", borderColor: "#2563eb" },
  generating: { bg: "#f59e0b", color: "#fbbf24", borderColor: "#f59e0b" },
  review: { bg: "#059669", color: "#4ade80", borderColor: "#4ade80" },
  confirmed: { bg: "#4ade80", color: "#4ade80", borderColor: "transparent" },
};

export default function StageIndicator({ currentStage, onStageChange, stageStatuses }: StageIndicatorProps) {
  const currentIndex = STAGES.findIndex((s) => s.id === currentStage);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {STAGES.map((stage, i) => {
        const status = stageStatuses?.[stage.id];
        const isActive = stage.id === currentStage;
        const isPast = i < currentIndex;

        // 如果有 stageStatuses 则用精确状态，否则向后兼容
        const ss = status ? STATUS_STYLES[status] : null;
        const isLocked = status === "locked";
        const isConfirmed = status === "confirmed";
        const isGenerating = status === "generating";
        const isReview = status === "review";

        const circleBg = ss ? ss.bg : (isActive ? "#7c3aed" : isPast ? "#4ade80" : "#333");
        const textColor = ss ? ss.color : (isActive ? "#c084fc" : isPast ? "#4ade80" : "#666");
        const borderCol = ss ? ss.borderColor : (isActive ? "#7c3aed" : "transparent");

        const circleIcon = isConfirmed ? "\u2713" : isGenerating ? "⏳" : isReview ? "👁" : (isPast && !ss ? "\u2713" : stage.icon);

        return (
          <div key={stage.id} style={{ display: "flex", alignItems: "center" }}>
            <button
              onClick={() => !isLocked && onStageChange(stage.id)}
              disabled={isLocked}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 12px",
                borderRadius: 16,
                border: `1px solid ${borderCol}`,
                background: isActive ? `${circleBg}22` : "transparent",
                color: textColor,
                fontSize: 12,
                fontWeight: isActive ? 600 : 400,
                cursor: isLocked ? "not-allowed" : "pointer",
                transition: "all 0.2s",
                opacity: isLocked ? 0.5 : 1,
                animation: isGenerating ? "pulse 1.5s ease-in-out infinite" : isReview ? "glow 2s ease-in-out infinite" : "none",
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: circleBg,
                  color: "#fff",
                  fontSize: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {circleIcon}
              </span>
              {stage.label}
            </button>
            {i < STAGES.length - 1 && (
              <div style={{ width: 16, height: 1, background: isConfirmed || isPast ? "#4ade80" : "#333" }} />
            )}
          </div>
        );
      })}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(74,222,128,0); }
          50% { box-shadow: 0 0 8px 2px rgba(74,222,128,0.3); }
        }
      `}</style>
    </div>
  );
}
