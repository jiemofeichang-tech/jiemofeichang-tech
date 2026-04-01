import Link from "next/link";

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        textAlign: "center",
      }}
    >
      <h1
        style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: "clamp(96px, 18vw, 180px)",
          fontWeight: 900,
          lineHeight: 1,
          background:
            "linear-gradient(135deg, #ffd59a 0%, #ffb454 50%, #e8783c 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        404
      </h1>

      <p
        style={{
          fontSize: 18,
          color: "var(--text-secondary)",
          marginTop: 12,
          maxWidth: 360,
        }}
      >
        页面未找到
      </p>
      <p
        style={{
          fontSize: 14,
          color: "var(--text-muted)",
          marginTop: 8,
          maxWidth: 360,
        }}
      >
        你访问的页面不存在或已被移除
      </p>

      <Link
        href="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          marginTop: 36,
          padding: "12px 24px",
          borderRadius: 999,
          background:
            "linear-gradient(135deg, rgba(255, 180, 84, 0.22), rgba(255, 141, 77, 0.16))",
          border: "1px solid rgba(255, 198, 115, 0.28)",
          color: "#fff8ef",
          fontSize: 14,
          fontWeight: 600,
          transition: "transform 0.2s, box-shadow 0.2s",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5" />
          <path d="M12 19l-7-7 7-7" />
        </svg>
        返回首页
      </Link>
    </div>
  );
}
