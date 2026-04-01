"use client";
import { useState, useCallback } from "react";
import type { ScriptAnalysis } from "@/lib/api";
import CanvasBlock from "./CanvasBlock";

interface ScriptBlockProps {
  analysis: ScriptAnalysis | null;
  rawInput: string;
  onEdit: () => void;
  onRegenerate: () => void;
  onUpdateAnalysis?: (analysis: ScriptAnalysis) => void;
  blockKey?: string;
  onResize?: (key: string, height: number) => void;
  /** 是否正在生成中 */
  isGenerating?: boolean;
  /** 生成进度 0-100 */
  progress?: number;
  /** 进度描述 */
  progressText?: string;
}

// ── Inline Editable Field ──

function EditableField({
  value,
  onSave,
  multiline,
  style: customStyle,
}: {
  value: string;
  onSave: (v: string) => void;
  multiline?: boolean;
  style?: React.CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <span
        onClick={() => { setDraft(value); setEditing(true); }}
        style={{
          cursor: "pointer",
          borderBottom: "1px dashed #555",
          ...customStyle,
        }}
        title="点击编辑"
      >
        {value || "(空)"}
      </span>
    );
  }

  const save = () => { onSave(draft); setEditing(false); };

  if (multiline) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}
          style={{
            background: "#1a1a2a",
            border: "1px solid #7c3aed",
            borderRadius: 4,
            color: "#e0e0e0",
            fontSize: 12,
            padding: 6,
            resize: "vertical",
            minHeight: 40,
          }}
        />
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={save} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, border: "none", background: "#7c3aed", color: "#fff", cursor: "pointer" }}>
            保存
          </button>
          <button onClick={() => setEditing(false)} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, border: "1px solid #555", background: "transparent", color: "#aaa", cursor: "pointer" }}>
            取消
          </button>
        </div>
      </div>
    );
  }

  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      autoFocus
      onKeyDown={(e) => {
        if (e.key === "Enter") save();
        if (e.key === "Escape") setEditing(false);
      }}
      onBlur={save}
      style={{
        background: "#1a1a2a",
        border: "1px solid #7c3aed",
        borderRadius: 4,
        color: "#e0e0e0",
        fontSize: 12,
        padding: "2px 6px",
        width: "100%",
      }}
    />
  );
}

// ── Main Component ──

