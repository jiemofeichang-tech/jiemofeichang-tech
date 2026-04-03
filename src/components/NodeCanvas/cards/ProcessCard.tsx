"use client";
import { memo, useState } from "react";
import { Handle, Position } from "@xyflow/react";

const MODEL_OPTIONS: Record<string, string[]> = {
  "ai_analysis": ["Opus 4.6", "Sonnet 4.6", "Gemini Pro"],
  "char_design": ["NanoBanana 2", "Imagen 4.0", "Gemini Imagen"],
  "storyboard": ["NanoBanana 2", "Imagen 4.0", "Gemini Imagen"],
  "text2img": ["NanoBanana 2", "Imagen 4.0", "Gemini Imagen"],
  "text2video": ["即梦 3.0", "Veo 3.1", "Seedance 2.0"],
  "img2video": ["即梦 3.0", "Veo 3.1", "Seedance 2.0"],
};

const RATIO_OPTIONS = ["9:16", "16:9", "1:1", "3:4", "4:3", "21:9"];
const RESOLUTION_OPTIONS_IMG = ["512×512", "768×768", "1024×1024", "1024×1536", "1080×1920", "1536×1024", "1920×1080", "2048×2048"];
const RESOLUTION_OPTIONS_VIDEO = ["480p", "720p", "1080p"];
const DURATION_OPTIONS = ["4s", "5s", "6s", "7s", "8s"];
const EPISODE_OPTIONS = ["1集", "2集", "3集", "4集", "5集", "6集", "8集", "10集"];
const DURATION_TOTAL = ["15s", "30s", "60s", "120s"];

type PickerType = "model" | "ratio" | "resolution" | "duration" | "episodes" | "totalDuration" | null;

