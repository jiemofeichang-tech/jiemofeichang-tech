"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import type { ScriptAnalysis, WfCharacter } from "@/lib/api";
import { wfAiChat } from "@/lib/api";

type AnalysisChar = ScriptAnalysis["characters"][0];

interface EditCharacterFormProps {
  character: WfCharacter;
  analysisChar: AnalysisChar | null;
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

export default function EditCharacterForm({
  character, analysisChar, onSave, onSaveAndRegenerate, onAiOptimize,
}: EditCharacterFormProps) {
  const [name, setName] = useState(character.name);
  const [role, setRole] = useState(analysisChar?.role || "");
  const [personality, setPersonality] = useState(analysisChar?.personality || "");
  const [appearance, setAppearance] = useState(
    typeof analysisChar?.appearance === "string" ? analysisChar.appearance : JSON.stringify(analysisChar?.appearance || "", null, 2),
  );
  const [designPrompt, setDesignPrompt] = useState(
    analysisChar?.visual_prompt_template || analysisChar?.three_view_prompts?.front || "",
  );
  const [designPromptCn, setDesignPromptCn] = useState("");
  const [translating, setTranslating] = useState(false);
  const translateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 中文 → 英文自动翻译（防抖 10 秒）
  const translateToEnglish = useCallback(async (cnText: string) => {
    if (!cnText.trim()) return;
    setTranslating(true);
    try {
      // 获取当前模型配置
      let chatModel = "claude-opus-4-6";
      try {
        const cfg = await fetch("/api/config", { credentials: "include" }).then((r) => r.json());
        chatModel = cfg?.aiConfig?.chatModel || chatModel;
      } catch { /* use default */ }

      const resp = await wfAiChat({
        model: chatModel,
        messages: [
          {
            role: "user",
            content: `You are a professional translator for AI image generation prompts. Translate the following Chinese character description into English. Output ONLY the English prompt, no explanations. Keep it as a comma-separated keyword/phrase list suitable for image generation. Preserve all visual details (face, hair, body, clothing, accessories, colors).\n\nChinese text:\n${cnText}`,
          },
        ],
      });
      const translated = resp.choices?.[0]?.message?.content?.trim();
      if (translated) setDesignPrompt(translated);
    } catch (e) {
      console.warn("[translate] failed:", e);
    } finally {
      setTranslating(false);
    }
  }, []);

  const handleCnChange = useCallback((value: string) => {
    setDesignPromptCn(value);
    if (translateTimerRef.current) clearTimeout(translateTimerRef.current);
    translateTimerRef.current = setTimeout(() => translateToEnglish(value), 10000);
  }, [translateToEnglish]);

  useEffect(() => {
    setName(character.name);
    setRole(analysisChar?.role || "");
    setPersonality(analysisChar?.personality || "");
    setAppearance(typeof analysisChar?.appearance === "string" ? analysisChar.appearance : JSON.stringify(analysisChar?.appearance || "", null, 2));
    setDesignPrompt(analysisChar?.visual_prompt_template || analysisChar?.three_view_prompts?.front || "");
    setDesignPromptCn("");
  }, [character.id, analysisChar]);

  const buildPatch = () => ({
    char_id: character.id,
    name,
    role,
    personality,
    appearance,
    visual_prompt_template: designPrompt,
    three_view_prompts: { front: designPrompt, side: designPrompt, back: designPrompt },
  });

  return (
    <div>
      <Field label="角色名">
        <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="角色定位">
        <input value={role} onChange={(e) => setRole(e.target.value)} style={inputStyle} placeholder="主角 / 反派 / 配角 / 搞笑担当" />
      </Field>
      <Field label="性格描述">
        <textarea value={personality} onChange={(e) => setPersonality(e.target.value)} style={textareaStyle} placeholder="50字以内的性格描述..." />
      </Field>
      <Field label="外貌描述 (英文)">
        <textarea value={appearance} onChange={(e) => setAppearance(e.target.value)} style={{ ...textareaStyle, minHeight: 60 }} placeholder="English appearance description..." />
      </Field>

      <Field label="角色设定图提示词 (中文)">
        <textarea
          value={designPromptCn}
          onChange={(e) => handleCnChange(e.target.value)}
          style={{ ...textareaStyle, minHeight: 60 }}
          placeholder="用中文描述角色外貌、服装、特征，停止输入 10 秒后自动翻译为英文..."
        />
        {translating && (
          <div style={{ fontSize: 10, color: "#c084fc", marginTop: 4 }}>翻译中...</div>
        )}
      </Field>

      <Field label="角色设定图提示词 (英文)">
        <textarea
          value={designPrompt}
          onChange={(e) => setDesignPrompt(e.target.value)}
          style={{ ...textareaStyle, minHeight: 80 }}
          placeholder="角色外貌、服装、特征的英文描述，用于生成三视图角色设定图..."
        />
      </Field>

      {/* 设定图状态 */}
      <div style={{ fontSize: 11, color: "#666", marginBottom: 16 }}>
        角色设定图: {character.front_view ? "✅ 已生成" : "⬜ 未生成"}
      </div>

      {/* 操作按钮 */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={() => onAiOptimize(JSON.stringify(buildPatch(), null, 2))}
          style={{
            padding: "8px 14px", borderRadius: 8, border: "1px solid #c084fc",
            background: "transparent", color: "#c084fc", fontSize: 12, cursor: "pointer",
          }}
        >
          💬 AI优化
        </button>
        <button
          onClick={() => onSave(buildPatch())}
          style={{
            padding: "8px 14px", borderRadius: 8, border: "none",
            background: "#7c3aed", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}
        >
          保存修改
        </button>
      </div>
    </div>
  );
}