export default function ScriptBlock({
  analysis,
  rawInput,
  onEdit,
  onRegenerate,
  onUpdateAnalysis,
  blockKey,
  onResize,
  isGenerating,
  progress,
  progressText,
}: ScriptBlockProps) {
  const [expanded, setExpanded] = useState(false);

  const updateChar = useCallback(
    (charId: string, field: string, value: string) => {
      if (!analysis || !onUpdateAnalysis) return;
      const updated = {
        ...analysis,
        characters: analysis.characters.map((c) =>
          c.char_id === charId ? { ...c, [field]: value } : c,
        ),
      };
      onUpdateAnalysis(updated);
    },
    [analysis, onUpdateAnalysis],
  );

  const updateScene = useCallback(
    (sceneId: string, field: string, value: string) => {
      if (!analysis || !onUpdateAnalysis) return;
      const updated = {
        ...analysis,
        scenes: analysis.scenes.map((s) =>
          s.scene_id === sceneId ? { ...s, [field]: value } : s,
        ),
      };
      onUpdateAnalysis(updated);
    },
    [analysis, onUpdateAnalysis],
  );

  if (!analysis) {
    return (
      <CanvasBlock
        title="剧本分析"
        status={isGenerating ? "generating" : "pending"}
        progress={isGenerating ? progress : undefined}
        progressText={isGenerating ? progressText : undefined}
        onEdit={onEdit}
        blockKey={blockKey}
        onResize={onResize}
      >
        <p style={{ color: "#888", fontSize: 13 }}>
          {isGenerating
            ? `正在分析剧本内容，请稍候...`
            : rawInput
              ? `原始输入: "${rawInput.slice(0, 100)}..."`
              : "请在左侧对话框中输入故事创意，AI将分析生成结构化剧本。"}
        </p>
      </CanvasBlock>
    );
  }

  const totalShots = (analysis.episodes || []).reduce(
    (sum, ep) => sum + (ep.scenes || []).reduce((s2, sc) => s2 + (sc.shots?.length || 0), 0),
    0,
  );

  return (
    <CanvasBlock
      title="剧本分析"
      status="done"
      onEdit={onEdit}
      onRegenerate={onRegenerate}
      blockKey={blockKey}
      onResize={onResize}
    >
      {/* ── Summary Grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        {/* Title & Genre */}
        <div style={{ background: "#252535", borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 4 }}>
            {onUpdateAnalysis ? (
              <EditableField
                value={analysis.title}
                onSave={(v) => onUpdateAnalysis({ ...analysis, title: v })}
                style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}
              />
            ) : (
              analysis.title
            )}
          </div>
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
          <div style={{ fontSize: 11, color: "#666", marginTop: 6 }}>
            {(analysis.episodes || []).length} 集 · {totalShots} 镜头
          </div>
        </div>

        {/* Characters */}
        <div style={{ background: "#252535", borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc", marginBottom: 6 }}>
            角色 ({(analysis.characters || []).length})
          </div>
          {(analysis.characters || []).slice(0, expanded ? 999 : 4).map((c) => (
            <div key={c.char_id} style={{ fontSize: 12, color: "#aaa", marginBottom: expanded ? 12 : 4 }}>
              <div>
                {onUpdateAnalysis ? (
                  <>
                    <EditableField
                      value={c.name}
                      onSave={(v) => updateChar(c.char_id, "name", v)}
                      style={{ color: "#e0e0e0", fontWeight: 600 }}
                    />
                    {" — "}
                    <EditableField
                      value={c.role}
                      onSave={(v) => updateChar(c.char_id, "role", v)}
                      style={{ color: "#aaa" }}
                    />
                  </>
                ) : (
                  <>
                    <span style={{ color: "#e0e0e0" }}>{c.name}</span> — {c.role}
                  </>
                )}
              </div>
              {/* 展开时显示三视图提示词 */}
              {expanded && c.three_view_prompts && (
                <div style={{ marginTop: 6, paddingLeft: 8, borderLeft: "2px solid #7c3aed33" }}>
                  <div style={{ fontSize: 10, color: "#7c3aed", fontWeight: 600, marginBottom: 4 }}>三视图提示词</div>
                  {(["front", "side", "back"] as const).map((view) => (
                    c.three_view_prompts[view] ? (
                      <div key={view} style={{ marginBottom: 4 }}>
                        <span style={{ fontSize: 10, color: "#888", textTransform: "uppercase", marginRight: 4 }}>{view}:</span>
                        <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: "monospace", wordBreak: "break-all" }}>
                          {c.three_view_prompts[view].slice(0, 120)}
                          {c.three_view_prompts[view].length > 120 ? "..." : ""}
                        </span>
                      </div>
                    ) : null
                  ))}
                </div>
              )}
              {/* 展开时显示表情提示词 */}
              {expanded && c.expression_prompts && (
                <div style={{ marginTop: 4, paddingLeft: 8, borderLeft: "2px solid #f59e0b33" }}>
                  <div style={{ fontSize: 10, color: "#f59e0b", fontWeight: 600, marginBottom: 4 }}>表情提示词</div>
                  {(["neutral", "happy", "angry", "sad", "surprised", "determined"] as const).map((expr) => (
                    c.expression_prompts?.[expr] ? (
                      <div key={expr} style={{ marginBottom: 2 }}>
                        <span style={{ fontSize: 10, color: "#888", minWidth: 60, display: "inline-block" }}>{expr}:</span>
                        <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: "monospace", wordBreak: "break-all" }}>
                          {c.expression_prompts[expr].slice(0, 100)}
                          {c.expression_prompts[expr].length > 100 ? "..." : ""}
                        </span>
                      </div>
                    ) : null
                  ))}
                </div>
              )}
            </div>
          ))}
          {!expanded && (analysis.characters || []).length > 4 && (
            <div style={{ fontSize: 11, color: "#666" }}>+{(analysis.characters || []).length - 4} 更多</div>
          )}
        </div>

        {/* Scenes */}
        <div style={{ background: "#252535", borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc", marginBottom: 6 }}>
            场景 ({(analysis.scenes || []).length})
          </div>
          {(analysis.scenes || []).slice(0, expanded ? 999 : 4).map((s) => (
            <div key={s.scene_id} style={{ fontSize: 12, color: "#aaa", marginBottom: expanded ? 12 : 4 }}>
              <div>
                {onUpdateAnalysis ? (
                  <EditableField
                    value={s.name}
                    onSave={(v) => updateScene(s.scene_id, "name", v)}
                    style={{ color: "#e0e0e0" }}
                  />
                ) : (
                  <span style={{ color: "#e0e0e0" }}>{s.name}</span>
                )}
              </div>
              {/* 展开时显示六视图提示词 */}
              {expanded && s.six_view_prompts && (
                <div style={{ marginTop: 6, paddingLeft: 8, borderLeft: "2px solid #10b98133" }}>
                  <div style={{ fontSize: 10, color: "#10b981", fontWeight: 600, marginBottom: 4 }}>六视图提示词</div>
                  {(["front", "back", "left", "right", "top", "detail"] as const).map((view) => (
                    s.six_view_prompts[view] ? (
                      <div key={view} style={{ marginBottom: 2 }}>
                        <span style={{ fontSize: 10, color: "#888", textTransform: "uppercase", minWidth: 40, display: "inline-block" }}>{view}:</span>
                        <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: "monospace", wordBreak: "break-all" }}>
                          {s.six_view_prompts[view].slice(0, 120)}
                          {s.six_view_prompts[view].length > 120 ? "..." : ""}
                        </span>
                      </div>
                    ) : null
                  ))}
                </div>
              )}
              {/* 展开时显示光照信息 */}
              {expanded && s.lighting && (
                <div style={{ marginTop: 4, paddingLeft: 8, borderLeft: "2px solid #f59e0b33" }}>
                  <div style={{ fontSize: 10, color: "#f59e0b", fontWeight: 600, marginBottom: 2 }}>光照</div>
                  <div style={{ fontSize: 10, color: "#9ca3af" }}>
                    {s.lighting.key_light && <span>主光: {s.lighting.key_light} | </span>}
                    {s.lighting.mood && <span>氛围: {s.lighting.mood}</span>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Episodes ── */}
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

      {/* ── Expanded: Shot Details ── */}
      {expanded && analysis.episodes.map((ep) => (
        <div key={ep.episode_id} style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#aaa", marginBottom: 6 }}>
            EP{ep.episode_id} 分镜详情
          </div>
          {ep.scenes.map((sc, si) => (
            <div key={si} style={{ marginBottom: 8 }}>
              {sc.shots?.map((shot, i) => (
                <div
                  key={i}
                  style={{
                    padding: "8px 10px",
                    background: i % 2 === 0 ? "#1e1e2e" : "#1a1a28",
                    borderRadius: 6,
                    marginBottom: 4,
                  }}
                >
                  {/* 镜头头部信息 */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11, marginBottom: 4 }}>
                    <span style={{ color: "#7c3aed", fontWeight: 700, minWidth: 30 }}>#{i + 1}</span>
                    <span style={{ color: "#e0e0e0", fontWeight: 600, minWidth: 40 }}>{shot.shot_type}</span>
                    <span style={{ color: "#888", minWidth: 30 }}>{shot.duration}</span>
                    {shot.optics && (
                      <span style={{ color: "#60a5fa", fontSize: 10 }}>{shot.optics}</span>
                    )}
                    {shot.composition && (
                      <span style={{ color: "#a78bfa", fontSize: 10 }}>{shot.composition}</span>
                    )}
                    <span style={{ color: "#666", marginLeft: "auto", fontSize: 10 }}>{shot.camera_movement}</span>
                    {shot.transition && (
                      <span style={{ color: "#f59e0b", fontSize: 10 }}>{shot.transition}</span>
                    )}
                  </div>
                  {/* 动作描述 */}
                  {shot.action && (
                    <div style={{ fontSize: 11, color: "#ccc", marginBottom: 4 }}>
                      {shot.action}
                    </div>
                  )}
                  {/* 光线备注 */}
                  {shot.lighting_note && (
                    <div style={{ fontSize: 10, color: "#f59e0b99", marginBottom: 4 }}>
                      光线: {shot.lighting_note}
                    </div>
                  )}
                  {/* visual_prompt 提示词 */}
                  {shot.visual_prompt && (
                    <div style={{
                      fontSize: 10,
                      color: "#10b981",
                      fontFamily: "monospace",
                      background: "#0f0f1a",
                      borderRadius: 4,
                      padding: "6px 8px",
                      wordBreak: "break-all",
                      lineHeight: 1.5,
                      borderLeft: "3px solid #10b981",
                    }}>
                      <span style={{ color: "#10b98166", fontWeight: 600, marginRight: 4 }}>PROMPT:</span>
                      {shot.visual_prompt}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}

      {/* ── Expand/Collapse Toggle ── */}
      <div style={{ marginTop: 10, textAlign: "center" }}>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            fontSize: 11,
            padding: "4px 16px",
            borderRadius: 12,
            border: "1px solid #444",
            background: "transparent",
            color: "#888",
            cursor: "pointer",
          }}
        >
          {expanded ? "收起详情 ▲" : "展开详情 ▼"}
        </button>
      </div>
    </CanvasBlock>
  );
}
