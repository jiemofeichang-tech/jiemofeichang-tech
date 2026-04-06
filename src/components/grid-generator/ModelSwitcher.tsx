"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchConfig, updateSessionConfig } from "@/lib/api";
import AiConfigDialog from "@/components/workflow/AiConfigDialog";

export default function ModelSwitcher() {
  const [imageModel, setImageModel] = useState("");
  const [imageBase, setImageBase] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadConfig = useCallback(() => {
    fetchConfig().then((cfg) => {
      const ai = ((cfg as unknown) as Record<string, unknown>).aiConfig as Record<string, string> | undefined;
      if (ai) {
        setImageModel(ai.imageModel || "");
        setImageBase(ai.imageBase || "");
      }
    }).catch(() => {});
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const handleQuickSwitch = useCallback(async (model: string) => {
    setSaving(true);
    try {
      await updateSessionConfig({ aiImageModel: model } as Record<string, string>);
      setImageModel(model);
    } catch { /* ignore */ }
    setSaving(false);
    setShowDropdown(false);
  }, []);

  const shortName = imageModel.length > 25 ? imageModel.slice(0, 22) + "..." : imageModel;

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Current model display + dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-white/30 text-xs text-white/70 transition"
          >
            <svg className="w-3.5 h-3.5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className={saving ? "opacity-50" : ""}>{shortName || "未配置模型"}</span>
            <svg className="w-3 h-3 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showDropdown && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 w-72 bg-[#1e1e2e] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                <div className="px-3 py-2 border-b border-white/10">
                  <span className="text-[10px] text-white/40">快速切换图像模型</span>
                </div>
                {QUICK_MODELS.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => handleQuickSwitch(m.value)}
                    className={`w-full text-left px-3 py-2.5 text-xs hover:bg-white/10 transition flex items-center justify-between ${
                      imageModel === m.value ? "text-orange-400 bg-orange-500/10" : "text-white/70"
                    }`}
                  >
                    <div>
                      <div className="font-medium">{m.label}</div>
                      <div className="text-[10px] text-white/30 mt-0.5">{m.desc}</div>
                    </div>
                    {imageModel === m.value && (
                      <svg className="w-4 h-4 text-orange-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
                <div className="border-t border-white/10">
                  <button
                    onClick={() => { setShowDropdown(false); setShowConfig(true); }}
                    className="w-full text-left px-3 py-2.5 text-xs text-blue-400 hover:bg-white/10 transition flex items-center gap-2"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    API 完整配置...
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <AiConfigDialog open={showConfig} onClose={() => { setShowConfig(false); loadConfig(); }} />
    </>
  );
}

const QUICK_MODELS = [
  { value: "gemini-3-pro-image-preview", label: "Gemini 3 Pro Image", desc: "多模态生成，支持参考图" },
  { value: "nano-banana-pro-preview", label: "Nano Banana Pro", desc: "快速生成，性价比高" },
  { value: "imagen-4.0-generate-001", label: "Imagen 4.0", desc: "Google 高质量图像生成" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", desc: "文本+视觉理解" },
];
