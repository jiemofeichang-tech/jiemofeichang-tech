"use client";

import Link from "next/link";

const socialItems = [
  {
    title: "X / Twitter",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    title: "YouTube",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12z" />
      </svg>
    ),
  },
  {
    title: "Instagram",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
      </svg>
    ),
  },
  {
    title: "Reddit",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0zm4.388 3.199c1.104 0 1.999.895 1.999 1.999 0 .763-.425 1.425-1.051 1.763 1.025.603 1.881 1.393 2.514 2.327.175-.049.358-.076.548-.076 1.381 0 2.5 1.119 2.5 2.5 0 1.106-.722 2.043-1.72 2.37-.06 3.48-4.04 6.293-8.878 6.293s-8.818-2.813-8.878-6.294c-.997-.327-1.72-1.263-1.72-2.369 0-1.381 1.119-2.5 2.5-2.5.19 0 .373.027.548.076.633-.934 1.489-1.724 2.514-2.327-.626-.338-1.051-1-1.051-1.763 0-1.104.895-1.999 1.999-1.999.648 0 1.222.307 1.589.784C10.467 4.072 11.218 4 12 4s1.533.072 2.199.183c.367-.477.941-.784 1.589-.784zM8 13a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm8 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm-8.5 2.5c0 1.38 2.012 3.5 4.5 3.5s4.5-2.12 4.5-3.5h-1c0 .828-1.567 2.5-3.5 2.5S9.5 16.328 9.5 15.5z" />
      </svg>
    ),
  },
] as const;

export default function Footer() {
  return (
    <footer
      style={{
        width: "100%",
        maxWidth: 1400,
        margin: "24px auto 0",
        padding: "0 4px",
      }}
    >
      <div
        style={{
          borderTop: "2px solid var(--border)",
          borderRadius: 4,
          background: "var(--bg-panel)",
          padding: "42px 32px 28px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          className="footer-grid"
          style={{
            display: "flex",
            maxWidth: 1180,
            width: "100%",
            gap: 48,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 240, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <img src="/assets/logo.png" alt="绘力聚合" style={{ width: 30, height: 30, objectFit: "contain" }} />
              <span style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", fontFamily: "'Noto Serif SC', 'Noto Sans SC', serif" }}>
                绘力聚合
              </span>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.9, maxWidth: 360 }}>
              面向 AI 漫剧创作的工作台，把一句灵感扩展成角色、镜头与成片。
              首页既承担创作入口，也承担作品展示，让灵感和生产流程停留在同一个页面里。
            </p>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 14, opacity: 0.8, fontFamily: "'JetBrains Mono', monospace" }}>
              &copy; 2026 绘力聚合
            </p>
          </div>

          <div>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 14 }}>平台说明</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <FooterLink label="隐私声明" href="/privacy" />
              <FooterLink label="使用条款" href="/terms" />
            </div>
          </div>

          <div>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 14 }}>联系支持</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Email:
                {" "}
                <a href="mailto:contact@hogi.ai" style={{ color: "var(--accent-blue)" }}>
                  contact@hogi.ai
                </a>
              </span>
            </div>
          </div>

          <div>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 14 }}>社交平台</h4>
            <div style={{ display: "flex", gap: 10 }}>
              {socialItems.map((item) => (
                <SocialButton key={item.title} title={item.title} icon={item.icon} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

function SocialButton({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <div
      title={title}
      style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        backgroundColor: "var(--bg-hover)",
        border: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-secondary)",
        cursor: "pointer",
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--text-primary)";
        e.currentTarget.style.borderColor = "var(--border-light)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "var(--text-secondary)";
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {icon}
    </div>
  );
}

function FooterLink({ label, href }: { label: string; href: string }) {
  return (
    <Link
      href={href}
      style={{
        fontSize: 12,
        color: "var(--text-muted)",
        textDecoration: "none",
        transition: "color 0.2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--text-primary)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "var(--text-muted)";
      }}
    >
      {label}
    </Link>
  );
}
