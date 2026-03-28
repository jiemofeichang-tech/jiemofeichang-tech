"use client";

import { useState } from "react";

const agents = [
  {
    name: "艺术总监",
    nameEn: "Art Director",
    desc: "统筹整个项目的艺术风格与视觉呈现，确保艺术品质",
    color: "#ef319f",
    bgColor: "rgba(239,49,159,0.08)",
    icon: "🎨",
  },
  {
    name: "编剧",
    nameEn: "Scriptwriter",
    desc: "创作引人入胜的剧本故事，构建完整的叙事框架",
    color: "#b68bff",
    bgColor: "rgba(182,139,255,0.08)",
    icon: "✍️",
  },
  {
    name: "角色设计师",
    nameEn: "Character Designer",
    desc: "设计独特的角色形象，赋予每个角色鲜明的个性特征",
    color: "#3c9",
    bgColor: "rgba(51,204,153,0.08)",
    icon: "👤",
  },
  {
    name: "IP 设计师",
    nameEn: "IP Designer",
    desc: "把控原创作品的创意愿景与质量，为你的创作保驾护航",
    color: "#ff7575",
    bgColor: "rgba(255,117,117,0.08)",
    icon: "💡",
  },
  {
    name: "场景设计师",
    nameEn: "Scene Designer",
    desc: "创建丰富多样的场景环境，构建沉浸式的世界观",
    color: "#09f",
    bgColor: "rgba(0,153,255,0.08)",
    icon: "🏔️",
  },
  {
    name: "分镜师",
    nameEn: "Storyboard Artist",
    desc: "精心编排视频素材，营造流畅的视觉叙事节奏",
    color: "#9efae0",
    bgColor: "rgba(158,250,224,0.06)",
    icon: "🎞️",
  },
  {
    name: "音效总监",
    nameEn: "Sound Director",
    desc: "负责音乐创作与声音设计，打造完美的听觉体验",
    color: "#fd69cf",
    bgColor: "rgba(253,105,207,0.08)",
    icon: "🎵",
  },
];

export default function AgentSection() {
  const [hoveredAgent, setHoveredAgent] = useState<number | null>(null);

  return (
    <section
      className="section-full"
      style={{
        padding: "100px 0",
        position: "relative",
      }}
    >
      {/* Ambient background */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 800,
          height: 800,
          background:
            "radial-gradient(ellipse, rgba(182,139,255,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <h2 className="section-title">
        你的 AI{" "}
        <span
          className="gradient-text"
          style={{
            backgroundImage:
              "linear-gradient(120deg, #f8a0d3 13.14%, #9efae0 88.61%)",
          }}
        >
          动画团队
        </span>
      </h2>
      <p className="section-subtitle">
        7 位专业 AI 智能体协作，将你的创意变为现实
      </p>

      {/* Agent Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 14,
          marginTop: 56,
          maxWidth: 960,
          width: "100%",
          padding: "0 40px",
        }}
      >
        {agents.map((agent, i) => (
          <div
            key={agent.name}
            onMouseEnter={() => setHoveredAgent(i)}
            onMouseLeave={() => setHoveredAgent(null)}
            style={{
              padding: 22,
              borderRadius: 20,
              border: `1px solid ${hoveredAgent === i ? agent.color + "44" : "#ffffff0d"}`,
              backgroundColor:
                hoveredAgent === i ? agent.bgColor : "transparent",
              cursor: "pointer",
              transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
              transform:
                hoveredAgent === i ? "translateY(-4px)" : "translateY(0)",
              ...(i === 6 ? { gridColumn: "2 / 4" } : {}),
            }}
          >
            {/* Agent Icon */}
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                backgroundColor: `${agent.color}18`,
                border: `1px solid ${agent.color}22`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                marginBottom: 14,
                transition: "all 0.4s",
                boxShadow:
                  hoveredAgent === i ? `0 0 20px ${agent.color}22` : "none",
              }}
            >
              {agent.icon}
            </div>

            {/* Agent Name */}
            <h3
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "#fffc",
                marginBottom: 4,
              }}
            >
              {agent.name}
            </h3>
            <p
              style={{
                fontSize: 11,
                color: "#fff4",
                marginBottom: 8,
                fontWeight: 500,
              }}
            >
              {agent.nameEn}
            </p>

            {/* Agent Description */}
            <p
              style={{
                fontSize: 12,
                color: "#fff6",
                lineHeight: 1.6,
              }}
            >
              {agent.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
