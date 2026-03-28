"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWorkflowStore } from "@/lib/store";
import WorkflowHeader from "@/components/workflow/WorkflowHeader";
import ChatPanel from "@/components/workflow/ChatPanel";
import CanvasPanel from "@/components/workflow/CanvasPanel";

export default function WorkflowPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const {
    project,
    loading,
    error,
    currentStage,
    loadProject,
    createProject,
    setStage,
    updateProjectTitle,
  } = useWorkflowStore();

  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized) return;

    const init = async () => {
      if (projectId === "new") {
        try {
          const newId = await createProject("新漫剧项目", "");
          router.replace(`/workflow/${newId}`);
        } catch {
          // error handled in store
        }
      } else {
        await loadProject(projectId);
      }
      setInitialized(true);
    };

    init();
  }, [projectId, initialized, loadProject, createProject, router]);

  if (loading && !project) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#111118",
          color: "#888",
          fontSize: 14,
        }}
      >
        加载项目中...
      </div>
    );
  }

  if (error && !project) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#111118",
          color: "#f87171",
          fontSize: 14,
          gap: 16,
        }}
      >
        <div>加载失败: {error}</div>
        <button
          onClick={() => router.push("/")}
          style={{
            padding: "8px 24px",
            borderRadius: 8,
            border: "1px solid #555",
            background: "transparent",
            color: "#ccc",
            cursor: "pointer",
          }}
        >
          返回首页
        </button>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#111118" }}>
      {/* Header */}
      <WorkflowHeader
        projectTitle={project?.title || ""}
        projectStatus={project?.status || "draft"}
        currentStage={currentStage}
        onStageChange={setStage}
        onBack={() => router.push("/")}
        onTitleChange={updateProjectTitle}
      />

      {/* Main content: Chat + Canvas */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "2fr 3fr", overflow: "hidden" }}>
        <ChatPanel />
        <CanvasPanel />
      </div>

      {/* Blink animation for streaming cursor */}
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
