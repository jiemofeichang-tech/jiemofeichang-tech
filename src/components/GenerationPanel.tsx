"use client";

import { useState, useCallback } from "react";
import { MODES, CAMERA_PRESETS, MOTION_SPEEDS, type GenerationParams } from "@/lib/api";

interface GenerationPanelProps {
  params: GenerationParams;
  onChange: (params: GenerationParams) => void;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

export default function GenerationPanel({ params, onChange }: GenerationPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const set = useCallback(
    (patch: Partial<GenerationParams>) => onChange({ ...params, ...patch }),
    [params, onChange]
  );

  const needsSourceImage = params.mode === "image_to_video";
  const needsFirstFrame = ["first_frame", "first_last_frame"].includes(params.mode);
  const needsLastFrame = params.mode === "first_last_frame";
  const needsImageRefs = ["image_to_video", "first_frame", "first_last_frame"].includes(params.mode);
  const needsVideoRefs = params.mode === "video_reference";
  const needsTaskRef = params.mode === "extend_video";

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, key: "sourceImage" | "firstFrame" | "lastFrame") => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    set({ [key]: dataUrl });
  };

  const handleMultiImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const urls = await Promise.all(files.map(readFileAsDataUrl));
    set({ imageRefs: [...(params.imageRefs || []), ...urls] });
  };

  return (
    <div style={{ width: "100%", maxWidth: 680, margin: "12px auto 0" }}>
      {/* Mode cards row */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginBottom: 8 }}>
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => set({ mode: m.id })}
            style={{
              padding: "5px 12px", borderRadius: 8, fontSize: 12,
              color: params.mode === m.id ? "#fff" : "var(--text-secondary)",
              backgroundColor: params.mode === m.id ? "rgba(232,135,91,0.8)" : "var(--bg-card)",
              border: params.mode === m.id ? "1px solid var(--accent-orange)" : "1px solid var(--border)",
              transition: "all 0.2s",
            }}
            title={m.desc}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex", alignItems: "center", gap: 6, margin: "0 auto",
          padding: "4px 14px", borderRadius: 8, fontSize: 12,
          color: "var(--text-muted)", backgroundColor: "transparent",
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {expanded
            ? <polyline points="18 15 12 9 6 15" />
            : <polyline points="6 9 12 15 18 9" />}
        </svg>
        {expanded ? "收起高级参数" : "展开高级参数"}
      </button>

      {expanded && (
        <div style={{
          backgroundColor: "var(--bg-card)", border: "1px solid var(--border)",
          borderRadius: 12, padding: 16, marginTop: 8,
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
        }}>
          {/* Resolution */}
          <label style={labelStyle}>
            <span style={labelTextStyle}>分辨率</span>
            <select value={params.resolution} onChange={(e) => set({ resolution: e.target.value })} style={selectStyle}>
              <option value="480p">480p</option>
              <option value="720p">720p</option>
            </select>
          </label>

          {/* Ratio */}
          <label style={labelStyle}>
            <span style={labelTextStyle}>画面比例</span>
            <select value={params.ratio} onChange={(e) => set({ ratio: e.target.value })} style={selectStyle}>
              {["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"].map((r) => (
                <option key={r} value={r}>{r === "adaptive" ? "自适应" : r}</option>
              ))}
            </select>
          </label>

          {/* Duration */}
          <label style={labelStyle}>
            <span style={labelTextStyle}>时长</span>
            <select value={params.duration} onChange={(e) => set({ duration: Number(e.target.value) })} style={selectStyle}>
              {[-1, 4, 5, 6, 7, 8, 9, 10, 12, 15].map((d) => (
                <option key={d} value={d}>{d === -1 ? "自动" : `${d}秒`}</option>
              ))}
            </select>
          </label>

          {/* Camera */}
          <label style={labelStyle}>
            <span style={labelTextStyle}>镜头预设</span>
            <select value={params.cameraPreset} onChange={(e) => set({ cameraPreset: e.target.value })} style={selectStyle}>
              {CAMERA_PRESETS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>

          {/* Motion speed */}
          <label style={labelStyle}>
            <span style={labelTextStyle}>运动速度</span>
            <select value={params.motionSpeed} onChange={(e) => set({ motionSpeed: e.target.value })} style={selectStyle}>
              {MOTION_SPEEDS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>

          {/* Audio */}
          <label style={labelStyle}>
            <span style={labelTextStyle}>生成音频</span>
            <select value={params.generateAudio ? "true" : "false"} onChange={(e) => set({ generateAudio: e.target.value === "true" })} style={selectStyle}>
              <option value="false">关闭</option>
              <option value="true">开启</option>
            </select>
          </label>

          {/* Conditional image uploads - full width */}
          {needsSourceImage && (
            <div style={{ gridColumn: "1 / -1" }}>
              <UploadField
                label="主参考图"
                value={params.sourceImage}
                onUpload={(e) => handleImageUpload(e, "sourceImage")}
                onClear={() => set({ sourceImage: undefined })}
              />
            </div>
          )}

          {needsFirstFrame && (
            <div style={{ gridColumn: "1 / -1" }}>
              <UploadField
                label="首帧图片"
                value={params.firstFrame}
                onUpload={(e) => handleImageUpload(e, "firstFrame")}
                onClear={() => set({ firstFrame: undefined })}
              />
            </div>
          )}

          {needsLastFrame && (
            <div style={{ gridColumn: "1 / -1" }}>
              <UploadField
                label="尾帧图片"
                value={params.lastFrame}
                onUpload={(e) => handleImageUpload(e, "lastFrame")}
                onClear={() => set({ lastFrame: undefined })}
              />
            </div>
          )}

          {needsImageRefs && (
            <div style={{ gridColumn: "1 / -1" }}>
              <span style={{ ...labelTextStyle, display: "block", marginBottom: 6 }}>补充参考图</span>
              <input type="file" accept="image/*" multiple onChange={handleMultiImageUpload} style={{ fontSize: 12, color: "var(--text-secondary)" }} />
              {params.imageRefs && params.imageRefs.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {params.imageRefs.map((url, i) => (
                    <div key={i} style={{ position: "relative" }}>
                      <img src={url} alt={`ref-${i}`} style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }} />
                      <button
                        onClick={() => set({ imageRefs: params.imageRefs!.filter((_, j) => j !== i) })}
                        style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: "50%", backgroundColor: "var(--accent-pink)", color: "#fff", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" }}
                      >x</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {needsVideoRefs && (
            <div style={{ gridColumn: "1 / -1" }}>
              <span style={{ ...labelTextStyle, display: "block", marginBottom: 6 }}>视频参考URL（每行一个）</span>
              <textarea
                value={(params.videoRefs || []).join("\n")}
                onChange={(e) => set({ videoRefs: e.target.value.split("\n").filter(Boolean) })}
                rows={3}
                style={{ ...selectStyle, resize: "vertical", width: "100%" }}
                placeholder="https://example.com/video.mp4"
              />
            </div>
          )}

          {needsTaskRef && (
            <div style={{ gridColumn: "1 / -1" }}>
              <span style={{ ...labelTextStyle, display: "block", marginBottom: 6 }}>延长任务ID</span>
              <input
                value={params.taskReference || ""}
                onChange={(e) => set({ taskReference: e.target.value })}
                style={selectStyle}
                placeholder="输入要延长的任务ID"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UploadField({ label, value, onUpload, onClear }: {
  label: string;
  value?: string;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <span style={{ ...labelTextStyle, display: "block", marginBottom: 6 }}>{label}</span>
      {value ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img src={value} alt={label} style={{ width: 80, height: 60, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }} />
          <button onClick={onClear} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 12, color: "var(--text-muted)", backgroundColor: "var(--bg-hover)", border: "1px solid var(--border)" }}>
            清除
          </button>
        </div>
      ) : (
        <input type="file" accept="image/*" onChange={onUpload} style={{ fontSize: 12, color: "var(--text-secondary)" }} />
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };
const labelTextStyle: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)", fontWeight: 500 };
const selectStyle: React.CSSProperties = {
  padding: "6px 10px", borderRadius: 8, fontSize: 13,
  backgroundColor: "var(--bg-input)", border: "1px solid var(--border)",
  color: "var(--text-primary)", outline: "none",
};
