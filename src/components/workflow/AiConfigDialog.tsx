"use client";
import { useState, useEffect } from "react";
import { fetchConfig, updateSessionConfig } from "@/lib/api";

interface AiConfigDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function AiConfigDialog({ open, onClose }: AiConfigDialogProps) {
  const [chatBase, setChatBase] = useState("");
  const [imageBase, setImageBase] = useState("");
  const [chatModel, setChatModel] = useState("");
  const [imageModel, setImageModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    fetchConfig().then((cfg) => {
      const ai = ((cfg as unknown) as Record<string, unknown>).aiConfig as Record<string, string> | undefined;
      if (ai) {
        setChatBase(ai.chatBase || "");
        setImageBase(ai.imageBase || "");
        setChatModel(ai.chatModel || "");
        setImageModel(ai.imageModel || "");
      }
    }).catch(() => {});
  }, [open]);

  if (!open) return null;

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      await updateSessionConfig({
        aiChatBase: chatBase,
        aiImageBase: imageBase,
        aiChatModel: chatModel,
        aiImageModel: imageModel,
      } as Record<string, string>);
      setMessage("配置已保存");
      setTimeout(onClose, 1000);
    } catch (err) {
      setMessage(`保存失败: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#1e1e2e",
          borderRadius: 16,
          padding: 24,
          width: 500,
          maxHeight: "80vh",
          overflowY: "auto",
          border: "1px solid #333",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ color: "#e0e0e0", fontSize: 16, marginBottom: 16, fontWeight: 600 }}>
          AI 模型配置
        </h3>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>
            Chat Completion 端点 URL
          </label>
          <input
            value={chatBase}
            onChange={(e) => setChatBase(e.target.value)}
            placeholder="https://zlhub.xiaowaiyou.cn/zhonglian/api/v1/proxy/chat/completions"
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #444",
              background: "#252535",
              color: "#e0e0e0",
              fontSize: 13,
            }}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>
            Chat 模型名称 (剧本分析用)
          </label>
          <input
            value={chatModel}
            onChange={(e) => setChatModel(e.target.value)}
            placeholder="gemini-2.5-pro"
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #444",
              background: "#252535",
              color: "#e0e0e0",
              fontSize: 13,
            }}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>
            Image Generation 端点 URL
          </label>
          <input
            value={imageBase}
            onChange={(e) => setImageBase(e.target.value)}
            placeholder="https://zlhub.xiaowaiyou.cn/zhonglian/api/v1/proxy/images/generations"
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #444",
              background: "#252535",
              color: "#e0e0e0",
              fontSize: 13,
            }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>
            Image 模型名称 (角色/分镜生成用)
          </label>
          <input
            value={imageModel}
            onChange={(e) => setImageModel(e.target.value)}
            placeholder="imagen-4.0-generate-001"
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #444",
              background: "#252535",
              color: "#e0e0e0",
              fontSize: 13,
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "8px 24px",
              borderRadius: 8,
              border: "none",
              background: saving ? "#444" : "#7c3aed",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "保存中..." : "保存配置"}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid #444",
              background: "transparent",
              color: "#888",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            取消
          </button>
          {message && (
            <span style={{ fontSize: 12, color: message.includes("失败") ? "#f87171" : "#4ade80" }}>
              {message}
            </span>
          )}
        </div>

        <div style={{ marginTop: 16, fontSize: 11, color: "#555", lineHeight: 1.6 }}>
          提示: 这些配置会保存到 .local-secrets.json 文件中。
          如果你不确定模型名称，可以联系中联 MAAS 客服获取。
        </div>
      </div>
    </div>
  );
}
