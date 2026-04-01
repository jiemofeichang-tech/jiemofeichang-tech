"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CreateProjectDialog from "@/components/workflow/CreateProjectDialog";
import { useWorkflowStore } from "@/lib/store";
import { wfDeleteProject, wfListProjects, type WfProjectSummary } from "@/lib/api";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: "草稿", color: "#94a3b8" },
  configured: { label: "已配置", color: "#cbd5f5" },
  scripting: { label: "脚本分析中", color: "#f2c96d" },
  script_parsed: { label: "脚本已解析", color: "#53d8bd" },
  designing: { label: "角色设计", color: "#c4b5fd" },
  assets_locked: { label: "资产锁定", color: "#99a7ff" },
  storyboarding: { label: "分镜生成", color: "#7dd3fc" },
  filming: { label: "视频生成", color: "#53d8bd" },
  compositing: { label: "合成中", color: "#fb923c" },
  post: { label: "后期制作", color: "#fb923c" },
  done: { label: "已完成", color: "#22c55e" },
};

export default function WorkflowProjects() {
  const router = useRouter();
  const [projects, setProjects] = useState<WfProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const { createProject } = useWorkflowStore();

  const handleCreate = async (title: string, rawInput: string, referenceImages: string[]) => {
    const projectId = await createProject(title || "新漫剧项目", rawInput, referenceImages.length > 0 ? referenceImages : undefined);
    setShowCreate(false);
    router.push(`/workflow/${projectId}`);
  };

  useEffect(() => {
    wfListProjects()
      .then((res) => setProjects(res.projects))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("确定删除这个项目吗？")) return;

    try {
      await wfDeleteProject(id);
      setProjects((prev) => prev.filter((item) => item.id !== id));
    } catch {
      // ignore
    }
  };

  return (
    <section id="workflow-section" className="home-content-section" data-home-section="workflow">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 22, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 30, fontWeight: 700, color: "var(--text-primary)" }}>工作流项目</h2>
        </div>

        <button
          type="button"
          onClick={() => setShowCreate(true)}
          style={{
            padding: "12px 18px",
            borderRadius: 999,
            border: "1px solid rgba(255,180,84,0.22)",
            background: "linear-gradient(135deg, rgba(255,180,84,0.18), rgba(125,211,252,0.12))",
            color: "#fff7ea",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          + 新建漫剧项目
        </button>
      </div>

      {loading ? (
        <div style={{ color: "var(--text-muted)", fontSize: 14, textAlign: "center", padding: 28 }}>
          正在载入工作流项目…
        </div>
      ) : projects.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "40px 24px",
            background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
            borderRadius: 22,
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎬</div>
          <div style={{ color: "var(--text-secondary)", fontSize: 15, marginBottom: 10 }}>还没有漫剧工作流项目</div>
          <div style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 18, lineHeight: 1.8 }}>
            从首屏的灵感输入开始，或者直接新建项目。首页会继续承接你的脚本、分镜和任务推进。
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            style={{
              padding: "10px 22px",
              borderRadius: 999,
              border: "1px solid rgba(255,180,84,0.24)",
              background: "linear-gradient(135deg, rgba(255,180,84,0.18), rgba(255,141,77,0.18))",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            开始创建
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          <div
            onClick={() => setShowCreate(true)}
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
              borderRadius: 20,
              border: "1px dashed rgba(255,255,255,0.14)",
              padding: 22,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 146,
              transition: "border-color 0.2s ease, transform 0.2s ease",
            }}
          >
            <span style={{ fontSize: 30, color: "rgba(255,255,255,0.48)" }}>+</span>
            <span style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>新建漫剧项目</span>
          </div>

          {projects.map((project) => {
            const status = STATUS_MAP[project.status] || STATUS_MAP.draft;

            return (
              <div
                key={project.id}
                style={{
                  background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.03))",
                  borderRadius: 20,
                  border: "1px solid rgba(255,255,255,0.08)",
                  padding: 18,
                  boxShadow: "0 14px 34px rgba(2,8,23,0.16)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                    {project.title || "未命名项目"}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => void handleDelete(project.id, e)}
                    style={{
                      color: "rgba(255,255,255,0.44)",
                      fontSize: 18,
                      lineHeight: 1,
                      padding: "0 4px",
                    }}
                    title="删除项目"
                  >
                    ×
                  </button>
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: `${status.color}22`,
                      color: status.color,
                    }}
                  >
                    {status.label}
                  </span>
                  {project.genre && (
                    <span
                      style={{
                        fontSize: 11,
                        padding: "4px 10px",
                        borderRadius: 999,
                        background: "rgba(255,255,255,0.05)",
                        color: "var(--text-muted)",
                      }}
                    >
                      {project.genre}
                    </span>
                  )}
                </div>

                <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8 }}>
                  {project.character_count > 0 && `${project.character_count} 个角色 `}
                  {project.episode_count > 0 && `${project.episode_count} 集 `}
                  {project.updated_at && `· ${project.updated_at}`}
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/workflow/${project.id}`);
                    }}
                    style={{
                      flex: 1,
                      padding: "8px 0",
                      borderRadius: 10,
                      border: "1px solid rgba(153,167,255,0.28)",
                      background: "rgba(153,167,255,0.12)",
                      color: "#dbe3ff",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    继续创作
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/workflow/${project.id}?mode=auto`);
                    }}
                    style={{
                      flex: 1,
                      padding: "8px 0",
                      borderRadius: 10,
                      border: "1px solid rgba(83,216,189,0.26)",
                      background: "rgba(83,216,189,0.12)",
                      color: "#d8fff4",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    托管生成
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CreateProjectDialog open={showCreate} onClose={() => setShowCreate(false)} onCreate={handleCreate} />
    </section>
  );
}
