"use client";

import { useState } from "react";

const topHighlights = [
  {
    title: "剧情故事短片",
    description: "用更强的叙事节奏和镜头推进，把一句灵感直接转成可执行的短片结构。",
    gradient: "linear-gradient(135deg, #2a1a0a 0%, #3d2a1a 50%, #1a1512 100%)",
    icon: (
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="rgba(255,180,84,0.35)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
        <line x1="7" y1="2" x2="7" y2="22" />
        <line x1="17" y1="2" x2="17" y2="22" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="2" y1="7" x2="7" y2="7" />
        <line x1="2" y1="17" x2="7" y2="17" />
        <line x1="17" y1="17" x2="22" y2="17" />
        <line x1="17" y1="7" x2="22" y2="7" />
      </svg>
    ),
    storyType: "drama",
  },
  {
    title: "音乐概念短片",
    description: "更适合情绪表达、节奏切换和强视觉统一的高氛围案例。",
    gradient: "linear-gradient(135deg, #1a1208 0%, #2e2010 50%, #211c17 100%)",
    icon: (
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="rgba(255,180,84,0.35)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    ),
    storyType: "music_video",
  },
] as const;

const bottomHighlights = [
  {
    title: "漫画转视频",
    description: "保持角色设定与镜头语言统一。",
    gradient: "linear-gradient(135deg, #2a1f0a 0%, #3d2e15 100%)",
    icon: (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,180,84,0.35)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    storyType: "comic_adapt",
  },
  {
    title: "角色设计",
    description: "从设定词、参考图到人物风格保持连续。",
    gradient: "linear-gradient(135deg, #2e1a0a 0%, #3d2a15 100%)",
    icon: (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,180,84,0.35)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
    storyType: "free_gen",
  },
  {
    title: "衍生品概念",
    description: "让世界观和周边延展在同一气质里。",
    gradient: "linear-gradient(135deg, #1a1510 0%, #2e2518 100%)",
    icon: (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,180,84,0.35)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
    storyType: "merch",
  },
] as const;

export default function HighlightsSection() {
  return (
    <section className="home-content-section" data-home-section="highlights">
      <div style={{ marginBottom: 26 }}>
        <div className="section-eyebrow">精选方向</div>
        <h2 style={{ marginTop: 12, fontSize: 30, fontWeight: 700, color: "var(--text-primary)" }}>精选案例</h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18, marginBottom: 18 }}>
        {topHighlights.map((item) => (
          <HighlightCard key={item.title} item={item} height={360} titleSize={40} />
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18 }}>
        {bottomHighlights.map((item) => (
          <HighlightCard key={item.title} item={item} height={250} titleSize={28} />
        ))}
      </div>
    </section>
  );
}

function HighlightCard({
  item,
  height,
  titleSize,
}: {
  item: { title: string; description: string; gradient: string; icon: React.ReactNode; storyType: string };
  height: number;
  titleSize: number;
}) {
  const [hovered, setHovered] = useState(false);

  const handleClick = () => {
    const input = document.querySelector("[data-home-section='hero'] textarea, [data-main-input]") as HTMLElement | null;
    if (input) {
      input.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => input.focus(), 400);
    }
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
      style={{
        borderRadius: 16,
        overflow: "hidden",
        cursor: "pointer",
        transition: "transform 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease",
        position: "relative",
        transform: hovered ? "translateY(-4px) scale(1.01)" : "none",
        border: hovered ? "1px solid rgba(255, 180, 84, 0.3)" : "1px solid var(--border)",
        boxShadow: hovered ? "0 12px 32px rgba(0, 0, 0, 0.3)" : "none",
      }}
    >
      <div style={{ width: "100%", height, position: "relative", background: item.gradient }}>
        {/* Decorative icon */}
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -60%)", opacity: hovered ? 0.7 : 0.4, transition: "opacity 0.3s" }}>
          {item.icon}
        </div>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 30%, rgba(2,8,23,0.7) 100%)" }} />
      </div>

      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 28 }}>
        <h3 style={{ fontSize: titleSize, fontWeight: 700, color: "#fff", lineHeight: 1.06, maxWidth: "10em" }}>
          {item.title}
        </h3>
        <p style={{ marginTop: 10, fontSize: 14, color: "rgba(255,255,255,0.82)", lineHeight: 1.75, maxWidth: 420 }}>
          {item.description}
        </p>
      </div>
    </div>
  );
}
