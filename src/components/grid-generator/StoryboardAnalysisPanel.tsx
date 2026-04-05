"use client";

import { useCallback, useEffect, useState } from "react";
import { storyboardAnalyze, storyboardGenerate, type StoryboardAnalysis } from "@/lib/api";

interface RefImage {
  base64: string;
  width: number;
  height: number;
  mime: string;
}

interface StoryboardAnalysisPanelProps {
  refImage: RefImage;
  gridSize: 9 | 25;
  onConfirm: (jobId: string) => void;
  onBack: () => void;
}

const ASPECT_OPTIONS = [
  { value: "16:9", label: "16:9 横版" },
  { value: "9:16", label: "9:16 竖版" },
  { value: "auto", label: "跟随参考图" },
];

export default function StoryboardAnalysisPanel({
  refImage, gridSize, onConfirm, onBack,
}: StoryboardAnalysisPanelProps) {
  const [analysis, setAnalysis] = useState<StoryboardAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(true);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const runAnalysis = useCallback(async () => {
    setAnalyzing(true);
    setAnalyzeError(null);
    setAnalysis(null);
    try {
      const result = await storyboardAnalyze({ reference_image: refImage.base64, grid_size: gridSize });
      setAnalysis(result);
    } catch (err: unknown) {
      setAnalyzeError(err instanceof Error ? err.message : "分析失败");
    } finally {
      setAnalyzing(false);
    }
  }, [refImage, gridSize]);

  useEffect(() => { runAnalysis(); }, [runAnalysis]);

  const updateStory = useCallback((key: string, value: string) => {
    setAnalysis((prev) => prev ? { ...prev, story: { ...prev.story, [key]: value } } : prev);
  }, []);

  const updateFrame = useCallback((index: number, field: string, value: string) => {
    setAnalysis((prev) => {
      if (!prev) return prev;
      const newFrames = prev.frames.map((f, i) => i === index ? { ...f, [field]: value } : f);
      return { ...prev, frames: newFrames };
    });
  }, []);

  const resolvedAspectRatio = aspectRatio === "auto"
    ? (refImage.width > refImage.height ? "16:9" : refImage.width < refImage.height ? "9:16" : "1:1")
    : aspectRatio;

  const handleGenerate = useCallback(async () => {
    if (!analysis) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await storyboardGenerate({
        reference_image: refImage.base64,
        analysis,
        grid_size: gridSize,
        aspect_ratio: resolvedAspectRatio,
      });
      onConfirm(result.job_id);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "生成请求失败");
    } finally {
      setSubmitting(false);
    }
  }, [analysis, refImage, gridSize, resolvedAspectRatio, onConfirm]);

  if (analyzing) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <div className="w-10 h-10 border-3 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
        <p className="text-white/60">AI 正在分析参考图并规划分镜...</p>
        <p className="text-white/30 text-sm">风格锚定 + 剧情推演 + {gridSize}帧分镜设计</p>
      </div>
    );
  }

  if (analyzeError) {
    return (
      <div className="flex flex-col items-center gap-4 py-20">
        <div className="px-4 py-2 bg-red-500/20 border border-red-500/40 rounded-lg text-red-400 text-sm">{analyzeError}</div>
        <div className="flex gap-3">
          <button onClick={onBack} className="px-4 py-2 bg-white/10 rounded-lg text-white/60 hover:bg-white/20 transition">返回</button>
          <button onClick={runAnalysis} className="px-4 py-2 bg-purple-500 rounded-lg text-white hover:bg-purple-600 transition">重新分析</button>
        </div>
      </div>
    );
  }

  if (!analysis) return null;

  const actColors: Record<string, string> = {
    Prologue: "text-blue-400", Setup: "text-green-400",
    Confrontation: "text-yellow-400", Action: "text-yellow-400",
    Climax: "text-red-400", Resolution: "text-purple-400",
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="px-3 py-2 bg-purple-500/10 border border-purple-500/20 rounded-lg text-purple-300 text-xs">
        💡 以下分镜规划均可编辑。修改剧情、情绪曲线或单帧描述后，AI 将按你的修改生成图片。
      </div>

      {/* Reference + Story */}
      <div className="flex gap-5">
        <div className="w-40 h-24 rounded-xl overflow-hidden bg-white/5 flex-shrink-0">
          <img src={refImage.base64} alt="参考图" className="w-full h-full object-cover" />
        </div>
        <div className="flex-1 space-y-2 text-sm">
          <EditableField label="主体" value={analysis.story.subject} onChange={(v) => updateStory("subject", v)} />
          <EditableField label="剧情" value={analysis.story.narrative} onChange={(v) => updateStory("narrative", v)} multiline />
          <div className="grid grid-cols-2 gap-2">
            <EditableField label="时间跨度" value={analysis.story.time_span} onChange={(v) => updateStory("time_span", v)} />
            <EditableField label="情绪曲线" value={analysis.story.emotion_curve} onChange={(v) => updateStory("emotion_curve", v)} />
          </div>
        </div>
      </div>

      {/* Aspect Ratio */}
      <div>
        <h3 className="text-sm text-white/60 mb-2">画面比例</h3>
        <div className="flex gap-3">
          {ASPECT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setAspectRatio(opt.value)}
              className={`px-4 py-2 rounded-xl border transition-all text-sm ${
                aspectRatio === opt.value
                  ? "border-purple-500 bg-purple-500/20 text-purple-400"
                  : "border-white/10 bg-white/5 text-white/60 hover:border-white/30"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Frames */}
      <div>
        <h3 className="text-sm text-white/60 mb-2">分镜规划（{analysis.frames.length} 帧）</h3>
        <div className="grid grid-cols-3 gap-2">
          {analysis.frames.map((frame, idx) => (
            <div key={frame.id} className="p-2.5 bg-white/5 rounded-lg text-xs space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-white/80 font-bold">{frame.id}</span>
                <span className={`text-[10px] ${actColors[frame.act] ?? "text-white/40"}`}>{frame.act}</span>
                <span className="text-white/30 text-[10px]">{frame.shot_type}</span>
              </div>
              <div>
                <span className="text-white/40 text-[10px]">画面描述</span>
                <textarea
                  value={frame.description}
                  onChange={(e) => updateFrame(idx, "description", e.target.value)}
                  className="w-full mt-0.5 px-2 py-1 bg-white/5 border border-white/10 rounded text-white/70 text-xs resize-none focus:border-purple-500/50 focus:outline-none transition"
                  rows={2}
                />
              </div>
              <div>
                <span className="text-orange-400 text-[10px] font-medium">🎨 生图 Prompt（英文）</span>
                <textarea
                  value={frame.image_prompt}
                  onChange={(e) => updateFrame(idx, "image_prompt", e.target.value)}
                  className="w-full mt-0.5 px-2 py-1.5 bg-orange-500/5 border border-orange-500/20 rounded text-white/90 text-xs resize-none focus:border-orange-500/50 focus:outline-none transition"
                  rows={3}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {submitError && (
        <div className="px-4 py-2 bg-red-500/20 border border-red-500/40 rounded-lg text-red-400 text-sm">{submitError}</div>
      )}

      <div className="flex gap-3 justify-end">
        <button onClick={onBack} className="px-5 py-2.5 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 transition">返回</button>
        <button onClick={runAnalysis} className="px-5 py-2.5 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 transition">重新分析</button>
        <button
          onClick={handleGenerate}
          disabled={submitting}
          className="px-6 py-2.5 rounded-lg bg-purple-500 text-white font-medium hover:bg-purple-600 disabled:opacity-50 transition"
        >
          {submitting ? "提交中..." : `生成 ${analysis.frames.length} 帧分镜`}
        </button>
      </div>
    </div>
  );
}

function EditableField({ label, value, onChange, multiline }: {
  label: string; value: string; onChange: (v: string) => void; multiline?: boolean;
}) {
  return (
    <div className="px-2.5 py-1.5 bg-white/5 rounded-lg">
      <div className="text-white/40 text-[10px] mb-0.5">{label}</div>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent border-b border-white/10 text-white/80 text-xs py-0.5 resize-none focus:border-purple-500/50 focus:outline-none transition"
          rows={2}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent border-b border-white/10 text-white/80 text-xs py-0.5 focus:border-purple-500/50 focus:outline-none transition"
        />
      )}
    </div>
  );
}
