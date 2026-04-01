"use client";

import { useState, useCallback } from "react";
import { authLogin, authRegister } from "@/lib/api";

type Tab = "login" | "register";

export default function LoginPage() {
  const [tab, setTab] = useState<Tab>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [hoverButton, setHoverButton] = useState(false);

  /* ── 切换 tab 时重置表单 ── */
  const switchTab = useCallback((t: Tab) => {
    setTab(t);
    setUsername("");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setSuccess("");
  }, []);

  /* ── 提交 ── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!username.trim() || !password) {
      setError("请输入用户名和密码");
      return;
    }

    if (tab === "register") {
      if (username.trim().length < 2) {
        setError("用户名至少 2 个字符");
        return;
      }
      if (password.length < 6) {
        setError("密码至少 6 个字符");
        return;
      }
      if (password !== confirmPassword) {
        setError("两次密码输入不一致");
        return;
      }
    }

    setLoading(true);
    try {
      if (tab === "login") {
        await authLogin(username.trim(), password);
        window.location.href = "/";
      } else {
        await authRegister(username.trim(), password);
        // 注册成功 → 自动切换到登录 tab，让用户登录
        setSuccess("注册成功，请登录");
        setTab("login");
        setPassword("");
        setConfirmPassword("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setLoading(false);
    }
  };

  /* ── 输入框样式（带 focus 支持） ── */
  const getInputStyle = (field: string): React.CSSProperties => ({
    width: "100%",
    padding: "10px 14px",
    backgroundColor: "var(--bg-input)",
    border: focusedField === field
      ? "1px solid var(--accent-pink)"
      : "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.2s, box-shadow 0.2s",
    boxShadow: focusedField === field
      ? "0 0 0 3px rgba(255, 140, 0, 0.15)"
      : "none",
  });

  /* ── 按钮样式（带 hover 支持） ── */
  const buttonStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 0",
    backgroundColor: loading
      ? "rgba(255, 140, 0, 0.5)"
      : hoverButton
        ? "var(--accent-hot-pink)"
        : "var(--accent-pink)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    cursor: loading ? "not-allowed" : "pointer",
    transition: "background-color 0.2s, transform 0.1s",
    marginTop: 4,
    transform: hoverButton && !loading ? "translateY(-1px)" : "none",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 12% 0%, rgba(105, 147, 255, 0.16), transparent 28%),"
          + "radial-gradient(circle at 82% 16%, rgba(255, 192, 93, 0.16), transparent 24%),"
          + "linear-gradient(180deg, #07111f 0%, #081523 38%, #0c1b2d 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          width: 400,
          backgroundColor: "rgba(33, 28, 23, 0.7)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 20,
          padding: "40px 32px",
          boxShadow: "0 24px 48px rgba(0, 0, 0, 0.3)",
          animation: "fadeInUp 0.5s ease-out",
        }}
      >
        {/* ── Logo ── */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <img src="/assets/logo.png" alt="聚给力" style={{ width: 40, height: 40, objectFit: "contain" }} />
            <span
              style={{
                fontSize: 24,
                fontWeight: 800,
                color: "#fff",
                letterSpacing: "0.5px",
                fontFamily: "'Noto Sans SC', sans-serif",
              }}
            >
              聚给力
            </span>
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 8 }}>
            AI 动画智能创作平台
          </div>
        </div>

        {/* ── Tabs ── */}
        <div
          style={{
            display: "flex",
            gap: 0,
            marginBottom: 28,
            borderBottom: "1px solid var(--border)",
          }}
        >
          {(["login", "register"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              style={{
                flex: 1,
                padding: "10px 0",
                background: "none",
                border: "none",
                borderBottom:
                  tab === t
                    ? "2px solid var(--accent-pink)"
                    : "2px solid transparent",
                color: tab === t ? "var(--text-primary)" : "var(--text-muted)",
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {t === "login" ? "登录" : "注册"}
            </button>
          ))}
        </div>

        {/* ── Form ── */}
        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          {/* 用户名 */}
          <div>
            <label
              style={{
                display: "block",
                color: "var(--text-secondary)",
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              用户名
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onFocus={() => setFocusedField("username")}
              onBlur={() => setFocusedField(null)}
              placeholder="请输入用户名"
              style={getInputStyle("username")}
              autoComplete="username"
              autoFocus
            />
          </div>

          {/* 密码 */}
          <div>
            <label
              style={{
                display: "block",
                color: "var(--text-secondary)",
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setFocusedField("password")}
              onBlur={() => setFocusedField(null)}
              placeholder="请输入密码"
              style={getInputStyle("password")}
              autoComplete={tab === "login" ? "current-password" : "new-password"}
            />
          </div>

          {/* 确认密码（注册时显示，带过渡动画） */}
          <div
            style={{
              maxHeight: tab === "register" ? 80 : 0,
              opacity: tab === "register" ? 1 : 0,
              overflow: "hidden",
              transition: "max-height 0.3s ease, opacity 0.25s ease",
            }}
          >
            <label
              style={{
                display: "block",
                color: "var(--text-secondary)",
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              确认密码
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onFocus={() => setFocusedField("confirm")}
              onBlur={() => setFocusedField(null)}
              placeholder="请再次输入密码"
              style={getInputStyle("confirm")}
              autoComplete="new-password"
              tabIndex={tab === "register" ? 0 : -1}
            />
          </div>

          {/* 成功提示 */}
          {success && (
            <div
              style={{
                color: "var(--accent-green)",
                fontSize: 13,
                padding: "8px 12px",
                backgroundColor: "rgba(0, 204, 153, 0.1)",
                borderRadius: 6,
              }}
            >
              {success}
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div
              style={{
                color: "#ef4444",
                fontSize: 13,
                padding: "8px 12px",
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                borderRadius: 6,
              }}
            >
              {error}
            </div>
          )}

          {/* 提交按钮 */}
          <button
            type="submit"
            disabled={loading}
            onMouseEnter={() => setHoverButton(true)}
            onMouseLeave={() => setHoverButton(false)}
            style={buttonStyle}
          >
            {loading ? "处理中..." : tab === "login" ? "登录" : "注册"}
          </button>
        </form>
      </div>

      <a
        href="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          marginTop: 24,
          fontSize: 13,
          color: "var(--text-muted)",
          textDecoration: "none",
          transition: "color 0.2s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5" />
          <path d="M12 19l-7-7 7-7" />
        </svg>
        返回首页
      </a>
    </div>
  );
}
