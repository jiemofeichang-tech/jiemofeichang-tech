"use client";
import { useState, useEffect } from "react";
import type { WfEpisode } from "@/lib/api";

interface EditEpisodeFormProps {
  episode: WfEpisode;
  onSave: (patch: Record<string, unknown>) => void;
  onAiOptimize: (currentData: string) => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", background: "#1a1a2a", border: "1px solid #333", borderRadius: 6,
  color: "#e0e0e0", fontSize: 12, padding: "6px 8px", outline: "none",
};

export default function EditEpisodeForm({ episode, onSave, onAiOptimize }: EditEpisodeFormProps) {
  const [title, setTitle] = useState(episode.title);

  useEffect(() => {
    setTitle(episode.title);
  }, [episode.id]);

  const totalShots = episode.shots.length;
  const doneShots = episode.shots.filter((s) => s.storyboard_image).length;
  const videoShots = episode.shots.filter((s) => s.video_url).length;

  return (
    <div>
      <Field label="分集标题">
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
      </Field>

      <div style={{ fontSize: 12, color: "#aaa", marginBottom: 12 }}>
        共 {totalShots} 个镜头 · {doneShots} 分镜已生成 · {videoShots} 视频已生成
      </div>

      {/* 镜头列表概览 */}
      <div style={{ fontSize: 12, fontWeight: 600, color: "#aaa", marginBottom: 8 }}>镜头列表</div>
      <div style={{ maxHeight: 300, overflowY: "auto" }}>
        {episode.shots.map((shot, i) => (
          <div
            key={shot.id}
            style={{
              padding: "6px 8px", marginBottom: 4, borderRadius: 6,
              background: i % 2 === 0 ? "#1a1a2a" : "transparent",
              fontSize: 11, color: "#ccc",
              display: "flex", gap: 8, alignItems: "center",
            }}
          >
            <span style={{ color: "#7c3aed", fontWeight: 600, minWidth: 25 }}>#{i + 1}</span>
            <span style={{ color: "#888", minWidth: 30 }}>{shot.shot_type}</span>
            <span style={{ color: "#666", minWidth: 25 }}>{shot.duration}s</span>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {shot.raw_description.slice(0, 40)}
            </span>
            <span>
              {shot.storyboard_image ? "🖼" : "⬜"}
              {shot.video_url ? "🎬" : "⬜"}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button onClick={() => onAiOptimize(JSON.stringify({ title, shots_count: totalShots }, null, 2))}
          style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #c084fc", background: "transparent", color: "#c084fc", fontSize: 12, cursor: "pointer" }}>
          💬 用AI优化
        </button>
        <button onClick={() => onSave({ title })}
          style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #555", background: "transparent", color: "#ccc", fontSize: 12, cursor: "pointer" }}>
          保存修改
        </button>
      </div>
    </div>
  );
}
