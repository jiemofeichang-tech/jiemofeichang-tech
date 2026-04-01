"use client";

import { useEffect, useCallback, useMemo } from "react";
import type { CharacterAssetItem } from "@/types/assets";

interface AssetDetailModalProps {
  item: CharacterAssetItem | null;
  onClose: () => void;
}

const EXPRESSION_LABELS: Record<string, string> = {
  happy: "开心", sad: "伤心", angry: "生气",
  surprised: "惊讶", thinking: "思考", shy: "害羞",
  neutral: "中性", determined: "坚定",
};

export default function AssetDetailModal({ item, onClose }: AssetDetailModalProps) {
  // ESC 键关闭
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    if (!item) return;
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [item, handleKeyDown]);

  // 数据准备（hooks 之后才可提前返回）
  const views = useMemo(() => {
    if (!item) return [];
    const ch = item.character;
    return [
      { key: "front_view", label: "正面", url: ch.front_view },
      { key: "side_view", label: "侧面", url: ch.side_view },
      { key: "back_view", label: "背面", url: ch.back_view },
    ];
  }, [item]);

  const expressions = useMemo(() => {
    if (!item?.character.expression_sheet) return [];
    return Object.entries(item.character.expression_sheet).map(([key, url]) => ({
      key,
      label: EXPRESSION_LABELS[key] || key,
      url: url || null,
    }));
  }, [item]);

  if (!item) return null;

  const { character, projectName } = item;

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${character.name} 角色详情`}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        backgroundColor: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "90%", maxWidth: 800, maxHeight: "90vh",
          backgroundColor: "#1a1a1a",
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.1)",
          overflow: "auto",
        }}
      >
        {/* 头部 */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: 0 }}>
            {character.name}
          </h2>
          <button
            onClick={onClose}
            aria-label="关闭"
            style={{
              width: 32, height: 32, borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "rgba(255,255,255,0.5)", backgroundColor: "rgba(255,255,255,0.06)",
              border: "none", cursor: "pointer", fontSize: 18,
            }}
          >
            &times;
          </button>
        </div>

        <div style={{ padding: 24 }}>
          {/* 三视角展示 */}
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.6)", margin: "0 0 12px" }}>
            三视角
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
            {views.map((v) => (
              <div key={v.key} style={{
                borderRadius: 10, overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.06)",
                backgroundColor: "#111",
              }}>
                {v.url ? (
                  <img src={v.url} alt={v.label} loading="lazy" style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }} />
                ) : (
                  <div style={{
                    width: "100%", height: 200,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "rgba(255,255,255,0.15)", fontSize: 12,
                  }}>
                    暂无图片
                  </div>
                )}
                <div style={{ padding: "6px 10px", textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                  {v.label}
                </div>
              </div>
            ))}
          </div>

          {/* 表情展示 */}
          {expressions.length > 0 && (
            <>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.6)", margin: "0 0 12px" }}>
                表情
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 10, marginBottom: 24 }}>
                {expressions.map((expr) => (
                  <div key={expr.key} style={{
                    borderRadius: 8, overflow: "hidden",
                    border: "1px solid rgba(255,255,255,0.06)",
                    backgroundColor: "#111",
                  }}>
                    {expr.url ? (
                      <img src={expr.url} alt={expr.label} loading="lazy" style={{ width: "100%", height: 100, objectFit: "cover", display: "block" }} />
                    ) : (
                      <div style={{
                        width: "100%", height: 100,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "rgba(255,255,255,0.1)", fontSize: 11,
                      }}>
                        -
                      </div>
                    )}
                    <div style={{ padding: "4px 6px", textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                      {expr.label}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 角色信息 */}
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.6)", margin: "0 0 12px" }}>
            角色信息
          </h3>
          <div style={{
            padding: 16, borderRadius: 10,
            backgroundColor: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}>
            {character.description && (
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", margin: "0 0 8px", lineHeight: 1.6 }}>
                {character.description}
              </p>
            )}
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: 0 }}>
              所属项目: {projectName}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
