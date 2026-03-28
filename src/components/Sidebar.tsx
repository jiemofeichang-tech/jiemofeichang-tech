"use client";

import { useRouter } from "next/navigation";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const sidebarItems = [
  { id: "home", label: "首页" },
  { id: "projects", label: "我的项目" },
  { id: "community", label: "我的资产" },
];

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>
  );
}

function FilmIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
      <line x1="7" y1="2" x2="7" y2="22"/>
      <line x1="17" y1="2" x2="17" y2="22"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <line x1="2" y1="7" x2="7" y2="7"/>
      <line x1="2" y1="17" x2="7" y2="17"/>
      <line x1="17" y1="7" x2="22" y2="7"/>
      <line x1="17" y1="17" x2="22" y2="17"/>
    </svg>
  );
}

const iconMap: Record<string, (active: boolean) => React.ReactNode> = {
  home: (active) => <HomeIcon active={active} />,
  projects: () => <FolderIcon />,
  community: () => <GlobeIcon />,
  trash: () => <TrashIcon />,
};

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const router = useRouter();

  return (
    <aside
      style={{
        position: "fixed",
        left: 20,
        top: "50%",
        transform: "translateY(-50%)",
        width: 50,
        backgroundColor: "rgba(255, 255, 255, 0.1)",
        borderRadius: 20,
        padding: 5,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        zIndex: 90,
      }}
    >
      {sidebarItems.map((item) => {
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            title={item.label}
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: isActive ? "#fff" : "rgba(255,255,255,0.5)",
              backgroundColor: isActive ? "rgba(255,255,255,0.1)" : "transparent",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.color = "rgba(255,255,255,0.8)";
                e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.color = "rgba(255,255,255,0.5)";
                e.currentTarget.style.backgroundColor = "transparent";
              }
            }}
          >
            {iconMap[item.id](isActive)}
          </button>
        );
      })}

      <div style={{ height: 1, width: 30, backgroundColor: "rgba(255,255,255,0.1)", margin: "4px 0" }} />

      {/* Workflow entry */}
      <button
        onClick={() => router.push("/workflow/new")}
        title="AI漫剧工作流"
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(192,132,252,0.8)",
          backgroundColor: "rgba(124,58,237,0.1)",
          transition: "all 0.2s",
          border: "1px solid rgba(124,58,237,0.3)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "rgba(124,58,237,0.2)";
          e.currentTarget.style.color = "#c084fc";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "rgba(124,58,237,0.1)";
          e.currentTarget.style.color = "rgba(192,132,252,0.8)";
        }}
      >
        <FilmIcon />
      </button>

      <div style={{ height: 1, width: 30, backgroundColor: "rgba(255,255,255,0.1)", margin: "4px 0" }} />

      <button
        onClick={() => onTabChange("trash")}
        title="回收站"
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: activeTab === "trash" ? "#fff" : "rgba(255,255,255,0.5)",
          backgroundColor: activeTab === "trash" ? "rgba(255,255,255,0.1)" : "transparent",
          transition: "all 0.2s",
        }}
        onMouseEnter={(e) => {
          if (activeTab !== "trash") {
            e.currentTarget.style.color = "rgba(255,255,255,0.8)";
            e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)";
          }
        }}
        onMouseLeave={(e) => {
          if (activeTab !== "trash") {
            e.currentTarget.style.color = "rgba(255,255,255,0.5)";
            e.currentTarget.style.backgroundColor = "transparent";
          }
        }}
      >
        <TrashIcon />
      </button>
    </aside>
  );
}
