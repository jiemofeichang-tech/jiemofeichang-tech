"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { storyboardJobStatus, storyboardRegenerate, type StoryboardJobStatus } from "@/lib/api";
import { useGridComposite } from "./useGridComposite";

interface StoryboardDisplayProps {
  jobId: string;
  gridSize: 9 | 25;
}

export default function StoryboardDisplay({ jobId, gridSize }: StoryboardDisplayProps) {
  const [job, setJob] = useState<StoryboardJobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regeneratingKeys, setRegeneratingKeys] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cols = gridSize === 9 ? 3 : 5;

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const status = await storyboardJobStatus(jobId);
        setJob(status);
        const hasGenerating = status.results.some((r) => r.status === "pending" || r.status === "generating");
        if (!hasGenerating) {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          setRegeneratingKeys(new Set());
        }
      } catch { /* ignore */ }
    }, 2000);
  }, [jobId]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const status = await storyboardJobStatus(jobId);
        if (cancelled) return;
        setJob(status);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "轮询失败");
      }
    };
    poll();
    startPolling();
    return () => {
      cancelled = true;
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [jobId, startPolling]);

  const handleRegenerate = useCallback(async (frameKey: string) => {
    setRegeneratingKeys((prev) => new Set(prev).add(frameKey));
    try {
      await storyboardRegenerate({ job_id: jobId, frame_key: frameKey });
      setJob((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: "generating",
          results: prev.results.map((r) =>
            r.key === frameKey ? { ...r, status: "generating" as const, image_url: null } : r
          ),
        };
      });
      startPolling();
    } catch {
      setRegeneratingKeys((prev) => { const n = new Set(prev); n.delete(frameKey); return n; });
    }
  }, [jobId, startPolling]);

  const completedUrls = job?.results.filter((r) => r.status === "done" && r.image_url).map((r) => r.image_url as string) ?? [];
  const hasGenerating = job?.results.some((r) => r.status === "pending" || r.status === "generating") ?? false;
  const allDone = !hasGenerating && (job?.completed ?? 0) > 0;

  // 16:9 default for storyboard
  const cellW = 1536;
  const cellH = 864;

  const { download, isCompositing } = useGridComposite({
    imageUrls: allDone ? completedUrls : [],
    cols,
    cellWidth: cellW,
    cellHeight: cellH,
  });

  const handleDownloadSingle = useCallback((url: string, key: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `${key}.png`;
    a.click();
  }, []);

  const progress = job ? Math.round((job.completed / job.total) * 100) : 0;

  // Act colors
  const actColor = (label: string): string => {
    if (label.includes("Setup")) return "text-green-400";
    if (label.includes("Action") || label.includes("Confrontation")) return "text-yellow-400";
    if (label.includes("Climax")) return "text-red-400";
    if (label.includes("Resolution")) return "text-purple-400";
    if (label.includes("Prologue")) return "text-blue-400";
    return "text-white/60";
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Progress */}
      <div className="flex items-center gap-4">
        <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-purple-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-sm text-white/60 w-24 text-right">
          {job ? `${job.completed} / ${job.total}` : "加载中..."}
        </span>
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-500/20 border border-red-500/40 rounded-lg text-red-400 text-sm">{error}</div>
      )}

      {/* Grid */}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {job?.results.map((result) => (
          <div
            key={result.key}
            className="relative rounded-xl overflow-hidden bg-white/5 border border-white/10 group"
            style={{ aspectRatio: "16 / 9" }}
          >
            {result.status === "done" && result.image_url ? (
              <>
                <img src={result.image_url} alt={result.label} className="w-full h-full object-cover" />
                <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={() => handleRegenerate(result.key)}
                    disabled={regeneratingKeys.has(result.key)}
                    className="w-7 h-7 rounded-full bg-black/60 hover:bg-purple-500/80 flex items-center justify-center transition disabled:opacity-50"
                    title="重新生成"
                  >
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDownloadSingle(result.image_url!, result.key)}
                    className="w-7 h-7 rounded-full bg-black/60 hover:bg-blue-500/80 flex items-center justify-center transition"
                    title="下载"
                  >
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v12m0 0l-4-4m4 4l4-4M4 18h16" />
                    </svg>
                  </button>
                </div>
              </>
            ) : result.status === "failed" ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                <span className="text-red-400 text-xs">生成失败</span>
                <button
                  onClick={() => handleRegenerate(result.key)}
                  className="px-3 py-1 rounded-lg bg-purple-500/20 text-purple-400 text-xs hover:bg-purple-500/40 transition"
                >
                  重新生成
                </button>
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-purple-400/40 border-t-purple-400 rounded-full animate-spin" />
              </div>
            )}

            {/* Label */}
            <div className="absolute bottom-0 inset-x-0 px-2 py-1.5 bg-gradient-to-t from-black/80 to-transparent">
              <div className="flex items-center gap-1.5">
                <span className="text-white/90 text-xs font-bold">{result.key}</span>
                <span className={`text-[10px] ${actColor(result.label)}`}>
                  {result.label.replace(result.key + " ", "")}
                </span>
              </div>
              {result.description && (
                <p className="text-white/50 text-[10px] mt-0.5 line-clamp-1">{result.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Download */}
      {allDone && completedUrls.length > 0 && (
        <div className="flex justify-center gap-3">
          <button
            onClick={download}
            disabled={isCompositing}
            className="px-6 py-2.5 rounded-lg bg-purple-500 text-white font-medium hover:bg-purple-600 disabled:opacity-50 transition"
          >
            {isCompositing ? "拼接中..." : `下载分镜网格图 (${cols}x${Math.ceil(job!.total / cols)})`}
          </button>
        </div>
      )}
    </div>
  );
}
