"use client";

import { useState } from "react";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const sidebarItems = [
  { id: "home", label: "首页" },
  { id: "projects", label: "我的项目" },
  { id: "community", label: "我的资产" },
  { id: "canvas", label: "节点画布" },
];

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function AssetIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function CanvasIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="6" height="5" rx="1" />
      <rect x="16" y="3" width="6" height="5" rx="1" />
      <rect x="9" y="16" width="6" height="5" rx="1" />
      <path d="M5 8v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
      <line x1="12" y1="13" x2="12" y2="16" />
    </svg>
  );
}

const iconMap: Record<string, (active: boolean) => React.ReactNode> = {
  home: (active) => <HomeIcon active={active} />,
  projects: () => <FolderIcon />,
  community: () => <AssetIcon />,
  canvas: () => <CanvasIcon />,
};

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  return (
    <aside
      className="app-sidebar"
      style={{
        position: "fixed",
        left: 20,
        top: "50%",
        transform: "translateY(-50%)",
        width: 58,
        borderRadius: 4,
        padding: 8,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        zIndex: 90,
        backgroundColor: "var(--bg-panel)",
        border: "1px solid var(--border)",
      }}
    >
      {sidebarItems.map((item) => {
        const isActive = activeTab === item.id;
        return (
          <SidebarButton
            key={item.id}
            item={item}
            isActive={isActive}
            onTabChange={onTabChange}
          />
        );
      })}
    </aside>
  );
}

function SidebarButton({ item, isActive, onTabChange }: { item: typeof sidebarItems[0], isActive: boolean, onTabChange: (id: string) => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={() => onTabChange(item.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={item.label}
      style={{
        width: 42,
        height: 42,
        borderRadius: 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: isActive ? "var(--accent-pink)" : hovered ? "var(--accent-hot-pink)" : "var(--text-muted)",
        background: "transparent",
        borderLeft: isActive ? "3px solid var(--accent-pink)" : "3px solid transparent",
        transition: "all 0.2s ease",
      }}
    >
      {iconMap[item.id](isActive)}
    </button>
  );
}
