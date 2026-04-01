"use client";

const styles = [
  { name: "水墨画", color: "#aaa" },
  { name: "水彩", color: "#7eb8da" },
  { name: "赛博朋克", color: "#ff00ff" },
  { name: "动漫", color: "#ff7575" },
  { name: "3D 渲染", color: "#6b64f8" },
  { name: "油画", color: "#c8956e" },
  { name: "像素风", color: "#5da" },
  { name: "写实", color: "#FFA500" },
];

export default function LensSection() {
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
          gap: 50,
          maxWidth: 1000,
          width: "100%",
          padding: "0 40px",
        }}
      >
        {/* Left - Lens Visual */}
        <div
          style={{
            width: 400,
            height: 400,
            borderRadius: "50%",
            border: "1px solid #ffffff14",
            position: "relative",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Inner circles */}
          <div
            style={{
              width: 340,
              height: 340,
              borderRadius: "50%",
              border: "1px solid #ffffff0d",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 200,
                height: 200,
                borderRadius: "50%",
                border: "1px solid #ffffff0d",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: "50%",
                  background:
                    "radial-gradient(circle, rgba(255,140,0,0.4) 0%, transparent 70%)",
                }}
              />
            </div>
          </div>

          {/* Floating style tags */}
          {styles.map((s, i) => {
            const angle = (i / styles.length) * Math.PI * 2 - Math.PI / 2;
            const radius = 160;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            return (
              <div
                key={s.name}
                style={{
                  position: "absolute",
                  left: `calc(50% + ${x}px - 36px)`,
                  top: `calc(50% + ${y}px - 14px)`,
                  padding: "5px 12px",
                  borderRadius: 10,
                  background: "#ffffff0d",
                  backdropFilter: "blur(20px)",
                  border: "1px solid #ffffff0d",
                  fontSize: 11,
                  color: s.color,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                }}
              >
                {s.name}
              </div>
            );
          })}
        </div>

        {/* Right - Text */}
        <div style={{ maxWidth: 400 }}>
          <h2
            style={{
              fontSize: 44,
              fontWeight: 700,
              color: "#fffc",
              lineHeight: 1.2,
            }}
          >
            160+{" "}
            <span
              className="gradient-text"
              style={{
                backgroundImage:
                  "linear-gradient(120deg, #f8a0d3 13.14%, #9efae0 88.61%)",
              }}
            >
              种艺术风格
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
            从水墨画到赛博朋克，从水彩到 3D 渲染。从丰富的艺术风格库中选择，
            或上传你自己的参考图，创造独特的视觉美学。
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
            浏览全部风格 →
          </button>
        </div>
      </div>
    </section>
  );
}
