"use client";

import { useEffect, useRef, useCallback } from "react";
import { queryTask, saveToLibrary, extractVideoUrl, extractTaskCost, deriveProgress, type TaskRecord } from "@/lib/api";

interface TaskProgressProps {
  task: TaskRecord | null;
  onTaskUpdated: (task: TaskRecord) => void;
}

const POLL_INTERVAL = 6000;
const STAGES = ["创建", "排队", "生成", "完成"];

export default function TaskProgress({ task, onTaskUpdated }: TaskProgressProps) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isActive = task?.status && !["succeeded", "failed", "cancelled"].includes(task.status);

  const poll = useCallback(async () => {
    if (!task?.id) return;
    try {
      const updated = await queryTask(task.id);
      onTaskUpdated(updated);
    } catch {
      // ignore poll errors
    }
  }, [task?.id, onTaskUpdated]);

  useEffect(() => {
    if (isActive) {
      timerRef.current = setInterval(poll, POLL_INTERVAL);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, poll]);

  if (!task) return null;

  const videoUrl = extractVideoUrl(task);
  const cost = extractTaskCost(task);
  const progress = deriveProgress(task);
  const isFailed = task.status === "failed";
  const isSucceeded = task.status === "succeeded";
  const localAsset = task.local_asset;

  const handleSave = async () => {
    try {
      const result = await saveToLibrary(task.id);
      onTaskUpdated(result.task);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleQuery = async () => {
    try {
      const updated = await queryTask(task.id);
      onTaskUpdated(updated);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <div style={{
      width: "100%", maxWidth: 680, margin: "16px auto 0",
      backgroundColor: "var(--bg-card)", border: "1px solid var(--border)",
      borderRadius: 4, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 16px", borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StatusBadge status={task.status || "idle"} />
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            {task.title || task.id}
          </span>
        </div>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{cost}</span>
      </div>

      {/* Progress bar */}
      <div style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{progress.label}</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{progress.percent}%</span>
        </div>
        <div style={{ height: 4, backgroundColor: "var(--bg-hover)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 2, transition: "width 0.5s ease",
            width: `${progress.percent}%`,
            backgroundColor: isFailed ? "#ef4444" : isSucceeded ? "#22c55e" : "var(--accent-orange)",
          }} />
        </div>

        {/* Stage dots */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
          {STAGES.map((s, i) => (
            <div key={s} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                backgroundColor: i <= progress.stage
                  ? (isFailed && i === STAGES.length - 1 ? "#ef4444" : "var(--accent-orange)")
                  : "var(--border)",
                transition: "background-color 0.3s",
              }} />
              <span style={{ fontSize: 10, color: i <= progress.stage ? "var(--text-secondary)" : "var(--text-muted)" }}>{s}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Video player */}
      {isSucceeded && videoUrl && (
        <div style={{ padding: "0 16px 12px" }}>
          <video
            src={localAsset?.local_url || videoUrl}
            controls
            autoPlay
            loop
            style={{
              width: "100%", borderRadius: 8,
              backgroundColor: "#000", maxHeight: 360,
            }}
          />
        </div>
      )}

      {/* Error message */}
      {isFailed && (
        <div style={{ padding: "0 16px 12px", color: "#ef4444", fontSize: 13 }}>
          生成失败，请检查参数后重试。
        </div>
      )}

      {/* Actions */}
      <div style={{
        display: "flex", gap: 8, padding: "8px 16px 12px",
        borderTop: "1px solid var(--border)", flexWrap: "wrap",
      }}>
        <ActionBtn label="刷新状态" onClick={handleQuery} />
        {isSucceeded && !localAsset && (
          <ActionBtn label="保存到本地" onClick={handleSave} accent />
        )}
        {localAsset && (
          <ActionBtn label="下载视频" onClick={() => window.open(localAsset.download_url, "_blank")} accent />
        )}
        {videoUrl && (
          <ActionBtn label="远程链接" onClick={() => window.open(videoUrl, "_blank")} />
        )}
        {localAsset && (
          <span style={{ fontSize: 11, color: "var(--accent-green)", display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
            已保存到本地
          </span>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    idle: "var(--text-muted)",
    created: "var(--accent-blue)",
    queued: "var(--accent-yellow)",
    pending: "var(--accent-yellow)",
    running: "var(--accent-orange)",
    succeeded: "#22c55e",
    failed: "#ef4444",
    cancelled: "var(--text-muted)",
  };
  const labelMap: Record<string, string> = {
    idle: "等待", created: "已创建", queued: "排队中", pending: "准备中",
    running: "生成中", succeeded: "成功", failed: "失败", cancelled: "已取消",
  };
  const color = colorMap[status] || "var(--text-muted)";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600,
      color, backgroundColor: `${color}18`, border: `1px solid ${color}30`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: color }} />
      {labelMap[status] || status}
    </span>
  );
}

function ActionBtn({ label, onClick, accent }: { label: string; onClick: () => void; accent?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 500,
        color: accent ? "#fff" : "var(--text-secondary)",
        backgroundColor: accent ? "var(--accent-orange)" : "var(--bg-hover)",
        border: accent ? "none" : "1px solid var(--border)",
        transition: "all 0.2s",
      }}
    >
      {label}
    </button>
  );
}
