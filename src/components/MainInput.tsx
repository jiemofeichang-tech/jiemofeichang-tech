"use client";

import { useState, useMemo } from "react";
import { createTask, buildPayload, type GenerationParams, type TaskRecord } from "@/lib/api";
import { styleItems as allStyles, styleCategories, type StyleCategory } from "@/lib/styles-data";

interface MainInputProps {
  prompt: string;
  setPrompt: (val: string) => void;
  generationParams: GenerationParams;
  onTaskCreated: (task: TaskRecord) => void;
}

export default function MainInput({ prompt, setPrompt, generationParams, onTaskCreated }: MainInputProps) {
  const [mode, setMode] = useState<"managed" | "chat">("managed");
  const [isSending, setIsSending] = useState(false);
  const [showStyles, setShowStyles] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [showAssets, setShowAssets] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [scriptText, setScriptText] = useState("");
  const [error, setError] = useState("");

  const handleSend = async () => {
    if (!prompt.trim() || isSending) return;
    setIsSending(true);
    setError("");
    try {
      const payload = buildPayload(prompt, generationParams);
      const meta = {
        title: prompt.slice(0, 48),
        mode: generationParams.mode,
      };
      const task = await createTask(payload, meta);
      onTaskCreated(task);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div style={{ width: "100%", maxWidth: 900, margin: "0 auto", position: "relative" }}>
      {/* Mascot */}
      <div className="animate-float" style={{ position: "absolute", top: -30, right: -10, width: 90, height: 90, zIndex: 2 }}>
        <svg width="90" height="90" viewBox="0 0 90 90" fill="none">
          <ellipse cx="50" cy="55" rx="28" ry="24" fill="#FD69CF" opacity="0.9"/>
          <circle cx="50" cy="38" r="20" fill="#FD69CF"/>
          <path d="M35 20 Q33 10 38 7 Q40 12 42 17" fill="#FF4D9E"/><path d="M45 16 Q44 6 48 3 Q50 9 52 14" fill="#FF69B4"/>
          <path d="M55 18 Q54 8 58 5 Q60 11 61 16" fill="#FF4D9E"/><path d="M62 22 Q62 14 66 11 Q67 16 66 20" fill="#FF69B4"/>
          <ellipse cx="32" cy="24" rx="5" ry="10" fill="#FD69CF" transform="rotate(-15 32 24)"/>
          <ellipse cx="66" cy="24" rx="5" ry="10" fill="#FD69CF" transform="rotate(15 66 24)"/>
          <circle cx="42" cy="36" r="3" fill="#1a1a2e"/><circle cx="58" cy="36" r="3" fill="#1a1a2e"/>
          <circle cx="43" cy="35" r="1" fill="white"/><circle cx="59" cy="35" r="1" fill="white"/>
          <circle cx="36" cy="42" r="3" fill="#ff9ed6" opacity="0.5"/><circle cx="64" cy="42" r="3" fill="#ff9ed6" opacity="0.5"/>
          <path d="M46 44 Q50 47 54 44" stroke="#1a1a2e" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          <path d="M76 46 L88 40 L88 52 Z" fill="#FF9ED6" opacity="0.8"/>
        </svg>
      </div>

      {/* Input container */}
      <div
        style={{
          borderRadius: 24,
          border: "0.67px solid rgba(255,255,255,0.06)",
          backgroundColor: "rgba(255,255,255,0.01)",
          overflow: "hidden",
          transition: "border-color 0.3s",
        }}
      >
        <div style={{ padding: "24px 28px 10px" }}>
          <textarea
            value={prompt} onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSend(); } }}
            placeholder="拖拽/粘贴 📁 图片到这里，来试试【角色】、【风格】参考"
            rows={3}
            style={{ width: "100%", backgroundColor: "transparent", border: "none", outline: "none", color: "rgba(255,255,255,0.91)", fontSize: 16, lineHeight: "26px", resize: "none" }}
          />
        </div>

        {error && (
          <div style={{ padding: "0 24px 8px", color: "#ef4444", fontSize: 12 }}>{error}</div>
        )}

        {/* Bottom toolbar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 20px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <ToolBtn label="+" onClick={() => setShowUpload(true)} />
            <ToolBtn icon={<DocIcon />} label="脚本" onClick={() => setShowScript(true)} />
            <ToolBtn
              icon={<span style={{ width: 14, height: 14, borderRadius: 4, background: "linear-gradient(135deg, #ff9ed6, #b68bff, #9efae0)", display: "inline-block" }} />}
              label="147 种风格"
              onClick={() => setShowStyles(true)}
            />
            <ToolBtn icon={<AssetIcon />} label="我的资产" onClick={() => setShowAssets(true)} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", borderRadius: 99, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.05)", padding: 2 }}>
              <button onClick={() => setMode("managed")} style={{
                padding: "5px 14px", fontSize: 14, fontWeight: 500, borderRadius: 99,
                color: mode === "managed" ? "var(--text-primary)" : "rgba(255,255,255,0.5)",
                backgroundColor: mode === "managed" ? "rgba(255,255,255,0.05)" : "transparent",
                display: "flex", alignItems: "center", gap: 4, transition: "all 0.2s",
              }}>
                <span style={{ color: "var(--accent-yellow)" }}>⚡</span>托管模式
              </button>
              <button onClick={() => setMode("chat")} style={{
                padding: "5px 14px", fontSize: 14, fontWeight: 500, borderRadius: 99,
                color: mode === "chat" ? "var(--text-primary)" : "rgba(255,255,255,0.5)",
                backgroundColor: mode === "chat" ? "rgba(255,255,255,0.05)" : "transparent",
                transition: "all 0.2s",
              }}>
                对话模式
              </button>
            </div>
            <button onClick={handleSend} disabled={!prompt.trim() || isSending} style={{
              width: 44, height: 44, borderRadius: "50%",
              background: prompt.trim() && !isSending ? "var(--accent-pink)" : "rgba(255,255,255,0.08)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: prompt.trim() ? "#fff" : "rgba(255,255,255,0.4)",
              transition: "all 0.2s", opacity: isSending ? 0.6 : 1,
            }}>
              {isSending ? <span style={{ fontSize: 14 }}>⏳</span> : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Upload Popup */}
      {showUpload && (
        <ToolPopup onClose={() => setShowUpload(false)} title="上传文件">
          <div style={{ border: "2px dashed rgba(255,255,255,0.1)", borderRadius: 12, padding: "40px 20px", textAlign: "center" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12, opacity: 0.5 }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", marginBottom: 4 }}>拖拽文件到此处，或点击上传</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>支持 JPG, PNG, GIF, WebP 格式</p>
            <button onClick={() => setShowUpload(false)} style={{ marginTop: 16, padding: "8px 24px", borderRadius: 8, backgroundColor: "var(--accent-pink)", color: "#fff", fontSize: 13, fontWeight: 500 }}>
              选择文件
            </button>
          </div>
        </ToolPopup>
      )}

      {/* Script Editor Popup */}
      {showScript && (
        <ToolPopup onClose={() => setShowScript(false)} title="剧本编辑器">
          <textarea
            value={scriptText} onChange={(e) => setScriptText(e.target.value)}
            placeholder={"在此输入您的剧本内容...\n\n例如：\n第一幕：一位武士站在樱花树下\n第二幕：远处传来战鼓声\n第三幕：武士拔出长刀，转身面对敌人"}
            style={{ width: "100%", height: 200, backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: 12, color: "var(--text-primary)", fontSize: 13, lineHeight: "20px", resize: "vertical", outline: "none" }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <button onClick={() => setShowScript(false)} style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13, color: "rgba(255,255,255,0.8)", backgroundColor: "rgba(255,255,255,0.08)" }}>取消</button>
            <button onClick={() => { if (scriptText.trim()) { setPrompt(scriptText); } setShowScript(false); }} style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13, color: "#fff", backgroundColor: "var(--accent-pink)", fontWeight: 500 }}>应用剧本</button>
          </div>
        </ToolPopup>
      )}

      {/* Styles Gallery Popup */}
      {showStyles && (
        <StyleGallery
          onClose={() => setShowStyles(false)}
          onSelect={(name) => { setPrompt(prompt + `【${name}】`); setShowStyles(false); }}
        />
      )}

      {/* Assets Popup */}
      {showAssets && (
        <ToolPopup onClose={() => setShowAssets(false)} title="我的资产">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { label: "角色资产", count: 3, items: ["武士角色", "精灵角色", "机甲战士"] },
              { label: "场景资产", count: 2, items: ["樱花森林", "赛博都市"] },
              { label: "风格模板", count: 5, items: ["水墨风", "赛博朋克", "日系动漫", "Q版可爱", "写实风"] },
            ].map((group) => (
              <div key={group.label} style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", backgroundColor: "rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{group.label}</span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{group.count} 个</span>
                </div>
                <div style={{ padding: "8px 14px", display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {group.items.map((item) => (
                    <button key={item} onClick={() => { setPrompt(prompt + `【${item}】`); setShowAssets(false); }} style={{ padding: "4px 10px", borderRadius: 6, backgroundColor: "rgba(255,255,255,0.08)", fontSize: 12, color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ToolPopup>
      )}
    </div>
  );
}

function StyleGallery({ onClose, onSelect }: { onClose: () => void; onSelect: (name: string) => void }) {
  const [activeCategory, setActiveCategory] = useState<StyleCategory>("全部");

  const filteredStyles = useMemo(() => {
    if (activeCategory === "全部") return allStyles;
    return allStyles.filter((s) => s.categories.includes(activeCategory));
  }, [activeCategory]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: "#1a1a1d", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, width: "90vw", maxWidth: 1100, height: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--accent-pink)" }}>风格库</h3>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.5)", fontSize: 20, backgroundColor: "rgba(255,255,255,0.05)" }}>×</button>
        </div>

        {/* Category Tabs */}
        <div style={{ display: "flex", gap: 8, padding: "12px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, flexWrap: "wrap" }}>
          {styleCategories.map((cat) => (
            <button key={cat} onClick={() => setActiveCategory(cat)} style={{
              padding: "6px 16px", borderRadius: 20, fontSize: 13, fontWeight: 500,
              color: activeCategory === cat ? "#fff" : "rgba(255,255,255,0.6)",
              backgroundColor: activeCategory === cat ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)",
              border: activeCategory === cat ? "1px solid rgba(255,255,255,0.2)" : "1px solid transparent",
              transition: "all 0.2s",
            }}>
              {cat}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
            {filteredStyles.map((s) => (
              <button key={s.name} onClick={() => onSelect(s.name)} style={{ borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)", cursor: "pointer", transition: "all 0.2s", backgroundColor: "rgba(255,255,255,0.02)", textAlign: "left" }}>
                <div style={{ position: "relative", paddingTop: "133%", overflow: "hidden", backgroundColor: "#111" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.cover}
                    alt={s.name}
                    loading="lazy"
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </div>
                <div style={{ padding: "8px 10px", fontSize: 13, color: "rgba(255,255,255,0.85)", textAlign: "center", fontWeight: 500 }}>{s.name}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolPopup({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: "#1a1a1d", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, width: 480, maxHeight: "80vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{title}</h3>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.4)", fontSize: 16 }}>×</button>
        </div>
        <div style={{ padding: 16 }}>{children}</div>
      </div>
    </div>
  );
}

function ToolBtn({ icon, label, onClick }: { icon?: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 6, padding: "6px 15px",
      borderRadius: 12, fontSize: 16, color: "rgba(255,255,255,0.8)",
      backgroundColor: "rgba(255,255,255,0.08)", transition: "all 0.2s",
    }}>
      {icon}{label}
    </button>
  );
}

function DocIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
}

function AssetIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/></svg>;
}
