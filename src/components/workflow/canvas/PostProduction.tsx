"use client";
import { useState, useEffect, useCallback } from "react";
import CanvasBlock from "./CanvasBlock";
import {
  wfRenderProject,
  wfGetProject,
  COMPOSE_STAGES_ORDER,
  COMPOSE_STAGE_LABELS,
  type ComposeConfig,
  type ComposeProgress,
  type ComposeError,
} from "@/lib/api";

// ── Types ──

interface PostProductionProps {
  projectId: string;
  projectStatus: string;
  subtitlesSrt: string | null;
  finalOutput: string | null;
  composeProgress?: ComposeProgress | null;
  lastError?: ComposeError | null;
  composeConfig?: Partial<ComposeConfig> | null;
  onSubtitlesChange: (srt: string) => void;
  onRenderComplete: (url: string) => void;
  onStatusChange?: (status: string) => void;
}

const DEFAULT_CONFIG: ComposeConfig = {
  include_subtitles: true,
  subtitle_mode: "burn",
  include_voiceover: false,
  include_bgm: false,
  bgm_source: "auto",
  output_quality: "1080p",
  transition_style: "dissolve",
};

// ── Radio Group ──

function RadioGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <span style={{ fontSize: 12, color: "#aaa", minWidth: 50, flexShrink: 0 }}>{label}:</span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {options.map((opt) => (
          <label
            key={opt.value}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              color: value === opt.value ? "#e0e0e0" : "#888",
              cursor: "pointer",
              padding: "3px 8px",
              borderRadius: 6,
              background: value === opt.value ? "#333" : "transparent",
              border: value === opt.value ? "1px solid #555" : "1px solid transparent",
              transition: "all 0.15s",
            }}
          >
            <input
              type="radio"
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              style={{ display: "none" }}
            />
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                border: `2px solid ${value === opt.value ? "#7c3aed" : "#555"}`,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {value === opt.value && (
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#7c3aed" }} />
              )}
            </span>
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Toggle ──

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <span style={{ fontSize: 12, color: "#aaa", minWidth: 50 }}>{label}:</span>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 40,
          height: 22,
          borderRadius: 11,
          border: "none",
          background: value ? "#7c3aed" : "#444",
          position: "relative",
          cursor: "pointer",
          transition: "background 0.2s",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 3,
            left: value ? 20 : 3,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "#fff",
            transition: "left 0.2s",
          }}
        />
      </button>
      <span style={{ fontSize: 12, color: value ? "#e0e0e0" : "#666" }}>
        {value ? "开启" : "关闭"}
      </span>
    </div>
  );
}

// ── 7-Stage Pipeline ──

