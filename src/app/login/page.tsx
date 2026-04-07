"use client";

import { useState, useCallback, type CSSProperties } from "react";
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

  const switchTab = useCallback((nextTab: Tab) => {
    setTab(nextTab);
    setUsername("");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setSuccess("");
  }, []);

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
        setError("用户名至少需要 2 个字符");
        return;
      }
      if (password.length < 6) {
        setError("密码至少需要 6 个字符");
        return;
      }
      if (password !== confirmPassword) {
        setError("两次输入的密码不一致");
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

  const inputStyle = (field: string): CSSProperties => ({
    width: "100%",
    padding: "14px 16px",
    borderRadius: 18,
    border: focusedField === field ? "1px solid rgba(130,182,255,0.32)" : "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.05)",
    color: "var(--text-primary)",
    fontSize: 14,
    outline: "none",
    boxShadow: focusedField === field ? "0 0 0 4px rgba(130,182,255,0.12)" : "none",
    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
  });

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "min(1040px, 100%)",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.1fr) minmax(360px, 420px)",
          gap: 22,
          alignItems: "stretch",
        }}
      >
        <section
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 34,
            border: "1px solid rgba(255,255,255,0.08)",
            background:
              "radial-gradient(circle at top left, rgba(130,182,255,0.18), transparent 24%), linear-gradient(180deg, rgba(14,18,28,0.9), rgba(11,14,21,0.82))",
            boxShadow: "0 32px 90px rgba(0,0,0,0.28)",
            padding: "42px 38px",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at 18% 20%, rgba(130,182,255,0.22), transparent 22%), radial-gradient(circle at 78% 76%, rgba(138,230,195,0.14), transparent 18%), linear-gradient(180deg, rgba(255,255,255,0.03), transparent 40%)",
              pointerEvents: "none",
            }}
          />

          <div
            style={{
              position: "relative",
              height: "100%",
              alignItems: "center",
              justifyContent: "center",
              display: "flex",
            }}
          >
            <div
              style={{
                position: "relative",
                width: "min(460px, 100%)",
                aspectRatio: "1 / 1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: "6%",
                  borderRadius: 40,
                  border: "1px solid rgba(255,255,255,0.06)",
                  background: "rgba(255,255,255,0.02)",
                  backdropFilter: "blur(12px)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  width: "72%",
                  aspectRatio: "1 / 1",
                  borderRadius: "50%",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  width: "52%",
                  aspectRatio: "1 / 1",
                  borderRadius: "50%",
                  border: "1px solid rgba(255,255,255,0.1)",
                  boxShadow: "0 0 80px rgba(130,182,255,0.12)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  width: 124,
                  height: 124,
                  borderRadius: 36,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.05))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 28px 60px rgba(0,0,0,0.2)",
                  backdropFilter: "blur(18px)",
                }}
              >
                <img src="/assets/logo.png" alt="聚给力" style={{ width: 62, height: 62, objectFit: "contain" }} />
              </div>
              <div
                style={{
                  position: "absolute",
                  top: "14%",
                  right: "12%",
                  width: 72,
                  height: 72,
                  borderRadius: 24,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.04)",
                  backdropFilter: "blur(12px)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: "10%",
                  bottom: "16%",
                  width: 92,
                  height: 92,
                  borderRadius: 28,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.03)",
                  backdropFilter: "blur(12px)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  right: "18%",
                  bottom: "12%",
                  width: 120,
                  height: 56,
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.04)",
                  backdropFilter: "blur(12px)",
                }}
              />
            </div>
          </div>
        </section>

        <section
          style={{
            borderRadius: 34,
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(15,18,26,0.9)",
            backdropFilter: "blur(30px) saturate(150%)",
            boxShadow: "0 34px 100px rgba(0,0,0,0.32)",
            padding: "34px 30px",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div
              style={{
                width: 58,
                height: 58,
                margin: "0 auto 12px",
                borderRadius: 20,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.05))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <img src="/assets/logo.png" alt="聚给力" style={{ width: 30, height: 30, objectFit: "contain" }} />
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.03em", color: "var(--text-primary)" }}>聚给力</div>
            <div style={{ marginTop: 6, fontSize: 13, color: "var(--text-muted)" }}>登录你的创作工作台</div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 6,
              marginBottom: 22,
              padding: 4,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.04)",
            }}
          >
            {(["login", "register"] as Tab[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => switchTab(item)}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 999,
                  color: tab === item ? "var(--text-primary)" : "var(--text-muted)",
                  background: tab === item ? "rgba(130,182,255,0.18)" : "transparent",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                {item === "login" ? "登录" : "注册"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Field label="用户名">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onFocus={() => setFocusedField("username")}
                onBlur={() => setFocusedField(null)}
                placeholder="请输入用户名"
                style={inputStyle("username")}
                autoComplete="username"
                autoFocus
              />
            </Field>

            <Field label="密码">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocusedField("password")}
                onBlur={() => setFocusedField(null)}
                placeholder="请输入密码"
                style={inputStyle("password")}
                autoComplete={tab === "login" ? "current-password" : "new-password"}
              />
            </Field>

            {tab === "register" && (
              <Field label="确认密码">
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onFocus={() => setFocusedField("confirmPassword")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="请再次输入密码"
                  style={inputStyle("confirmPassword")}
                  autoComplete="new-password"
                />
              </Field>
            )}

            {error && (
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 18,
                  border: "1px solid rgba(255,138,128,0.18)",
                  background: "rgba(255,138,128,0.08)",
                  color: "#ff9f97",
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            )}

            {success && (
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 18,
                  border: "1px solid rgba(138,230,195,0.18)",
                  background: "rgba(138,230,195,0.08)",
                  color: "var(--accent-green)",
                  fontSize: 13,
                }}
              >
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 4,
                padding: "14px 18px",
                borderRadius: 18,
                border: "1px solid rgba(130,182,255,0.2)",
                background: "linear-gradient(180deg, rgba(130,182,255,0.3), rgba(77,132,255,0.16))",
                color: "white",
                fontSize: 14,
                fontWeight: 650,
                boxShadow: "0 18px 36px rgba(77,132,255,0.18)",
                opacity: loading ? 0.65 : 1,
              }}
            >
              {loading ? "处理中..." : tab === "login" ? "进入工作台" : "创建账号"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>{label}</span>
      {children}
    </label>
  );
}
