"use client";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useWorkflowStore, type WorkflowStage, type StageProgress } from "@/lib/store";

const STAGE_LABELS: Record<WorkflowStage, string> = {
  script: "剧本分析",
  style: "风格定调",
  character: "角色设计",
  storyboard: "分镜生成",
  video: "视频合成",
  post: "后期输出",
};

const STAGE_QUICK_ACTIONS: Record<WorkflowStage, string[]> = {
  script: ["分析这个故事", "增加一个反派角色", "把分镜数量改为8个", "增加更多笑点和反转"],
  style: ["推荐适合这个故事的风格", "这个风格适合做竖屏短剧吗", "帮我优化提示词", "切换到吉卜力风格"],
  character: ["生成角色三视图", "生成场景六视图", "修改外貌", "调整表情"],
  storyboard: ["批量生成分镜图", "优化提示词", "调整景别", "重新生成"],
  video: ["批量生成视频", "调整运动幅度", "修改时长", "重新生成"],
  post: ["生成字幕", "开始合成", "调整音量", "导出"],
};

/** 根据 selectedBlock 生成针对性快捷操作 */
function getContextualActions(
  selectedBlock: { type: string; id: string; label?: string } | null,
  currentStage: WorkflowStage,
): string[] {
  if (!selectedBlock) return STAGE_QUICK_ACTIONS[currentStage];

  const name = selectedBlock.label || selectedBlock.id;

  switch (selectedBlock.type) {
    case "style":
      return ["推荐适合的风格", "切换到吉卜力风格", "使用赛博朋克风格", "适合竖屏短剧的风格"];
    case "script":
      return ["增加一个角色", "修改故事类型", "增加更多笑点", "优化剧情结构"];
    case "character":
      return [
        `修改${name}的外貌描述`,
        `优化${name}的三视图提示词`,
        `调整${name}的性格`,
        `给${name}增加标志性特征`,
        `重新生成${name}的三视图`,
        "打开详细编辑面板",
      ];
    case "scene":
      return [
        `修改${name}的环境描述`,
        `调整${name}的光影氛围`,
        `优化${name}的六视图提示词`,
        `重新生成${name}的视图`,
        "打开详细编辑面板",
      ];
    case "shot":
      return [
        "优化画面描述",
        "把景别改为特写",
        "增加角色对白",
        "调整镜头时长为5秒",
        "重新生成分镜图",
        "打开详细编辑面板",
      ];
    case "video":
      return ["调整运镜为环绕", "修改时长", "加快运动速度", "重新生成视频", "打开详细编辑面板"];
    case "post":
      return ["生成字幕", "开始合成", "调整音量", "导出"];
    default:
      return STAGE_QUICK_ACTIONS[currentStage];
  }
}

// ── 编辑上下文卡片 ──
function EditContextCard({
  editCtx,
  onClose,
}: {
  editCtx: { title: string; fields: { label: string; value: string }[]; hints: string[] };
  onClose: () => void;
}) {
  return (
    <div
      style={{
        background: "#1a1a2e",
        border: "1px solid #7c3aed",
        borderRadius: 10,
        padding: 12,
        marginBottom: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#c084fc" }}>
          ✏️ {editCtx.title}
        </span>
        <button
          onClick={onClose}
          style={{ background: "transparent", border: "none", color: "#888", cursor: "pointer", fontSize: 16 }}
        >
          &times;
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 10px", fontSize: 12 }}>
        {editCtx.fields.map((f) => (
          <div key={f.label} style={{ display: "contents" }}>
            <span style={{ color: "#666", whiteSpace: "nowrap" }}>{f.label}:</span>
            <span style={{ color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.value}</span>
          </div>
        ))}
      </div>
      {editCtx.hints.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: "#666" }}>
          💡 试试说: {editCtx.hints.slice(0, 2).map((h) => `"${h}"`).join("、")}
        </div>
      )}
    </div>
  );
}

/** AI 处理进度条 */
function StageProgressBar({ progress }: { progress: StageProgress }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - progress.startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [progress.startedAt]);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timeStr = mins > 0 ? `${mins}:${String(secs).padStart(2, "0")}` : `${secs}s`;

  return (
    <div style={{
      marginBottom: 16, padding: "12px 16px", borderRadius: 12,
      background: "#1a1a2e", border: "1px solid #2a2a4a",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            display: "inline-block", width: 8, height: 8, borderRadius: "50%",
            background: "#f0c040", animation: "blink 1.2s infinite",
          }} />
          <span style={{ fontSize: 13, color: "#e0e0e0" }}>{progress.step}</span>
        </div>
        <span style={{ fontSize: 11, color: "#666" }}>{timeStr}</span>
      </div>
      <div style={{
        height: 4, borderRadius: 2, background: "#2a2a3a", overflow: "hidden",
      }}>
        <div style={{
          height: "100%", borderRadius: 2,
          background: "linear-gradient(90deg, #7c3aed, #a855f7)",
          width: `${progress.percent}%`,
          transition: "width 0.6s ease",
        }} />
      </div>
      <div style={{ fontSize: 11, color: "#555", marginTop: 4, textAlign: "right" }}>
        {progress.stage} · {progress.percent}%
      </div>
    </div>
  );
}

