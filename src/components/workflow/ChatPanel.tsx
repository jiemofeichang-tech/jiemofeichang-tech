"use client";
import { useState, useRef, useEffect } from "react";
import { useWorkflowStore, type WorkflowStage } from "@/lib/store";

const STAGE_LABELS: Record<WorkflowStage, string> = {
  script: "剧本分析",
  character: "角色设计",
  storyboard: "分镜生成",
  video: "视频合成",
  post: "后期输出",
};

const QUICK_ACTIONS: Record<WorkflowStage, string[]> = {
  script: ["分析这个故事", "添加更多角色", "调整情节节奏", "修改风格"],
  character: ["生成三视图", "修改外貌", "更换服装", "调整表情"],
  storyboard: ["优化提示词", "调整景别", "修改运镜", "重新生成"],
  video: ["批量生成视频", "调整运动幅度", "修改时长", "重新生成"],
  post: ["生成字幕", "调整音量", "导出抖音版", "导出B站版"],
};

export default function ChatPanel() {
  const {
    chatMessages,
    chatLoading,
    streamingContent,
    currentStage,
    selectedBlock,
    sendMessage,
    setSelectedBlock,
    generateCharacterImages,
    generateSceneImages,
    generateStoryboardImages,
    generateVideos,
    setStage,
    addSystemMessage,
  } = useWorkflowStore();

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, streamingContent]);

  // Auto-focus input when selectedBlock changes
  useEffect(() => {
    if (selectedBlock && inputRef.current) {
      inputRef.current.focus();
    }
  }, [selectedBlock]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || chatLoading) return;
    setInput("");

    // Intercept generation commands
    const lower = text.toLowerCase();
    if (lower.includes("生成三视图") || lower.includes("生成角色")) {
      addSystemMessage(`用户: ${text}`);
      setStage("character");
      generateCharacterImages();
      return;
    }
    if (lower.includes("生成场景") || lower.includes("六视图")) {
      addSystemMessage(`用户: ${text}`);
      setStage("character");
      generateSceneImages();
      return;
    }
    if (lower.includes("生成分镜") || lower.includes("分镜图")) {
      addSystemMessage(`用户: ${text}`);
      setStage("storyboard");
      generateStoryboardImages();
      return;
    }
    if (lower.includes("生成视频") || lower.includes("批量生成视频")) {
      addSystemMessage(`用户: ${text}`);
      setStage("video");
      generateVideos();
      return;
    }

    await sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        borderRight: "1px solid #2a2a3a",
        background: "#16161e",
      }}
    >
      {/* Chat Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {chatMessages.length === 0 && !streamingContent && (
          <div style={{ textAlign: "center", paddingTop: 60 }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>&#x1F525;</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#e0e0e0", marginBottom: 8 }}>
              AI 艺术总监
            </div>
            <div style={{ fontSize: 13, color: "#888", maxWidth: 280, margin: "0 auto" }}>
              告诉我你想创作什么样的漫剧，我会帮你完成从剧本到成片的全流程。
            </div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 16 }}>
              当前阶段: {STAGE_LABELS[currentStage]}
            </div>
          </div>
        )}

        {chatMessages.map((msg, i) => (
          <div
            key={i}
            style={{
              marginBottom: 16,
              display: "flex",
              flexDirection: "column",
              alignItems: msg.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: "#666",
                marginBottom: 4,
              }}
            >
              {msg.role === "user" ? "你" : msg.role === "system" ? "系统" : "AI 艺术总监"}
              {msg.stage && ` · ${STAGE_LABELS[msg.stage as WorkflowStage] || msg.stage}`}
            </div>
            <div
              style={{
                maxWidth: "85%",
                padding: "10px 14px",
                borderRadius: 12,
                background:
                  msg.role === "user"
                    ? "#7c3aed"
                    : msg.role === "system"
                      ? "#252535"
                      : "#1e1e2e",
                color: msg.role === "system" ? "#888" : "#e0e0e0",
                fontSize: 13,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Streaming content */}
        {streamingContent && (
          <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>AI 艺术总监 (生成中...)</div>
            <div
              style={{
                maxWidth: "85%",
                padding: "10px 14px",
                borderRadius: 12,
                background: "#1e1e2e",
                color: "#e0e0e0",
                fontSize: 13,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                borderLeft: "3px solid #7c3aed",
              }}
            >
              {streamingContent}
              <span style={{ animation: "blink 1s infinite", color: "#7c3aed" }}>|</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Selected block context */}
      {selectedBlock && (
        <div
          style={{
            padding: "8px 16px",
            background: "#252535",
            borderTop: "1px solid #333",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: 12, color: "#c084fc" }}>
            编辑: {selectedBlock.label || selectedBlock.type} ({selectedBlock.id})
          </span>
          <button
            onClick={() => setSelectedBlock(null)}
            style={{
              background: "transparent",
              border: "none",
              color: "#888",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Quick actions */}
      <div style={{ padding: "8px 16px", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {QUICK_ACTIONS[currentStage].map((action) => (
          <button
            key={action}
            onClick={() => setInput(action)}
            style={{
              fontSize: 11,
              padding: "3px 10px",
              borderRadius: 12,
              border: "1px solid #333",
              background: "transparent",
              color: "#888",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {action}
          </button>
        ))}
      </div>

      {/* Input area */}
      <div style={{ padding: "8px 16px 16px", borderTop: "1px solid #2a2a3a" }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            background: "#1e1e2e",
            borderRadius: 12,
            border: "1px solid #333",
            padding: 8,
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`输入你的${STAGE_LABELS[currentStage]}需求... (Ctrl+Enter 发送)`}
            rows={2}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              color: "#e0e0e0",
              fontSize: 13,
              resize: "none",
              outline: "none",
              lineHeight: 1.5,
            }}
          />
          <button
            onClick={handleSend}
            disabled={chatLoading || !input.trim()}
            style={{
              alignSelf: "flex-end",
              padding: "6px 16px",
              borderRadius: 8,
              border: "none",
              background: chatLoading || !input.trim() ? "#333" : "#7c3aed",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: chatLoading || !input.trim() ? "not-allowed" : "pointer",
            }}
          >
            {chatLoading ? "..." : "发送"}
          </button>
        </div>
      </div>
    </div>
  );
}
