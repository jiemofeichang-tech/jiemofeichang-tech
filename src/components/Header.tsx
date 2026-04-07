"use client";

import { useEffect, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { updateSessionConfig, type ServerConfig, type AuthUser } from "@/lib/api";

interface HeaderProps {
  config?: ServerConfig | null;
  onConfigUpdated?: () => void;
  user?: AuthUser;
  onLogout?: () => void;
}

const languages = [
  { label: "简体中文", active: true },
  { label: "English", active: false },
  { label: "日本語", active: false },
  { label: "繁體中文", active: false },
];

export default function Header({ config, onConfigUpdated, user, onLogout }: HeaderProps) {
  const [langOpen, setLangOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-popup]")) {
        setLangOpen(false);
        setAvatarOpen(false);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  const closeMenus = () => {
    setLangOpen(false);
    setAvatarOpen(false);
  };

  return (
    <>
      <header
        className="app-header"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          height: "var(--header-height)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 28px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 1480,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 18,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 14,
                background: "linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.06))",
                border: "1px solid rgba(255,255,255,0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14)",
                overflow: "hidden",
              }}
            >
              <img src="/assets/logo.png" alt="聚给力" style={{ width: 26, height: 26, objectFit: "contain" }} />
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 650, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
                聚给力
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Creative Storyboard Studio</div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.04)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
            }}
          >
            <StatusDot active={Boolean(config?.hasApiKey)} />
            <span style={{ fontSize: 13, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
              {config?.hasApiKey ? "生成服务已连接" : "等待连接生成服务"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ position: "relative" }} data-popup>
              <GlassButton
                onClick={(e) => {
                  e.stopPropagation();
                  setLangOpen((prev) => !prev);
                  setAvatarOpen(false);
                }}
              >
                <GlobeIcon />
                <span style={{ fontSize: 13 }}>简体中文</span>
                <ChevronDownIcon />
              </GlassButton>

              {langOpen && (
                <PopoverPanel width={180}>
                  {languages.map((lang) => (
                    <button
                      key={lang.label}
                      type="button"
                      onClick={() => setLangOpen(false)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 12px",
                        borderRadius: 12,
                        color: lang.active ? "var(--text-primary)" : "var(--text-secondary)",
                        background: lang.active ? "rgba(255,255,255,0.06)" : "transparent",
                        textAlign: "left",
                        fontSize: 13,
                      }}
                    >
                      <span>{lang.label}</span>
                      {!lang.active && <span style={{ color: "var(--text-muted)", fontSize: 11 }}>即将支持</span>}
                    </button>
                  ))}
                </PopoverPanel>
              )}
            </div>

            <IconButton label="FAQ" onClick={() => setFaqOpen(true)}>
              <QuestionIcon />
            </IconButton>

            <IconButton label="资产" onClick={() => setAssetsOpen(true)}>
              <ArchiveIcon />
            </IconButton>

            <IconButton label="设置" onClick={() => setSettingsOpen(true)}>
              <GearIcon />
            </IconButton>

            <div style={{ position: "relative" }} data-popup>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setAvatarOpen((prev) => !prev);
                  setLangOpen(false);
                }}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "linear-gradient(180deg, rgba(130,182,255,0.32), rgba(130,182,255,0.12))",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 12px 28px rgba(77,132,255,0.18)",
                }}
              >
                <UserIcon />
              </button>

              {avatarOpen && (
                <PopoverPanel width={220}>
                  <div style={{ padding: 8 }}>
                    <div
                      style={{
                        padding: "10px 12px 14px",
                        borderBottom: "1px solid rgba(255,255,255,0.08)",
                        marginBottom: 8,
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                        {user?.username || "创作者"}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted)" }}>
                        {config?.userId ? `ID: ${config.userId}` : user ? `UID: ${user.id}` : "未绑定用户标识"}
                      </div>
                    </div>

                    <MenuRow
                      label="个人信息"
                      icon={<UserIcon />}
                      onClick={() => {
                        closeMenus();
                        setProfileOpen(true);
                      }}
                    />
                    <MenuRow
                      label="邀请好友"
                      icon={<SparkleIcon />}
                      onClick={() => {
                        closeMenus();
                        setInviteOpen(true);
                      }}
                    />
                    <MenuRow
                      label="偏好设置"
                      icon={<GearIcon />}
                      onClick={() => {
                        closeMenus();
                        setSettingsOpen(true);
                      }}
                    />
                    {onLogout && (
                      <MenuRow
                        label="退出登录"
                        icon={<LogoutIcon />}
                        danger
                        onClick={() => {
                          closeMenus();
                          onLogout();
                        }}
                      />
                    )}
                  </div>
                </PopoverPanel>
              )}
            </div>
          </div>
        </div>
      </header>

      {faqOpen && (
        <Modal title="常见问题" onClose={() => setFaqOpen(false)}>
          <FaqContent />
        </Modal>
      )}

      {assetsOpen && (
        <Modal title="我的资产" onClose={() => setAssetsOpen(false)}>
          <AssetsContent />
        </Modal>
      )}

      {settingsOpen && (
        <Modal title="后端设置" onClose={() => setSettingsOpen(false)}>
          <SettingsFormContent
            config={config}
            onSaved={() => {
              setSettingsOpen(false);
              onConfigUpdated?.();
            }}
          />
        </Modal>
      )}

      {profileOpen && (
        <Modal title="个人信息" onClose={() => setProfileOpen(false)}>
          <ProfileContent user={user} config={config} />
        </Modal>
      )}

      {inviteOpen && (
        <Modal title="邀请好友" onClose={() => setInviteOpen(false)}>
          <InviteContent />
        </Modal>
      )}
    </>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: 999,
        background: active ? "var(--accent-green)" : "rgba(255,255,255,0.26)",
        boxShadow: active ? "0 0 0 4px rgba(138,230,195,0.14)" : "none",
      }}
    />
  );
}

function GlassButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 14px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.04)",
        color: "var(--text-secondary)",
        fontSize: 13,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      {children}
    </button>
  );
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        width: 40,
        height: 40,
        borderRadius: 999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.04)",
        color: "var(--text-secondary)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
    >
      {children}
    </button>
  );
}

function PopoverPanel({ children, width = 220 }: { children: ReactNode; width?: number }) {
  return (
    <div
      style={{
        position: "absolute",
        top: "calc(100% + 10px)",
        right: 0,
        width,
        padding: 8,
        borderRadius: 20,
        border: "1px solid rgba(255,255,255,0.1)",
        background: "rgba(15,18,26,0.94)",
        backdropFilter: "blur(28px) saturate(150%)",
        boxShadow: "0 28px 60px rgba(0,0,0,0.28)",
      }}
    >
      {children}
    </div>
  );
}

function MenuRow({
  label,
  icon,
  onClick,
  danger = false,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "11px 12px",
        borderRadius: 14,
        color: danger ? "#ff8a80" : "var(--text-secondary)",
        textAlign: "left",
        fontSize: 13,
      }}
    >
      <span style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(4,6,10,0.58)",
        backdropFilter: "blur(18px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560,
          maxWidth: "calc(100vw - 24px)",
          maxHeight: "min(82vh, 820px)",
          overflow: "auto",
          borderRadius: 28,
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(15,18,26,0.94)",
          backdropFilter: "blur(30px) saturate(140%)",
          boxShadow: "0 34px 100px rgba(0,0,0,0.34)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            padding: "22px 24px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <h2 style={{ fontSize: 19, fontWeight: 650, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>{title}</h2>
          <IconButton label="关闭" onClick={() => onClose()}>
            <CloseIcon />
          </IconButton>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>
  );
}

