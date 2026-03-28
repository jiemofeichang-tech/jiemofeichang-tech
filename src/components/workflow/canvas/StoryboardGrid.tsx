"use client";
import type { WfEpisode, WfShot } from "@/lib/api";
import CanvasBlock from "./CanvasBlock";

interface StoryboardGridProps {
  episodes: WfEpisode[];
  onEditShot: (episodeId: string, shotId: string) => void;
  onRegenerateShot: (episodeId: string, shotId: string) => void;
  selectedShotId: string | null;
}

function ShotCard({
  shot,
  index,
  onEdit,
  onRegenerate,
  isSelected,
}: {
  shot: WfShot;
  index: number;
  onEdit: () => void;
  onRegenerate: () => void;
  isSelected: boolean;
}) {
  return (
    <div
      style={{
        background: "#252535",
        borderRadius: 8,
        border: isSelected ? "2px solid #7c3aed" : "1px solid #333",
        overflow: "hidden",
        width: 160,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 160,
          height: 90,
          background: "#1a1a2a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {shot.storyboard_image ? (
          <img
            src={shot.storyboard_image}
            alt={`镜头${index + 1}`}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
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
          #{index + 1} {shot.shot_type}
        </div>
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
          {shot.duration}s
        </div>
      </div>
      <div style={{ padding: 8 }}>
        <div style={{ fontSize: 11, color: "#ccc", marginBottom: 4, lineHeight: 1.3 }}>
          {shot.raw_description.slice(0, 60)}
          {shot.raw_description.length > 60 ? "..." : ""}
        </div>
        {shot.dialogue && (
          <div style={{ fontSize: 10, color: "#888", fontStyle: "italic" }}>
            &ldquo;{shot.dialogue.slice(0, 30)}&rdquo;
          </div>
        )}
        <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
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

export default function StoryboardGrid({ episodes, onEditShot, onRegenerateShot, selectedShotId }: StoryboardGridProps) {
  if (episodes.length === 0) {
    return (
      <CanvasBlock title="分镜图" status="pending">
        <p style={{ color: "#888", fontSize: 13 }}>完成剧本分析和角色设计后，将自动生成分镜图。</p>
      </CanvasBlock>
    );
  }

  return (
    <>
      {episodes.map((ep) => (
        <CanvasBlock key={ep.id} title={`分镜: ${ep.title}`} status={ep.shots.some((s) => s.storyboard_image) ? "done" : "pending"}>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8 }}>
            {ep.shots.map((shot, i) => (
              <ShotCard
                key={shot.id}
                shot={shot}
                index={i}
                onEdit={() => onEditShot(ep.id, shot.id)}
                onRegenerate={() => onRegenerateShot(ep.id, shot.id)}
                isSelected={selectedShotId === shot.id}
              />
            ))}
          </div>
        </CanvasBlock>
      ))}
    </>
  );
}
