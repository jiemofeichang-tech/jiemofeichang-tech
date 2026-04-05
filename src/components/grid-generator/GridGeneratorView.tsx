"use client";

import { useState, useCallback } from "react";
import GridUploader from "./GridUploader";
import GridConfigPanel from "./GridConfigPanel";
import GridDisplay from "./GridDisplay";

interface RefImage {
  base64: string;
  width: number;
  height: number;
  mime: string;
}

type Step = "upload" | "config" | "generate";

export default function GridGeneratorView() {
  const [step, setStep] = useState<Step>("upload");
  const [refImage, setRefImage] = useState<RefImage | null>(null);
  const [gridSize, setGridSize] = useState<9 | 25>(9);
  const [jobId, setJobId] = useState<string | null>(null);

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
  }, []);

  return (
    <div className="h-full overflow-auto bg-[#0a0f1a] text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <h1 className="text-lg font-semibold">表情网格生成器</h1>
        {step !== "upload" && (
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition"
          >
            重新开始
          </button>
        )}
      </header>

      {/* Steps indicator */}
      <div className="flex items-center justify-center gap-2 py-4">
        {(["upload", "config", "generate"] as const).map((s, i) => {
          const labels = ["上传参考图", "配置网格", "生成 & 下载"];
          const isActive = s === step;
          const isDone =
            (s === "upload" && step !== "upload") ||
            (s === "config" && step === "generate");
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className="w-8 h-px bg-white/20" />}
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
                  isActive
                    ? "bg-orange-500/20 text-orange-400 border border-orange-500/40"
                    : isDone
                    ? "bg-green-500/20 text-green-400"
                    : "bg-white/5 text-white/40"
                }`}
              >
                <span className="w-5 h-5 flex items-center justify-center rounded-full bg-white/10 text-xs">
                  {isDone ? "\u2713" : i + 1}
                </span>
                {labels[i]}
              </div>
            </div>
          );
        })}
      </div>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-6 flex-1 flex flex-col justify-center">
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