function ComposePipeline({ progress, error }: { progress?: ComposeProgress | null; error?: ComposeError | null }) {
  const completed = new Set(progress?.stages_completed || []);
  const current = progress?.current_stage || null;
  const failedStage = error?.failed_stage || null;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: "#aaa", marginBottom: 8 }}>合成阶段流水线:</div>
      <div style={{ display: "flex", alignItems: "center", gap: 2, overflowX: "auto" }}>
        {COMPOSE_STAGES_ORDER.map((stage, i) => {
          let bg = "#333";
          let color = "#666";
          let icon = "⏭";

          if (completed.has(stage)) {
            bg = "#2a3a2a"; color = "#4ade80"; icon = "✅";
          } else if (stage === failedStage) {
            bg = "#3a2a2a"; color = "#f87171"; icon = "❌";
          } else if (stage === current) {
            bg = "#3a3a2a"; color = "#f0c040"; icon = "🔄";
          }

          return (
            <div key={stage} style={{ display: "flex", alignItems: "center" }}>
              <div
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  background: bg,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  border: stage === current ? "1px solid #f0c040" : "1px solid transparent",
                }}
              >
                <span style={{ fontSize: 11 }}>{icon}</span>
                <span style={{ fontSize: 11, color, fontWeight: stage === current ? 600 : 400 }}>
                  {COMPOSE_STAGE_LABELS[stage] || stage}
                </span>
              </div>
              {i < COMPOSE_STAGES_ORDER.length - 1 && (
                <span style={{ color: "#444", fontSize: 10, margin: "0 1px" }}>→</span>
              )}
            </div>
          );
        })}
      </div>
      {progress && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#888" }}>
            <span>{progress.stages_completed.length}/{progress.stages_total} 阶段完成</span>
            <span>{progress.percent}%</span>
          </div>
          <div style={{ height: 3, background: "#333", borderRadius: 2, marginTop: 3, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${progress.percent}%`,
                background: failedStage ? "#f87171" : "#7c3aed",
                borderRadius: 2,
                transition: "width 0.5s",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Error Panel ──

function ErrorPanel({ error, onRetryAll, onRetryFailed }: {
  error: ComposeError;
  onRetryAll: () => void;
  onRetryFailed: () => void;
}) {
  return (
    <div style={{ background: "#2a1a1a", border: "1px solid #f87171", borderRadius: 8, padding: 12, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 14 }}>❌</span>
        <span style={{ fontSize: 13, color: "#f87171", fontWeight: 600 }}>合成失败: {error.message}</span>
      </div>
      {error.detail && <div style={{ fontSize: 11, color: "#ccc", marginBottom: 4 }}>原因: {error.detail}</div>}
      {error.suggestion && <div style={{ fontSize: 11, color: "#f0c040", marginBottom: 10 }}>建议: {error.suggestion}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onRetryAll} style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "#7c3aed", color: "#fff", fontSize: 12, cursor: "pointer" }}>
          重新合成全部
        </button>
        {error.failed_stage && (
          <button onClick={onRetryFailed} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #555", background: "transparent", color: "#ccc", fontSize: 12, cursor: "pointer" }}>
            仅重试失败阶段
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Component ──

export default function PostProduction({
  projectId,
  projectStatus,
  subtitlesSrt,
  finalOutput,
  composeProgress,
  lastError,
  composeConfig: savedConfig,
  onSubtitlesChange,
  onRenderComplete,
  onStatusChange,
}: PostProductionProps) {
  const [config, setConfig] = useState<ComposeConfig>({ ...DEFAULT_CONFIG, ...savedConfig });
  const [rendering, setRendering] = useState(projectStatus === "compositing");

  // 同步外部 prop 变化
  useEffect(() => { setConfig({ ...DEFAULT_CONFIG, ...savedConfig }); }, [savedConfig]);
  useEffect(() => { setRendering(projectStatus === "compositing"); }, [projectStatus]);
  const [error, setError] = useState<string | null>(null);
  const [liveProgress, setLiveProgress] = useState<ComposeProgress | null>(composeProgress || null);
  const [liveError, setLiveError] = useState<ComposeError | null>(lastError || null);

  const updateConfig = <K extends keyof ComposeConfig>(key: K, value: ComposeConfig[K]) => {
    setConfig((c) => ({ ...c, [key]: value }));
  };

  // Poll progress
  const pollProgress = useCallback(async () => {
    try {
      const proj = await wfGetProject(projectId);
      const pp = proj.post_production;
      if (pp?.compose_progress) setLiveProgress(pp.compose_progress);
      if (proj.status === "done") {
        setRendering(false);
        setLiveError(null);
        if (pp?.final_output) onRenderComplete(pp.final_output);
        onStatusChange?.("done");
      } else if (proj.status === "compositing_failed") {
        setRendering(false);
        if (pp?.last_error) setLiveError(pp.last_error);
        onStatusChange?.("compositing_failed");
      }
    } catch { /* retry next */ }
  }, [projectId, onRenderComplete, onStatusChange]);

  useEffect(() => {
    if (!rendering) return;
    const interval = setInterval(pollProgress, 3000);
    return () => clearInterval(interval);
  }, [rendering, pollProgress]);

  const handleRender = async (resumeFrom?: string) => {
    setRendering(true);
    setError(null);
    setLiveError(null);
    setLiveProgress(null);
    try {
      const renderConfig: Partial<ComposeConfig> = { ...config };
      if (resumeFrom) renderConfig.resume_from_stage = resumeFrom;
      await wfRenderProject(projectId, renderConfig);
      onStatusChange?.("compositing");
    } catch (err) {
      setError((err as Error).message);
      setRendering(false);
    }
  };

  let blockStatus: "pending" | "generating" | "done" | "failed" = "pending";
  if (finalOutput && projectStatus === "done") blockStatus = "done";
  else if (rendering || projectStatus === "compositing") blockStatus = "generating";
  else if (liveError || projectStatus === "compositing_failed") blockStatus = "failed";

  return (
    <CanvasBlock title="后期合成 & 导出" status={blockStatus}>
      {/* Error */}
      {liveError && !rendering && (
        <ErrorPanel
          error={liveError}
          onRetryAll={() => handleRender()}
          onRetryFailed={() => handleRender(liveError.failed_stage || undefined)}
        />
      )}

      {/* Pipeline */}
      {(rendering || liveProgress || liveError) && (
        <ComposePipeline progress={liveProgress} error={liveError} />
      )}

      {/* Config Panel */}
      {!rendering && (
        <div style={{ background: "#1a1a2a", borderRadius: 8, padding: 14, marginBottom: 16, border: "1px solid #333" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc", marginBottom: 12 }}>合成参数配置</div>
          <RadioGroup label="字幕" value={!config.include_subtitles ? "off" : config.subtitle_mode === "burn" ? "burn" : "external"}
            options={[{ value: "burn", label: "硬字幕(烧录)" }, { value: "external", label: "外挂SRT" }, { value: "off", label: "关闭" }]}
            onChange={(v) => { if (v === "off") updateConfig("include_subtitles", false); else { updateConfig("include_subtitles", true); updateConfig("subtitle_mode", v as "burn" | "external"); } }}
          />
          <Toggle label="配音" value={config.include_voiceover} onChange={(v) => updateConfig("include_voiceover", v)} />
          <RadioGroup label="BGM" value={!config.include_bgm ? "off" : config.bgm_source}
            options={[{ value: "auto", label: "自动匹配" }, { value: "custom", label: "自选BGM" }, { value: "off", label: "关闭" }]}
            onChange={(v) => { if (v === "off") updateConfig("include_bgm", false); else { updateConfig("include_bgm", true); updateConfig("bgm_source", v as "auto" | "custom"); } }}
          />
          <RadioGroup label="质量" value={config.output_quality}
            options={[{ value: "720p", label: "720p" }, { value: "1080p", label: "1080p" }, { value: "4k", label: "4K" }]}
            onChange={(v) => updateConfig("output_quality", v as "720p" | "1080p" | "4k")}
          />
          <RadioGroup label="转场" value={config.transition_style}
            options={[{ value: "dissolve", label: "叠化" }, { value: "fade", label: "淡入淡出" }, { value: "cut", label: "硬切" }, { value: "none", label: "无" }]}
            onChange={(v) => updateConfig("transition_style", v as "dissolve" | "fade" | "cut" | "none")}
          />
        </div>
      )}

      {/* SRT Editor */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc", marginBottom: 6 }}>字幕 (SRT)</div>
        <textarea
          value={subtitlesSrt || ""}
          onChange={(e) => onSubtitlesChange(e.target.value)}
          placeholder={`1\n00:00:00,000 --> 00:00:03,000\n第一句字幕`}
          disabled={rendering}
          style={{ width: "100%", height: 100, background: "#252535", border: "1px solid #444", borderRadius: 8, color: "#ccc", padding: 10, fontSize: 12, fontFamily: "monospace", resize: "vertical", opacity: rendering ? 0.5 : 1 }}
        />
      </div>

      {/* Render Button */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <button
          onClick={() => handleRender()}
          disabled={rendering}
          style={{
            padding: "10px 28px", borderRadius: 8, border: "none",
            background: rendering ? "#444" : "linear-gradient(135deg, #7c3aed, #6d28d9)",
            color: "#fff", fontSize: 14, fontWeight: 600,
            cursor: rendering ? "not-allowed" : "pointer",
            boxShadow: rendering ? "none" : "0 2px 10px rgba(124,58,237,0.3)",
          }}
        >
          {rendering ? "合成中..." : "开始合成"}
        </button>
        {error && <span style={{ color: "#f87171", fontSize: 12 }}>{error}</span>}
      </div>

      {/* Output Preview */}
      {finalOutput && projectStatus === "done" && (
        <div style={{ background: "#1a2a1a", borderRadius: 8, padding: 14, border: "1px solid #4ade80" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#4ade80", marginBottom: 8 }}>🎬 成品预览</div>
          <video src={finalOutput} controls style={{ width: "100%", maxHeight: 400, borderRadius: 8, background: "#000" }} />
          <div style={{ marginTop: 10 }}>
            <a
              href={`${finalOutput}?download=1`}
              download
              style={{
                display: "inline-block", padding: "8px 20px", borderRadius: 6,
                background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                color: "#fff", fontSize: 13, fontWeight: 600, textDecoration: "none",
                boxShadow: "0 2px 8px rgba(37,99,235,0.3)",
              }}
            >
              下载成品视频
            </a>
          </div>
        </div>
      )}
    </CanvasBlock>
  );
}
