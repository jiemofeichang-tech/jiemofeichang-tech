"use client";

import { type AssetRecord, openStorage, deleteLibraryAsset } from "@/lib/api";

interface LibrarySectionProps {
  library: AssetRecord[];
  onRefresh: () => void;
}

export default function LibrarySection({ library, onRefresh }: LibrarySectionProps) {
  const handleOpenStorage = async () => {
    try { await openStorage(); } catch (err) { alert((err as Error).message); }
  };

  return (
    <div style={{ padding: "32px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)" }}>本地作品库</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleOpenStorage}
            style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, color: "rgba(255,255,255,0.6)", backgroundColor: "rgba(255,255,255,0.08)", border: "none" }}
          >
            打开目录
          </button>
          <button
            onClick={onRefresh}
            style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, color: "rgba(255,255,255,0.6)", backgroundColor: "rgba(255,255,255,0.08)", border: "none" }}
          >
            刷新
          </button>
        </div>
      </div>

      {library.length === 0 ? (
        <div style={{ textAlign: "center", padding: 80, color: "rgba(255,255,255,0.3)" }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 16, opacity: 0.3 }}>
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
            <line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/>
            <line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/>
            <line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>
            <line x1="17" y1="17" x2="22" y2="17"/>
          </svg>
          <p style={{ fontSize: 14 }}>作品库为空</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>生成成功的视频会自动保存到这里</p>
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 20,
        }}>
          {library.map((asset) => (
            <AssetCard key={asset.task_id} asset={asset} onRefresh={onRefresh} />
          ))}
        </div>
      )}
    </div>
  );
}

function AssetCard({ asset, onRefresh }: { asset: AssetRecord; onRefresh: () => void }) {
  const handleDelete = async () => {
    if (!confirm("确定删除此资产？（可在回收站恢复）")) return;
    try {
      await deleteLibraryAsset(asset.task_id);
      onRefresh();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <div style={{ cursor: "pointer", transition: "all 0.2s" }}>
      {/* Video preview */}
      <div style={{
        borderRadius: 12, overflow: "hidden", position: "relative",
        border: "1px solid rgba(255,255,255,0.06)",
      }}>
        <video
          src={asset.local_url}
          style={{ width: "100%", height: 160, objectFit: "cover", backgroundColor: "#000", display: "block" }}
          muted
          onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
          onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
        />
      </div>

      {/* Info */}
      <div style={{ padding: "8px 2px 0" }}>
        <h3 style={{
          fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.9)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {asset.title}
        </h3>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
          {asset.saved_at}
        </p>
        {(asset.resolution || asset.ratio || asset.duration) && (
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            {[asset.resolution, asset.ratio, asset.duration ? `${asset.duration}s` : null].filter(Boolean).map((tag, i) => (
              <span key={i} style={{ padding: "1px 6px", borderRadius: 4, fontSize: 10, color: "rgba(255,255,255,0.4)", backgroundColor: "rgba(255,255,255,0.06)" }}>{tag}</span>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <a
            href={asset.download_url}
            style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, color: "#fff", backgroundColor: "var(--accent-pink)", textDecoration: "none", fontWeight: 500 }}
          >
            下载
          </a>
          {asset.remote_url && (
            <button
              onClick={() => window.open(asset.remote_url, "_blank")}
              style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, color: "rgba(255,255,255,0.6)", backgroundColor: "rgba(255,255,255,0.08)", border: "none", cursor: "pointer" }}
            >
              远程链接
            </button>
          )}
          <button
            onClick={handleDelete}
            style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, color: "#ff6b6b", backgroundColor: "rgba(255,107,107,0.1)", border: "none", cursor: "pointer" }}
          >
            删除
          </button>
        </div>
      </div>
    </div>
  );
}
