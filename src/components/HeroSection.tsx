"use client";

import { useState } from "react";

export default function HeroSection() {
  const [prompt, setPrompt] = useState("");

  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        position: "relative",
        overflow: "hidden",
        paddingTop: 80,
      }}
    >
      {/* Subtle grid pattern background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
          pointerEvents: "none",
          maskImage: "radial-gradient(ellipse 50% 60% at 50% 40%, black 20%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse 50% 60% at 50% 40%, black 20%, transparent 70%)",
        }}
      />

      {/* Ambient glow */}
      <div
        style={{
          position: "absolute",
          top: "25%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 700,
          height: 500,
          background:
            "radial-gradient(ellipse, rgba(239,49,159,0.12) 0%, rgba(182,139,255,0.06) 40%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 16px",
          borderRadius: 20,
          backgroundColor: "#ffffff0d",
          border: "1px solid #ffffff14",
          fontSize: 13,
          color: "#fff8",
          fontWeight: 400,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: "#3c9",
            display: "inline-block",
          }}
        />
        AI 动画智能体团队
      </div>

      {/* Main Title - use the SVG title from original */}
      <div
        style={{
          marginTop: 32,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 0,
        }}
      >
        <h1
          style={{
            fontSize: 80,
            fontWeight: 800,
            lineHeight: 1.05,
            textAlign: "center",
          }}
        >
          <span
            className="gradient-text"
            style={{
              backgroundImage:
                "linear-gradient(120deg, #f8a0d3 13.14%, #9efae0 88.61%)",
            }}
          >
            想象力
          </span>
        </h1>
        <h1
          style={{
            fontSize: 80,
            fontWeight: 800,
            lineHeight: 1.05,
            textAlign: "center",
            color: "#ffffffcc",
          }}
        >
          即刻呈现
        </h1>
      </div>

      {/* Subtitle with shimmer */}
      <p
        className="gradient-text animate-shimmer"
        style={{
          backgroundImage:
            "linear-gradient(90deg, #4e4e4e, #eff0f0 50%, #4e4e4e)",
          fontWeight: 500,
          fontSize: 16,
          lineHeight: "24px",
          marginTop: 20,
          textAlign: "center",
        }}
      >
        用你的想象力，创造令人惊叹的 AI 动画
      </p>

      {/* Input Box */}
      <div
        style={{
          zIndex: 9,
          width: "100%",
          maxWidth: 680,
          marginTop: 40,
          padding: "0 20px",
        }}
      >
        <div
          style={{
            position: "relative",
            borderRadius: 20,
            border: "1px solid #ffffff14",
            backgroundColor: "#ffffff0a",
            backdropFilter: "blur(30px)",
            padding: "16px 20px",
            transition: "all 0.3s",
          }}
        >
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="描述你想要创作的动画..."
            style={{
              width: "100%",
              height: 48,
              backgroundColor: "transparent",
              border: "none",
              outline: "none",
              color: "#fffc",
              fontSize: 15,
              lineHeight: "24px",
              fontFamily: "inherit",
              resize: "none",
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 8,
            }}
          >
            <div style={{ display: "flex", gap: 8 }}>
              {/* Upload button */}
              <button
                className="btn"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  backgroundColor: "#ffffff14",
                  fontSize: 18,
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </button>
              {/* Style selector */}
              <button
                className="btn"
                style={{
                  height: 36,
                  padding: "0 14px",
                  borderRadius: 12,
                  backgroundColor: "#ffffff14",
                  fontSize: 13,
                  gap: 6,
                }}
              >
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    background:
                      "linear-gradient(135deg, #ff9ed6, #b68bff, #d5ffc2)",
                    display: "inline-block",
                  }}
                />
                风格
              </button>
            </div>
            <button
              className="btn btn-primary"
              style={{
                height: 38,
                padding: "0 20px",
                borderRadius: 14,
                fontSize: 14,
                fontWeight: 600,
                gap: 6,
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
              </svg>
              开始创作
            </button>
          </div>
        </div>
      </div>

      {/* Quick prompts */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 16,
          flexWrap: "wrap",
          justifyContent: "center",
          maxWidth: 680,
          padding: "0 20px",
        }}
      >
        {[
          "一只猫咪探索魔法森林",
          "赛博朋克夜晚都市",
          "海底冒险奇遇",
          "前往火星的太空之旅",
        ].map((text) => (
          <button
            key={text}
            onClick={() => setPrompt(text)}
            className="btn"
            style={{
              padding: "5px 12px",
              borderRadius: 12,
              backgroundColor: "#ffffff0a",
              border: "1px solid #ffffff14",
              fontSize: 12,
              color: "#fff6",
              cursor: "pointer",
              transition: "all 0.3s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#ffffff33";
              e.currentTarget.style.color = "#fffc";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#ffffff14";
              e.currentTarget.style.color = "#fff6";
            }}
          >
            {text}
          </button>
        ))}
      </div>
    </section>
  );
}
