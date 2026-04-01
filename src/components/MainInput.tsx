"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { buildPayload, createTask, type GenerationParams, type TaskRecord } from "@/lib/api";
import { STORY_TYPES } from "@/lib/prompt-system";
import { styleCategories, styleItems as allStyles, type StyleCategory } from "@/lib/styles-data";

interface MainInputProps {
  prompt: string;
  setPrompt: (val: string) => void;
  generationParams: GenerationParams;
  onTaskCreated: (task: TaskRecord) => void;
  storyType?: string;
  onClearStoryType?: () => void;
}

const assetGroups = [
  { label: "角色资产", items: ["武士角色", "精灵角色", "机甲战士"] },
  { label: "场景资产", items: ["樱花森林", "赛博都市", "夜色片场"] },
  { label: "风格模板", items: ["水墨风", "赛博朋克", "日系动画", "写实电影感"] },
] as const;

export default function MainInput({
  prompt,
  setPrompt,
  generationParams,
  onTaskCreated,
  storyType,
  onClearStoryType,
}: MainInputProps) {
  const [mode, setMode] = useState<"managed" | "chat">("managed");
  const [isSending, setIsSending] = useState(false);
  const [showStyles, setShowStyles] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [showAssets, setShowAssets] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [scriptText, setScriptText] = useState("");
  const [error, setError] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<{ id: string; data: string; name: string }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: FileList | File[]) => {
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    const maxSize = 5 * 1024 * 1024;
    const maxCount = 5;

    Array.from(files).forEach((file) => {
      if (!allowed.includes(file.type) || file.size > maxSize) return;

      setUploadedFiles((prev) => {
        if (prev.length >= maxCount) return prev;

        const reader = new FileReader();
        reader.onload = () => {
          setUploadedFiles((current) => {
            if (current.length >= maxCount) return current;
            return [...current, { id: `${Date.now()}-${Math.random()}`, data: reader.result as string, name: file.name }];
          });
        };
        reader.readAsDataURL(file);
        return prev;
      });
    });
  }, []);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addFiles(e.target.files);
    e.target.value = "";
  }, [addFiles]);

  const removeFile = useCallback((id: string) => {
    setUploadedFiles((prev) => prev.filter((file) => file.id !== id));
  }, []);

  const handleSend = useCallback(async () => {
    if (!prompt.trim() || isSending) return;

    setIsSending(true);
    setError("");

    try {
      const payload = buildPayload(prompt, generationParams, storyType);
      const meta = {
        title: prompt.slice(0, 48),
        mode: generationParams.mode,
        storyType: storyType || undefined,
      };
      const task = await createTask(payload, meta);
      onTaskCreated(task);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSending(false);
    }
  }, [generationParams, isSending, onTaskCreated, prompt, storyType]);

  const applyUploadedFiles = useCallback(() => {
    if (uploadedFiles.length === 0) return;

    const names = uploadedFiles.map((file) => file.name.replace(/\.[^.]+$/, "")).join("、");
    setPrompt(`${prompt}${prompt ? "\n" : ""}【参考图片】${names}`);
    setShowUpload(false);
  }, [prompt, setPrompt, uploadedFiles]);

  const storyTypeInfo = storyType ? STORY_TYPES.find((item) => item.id === storyType) : null;

  return (
    <div data-home-hero="composer" style={{ width: "100%", maxWidth: "100%", margin: "0 auto", position: "relative" }}>
      <div
        className=""
        style={{
          position: "absolute",
          top: -26,
          right: -6,
          width: 82,
          height: 82,
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          filter: "drop-shadow(0 16px 26px rgba(0,0,0,0.28))",
        }}
      >
        <img src="/assets/logo.png" alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>

      <div
        style={{
          borderRadius: 4,
          border: "2px solid var(--border)",
          background: "var(--bg-card)",
          overflow: "hidden",
          transition: "border-color 0.3s, transform 0.3s",
          boxShadow: "none",
        }}
      >
        <div style={{ padding: "26px 28px 12px" }}>
          {storyTypeInfo && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 12px",
                borderRadius: 2,
                backgroundColor: "rgba(212,98,42,0.15)",
                border: "1px solid rgba(212,98,42,0.3)",
                marginBottom: 12,
                fontSize: 13,
                color: "var(--accent-pink)",
                fontWeight: 500,
              }}
            >
              <span>{storyTypeInfo.icon}</span>
              <span>{storyTypeInfo.label}模式</span>
              <button
                type="button"
                onClick={onClearStoryType}
                style={{
                  marginLeft: 4,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(255,255,255,0.12)",
                  color: "rgba(255,255,255,0.58)",
                  fontSize: 12,
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>
          )}

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="输入一句剧情、一个角色，或一段镜头感受，马上开始生成你的 AI 漫剧。"
            rows={3}
            style={{
              width: "100%",
              backgroundColor: "transparent",
              border: "none",
              outline: "none",
              color: "rgba(255,255,255,0.94)",
              fontSize: 17,
              lineHeight: "29px",
              resize: "none",
            }}
          />
        </div>

        {error && (
          <div style={{ padding: "0 24px 8px", color: "#ef4444", fontSize: 12 }}>{error}</div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            padding: "12px 20px 20px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(2,8,23,0.14)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <ToolBtn label="+" onClick={() => setShowUpload(true)} />
            <ToolBtn icon={<DocIcon />} label="脚本输入" onClick={() => setShowScript(true)} />
            <ToolBtn
              icon={<span style={{ width: 14, height: 14, borderRadius: 2, background: "linear-gradient(135deg, #d4622a, #c49a3a, #e8783c)", display: "inline-block" }} />}
              label="风格库"
              onClick={() => setShowStyles(true)}
            />
            <ToolBtn icon={<AssetIcon />} label="我的资产" onClick={() => setShowAssets(true)} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                display: "flex",
                borderRadius: 2,
                overflow: "hidden",
                backgroundColor: "var(--bg-input)",
                padding: 3,
                border: "1px solid var(--border)",
              }}
            >
              <button
                type="button"
                onClick={() => setMode("managed")}
                style={{
                  padding: "7px 14px",
                  fontSize: 14,
                  fontWeight: 500,
                  borderRadius: 2,
                  color: mode === "managed" ? "var(--text-primary)" : "rgba(255,255,255,0.5)",
                  backgroundColor: mode === "managed" ? "rgba(255,255,255,0.08)" : "var(--bg-hover)",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  transition: "all 0.2s",
                }}
              >
                <span style={{ color: "var(--accent-yellow)" }}>✦</span>
                托管模式
              </button>
              <button
                type="button"
                onClick={() => setMode("chat")}
                style={{
                  padding: "7px 14px",
                  fontSize: 14,
                  fontWeight: 500,
                  borderRadius: 2,
                  color: mode === "chat" ? "var(--text-primary)" : "rgba(255,255,255,0.5)",
                  backgroundColor: mode === "chat" ? "rgba(255,255,255,0.08)" : "var(--bg-hover)",
                  transition: "all 0.2s",
                }}
              >
                对话模式
              </button>
            </div>

            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!prompt.trim() || isSending}
              style={{
                width: 48,
                height: 48,
                borderRadius: 4,
                background: prompt.trim() && !isSending
                  ? "linear-gradient(135deg, var(--accent-pink), var(--accent-orange))"
                  : "rgba(255,255,255,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: prompt.trim() ? "#fff" : "rgba(255,255,255,0.4)",
                transition: "all 0.2s",
                opacity: isSending ? 0.6 : 1,
                boxShadow: prompt.trim() && !isSending ? "0 14px 28px rgba(255, 141, 77, 0.28)" : "none",
              }}
            >
              {isSending ? (
                <span style={{ fontSize: 14 }}>···</span>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {showUpload && (
        <ToolPopup onClose={() => setShowUpload(false)} title="上传参考图片">
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleFileDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            style={{
              border: `2px dashed ${isDragging ? "var(--accent-pink)" : "rgba(255,255,255,0.12)"}`,
              borderRadius: 2,
              padding: "40px 20px",
              textAlign: "center",
              transition: "border-color 0.2s, background 0.2s",
              background: isDragging ? "rgba(255,180,84,0.08)" : "transparent",
            }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.42)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.84)", marginBottom: 4 }}>拖拽图片到这里，或者点击选择</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.48)" }}>支持 JPG、PNG、GIF、WebP，单张不超过 5MB，最多 5 张。</p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            hidden
            onChange={handleFileChange}
          />

          {uploadedFiles.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
              {uploadedFiles.map((file) => (
                <div
                  key={file.id}
                  style={{
                    position: "relative",
                    width: 72,
                    height: 72,
                    borderRadius: 2,
                    overflow: "hidden",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                >
                  <img src={file.data} alt={file.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(file.id);
                    }}
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: "rgba(0,0,0,0.7)",
                      color: "#fff",
                      fontSize: 12,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button
              type="button"
              onClick={() => setShowUpload(false)}
              style={{
                padding: "8px 16px",
                borderRadius: 2,
                fontSize: 13,
                color: "rgba(255,255,255,0.8)",
                backgroundColor: "var(--bg-hover)",
              }}
            >
              取消
            </button>
            {uploadedFiles.length > 0 && (
              <button
                type="button"
                onClick={applyUploadedFiles}
                style={{
                  padding: "8px 16px",
                  borderRadius: 2,
                  fontSize: 13,
                  color: "#fff",
                  background: "linear-gradient(135deg, var(--accent-pink), var(--accent-orange))",
                  fontWeight: 500,
                }}
              >
                确认添加（{uploadedFiles.length}）
              </button>
            )}
          </div>
        </ToolPopup>
      )}

      {showScript && (
        <ToolPopup onClose={() => setShowScript(false)} title="脚本输入">
          <textarea
            value={scriptText}
            onChange={(e) => setScriptText(e.target.value)}
            placeholder={"在这里输入你的脚本。\n\n例如：\n第一幕：一位武士站在樱花树下。\n第二幕：远处传来战鼓声。\n第三幕：武士拔出长刀，准备迎战。"}
            style={{
              width: "100%",
              height: 220,
              backgroundColor: "rgba(255,255,255,0.05)",
              border: "1px solid var(--border)",
              borderRadius: 2,
              padding: 12,
              color: "var(--text-primary)",
              fontSize: 13,
              lineHeight: "22px",
              resize: "vertical",
              outline: "none",
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <button
              type="button"
              onClick={() => setShowScript(false)}
              style={{ padding: "8px 16px", borderRadius: 2, fontSize: 13, color: "rgba(255,255,255,0.8)", backgroundColor: "var(--bg-hover)" }}
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                if (scriptText.trim()) setPrompt(scriptText);
                setShowScript(false);
              }}
              style={{
                padding: "8px 16px",
                borderRadius: 10,
                fontSize: 13,
                color: "#fff",
                background: "linear-gradient(135deg, var(--accent-pink), var(--accent-orange))",
                fontWeight: 500,
              }}
            >
              应用脚本
            </button>
          </div>
        </ToolPopup>
      )}

      {showStyles && (
        <StyleGallery
          onClose={() => setShowStyles(false)}
          onSelect={(name) => {
            setPrompt(`${prompt}${prompt ? " " : ""}【${name}】`);
            setShowStyles(false);
          }}
        />
      )}

      {showAssets && (
        <ToolPopup onClose={() => setShowAssets(false)} title="我的资产">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {assetGroups.map((group) => (
              <div key={group.label} style={{ borderRadius: 2, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <div
                  style={{
                    padding: "10px 14px",
                    backgroundColor: "rgba(255,255,255,0.05)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{group.label}</span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.42)" }}>{group.items.length} 项</span>
                </div>
                <div style={{ padding: "10px 14px", display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {group.items.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setPrompt(`${prompt}${prompt ? " " : ""}【${item}】`);
                        setShowAssets(false);
                      }}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 2,
                        backgroundColor: "var(--bg-hover)",
                        fontSize: 12,
                        color: "rgba(255,255,255,0.84)",
                        border: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
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
    return allStyles.filter((item) => item.categories.includes(activeCategory));
  }, [activeCategory]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        backgroundColor: "rgba(2,8,23,0.74)",
        backdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          width: "90vw",
          maxWidth: 1100,
          height: "85vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "none",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--accent-pink)" }}>风格库</h3>
          <button type="button" onClick={onClose} style={{ width: 32, height: 32, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.5)", fontSize: 20, backgroundColor: "var(--bg-hover)" }}>×</button>
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, flexWrap: "wrap" }}>
          {styleCategories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(category)}
              style={{
                padding: "6px 16px",
                borderRadius: 2,
                fontSize: 13,
                fontWeight: 500,
                color: activeCategory === category ? "#fff" : "rgba(255,255,255,0.6)",
                backgroundColor: activeCategory === category ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)",
                border: activeCategory === category ? "1px solid rgba(255,255,255,0.2)" : "1px solid transparent",
                transition: "all 0.2s",
              }}
            >
              {category}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
            {filteredStyles.map((styleItem) => (
              <button
                key={styleItem.name}
                type="button"
                onClick={() => onSelect(styleItem.name)}
                style={{
                  borderRadius: 2,
                  overflow: "hidden",
                  border: "1px solid var(--border)",
                  transition: "all 0.2s",
                  backgroundColor: "rgba(255,255,255,0.02)",
                  textAlign: "left",
                }}
              >
                <div style={{ position: "relative", paddingTop: "133%", overflow: "hidden", backgroundColor: "#111" }}>
                  <img
                    src={styleItem.cover}
                    alt={styleItem.name}
                    loading="lazy"
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </div>
                <div style={{ padding: "10px 12px", fontSize: 13, color: "rgba(255,255,255,0.88)", textAlign: "center", fontWeight: 500 }}>
                  {styleItem.name}
                </div>
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
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        backgroundColor: "rgba(2,8,23,0.64)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          width: 480,
          maxWidth: "92vw",
          maxHeight: "80vh",
          overflow: "auto",
          boxShadow: "none",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{title}</h3>
          <button type="button" onClick={onClose} style={{ width: 28, height: 28, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.4)", fontSize: 16 }}>×</button>
        </div>
        <div style={{ padding: 16 }}>{children}</div>
      </div>
    </div>
  );
}

function ToolBtn({ icon, label, onClick }: { icon?: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 14px",
        borderRadius: 2,
        fontSize: 14,
        color: "var(--text-secondary)",
        backgroundColor: "var(--bg-hover)",
        transition: "all 0.2s",
        border: "1px solid var(--border)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function DocIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function AssetIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
