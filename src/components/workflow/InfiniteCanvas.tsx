"use client";

import React, { useRef, useState, useCallback, useEffect, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ViewportState {
  offsetX: number;
  offsetY: number;
  scale: number;
}

interface InfiniteCanvasProps {
  children: ReactNode;
  /** 点击画布空白区域时触发 */
  onBackgroundClick?: () => void;
  /** 内容边界尺寸（由 computeBounds 计算），用于动态内容层大小 */
  contentBounds?: { width: number; height: number };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_SCALE = 0.25;
const MAX_SCALE = 2.0;
const ZOOM_STEP = 0.1;
const GRID_BASE = 20; // px
const DEFAULT_BOUNDS = { width: 4000, height: 8000 };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function InfiniteCanvas({ children, onBackgroundClick, contentBounds }: InfiniteCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<ViewportState>({ offsetX: 0, offsetY: 0, scale: 0.85 });
  const viewportRef = useRef<ViewportState>(viewport);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const didPan = useRef(false);
  const spaceHeld = useRef(false);

  // Keep viewportRef in sync
  viewportRef.current = viewport;

  const bounds = contentBounds || DEFAULT_BOUNDS;

  // ── Touch state ──
  const touchState = useRef<{
    mode: "none" | "pan" | "pinch";
    startX: number;
    startY: number;
    startOx: number;
    startOy: number;
    startDist: number;
    startScale: number;
    startMidX: number;
    startMidY: number;
  }>({
    mode: "none",
    startX: 0, startY: 0,
    startOx: 0, startOy: 0,
    startDist: 0, startScale: 1,
    startMidX: 0, startMidY: 0,
  });

  // ── Wheel: zoom (Ctrl) / pan ──
  const handleWheel = useCallback((e: WheelEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const target = e.target as HTMLElement;

    // Skip events originating inside modal overlays (e.g. StylePickerModal).
    // These modals are DOM-children of the canvas container (due to React
    // composition) but visually sit above it with fixed positioning.
    // Without this guard, scrolling inside the modal would pan the canvas.
    if (target.closest('[role="dialog"], [data-modal-overlay]')) return;

    // Only handle events that originate inside this canvas container.
    if (!container.contains(target)) return;

    if (e.ctrlKey || e.metaKey) {
      // Zoom toward cursor — must preventDefault to avoid browser zoom
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;
      const zoomFactor = e.deltaY > 0 ? 0.92 : 1.08;

      setViewport((prev) => {
        const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * zoomFactor));
        const ratio = newScale / prev.scale;
        return {
          scale: newScale,
          offsetX: cursorX - (cursorX - prev.offsetX) * ratio,
          offsetY: cursorY - (cursorY - prev.offsetY) * ratio,
        };
      });
    } else {
      // Pan — preventDefault to avoid page scroll within the canvas area
      e.preventDefault();
      setViewport((prev) => ({
        ...prev,
        offsetX: prev.offsetX - (e.shiftKey ? e.deltaY : e.deltaX),
        offsetY: prev.offsetY - (e.shiftKey ? 0 : e.deltaY),
      }));
    }
  }, []);

  // Attach wheel with passive: false
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // Prevent the container from being scrolled by external actions
  // (e.g. scrollIntoView from modal children, browser focus-scroll).
  // The canvas uses CSS transforms for panning, so native scroll must stay at 0.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const resetScroll = () => {
      if (el.scrollLeft !== 0 || el.scrollTop !== 0) {
        el.scrollLeft = 0;
        el.scrollTop = 0;
      }
    };
    el.addEventListener("scroll", resetScroll);
    return () => el.removeEventListener("scroll", resetScroll);
  }, []);

  // ── Middle-click pan / space+drag pan ──
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Middle button or space+left button
      if (e.button !== 1 && !(e.button === 0 && spaceHeld.current)) return;
      e.preventDefault();
      isPanning.current = true;
      didPan.current = false;
      const vp = viewportRef.current;
      panStart.current = { x: e.clientX, y: e.clientY, ox: vp.offsetX, oy: vp.offsetY };
    },
    [],
  );

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return;
    didPan.current = true;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setViewport((prev) => ({
      ...prev,
      offsetX: panStart.current.ox + dx,
      offsetY: panStart.current.oy + dy,
    }));
  }, []);

  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  // ── Click on background → deselect ──
  // Fires on the outer container; if user clicked a card child, the event
  // target won't be the container or the content layer.
  const handleContainerClick = useCallback(
    (e: React.MouseEvent) => {
      if (didPan.current) return;
      const target = e.target as HTMLElement;
      // Only fire if clicking the container itself, the grid bg, or the content layer
      // (i.e. not a card or interactive element)
      if (
        target === containerRef.current ||
        target.dataset.canvasGrid !== undefined ||
        target.dataset.canvasContent !== undefined
      ) {
        onBackgroundClick?.();
      }
    },
    [onBackgroundClick],
  );

  // ── Touch: single-finger pan, two-finger pinch ──
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Skip touch handling for interactive elements so buttons/inputs work normally
    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, textarea, a, [role="button"], label')) {
      touchState.current.mode = "none";
      return;
    }

    if (e.touches.length === 1) {
      const t = e.touches[0];
      const vp = viewportRef.current;
      touchState.current = {
        mode: "pan",
        startX: t.clientX,
        startY: t.clientY,
        startOx: vp.offsetX,
        startOy: vp.offsetY,
        startDist: 0,
        startScale: vp.scale,
        startMidX: 0,
        startMidY: 0,
      };
    } else if (e.touches.length === 2) {
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const rect = containerRef.current!.getBoundingClientRect();
      const midX = (t1.clientX + t2.clientX) / 2 - rect.left;
      const midY = (t1.clientY + t2.clientY) / 2 - rect.top;
      const vp = viewportRef.current;
      touchState.current = {
        mode: "pinch",
        startX: 0,
        startY: 0,
        startOx: vp.offsetX,
        startOy: vp.offsetY,
        startDist: dist,
        startScale: vp.scale,
        startMidX: midX,
        startMidY: midY,
      };
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const ts = touchState.current;
    // Don't preventDefault when not in pan/pinch mode (interactive elements need it)
    if (ts.mode === "none") return;
    e.preventDefault();

    if (ts.mode === "pan" && e.touches.length === 1) {
      const t = e.touches[0];
      const dx = t.clientX - ts.startX;
      const dy = t.clientY - ts.startY;
      setViewport((prev) => ({
        ...prev,
        offsetX: ts.startOx + dx,
        offsetY: ts.startOy + dy,
      }));
    } else if (ts.mode === "pinch" && e.touches.length === 2) {
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const ratio = dist / ts.startDist;
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, ts.startScale * ratio));
      const scaleRatio = newScale / ts.startScale;
      setViewport({
        scale: newScale,
        offsetX: ts.startMidX - (ts.startMidX - ts.startOx) * scaleRatio,
        offsetY: ts.startMidY - (ts.startMidY - ts.startOy) * scaleRatio,
      });
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    touchState.current.mode = "none";
  }, []);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Space held → enable drag mode
      if (e.code === "Space" && !e.repeat) {
        // Only if not typing in an input/textarea
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        spaceHeld.current = true;
      }

      const isCmd = e.ctrlKey || e.metaKey;
      if (!isCmd) return;

      if (e.key === "0") {
        e.preventDefault();
        setViewport({ offsetX: 0, offsetY: 0, scale: 0.85 });
      } else if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        setViewport((p) => ({ ...p, scale: Math.min(MAX_SCALE, p.scale + ZOOM_STEP) }));
      } else if (e.key === "-") {
        e.preventDefault();
        setViewport((p) => ({ ...p, scale: Math.max(MIN_SCALE, p.scale - ZOOM_STEP) }));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceHeld.current = false;
        isPanning.current = false;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // ── Toolbar actions ──
  const zoomIn = () =>
    setViewport((p) => ({ ...p, scale: Math.min(MAX_SCALE, p.scale + ZOOM_STEP) }));
  const zoomOut = () =>
    setViewport((p) => ({ ...p, scale: Math.max(MIN_SCALE, p.scale - ZOOM_STEP) }));
  const resetView = () => {
    setViewport({ offsetX: 0, offsetY: 0, scale: 0.85 });
    if (containerRef.current) {
      containerRef.current.scrollLeft = 0;
      containerRef.current.scrollTop = 0;
    }
  };

  // ── Grid background ──
  const gridSize = GRID_BASE * viewport.scale;
  const gridOffX = viewport.offsetX % gridSize;
  const gridOffY = viewport.offsetY % gridSize;

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "clip",
        background: "#0d0d14",
        cursor: spaceHeld.current || isPanning.current ? "grabbing" : "default",
        touchAction: "none",
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleContainerClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Dot grid background */}
      <div
        data-canvas-grid=""
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          backgroundImage: "radial-gradient(circle, #374151 1px, transparent 1px)",
          backgroundSize: `${gridSize}px ${gridSize}px`,
          backgroundPosition: `${gridOffX}px ${gridOffY}px`,
          opacity: 0.4,
        }}
      />

      {/* Content layer (transformed) */}
      <div
        data-canvas-content=""
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          transformOrigin: "0 0",
          transform: `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.scale})`,
          width: bounds.width,
          height: bounds.height,
        }}
      >
        {children}
      </div>

      {/* Fixed toolbar (bottom-right) */}
      <div
        style={{
          position: "absolute",
          bottom: 16,
          right: 16,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          background: "#1e1e2e",
          border: "1px solid #333",
          borderRadius: 12,
          padding: 8,
          boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
          zIndex: 50,
        }}
      >
        <ToolBtn label="+" onClick={zoomIn} title="放大 (Ctrl+=)" />
        <div style={{ textAlign: "center", fontSize: 11, color: "#888", padding: "2px 0" }}>
          {Math.round(viewport.scale * 100)}%
        </div>
        <ToolBtn label="−" onClick={zoomOut} title="缩小 (Ctrl+-)" />
        <div style={{ height: 1, background: "#333", margin: "2px 4px" }} />
        <ToolBtn label="⊕" onClick={resetView} title="重置视图 (Ctrl+0)" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar button
// ---------------------------------------------------------------------------

function ToolBtn({ label, onClick, title }: { label: string; onClick: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 32,
        height: 32,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 18,
        color: "#ccc",
        background: "transparent",
        border: "none",
        borderRadius: 8,
        cursor: "pointer",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#333")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {label}
    </button>
  );
}
