"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
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
    <div style={{ width: "100%", position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: -10,
          right: 20,
          width: 64,
          height: 64,
          zIndex: 2,
          borderRadius: 22,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.05))",
          border: "1px solid rgba(255,255,255,0.12)",
          backdropFilter: "blur(18px)",
          boxShadow: "0 24px 48px rgba(0,0,0,0.2)",
        }}
      >
        <img src="/assets/logo.png" alt="Logo" style={{ width: 34, height: 34, objectFit: "contain" }} />
      </div>

      <div
        style={{
          borderRadius: 32,
          border: "1px solid rgba(255,255,255,0.1)",
          background: "linear-gradient(180deg, rgba(16,20,30,0.94), rgba(11,14,22,0.92))",
          boxShadow: "0 34px 90px rgba(0,0,0,0.28)",
          backdropFilter: "blur(24px)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "30px 32px 14px" }}>
          {storyTypeInfo && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 14,
                padding: "7px 14px",
                borderRadius: 999,
                backgroundColor: "rgba(130,182,255,0.14)",
                border: "1px solid rgba(130,182,255,0.2)",
                color: "var(--accent-hot-pink)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <span>{storyTypeInfo.icon}</span>
              <span>{storyTypeInfo.label}模式</span>
              <button
                type="button"
                onClick={onClearStoryType}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 999,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "rgba(255,255,255,0.7)",
                  background: "rgba(255,255,255,0.08)",
                  fontSize: 12,
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
              border: "none",
              outline: "none",
              resize: "none",
              background: "transparent",
              color: "rgba(255,255,255,0.96)",
              fontSize: 18,
              lineHeight: "31px",
            }}
          />
        </div>

        {error && <div style={{ padding: "0 32px 10px", color: "#ff8a80", fontSize: 12 }}>{error}</div>}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            padding: "16px 24px 24px",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.025)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <ToolButton label="添加素材" onClick={() => setShowUpload(true)} icon={<PlusIcon />} />
            <ToolButton label="脚本输入" onClick={() => setShowScript(true)} icon={<DocIcon />} />
            <ToolButton label="风格库" onClick={() => setShowStyles(true)} icon={<PaletteIcon />} />
            <ToolButton label="我的资产" onClick={() => setShowAssets(true)} icon={<AssetIcon />} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: 4,
                borderRadius: 999,
                backgroundColor: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <SegmentButton active={mode === "managed"} onClick={() => setMode("managed")} label="✦ 托管模式" />
              <SegmentButton active={mode === "chat"} onClick={() => setMode("chat")} label="对话模式" />
            </div>

            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!prompt.trim() || isSending}
              style={{
                width: 52,
                height: 52,
                borderRadius: 999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid rgba(255,255,255,0.1)",
                background: prompt.trim() && !isSending
                  ? "linear-gradient(180deg, rgba(130,182,255,0.38), rgba(77,132,255,0.22))"
                  : "rgba(255,255,255,0.08)",
                color: prompt.trim() ? "#fff" : "rgba(255,255,255,0.4)",
                boxShadow: prompt.trim() && !isSending ? "0 18px 36px rgba(77,132,255,0.24)" : "none",
                opacity: isSending ? 0.65 : 1,
              }}
            >
              {isSending ? <span style={{ fontSize: 13 }}>···</span> : <ArrowUpIcon />}
            </button>
          </div>
        </div>
      </div>

      {showUpload && (
        <PopupShell onClose={() => setShowUpload(false)} title="上传参考图片">
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleFileDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            style={{
              padding: "40px 20px",
              borderRadius: 24,
              border: `1px dashed ${isDragging ? "rgba(130,182,255,0.4)" : "rgba(255,255,255,0.14)"}`,
              background: isDragging ? "rgba(130,182,255,0.08)" : "rgba(255,255,255,0.02)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                margin: "0 auto 12px",
                borderRadius: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <UploadIcon />
            </div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.88)" }}>拖拽图片到这里，或点击选择</div>
            <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.7, color: "var(--text-muted)" }}>
              支持 JPG、PNG、GIF、WebP，单张不超过 5MB，最多 5 张。
            </div>
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
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
              {uploadedFiles.map((file) => (
                <div
                  key={file.id}
                  style={{
                    position: "relative",
                    width: 78,
                    height: 78,
                    borderRadius: 20,
                    overflow: "hidden",
                    border: "1px solid rgba(255,255,255,0.08)",
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
                      top: 6,
                      right: 6,
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      background: "rgba(0,0,0,0.56)",
                      color: "white",
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

          <PopupActions>
            <GhostButton onClick={() => setShowUpload(false)}>取消</GhostButton>
            {uploadedFiles.length > 0 && <PrimaryButton onClick={applyUploadedFiles}>确认添加</PrimaryButton>}
          </PopupActions>
        </PopupShell>
      )}

      {showScript && (
        <PopupShell onClose={() => setShowScript(false)} title="脚本输入">
          <textarea
            value={scriptText}
            onChange={(e) => setScriptText(e.target.value)}
            placeholder={"在这里输入你的脚本。\n\n例如：\n第一幕：一位武士站在樱花树下。\n第二幕：远处传来战鼓声。\n第三幕：武士拔出长刀，准备迎战。"}
            style={{
              width: "100%",
              height: 220,
              padding: 14,
              borderRadius: 22,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.04)",
              color: "var(--text-primary)",
              fontSize: 13,
              lineHeight: "22px",
              resize: "vertical",
              outline: "none",
            }}
          />
          <PopupActions>
            <GhostButton onClick={() => setShowScript(false)}>取消</GhostButton>
            <PrimaryButton
              onClick={() => {
                if (scriptText.trim()) setPrompt(scriptText);
                setShowScript(false);
              }}
            >
              应用脚本
            </PrimaryButton>
          </PopupActions>
        </PopupShell>
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
        <PopupShell onClose={() => setShowAssets(false)} title="我的资产">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {assetGroups.map((group) => (
              <div
                key={group.label}
                style={{
                  borderRadius: 24,
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <div
                  style={{
                    padding: "12px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "rgba(255,255,255,0.04)",
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{group.label}</span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{group.items.length} 项</span>
                </div>
                <div style={{ padding: "14px 16px", display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {group.items.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setPrompt(`${prompt}${prompt ? " " : ""}【${item}】`);
                        setShowAssets(false);
                      }}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.05)",
                        color: "var(--text-secondary)",
                        fontSize: 12,
                      }}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </PopupShell>
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
        backdropFilter: "blur(18px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "90vw",
          maxWidth: 1100,
          height: "85vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRadius: 28,
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(15,18,26,0.94)",
          boxShadow: "0 34px 100px rgba(0,0,0,0.34)",
          backdropFilter: "blur(28px) saturate(150%)",
        }}
      >
        <PopupHeader title="风格库" onClose={onClose} />

        <div style={{ display: "flex", gap: 8, padding: "14px 24px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexWrap: "wrap" }}>
          {styleCategories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(category)}
              style={{
                padding: "8px 16px",
                borderRadius: 999,
                border: activeCategory === category ? "1px solid rgba(130,182,255,0.22)" : "1px solid transparent",
                background: activeCategory === category ? "rgba(130,182,255,0.18)" : "rgba(255,255,255,0.05)",
                color: activeCategory === category ? "white" : "rgba(255,255,255,0.64)",
                fontSize: 13,
                fontWeight: 600,
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
                  borderRadius: 22,
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.03)",
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
                <div style={{ padding: "12px 12px 14px", fontSize: 13, color: "rgba(255,255,255,0.88)", textAlign: "center", fontWeight: 600 }}>
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

function PopupShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        backgroundColor: "rgba(2,8,23,0.64)",
        backdropFilter: "blur(18px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480,
          maxWidth: "92vw",
          maxHeight: "80vh",
          overflow: "auto",
          borderRadius: 28,
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(15,18,26,0.94)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.32)",
          backdropFilter: "blur(24px) saturate(150%)",
        }}
      >
        <PopupHeader title={title} onClose={onClose} />
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>
  );
}

function PopupHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px 14px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{title}</h3>
      <button
        type="button"
        onClick={onClose}
        style={{
          width: 34,
          height: 34,
          borderRadius: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(255,255,255,0.72)",
          backgroundColor: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        ×
      </button>
    </div>
  );
}

function PopupActions({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
      {children}
    </div>
  );
}

function ToolButton({ icon, label, onClick }: { icon?: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "10px 14px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.08)",
        backgroundColor: "rgba(255,255,255,0.05)",
        color: "var(--text-secondary)",
        fontSize: 14,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function SegmentButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "9px 15px",
        borderRadius: 999,
        background: active ? "rgba(130,182,255,0.18)" : "transparent",
        color: active ? "var(--text-primary)" : "rgba(255,255,255,0.5)",
        fontSize: 14,
        fontWeight: 600,
      }}
    >
      {label}
    </button>
  );
}

function GhostButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "10px 16px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.05)",
        color: "var(--text-secondary)",
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}

function PrimaryButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "10px 16px",
        borderRadius: 999,
        border: "1px solid rgba(130,182,255,0.2)",
        background: "linear-gradient(180deg, rgba(130,182,255,0.3), rgba(77,132,255,0.16))",
        color: "white",
        fontSize: 13,
        fontWeight: 650,
      }}
    >
      {children}
    </button>
  );
}

function BaseIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function PlusIcon() {
  return (
    <BaseIcon>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </BaseIcon>
  );
}

function ArrowUpIcon() {
  return (
    <BaseIcon>
      <path d="M12 19V5" />
      <path d="m6 11 6-6 6 6" />
    </BaseIcon>
  );
}

function DocIcon() {
  return (
    <BaseIcon>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </BaseIcon>
  );
}

function PaletteIcon() {
  return (
    <BaseIcon>
      <path d="M12 4a8 8 0 0 0 0 16h1.2a1.8 1.8 0 0 0 1.3-3 1.8 1.8 0 0 1 1.4-3H17a3 3 0 0 0 0-6 5.7 5.7 0 0 0-5-4Z" />
      <path d="M7.5 11h.01" />
      <path d="M9.5 7.5h.01" />
      <path d="M14.5 7.5h.01" />
    </BaseIcon>
  );
}

function AssetIcon() {
  return (
    <BaseIcon>
      <rect x="4" y="5" width="16" height="14" rx="3" />
      <path d="M9 10h6" />
      <path d="M10 14h4" />
    </BaseIcon>
  );
}

function UploadIcon() {
  return (
    <BaseIcon>
      <path d="M12 16V6" />
      <path d="m7 10 5-5 5 5" />
      <path d="M5 19h14" />
    </BaseIcon>
  );
}