function ProcessCard({ data, id }: { data: { title?: string; processType?: string; model?: string; onRun?: (nodeId: string, config: Record<string, string>) => void; status?: string }; id: string }) {
  const pType = data.processType || "ai_analysis";
  const isAi = pType === "ai_analysis";
  const isVideo = pType === "text2video" || pType === "img2video";
  const isImage = !isAi && !isVideo;

  const [model, setModel] = useState(data.model || MODEL_OPTIONS[pType]?.[0] || "Opus 4.6");
  const [ratio, setRatio] = useState("9:16");
  const [resolution, setResolution] = useState(isVideo ? "720p" : "1080×1920");
  const [duration, setDuration] = useState("5s");
  const [episodes, setEpisodes] = useState("3集");
  const [totalDuration, setTotalDuration] = useState("60s");
  const [activePicker, setActivePicker] = useState<PickerType>(null);

  const typeConfig: Record<string, { label: string; color: string; icon: string }> = {
    "text2img": { label: "文生图", color: "#059669", icon: "🖼️" },
    "text2video": { label: "文生视频", color: "#dc2626", icon: "🎬" },
    "img2video": { label: "图生视频", color: "#f59e0b", icon: "🎞️" },
    "ai_analysis": { label: "AI 分析", color: "#2563eb", icon: "🤖" },
    "char_design": { label: "角色设计", color: "#7c3aed", icon: "🧑" },
    "storyboard": { label: "分镜生成", color: "#f59e0b", icon: "📋" },
  };
  const cfg = typeConfig[pType] || typeConfig["ai_analysis"];

  const togglePicker = (type: PickerType) => setActivePicker(activePicker === type ? null : type);

  const renderPicker = (type: PickerType, options: string[], value: string, setValue: (v: string) => void) => {
    if (activePicker !== type) return null;
    return (
      <div style={{ background: "#f8f8f4", borderRadius: 6, padding: 4, marginBottom: 4, display: "flex", flexWrap: "wrap", gap: 2 }}>
        {options.map((opt) => (
          <div
            key={opt}
            onClick={() => { setValue(opt); setActivePicker(null); }}
            style={{
              padding: "3px 8px", borderRadius: 4, cursor: "pointer", fontSize: 10,
              color: opt === value ? cfg.color : "#666",
              fontWeight: opt === value ? 600 : 400,
              background: opt === value ? `${cfg.color}15` : "transparent",
              border: opt === value ? `1px solid ${cfg.color}33` : "1px solid transparent",
            }}
          >
            {opt}
          </div>
        ))}
      </div>
    );
  };

  const ParamRow = ({ label, value, picker }: { label: string; value: string; picker: PickerType }) => (
    <div
      onClick={() => togglePicker(picker)}
      style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", cursor: "pointer", borderTop: "1px solid #f0f0e8" }}
    >
      <span style={{ color: "#999", fontSize: 11 }}>{label}</span>
      <span style={{ color: "#333", fontSize: 11, fontWeight: 500 }}>{value} <span style={{ color: "#bbb" }}>›</span></span>
    </div>
  );

  return (
    <div style={{
      width: 250, background: "#fff", borderRadius: 10, border: "1px solid #e0e0d0",
      boxShadow: "0 2px 8px rgba(0,0,0,0.08)", overflow: "visible", position: "relative",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", fontSize: 12 }}>
        <span>{cfg.icon}</span>
        <span style={{ color: cfg.color, fontWeight: 600 }}>{data.title || cfg.label}</span>
      </div>

      <div style={{ padding: "0 12px 10px", fontSize: 11 }}>
        {/* 模型 */}
        <ParamRow label="模型" value={model} picker="model" />
        {renderPicker("model", MODEL_OPTIONS[pType] || [], model, setModel)}

        {/* AI 分析特有参数 */}
        {isAi && (
          <>
            <ParamRow label="集数" value={episodes} picker="episodes" />
            {renderPicker("episodes", EPISODE_OPTIONS, episodes, setEpisodes)}
            <ParamRow label="总时长" value={totalDuration} picker="totalDuration" />
            {renderPicker("totalDuration", DURATION_TOTAL, totalDuration, setTotalDuration)}
          </>
        )}

        {/* 图片参数 */}
        {isImage && (
          <>
            <ParamRow label="比例" value={ratio} picker="ratio" />
            {renderPicker("ratio", RATIO_OPTIONS, ratio, setRatio)}
            <ParamRow label="分辨率" value={resolution} picker="resolution" />
            {renderPicker("resolution", RESOLUTION_OPTIONS_IMG, resolution, setResolution)}
          </>
        )}

        {/* 视频参数 */}
        {isVideo && (
          <>
            <ParamRow label="比例" value={ratio} picker="ratio" />
            {renderPicker("ratio", RATIO_OPTIONS, ratio, setRatio)}
            <ParamRow label="分辨率" value={resolution} picker="resolution" />
            {renderPicker("resolution", RESOLUTION_OPTIONS_VIDEO, resolution, setResolution)}
            <ParamRow label="时长" value={duration} picker="duration" />
            {renderPicker("duration", DURATION_OPTIONS, duration, setDuration)}
          </>
        )}

        <button
          onClick={() => data.onRun?.(id, { model, ratio, resolution, duration, episodes, totalDuration, processType: pType })}
          disabled={data.status === "running"}
          style={{
            width: "100%", marginTop: 8, padding: "7px 0", borderRadius: 6, border: "none",
            background: data.status === "running" ? "#999" : cfg.color,
            color: "#fff", fontSize: 12, fontWeight: 600,
            cursor: data.status === "running" ? "not-allowed" : "pointer",
            animation: data.status === "running" ? "pulse 1.5s infinite" : undefined,
          }}
        >
          {data.status === "running" ? "⏳ 生成中..." : data.status === "done" ? "✓ 完成" : "▶ 立即生成"}
        </button>
      </div>

      <Handle type="target" position={Position.Left} style={{ width: 12, height: 12, background: "#94a3b8", border: "2px solid #fff" }} />
      <Handle type="source" position={Position.Right} style={{ width: 12, height: 12, background: cfg.color, border: "2px solid #fff", boxShadow: `0 0 4px ${cfg.color}66` }} />
    </div>
  );
}

export default memo(ProcessCard);
