"use client";
import { useState, useEffect } from "react";
import type { WfShot } from "@/lib/api";

interface EditShotFormProps {
  shot: WfShot;
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
const selectStyle: React.CSSProperties = {
  ...inputStyle, cursor: "pointer",
};

const SHOT_TYPES = ["ELS", "LS", "FS", "MS", "CU", "ECU", "OTS", "two_shot", "establishing"];
const CAMERA_MOVEMENTS = ["", "static", "push_in_slow", "pull_back", "pan_left", "pan_right", "tilt_up", "tilt_down", "orbit", "dolly_zoom", "tracking"];

export default function EditShotForm({
  shot, onSave, onSaveAndRegenerate, onAiOptimize,
}: EditShotFormProps) {
  const [shotType, setShotType] = useState(shot.shot_type || "MS");
  const [duration, setDuration] = useState(shot.duration || 5);
  const [cameraMovement, setCameraMovement] = useState(shot.camera_movement || "");
  const [dialogue, setDialogue] = useState(shot.dialogue || "");
  const [emotion, setEmotion] = useState(shot.emotion || "");
  const [rawDescription, setRawDescription] = useState(shot.raw_description || "");
  const [prompt, setPrompt] = useState(shot.prompt || "");
  const [visualPrompt, setVisualPrompt] = useState(shot.visual_prompt || "");

  useEffect(() => {
    setShotType(shot.shot_type || "MS");
    setDuration(shot.duration || 5);
    setCameraMovement(shot.camera_movement || "");
    setDialogue(shot.dialogue || "");
    setEmotion(shot.emotion || "");
    setRawDescription(shot.raw_description || "");
    setPrompt(shot.prompt || "");
    setVisualPrompt(shot.visual_prompt || "");
  }, [shot.id]);

  const buildPatch = () => ({
    shot_type: shotType, duration, camera_movement: cameraMovement,
    dialogue: dialogue || undefined, emotion: emotion || undefined,
    raw_description: rawDescription, prompt,
    visual_prompt: visualPrompt || undefined,
  });

  return (
    <div>
      {/* 分镜图预览 */}
      {shot.storyboard_image && (
        <div style={{ marginBottom: 12, textAlign: "center" }}>
          <img src={shot.storyboard_image} alt="分镜" style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8 }} />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="景别">
          <select value={shotType} onChange={(e) => setShotType(e.target.value)} style={selectStyle}>
            {SHOT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="时长 (秒)">
          <input type="number" min={1} max={30} value={duration} onChange={(e) => setDuration(Number(e.target.value))} style={inputStyle} />
        </Field>
      </div>

      <Field label="运镜">
        <select value={cameraMovement} onChange={(e) => setCameraMovement(e.target.value)} style={selectStyle}>
          {CAMERA_MOVEMENTS.map((m) => <option key={m} value={m}>{m || "(无)"}</option>)}
        </select>
      </Field>

      <Field label="对白">
        <textarea value={dialogue} onChange={(e) => setDialogue(e.target.value)} style={textareaStyle} placeholder="角色对白..." />
      </Field>

      <Field label="情绪">
        <input value={emotion} onChange={(e) => setEmotion(e.target.value)} style={inputStyle} placeholder="neutral / happy / sad / angry..." />
      </Field>

      <Field label="画面描述">
        <textarea value={rawDescription} onChange={(e) => setRawDescription(e.target.value)} style={{ ...textareaStyle, minHeight: 60 }} />
      </Field>

      <Field label="分镜图提示词 (Prompt)">
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} style={{ ...textareaStyle, minHeight: 80 }} />
      </Field>

      <Field label="视频生成提示词 (Visual Prompt)">
        <textarea
          value={visualPrompt}
          onChange={(e) => setVisualPrompt(e.target.value)}
          style={{ ...textareaStyle, minHeight: 80, borderColor: "#7c3aed44" }}
          placeholder="详细的视频生成提示词，含光学、构图、灯光等（编辑后与视频生成联动）"
        />
        <span style={{ fontSize: 10, color: "#666", marginTop: 2, display: "block" }}>
          此提示词将串联角色外貌+场景灯光后送入视频生成 API
        </span>
      </Field>

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
