"use client";

import { useState } from "react";
import type { AssetTab } from "@/types/assets";

interface AssetSearchBarProps {
  activeTab: AssetTab;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  showFavoritesOnly: boolean;
  onToggleFavorites: () => void;
}

const PLACEHOLDERS: Record<AssetTab, string> = {
  characters: "搜索角色...",
  storyboards: "搜索分镜...",
  videos: "搜索视频...",
  scenes: "搜索场景...",
};

export default function AssetSearchBar({
  activeTab,
  searchQuery,
  onSearchChange,
  showFavoritesOnly,
  onToggleFavorites,
}: AssetSearchBarProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {/* 收藏筛选 */}
      <button
        onClick={onToggleFavorites}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 14px",
          borderRadius: 20,
          fontSize: 13,
          color: showFavoritesOnly ? "#FFD700" : "rgba(255,255,255,0.5)",
          backgroundColor: showFavoritesOnly ? "rgba(255,215,0,0.1)" : "rgba(255,255,255,0.06)",
          border: showFavoritesOnly ? "1px solid rgba(255,215,0,0.3)" : "1px solid transparent",
          cursor: "pointer",
          transition: "all 0.2s",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: showFavoritesOnly ? "#FFD700" : "rgba(255,255,255,0.3)",
        }} />
        我的收藏
      </button>

      {/* 搜索框 */}
      <div style={{ position: "relative" }}>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={PLACEHOLDERS[activeTab]}
          style={{
            width: 220,
            padding: "8px 12px 8px 36px",
            borderRadius: 10,
            fontSize: 13,
            color: "#fff",
            backgroundColor: "rgba(255,255,255,0.06)",
            border: isFocused ? "1px solid rgba(191,255,0,0.4)" : "1px solid rgba(255,255,255,0.08)",
            outline: "none",
            transition: "border-color 0.2s",
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
      </div>
    </div>
  );
}
