"use client";
import type { ScriptAnalysis } from "@/lib/api";
import CanvasBlock from "./CanvasBlock";

interface ScriptBlockProps {
  analysis: ScriptAnalysis | null;
  rawInput: string;
  onEdit: () => void;
  onRegenerate: () => void;
}

export default function ScriptBlock({ analysis, rawInput, onEdit, onRegenerate }: ScriptBlockProps) {
  if (!analysis) {
    return (
      <CanvasBlock title="剧本分析" status="pending" onEdit={onEdit}>
        <p style={{ color: "#888", fontSize: 13 }}>
          {rawInput ? `原始输入: "${rawInput.slice(0, 100)}..."` : "请在左侧对话框中输入故事创意，AI将分析生成结构化剧本。"}
        </p>
      </CanvasBlock>
    );
  }

  return (
    <CanvasBlock title="剧本分析" status="done" onEdit={onEdit} onRegenerate={onRegenerate}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {/* Title & Genre */}
        <div style={{ background: "#252535", borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{analysis.title}</div>
          <div style={{ fontSize: 12, color: "#aaa" }}>
            {analysis.genre} | {analysis.style}
          </div>
          {analysis.color_palette && (
            <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
              {analysis.color_palette.map((c, i) => (
                <div key={i} style={{ width: 20, height: 20, borderRadius: 4, background: c }} title={c} />
              ))}
            </div>
          )}
        </div>

        {/* Characters Summary */}
        <div style={{ background: "#252535", borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc", marginBottom: 6 }}>
            角色 ({analysis.characters.length})
          </div>
          {analysis.characters.slice(0, 4).map((c) => (
            <div key={c.char_id} style={{ fontSize: 12, color: "#aaa", marginBottom: 2 }}>
              <span style={{ color: "#e0e0e0" }}>{c.name}</span> — {c.role}
            </div>
          ))}
          {analysis.characters.length > 4 && (
            <div style={{ fontSize: 11, color: "#666" }}>+{analysis.characters.length - 4} 更多</div>
          )}
        </div>

        {/* Scenes Summary */}
        <div style={{ background: "#252535", borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc", marginBottom: 6 }}>
            场景 ({analysis.scenes.length})
          </div>
          {analysis.scenes.slice(0, 4).map((s) => (
            <div key={s.scene_id} style={{ fontSize: 12, color: "#aaa", marginBottom: 2 }}>
              <span style={{ color: "#e0e0e0" }}>{s.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Episodes */}
      {analysis.episodes.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc", marginBottom: 6 }}>
            分集 ({analysis.episodes.length})
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {analysis.episodes.map((ep) => (
              <div
                key={ep.episode_id}
                style={{
                  background: "#252535",
                  borderRadius: 6,
                  padding: "6px 12px",
                  fontSize: 12,
                  color: "#ccc",
                }}
              >
                EP{ep.episode_id}: {ep.title} ({ep.duration_target})
              </div>
            ))}
          </div>
        </div>
      )}
    </CanvasBlock>
  );
}
