"use client";
import { useState, useEffect } from "react";
import type { ScriptAnalysis, WfScene } from "@/lib/api";

type AnalysisScene = ScriptAnalysis["scenes"][0];

interface EditSceneFormProps {
  scene: WfScene;
  analysisScene: AnalysisScene | null;
  onSave: (patch: Record<string, unknown>) => void;
  onSaveAndRegenerate?: (patch: Record<string, unknown>) => void;
  onAiOptimize: (currentData: string) => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", background: "#1a1a2a", border: "1px solid #333", borderRadius: 6,
  color: "#e0e0e0", fontSize: 12, padding: "6px 8px", outline: "none",
};
const textareaStyle: React.CSSProperties = {
  ...inputStyle, resize: "vertical", minHeight: 50, lineHeight: 1.5,
};

const VIEW_KEYS = ["front", "back", "left", "right", "top", "detail"];

export default function EditSceneForm({
  scene, analysisScene, onSave, onSaveAndRegenerate, onAiOptimize,
}: EditSceneFormProps) {
  const [name, setName] = useState(scene.name);
  const [description, setDescription] = useState(analysisScene?.description || scene.description || "");
  const [environment, setEnvironment] = useState(JSON.stringify(analysisScene?.environment || {}, null, 2));
  const [viewPrompts, setViewPrompts] = useState<Record<string, string>>(analysisScene?.six_view_prompts || {});

  useEffect(() => {
    setName(scene.name);
    setDescription(analysisScene?.description || scene.description || "");
    setEnvironment(JSON.stringify(analysisScene?.environment || {}, null, 2));
    setViewPrompts(analysisScene?.six_view_prompts || {});
  }, [scene.id, analysisScene]);

  const buildPatch = () => ({
    scene_id: scene.id, name, description, environment,
    six_view_prompts: viewPrompts,
  });

  return (
    <div>
      <Field label="场景名">
        <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="场景描述">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} style={textareaStyle} />
      </Field>
      <Field label="环境 (JSON)">
        <textarea value={environment} onChange={(e) => setEnvironment(e.target.value)} style={{ ...textareaStyle, minHeight: 60 }} />
      </Field>

      <div style={{ fontSize: 12, fontWeight: 600, color: "#aaa", marginBottom: 8, marginTop: 16 }}>六视图提示词 (英文)</div>
      {VIEW_KEYS.map((key) => (
        <Field key={key} label={key}>
          <textarea
            value={viewPrompts[key] || ""}
            onChange={(e) => setViewPrompts({ ...viewPrompts, [key]: e.target.value })}
            style={textareaStyle}
          />
        </Field>
      ))}

      <div style={{ fontSize: 11, color: "#666", marginBottom: 16 }}>
        视图: {VIEW_KEYS.map((k) => `${k}=${scene.views?.[k] ? "✅" : "⬜"}`).join(" ")}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => onAiOptimize(JSON.stringify(buildPatch(), null, 2))}
          style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #c084fc", background: "transparent", color: "#c084fc", fontSize: 12, cursor: "pointer" }}>
          💬 AI优化
        </button>
        <button onClick={() => onSave(buildPatch())}
          style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#7c3aed", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          保存修改
        </button>
      </div>
    </div>
  );
}
