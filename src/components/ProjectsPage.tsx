"use client";

import { useState } from "react";
import { queryTask, saveToLibrary, deleteTask, toggleFavorite, type TaskRecord } from "@/lib/api";

interface ProjectsPageProps {
  history: TaskRecord[];
  onRefresh: () => void;
}

export default function ProjectsPage({ history, onRefresh }: ProjectsPageProps) {
  const [tab, setTab] = useState<"all" | "favorites">("all");
  const [search, setSearch] = useState("");

  const filtered = history.filter((t) => {
    const matchSearch = (t.title || t.id).toLowerCase().includes(search.toLowerCase());
    const matchTab = tab === "all" || (tab === "favorites" && (t as TaskRecord & { favorite?: boolean }).favorite);
    return matchSearch && matchTab;
  });

  return (
    <div style={{ padding: "32px 40px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", marginBottom: 20 }}>我的项目</h1>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {(["all", "favorites"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "6px 16px", borderRadius: 20, fontSize: 13, fontWeight: 500,
                color: tab === t ? "var(--text-primary)" : "rgba(255,255,255,0.4)",
                backgroundColor: tab === t ? "rgba(255,255,255,0.08)" : "transparent",
              }}
            >
              {t === "all" ? "全部" : "我的收藏"}
            </button>
          ))}
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "6px 14px",
          borderRadius: 8, backgroundColor: "transparent",
          border: "1px solid rgba(255,255,255,0.06)", width: 220,
        }}>
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索项目名称"
            style={{ flex: 1, backgroundColor: "transparent", border: "none", outline: "none", color: "var(--text-primary)", fontSize: 13 }}
          />
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: 20,
      }}>
        {/* New Project Card */}
        <NewProjectCard />

        {filtered.length === 0 && history.length === 0 ? null : (
          filtered.map((task) => (
            <ProjectCard key={task.id} task={task} onRefresh={onRefresh} />
          ))
        )}
      </div>

      {filtered.length === 0 && history.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.3)", fontSize: 14 }}>
          暂无任务记录，请先在首页创建任务
        </div>
      )}
    </div>
  );
}

function NewProjectCard() {
  return (
    <div style={{ cursor: "pointer" }}>
      <div style={{
        width: "100%", aspectRatio: "4/3", borderRadius: 12,
        border: "1px dashed rgba(255,255,255,0.15)",
        backgroundColor: "rgba(255,255,255,0.02)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 8, transition: "all 0.2s",
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          backgroundColor: "rgba(255,255,255,0.08)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </div>
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>新建项目</span>
      </div>
    </div>
  );
}

function ProjectCard({ task, onRefresh }: { task: TaskRecord; onRefresh: () => void }) {
  const [hovered, setHovered] = useState(false);
  const status = task.status || "idle";
  const hasVideo = task.status === "succeeded" && (task.content?.video_url || task._proxy?.videoUrls?.[0]);

  const handleQuery = async () => {
    try { await queryTask(task.id); onRefresh(); } catch (err) { alert((err as Error).message); }
  };

  const handleSave = async () => {
    try { await saveToLibrary(task.id); onRefresh(); } catch (err) { alert((err as Error).message); }
  };

  const handleDelete = async () => {
    if (!confirm("确定删除此任务？（可在回收站恢复）")) return;
    try { await deleteTask(task.id); onRefresh(); } catch (err) { alert((err as Error).message); }
  };

  const handleFavorite = async () => {
    try { await toggleFavorite(task.id); onRefresh(); } catch (err) { alert((err as Error).message); }
  };

  const isFavorite = (task as TaskRecord & { favorite?: boolean }).favorite;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ cursor: "pointer", transition: "all 0.2s", transform: hovered ? "translateY(-2px)" : "none" }}
    >
      {/* Thumbnail */}
      <div style={{
        width: "100%", aspectRatio: "4/3", borderRadius: 12, overflow: "hidden",
        backgroundColor: "rgba(255,255,255,0.03)",
        border: `1px solid ${hovered ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: hasVideo ? "linear-gradient(135deg, #1a2e3d, #2e1a3d)" : undefined,
        position: "relative", transition: "border-color 0.2s",
      }}>
        {hasVideo ? (
          <svg width="32" height="32" viewBox="0 0 24 24" fill="rgba(255,255,255,0.5)"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.12)", fontFamily: "'Poppins', sans-serif" }}>OiiOii</span>
        )}

        {/* Action buttons on hover */}
        {hovered && (
          <div style={{ position: "absolute", bottom: 6, right: 6, display: "flex", gap: 4 }}>
            {!["succeeded", "failed", "cancelled"].includes(status) && (
              <MiniBtn label="查询" onClick={handleQuery} />
            )}
            {status === "succeeded" && !task.local_asset && (
              <MiniBtn label="保存" onClick={handleSave} />
            )}
            <MiniBtn label={isFavorite ? "取消收藏" : "收藏"} onClick={handleFavorite} />
            <MiniBtn label="删除" onClick={handleDelete} />
          </div>
        )}

        {isFavorite && (
          <span style={{ position: "absolute", top: 6, left: 6, fontSize: 12, color: "#ffd700" }}>&#9733;</span>
        )}
        {task.local_asset && (
          <span style={{ position: "absolute", top: 6, right: 6, fontSize: 10, color: "var(--accent-green)", padding: "1px 6px", borderRadius: 4, backgroundColor: "rgba(0,204,153,0.15)" }}>已保存</span>
        )}
      </div>

      {/* Title & Date */}
      <div style={{ padding: "8px 2px 0" }}>
        <h3 style={{
          fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.9)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {task.title || "未命名项目"}
        </h3>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
          {task.created_at || task.tracked_at}
        </p>
      </div>
    </div>
  );
}

function MiniBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 500,
        color: "#fff", backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
        border: "1px solid rgba(255,255,255,0.2)",
      }}
    >
      {label}
    </button>
  );
}
