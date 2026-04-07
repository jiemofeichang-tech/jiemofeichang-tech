"use client";

import { useState, type ReactNode } from "react";
import { type TaskRecord } from "@/lib/api";

interface ProjectsRowProps {
  history: TaskRecord[];
  onOpenProjects: () => void;
}

export default function ProjectsRow({ history, onOpenProjects }: ProjectsRowProps) {
  const recent = history.slice(0, 8);

  return (
    <section className="home-content-section" data-home-section="projects">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          marginBottom: 24,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div className="section-eyebrow">最近项目</div>
          <h2 style={{ marginTop: 12, fontSize: 30, fontWeight: 650, letterSpacing: "-0.03em", color: "var(--text-primary)" }}>
            从灵感到成片的最近尝试
          </h2>
        </div>

        <button
          type="button"
          onClick={onOpenProjects}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 18px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.04)",
            color: "var(--text-secondary)",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          查看全部项目
          <ArrowIcon />
        </button>
      </div>

      {recent.length === 0 ? (
        <EmptyState onOpenProjects={onOpenProjects} />
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

function EmptyState({ onOpenProjects }: { onOpenProjects: () => void }) {
  return (
    <div
      style={{
        borderRadius: 28,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.03)",
        padding: "52px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 22,
          background: "linear-gradient(180deg, rgba(130,182,255,0.18), rgba(130,182,255,0.08))",
          border: "1px solid rgba(130,182,255,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--accent-hot-pink)",
        }}
      >
        <TrayIcon />
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>还没有项目历史</div>
      <p style={{ maxWidth: 380, fontSize: 13, lineHeight: 1.8, color: "var(--text-muted)" }}>
        从上方输入灵感，或者直接创建一个工作流项目。这里会承接你最近的尝试和生成结果。
      </p>
      <button
        type="button"
        onClick={onOpenProjects}
        style={{
          marginTop: 4,
          padding: "12px 18px",
          borderRadius: 999,
          border: "1px solid rgba(130,182,255,0.2)",
          background: "linear-gradient(180deg, rgba(130,182,255,0.28), rgba(77,132,255,0.14))",
          color: "white",
          fontSize: 14,
          fontWeight: 650,
        }}
      >
        进入项目区
      </button>
    </div>
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
        width: 320,
        borderRadius: 28,
        overflow: "hidden",
        textAlign: "left",
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.03)",
        boxShadow: hovered ? "0 24px 54px rgba(0,0,0,0.22)" : "none",
        transition: "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease",
        transform: hovered ? "translateY(-2px)" : "none",
      }}
    >
      <div
        style={{
          position: "relative",
          height: 196,
          overflow: "hidden",
          background:
            "radial-gradient(circle at top right, rgba(130,182,255,0.18), transparent 28%), linear-gradient(180deg, rgba(18,22,34,0.96), rgba(11,14,21,0.94))",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, rgba(255,255,255,0.06), transparent 36%)",
          }}
        />

        <div
          style={{
            position: "absolute",
            top: 18,
            left: 18,
            padding: "8px 12px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.05)",
            fontSize: 11,
            fontWeight: 600,
            color: hasVideo ? "var(--accent-yellow)" : "var(--text-secondary)",
          }}
        >
          {hasVideo ? "已完成" : status}
        </div>

        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {hasVideo ? (
            <div
              style={{
                width: 76,
                height: 76,
                borderRadius: 28,
                background: "linear-gradient(180deg, rgba(130,182,255,0.32), rgba(77,132,255,0.16))",
                border: "1px solid rgba(130,182,255,0.18)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                boxShadow: "0 18px 40px rgba(77,132,255,0.18)",
              }}
            >
              <PlayIcon />
            </div>
          ) : (
            <div style={{ fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)" }}>
              Draft in progress
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "18px 18px 20px" }}>
        <div style={{ fontSize: 17, fontWeight: 600, color: "var(--text-primary)" }}>
          {task.title || "未命名项目"}
        </div>
        <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.7, color: "var(--text-muted)" }}>
          {task.created_at || task.tracked_at || "等待生成时间"}
        </div>
      </div>
    </button>
  );
}

function BaseIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function ArrowIcon() {
  return (
    <BaseIcon>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </BaseIcon>
  );
}

function TrayIcon() {
  return (
    <BaseIcon>
      <path d="M4 14h4l2 3h4l2-3h4" />
      <path d="M5 5h14l1 9H4z" />
    </BaseIcon>
  );
}

function PlayIcon() {
  return (
    <BaseIcon>
      <path d="m9 7 8 5-8 5z" />
    </BaseIcon>
  );
}
