"use client";
import { useState } from "react";
import CanvasBlock from "./CanvasBlock";
import { wfRenderProject } from "@/lib/api";

interface PostProductionProps {
  projectId: string;
  subtitlesSrt: string | null;
  finalOutput: string | null;
  onSubtitlesChange: (srt: string) => void;
  onRenderComplete: (url: string) => void;
}

export default function PostProduction({
  projectId,
  subtitlesSrt,
  finalOutput,
  onSubtitlesChange,
  onRenderComplete,
}: PostProductionProps) {
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRender = async () => {
    setRendering(true);
    setError(null);
    try {
      const result = await wfRenderProject(projectId);
      onRenderComplete(result.output_url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRendering(false);
    }
  };

  return (
    <CanvasBlock title="后期合成 & 导出" status={finalOutput ? "done" : "pending"}>
      {/* Subtitle Editor */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc", marginBottom: 6 }}>字幕 (SRT)</div>
        <textarea
          value={subtitlesSrt || ""}
          onChange={(e) => onSubtitlesChange(e.target.value)}
          placeholder={`1\n00:00:00,000 --> 00:00:03,000\n第一句字幕\n\n2\n00:00:03,000 --> 00:00:06,000\n第二句字幕`}
          style={{
            width: "100%",
            height: 120,
            background: "#252535",
            border: "1px solid #444",
            borderRadius: 8,
            color: "#ccc",
            padding: 10,
            fontSize: 12,
            fontFamily: "monospace",
            resize: "vertical",
          }}
        />
      </div>

      {/* Render Button */}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          onClick={handleRender}
          disabled={rendering}
          style={{
            padding: "8px 24px",
            borderRadius: 8,
            border: "none",
            background: rendering ? "#444" : "#7c3aed",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: rendering ? "not-allowed" : "pointer",
          }}
        >
          {rendering ? "合成中..." : "合成导出"}
        </button>

        {error && <span style={{ color: "#f87171", fontSize: 12 }}>{error}</span>}
      </div>

      {/* Output Preview */}
      {finalOutput && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#ccc", marginBottom: 6 }}>成品预览</div>
          <video
            src={finalOutput}
            controls
            style={{
              width: "100%",
              maxHeight: 400,
              borderRadius: 8,
              background: "#000",
            }}
          />
          <div style={{ marginTop: 8 }}>
            <a
              href={`${finalOutput}?download=1`}
              download
              style={{
                display: "inline-block",
                padding: "6px 16px",
                borderRadius: 6,
                background: "#2563eb",
                color: "#fff",
                fontSize: 12,
                textDecoration: "none",
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