function FaqContent() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const faqs = [
    {
      q: "聚给力是什么？",
      a: "它是面向 AI 漫剧和短片创作的工作台，把灵感输入、镜头组织、素材管理和任务推进放到同一条生产线上。",
    },
    {
      q: "为什么首页同时有创作入口和项目入口？",
      a: "这个项目希望把灵感采集和正式制作打通，所以首页既承担快速试验，也承担进入工作流的入口。",
    },
    {
      q: "如何连接生成服务？",
      a: "点击右上角设置，填写 API Key、用户 ID 和默认模型后，首页就能直接连到你的本地后端服务。",
    },
    {
      q: "后续会支持哪些协作能力？",
      a: "适合继续补上素材共享、项目成员协作、断点恢复和任务版本回溯，这样更像真正的制片台。",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {faqs.map((faq, index) => {
        const open = openIndex === index;
        return (
          <div
            key={faq.q}
            style={{
              borderRadius: 20,
              border: "1px solid rgba(255,255,255,0.08)",
              background: open ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.03)",
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              onClick={() => setOpenIndex(open ? null : index)}
              style={{
                width: "100%",
                padding: "16px 18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                textAlign: "left",
                color: "var(--text-primary)",
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 600 }}>{faq.q}</span>
              <ChevronDownIcon style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }} />
            </button>
            {open && (
              <div style={{ padding: "0 18px 18px", fontSize: 13, lineHeight: 1.8, color: "var(--text-secondary)" }}>
                {faq.a}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AssetsContent() {
  return (
    <div
      style={{
        minHeight: 260,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.04)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ArchiveIcon />
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>资产面板还在整理中</div>
      <div style={{ maxWidth: 320, fontSize: 13, lineHeight: 1.8, color: "var(--text-muted)" }}>
        角色图、分镜帧、视频结果和参考图都适合集中到这里，后续可以继续做成一个真正的素材库。
      </div>
    </div>
  );
}

function ProfileContent({ user, config }: { user?: AuthUser; config?: ServerConfig | null }) {
  const infoItems = [
    { label: "用户名", value: user?.username || "未命名用户" },
    { label: "用户 ID", value: config?.userId || (user ? String(user.id) : "未绑定") },
    { label: "默认模型", value: config?.defaultModel || "veo-2" },
    { label: "API 状态", value: config?.hasApiKey ? "已配置" : "未配置", accent: config?.hasApiKey ? "var(--accent-green)" : "var(--text-muted)" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{
            width: 68,
            height: 68,
            borderRadius: 24,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "linear-gradient(180deg, rgba(130,182,255,0.28), rgba(130,182,255,0.1))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <UserIcon />
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 650, color: "var(--text-primary)" }}>{user?.username || "创作者"}</div>
          <div style={{ marginTop: 4, fontSize: 13, color: "var(--text-muted)" }}>AI 漫剧创作空间</div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {infoItems.map((item) => (
          <div
            key={item.label}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 18,
              padding: "14px 16px",
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{item.label}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: item.accent || "var(--text-primary)" }}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InviteContent() {
  return (
    <div
      style={{
        minHeight: 240,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.04)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <SparkleIcon />
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>邀请系统即将开放</div>
      <div style={{ maxWidth: 320, fontSize: 13, lineHeight: 1.8, color: "var(--text-muted)" }}>
        后续可以在这里配置邀请码、奖励机制和协作入口，让创作者更自然地把团队拉进来。
      </div>
    </div>
  );
}

function SettingsFormContent({ config, onSaved }: { config?: ServerConfig | null; onSaved: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [userId, setUserId] = useState(config?.userId || "");
  const [defaultModel, setDefaultModel] = useState(config?.defaultModel || "veo-2");
  const [autoSave, setAutoSave] = useState(config?.autoSave ?? true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const inputStyle: CSSProperties = {
    width: "100%",
    padding: "14px 16px",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    color: "var(--text-primary)",
    outline: "none",
    fontSize: 14,
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      const payload: Record<string, unknown> = { userId, defaultModel, autoSave };
      if (apiKey.trim()) payload.apiKey = apiKey.trim();
      const res = await updateSessionConfig(payload as Parameters<typeof updateSessionConfig>[0]);
      setMessage(res.message || "保存成功");
      setTimeout(onSaved, 600);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void handleSave();
      }}
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <Field label={`API Key${config?.hasApiKey ? "（已配置）" : ""}`}>
        <input
          type="text"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={config?.hasApiKey ? "留空则保持不变" : "输入 API Key"}
          autoComplete="off"
          spellCheck={false}
          style={inputStyle}
        />
      </Field>

      <Field label="用户 ID">
        <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="输入用户 ID" style={inputStyle} />
      </Field>

      <Field label="默认模型">
        <input value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)} style={inputStyle} />
      </Field>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "14px 16px",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.03)",
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>自动保存生成视频</div>
          <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted)" }}>开启后会把结果自动落到本地素材目录</div>
        </div>
        <button
          type="button"
          onClick={() => setAutoSave((prev) => !prev)}
          style={{
            width: 52,
            height: 32,
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.08)",
            background: autoSave ? "rgba(130,182,255,0.28)" : "rgba(255,255,255,0.08)",
            position: "relative",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 3,
              left: autoSave ? 23 : 3,
              width: 24,
              height: 24,
              borderRadius: 999,
              background: "#fff",
              transition: "left 0.18s ease",
              boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
            }}
          />
        </button>
      </div>

      {message && (
        <div style={{ fontSize: 13, color: message.includes("失败") || message.includes("error") ? "#ff8a80" : "var(--accent-green)" }}>
          {message}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        style={{
          padding: "14px 18px",
          borderRadius: 18,
          border: "1px solid rgba(130,182,255,0.22)",
          background: "linear-gradient(180deg, rgba(130,182,255,0.3), rgba(77,132,255,0.18))",
          color: "white",
          fontSize: 14,
          fontWeight: 650,
          boxShadow: "0 18px 36px rgba(77,132,255,0.18)",
          opacity: saving ? 0.65 : 1,
        }}
      >
        {saving ? "保存中..." : "保存设置"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>{label}</span>
      {children}
    </label>
  );
}

function BaseIcon({
  children,
  size = 17,
  style,
}: {
  children: ReactNode;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      {children}
    </svg>
  );
}

function GlobeIcon() {
  return (
    <BaseIcon>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18" />
      <path d="M12 3a15 15 0 0 0 0 18" />
    </BaseIcon>
  );
}

function ChevronDownIcon({ style }: { style?: CSSProperties }) {
  return (
    <BaseIcon size={15} style={style}>
      <path d="m6 9 6 6 6-6" />
    </BaseIcon>
  );
}

function QuestionIcon() {
  return (
    <BaseIcon>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.4 9.2a2.7 2.7 0 1 1 4.5 2.1c-.8.7-1.4 1.2-1.4 2.2" />
      <path d="M12 17h.01" />
    </BaseIcon>
  );
}

function ArchiveIcon() {
  return (
    <BaseIcon>
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M9 10h6" />
      <path d="M10 14h4" />
    </BaseIcon>
  );
}

function MessageIcon() {
  return (
    <BaseIcon>
      <path d="M5 7.5A2.5 2.5 0 0 1 7.5 5h9A2.5 2.5 0 0 1 19 7.5v5A2.5 2.5 0 0 1 16.5 15H11l-3.5 3V15H7.5A2.5 2.5 0 0 1 5 12.5z" />
    </BaseIcon>
  );
}

function GearIcon() {
  return (
    <BaseIcon>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.8 1.8 0 0 1-2.5 2.5l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1.8 1.8 0 0 1-3.6 0v-.2a1 1 0 0 0-.7-.9 1 1 0 0 0-1.1.2l-.1.1a1.8 1.8 0 0 1-2.5-2.5l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1.8 1.8 0 0 1 0-3.6h.2a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1.1l-.1-.1a1.8 1.8 0 0 1 2.5-2.5l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1.8 1.8 0 0 1 3.6 0v.2a1 1 0 0 0 .7.9 1 1 0 0 0 1.1-.2l.1-.1a1.8 1.8 0 0 1 2.5 2.5l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a1.8 1.8 0 0 1 0 3.6h-.2a1 1 0 0 0-.9.7Z" />
    </BaseIcon>
  );
}

function UserIcon() {
  return (
    <BaseIcon>
      <path d="M18 19a6 6 0 0 0-12 0" />
      <circle cx="12" cy="9" r="3.3" />
    </BaseIcon>
  );
}

function SparkleIcon() {
  return (
    <BaseIcon>
      <path d="m12 3 1.8 4.7L18.5 9l-4.7 1.3L12 15l-1.8-4.7L5.5 9l4.7-1.3Z" />
      <path d="m19 15 .7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7Z" />
    </BaseIcon>
  );
}

function LogoutIcon() {
  return (
    <BaseIcon>
      <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </BaseIcon>
  );
}

function CloseIcon() {
  return (
    <BaseIcon>
      <path d="M6 6 18 18" />
      <path d="M18 6 6 18" />
    </BaseIcon>
  );
}
