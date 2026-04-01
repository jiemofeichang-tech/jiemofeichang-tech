"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import type { WfEpisode, WfShot } from "@/lib/api";
import { queryTask, deriveProgress } from "@/lib/api";
import CanvasBlock from "./CanvasBlock";
import VideoLightbox from "@/components/ui/VideoLightbox";

/** 最大轮询次数（6s × 150 = 15 分钟） */
const MAX_POLL_COUNT = 150;

interface VideoGridProps {
  episodes: WfEpisode[];
  onEditShot: (episodeId: string, shotId: string) => void;
  onRegenerateVideo: (episodeId: string, shotId: string) => void;
  onApproveVideo?: (episodeId: string, shotId: string) => void;
}

// ── Camera Movement Labels ──

const CAMERA_LABELS: Record<string, string> = {
  static: "静止",
  push_in: "推进",
  push_in_slow: "慢推",
  pull_back: "拉远",
  pan_left: "左摇",
  pan_right: "右摇",
  orbit: "环绕",
  handheld: "手持",
  tilt_up: "上仰",
  crane_down: "下俯",
  auto: "自动",
};

// ── Single Video Card ──

function VideoCard({
  shot,
  index,
  onEdit,
  onRegenerate,
  onApprove,
}: {
  shot: WfShot;
  index: number;
  onEdit: () => void;
  onRegenerate: () => void;
  onApprove?: () => void;
}) {
  const [progress, setProgress] = useState<{ percent: number; label: string } | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const pollCountRef = useRef(0);
  const isApproved = shot.video_approved === true;

  const pollTask = useCallback(async () => {
    if (!shot.video_task_id) return;
    pollCountRef.current += 1;
    if (pollCountRef.current > MAX_POLL_COUNT) {
      setTimedOut(true);
      setProgress({ percent: 0, label: "轮询超时，请手动刷新" });
      return;
    }
    try {
      const task = await queryTask(shot.video_task_id);
      const p = deriveProgress(task);
      setProgress(p);
    } catch {
      // ignore poll errors
    }
  }, [shot.video_task_id]);

  // Reset poll count when task changes
  useEffect(() => {
    pollCountRef.current = 0;
    setTimedOut(false);
  }, [shot.video_task_id]);

  useEffect(() => {
    if (!shot.video_task_id || shot.status === "done" || shot.status === "failed" || timedOut) return;
    pollTask();
    const interval = setInterval(pollTask, 6000);
    return () => clearInterval(interval);
  }, [shot.video_task_id, shot.status, pollTask, timedOut]);

  const hasVideo = shot.video_url || shot.video_local_path;
  const cameraLabel = CAMERA_LABELS[shot.camera_movement] || shot.camera_movement || "";

  return (
    <div
      style={{
        background: isApproved ? "#1a2a25" : "#252535",
        borderRadius: 8,
        border: isApproved ? "1px solid #4ade80" : (shot.video_task_id && !hasVideo) ? "1px solid rgba(240, 192, 64, 0.5)" : "1px solid #333",
        animation: (shot.video_task_id && !hasVideo) ? "pulse-border 1.5s ease-in-out infinite" : undefined,
        overflow: "hidden",
        flex: "1 1 180px",
        minWidth: 150,
        maxWidth: 320,
        transition: "border-color 0.2s, background 0.2s",
      }}
    >
      {/* Video / Progress / Placeholder */}
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
        {hasVideo ? (
          <video
            src={shot.video_local_path || shot.video_url || ""}
            style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "pointer" }}
            onClick={(e) => {
              e.preventDefault();
              setPreviewSrc(shot.video_local_path || shot.video_url || "");
            }}
            preload="metadata"
          />
        ) : timedOut ? (
          <div style={{ textAlign: "center", padding: 8 }}>
            <div style={{ fontSize: 11, color: "#f87171", marginBottom: 4 }}>轮询超时 (&gt;15min)</div>
            <button
              onClick={() => { pollCountRef.current = 0; setTimedOut(false); }}
              style={{
                fontSize: 10, padding: "3px 10px", borderRadius: 4,
                border: "1px solid #f87171", background: "transparent",
                color: "#f87171", cursor: "pointer",
              }}
            >
              重试
            </button>
          </div>
        ) : shot.video_task_id && progress ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#f0c040", marginBottom: 6 }}>{progress.label}</div>
            <div style={{ width: 130, height: 4, background: "#333", borderRadius: 2 }}>
              <div
                style={{
                  width: `${progress.percent}%`,
                  height: "100%",
                  background: "#f0c040",
                  borderRadius: 2,
                  transition: "width 0.5s",
                }}
              />
            </div>
            <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>{progress.percent}%</div>
          </div>
        ) : shot.video_task_id ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%",
              border: "3px solid #333", borderTopColor: "#f0c040",
              animation: "spin 0.8s linear infinite",
            }} />
            <span style={{ color: "#f0c040", fontSize: 10 }}>准备中</span>
          </div>
        ) : (
          <span style={{ color: "#555", fontSize: 12 }}>待生成</span>
        )}

        {/* Shot number badge */}
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
          #{index + 1}
        </div>

        {/* Shot type + duration */}
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
          {shot.shot_type} · {shot.duration}s
        </div>

        {/* Camera movement */}
        {cameraLabel && (
          <div
            style={{
              position: "absolute",
              bottom: 4,
              left: 4,
              background: "rgba(0,0,0,0.7)",
              borderRadius: 4,
              padding: "1px 6px",
              fontSize: 9,
              color: "#7c9aed",
            }}
          >
            {cameraLabel}
          </div>
        )}

        {/* Approved badge */}
        {isApproved && (
          <div
            style={{
              position: "absolute",
              bottom: 4,
              right: 4,
              background: "#059669",
              borderRadius: 4,
              padding: "1px 6px",
              fontSize: 9,
              color: "#fff",
              fontWeight: 600,
            }}
          >
            已通过
          </div>
        )}
      </div>

      {/* Info + Actions */}
      <div style={{ padding: 8 }}>
        <div style={{ fontSize: 11, color: "#ccc", marginBottom: 4, lineHeight: 1.3 }}>
          {(shot.raw_description || "").slice(0, 45)}{(shot.raw_description || "").length > 45 ? "..." : ""}
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {onApprove && hasVideo && !isApproved && (
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
            onClick={onEdit}
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
              border: hasVideo ? "1px solid #444" : "1px solid #f0c040",
              background: hasVideo ? "transparent" : "rgba(240,192,64,0.12)",
              color: hasVideo ? "#aaa" : "#f0c040",
              cursor: "pointer",
              fontWeight: hasVideo ? undefined : 600,
            }}
          >
            {hasVideo ? "重生" : "生成"}
          </button>
        </div>
      </div>
      {previewSrc && <VideoLightbox src={previewSrc} onClose={() => setPreviewSrc(null)} />}
    </div>
  );
}

