"use client";

const steps = [
  {
    num: "01",
    title: "描述你的创意",
    desc: "通过文字描述或上传参考图输入你的创意概念",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef319f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    num: "02",
    title: "AI 智能体协作",
    desc: "7 位专业智能体协同完成剧本、角色设计和分镜",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#b68bff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    num: "03",
    title: "审阅与精修",
    desc: "逐帧微调每个角色、场景和动画细节，打磨至完美",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3c9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
  },
  {
    num: "04",
    title: "导出成片",
    desc: "下载你完成的高清动画视频，支持多种格式和分辨率",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#09f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    ),
  },
];

export default function FrameSection() {
  return (
    <section
      className="section-full"
      style={{
        padding: "100px 0",
      }}
    >
      <h2 className="section-title">
        工作{" "}
        <span
          className="gradient-text"
          style={{
            backgroundImage:
              "linear-gradient(120deg, #f8a0d3 13.14%, #9efae0 88.61%)",
          }}
        >
          流程
        </span>
      </h2>
      <p className="section-subtitle">
        从想象到动画，只需简单四步
      </p>

      {/* Steps */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginTop: 56,
          maxWidth: 1000,
          width: "100%",
          padding: "0 40px",
        }}
      >
        {steps.map((step, i) => (
          <div
            key={step.num}
            style={{
              flex: 1,
              padding: 24,
              borderRadius: 20,
              border: "1px solid #ffffff0d",
              backgroundColor: "#ffffff06",
              position: "relative",
              overflow: "hidden",
              transition: "all 0.4s",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#ffffff1a";
              e.currentTarget.style.backgroundColor = "#ffffff0a";
              e.currentTarget.style.transform = "translateY(-4px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#ffffff0d";
              e.currentTarget.style.backgroundColor = "#ffffff06";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            {/* Step number watermark */}
            <div
              style={{
                fontSize: 72,
                fontWeight: 800,
                color: "#ffffff06",
                position: "absolute",
                top: -8,
                right: 8,
                lineHeight: 1,
              }}
            >
              {step.num}
            </div>

            {/* Icon */}
            <div style={{ marginBottom: 16 }}>{step.icon}</div>

            {/* Title */}
            <h3
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "#fffc",
                marginBottom: 8,
              }}
            >
              {step.title}
            </h3>

            {/* Description */}
            <p
              style={{
                fontSize: 13,
                color: "#fff6",
                lineHeight: 1.6,
              }}
            >
              {step.desc}
            </p>

            {/* Connector line */}
            {i < steps.length - 1 && (
              <div
                style={{
                  position: "absolute",
                  right: -8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 16,
                  height: 1,
                  backgroundColor: "#ffffff14",
                  zIndex: 1,
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* CTA Button */}
      <button
        className="btn btn-primary"
        style={{
          marginTop: 48,
          padding: "0 28px",
          borderRadius: 18,
          height: 48,
          fontWeight: 600,
          fontSize: 15,
        }}
      >
        立即开始创作 →
      </button>
    </section>
  );
}
