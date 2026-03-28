"use client";

import { useState } from "react";

const topHighlights = [
  {
    title: "剧情故事短片",
    image: "https://picsum.photos/seed/story/800/400",
    gradient: "linear-gradient(135deg, #1a0a1e 0%, #2e1a3d 50%, #1a1a2e 100%)",
  },
  {
    title: "音乐概念短片",
    image: "https://picsum.photos/seed/music/800/400",
    gradient: "linear-gradient(135deg, #0a1a3d 0%, #1a2a5e 50%, #2e1a4d 100%)",
  },
];

const bottomHighlights = [
  {
    title: "漫画转视频",
    image: "https://picsum.photos/seed/comic/600/400",
    gradient: "linear-gradient(135deg, #1a2e1a 0%, #0a3d2e 100%)",
  },
  {
    title: "角色设定",
    image: "https://picsum.photos/seed/character/600/400",
    gradient: "linear-gradient(135deg, #2e1a2e 0%, #3d1a3d 100%)",
  },
  {
    title: "衍生品设计",
    image: "https://picsum.photos/seed/merch/600/400",
    gradient: "linear-gradient(135deg, #1a1a2e 0%, #2e2e4d 100%)",
  },
];

export default function HighlightsSection() {
  return (
    <section
      style={{
        width: "100%",
        maxWidth: 1400,
        margin: "48px auto 0",
        padding: "0 40px 60px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <span style={{ fontSize: 22, color: "var(--accent-green)" }}>✦</span>
        <h2 style={{ fontSize: 26, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>
          亮点
        </h2>
      </div>

      {/* Top row: 2 large cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 18 }}>
        {topHighlights.map((item, i) => (
          <HighlightCard key={i} item={item} height={340} titleSize={42} />
        ))}
      </div>

      {/* Bottom row: 3 equal cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
        {bottomHighlights.map((item, i) => (
          <HighlightCard key={i} item={item} height={240} titleSize={32} />
        ))}
      </div>
    </section>
  );
}

function HighlightCard({ item, height, titleSize }: { item: { title: string; image: string; gradient: string }; height: number; titleSize: number }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={() => {}}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 16,
        overflow: "hidden",
        cursor: "pointer",
        transition: "all 0.3s",
        position: "relative",
        transform: hovered ? "scale(1.01)" : "none",
      }}
    >
      <div
        style={{
          width: "100%",
          height,
          background: item.gradient,
          backgroundSize: "cover",
          backgroundPosition: "center",
          position: "relative",
        }}
      >
        <img
          src={item.image}
          alt={item.title}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            position: "absolute",
            inset: 0,
            opacity: 0.8,
          }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "80px 28px 24px",
          background: "linear-gradient(transparent, rgba(0,0,0,0.7))",
        }}
      >
        <h3 style={{ fontSize: titleSize, fontWeight: 700, color: "#fff" }}>
          {item.title}
        </h3>
      </div>
    </div>
  );
}
