"use client";

import { useCallback, useState } from "react";
import { gridGenerate } from "@/lib/api";

interface RefImage {
  base64: string;
  width: number;
  height: number;
  mime: string;
}

interface GridConfigPanelProps {
  refImage: RefImage;
  onConfirm: (gridSize: 9 | 25, jobId: string) => void;
  onBack: () => void;
}

type GridMode = "expression" | "body";

const MODE_OPTIONS: { mode: GridMode; label: string; desc: string }[] = [
  { mode: "expression", label: "表情", desc: "头肩肖像，不同表情" },
  { mode: "body", label: "表情 + 肢体", desc: "全身，表情与动作" },
];

const GRID_OPTIONS = [
  { size: 9 as const, label: "3 x 3", desc: "9 张" },
  { size: 25 as const, label: "5 x 5", desc: "25 张" },
];

const EXPRESSION_LABELS_9 = [
  "开心", "难过", "生气", "惊讶", "思考", "害羞", "自信", "紧张", "平静",
];

const EXPRESSION_LABELS_25 = [
  ...EXPRESSION_LABELS_9,
  "大笑", "哭泣", "恐惧", "厌恶", "困倦",
  "兴奋", "困惑", "坚定", "尴尬", "调皮",
  "骄傲", "担忧", "无聊", "心动", "严肃", "震惊",
];

const BODY_LABELS_9 = [
  "挥手打招呼", "双臂交叉", "思考姿态", "开心跳跃", "放松坐姿",
  "指向前方", "害羞躲藏", "生气跺脚", "胜利姿势",
];

const BODY_LABELS_25 = [
  ...BODY_LABELS_9,
  "奔跑", "跳舞", "鞠躬", "伸懒腰", "捂脸",
  "比耶", "拥抱自己", "战斗姿态", "蹲下哭泣", "竖大拇指",
  "靠墙站立", "惊恐后退", "悠闲散步", "双手合十", "耸肩", "飞吻",
];

const LABELS_MAP: Record<GridMode, Record<number, string[]>> = {
  expression: { 9: EXPRESSION_LABELS_9, 25: EXPRESSION_LABELS_25 },
  body: { 9: BODY_LABELS_9, 25: BODY_LABELS_25 },
};

export default function GridConfigPanel({ refImage, onConfirm, onBack }: GridConfigPanelProps) {
  const [gridMode, setGridMode] = useState<GridMode>("expression");
  const [gridSize, setGridSize] = useState<9 | 25>(9);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const labels = LABELS_MAP[gridMode][gridSize] ?? [];

  const handleGenerate = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await gridGenerate({
        reference_image: refImage.base64,
        grid_size: gridSize,
        mode: gridMode,
      });
      onConfirm(gridSize, result.job_id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "生成请求失败";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [refImage, gridSize, gridMode, onConfirm]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-6">
        {/* Reference preview */}
        <div className="w-48 h-48 rounded-xl overflow-hidden bg-white/5 flex-shrink-0">
          <img src={refImage.base64} alt="参考图" className="w-full h-full object-cover" />
        </div>

        {/* Config */}
        <div className="flex-1 flex flex-col gap-4">
          <div>
            <h3 className="text-sm text-white/60 mb-2">参考图尺寸</h3>
            <p className="text-white/80">{refImage.width} x {refImage.height} px</p>
          </div>

          {/* Mode selector */}
          <div>
            <h3 className="text-sm text-white/60 mb-2">生成模式</h3>
            <div className="flex gap-3">
              {MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.mode}
                  onClick={() => setGridMode(opt.mode)}
                  className={`px-4 py-2.5 rounded-xl border transition-all ${
                    gridMode === opt.mode
                      ? "border-orange-500 bg-orange-500/20 text-orange-400"
                      : "border-white/10 bg-white/5 text-white/60 hover:border-white/30"
                  }`}
                >
                  <div className="text-sm font-bold">{opt.label}</div>
                  <div className="text-[10px] mt-0.5 text-white/40">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Grid size */}
          <div>
            <h3 className="text-sm text-white/60 mb-2">网格大小</h3>
            <div className="flex gap-3">
              {GRID_OPTIONS.map((opt) => (
                <button
                  key={opt.size}
                  onClick={() => setGridSize(opt.size)}
                  className={`px-4 py-3 rounded-xl border transition-all ${
                    gridSize === opt.size
                      ? "border-orange-500 bg-orange-500/20 text-orange-400"
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

      {/* Labels preview */}
      <div>
        <h3 className="text-sm text-white/60 mb-2">
          将生成以下 {labels.length} 种{gridMode === "body" ? "表情+肢体动作" : "表情"}
        </h3>
        <div className="flex flex-wrap gap-2">
          {labels.map((label) => (
            <span
              key={label}
              className={`px-2.5 py-1 rounded-full text-xs ${
                gridMode === "body"
                  ? "bg-purple-500/15 text-purple-300"
                  : "bg-white/10 text-white/70"
              }`}
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-red-500/20 border border-red-500/40 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Actions */}
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
          className="px-6 py-2.5 rounded-lg bg-orange-500 text-white font-medium hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {isSubmitting ? "提交中..." : `生成 ${gridSize} 张图片`}
        </button>
      </div>
    </div>
  );
}
