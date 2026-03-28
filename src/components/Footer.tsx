"use client";

export default function Footer() {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--border)",
        padding: "48px 40px 32px",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          maxWidth: 1100,
          width: "100%",
          gap: 60,
          flexWrap: "wrap",
        }}
      >
        {/* Brand */}
        <div style={{ minWidth: 240, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
            <svg width="80" height="22" viewBox="0 0 98 33" fill="none">
              <path d="M1.48 0.15C3.32-0.05 5.53 0.56 7.13 1.72C9.16 3.2 9.75 5.65 11.43 7.18C13.19 8.79 16.31 7.79 14.97 5.28C14.65 4.67 14.06 4.07 13.28 3.64C11.94 2.88 12.93 1.71 14.16 1.64C18.31 1.4 19.45 7.23 26.47 7.23H85.49C92.37 7.23 98 12.9 98 19.83C98 26.76 92.37 32.43 85.49 32.43H14.51C7.67 32.43 2.06 26.82 2 19.93C2 19.16 2.06 18.35 2.2 17.59C2.54 15.85 4.07 16.18 4.38 17.49C5.49 22.15 10.25 19.6 8.63 16.73C8.11 15.81 6.99 14.8 6.51 14.13C5.34 12.49 5.19 11.48 5.23 8.82C5.27 5.62 3.87 3.84 1.11 2.34C-0.36 1.54 0.4 0.27 1.48 0.15Z" fill="#FD69CF"/>
              <circle cx="1.44" cy="12.5" r="2.3" fill="#FD69CF"/>
              <text x="30" y="24" fill="white" fontSize="16" fontWeight="700" fontFamily="Poppins, sans-serif">OiiOii</text>
            </svg>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8, maxWidth: 300 }}>
            全球首个动画创作Agent，希望帮助更多人实现自己的动画梦。
            每一段想象力，都值得被看见。
            Imagination, now displaying.
          </p>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 12, opacity: 0.6 }}>
            © 2025 OiiOii. All rights reserved.
          </p>
        </div>

        {/* Platform Links */}
        <div>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 14 }}>
            平台协议
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <FooterLink label="隐私声明" />
            <FooterLink label="使用条款" />
          </div>
        </div>

        {/* Contact */}
        <div>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 14 }}>
            联系我们
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Support: <a href="mailto:contact@hogi.ai" style={{ color: "var(--accent-blue)", textDecoration: "none" }}>contact@hogi.ai</a>
            </span>
          </div>
        </div>

        {/* Social Media */}
        <div>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 14 }}>
            社媒平台
          </h4>
          <div style={{ display: "flex", gap: 10 }}>
            {[
              { label: "𝕏", title: "X/Twitter" },
              { label: "▶", title: "YouTube" },
              { label: "📷", title: "Instagram" },
              { label: "🔴", title: "Reddit" },
            ].map((s) => (
              <div
                key={s.title}
                title={s.title}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  backgroundColor: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                {s.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({ label }: { label: string }) {
  return (
    <a
      href="#"
      style={{
        fontSize: 12,
        color: "var(--text-muted)",
        textDecoration: "none",
        transition: "color 0.2s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
    >
      {label}
    </a>
  );
}
