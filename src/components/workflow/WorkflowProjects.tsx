"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { wfListProjects, wfDeleteProject, type WfProjectSummary } from "@/lib/api";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: "草稿", color: "#666" },
  scripting: { label: "剧本分析", color: "#f0c040" },
  designing: { label: "角色设计", color: "#c084fc" },
  storyboarding: { label: "分镜生成", color: "#38bdf8" },
  filming: { label: "视频生成", color: "#4ade80" },
  post: { label: "后期制作", color: "#fb923c" },
  done: { label: "已完成", color: "#22c55e" },
};

export default function WorkflowProjects() {
  const router = useRouter();
  const [projects, setProjects] = useState<WfProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    wfListProjects()
      .then((res) => setProjects(res.projects))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("确定删除此项目？")) return;
    try {
      await wfDeleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch {
      // ignore
    }
  };

  return (
    <div style={{ padding: "20px 0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#c084fc", fontSize: 16 }}>&#x1F3AC;</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#e0e0e0" }}>AI漫剧工作流</span>
        </div>
        <button
          onClick={() => router.push("/workflow/new")}
          style={{
            padding: "6px 16px",
            borderRadius: 8,
            border: "1px solid #7c3aed",
            background: "rgba(124,58,237,0.15)",
            color: "#c084fc",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + 新建漫剧
        </button>
      </div>

      {loading ? (
        <div style={{ color: "#666", fontSize: 13, textAlign: "center", padding: 20 }}>加载中...</div>
      ) : projects.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: 40,
            background: "#1a1a2a",
            borderRadius: 12,
            border: "1px dashed #333",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>&#x1F3AC;</div>
          <div style={{ color: "#888", fontSize: 13, marginBottom: 16 }}>还没有漫剧项目，点击上方按钮创建第一个</div>
          <button
            onClick={() => router.push("/workflow/new")}
            style={{
              padding: "8px 24px",
              borderRadius: 8,
              border: "none",
              background: "#7c3aed",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            开始创作
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {/* New project card */}
          <div
            onClick={() => router.push("/workflow/new")}
            style={{
              background: "#1a1a2a",
              borderRadius: 12,
              border: "2px dashed #333",
              padding: 20,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 120,
              cursor: "pointer",
              transition: "border-color 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#7c3aed")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#333")}
          >
            <span style={{ fontSize: 28, color: "#555" }}>+</span>
            <span style={{ fontSize: 12, color: "#666", marginTop: 4 }}>新建漫剧</span>
          </div>

          {/* Existing projects */}
          {projects.map((proj) => {
            const st = STATUS_MAP[proj.status] || STATUS_MAP.draft;
            return (
              <div
                key={proj.id}
                onClick={() => router.push(`/workflow/${proj.id}`)}
                style={{
                  background: "#1e1e2e",
                  borderRadius: 12,
                  border: "1px solid #2a2a3a",
                  padding: 16,
                  cursor: "pointer",
                  transition: "border-color 0.2s",
                  position: "relative",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#7c3aed")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2a2a3a")}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#e0e0e0", marginBottom: 6 }}>
                    {proj.title || "未命名项目"}
                  </div>
                  <button
                    onClick={(e) => handleDelete(proj.id, e)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#555",
                      fontSize: 14,
                      cursor: "pointer",
                      padding: "0 4px",
                    }}
                    title="删除项目"
                  >
                    &times;
                  </button>
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "1px 8px",
                      borderRadius: 8,
                      background: `${st.color}22`,
                      color: st.color,
                    }}
                  >
                    {st.label}
                  </span>
                  {proj.genre && (
                    <span
                      style={{
                        fontSize: 11,
                        padding: "1px 8px",
                        borderRadius: 8,
                        background: "#252535",
                        color: "#888",
                      }}
                    >
                      {proj.genre}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "#555" }}>
                  {proj.character_count > 0 && `${proj.character_count}个角色 `}
                  {proj.episode_count > 0 && `${proj.episode_count}集 `}
                  {proj.updated_at && `· ${proj.updated_at}`}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
