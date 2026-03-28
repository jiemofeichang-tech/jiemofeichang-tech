"use client";

import { useState } from "react";

export default function NotificationBanner() {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div
      style={{
        width: "100%",
        height: "var(--banner-height)",
        backgroundColor: "rgba(61, 46, 10, 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        fontSize: 13,
        color: "var(--accent-yellow)",
        position: "relative",
      }}
    >
      <span style={{ fontSize: 14 }}>🎉</span>
      <span>
        邀请好友赚积分！鼠标悬浮右上角头像-点击邀请好友立刻参与，每周都有码~
      </span>
      <button
        onClick={() => setVisible(false)}
        style={{
          position: "absolute",
          right: 16,
          color: "var(--text-muted)",
          fontSize: 18,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
