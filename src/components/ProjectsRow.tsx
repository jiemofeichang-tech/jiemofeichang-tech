"use client";

import { useState } from "react";
import { type TaskRecord } from "@/lib/api";

interface ProjectsRowProps {
  history: TaskRecord[];
  onOpenProjects: () => void;
}

export default function ProjectsRow({ history, onOpenProjects }: ProjectsRowProps) {
  const recent = history.slice(0, 8);

  return (
    <section className="home-content-section" data-home-section="projects">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 22, flexWrap: "wrap" }}>
        <div>
          <div className="section-eyebrow">最近项目</div>
          <h2 style={{ marginTop: 12, fontSize: 30, fontWeight: 700, color: "var(--text-primary)" }}>最近项目</h2>
        </div>

        <button
          type="button"
          onClick={onOpenProjects}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 18px",
            borderRadius: 4,
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            fontSize: 14,
            color: "var(--text-secondary)",
          }}
        >
          查看全部项目
          <span>→</span>
        </button>
      </div>

      {recent.length === 0 ? (
        <div
          style={{
            borderRadius: 16,
            border: "1px solid var(--border)",
            background: "var(--bg-card)",
            padding: "48px 24px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: 12,
          }}
        >
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-secondary)" }}>还没有项目历史</div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.7, maxWidth: 360 }}>
            在上方输入创意灵感，或创建工作流项目开始你的第一个作品
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 18, overflowX: "auto", paddingBottom: 8 }}>
          {recent.map((task) => (
            <ProjectCard key={task.id} task={task} onOpenProjects={onOpenProjects} />
          ))}
        </div>
      )}
    </section>
  );
}

function ProjectCard({ task, onOpenProjects }: { task: TaskRecord; onOpenProjects: () => void }) {
  const [hovered, setHovered] = useState(false);
  const status = task.status || "idle";
  const hasVideo = status === "succeeded";

  return (
    <button
      type="button"
      onClick={onOpenProjects}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flexShrink: 0,
        width: 300,
        borderRadius: 4,
        overflow: "hidden",
        transition: "transform 0.2s ease, border-color 0.2s ease",
        transform: hovered ? "translateY(-4px)" : "none",
        padding: 0,
        background: "transparent",
        textAlign: "left",
        border: "1px solid transparent",
      }}
    >
      <div
        style={{
          width: "100%",
          height: 182,
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          border: "1px solid var(--border)",
          position: "relative",
          background: "var(--bg-panel)",
          boxShadow: hovered ? "0 18px 42px rgba(2,8,23,0.26)" : "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "transparent",
          }}
        />
        {hasVideo ? (
          <div style={{ position: "relative", zIndex: 1, width: 62, height: 62, borderRadius: 4, background: "var(--accent-pink)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="7 5 19 12 7 19 7 5" />
            </svg>
          </div>
        ) : (
          <div style={{ position: "relative", zIndex: 1, fontSize: 14, color: "var(--text-muted)", letterSpacing: "0.18em", textTransform: "uppercase" }}>
            ◆ New Storyline
          </div>
        )}
      </div>

      <div style={{ padding: "14px 4px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {task.title || "未命名项目"}
          </h3>
          <span
            style={{
              flexShrink: 0,
              padding: "4px 8px",
              borderRadius: 2,
              fontSize: 11,
              color: hasVideo ? "var(--accent-yellow)" : "var(--text-muted)",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
            }}
          >
            {hasVideo ? "已完成" : status}
          </span>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>
          {task.created_at || task.tracked_at || "等待生成时间"}
        </p>
      </div>
    </button>
  );
}
