"use client";

import { useState } from "react";
import { type TaskRecord } from "@/lib/api";

interface ProjectsRowProps {
  history: TaskRecord[];
}

export default function ProjectsRow({ history }: ProjectsRowProps) {
  const recent = history.slice(0, 8);

  if (recent.length === 0) return null;

  return (
    <section style={{ width: "100%", maxWidth: 1400, margin: "48px auto 0", padding: "0 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22, color: "var(--accent-pink)" }}>✦</span>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>我的项目</h2>
        </div>
        <span style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", cursor: "pointer" }}>查看全部 →</span>
      </div>

      <div style={{ display: "flex", gap: 20, overflowX: "auto", paddingBottom: 8 }}>
        {recent.map((task) => (
          <ProjectCard key={task.id} task={task} />
        ))}
      </div>
    </section>
  );
}

function ProjectCard({ task }: { task: TaskRecord }) {
  const [hovered, setHovered] = useState(false);
  const status = task.status || "idle";
  const hasVideo = status === "succeeded";

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flexShrink: 0, width: 280, borderRadius: 12, overflow: "hidden",
        cursor: "pointer", transition: "all 0.2s",
        transform: hovered ? "translateY(-2px)" : "none",
      }}
    >
      <div style={{
        width: "100%", height: 160, backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 12,
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)",
        transition: "border-color 0.2s", position: "relative",
        background: hasVideo ? "linear-gradient(135deg, #2e1a3d, #5a2080)" : undefined,
      }}>
        {hasVideo ? (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="rgba(255,255,255,0.5)"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        ) : (
          <span style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.15)", fontFamily: "'Poppins', sans-serif", letterSpacing: 1 }}>OiiOii</span>
        )}
      </div>

      <div style={{ padding: "10px 4px" }}>
        <h3 style={{
          fontSize: 16, fontWeight: 500,
          color: "rgba(255,255,255,0.9)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {task.title || "未命名项目"}
        </h3>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
          {task.created_at || task.tracked_at}
        </p>
      </div>
    </div>
  );
}
