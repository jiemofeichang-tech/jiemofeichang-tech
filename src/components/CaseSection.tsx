"use client";

const cases = [
  {
    title: "最后的樱花",
    author: "画师X",
    style: "动漫",
    gradient: "linear-gradient(135deg, #2e1a3d, #3d1259)",
    views: "12.5K",
  },
  {
    title: "霓虹之梦",
    author: "赛博创作者",
    style: "赛博朋克",
    gradient: "linear-gradient(135deg, #0a1a3d, #1a2a5e)",
    views: "8.3K",
  },
  {
    title: "海洋低语",
    author: "浪花艺术",
    style: "水彩",
    gradient: "linear-gradient(135deg, #1a2e3d, #0a3d4e)",
    views: "15.1K",
  },
  {
    title: "龙的旅程",
    author: "神话匠人",
    style: "水墨画",
    gradient: "linear-gradient(135deg, #1a1a1a, #2e2e2e)",
    views: "21.7K",
  },
  {
    title: "星光小夜曲",
    author: "宇宙AI",
    style: "奇幻",
    gradient: "linear-gradient(135deg, #2e1a3d, #1a0a2e)",
    views: "9.8K",
  },
  {
    title: "都市传说",
    author: "街头视觉",
    style: "涂鸦",
    gradient: "linear-gradient(135deg, #2e2e1a, #3d2e0a)",
    views: "6.4K",
  },
];

export default function CaseSection() {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "100px 0",
      }}
    >
      <h2 className="section-title">
        社区{" "}
        <span
          className="gradient-text"
          style={{
            backgroundImage:
              "linear-gradient(120deg, #f8a0d3 13.14%, #9efae0 88.61%)",
          }}
        >
          精选作品
        </span>
      </h2>
      <p className="section-subtitle">
        发现社区创作者制作的精彩动画作品
      </p>

      {/* Case Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
          marginTop: 48,
          maxWidth: 1000,
          width: "100%",
          padding: "0 40px",
        }}
      >
        {cases.map((c) => (
          <div
            key={c.title}
            style={{
              borderRadius: 20,
              overflow: "hidden",
              border: "1px solid #ffffff0d",
              cursor: "pointer",
              transition: "all 0.4s",
              backgroundColor: "#ffffff06",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#ffffff1a";
              e.currentTarget.style.transform = "translateY(-4px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#ffffff0d";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            {/* Thumbnail */}
            <div
              style={{
                width: "100%",
                height: 200,
                background: c.gradient,
                position: "relative",
              }}
            >
              {/* Play button */}
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  backgroundColor: "#00000044",
                  backdropFilter: "blur(10px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: 0,
                  transition: "opacity 0.3s",
                }}
                className="play-btn"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="white"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>

            {/* Info */}
            <div style={{ padding: "14px 16px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <h3
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#fffc",
                  }}
                >
                  {c.title}
                </h3>
                <span
                  style={{
                    fontSize: 11,
                    color: "#fff6",
                    padding: "2px 8px",
                    borderRadius: 6,
                    backgroundColor: "#ffffff0d",
                  }}
                >
                  {c.style}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 8,
                }}
              >
                <span style={{ fontSize: 11, color: "#fff4" }}>
                  {c.author}
                </span>
                <span style={{ fontSize: 11, color: "#fff4" }}>
                  👁 {c.views}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* View more */}
      <button
        className="btn btn-glass"
        style={{
          marginTop: 36,
          padding: "10px 24px",
          borderRadius: 16,
          fontSize: 13,
          fontWeight: 500,
          border: "1px solid #ffffff14",
        }}
      >
        查看更多 →
      </button>
    </section>
  );
}
