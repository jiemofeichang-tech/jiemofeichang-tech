"use client";

const showcaseItems = [
  {
    title: "音乐视频",
    style: "动漫 AMV",
    gradient: "linear-gradient(180deg, #2a1a3d 0%, #1a0a2e 100%)",
  },
  {
    title: "故事短片",
    style: "赛博朋克",
    gradient: "linear-gradient(180deg, #0a1a3d 0%, #1a2a4e 100%)",
  },
  {
    title: "角色动画",
    style: "奇幻风格",
    gradient: "linear-gradient(180deg, #3d1a2a 0%, #2e0a1a 100%)",
  },
];

export default function VibeSection() {
  return (
    <section
      className="section-full"
      style={{ padding: "100px 0" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 60,
          maxWidth: 1100,
          width: "100%",
          padding: "0 40px",
        }}
      >
        {/* Left text */}
        <div style={{ maxWidth: 380 }}>
          <h2
            style={{
              fontSize: 44,
              fontWeight: 700,
              color: "#fffc",
              lineHeight: 1.2,
            }}
          >
            感受{" "}
            <span
              className="gradient-text"
              style={{
                backgroundImage:
                  "linear-gradient(120deg, #f8a0d3 13.14%, #9efae0 88.61%)",
              }}
            >
              创作灵感
            </span>
          </h2>
          <p
            style={{
              fontSize: 15,
              color: "#fff6",
              lineHeight: 1.7,
              marginTop: 20,
            }}
          >
            用你独特的艺术视角创作音乐视频、故事短片和角色动画。
            每一件作品都独一无二。
          </p>
          <button
            className="btn btn-primary"
            style={{
              marginTop: 28,
              padding: "0 22px",
              borderRadius: 14,
              height: 42,
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            探索作品库 →
          </button>
        </div>

        {/* Right - Phone-like previews */}
        <div
          style={{
            display: "flex",
            gap: 14,
            alignItems: "center",
          }}
        >
          {showcaseItems.map((item, i) => (
            <div
              key={item.title}
              style={{
                width: i === 1 ? 220 : 180,
                height: i === 1 ? 380 : 320,
                borderRadius: 24,
                border: i === 1 ? "2px solid var(--primary)" : "1px solid #ffffff14",
                background: item.gradient,
                position: "relative",
                overflow: "hidden",
                cursor: "pointer",
                transition: "all 0.4s",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                padding: 20,
              }}
              onMouseEnter={(e) => {
                if (i !== 1) {
                  e.currentTarget.style.transform = "scale(1.03)";
                  e.currentTarget.style.borderColor = "#ffffff33";
                }
              }}
              onMouseLeave={(e) => {
                if (i !== 1) {
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.borderColor = "#ffffff14";
                }
              }}
            >
              {/* Play icon */}
              <div
                style={{
                  position: "absolute",
                  top: "40%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  backgroundColor: "#00000044",
                  backdropFilter: "blur(8px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <div style={{ position: "relative", zIndex: 1 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    color: "#ffffff88",
                    marginBottom: 3,
                  }}
                >
                  {item.style}
                </div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: "#fffc",
                  }}
                >
                  {item.title}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