export default function ChatPanel() {
  const {
    project,
    chatMessages,
    chatLoading,
    streamingContent,
    stageProgress,
    currentStage,
    selectedBlock,
    workflowMode,
    sendMessage,
    regenerateScript,
    setSelectedBlock,
    generateCharacterImages,
    generateSceneImages,
    generateStoryboardImages,
    generateVideos,
    setStage,
    addSystemMessage,
    updateProjectData,
    openEditPanel,
    buildEditContext,
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

  // 构建编辑上下文（当 selectedBlock 存在时）
  const editCtx = selectedBlock && project ? buildEditContext(selectedBlock, project) : null;

  const handleSendText = async (text: string) => {
    if (!text || chatLoading) return;
    setInput("");

    // Intercept generation commands
    const isQuestion = /[?？]|怎么|如何|什么|能不能|可以吗/.test(text);
    const isNegation = /不要|别|取消|停止/.test(text);

    if (!isQuestion && !isNegation) {
      // 打开编辑面板命令
      if (/^(打开|展开)(详细)?编辑面板/.test(text) && selectedBlock) {
        openEditPanel({
          type: (selectedBlock.type === "video" ? "shot" : selectedBlock.type) as "script" | "character" | "scene" | "episode" | "shot",
          id: selectedBlock.id.includes("/") ? selectedBlock.id.split("/")[1] : selectedBlock.id,
          episodeId: selectedBlock.episodeId || (selectedBlock.id.includes("/") ? selectedBlock.id.split("/")[0] : undefined),
        });
        addSystemMessage("已打开详细编辑面板。");
        return;
      }

      // 角色三视图生成
      if (/^(生成|开始生成|批量生成)?(角色)?(三视图|角色三视图)/.test(text) ||
          /^生成角色/.test(text) ||
          text === "生成角色三视图") {
        addSystemMessage(`用户: ${text}`);
        setStage("character");
        generateCharacterImages();
        return;
      }
      // 场景六视图生成
      if (/^(生成|开始生成|批量生成)?(场景)?(六视图|场景六视图)/.test(text) ||
          /^生成场景/.test(text)) {
        addSystemMessage(`用户: ${text}`);
        setStage("character");
        generateSceneImages();
        return;
      }
      // 分镜图生成
      if (/^(生成|开始生成|批量生成)(分镜图?|分镜)$/.test(text) ||
          text === "批量生成分镜图") {
        addSystemMessage(`用户: ${text}`);
        setStage("storyboard");
        generateStoryboardImages();
        return;
      }
      // 视频生成
      if (/^(生成|开始生成|批量生成)(视频|全部视频)$/.test(text) ||
          text === "批量生成视频") {
        addSystemMessage(`用户: ${text}`);
        setStage("video");
        generateVideos();
        return;
      }
      // 锁定剧本 / 进入下一步
      if (/^(锁定剧本|进入下一步)$/.test(text)) {
        addSystemMessage("剧本已锁定。进入角色设计阶段。你可以说\"生成角色三视图\"开始。");
        updateProjectData({ status: "script_parsed" });
        setStage("character");
        return;
      }
    }

    try {
      await sendMessage(text);
    } catch (err) {
      addSystemMessage(`❌ 发送失败: ${err instanceof Error ? err.message : "未知错误"}`);
    }
  };

  const handleSend = () => {
    handleSendText(input.trim());
  };

  const handleQuickAction = (action: string) => {
    if (action === "分析这个故事") {
      regenerateScript();
      return;
    }
    handleSendText(action);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const isAutoMode = workflowMode === "auto";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        borderRight: "1px solid #2a2a3a",
        background: "#16161e",
      }}
    >
      {/* 托管模式标签 */}
      {isAutoMode && (
        <div style={{ padding: "6px 16px", background: "#1a2e1a", borderBottom: "1px solid #333", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, color: "#4ade80", fontWeight: 600 }}>🤖 托管模式 — 自动执行中</span>
        </div>
      )}

      {/* Chat Messages */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: 16 }}>
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
              className="chat-md"
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
                wordBreak: "break-word",
              }}
            >
              {msg.role === "user" ? (
                <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
              ) : msg.content.length > 500 && (msg.content.includes('"char_id"') || msg.content.includes('"scene_id"') || msg.content.includes('"episode_id"') || msg.content.includes('"title"') && msg.content.includes('"genre"')) ? (
                <span style={{ color: "#888", fontStyle: "italic", fontSize: 12 }}>
                  ✅ JSON 数据已生成（{msg.content.length} 字符），画布已更新。
                </span>
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
              )}
            </div>
          </div>
        ))}

        {/* Stage progress indicator */}
        {chatLoading && stageProgress && !streamingContent && (
          <StageProgressBar progress={stageProgress} />
        )}

        {/* Streaming content */}
        {streamingContent && (
          <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>AI 艺术总监 (生成中...)</div>
            <div
              className="chat-md"
              style={{
                maxWidth: "85%",
                padding: "10px 14px",
                borderRadius: 12,
                background: "#1e1e2e",
                color: "#e0e0e0",
                fontSize: 13,
                lineHeight: 1.6,
                wordBreak: "break-word",
                borderLeft: "3px solid #7c3aed",
              }}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown>
              <span style={{ animation: "blink 1s infinite", color: "#7c3aed" }}>|</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 编辑上下文卡片（selectedBlock 非 null 时显示） */}
      {editCtx && (
        <EditContextCard
          editCtx={editCtx}
          onClose={() => setSelectedBlock(null)}
        />
      )}

      {/* Selected block context （如果没有 editCtx 则降级为旧的简单条） */}
      {selectedBlock && !editCtx && (
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
        {getContextualActions(selectedBlock, currentStage).map((action) => (
          <button
            key={action}
            onClick={() => handleQuickAction(action)}
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
            placeholder={
              selectedBlock
                ? `告诉AI如何修改${selectedBlock.label || selectedBlock.type}... (Ctrl+Enter 发送)`
                : `输入你的${STAGE_LABELS[currentStage]}需求... (Ctrl+Enter 发送)`
            }
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
