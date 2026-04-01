"use client";
import { type ReactNode, useRef, useCallback, useState } from "react";

interface ResizableWrapperProps {
  children: ReactNode;
  blockKey: string;
  initialWidth: number;
  initialHeight?: number;
  minWidth?: number;
  minHeight?: number;
  onSizeChange?: (key: string, size: { width: number; height: number }) => void;
  /** 拖拽移动回调 — 传回画布坐标系下的增量 */
  onPositionChange?: (key: string, delta: { dx: number; dy: number }) => void;
}

export default function ResizableWrapper({
  children,
  blockKey,
  initialWidth,
  initialHeight,
  minWidth = 300,
  minHeight = 100,
  onSizeChange,
  onPositionChange,
}: ResizableWrapperProps) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const dragging = useRef(false);
  const startRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const [hovered, setHovered] = useState(false);

  // ── 拖拽移动 ──
  const handleDragMove = useCallback((e: React.MouseEvent) => {
    // 只响应左键
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const el = e.currentTarget as HTMLElement;
    const scale = getCanvasScale(el);
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;

    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      const s = getCanvasScale(el);
      const dx = (ev.clientX - startX) / s;
      const dy = (ev.clientY - startY) / s;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
      if (!moved) return;

      // 直接移动父容器（absolute 定位的 div）
      const parent = el.closest("[data-resizable-block]")?.parentElement;
      if (parent && parent.style.position === "absolute") {
        const origLeft = parseFloat(parent.getAttribute("data-orig-x") || parent.style.left) || 0;
        const origTop = parseFloat(parent.getAttribute("data-orig-y") || parent.style.top) || 0;
        if (!parent.getAttribute("data-orig-x")) {
          parent.setAttribute("data-orig-x", String(origLeft));
          parent.setAttribute("data-orig-y", String(origTop));
        }
        parent.style.left = `${origLeft + dx}px`;
        parent.style.top = `${origTop + dy}px`;
      }
    };

    const onUp = (ev: MouseEvent) => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);

      if (moved && onPositionChange) {
        const s = getCanvasScale(el);
        const dx = (ev.clientX - startX) / s;
        const dy = (ev.clientY - startY) / s;
        onPositionChange(blockKey, { dx: Math.round(dx), dy: Math.round(dy) });
      }
      // 清理临时属性
      const parent = el.closest("[data-resizable-block]")?.parentElement;
      if (parent) {
        parent.removeAttribute("data-orig-x");
        parent.removeAttribute("data-orig-y");
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [blockKey, onPositionChange]);

  // ── 右下角缩放 ──
  const handleResizeCorner = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;

    const el = (e.currentTarget as HTMLElement).parentElement!;
    const rect = el.getBoundingClientRect();
    const scale = getCanvasScale(el);
    startRef.current = {
      x: e.clientX,
      y: e.clientY,
      w: size?.width ?? initialWidth,
      h: size?.height ?? rect.height / scale,
    };

    document.body.style.cursor = "nwse-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const scale = getCanvasScale(el);
      const dx = (ev.clientX - startRef.current.x) / scale;
      const dy = (ev.clientY - startRef.current.y) / scale;
      const newW = Math.max(minWidth, startRef.current.w + dx);
      const newH = Math.max(minHeight, startRef.current.h + dy);
      const newSize = { width: Math.round(newW), height: Math.round(newH) };
      setSize(newSize);
      onSizeChange?.(blockKey, newSize);
    };

    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [blockKey, initialWidth, minWidth, minHeight, onSizeChange, size]);

  const currentWidth = size?.width ?? initialWidth;
  const currentHeight = size?.height;

  return (
    <div
      data-resizable-block={blockKey}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        width: currentWidth,
        height: currentHeight,
        overflow: currentHeight ? "auto" : undefined,
      }}
    >
      {/* 顶部拖拽移动条 */}
      <div
        onMouseDown={handleDragMove}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 24,
          cursor: "grab",
          zIndex: 11,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.15s",
        }}
      >
        {/* 拖拽把手图标（6 个小点） */}
        <svg width="24" height="8" viewBox="0 0 24 8" style={{ opacity: 0.5 }}>
          <circle cx="6" cy="2" r="1.2" fill="#888" />
          <circle cx="12" cy="2" r="1.2" fill="#888" />
          <circle cx="18" cy="2" r="1.2" fill="#888" />
          <circle cx="6" cy="6" r="1.2" fill="#888" />
          <circle cx="12" cy="6" r="1.2" fill="#888" />
          <circle cx="18" cy="6" r="1.2" fill="#888" />
        </svg>
      </div>

      {children}

      {/* 右下角拖拽手柄 */}
      <div
        onMouseDown={handleResizeCorner}
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          width: 16,
          height: 16,
          cursor: "nwse-resize",
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.15s",
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" style={{ opacity: 0.5 }}>
          <line x1="9" y1="1" x2="1" y2="9" stroke="#888" strokeWidth="1.2" />
          <line x1="9" y1="4" x2="4" y2="9" stroke="#888" strokeWidth="1.2" />
          <line x1="9" y1="7" x2="7" y2="9" stroke="#888" strokeWidth="1.2" />
        </svg>
      </div>
      {/* 右侧拖拽边 */}
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dragging.current = true;
          const el = (e.currentTarget as HTMLElement).parentElement!;
          const scale = getCanvasScale(el);
          startRef.current = {
            x: e.clientX,
            y: e.clientY,
            w: size?.width ?? initialWidth,
            h: size?.height ?? el.getBoundingClientRect().height / scale,
          };
          document.body.style.cursor = "ew-resize";
          document.body.style.userSelect = "none";

          const onMove = (ev: MouseEvent) => {
            if (!dragging.current) return;
            const s = getCanvasScale(el);
            const dx = (ev.clientX - startRef.current.x) / s;
            const newW = Math.max(minWidth, startRef.current.w + dx);
            const newSize = { width: Math.round(newW), height: size?.height ?? Math.round(startRef.current.h) };
            setSize(newSize);
            onSizeChange?.(blockKey, newSize);
          };
          const onUp = () => {
            dragging.current = false;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
          };
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        }}
        style={{
          position: "absolute",
          right: -2,
          top: 0,
          width: 5,
          height: "100%",
          cursor: "ew-resize",
          zIndex: 10,
          opacity: hovered ? 1 : 0,
        }}
      />
      {/* 底部拖拽边 */}
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dragging.current = true;
          const el = (e.currentTarget as HTMLElement).parentElement!;
          const scale = getCanvasScale(el);
          startRef.current = {
            x: e.clientX,
            y: e.clientY,
            w: size?.width ?? initialWidth,
            h: size?.height ?? el.getBoundingClientRect().height / scale,
          };
          document.body.style.cursor = "ns-resize";
          document.body.style.userSelect = "none";

          const onMove = (ev: MouseEvent) => {
            if (!dragging.current) return;
            const s = getCanvasScale(el);
            const dy = (ev.clientY - startRef.current.y) / s;
            const newH = Math.max(minHeight, startRef.current.h + dy);
            const newSize = { width: size?.width ?? Math.round(startRef.current.w), height: Math.round(newH) };
            setSize(newSize);
            onSizeChange?.(blockKey, newSize);
          };
          const onUp = () => {
            dragging.current = false;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
          };
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        }}
        style={{
          position: "absolute",
          left: 0,
          bottom: -2,
          width: "100%",
          height: 5,
          cursor: "ns-resize",
          zIndex: 10,
          opacity: hovered ? 1 : 0,
        }}
      />
    </div>
  );
}

/** 从 canvas transform 中提取缩放比例 */
function getCanvasScale(el: Element): number {
  let node: Element | null = el;
  while (node) {
    if (node.hasAttribute("data-canvas-content")) {
      const transform = (node as HTMLElement).style.transform;
      const match = transform.match(/scale\(([^)]+)\)/);
      if (match) return parseFloat(match[1]) || 1;
    }
    node = node.parentElement;
  }
  return 1;
}
