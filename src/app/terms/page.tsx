import Link from "next/link";

export const metadata = {
  title: "使用条款 · 绘力聚合",
};

const sections = [
  {
    title: "服务说明",
    body: "绘力聚合是一个 AI 辅助漫剧创作平台，提供剧本分析、角色设计、分镜生成、视频合成等功能。平台生成的内容由 AI 模型辅助完成，最终创作决策由用户负责。",
  },
  {
    title: "账户责任",
    body: "用户需妥善保管账户信息，对账户下的所有操作负责。如发现账户被未经授权使用，请立即联系我们。",
  },
  {
    title: "内容所有权",
    body: "用户通过平台创作的内容（剧本、角色、分镜、视频等）归用户所有。平台不对用户创作内容主张知识产权。用户应确保上传的素材不侵犯他人权利。",
  },
  {
    title: "使用规范",
    body: "用户不得利用平台生成违法、有害、侵权或违反公序良俗的内容。平台保留对违规内容进行处理的权利，包括删除内容和限制账户。",
  },
  {
    title: "服务可用性",
    body: "我们努力保持平台稳定运行，但不保证服务不间断或无错误。平台可能因维护、升级或不可抗力因素暂时中断。AI 生成结果可能因模型特性而存在差异。",
  },
  {
    title: "免责声明",
    body: "平台按「现状」提供服务。AI 生成内容仅供参考，用户应自行判断内容的适用性。因使用平台生成内容导致的任何争议，平台不承担直接责任。",
  },
  {
    title: "条款修改",
    body: "我们保留随时修改本条款的权利。修改后继续使用平台即视为接受新条款。重大变更将提前通知用户。",
  },
];

export default function TermsPage() {
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
          使用条款
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
