"use client";

import { useState, useCallback, useEffect } from "react";
import GridUploader from "./GridUploader";
import GridConfigPanel from "./GridConfigPanel";
import GridDisplay from "./GridDisplay";
import ModelSwitcher from "./ModelSwitcher";
import { readJsonStorage, removeStorage, writeJsonStorage } from "@/lib/storage";

interface RefImage {
  base64: string;
  width: number;
  height: number;
  mime: string;
}

type Step = "upload" | "config" | "generate";

interface PersistedGridState {
  step: Step;
  refImage: RefImage | null;
  gridSize: 9 | 25;
  jobId: string | null;
}

const STORAGE_KEY = "jg:grid-generator";

export default function GridGeneratorView() {
  const persisted = readJsonStorage<PersistedGridState>(STORAGE_KEY, {
    step: "upload",
    refImage: null,
    gridSize: 9,
    jobId: null,
  });
  const [step, setStep] = useState<Step>(persisted.step);
  const [refImage, setRefImage] = useState<RefImage | null>(persisted.refImage);
  const [gridSize, setGridSize] = useState<9 | 25>(persisted.gridSize);
  const [jobId, setJobId] = useState<string | null>(persisted.jobId);

  const handleUpload = useCallback((image: RefImage) => {
    setRefImage(image);
    setStep("config");
  }, []);

  const handleConfigConfirm = useCallback((size: 9 | 25, newJobId: string) => {
    setGridSize(size);
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
    writeJsonStorage<PersistedGridState>(STORAGE_KEY, {
      step,
      refImage,
      gridSize,
      jobId,
    });
  }, [step, refImage, gridSize, jobId]);

  return (
    <div className="h-full overflow-auto bg-[#0a0f1a] text-white flex flex-col">
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-white/80 mr-3">表情网格</h2>
          {(["upload", "config", "generate"] as const).map((s, i) => {
            const labels = ["上传参考图", "配置网格", "生成 & 下载"];
            const isActive = s === step;
            const isDone =
              (s === "upload" && step !== "upload") ||
              (s === "config" && step === "generate");
            return (
              <div key={s} className="flex items-center gap-1.5">
                {i > 0 && <div className="w-4 h-px bg-white/20" />}
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${
                    isActive
                      ? "bg-orange-500/20 text-orange-400 border border-orange-500/40"
                      : isDone
                        ? "bg-green-500/20 text-green-400"
                        : "bg-white/5 text-white/40"
                  }`}
                >
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
            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 rounded-lg transition"
            >
              重新开始
            </button>
          )}
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-6 py-6 flex-1 flex flex-col justify-center w-full">
        {step === "upload" && <GridUploader onUpload={handleUpload} />}
        {step === "config" && refImage && (
          <GridConfigPanel
            refImage={refImage}
            onConfirm={handleConfigConfirm}
            onBack={() => setStep("upload")}
          />
        )}
        {step === "generate" && refImage && jobId && (
          <GridDisplay
            jobId={jobId}
            gridSize={gridSize}
            refWidth={refImage.width}
            refHeight={refImage.height}
          />
        )}
      </main>
    </div>
  );
}
