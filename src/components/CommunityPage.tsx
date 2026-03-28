"use client";

import { useState } from "react";

const communityWorks = [
  { title: "水墨风武侠动画", author: "画师小明", likes: "2.3K", gradient: "linear-gradient(135deg, #1a1a2e, #2e2e3d)" },
  { title: "赛博朋克城市短片", author: "未来视觉", likes: "1.8K", gradient: "linear-gradient(135deg, #0a1a3d, #1a2a5e)" },
  { title: "奇幻森林冒险", author: "梦境工坊", likes: "3.1K", gradient: "linear-gradient(135deg, #0a2e1a, #1a3d2e)" },
  { title: "机甲战士", author: "科幻达人", likes: "890", gradient: "linear-gradient(135deg, #2e1a3d, #3d1259)" },
  { title: "古风仙侠MV", author: "琴音画境", likes: "4.2K", gradient: "linear-gradient(135deg, #3d2e1a, #2e1a0a)" },
  { title: "末日废土探险", author: "荒野旅人", likes: "1.5K", gradient: "linear-gradient(135deg, #1a2e1a, #2e3d2e)" },
];

export default function CommunityPage() {
  return (
    <div style={{ padding: "32px 40px", maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
        社区作品
      </h1>
      <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 24 }}>
        发现其他创作者的精彩动画作品
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 20,
        }}
      >
        {communityWorks.map((work, i) => (
          <CommunityCard key={i} work={work} />
        ))}
      </div>
    </div>
  );
}

function CommunityCard({ work }: { work: typeof communityWorks[number] }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => alert(`查看作品: ${work.title}`)}
      style={{
        borderRadius: 12,
        overflow: "hidden",
        border: `1px solid ${hovered ? "var(--border-light)" : "var(--border)"}`,
        cursor: "pointer",
        transition: "all 0.3s",
        transform: hovered ? "translateY(-3px)" : "none",
      }}
    >
      <div
        style={{
          height: 180,
          background: work.gradient,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            backgroundColor: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: hovered ? 1 : 0.5,
            transition: "opacity 0.3s",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </div>
      </div>

      <div style={{ padding: "12px 14px" }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
          {work.title}
        </h3>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{work.author}</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>❤ {work.likes}</span>
        </div>
      </div>
    </div>
  );
}
