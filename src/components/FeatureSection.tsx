"use client";

import { useState } from "react";

const features = [
  {
    id: "story_video",
    title: "故事视频",
    desc: "创作叙事驱动的动画短片，AI 智能体团队协作完成从剧本到成片",
    gradient: "linear-gradient(145deg, #1a0a2e, #3d1259 45%, #0a0a0b)",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fffc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
        <line x1="7" y1="2" x2="7" y2="22" />
        <line x1="17" y1="2" x2="17" y2="22" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="2" y1="7" x2="7" y2="7" />
        <line x1="2" y1="17" x2="7" y2="17" />
        <line x1="17" y1="7" x2="22" y2="7" />
        <line x1="17" y1="17" x2="22" y2="17" />
      </svg>
    ),
  },
  {
    id: "music_video",
    title: "音乐视频",
    desc: "生成令人惊叹的音乐动画视频，完美匹配节奏和旋律",
    gradient: "linear-gradient(145deg, #2e0a1a, #592d3d 45%, #0a0a0b)",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fffc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    ),
  },
  {
    id: "manga",
    title: "漫画生成",
    desc: "通过文字描述自动生成多格漫画，风格自由选择",
    gradient: "linear-gradient(145deg, #0a1a2e, #1a3d59 45%, #0a0a0b)",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fffc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="12" y1="3" x2="12" y2="12" />
      </svg>
    ),
  },
  {
    id: "character",
    title: "角色设计",
    desc: "用 AI 设计独特的角色形象，支持多角度一致性生成",
    gradient: "linear-gradient(145deg, #0a2e1a, #1a5939 45%, #0a0a0b)",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fffc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    id: "scene",
    title: "场景创作",
    desc: "生成精美的场景背景，从自然风光到科幻世界",
    gradient: "linear-gradient(145deg, #1a1a2e, #393d59 45%, #0a0a0b)",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fffc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    ),
  },
  {
    id: "ip_creation",
    title: "IP 创作",
    desc: "打造你的专属 IP 角色，在多个场景中保持一致性",
    gradient: "linear-gradient(145deg, #2e1a2e, #59393d 45%, #0a0a0b)",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fffc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  },
];

export default function FeatureSection() {
  const [activeFeature, setActiveFeature] = useState(0);

  return (
    <section className="section-full" style={{ padding: "100px 0" }}>
      <h2 className="section-title">
        <span
          className="gradient-text"
          style={{
            backgroundImage:
              "linear-gradient(120deg, #f8a0d3 13.14%, #9efae0 88.61%)",
          }}
        >
          万物皆可创
        </span>
      </h2>
      <p className="section-subtitle">
        从概念到动画，只需几分钟，而非数月
      </p>

      {/* Feature showcase */}
      <div
        style={{
          marginTop: 50,
          display: "flex",
          gap: 20,
          maxWidth: 1100,
          width: "100%",
          padding: "0 40px",
        }}
      >
        {/* Left - Large preview */}
        <div
          style={{
            flex: 1,
            height: 480,
            borderRadius: 24,
            overflow: "hidden",
            border: "1px solid #ffffff14",
            position: "relative",
            background: features[activeFeature].gradient,
            transition: "background 0.5s",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* Play button */}
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                backgroundColor: "#00000044",
                backdropFilter: "blur(10px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "all 0.3s",
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
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
              padding: "60px 32px 28px",
              background: "linear-gradient(transparent, rgba(0,0,0,0.8))",
            }}
          >
            <h3 style={{ fontSize: 24, fontWeight: 700, color: "#fffc" }}>
              {features[activeFeature].title}
            </h3>
            <p style={{ fontSize: 14, color: "#fff9", marginTop: 6 }}>
              {features[activeFeature].desc}
            </p>
          </div>
        </div>

        {/* Right - Feature list */}
        <div
          style={{
            width: 280,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {features.map((f, i) => (
            <button
              key={f.id}
              onClick={() => setActiveFeature(i)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 16px",
                borderRadius: 16,
                border: activeFeature === i ? "1px solid #ffffff20" : "1px solid transparent",
                backgroundColor: activeFeature === i ? "#ffffff0d" : "transparent",
                cursor: "pointer",
                transition: "all 0.3s",
                fontFamily: "inherit",
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: "#ffffff14",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {f.icon}
              </div>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: activeFeature === i ? 600 : 400,
                  color: activeFeature === i ? "#fffc" : "#fff6",
                  textAlign: "left",
                }}
              >
                {f.title}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
