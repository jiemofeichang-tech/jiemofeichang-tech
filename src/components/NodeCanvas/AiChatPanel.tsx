"use client";

import { useState, useRef } from "react";

interface AiChatPanelProps {
  onGenerate: (result: { type: string; cards: { title: string; content: string; imageUrl?: string }[] }) => void;
}

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

const templates = [
  { label: "故事分镜", desc: "根据剧本生成分镜卡片", prompt: "请根据我的剧本生成完整的分镜故事板" },
  { label: "角色设计", desc: "提取角色并生成参考图", prompt: "请从剧本中提取所有角色并生成角色设计卡片" },
  { label: "场景设计", desc: "提取场景并生成概念图", prompt: "请从剧本中提取所有场景并生成场景卡片" },
  { label: "视频生成", desc: "将分镜转为视频片段", prompt: "请将分镜图转为视频" },
];

export default function AiChatPanel({ onGenerate }: AiChatPanelProps) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: ChatMsg = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const backendBase = `http://${window.location.hostname}:8787`;
      const res = await fetch(`${backendBase}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-opus-4-6",
          messages: [
            { role: "user", content: `你是AI漫剧创作助手。用户说：${text}\n\n请用中文简短回复，如果用户要求生成内容，告诉他们正在处理。` },
          ],
        }),
      });
      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || "抱歉，请求失败了。";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "网络错误，请重试。" }]);
    } finally {
      setLoading(false);
    }

    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 100);
  };

  return (
    <div style={{
      width: 320,
      background: "#f8f8f0",
      borderLeft: "1px solid #e0e0d0",
      display: "flex",
      flexDirection: "column",
      color: "#333",
    }}>
      {/* 标题 */}
      <div style={{
        padding: "16px 16px 12px",
        borderBottom: "1px solid #e0e0d0",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <span style={{ fontSize: 20 }}>🤖</span>
        <span style={{ fontWeight: 700, fontSize: 14 }}>AI 创作伙伴</span>
      </div>

      {/* 消息区 */}
      <div ref={scrollRef} style={{ flex: 1, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.length === 0 && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>你好，我是你的 AI 创作伙伴~</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {templates.map((t) => (
                <button
                  key={t.label}
                  onClick={() => sendMessage(t.prompt)}
                  style={{
                    background: "#fff",
                    border: "1px solid #ddd",
                    borderRadius: 10,
                    padding: "12px 10px",
                    textAlign: "left",
                    cursor: "pointer",
                    transition: "border-color 0.2s",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>{t.label}</div>
                  <div style={{ fontSize: 10, color: "#999", marginTop: 4 }}>{t.desc}</div>
                </button>
              ))}
            </div>
          </>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "85%",
              background: msg.role === "user" ? "#7c3aed" : "#fff",
              color: msg.role === "user" ? "#fff" : "#333",
              borderRadius: 12,
              padding: "8px 12px",
              fontSize: 12,
              lineHeight: 1.5,
              border: msg.role === "assistant" ? "1px solid #ddd" : "none",
              whiteSpace: "pre-wrap",
            }}
          >
            {msg.content}
          </div>
        ))}

        {loading && (
          <div style={{ fontSize: 12, color: "#999" }}>AI 正在思考...</div>
        )}
      </div>

      {/* 输入区 */}
      <div style={{ padding: 12, borderTop: "1px solid #e0e0d0" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder="输入你的创意..."
            style={{
              flex: 1,
              minHeight: 40,
              maxHeight: 100,
              borderRadius: 10,
              border: "1px solid #ddd",
              padding: "8px 12px",
              fontSize: 12,
              resize: "none",
              background: "#fff",
              color: "#333",
              outline: "none",
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={loading}
            style={{
              width: 36,
              height: 36,
              borderRadius: 20,
              border: "none",
              background: input.trim() ? "#7c3aed" : "#ddd",
              color: "#fff",
              fontSize: 16,
              cursor: input.trim() ? "pointer" : "default",
            }}
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
