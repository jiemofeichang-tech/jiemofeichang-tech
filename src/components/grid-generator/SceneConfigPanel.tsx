"use client";

import { useCallback, useState } from "react";
import { gridGenerate } from "@/lib/api";

interface RefImage {
  base64: string;
  width: number;
  height: number;
  mime: string;
}

interface SceneConfigPanelProps {
  refImage: RefImage;
  onConfirm: (gridSize: 9 | 25, jobId: string) => void;
  onBack: () => void;
}

const GRID_OPTIONS = [
  { size: 9 as const, label: "3 x 3", desc: "9 种场景" },
  { size: 25 as const, label: "5 x 5", desc: "25 种场景" },
];

const SCENE_LABELS_9 = [
  "清晨", "正午", "黄昏", "夜晚", "雨天", "雪景", "雾天", "春天", "秋天",
];

const SCENE_LABELS_25 = [
  ...SCENE_LABELS_9,
  "暴风雨", "星空", "水下", "赛博朋克", "奇幻",
  "末日废墟", "温馨室内", "现代室内", "森林", "沙漠",
  "海边", "山景", "城市", "古风", "太空", "节日",
];

export default function SceneConfigPanel({ refImage, onConfirm, onBack }: SceneConfigPanelProps) {
  const [gridSize, setGridSize] = useState<9 | 25>(9);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sceneLabels = gridSize === 9 ? SCENE_LABELS_9 : SCENE_LABELS_25;

  const handleGenerate = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await gridGenerate({
        reference_image: refImage.base64,
        grid_size: gridSize,
        mode: "scene",
      });
      onConfirm(gridSize, result.job_id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "生成请求失败";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [refImage, gridSize, onConfirm]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-6">
        <div className="w-48 h-48 rounded-xl overflow-hidden bg-white/5 flex-shrink-0">
          <img src={refImage.base64} alt="参考图" className="w-full h-full object-cover" />
        </div>

        <div className="flex-1 flex flex-col gap-4">
          <div>
            <h3 className="text-sm text-white/60 mb-2">参考图尺寸</h3>
            <p className="text-white/80">{refImage.width} x {refImage.height} px</p>
          </div>

          <div>
            <h3 className="text-sm text-white/60 mb-2">网格大小</h3>
            <div className="flex gap-3">
              {GRID_OPTIONS.map((opt) => (
                <button
                  key={opt.size}
                  onClick={() => setGridSize(opt.size)}
                  className={`px-4 py-3 rounded-xl border transition-all ${
                    gridSize === opt.size
                      ? "border-blue-500 bg-blue-500/20 text-blue-400"
                      : "border-white/10 bg-white/5 text-white/60 hover:border-white/30"
                  }`}
                >
                  <div className="text-lg font-bold">{opt.label}</div>
                  <div className="text-xs mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm text-white/60 mb-2">
          将生成以下 {sceneLabels.length} 种场景变体
        </h3>
        <div className="flex flex-wrap gap-2">
          {sceneLabels.map((label) => (
            <span key={label} className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-300 text-xs">
              {label}
            </span>
          ))}
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-500/20 border border-red-500/40 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3 justify-end">
        <button
          onClick={onBack}
          className="px-5 py-2.5 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 transition"
        >
          上一步
        </button>
        <button
          onClick={handleGenerate}
          disabled={isSubmitting}
          className="px-6 py-2.5 rounded-lg bg-blue-500 text-white font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {isSubmitting ? "提交中..." : `生成 ${gridSize} 种场景`}
        </button>
      </div>
    </div>
  );
}
