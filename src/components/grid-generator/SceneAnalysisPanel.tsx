"use client";

import { useCallback, useEffect, useState } from "react";
import { scene360Analyze, scene360Generate, type Scene360Analysis } from "@/lib/api";

interface RefImage {
  base64: string;
  width: number;
  height: number;
  mime: string;
}

interface SceneAnalysisPanelProps {
  refImage: RefImage;
  onConfirm: (viewCount: 4 | 6 | 8, jobId: string) => void;
  onBack: () => void;
}

const VIEW_OPTIONS = [
  { count: 4 as const, label: "四视图", desc: "0° 90° 180° 270°" },
  { count: 6 as const, label: "六视图", desc: "四方向 + 上下" },
  { count: 8 as const, label: "八视图", desc: "每45°一张" },
];

export default function SceneAnalysisPanel({ refImage, onConfirm, onBack }: SceneAnalysisPanelProps) {
  const [analysis, setAnalysis] = useState<Scene360Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(true);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [viewCount, setViewCount] = useState<4 | 6 | 8>(6);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const runAnalysis = useCallback(async () => {
    setAnalyzing(true);
    setAnalyzeError(null);
    setAnalysis(null);
    try {
      const result = await scene360Analyze({ reference_image: refImage.base64 });
      setAnalysis(result);
    } catch (err: unknown) {
      setAnalyzeError(err instanceof Error ? err.message : "分析失败");
    } finally {
      setAnalyzing(false);
    }
  }, [refImage]);

  useEffect(() => { runAnalysis(); }, [runAnalysis]);

  // Immutable update helpers
  const updateStyleAnchor = useCallback((key: string, value: string) => {
    setAnalysis((prev) => {
      if (!prev) return prev;
      return { ...prev, style_anchor: { ...prev.style_anchor, [key]: value } };
    });
  }, []);

  const updateSceneInfo = useCallback((key: string, value: string) => {
    setAnalysis((prev) => {
      if (!prev) return prev;
      return { ...prev, scene_info: { ...prev.scene_info, [key]: value } };
    });
  }, []);

  const updateSpatialElement = useCallback((index: number, field: "visible" | "inferred" | "image_prompt", value: string) => {
    setAnalysis((prev) => {
      if (!prev) return prev;
      const newElements = prev.spatial_elements.map((elem, i) => {
        if (i !== index) return elem;
        if (field === "image_prompt") {
          return { ...elem, image_prompt: value };
        }
        return { ...elem, [field]: value.split("，").map((s) => s.trim()).filter(Boolean) };
      });
      return { ...prev, spatial_elements: newElements };
    });
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!analysis) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await scene360Generate({
        reference_image: refImage.base64,
        analysis,
        view_count: viewCount,
        aspect_ratio: "16:9",
      });
      onConfirm(viewCount, result.job_id);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "生成请求失败");
    } finally {
      setSubmitting(false);
    }
  }, [analysis, refImage, viewCount, onConfirm]);

  if (analyzing) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <div className="w-10 h-10 border-3 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
        <p className="text-white/60">AI 正在分析参考图...</p>
        <p className="text-white/30 text-sm">画风锚定 + 场景识别 + 360° 空间推理</p>
      </div>
    );
  }

  if (analyzeError) {
    return (
      <div className="flex flex-col items-center gap-4 py-20">
        <div className="px-4 py-2 bg-red-500/20 border border-red-500/40 rounded-lg text-red-400 text-sm">
          {analyzeError}
        </div>
        <div className="flex gap-3">
          <button onClick={onBack} className="px-4 py-2 bg-white/10 rounded-lg text-white/60 hover:bg-white/20 transition">返回</button>
          <button onClick={runAnalysis} className="px-4 py-2 bg-blue-500 rounded-lg text-white hover:bg-blue-600 transition">重新分析</button>
        </div>
      </div>
    );
  }

  if (!analysis) return null;

  const { style_anchor, scene_info, spatial_elements } = analysis;

  return (
    <div className="flex flex-col gap-5">
      {/* Editable hint */}
      <div className="px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-300 text-xs">
        💡 以下分析结果均可编辑。修改后 AI 将根据你的描述生成图片。
      </div>

      {/* Reference + Scene Info */}
      <div className="flex gap-5">
        <div className="w-40 h-40 rounded-xl overflow-hidden bg-white/5 flex-shrink-0">
          <img src={refImage.base64} alt="参考图" className="w-full h-full object-cover" />
        </div>
        <div className="flex-1 grid grid-cols-2 gap-2 text-sm">
          <EditableItem label="场景类型" value={scene_info.scene_type} onChange={(v) => updateSceneInfo("scene_type", v)} />
          <EditableItem label="时间段" value={scene_info.time_of_day} onChange={(v) => updateSceneInfo("time_of_day", v)} />
          <EditableItem label="主光源" value={scene_info.main_light} onChange={(v) => updateSceneInfo("main_light", v)} />
          <EditableItem label="观察者位置" value={scene_info.observer_position} onChange={(v) => updateSceneInfo("observer_position", v)} />
          <EditableItem label="视角范围" value={scene_info.covered_fov} onChange={(v) => updateSceneInfo("covered_fov", v)} />
          <EditableItem label="参考角度" value={scene_info.ref_angle} onChange={(v) => updateSceneInfo("ref_angle", v)} />
        </div>
      </div>

      {/* Style Anchor */}
      <Section title="画风锚定">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <EditableItem label="渲染类型" value={style_anchor.rendering_type} onChange={(v) => updateStyleAnchor("rendering_type", v)} />
          <EditableItem label="材质老化" value={style_anchor.material_aging} onChange={(v) => updateStyleAnchor("material_aging", v)} />
          <EditableItem label="纹理密度" value={style_anchor.texture_density} onChange={(v) => updateStyleAnchor("texture_density", v)} />
          <EditableItem label="表面磨损" value={style_anchor.surface_wear} onChange={(v) => updateStyleAnchor("surface_wear", v)} />
          <EditableItem label="色彩风格" value={style_anchor.color_style} onChange={(v) => updateStyleAnchor("color_style", v)} />
          <EditableItem label="光影" value={style_anchor.lighting} onChange={(v) => updateStyleAnchor("lighting", v)} />
          <EditableItem label="氛围" value={style_anchor.atmosphere} onChange={(v) => updateStyleAnchor("atmosphere", v)} />
          <EditableItem label="植被" value={style_anchor.vegetation} onChange={(v) => updateStyleAnchor("vegetation", v)} />
        </div>
      </Section>

      {/* Spatial Elements */}
      <Section title="360° 空间推理">
        <div className="grid grid-cols-2 gap-2">
          {spatial_elements.map((elem, idx) => {
            const toArr = (v: unknown): string[] => Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
            const visibleArr = toArr(elem.visible);
            const inferredArr = toArr(elem.inferred);
            return (
              <div key={elem.direction} className="p-2.5 bg-white/5 rounded-lg text-xs space-y-1.5">
                <div className="text-blue-400 font-medium">{elem.direction}</div>
                <div>
                  <span className="text-orange-400 text-[10px] font-medium">🎨 画面描述（用于生图，英文）</span>
                  <textarea
                    value={(elem as Record<string, unknown>).image_prompt as string ?? ""}
                    onChange={(e) => updateSpatialElement(idx, "image_prompt", e.target.value)}
                    className="w-full mt-0.5 px-2 py-1.5 bg-orange-500/5 border border-orange-500/20 rounded text-white/90 text-xs resize-none focus:border-orange-500/50 focus:outline-none transition"
                    rows={3}
                    placeholder="Complete English scene description for this direction..."
                  />
                </div>
                <details className="group">
                  <summary className="text-white/30 text-[10px] cursor-pointer hover:text-white/50 transition">
                    展开元素列表（参考用）
                  </summary>
                  <div className="mt-1 space-y-1">
                    <div>
                      <span className="text-green-400 text-[10px]">可见元素</span>
                      <textarea
                        value={visibleArr.join("，")}
                        onChange={(e) => updateSpatialElement(idx, "visible", e.target.value)}
                        className="w-full mt-0.5 px-2 py-1 bg-white/5 border border-white/10 rounded text-white/60 text-xs resize-none focus:border-blue-500/50 focus:outline-none transition"
                        rows={1}
                      />
                    </div>
                    <div>
                      <span className="text-yellow-400 text-[10px]">推断元素</span>
                      <textarea
                        value={inferredArr.join("，")}
                        onChange={(e) => updateSpatialElement(idx, "inferred", e.target.value)}
                        className="w-full mt-0.5 px-2 py-1 bg-white/5 border border-white/10 rounded text-white/60 text-xs resize-none focus:border-blue-500/50 focus:outline-none transition"
                        rows={1}
                      />
                    </div>
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      </Section>

      {/* View Count Selector */}
      <div>
        <h3 className="text-sm text-white/60 mb-2">视图模式</h3>
        <div className="flex gap-3">
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.count}
              onClick={() => setViewCount(opt.count)}
              className={`px-4 py-3 rounded-xl border transition-all ${
                viewCount === opt.count
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

      {/* Errors */}
      {submitError && (
        <div className="px-4 py-2 bg-red-500/20 border border-red-500/40 rounded-lg text-red-400 text-sm">
          {submitError}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 justify-end">
        <button onClick={onBack} className="px-5 py-2.5 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 transition">返回</button>
        <button onClick={runAnalysis} className="px-5 py-2.5 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 transition">重新分析</button>
        <button
          onClick={handleGenerate}
          disabled={submitting}
          className="px-6 py-2.5 rounded-lg bg-blue-500 text-white font-medium hover:bg-blue-600 disabled:opacity-50 transition"
        >
          {submitting ? "提交中..." : `生成 ${viewCount} 个视图`}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm text-white/60 mb-2">{title}</h3>
      {children}
    </div>
  );
}

interface EditableItemProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function EditableItem({ label, value, onChange }: EditableItemProps) {
  return (
    <div className="px-2.5 py-1.5 bg-white/5 rounded-lg">
      <div className="text-white/40 text-[10px] mb-0.5">{label}</div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent border-b border-white/10 text-white/80 text-xs py-0.5 focus:border-blue-500/50 focus:outline-none transition"
      />
    </div>
  );
}
