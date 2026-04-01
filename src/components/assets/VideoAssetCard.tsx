"use client";

import { useState } from "react";
import type { VideoAssetItem } from "@/types/assets";
import { deleteLibraryAsset } from "@/lib/api";
import VideoLightbox from "@/components/ui/VideoLightbox";

interface VideoAssetCardProps {
  item: VideoAssetItem;
  onRefresh: () => void;
}

export default function VideoAssetCard({ item, onRefresh }: VideoAssetCardProps) {
  const [hovered, setHovered] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  // 利用可辨识联合自动窄化类型
  const isLibrary = item.source === "library";
  const title = isLibrary
    ? (item.asset.title ?? "未命名视频")
    : (item.shot.prompt?.slice(0, 40) ?? "工作流视频");
  const videoUrl = isLibrary
    ? item.asset.local_url
    : (item.shot.video_local_path || item.shot.video_url);
  const downloadUrl = isLibrary ? item.asset.download_url : undefined;
  const remoteUrl = isLibrary ? item.asset.remote_url : item.shot.video_url;
  const resolution = isLibrary ? item.asset.resolution : undefined;
  const ratio = isLibrary ? item.asset.ratio : undefined;
  const duration = isLibrary ? item.asset.duration : undefined;
  const savedAt = isLibrary ? item.asset.saved_at : undefined;
  const taskId = isLibrary ? item.asset.task_id : undefined;

  const handleDelete = async () => {
    if (!taskId) return;
    if (!confirm("确定删除此视频？（可在回收站恢复）")) return;
    try {
      await deleteLibraryAsset(taskId);
      onRefresh();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => { if (videoUrl) setPreviewSrc(videoUrl); }}
      style={{
        cursor: videoUrl ? "pointer" : "default",
        borderRadius: 12,
        overflow: "hidden",
        border: hovered ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(255,255,255,0.06)",
        backgroundColor: hovered ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.05)",
        transition: "all 0.25s ease",
        transform: hovered ? "translateY(-2px)" : "none",
      }}
    >
      {/* 视频预览 */}
      <div style={{ position: "relative", height: 160, overflow: "hidden", backgroundColor: "#000" }}>
        {videoUrl ? (
          <video
            src={videoUrl}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            muted
            onMouseEnter={(e) => { (e.target as HTMLVideoElement).play().catch(() => {}); }}
            onMouseLeave={(e) => {
              const v = e.target as HTMLVideoElement;
              v.pause();
              v.currentTime = 0;
            }}
          />
        ) : (
          <div style={{
            width: "100%", height: "100%",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "rgba(255,255,255,0.15)",
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
        )}

        {/* 时长标签 */}
        {duration && (
          <span style={{
            position: "absolute", bottom: 8, right: 8,
            padding: "2px 6px", borderRadius: 4, fontSize: 11,
            color: "#fff", backgroundColor: "rgba(0,0,0,0.7)",
          }}>
            {duration}s
          </span>
        )}

        {/* 来源标签 */}
        {!isLibrary && (
          <span style={{
            position: "absolute", top: 8, left: 8,
            padding: "2px 6px", borderRadius: 4, fontSize: 10,
            color: "#c084fc", backgroundColor: "rgba(124,58,237,0.3)",
          }}>
            工作流
          </span>
        )}
      </div>

      {/* 信息区域 */}
      <div style={{ padding: "8px 12px 12px" }}>
        <h3 style={{
          fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.9)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0,
        }}>
          {title}
        </h3>

        {savedAt && (
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>{savedAt}</p>
        )}

        {/* 元数据标签 */}
        {(resolution || ratio || duration) && (
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            {[resolution, ratio, duration ? `${duration}s` : null].filter(Boolean).map((tag, i) => (
              <span key={i} style={{
                padding: "1px 6px", borderRadius: 4, fontSize: 10,
                color: "rgba(255,255,255,0.4)", backgroundColor: "rgba(255,255,255,0.06)",
              }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* 操作按钮 */}
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {downloadUrl && (
            <a
              href={downloadUrl}
              style={{
                padding: "4px 10px", borderRadius: 6, fontSize: 11,
                color: "#fff", backgroundColor: "var(--accent-pink, #e91e8c)",
                textDecoration: "none", fontWeight: 500,
              }}
            >
              下载
            </a>
          )}
          {remoteUrl && (
            <button
              onClick={(e) => { e.stopPropagation(); window.open(remoteUrl, "_blank"); }}
              style={{
                padding: "4px 10px", borderRadius: 6, fontSize: 11,
                color: "rgba(255,255,255,0.6)", backgroundColor: "rgba(255,255,255,0.08)",
                border: "none", cursor: "pointer",
              }}
            >
              远程链接
            </button>
          )}
          {taskId && (
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(); }}
              style={{
                padding: "4px 10px", borderRadius: 6, fontSize: 11,
                color: "#ff6b6b", backgroundColor: "rgba(255,107,107,0.1)",
                border: "none", cursor: "pointer",
              }}
            >
              删除
            </button>
          )}
        </div>
      </div>
      {previewSrc && <VideoLightbox src={previewSrc} onClose={() => setPreviewSrc(null)} />}
    </div>
  );
}
