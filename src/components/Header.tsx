"use client";

import { useState, useEffect } from "react";
import { updateSessionConfig, type ServerConfig, type AuthUser } from "@/lib/api";

interface HeaderProps {
  config?: ServerConfig | null;
  onConfigUpdated?: () => void;
  user?: AuthUser;
  onLogout?: () => void;
}

export default function Header({ config, onConfigUpdated, user, onLogout }: HeaderProps) {
  const [langOpen, setLangOpen] = useState(false);
  const [wechatOpen, setWechatOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-popup]")) {
        setLangOpen(false);
        setWechatOpen(false);
        setAvatarOpen(false);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  return (
    <>
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        height: "var(--header-height)", display: "flex", alignItems: "center",
        justifyContent: "center", padding: "0 40px",
        backgroundColor: "var(--bg)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
          {/* Left: Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <svg width="32" height="20" viewBox="0 0 98 33" fill="none">
                <path d="M1.48 0.15C3.32-0.05 5.53 0.56 7.13 1.72C9.16 3.2 9.75 5.65 11.43 7.18C13.19 8.79 16.31 7.79 14.97 5.28C14.65 4.67 14.06 4.07 13.28 3.64C11.94 2.88 12.93 1.71 14.16 1.64C18.31 1.4 19.45 7.23 26.47 7.23H85.49C92.37 7.23 98 12.9 98 19.83C98 26.76 92.37 32.43 85.49 32.43H14.51C7.67 32.43 2.06 26.82 2 19.93C2 19.16 2.06 18.35 2.2 17.59C2.54 15.85 4.07 16.18 4.38 17.49C5.49 22.15 10.25 19.6 8.63 16.73C8.11 15.81 6.99 14.8 6.51 14.13C5.34 12.49 5.19 11.48 5.23 8.82C5.27 5.62 3.87 3.84 1.11 2.34C-0.36 1.54 0.4 0.27 1.48 0.15Z" fill="#FD69CF"/>
                <circle cx="1.44" cy="12.5" r="2.3" fill="#FD69CF"/>
              </svg>
              <span style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px", fontFamily: "'Poppins', sans-serif" }}>OiiOii</span>
            </div>
            <span style={{ padding: "2px 8px", borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 500, lineHeight: "16px" }}>Beta</span>
          </div>

          {/* Right: Nav items */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {/* Language */}
            <div style={{ position: "relative" }} data-popup>
              <button onClick={(e) => { e.stopPropagation(); setLangOpen(!langOpen); setWechatOpen(false); setAvatarOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                简体中文
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
              </button>
              {langOpen && (
                <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 0", minWidth: 120, zIndex: 200 }}>
                  {["English", "日本語", "简体中文", "繁體中文"].map((lang) => (
                    <button key={lang} onClick={() => setLangOpen(false)} style={{ display: "block", width: "100%", padding: "8px 16px", fontSize: 13, color: "var(--text-secondary)", textAlign: "left" }}>{lang}</button>
                  ))}
                </div>
              )}
            </div>

            {/* WeChat */}
            <div style={{ position: "relative" }} data-popup>
              <button onClick={(e) => { e.stopPropagation(); setWechatOpen(!wechatOpen); setLangOpen(false); setAvatarOpen(false); }} style={{ width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446C13.15 8.662 15.61 7.87 17.985 8.088 17.15 4.723 13.291 2.188 8.691 2.188zm5.866 16.18a8.39 8.39 0 0 0 2.384.346c.678 0 1.332-.089 1.963-.264a.6.6 0 0 1 .499.069l1.322.773a.227.227 0 0 0 .116.038c.11 0 .202-.091.202-.205 0-.049-.02-.099-.033-.147l-.271-1.028a.41.41 0 0 1 .148-.46C22.242 16.318 24 14.634 24 12.656c0-2.803-2.692-5.076-6.012-5.076-3.319 0-6.012 2.273-6.012 5.076 0 2.803 2.693 5.076 6.012 5.076a7.13 7.13 0 0 0 .57-.03v.666z"/></svg>
              </button>
              {wechatOpen && (
                <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 8, backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, width: 220, zIndex: 200, textAlign: "center" }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>微信扫码关注</p>
                  <div style={{ width: 160, height: 160, margin: "0 auto", backgroundColor: "var(--bg-hover)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--border)" }}>
                    <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
                      <p>QR Code</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Discord */}
            <button onClick={() => window.open("https://discord.gg/RjJ4EHS3N9", "_blank")} style={{ width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
            </button>

            {/* FAQ */}
            <button onClick={() => setFaqOpen(true)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 8, fontSize: 13, color: "var(--text-secondary)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              常见问题
            </button>

            {/* My Assets */}
            <button onClick={() => setAssetsOpen(true)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 8, fontSize: 13, color: "var(--text-secondary)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
              我的资产
            </button>

            {/* Credit Balance */}
            <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 12px", borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)", fontSize: 13, fontWeight: 600 }}>
              <span style={{ fontSize: 14 }}>🎫</span>
              <span style={{ color: "var(--text-primary)" }}>-422</span>
              <span style={{ padding: "1px 6px", borderRadius: 4, backgroundColor: "var(--accent-green)", color: "#fff", fontSize: 10, fontWeight: 600 }}>BASE</span>
            </div>

            {/* Avatar */}
            <div style={{ position: "relative" }} data-popup>
              <button onClick={(e) => { e.stopPropagation(); setAvatarOpen(!avatarOpen); setLangOpen(false); setWechatOpen(false); }} style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, var(--accent-green), var(--accent-blue))", display: "flex", alignItems: "center", justifyContent: "center", marginLeft: 4, border: "2px solid var(--border-light)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </button>
              {avatarOpen && (
                <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 8, backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "8px 0", width: 200, zIndex: 200 }}>
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{user?.username || "用户"}</p>
                    <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                      {config?.userId ? `ID: ${config.userId}` : user ? `UID: ${user.id}` : ""}
                    </p>
                  </div>
                  {[
                    { label: "个人信息", icon: "👤", action: () => setAvatarOpen(false) },
                    { label: "邀请好友", icon: "🎁", action: () => setAvatarOpen(false) },
                    { label: "设置", icon: "⚙️", action: () => { setAvatarOpen(false); setSettingsOpen(true); } },
                    ...(onLogout ? [{ label: "退出登录", icon: "🚪", action: () => { setAvatarOpen(false); onLogout(); } }] : []),
                  ].map((item) => (
                    <button key={item.label} onClick={item.action} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 16px", fontSize: 13, color: item.label === "退出登录" ? "#ef4444" : "var(--text-secondary)", textAlign: "left" }}>
                      <span style={{ fontSize: 14 }}>{item.icon}</span>{item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* FAQ Modal */}
      {faqOpen && <Modal title="常见问题" onClose={() => setFaqOpen(false)}><FaqContent /></Modal>}

      {/* Assets Modal */}
      {assetsOpen && <Modal title="我的资产" onClose={() => setAssetsOpen(false)}><AssetsContent /></Modal>}

      {/* Settings Modal */}
      {settingsOpen && (
        <Modal title="后端设置" onClose={() => setSettingsOpen(false)}>
          <SettingsContent config={config} onSaved={() => { setSettingsOpen(false); onConfigUpdated?.(); }} />
        </Modal>
      )}
    </>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 16, width: 520, maxHeight: "80vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>{title}</h2>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 18 }}>×</button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

function FaqContent() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const faqs = [
    { q: "OiiOii 是什么？", a: "OiiOii 是全球首个 AI 动画创作 Agent 平台，通过多智能体协作帮助用户创作动画内容。" },
    { q: "如何获取积分？", a: "新用户注册获得初始积分，邀请好友可获得额外积分奖励。" },
    { q: "支持哪些创作类型？", a: "支持自由生图/生视频、剧情故事短片、音乐概念短片、衍生品设计、角色设计、场景设计等。" },
    { q: "托管模式和对话模式有什么区别？", a: "托管模式：一键直出。对话模式：通过对话式调整来优化作品细节。" },
    { q: "如何配置后端？", a: "点击右上角头像 → 设置，输入 API Key 和用户 ID 即可连接即梦视频生成后端。" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {faqs.map((faq, i) => (
        <div key={i} style={{ borderRadius: 10, border: "1px solid var(--border)", overflow: "hidden" }}>
          <button onClick={() => setOpenIndex(openIndex === i ? null : i)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "12px 16px", fontSize: 14, fontWeight: 500, color: "var(--text-primary)", textAlign: "left", backgroundColor: openIndex === i ? "var(--bg-hover)" : "transparent" }}>
            {faq.q}
            <span style={{ color: "var(--text-muted)", transform: openIndex === i ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
          </button>
          {openIndex === i && <div style={{ padding: "0 16px 14px", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7 }}>{faq.a}</div>}
        </div>
      ))}
    </div>
  );
}

function AssetsContent() {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "总积分", value: "-522", color: "var(--accent-orange)" },
          { label: "本月使用", value: "1,280", color: "var(--accent-pink)" },
          { label: "剩余额度", value: "0", color: "var(--text-muted)" },
        ].map((a) => (
          <div key={a.label} style={{ padding: 16, borderRadius: 12, backgroundColor: "var(--bg-hover)", textAlign: "center" }}>
            <p style={{ fontSize: 24, fontWeight: 700, color: a.color }}>{a.value}</p>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{a.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsContent({ config, onSaved }: { config?: ServerConfig | null; onSaved: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [userId, setUserId] = useState(config?.userId || "");
  const [defaultModel, setDefaultModel] = useState(config?.defaultModel || "doubao-seedance-2.0");
  const [autoSave, setAutoSave] = useState(config?.autoSave ?? true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      const payload: Record<string, unknown> = { userId, defaultModel, autoSave };
      if (apiKey.trim()) payload.apiKey = apiKey.trim();
      const res = await updateSessionConfig(payload as Parameters<typeof updateSessionConfig>[0]);
      setMessage(res.message || "保存成功");
      setTimeout(onSaved, 800);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 13,
    backgroundColor: "var(--bg-input)", border: "1px solid var(--border)",
    color: "var(--text-primary)", outline: "none",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <label style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500, display: "block", marginBottom: 6 }}>
          API Key {config?.hasApiKey && <span style={{ color: "var(--accent-green)" }}>(已配置)</span>}
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={config?.hasApiKey ? "留空保持不变" : "输入 API Key"}
          style={inputStyle}
        />
      </div>
      <div>
        <label style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500, display: "block", marginBottom: 6 }}>用户 ID</label>
        <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="用户ID" style={inputStyle} />
      </div>
      <div>
        <label style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500, display: "block", marginBottom: 6 }}>默认模型</label>
        <input value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)} style={inputStyle} />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <label style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>自动保存视频到本地</label>
        <button
          onClick={() => setAutoSave(!autoSave)}
          style={{
            width: 44, height: 24, borderRadius: 12, position: "relative",
            backgroundColor: autoSave ? "var(--accent-green)" : "var(--bg-hover)",
            border: "1px solid var(--border)", transition: "all 0.2s",
          }}
        >
          <span style={{
            position: "absolute", top: 2, left: autoSave ? 22 : 2,
            width: 18, height: 18, borderRadius: "50%", backgroundColor: "#fff",
            transition: "left 0.2s",
          }} />
        </button>
      </div>
      {message && <p style={{ fontSize: 12, color: message.includes("失败") || message.includes("错误") ? "#ef4444" : "var(--accent-green)" }}>{message}</p>}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          padding: "10px 0", borderRadius: 8, fontSize: 14, fontWeight: 600,
          color: "#fff", backgroundColor: "var(--accent-orange)",
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? "保存中..." : "保存设置"}
      </button>
    </div>
  );
}
