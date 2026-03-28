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
    // Temporary bypass for development
    const tempUser = { id: 1, username: "demo" };
    setUser(tempUser);
    setChecking(false);

    // Original auth code (commented out for development)
    /*
    authMe().then((res) => {
      if (res.ok && res.user) {
        setUser(res.user);
      } else {
        window.location.href = "/login";
      }
      setChecking(false);
    });
    */
  }, []);

  if (checking || !user) {
    return (
      <div style={{
        minHeight: "100vh",
        backgroundColor: "var(--bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <div style={{
          width: 32,
          height: 32,
          border: "3px solid var(--border)",
          borderTop: "3px solid var(--accent-pink)",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return <>{children(user)}</>;
}
