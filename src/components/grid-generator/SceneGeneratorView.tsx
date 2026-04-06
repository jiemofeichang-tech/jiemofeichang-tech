"use client";

import { useState, useCallback } from "react";
import GridUploader from "./GridUploader";
import SceneAnalysisPanel from "./SceneAnalysisPanel";
import Scene360Display from "./Scene360Display";
import ModelSwitcher from "./ModelSwitcher";

interface RefImage {
  base64: string;
  width: number;
  height: number;
  mime: string;
}

type Step = "upload" | "analyze" | "generate";

export default function SceneGeneratorView() {
  const [step, setStep] = useState<Step>("upload");
  const [refImage, setRefImage] = useState<RefImage | null>(null);
  const [viewCount, setViewCount] = useState<4 | 6 | 8>(6);
  const [jobId, setJobId] = useState<string | null>(null);

  const handleUpload = useCallback((image: RefImage) => {
    setRefImage(image);
    setStep("analyze");
  }, []);

  const handleConfirm = useCallback((vc: 4 | 6 | 8, newJobId: string) => {
    setViewCount(vc);
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
          <h2 className="text-sm font-semibold text-white/80 mr-3">场景 360°</h2>
          {(["upload", "analyze", "generate"] as const).map((s, i) => {
            const labels = ["上传参考图", "AI 分析 & 确认", "生成视图"];
            const isActive = s === step;
            const isDone = (s === "upload" && step !== "upload") || (s === "analyze" && step === "generate");
            return (
              <div key={s} className="flex items-center gap-1.5">
                {i > 0 && <div className="w-4 h-px bg-white/20" />}
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${
                  isActive ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
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

      <main className="max-w-5xl mx-auto px-6 py-6 flex-1 flex flex-col justify-center w-full">
        {step === "upload" && <GridUploader onUpload={handleUpload} />}
        {step === "analyze" && refImage && (
          <SceneAnalysisPanel refImage={refImage} onConfirm={handleConfirm} onBack={() => setStep("upload")} />
        )}
        {step === "generate" && jobId && (
          <Scene360Display jobId={jobId} viewCount={viewCount} />
        )}
      </main>
    </div>
  );
}
