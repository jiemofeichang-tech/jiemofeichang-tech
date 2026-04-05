"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { scene360JobStatus, scene360Regenerate, type Scene360JobStatus } from "@/lib/api";

interface Scene360DisplayProps {
  jobId: string;
  viewCount: 4 | 6 | 8;
}

export default function Scene360Display({ jobId, viewCount }: Scene360DisplayProps) {
  const [job, setJob] = useState<Scene360JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regeneratingKeys, setRegeneratingKeys] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const status = await scene360JobStatus(jobId);
        setJob(status);
        const hasActive = status.results.some((r) => r.status === "pending" || r.status === "generating");
        if (!hasActive) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setRegeneratingKeys(new Set());
        }
      } catch { /* ignore */ }
    }, 2000);
  }, [jobId]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const status = await scene360JobStatus(jobId);
        if (!cancelled) setJob(status);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "轮询失败");
      }
    };
    poll();
    startPolling();
    return () => { cancelled = true; if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [jobId, startPolling]);

  const handleRegenerate = useCallback(async (viewKey: string) => {
    setRegeneratingKeys((prev) => new Set(prev).add(viewKey));
    try {
      await scene360Regenerate({ job_id: jobId, view_key: viewKey });
      setJob((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: "generating",
          results: prev.results.map((r) =>
            r.key === viewKey ? { ...r, status: "generating" as const, image_url: null } : r
          ),
        };
      });
      startPolling();
    } catch {
      setRegeneratingKeys((prev) => { const n = new Set(prev); n.delete(viewKey); return n; });
    }
  }, [jobId, startPolling]);

  const handleDownloadSingle = useCallback((url: string, key: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `scene360_${key}.png`;
    a.click();
  }, []);

  const progress = job ? Math.round((job.completed / job.total) * 100) : 0;
  const hasActive = job?.results.some((r) => r.status === "pending" || r.status === "generating") ?? false;
  const allDone = !hasActive && (job?.completed ?? 0) > 0;

  // Determine grid layout
  const cols = viewCount <= 4 ? 4 : viewCount <= 6 ? 3 : 4;

  return (
    <div className="flex flex-col gap-6">
      {/* Progress */}
      <div className="flex items-center gap-4">
        <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-sm text-white/60 w-24 text-right">
          {job ? `${job.completed} / ${job.total}` : "加载中..."}
        </span>
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-500/20 border border-red-500/40 rounded-lg text-red-400 text-sm">{error}</div>
      )}

      {/* Views Grid */}
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
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
                    className="w-7 h-7 rounded-full bg-black/60 hover:bg-blue-500/80 flex items-center justify-center transition disabled:opacity-50"
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
                  className="px-3 py-1 rounded-lg bg-blue-500/20 text-blue-400 text-xs hover:bg-blue-500/40 transition"
                >
                  重新生成
                </button>
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-blue-400/40 border-t-blue-400 rounded-full animate-spin" />
              </div>
            )}

            {/* Direction label */}
            <div className="absolute bottom-0 inset-x-0 px-2 py-1.5 bg-gradient-to-t from-black/80 to-transparent">
              <span className="text-xs text-white/90">{result.direction} {result.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Stitch Guide */}
      {allDone && job?.stitch_guide && (
        <div className="p-4 bg-white/5 rounded-xl border border-white/10">
          <pre className="text-xs text-white/70 whitespace-pre-wrap font-sans">{job.stitch_guide}</pre>
        </div>
      )}
    </div>
  );
}
