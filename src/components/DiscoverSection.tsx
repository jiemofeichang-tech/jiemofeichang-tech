"use client";

import { useState } from "react";

const galleryItems = [
  { id: 1, author: "zk_vin", tags: ["role", "story", "script"], h: 280, gradient: "linear-gradient(135deg, #1a0a2e, #3d1a59)" },
  { id: 2, author: "二两肉", tags: ["role", "story", "script"], h: 340, gradient: "linear-gradient(135deg, #0a1a2e, #1a3d5e)" },
  { id: 3, author: "梦罗浮", tags: ["role", "story", "script"], h: 260, gradient: "linear-gradient(180deg, #2e1a0a, #5e3d1a)" },
  { id: 4, author: "DUODUODUO", tags: ["role"], h: 300, gradient: "linear-gradient(135deg, #0a2e1a, #1a5e3d)" },
  { id: 5, author: "cscsl", tags: ["role", "story", "script"], h: 320, gradient: "linear-gradient(180deg, #1a1a2e, #2e2e5e)" },
  { id: 6, author: "刀哥聊AI", tags: ["role", "story", "script"], h: 280, gradient: "linear-gradient(135deg, #2e0a1a, #5e1a3d)" },
  { id: 7, author: "erinner", tags: ["role"], h: 350, gradient: "linear-gradient(180deg, #0a2e2e, #1a5e5e)" },
  { id: 8, author: "lopopo", tags: ["role", "story", "scene"], h: 290, gradient: "linear-gradient(135deg, #2e2e0a, #5e5e1a)" },
  { id: 9, author: "海螺天使", tags: ["role", "story", "script"], h: 310, gradient: "linear-gradient(180deg, #1a0a2e, #3d1a5e)" },
  { id: 10, author: "逆光文化", tags: ["role", "story", "script"], h: 270, gradient: "linear-gradient(135deg, #0a1a1a, #1a3d3d)" },
  { id: 11, author: "犀牛船长", tags: ["role", "story", "scene"], h: 340, gradient: "linear-gradient(180deg, #2e1a1a, #5e3d3d)" },
  { id: 12, author: "幻月式", tags: ["role"], h: 260, gradient: "linear-gradient(135deg, #1a2e0a, #3d5e1a)" },
  { id: 13, author: "gagabb", tags: ["role", "story", "script"], h: 300, gradient: "linear-gradient(180deg, #0a0a2e, #1a1a5e)" },
  { id: 14, author: "月夜二十四桥", tags: ["role", "story", "script"], h: 280, gradient: "linear-gradient(135deg, #2e0a2e, #5e1a5e)" },
  { id: 15, author: "赛博浮云", tags: ["role"], h: 330, gradient: "linear-gradient(180deg, #1a2e1a, #3d5e3d)" },
  { id: 16, author: "飞飞飞", tags: ["role", "story", "script"], h: 290, gradient: "linear-gradient(135deg, #2e2e1a, #5e5e3d)" },
];

export default function DiscoverSection() {
  return (
    <section
      style={{
        width: "100%",
        maxWidth: 1400,
        margin: "64px auto 0",
        padding: "0 40px 80px",
      }}
    >
      <h2 style={{
        fontSize: 48,
        fontWeight: 700,
        color: "var(--text-primary)",
        textAlign: "center",
        marginBottom: 40,
      }}>
        发现更多
      </h2>

      <div className="masonry-grid">
        {galleryItems.map((item) => (
          <GalleryCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

function GalleryCard({ item }: { item: typeof galleryItems[number] }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 12,
        overflow: "hidden",
        cursor: "pointer",
        position: "relative",
        transition: "transform 0.3s",
        transform: hovered ? "translateY(-2px)" : "none",
      }}
    >
      <div
        style={{
          width: "100%",
          height: item.h,
          background: item.gradient,
          position: "relative",
        }}
      >
        {/* Play button - always visible */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: hovered ? "rgba(0,0,0,0.3)" : "transparent",
            transition: "all 0.3s",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              backgroundColor: "rgba(255,255,255,0.9)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: hovered ? 1 : 0.7,
              transition: "all 0.3s",
              transform: hovered ? "scale(1.1)" : "none",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#0a0a0b">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </div>

        {/* Bottom overlay */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "30px 12px 10px",
            background: "linear-gradient(transparent, rgba(0,0,0,0.7))",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: "#fff" }}>{item.author}</div>
              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                {item.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      padding: "1px 6px",
                      borderRadius: 4,
                      backgroundColor: "rgba(255,255,255,0.15)",
                      fontSize: 10,
                      color: "rgba(255,255,255,0.7)",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* View creation button */}
        {hovered && (
          <button
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              padding: "4px 10px",
              borderRadius: 6,
              backgroundColor: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(8px)",
              fontSize: 11,
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.2)",
            }}
          >
            查看创作过程
          </button>
        )}
      </div>
    </div>
  );
}
