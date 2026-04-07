"use client";

import { useState, useCallback, useEffect } from "react";
import GridUploader from "./GridUploader";
import SceneAnalysisPanel from "./SceneAnalysisPanel";
import Scene360Display from "./Scene360Display";
import ModelSwitcher from "./ModelSwitcher";
import { readJsonStorage, removeStorage, writeJsonStorage } from "@/lib/storage";

interface RefImage {
  base64: string;
  width: number;
  height: number;
  mime: string;
}

type Step = "upload" | "analyze" | "generate";

interface PersistedSceneState {
  step: Step;
  refImage: RefImage | null;
  viewCount: 4 | 6 | 8;
  jobId: string | null;
}

const STORAGE_KEY = "jg:scene-generator";

export default function SceneGeneratorView() {
  const persisted = readJsonStorage<PersistedSceneState>(STORAGE_KEY, {
    step: "upload",
    refImage: null,
    viewCount: 6,
    jobId: null,
  });
  const [step, setStep] = useState<Step>(persisted.step);
  const [refImage, setRefImage] = useState<RefImage | null>(persisted.refImage);
  const [viewCount, setViewCount] = useState<4 | 6 | 8>(persisted.viewCount);
  const [jobId, setJobId] = useState<string | null>(persisted.jobId);

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
    removeStorage(STORAGE_KEY);
  }, []);

  useEffect(() => {
    if (step === "upload" && !refImage && !jobId) {
      removeStorage(STORAGE_KEY);
      return;
    }
    writeJsonStorage<PersistedSceneState>(STORAGE_KEY, {
      step,
      refImage,
      viewCount,
      jobId,
    });
  }, [step, refImage, viewCount, jobId]);

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
