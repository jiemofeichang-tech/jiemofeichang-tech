"use client";

import { useState } from "react";

const CDN = "https://static-hoe.hogi.ai";

const galleryItems = [
  { id: 92, author: "zk_vin", tags: ["角色", "故事", "脚本"], h: 280 },
  { id: 93, author: "二两肉", tags: ["角色", "故事", "脚本"], h: 340 },
  { id: 94, author: "梦罗海", tags: ["角色", "故事", "脚本"], h: 260 },
  { id: 95, author: "DUODUODUO", tags: ["角色"], h: 300 },
  { id: 96, author: "cscsl", tags: ["角色", "故事", "脚本"], h: 320 },
  { id: 97, author: "刀哥聊AI", tags: ["角色", "故事", "脚本"], h: 280 },
  { id: 98, author: "erinner", tags: ["角色"], h: 350 },
  { id: 99, author: "lopopo", tags: ["角色", "故事", "场景"], h: 290 },
  { id: 100, author: "海螺天使", tags: ["角色", "故事", "脚本"], h: 310 },
  { id: 101, author: "逆光文化", tags: ["角色", "故事", "脚本"], h: 400 },
  { id: 102, author: "金牛船长", tags: ["角色", "故事", "场景"], h: 270 },
  { id: 103, author: "幻月光", tags: ["角色"], h: 340 },
] as const;

function getCoverUrl(id: number) {
  return `${CDN}/home_recommends/case-${id}.webp`;
}

function getVideoUrl(id: number) {
  return `${CDN}/home_recommends/case-${id}.mp4`;
}

export default function DiscoverSection() {
  return (
    <section className="home-content-section" data-home-section="discover">
      <div style={{ marginBottom: 28, textAlign: "center" }}>
        <div className="section-eyebrow">发现更多</div>
        <h2 style={{ marginTop: 14, fontSize: 42, fontWeight: 700, color: "var(--text-primary)" }}>发现</h2>
      </div>

      <div className="masonry-grid">
        {galleryItems.map((item) => (
          <GalleryCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

/* 渐变色调色板，图片加载失败时作为 fallback */
const fallbackGradients = [
  "linear-gradient(135deg, #2a1a0a, #3d2a1a)",
  "linear-gradient(135deg, #1a1208, #2e2010)",
  "linear-gradient(135deg, #2a1f0a, #3d2e15)",
  "linear-gradient(135deg, #1a2a1a, #2a3d2a)",
  "linear-gradient(135deg, #1a1a2a, #2a2a3d)",
  "linear-gradient(135deg, #2a1a2a, #3d2a3d)",
];

function GalleryCard({ item }: { item: typeof galleryItems[number] }) {
  const [hovered, setHovered] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const coverUrl = getCoverUrl(item.id);
  const videoUrl = getVideoUrl(item.id);
  const fallbackBg = fallbackGradients[item.id % fallbackGradients.length];

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 12,
        overflow: "hidden",
        cursor: "pointer",
        position: "relative",
        transition: "transform 0.3s ease, box-shadow 0.3s ease",
        transform: hovered ? "translateY(-3px)" : "none",
        boxShadow: hovered ? "0 8px 24px rgba(0,0,0,0.25)" : "none",
      }}
    >
      <div
        style={{
          width: "100%",
          height: item.h,
          position: "relative",
          background: imgError ? fallbackBg : "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
        }}
      >
        {/* Skeleton shimmer while loading */}
        {!imgLoaded && !imgError && (
          <div className="skeleton" style={{ position: "absolute", inset: 0, borderRadius: 0 }} />
        )}

        {!imgError && (
          <img
            src={coverUrl}
            alt={`${item.author} 的作品`}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              opacity: imgLoaded ? 1 : 0,
              transition: "opacity 0.4s ease",
            }}
          />
        )}

        <div
          style={{
            position: "absolute",
            inset: 0,
            background: hovered ? "rgba(4, 12, 24, 0.16)" : "rgba(4, 12, 24, 0.04)",
            transition: "background 0.3s ease",
          }}
        />

        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 50,
              height: 50,
              borderRadius: "50%",
              backgroundColor: "var(--bg-card)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: hovered ? 1 : 0.76,
              transition: "all 0.3s",
              transform: hovered ? "scale(1.08)" : "none",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#07111f">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "42px 14px 14px",
            background: "linear-gradient(180deg, transparent, rgba(4, 12, 24, 0.74))",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{item.author}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            {item.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  padding: "2px 8px",
                  borderRadius: 2,
                  backgroundColor: "var(--bg-hover)",
                  fontSize: 11,
                  color: "var(--text-secondary)",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {hovered && (
          <button
            type="button"
            onClick={() => window.open(videoUrl, "_blank")}
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              padding: "6px 12px",
              borderRadius: 999,
              backgroundColor: "rgba(4, 12, 24, 0.58)",
              backdropFilter: "blur(8px)",
              fontSize: 11,
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.18)",
            }}
          >
            查看作品
          </button>
        )}
      </div>
    </div>
  );
}
