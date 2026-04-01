import Link from "next/link";

export const metadata = {
  title: "隐私声明 · 绘力聚合",
};

const sections = [
  {
    title: "信息收集",
    body: "我们在您注册和使用平台时收集必要的账户信息（用户名、密码哈希）及使用数据（创作记录、操作日志）。我们不会收集与平台服务无关的个人信息。",
  },
  {
    title: "信息使用",
    body: "收集的信息仅用于提供和改善平台服务，包括：账户身份验证、项目数据存储、服务质量分析。我们不会将您的个人信息出售给第三方。",
  },
  {
    title: "数据存储与安全",
    body: "您的数据存储在安全的服务器上，我们采取合理的技术和管理措施保护您的个人信息。创作内容归用户所有，平台不会未经授权使用您的创作成果。",
  },
  {
    title: "Cookie 使用",
    body: "我们使用必要的 Cookie 维持登录状态和用户偏好设置。您可以通过浏览器设置管理 Cookie 选项。",
  },
  {
    title: "第三方服务",
    body: "平台可能集成第三方 AI 模型 API 用于内容生成。生成请求中不会包含您的账户个人信息，仅传递创作所需的文本和参数。",
  },
  {
    title: "隐私政策更新",
    body: "我们可能不时更新本隐私声明。重大变更时，我们会在平台内通知您。继续使用平台即表示您接受更新后的隐私政策。",
  },
];

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: "100vh", padding: "0 24px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto", paddingTop: 120, paddingBottom: 80 }}>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "var(--text-muted)",
            marginBottom: 32,
            transition: "color 0.2s",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
          返回首页
        </Link>

        <h1
          style={{
            fontFamily: "'Noto Serif SC', serif",
            fontSize: 32,
            fontWeight: 700,
            color: "var(--text-primary)",
            marginBottom: 8,
          }}
        >
          隐私声明
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 48 }}>
          最后更新：2026 年 3 月
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
          {sections.map((s) => (
            <section key={s.title}>
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: 10,
                }}
              >
                {s.title}
              </h2>
              <p
                style={{
                  fontSize: 15,
                  color: "var(--text-secondary)",
                  lineHeight: 1.85,
                }}
              >
                {s.body}
              </p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
