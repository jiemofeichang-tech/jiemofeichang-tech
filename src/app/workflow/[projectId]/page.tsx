"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useWorkflowStore } from "@/lib/store";
import WorkflowHeader from "@/components/workflow/WorkflowHeader";
import ChatPanel from "@/components/workflow/ChatPanel";
import CanvasPanel from "@/components/workflow/CanvasPanel";

export default function WorkflowPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const searchParams = useSearchParams();
  const autoMode = searchParams.get("mode") === "auto";

  const {
    project,
    loading,
    error,
    currentStage,
    chatMessages,
    loadProject,
    createProject,
    sendMessage,
    regenerateScript,
    setStage,
    updateProjectTitle,
    setWorkflowMode,
    runAutoWorkflow,
    stageStatuses,
    workflowMode,
  } = useWorkflowStore();

  const [initialized, setInitialized] = useState(false);
  const autoAnalyzedRef = useRef(false);

  // ── 可拖拽分割线 ──
  const [splitPercent, setSplitPercent] = useState(40); // 左侧面板占比 %
  const draggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSplitMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (ev: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.min(80, Math.max(15, pct)));
    };
    const onMouseUp = () => {
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, []);

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
      if (autoMode) {
        setWorkflowMode("auto");
        // 延迟一点执行，确保项目加载完成
        setTimeout(() => runAutoWorkflow(), 500);
      }
      setInitialized(true);
    };

    init();
  }, [projectId, initialized, loadProject, createProject, router, autoMode, setWorkflowMode, runAutoWorkflow]);

  // 新建项目后自动触发剧本分析（有 raw_input、未分析过、聊天记录为空）
  useEffect(() => {
    if (!initialized || autoAnalyzedRef.current) return;
    if (!project) return;
    if (autoMode) return; // 托管模式自己处理
    const hasRawInput = !!project.script?.raw_input;
    const notAnalyzed = !project.script?.analysis;
    const noChat = chatMessages.length === 0;
    if (hasRawInput && notAnalyzed && noChat) {
      autoAnalyzedRef.current = true;
      regenerateScript();
    }
  }, [initialized, project, chatMessages, autoMode, regenerateScript]);

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
        stageStatuses={stageStatuses}
        workflowMode={workflowMode}
      />

      {/* Main content: Chat + Canvas */}
      <div ref={containerRef} style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ width: `${splitPercent}%`, minWidth: 200, flexShrink: 0 }}>
          <ChatPanel />
        </div>
        {/* 可拖拽分割线 */}
        <div
          onMouseDown={handleSplitMouseDown}
          style={{
            width: 4,
            flexShrink: 0,
            background: draggingRef.current ? "#7c3aed" : "#2a2a3a",
            cursor: "col-resize",
            transition: "background 0.15s",
            zIndex: 10,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#7c3aed"; }}
          onMouseLeave={(e) => { if (!draggingRef.current) (e.currentTarget as HTMLDivElement).style.background = "#2a2a3a"; }}
        />
        <div style={{ flex: 1, minWidth: 300 }}>
          <CanvasPanel />
        </div>
      </div>

      {/* Blink animation + Markdown styles */}
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .chat-md p { margin: 0.4em 0; word-break: break-all; overflow-wrap: anywhere; }
        .chat-md p:first-child { margin-top: 0; }
        .chat-md p:last-child { margin-bottom: 0; }
        .chat-md h1, .chat-md h2, .chat-md h3 { margin: 0.6em 0 0.3em; font-weight: 700; }
        .chat-md h1 { font-size: 1.2em; }
        .chat-md h2 { font-size: 1.1em; }
        .chat-md h3 { font-size: 1.05em; }
        .chat-md strong { color: #c084fc; }
        .chat-md code {
          background: #252540;
          padding: 1px 5px;
          border-radius: 4px;
          font-size: 0.9em;
          color: #a5b4fc;
        }
        .chat-md pre {
          background: #1a1a2e;
          border: 1px solid #333;
          border-radius: 8px;
          padding: 10px 12px;
          overflow-x: auto;
          margin: 0.5em 0;
        }
        .chat-md pre code {
          background: none;
          padding: 0;
          color: #e0e0e0;
        }
        .chat-md table {
          border-collapse: collapse;
          margin: 0.5em 0;
          width: 100%;
          font-size: 0.92em;
        }
        .chat-md th, .chat-md td {
          border: 1px solid #3a3a50;
          padding: 4px 8px;
          text-align: left;
        }
        .chat-md th {
          background: #252540;
          font-weight: 600;
          color: #c084fc;
        }
        .chat-md blockquote {
          border-left: 3px solid #7c3aed;
          margin: 0.5em 0;
          padding: 2px 12px;
          color: #aaa;
        }
        .chat-md ul, .chat-md ol {
          margin: 0.3em 0;
          padding-left: 1.5em;
        }
        .chat-md li { margin: 0.15em 0; }
        .chat-md hr { border: none; border-top: 1px solid #333; margin: 0.5em 0; }
      `}</style>
    </div>
  );
}
