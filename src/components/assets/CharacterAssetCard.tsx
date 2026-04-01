"use client";

import { useState } from "react";
import type { CharacterAssetItem } from "@/types/assets";

interface CharacterAssetCardProps {
  item: CharacterAssetItem;
  onClick: () => void;
}

export default function CharacterAssetCard({ item, onClick }: CharacterAssetCardProps) {
  const { character, projectName, index } = item;
  const [hovered, setHovered] = useState(false);

  // 取正面图或侧面图作为主图
  const mainImage = hovered
    ? (character.side_view || character.front_view)
    : (character.front_view || character.side_view);

  // 计算资产数量
  const viewCount = [character.front_view, character.side_view, character.back_view].filter(Boolean).length;
  const exprCount = character.expression_sheet
    ? Object.values(character.expression_sheet).filter(Boolean).length
    : 0;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        cursor: "pointer",
        borderRadius: 12,
        overflow: "hidden",
        border: hovered ? "1px solid rgba(191,255,0,0.5)" : "1px solid rgba(255,255,255,0.06)",
        backgroundColor: hovered ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.05)",
        transition: "all 0.25s ease",
        transform: hovered ? "translateY(-2px)" : "none",
      }}
    >
      {/* 缩略图区域 */}
      <div style={{ position: "relative", height: 240, overflow: "hidden", backgroundColor: "#111" }}>
        {/* 编号标签 */}
        <span style={{
          position: "absolute",
          top: 10,
          left: 10,
          padding: "2px 8px",
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 700,
          color: "#fff",
          backgroundColor: "rgba(0,0,0,0.7)",
          zIndex: 2,
        }}>
          NO. {String(index).padStart(3, "0")}
        </span>

        {mainImage ? (
          <img
            src={mainImage}
            alt={character.name}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transition: "transform 0.3s ease",
              transform: hovered ? "scale(1.05)" : "scale(1)",
            }}
          />
        ) : (
          <div style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,0.15)",
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
        )}
      </div>

      {/* 信息区域 */}
      <div style={{ padding: "10px 12px 12px" }}>
        <h3 style={{
          fontSize: 14,
          fontWeight: 600,
          color: "rgba(255,255,255,0.9)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          margin: 0,
        }}>
          {character.name}
        </h3>
        <p style={{
          fontSize: 12,
          color: "rgba(255,255,255,0.35)",
          marginTop: 4,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {projectName} {viewCount > 0 || exprCount > 0 ? `\u00B7 ${viewCount}视角${exprCount > 0 ? ` ${exprCount}表情` : ""}` : ""}
        </p>

        {/* 状态标签 */}
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <span style={{
            padding: "2px 8px",
            borderRadius: 4,
            fontSize: 10,
            color: character.status === "done" ? "#BFFF00" : character.status === "generating" ? "#fbbf24" : "rgba(255,255,255,0.4)",
            backgroundColor: character.status === "done" ? "rgba(191,255,0,0.1)" : character.status === "generating" ? "rgba(251,191,36,0.1)" : "rgba(255,255,255,0.06)",
          }}>
            {character.status === "done" ? "已完成" : character.status === "generating" ? "生成中" : "待生成"}
          </span>
        </div>
      </div>
    </div>
  );
}
