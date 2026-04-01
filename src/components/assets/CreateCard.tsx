"use client";

import { useRouter } from "next/navigation";

export default function CreateCard() {
  const router = useRouter();

  return (
    <button
      onClick={() => {
        // TODO: 跳转到工作流创建页面，预设到角色设计阶段
        router.push("/");
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        minHeight: 280,
        borderRadius: 12,
        border: "2px dashed rgba(191,255,0,0.4)",
        backgroundColor: "transparent",
        cursor: "pointer",
        transition: "all 0.2s",
        color: "rgba(191,255,0,0.7)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "rgba(191,255,0,0.05)";
        e.currentTarget.style.borderColor = "rgba(191,255,0,0.6)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
        e.currentTarget.style.borderColor = "rgba(191,255,0,0.4)";
      }}
    >
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
      <span style={{ fontSize: 14, fontWeight: 500 }}>创建新角色</span>
    </button>
  );
}