// ── Progress Bar ──

function VideoProgressBar({ episodes }: { episodes: WfEpisode[] }) {
  const allShots = episodes.flatMap((ep) => ep.shots);
  const total = allShots.length;
  const done = allShots.filter((s) => s.video_url || s.video_local_path).length;
  const approved = allShots.filter((s) => s.video_approved === true).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#aaa", marginBottom: 4 }}>
        <span>{done}/{total} 视频完成 · {approved} 已通过</span>
        <span>{pct}%</span>
      </div>
      <div style={{ height: 4, background: "#333", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "#4ade80", borderRadius: 2, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

// ── Main Grid ──

export default function VideoGrid({ episodes, onEditShot, onRegenerateVideo, onApproveVideo }: VideoGridProps) {
  if (episodes.length === 0) {
    return (
      <CanvasBlock title="视频生成" status="pending">
        <p style={{ color: "#888", fontSize: 13 }}>完成分镜生成后，将逐帧生成视频片段。</p>
      </CanvasBlock>
    );
  }

  return (
    <>
      <VideoProgressBar episodes={episodes} />
      {episodes.map((ep) => (
        <CanvasBlock
          key={ep.id}
          title={`视频: ${ep.title}`}
          status={ep.shots.some((s) => s.video_url) ? "done" : "pending"}
        >
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", paddingBottom: 8 }}>
            {ep.shots.map((shot, i) => (
              <VideoCard
                key={shot.id}
                shot={shot}
                index={i}
                onEdit={() => onEditShot(ep.id, shot.id)}
                onRegenerate={() => onRegenerateVideo(ep.id, shot.id)}
                onApprove={onApproveVideo ? () => onApproveVideo(ep.id, shot.id) : undefined}
              />
            ))}
          </div>
        </CanvasBlock>
      ))}
    </>
  );
}
