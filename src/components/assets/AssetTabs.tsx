"use client";

import { ASSET_TABS, type AssetTab } from "@/types/assets";

interface AssetTabsProps {
  activeTab: AssetTab;
  onTabChange: (tab: AssetTab) => void;
  counts: Record<AssetTab, number>;
}

export default function AssetTabs({ activeTab, onTabChange, counts }: AssetTabsProps) {
  return (
    <div style={{ display: "flex", gap: 4, padding: "0 4px" }}>
      {ASSET_TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? "#fff" : "rgba(255,255,255,0.5)",
              backgroundColor: isActive ? "rgba(255,255,255,0.1)" : "transparent",
              border: "none",
              cursor: "pointer",
              transition: "all 0.2s",
              position: "relative",
            }}
          >
            {tab.label}
            {counts[tab.id] > 0 && (
              <span style={{
                marginLeft: 6,
                fontSize: 11,
                color: isActive ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.3)",
              }}>
                {counts[tab.id]}
              </span>
            )}
            {isActive && (
              <span style={{
                position: "absolute",
                bottom: 0,
                left: "50%",
                transform: "translateX(-50%)",
                width: 24,
                height: 2,
                borderRadius: 1,
                backgroundColor: "#BFFF00",
              }} />
            )}
          </button>
        );
      })}
    </div>
  );
}
