"use client";

import { useState } from "react";
import { authLogin, authRegister } from "@/lib/api";

type Tab = "login" | "register";

export default function LoginPage() {
  const [tab, setTab] = useState<Tab>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

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
      } else {
        await authRegister(username.trim(), password);
      }
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    backgroundColor: "var(--bg-input)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: "var(--bg)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
    }}>
      <div style={{
        width: 400,
        backgroundColor: "var(--bg-panel)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: "40px 32px",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <svg width="36" height="22" viewBox="0 0 98 33" fill="none">
              <path d="M1.48 0.15C3.32-0.05 5.53 0.56 7.13 1.72C9.16 3.2 9.75 5.65 11.43 7.18C13.19 8.79 16.31 7.79 14.97 5.28C14.65 4.67 14.06 4.07 13.28 3.64C11.94 2.88 12.93 1.71 14.16 1.64C18.31 1.4 19.45 7.23 26.47 7.23H85.49C92.37 7.23 98 12.9 98 19.83C98 26.76 92.37 32.43 85.49 32.43H14.51C7.67 32.43 2.06 26.82 2 19.93C2 19.16 2.06 18.35 2.2 17.59C2.54 15.85 4.07 16.18 4.38 17.49C5.49 22.15 10.25 19.6 8.63 16.73C8.11 15.81 6.99 14.8 6.51 14.13C5.34 12.49 5.19 11.48 5.23 8.82C5.27 5.62 3.87 3.84 1.11 2.34C-0.36 1.54 0.4 0.27 1.48 0.15Z" fill="#FD69CF"/>
              <circle cx="1.44" cy="12.5" r="2.3" fill="#FD69CF"/>
            </svg>
            <span style={{ fontSize: 26, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px", fontFamily: "'Poppins', sans-serif" }}>
              OiiOii
            </span>
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 8 }}>
            Seedance Studio
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, marginBottom: 28, borderBottom: "1px solid var(--border)" }}>
          {(["login", "register"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(""); }}
              style={{
                flex: 1,
                padding: "10px 0",
                background: "none",
                border: "none",
                borderBottom: tab === t ? "2px solid var(--accent-pink)" : "2px solid transparent",
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

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ display: "block", color: "var(--text-secondary)", fontSize: 13, marginBottom: 6 }}>
              用户名
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              style={inputStyle}
              autoFocus
            />
          </div>

          <div>
            <label style={{ display: "block", color: "var(--text-secondary)", fontSize: 13, marginBottom: 6 }}>
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              style={inputStyle}
            />
          </div>

          {tab === "register" && (
            <div>
              <label style={{ display: "block", color: "var(--text-secondary)", fontSize: 13, marginBottom: 6 }}>
                确认密码
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="请再次输入密码"
                style={inputStyle}
              />
            </div>
          )}

          {error && (
            <div style={{ color: "#ef4444", fontSize: 13, padding: "8px 12px", backgroundColor: "rgba(239,68,68,0.1)", borderRadius: 6 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px 0",
              backgroundColor: loading ? "rgba(239,49,159,0.5)" : "var(--accent-pink)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "background-color 0.2s",
              marginTop: 4,
            }}
          >
            {loading ? "处理中..." : tab === "login" ? "登录" : "注册"}
          </button>
        </form>
      </div>
    </div>
  );
}
