"use client";
import { useState, useEffect } from "react";
import type { ScriptAnalysis } from "@/lib/api";

interface EditScriptFormProps {
  analysis: ScriptAnalysis;
  onSave: (analysis: ScriptAnalysis) => void;
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

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: "#aaa", marginBottom: 8, marginTop: 16,
  borderBottom: "1px solid #2a2a3a", paddingBottom: 6,
};

const itemCardStyle: React.CSSProperties = {
  background: "#1a1a2a", borderRadius: 8, padding: 10, marginBottom: 8, border: "1px solid #2a2a3a",
};

const removeBtnStyle: React.CSSProperties = {
  background: "transparent", border: "none", color: "#f87171", fontSize: 11,
  cursor: "pointer", padding: "2px 6px",
};

const addBtnStyle: React.CSSProperties = {
  width: "100%", padding: "6px 0", borderRadius: 6, border: "1px dashed #444",
  background: "transparent", color: "#888", fontSize: 11, cursor: "pointer", marginBottom: 8,
};

export default function EditScriptForm({ analysis, onSave, onAiOptimize }: EditScriptFormProps) {
  const [title, setTitle] = useState(analysis.title);
  const [genre, setGenre] = useState(analysis.genre);
  const [style, setStyle] = useState(analysis.style);
  const [platform, setPlatform] = useState(analysis.target_platform || "");
  const [characters, setCharacters] = useState(analysis.characters);
  const [scenes, setScenes] = useState(analysis.scenes);
  const [episodes, setEpisodes] = useState(analysis.episodes);

  // 当外部 analysis 变化时同步（左侧对话修改后 store 更新，此处同步）
  useEffect(() => {
    setTitle(analysis.title);
    setGenre(analysis.genre);
    setStyle(analysis.style);
    setPlatform(analysis.target_platform || "");
    setCharacters(analysis.characters);
    setScenes(analysis.scenes);
    setEpisodes(analysis.episodes);
  }, [analysis]);

  const updateChar = (idx: number, field: string, value: string) => {
    setCharacters((prev) => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  const removeChar = (idx: number) => {
    setCharacters((prev) => prev.filter((_, i) => i !== idx));
  };

  const addChar = () => {
    setCharacters((prev) => [
      ...prev,
      {
        char_id: `char_${Date.now()}`,
        name: "",
        role: "",
        personality: "",
        appearance: {},
        costume: {},
        three_view_prompts: { front: "", side: "", back: "" },
        expression_prompts: {},
      },
    ]);
  };

  const updateScene = (idx: number, field: string, value: string) => {
    setScenes((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const removeScene = (idx: number) => {
    setScenes((prev) => prev.filter((_, i) => i !== idx));
  };

  const addScene = () => {
    setScenes((prev) => [
      ...prev,
      {
        scene_id: `scene_${Date.now()}`,
        name: "",
        description: "",
        environment: {},
        six_view_prompts: {},
        lighting: {},
        color_grading: "",
      },
    ]);
  };

  const updateEpisode = (idx: number, field: string, value: string) => {
    setEpisodes((prev) => prev.map((ep, i) => i === idx ? { ...ep, [field]: value } : ep));
  };

  const buildAnalysis = (): ScriptAnalysis => ({
    ...analysis,
    title,
    genre,
    style,
    target_platform: platform || undefined,
    characters,
    scenes,
    episodes,
  });

  return (
    <div>
      {/* 基本信息 */}
      <div style={sectionTitleStyle}>基本信息</div>
      <Field label="标题">
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="类型">
        <input value={genre} onChange={(e) => setGenre(e.target.value)} style={inputStyle} placeholder="喜剧 / 悬疑 / 奇幻 ..." />
      </Field>
      <Field label="风格">
        <input value={style} onChange={(e) => setStyle(e.target.value)} style={inputStyle} placeholder="搞笑 / 温馨 / 暗黑 ..." />
      </Field>
      <Field label="目标平台">
        <input value={platform} onChange={(e) => setPlatform(e.target.value)} style={inputStyle} placeholder="抖音 / 快手 / B站 ..." />
      </Field>

      {/* 角色列表 */}
      <div style={sectionTitleStyle}>
        角色 ({characters.length})
      </div>
      {characters.map((c, idx) => (
        <div key={c.char_id} style={itemCardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "#7c3aed", fontWeight: 600 }}>#{idx + 1}</span>
            <button onClick={() => removeChar(idx)} style={removeBtnStyle}>删除</button>
          </div>
          <Field label="名字">
            <input value={c.name} onChange={(e) => updateChar(idx, "name", e.target.value)} style={inputStyle} />
          </Field>
          <Field label="角色定位">
            <input value={c.role} onChange={(e) => updateChar(idx, "role", e.target.value)} style={inputStyle} placeholder="主角 / 反派 / 配角" />
          </Field>
          <Field label="性格">
            <textarea value={c.personality} onChange={(e) => updateChar(idx, "personality", e.target.value)} style={textareaStyle} />
          </Field>
        </div>
      ))}
      <button onClick={addChar} style={addBtnStyle}>+ 添加角色</button>

      {/* 场景列表 */}
      <div style={sectionTitleStyle}>
        场景 ({scenes.length})
      </div>
      {scenes.map((s, idx) => (
        <div key={s.scene_id} style={itemCardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "#7c3aed", fontWeight: 600 }}>#{idx + 1}</span>
            <button onClick={() => removeScene(idx)} style={removeBtnStyle}>删除</button>
          </div>
          <Field label="场景名">
            <input value={s.name} onChange={(e) => updateScene(idx, "name", e.target.value)} style={inputStyle} />
          </Field>
          <Field label="描述">
            <textarea value={s.description} onChange={(e) => updateScene(idx, "description", e.target.value)} style={textareaStyle} />
          </Field>
        </div>
      ))}
      <button onClick={addScene} style={addBtnStyle}>+ 添加场景</button>

      {/* 分集列表 */}
      <div style={sectionTitleStyle}>
        分集 ({episodes.length})
      </div>
      {episodes.map((ep, idx) => (
        <div key={ep.episode_id} style={itemCardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "#7c3aed", fontWeight: 600 }}>EP{ep.episode_id}</span>
          </div>
          <Field label="标题">
            <input value={ep.title} onChange={(e) => updateEpisode(idx, "title", e.target.value)} style={inputStyle} />
          </Field>
          <Field label="目标时长">
            <input value={ep.duration_target} onChange={(e) => updateEpisode(idx, "duration_target", e.target.value)} style={inputStyle} placeholder="30s / 60s" />
          </Field>
        </div>
      ))}

      {/* 操作按钮 */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
<button
          onClick={() => onSave(buildAnalysis())}
          style={{
            padding: "8px 14px", borderRadius: 8, border: "none",
            background: "#7c3aed", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}
        >
          {"保存修改"}
        </button>
      </div>
    </div>
  );
}
