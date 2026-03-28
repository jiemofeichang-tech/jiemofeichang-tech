"use client";

import { useState, useEffect } from "react";
import { fetchTrash, restoreFromTrash, emptyTrash, type TaskRecord, type AssetRecord } from "@/lib/api";

interface TrashItem {
  type: "task" | "asset";
  id: string;
  title: string;
  trashed_at: string;
}

export default function TrashPage() {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchTrash();
      const mapped: TrashItem[] = [
        ...(data.tasks || []).map((t: TaskRecord & { trashed_at?: string }) => ({
          type: "task" as const,
          id: t.id,
          title: t.title || t.id,
          trashed_at: t.trashed_at || "",
        })),
        ...(data.assets || []).map((a: AssetRecord & { trashed_at?: string }) => ({
          type: "asset" as const,
          id: a.task_id,
          title: a.title || a.task_id,
          trashed_at: a.trashed_at || "",
        })),
      ];
      mapped.sort((a, b) => (b.trashed_at || "").localeCompare(a.trashed_at || ""));
      setItems(mapped);
    } catch {
      // ignore
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleRestore = async (item: TrashItem) => {
    try {
      await restoreFromTrash(item.type, item.id);
      load();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleEmpty = async () => {
    if (!confirm("确定要清空回收站吗？此操作不可撤销。")) return;
    try {
      await emptyTrash();
      load();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <div style={{ padding: "32px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)" }}>
          回收站
        </h1>
        {items.length > 0 && (
          <button
            onClick={handleEmpty}
            style={{
              padding: "6px 14px", borderRadius: 8, fontSize: 12,
              color: "#ff6b6b", backgroundColor: "rgba(255,107,107,0.1)",
              border: "1px solid rgba(255,107,107,0.2)", cursor: "pointer",
            }}
          >
            清空回收站
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 80, color: "rgba(255,255,255,0.3)", fontSize: 14 }}>
          加载中...
        </div>
      ) : items.length === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: 400,
            color: "var(--text-muted)",
            gap: 12,
          }}
        >
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          <p style={{ fontSize: 14 }}>回收站为空</p>
          <p style={{ fontSize: 12, opacity: 0.6 }}>已删除的项目会在这里显示</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((item) => (
            <div
              key={`${item.type}-${item.id}`}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 16px", borderRadius: 10,
                backgroundColor: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{
                  padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 500,
                  color: item.type === "task" ? "#7c9aff" : "#00cc99",
                  backgroundColor: item.type === "task" ? "rgba(124,154,255,0.1)" : "rgba(0,204,153,0.1)",
                }}>
                  {item.type === "task" ? "任务" : "资产"}
                </span>
                <span style={{ fontSize: 14, color: "rgba(255,255,255,0.8)" }}>{item.title}</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{item.trashed_at}</span>
              </div>
              <button
                onClick={() => handleRestore(item)}
                style={{
                  padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 500,
                  color: "#7c9aff", backgroundColor: "rgba(124,154,255,0.1)",
                  border: "1px solid rgba(124,154,255,0.2)", cursor: "pointer",
                }}
              >
                恢复
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
