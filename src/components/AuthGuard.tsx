"use client";

import { useEffect, useState } from "react";
import { authMe, type AuthUser } from "@/lib/api";

interface AuthGuardProps {
  children: (user: AuthUser) => React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    authMe()
      .then((res) => {
        if (cancelled) return;
        if (res.ok && res.user) {
          setUser(res.user);
          return;
        }
        window.location.replace("/login");
      })
      .finally(() => {
        if (!cancelled) {
          setChecking(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (checking || !user) {
    return (
      <div style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 12% 0%, rgba(105, 147, 255, 0.16), transparent 28%),"
          + "radial-gradient(circle at 82% 16%, rgba(255, 192, 93, 0.16), transparent 24%),"
          + "linear-gradient(180deg, #07111f 0%, #081523 38%, #0c1b2d 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
      }}>
        <img
          src="/assets/logo.png"
          alt=""
          style={{ width: 48, height: 48, objectFit: "contain", animation: "pulse-border 2s ease-in-out infinite", opacity: 0.9 }}
        />
        <span style={{
          fontSize: 18,
          fontWeight: 700,
          color: "var(--text-primary)",
          fontFamily: "'Noto Serif SC', serif",
          opacity: 0.8,
        }}>
          绘力聚合
        </span>
        <div style={{
          width: 28,
          height: 28,
          border: "2px solid var(--border)",
          borderTop: "2px solid var(--accent-yellow)",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
          marginTop: 8,
        }} />
      </div>
    );
  }

  return <>{children(user)}</>;
}
