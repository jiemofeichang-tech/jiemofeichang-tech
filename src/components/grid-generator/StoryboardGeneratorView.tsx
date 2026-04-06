"use client";

import { useState, useCallback } from "react";
import GridUploader from "./GridUploader";
import StoryboardAnalysisPanel from "./StoryboardAnalysisPanel";
import StoryboardDisplay from "./StoryboardDisplay";
import ModelSwitcher from "./ModelSwitcher";

interface RefImage {
  base64: string;
  width: number;
  height: number;
  mime: string;
}

type Step = "upload" | "config" | "analyze" | "generate";

const GRID_OPTIONS = [
  { size: 9 as const, label: "3 x 3", desc: "9 帧三段式" },
  { size: 25 as const, label: "5 x 5", desc: "25 帧五段式" },
];

export default function StoryboardGeneratorView() {
  const [step, setStep] = useState<Step>("upload");
  const [refImage, setRefImage] = useState<RefImage | null>(null);
  const [gridSize, setGridSize] = useState<9 | 25>(9);
  const [jobId, setJobId] = useState<string | null>(null);

  const handleUpload = useCallback((image: RefImage) => {
    setRefImage(image);
    setStep("config");
  }, []);

  const handleConfigConfirm = useCallback(() => {
    setStep("analyze");
  }, []);

  const handleGenerated = useCallback((newJobId: string) => {
    setJobId(newJobId);
    setStep("generate");
  }, []);

  const handleReset = useCallback(() => {
    setStep("upload");
    setRefImage(null);
    setJobId(null);
  }, []);

  return (
    <div className="h-full overflow-auto bg-[#0a0f1a] text-white flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-white/80 mr-3">分镜网格</h2>
          {(["upload", "config", "analyze", "generate"] as const).map((s, i) => {
            const labels = ["上传参考图", "选择规格", "AI 分析 & 编辑", "生成分镜"];
            const isActive = s === step;
            const stepOrder = ["upload", "config", "analyze", "generate"];
            const currentIdx = stepOrder.indexOf(step);
            const isDone = stepOrder.indexOf(s) < currentIdx;
            return (
              <div key={s} className="flex items-center gap-1.5">
                {i > 0 && <div className="w-4 h-px bg-white/20" />}
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${
                  isActive ? "bg-purple-500/20 text-purple-400 border border-purple-500/40"
                  : isDone ? "bg-green-500/20 text-green-400"
                  : "bg-white/5 text-white/40"
                }`}>
                  <span className="w-4 h-4 flex items-center justify-center rounded-full bg-white/10 text-[10px]">
                    {isDone ? "\u2713" : i + 1}
                  </span>
                  {labels[i]}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <ModelSwitcher />
          {step !== "upload" && (
            <button onClick={handleReset} className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 rounded-lg transition">
              重新开始
            </button>
          )}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-6 flex-1 flex flex-col justify-center w-full">
        {step === "upload" && <GridUploader onUpload={handleUpload} />}

        {step === "config" && refImage && (
          <div className="flex flex-col items-center gap-6">
            <div className="w-60 h-36 rounded-xl overflow-hidden bg-white/5">
              <img src={refImage.base64} alt="参考图" className="w-full h-full object-cover" />
            </div>
            <div>
              <h3 className="text-sm text-white/60 mb-3 text-center">选择分镜规格</h3>
              <div className="flex gap-4">
                {GRID_OPTIONS.map((opt) => (
                  <button
                    key={opt.size}
                    onClick={() => setGridSize(opt.size)}
                    className={`px-6 py-4 rounded-xl border transition-all ${
                      gridSize === opt.size
                        ? "border-purple-500 bg-purple-500/20 text-purple-400"
                        : "border-white/10 bg-white/5 text-white/60 hover:border-white/30"
                    }`}
                  >
                    <div className="text-xl font-bold">{opt.label}</div>
                    <div className="text-xs mt-1">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep("upload")} className="px-5 py-2.5 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 transition">
                上一步
              </button>
              <button
                onClick={handleConfigConfirm}
                className="px-6 py-2.5 rounded-lg bg-purple-500 text-white font-medium hover:bg-purple-600 transition"
              >
                开始 AI 分析
              </button>
            </div>
          </div>
        )}

        {step === "analyze" && refImage && (
          <StoryboardAnalysisPanel
            refImage={refImage}
            gridSize={gridSize}
            onConfirm={handleGenerated}
            onBack={() => setStep("config")}
          />
        )}

        {step === "generate" && jobId && (
          <StoryboardDisplay jobId={jobId} gridSize={gridSize} />
        )}
      </main>
    </div>
  );
}
