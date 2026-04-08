"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { gridJobStatus, gridRegenerate, type GridJobStatus } from "@/lib/api";
import { useGridComposite } from "./useGridComposite";

interface GridDisplayProps {
  jobId: string;
  gridSize: 9 | 25;
  refWidth: number;
  refHeight: number;
}

export default function GridDisplay({ jobId, gridSize, refWidth, refHeight }: GridDisplayProps) {
  const [job, setJob] = useState<GridJobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regeneratingKeys, setRegeneratingKeys] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cols = gridSize === 9 ? 3 : 5;

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const status = await gridJobStatus(jobId);
        setJob(status);

        const hasGenerating = status.results.some((r) => r.status === "pending" || r.status === "generating");
        if (!hasGenerating) {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          setRegeneratingKeys(new Set());
        }
      } catch {
        // ignore poll errors
      }
    }, 2000);
  }, [jobId]);

  // Initial poll
  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const status = await gridJobStatus(jobId);
        if (cancelled) return;
        setJob(status);
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "轮询失败";
        setError(message);
      }
    };

    poll();
    startPolling();

    return () => {
      cancelled = true;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [jobId, startPolling]);

  const handleRegenerate = useCallback(async (expressionKey: string) => {
    setRegeneratingKeys((prev) => new Set(prev).add(expressionKey));
    try {
      await gridRegenerate({ job_id: jobId, expression_key: expressionKey });
      // Update local state immediately
      setJob((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: "generating",
          results: prev.results.map((r) =>
            r.key === expressionKey ? { ...r, status: "generating" as const, image_url: null } : r
          ),
        };
      });
      // Restart polling
      startPolling();
    } catch {
      setRegeneratingKeys((prev) => {
        const next = new Set(prev);
        next.delete(expressionKey);
        return next;
      });
    }
  }, [jobId, startPolling]);

  const [retryingAll, setRetryingAll] = useState(false);
  const retryAbortRef = useRef(false);

  const handleRetryAllFailed = useCallback(async () => {
    if (!job) return;
    const failedKeys = job.results.filter((r) => r.status === "failed").map((r) => r.key);
    if (failedKeys.length === 0) return;

    setRetryingAll(true);
    retryAbortRef.current = false;

    for (const key of failedKeys) {
      if (retryAbortRef.current) break;
      setRegeneratingKeys((prev) => new Set(prev).add(key));
      try {
        await gridRegenerate({ job_id: jobId, expression_key: key });
        setJob((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            status: "generating",
            results: prev.results.map((r) =>
              r.key === key ? { ...r, status: "generating" as const, image_url: null } : r
            ),
          };
        });
        startPolling();
        // Wait for this one to finish before starting next (check every 2s)
        let waited = 0;
        while (waited < 180_000) {
          await new Promise((r) => setTimeout(r, 3000));
          waited += 3000;
          if (retryAbortRef.current) break;
          try {
            const status = await gridJobStatus(jobId);
            setJob(status);
            const item = status.results.find((r) => r.key === key);
            if (item && (item.status === "done" || item.status === "failed")) break;
          } catch { /* ignore */ }
        }
      } catch { /* ignore single failure */ }
    }
    setRetryingAll(false);
    setRegeneratingKeys(new Set());
  }, [job, jobId, startPolling]);

  const completedUrls = job?.results
    .filter((r) => r.status === "done" && r.image_url)
    .map((r) => r.image_url as string) ?? [];

  const hasGenerating = job?.results.some((r) => r.status === "pending" || r.status === "generating") ?? false;
  const allDone = !hasGenerating && (job?.completed ?? 0) > 0;

  const { download, isCompositing } = useGridComposite({
    imageUrls: allDone ? completedUrls : [],
    cols,
    cellWidth: refWidth,
    cellHeight: refHeight,
  });

  const handleDownloadSingle = useCallback((url: string, key: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `${key}.png`;
    a.click();
  }, []);

  const progress = job ? Math.round((job.completed / job.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Progress bar */}
      <div className="flex items-center gap-4">
        <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-orange-500 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-sm text-white/60 w-24 text-right">
          {job ? `${job.completed} / ${job.total}` : "加载中..."}
        </span>
      </div>

      {/* Retry all failed button */}
      {job && !hasGenerating && job.results.some((r) => r.status === "failed") && (
        <div className="flex justify-center">
          <button
            onClick={retryingAll ? () => { retryAbortRef.current = true; } : handleRetryAllFailed}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition ${
              retryingAll
                ? "bg-red-500/20 text-red-400 hover:bg-red-500/40"
                : "bg-orange-500/20 text-orange-400 hover:bg-orange-500/40"
            }`}
          >
            {retryingAll
              ? `重试中... 点击停止`
              : `重新生成全部失败项 (${job.results.filter((r) => r.status === "failed").length} 张)`}
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-red-500/20 border border-red-500/40 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Grid */}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {job?.results.map((result) => (
          <div
            key={result.key}
            className="relative rounded-xl overflow-hidden bg-white/5 border border-white/10 group"
            style={{ aspectRatio: `${refWidth} / ${refHeight}` }}
          >
            {result.status === "done" && result.image_url ? (
              <>
                <img
                  src={result.image_url}
                  alt={result.label}
                  className="w-full h-full object-cover"
                />
                {/* Action buttons on hover */}
                <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition">
                  {/* Regenerate button */}
                  <button
                    onClick={() => handleRegenerate(result.key)}
                    disabled={regeneratingKeys.has(result.key)}
                    className="w-7 h-7 rounded-full bg-black/60 hover:bg-orange-500/80 flex items-center justify-center transition disabled:opacity-50"
                    title="重新生成"
                  >
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                  {/* Download button */}
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
                  disabled={regeneratingKeys.has(result.key)}
                  className="px-3 py-1 rounded-lg bg-orange-500/20 text-orange-400 text-xs hover:bg-orange-500/40 transition disabled:opacity-50"
                >
                  重新生成
                </button>
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-orange-400/40 border-t-orange-400 rounded-full animate-spin" />
              </div>
            )}

            {/* Label badge */}
            <div className="absolute bottom-0 inset-x-0 px-2 py-1.5 bg-gradient-to-t from-black/80 to-transparent">
              <span className="text-xs text-white/90">{result.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Download actions */}
      {allDone && completedUrls.length > 0 && (
        <div className="flex justify-center gap-3">
          <button
            onClick={download}
            disabled={isCompositing}
            className="px-6 py-2.5 rounded-lg bg-orange-500 text-white font-medium hover:bg-orange-600 disabled:opacity-50 transition"
          >
            {isCompositing ? "拼接中..." : `下载网格图 (${cols}x${cols})`}
          </button>
        </div>
      )}
    </div>
  );
}
