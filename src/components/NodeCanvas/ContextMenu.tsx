"use client";

import { useEffect, useRef } from "react";

interface MenuItem {
  label: string;
  shortcut?: string;
  onClick: () => void;
  divider?: boolean;
  disabled?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: x,
        top: y,
        background: "#2a2a3a",
        border: "1px solid #444",
        borderRadius: 10,
        padding: "6px 0",
        minWidth: 200,
        boxShadow: "0 8px 30px rgba(0,0,0,0.4)",
        zIndex: 1000,
      }}
    >
      {items.map((item, i) => (
        <div key={i}>
          {item.divider && <div style={{ height: 1, background: "#444", margin: "4px 12px" }} />}
          <button
            onClick={() => { item.onClick(); onClose(); }}
            disabled={item.disabled}
            style={{
              width: "100%",
              padding: "8px 16px",
              background: "transparent",
              border: "none",
              color: item.disabled ? "#555" : "#ddd",
              fontSize: 13,
              textAlign: "left",
              cursor: item.disabled ? "default" : "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
            onMouseEnter={(e) => { if (!item.disabled) (e.target as HTMLElement).style.background = "#3a3a4e"; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "transparent"; }}
          >
            <span>{item.label}</span>
            {item.shortcut && <span style={{ color: "#666", fontSize: 11 }}>{item.shortcut}</span>}
          </button>
        </div>
      ))}
    </div>
  );
}
