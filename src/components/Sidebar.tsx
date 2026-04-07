"use client";

import { useState, type ReactNode } from "react";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const sidebarItems = [
  { id: "home", label: "首页", icon: <HomeIcon /> },
  { id: "projects", label: "项目", icon: <FolderIcon /> },
  { id: "community", label: "资产", icon: <ArchiveIcon /> },
  { id: "canvas", label: "画布", icon: <CanvasIcon /> },
  { id: "grid", label: "表情", icon: <GridIcon /> },
  { id: "scene-grid", label: "场景", icon: <SceneIcon /> },
  { id: "storyboard", label: "分镜", icon: <StoryboardIcon /> },
];

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  return (
    <aside
      className="app-sidebar"
      style={{
        position: "fixed",
        left: 24,
        top: "50%",
        transform: "translateY(-50%)",
        width: 82,
        padding: "14px 10px",
        borderRadius: 30,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        zIndex: 90,
      }}
    >
      {sidebarItems.map((item) => (
        <SidebarButton
          key={item.id}
          item={item}
          isActive={activeTab === item.id}
          onTabChange={onTabChange}
        />
      ))}
    </aside>
  );
}

function SidebarButton({
  item,
  isActive,
  onTabChange,
}: {
  item: { id: string; label: string; icon: ReactNode };
  isActive: boolean;
  onTabChange: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      title={item.label}
      aria-label={item.label}
      onClick={() => onTabChange(item.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 7,
        padding: "12px 6px",
        borderRadius: 24,
        color: isActive ? "var(--text-primary)" : hovered ? "#eaf2ff" : "var(--text-muted)",
        background: isActive ? "linear-gradient(180deg, rgba(130,182,255,0.28), rgba(130,182,255,0.12))" : "transparent",
        border: isActive ? "1px solid rgba(130,182,255,0.24)" : "1px solid transparent",
        boxShadow: isActive ? "0 18px 36px rgba(77,132,255,0.16), inset 0 1px 0 rgba(255,255,255,0.1)" : "none",
        transition: "transform 0.18s ease, background 0.18s ease, color 0.18s ease",
        transform: hovered && !isActive ? "translateY(-1px)" : "none",
      }}
    >
      <span
        style={{
          width: 40,
          height: 40,
          borderRadius: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isActive ? "rgba(255,255,255,0.1)" : hovered ? "rgba(255,255,255,0.05)" : "transparent",
        }}
      >
        {item.icon}
      </span>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.02em" }}>{item.label}</span>
    </button>
  );
}

function BaseIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function HomeIcon() {
  return (
    <BaseIcon>
      <path d="m4 10 8-6 8 6" />
      <path d="M6 10v9h12v-9" />
      <path d="M10 19v-5h4v5" />
    </BaseIcon>
  );
}

function FolderIcon() {
  return (
    <BaseIcon>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H10l1.7 2H18a2 2 0 0 1 2 2v6.5A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" />
    </BaseIcon>
  );
}

function ArchiveIcon() {
  return (
    <BaseIcon>
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M9 10h6" />
      <path d="M10 14h4" />
    </BaseIcon>
  );
}

function CanvasIcon() {
  return (
    <BaseIcon>
      <rect x="3.5" y="4" width="6" height="5.5" rx="1.2" />
      <rect x="14.5" y="4" width="6" height="5.5" rx="1.2" />
      <rect x="9" y="14.5" width="6" height="5.5" rx="1.2" />
      <path d="M6.5 9.5v2a2 2 0 0 0 2 2H15.5a2 2 0 0 0 2-2v-2" />
      <path d="M12 13.5v1" />
    </BaseIcon>
  );
}

function GridIcon() {
  return (
    <BaseIcon>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </BaseIcon>
  );
}

function SceneIcon() {
  return (
    <BaseIcon>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="m6.5 15 3.5-3.5a1.8 1.8 0 0 1 2.5 0l2.5 2.5" />
      <path d="m13.5 12.5 1.5-1.5a1.8 1.8 0 0 1 2.5 0l1.5 1.5" />
      <circle cx="9" cy="9" r="1.3" />
    </BaseIcon>
  );
}

function StoryboardIcon() {
  return (
    <BaseIcon>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M12 4.5v15" />
      <path d="M3.5 12h17" />
    </BaseIcon>
  );
}
