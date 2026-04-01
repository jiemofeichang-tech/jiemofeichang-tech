"use client";
import { useEffect } from "react";

interface VideoLightboxProps {
  src: string;
  onClose: () => void;
}

export default function VideoLightbox({ src, onClose }: VideoLightboxProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.92)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "zoom-out",
      }}
    >
      <video
        src={src}
        onClick={(e) => e.stopPropagation()}
        controls
        autoPlay
        style={{
          maxWidth: "90vw", maxHeight: "90vh",
          objectFit: "contain", borderRadius: 8,
          boxShadow: "0 0 40px rgba(0,0,0,0.8)",
          cursor: "default",
        }}
      />
      <button
        onClick={onClose}
        style={{
          position: "absolute", top: 16, right: 20,
          background: "none", border: "none",
          color: "#fff", fontSize: 28, cursor: "pointer", lineHeight: 1,
        }}
      >×</button>
    </div>
  );
}
