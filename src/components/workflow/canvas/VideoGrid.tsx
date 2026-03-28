"use client";
import { useState, useEffect, useCallback } from "react";
import type { WfEpisode, WfShot } from "@/lib/api";
import { queryTask, deriveProgress } from "@/lib/api";
import CanvasBlock from "./CanvasBlock";

interface VideoGridProps {
  episodes: WfEpisode[];
  onEditShot: (episodeId: string, shotId: string) => void;
  onRegenerateVideo: (episodeId: string, shotId: string) => void;
}

function VideoCard({
  shot,
  index,
  onEdit,
  onRegenerate,
}: {
  shot: WfShot;
  index: number;
  onEdit: () => void;
  onRegenerate: () => void;
}) {
  const [progress, setProgress] = useState<{ percent: number; label: string } | null>(null);

  const pollTask = useCallback(async () => {
    if (!shot.video_task_id) return;
    try {
      const task = await queryTask(shot.video_task_id);
      const p = deriveProgress(task);
      setProgress(p);
    } catch {
      // ignore poll errors
    }
  }, [shot.video_task_id]);

  useEffect(() => {
    if (!shot.video_task_id || shot.status === "done" || shot.status === "failed") return;
    pollTask();
    const interval = setInterval(pollTask, 6000);
    return () => clearInterval(interval);
  }, [shot.video_task_id, shot.status, pollTask]);

  const hasVideo = shot.video_url || shot.video_local_path;

  return (
    <div style={{ background: "#252535", borderRadius: 8, overflow: "hidden", width: 200, flexShrink: 0 }}>
      <div
        style={{
          width: 200,
          height: 112,
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
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            controls
            preload="metadata"
          />
        ) : shot.video_task_id && progress ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#f0c040", marginBottom: 6 }}>{progress.label}</div>
            <div style={{ width: 120, height: 4, background: "#333", borderRadius: 2 }}>
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
        ) : (
          <span style={{ color: "#555", fontSize: 12 }}>待生成</span>
        )}
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
      </div>
      <div style={{ padding: 8 }}>
        <div style={{ fontSize: 11, color: "#ccc", marginBottom: 4 }}>
          {shot.raw_description.slice(0, 40)}...
        </div>
        <div style={{ display: "flex", gap: 4 }}>
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
    </div>
  );
}

export default function VideoGrid({ episodes, onEditShot, onRegenerateVideo }: VideoGridProps) {
  if (episodes.length === 0) {
    return (
      <CanvasBlock title="视频生成" status="pending">
        <p style={{ color: "#888", fontSize: 13 }}>完成分镜生成后，将逐帧生成视频片段。</p>
      </CanvasBlock>
    );
  }

  return (
    <>
      {episodes.map((ep) => (
        <CanvasBlock key={ep.id} title={`视频: ${ep.title}`} status={ep.shots.some((s) => s.video_url) ? "done" : "pending"}>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8 }}>
            {ep.shots.map((shot, i) => (
              <VideoCard
                key={shot.id}
                shot={shot}
                index={i}
                onEdit={() => onEditShot(ep.id, shot.id)}
                onRegenerate={() => onRegenerateVideo(ep.id, shot.id)}
              />
            ))}
          </div>
        </CanvasBlock>
      ))}
    </>
  );
}
