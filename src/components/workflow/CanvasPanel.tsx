"use client";

import { useMemo, useCallback, useRef, useState, useEffect } from "react";
import { useWorkflowStore } from "@/lib/store";
import InfiniteCanvas from "./InfiniteCanvas";
import { computeLayout, computeBounds, type LayoutBlock } from "./canvasLayout";
import ResizableWrapper from "./ResizableWrapper";

// Canvas card sub-components
import ScriptBlock from "./canvas/ScriptBlock";
import StyleConfigStep from "./StyleConfigStep";
import CharacterCard from "./canvas/CharacterCard";
import StoryboardGrid from "./canvas/StoryboardGrid";
import VideoGrid from "./canvas/VideoGrid";
import PostProduction from "./canvas/PostProduction";
import StageConfirmBar from "./canvas/StageConfirmBar";
import EditPanel from "./EditPanel";

// ---------------------------------------------------------------------------
// Section label rendered on canvas
// ---------------------------------------------------------------------------

function SectionLabel({ text, x, y, width }: { text: string; x: number; y: number; width: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        fontSize: 12,
        color: "#666",
        borderBottom: "1px solid #222",
        paddingBottom: 4,
        userSelect: "none",
        pointerEvents: "none",
      }}
    >
      ── {text} ──
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generate character images button (inline)
// ---------------------------------------------------------------------------

function GenerateAssetsBtn({
  onGenerateAll,
  onGenerateCharsOnly,
  disabled,
  progress,
}: {
  onGenerateAll: () => void;
  onGenerateCharsOnly: () => void;
  disabled: boolean;
  progress: { total: number; completed: number; current: string } | null;
}) {
  return (
    <div
      style={{
        background: "#1e1e2e",
        borderRadius: 12,
        padding: 20,
        textAlign: "center",
        color: "#555",
        fontSize: 13,
        border: "1px dashed #333",
      }}
    >
      {progress ? (
        <>
          <div style={{ color: "#f0c040", marginBottom: 8 }}>
            {progress.current}
          </div>
          <div style={{ width: "100%", height: 6, background: "#333", borderRadius: 3, overflow: "hidden" }}>
            <div
              style={{
                width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%`,
                height: "100%",
                background: "#7c3aed",
                borderRadius: 3,
                transition: "width 0.3s",
              }}
            />
          </div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
            {progress.completed}/{progress.total}
          </div>
        </>
      ) : (
        <>
          剧本分析完成后，生成全部资产（角色三视图+表情图+场景六视图）
          <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "center" }}>
            <button
              onClick={onGenerateAll}
              disabled={disabled}
              style={{
                padding: "8px 20px",
                borderRadius: 8,
                border: "none",
                background: disabled ? "#444" : "#7c3aed",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              一键生成全部资产
            </button>
            <button
              onClick={onGenerateCharsOnly}
              disabled={disabled}
              style={{
                padding: "8px 20px",
                borderRadius: 8,
                border: "none",
                background: disabled ? "#444" : "transparent",
                color: disabled ? "#666" : "#ccc",
                fontSize: 13,
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: "#555",
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              仅生成角色三视图
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function AssetLockBar({
  status,
  onLock,
  onUnlock,
  onGenerateStoryboard,
  disabled,
}: {
  status: string;
  onLock: () => void;
  onUnlock: () => void;
  onGenerateStoryboard?: () => void;
  disabled: boolean;
}) {
  const isLocked = status === "assets_locked";
  return (
    <div
      style={{
        background: isLocked ? "#1a2e1a" : "#1e1e2e",
        borderRadius: 10,
        padding: "10px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        border: isLocked ? "1px solid #4ade80" : "1px dashed #555",
      }}
    >
      <span style={{ fontSize: 13, color: isLocked ? "#4ade80" : "#aaa" }}>
        {isLocked ? "资产已锁定 — 可进入分镜/视频阶段" : "全部审核通过后可锁定资产"}
      </span>
      <div style={{ display: "flex", gap: 8 }}>
      {isLocked && onGenerateStoryboard && (
        <button
          onClick={onGenerateStoryboard}
          disabled={disabled}
          style={{
            padding: "6px 16px",
            borderRadius: 6,
            border: "none",
            background: disabled ? "#444" : "#2563eb",
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          生成分镜图
        </button>
      )}
      {isLocked ? (
        <button
          onClick={onUnlock}
          disabled={disabled}
          style={{
            padding: "6px 16px",
            borderRadius: 6,
            border: "1px solid #f87171",
            background: "transparent",
            color: "#f87171",
            fontSize: 12,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          解锁
        </button>
      ) : (
        <button
          onClick={onLock}
          disabled={disabled}
          style={{
            padding: "6px 16px",
            borderRadius: 6,
            border: "none",
            background: disabled ? "#444" : "#4ade80",
            color: "#111",
            fontSize: 12,
            fontWeight: 600,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          锁定资产
        </button>
      )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main CanvasPanel — orchestrates InfiniteCanvas + layout + content
// ---------------------------------------------------------------------------

export default function CanvasPanel() {
  const {
    project,
    selectedBlock,
    chatLoading,
    stageProgress,
    assetGenProgress,
    stageStatuses,
    workflowMode,
    setSelectedBlock,
    setStage,
    setSubtitlesSrt,
    generateCharacterImages,
    generateStoryboardImages,
    generateVideos,
    generateSingleSceneImages,
    regenerateSingleStoryboard,
    regenerateSingleVideo,
    regenerateCharacterAction,
    setFinalOutput,
    updateProjectData,
    sendMessage,
    addSystemMessage,
    regenerateScript,
    // Step 4 审核 + 锁定
    generateAllAssetsAction,
    regenerateViewAction,
    approveView,
    uploadReplacementView,
    lockAssets,
    unlockAssets,
    loadProject,
    updateScriptAnalysis,
    // Step 2 风格配置
    setStyleConfig,
    // 新增
    confirmStage,
    openEditPanel,
    fillMissingVisualPrompts,
  } = useWorkflowStore();

  // ── AI model & Video provider switching ──
  const [chatModel, setChatModel] = useState<string>("claude-opus-4-6");
  const [videoProvider, setVideoProvider] = useState<string>("gemini");
  useEffect(() => {
    fetch("/api/config", { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.aiConfig?.videoProvider) setVideoProvider(d.aiConfig.videoProvider);
        if (d?.aiConfig?.chatModel) setChatModel(d.aiConfig.chatModel);
      })
      .catch(() => {});
  }, []);
  const switchVideoProvider = useCallback((provider: string) => {
    setVideoProvider(provider);
    fetch("/api/session/key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ aiVideoProvider: provider }),
    }).catch(() => {});
  }, []);
  const switchChatModel = useCallback((model: string) => {
    setChatModel(model);
    fetch("/api/session/key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ aiChatModel: model }),
    }).catch(() => {});
  }, []);

  // ── Measured heights from ResizeObserver ──
  const [measuredHeights, setMeasuredHeights] = useState<Map<string, number>>(new Map());
  const observersRef = useRef<Map<string, { ro: ResizeObserver; el: Element }>>(new Map());

  // ── 用户手动调整的尺寸 ──
  const [customSizes, setCustomSizes] = useState<Map<string, { width: number; height: number }>>(new Map());
  const handleSizeChange = useCallback((key: string, size: { width: number; height: number }) => {
    setCustomSizes((prev) => {
      const next = new Map(prev);
      next.set(key, size);
      return next;
    });
  }, []);

  // ── 用户手动拖拽的位置偏移 ──
  const [customPositions, setCustomPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const handlePositionChange = useCallback((key: string, delta: { dx: number; dy: number }) => {
    setCustomPositions((prev) => {
      const next = new Map(prev);
      const old = prev.get(key) || { x: 0, y: 0 };
      next.set(key, { x: old.x + delta.dx, y: old.y + delta.dy });
      return next;
    });
  }, []);

  // 清理所有 ResizeObserver
  useEffect(() => {
    return () => {
      observersRef.current.forEach(({ ro }) => ro.disconnect());
      observersRef.current.clear();
    };
  }, []);

  const handleResize = useCallback((key: string, height: number) => {
    setMeasuredHeights((prev) => {
      const rounded = Math.round(height);
      if (prev.get(key) === rounded) return prev;
      const next = new Map(prev);
      next.set(key, rounded);
      return next;
    });
  }, []);

  // 安全创建 ResizeObserver 的 ref 回调工厂
  const makeResizeRef = useCallback((key: string) => (el: HTMLDivElement | null) => {
    const existing = observersRef.current.get(key);
    if (existing) {
      if (existing.el === el) return; // 同一个元素，无需重建
      existing.ro.disconnect();
      observersRef.current.delete(key);
    }
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      handleResize(key, Math.round(entry.borderBoxSize[0].blockSize));
    });
    ro.observe(el);
    observersRef.current.set(key, { ro, el });
  }, [handleResize]);

  // ── Compute layout ──
  const layout = useMemo(() => {
    if (!project) return [];
    const hasAnalysis = !!project.script.analysis;
    return computeLayout({
      hasScript: hasAnalysis || !!project.script.raw_input,
      showStyleConfig: hasAnalysis,
      styleConfigDone: !!project.style_config,
      characterIds: project.characters.map((c) => c.id),
      showGenerateAssets: hasAnalysis && (
        project.characters.length === 0 ||
        project.characters.every((c) => !c.front_view && !c.side_view && !c.back_view)
      ),
      showAssetLock:
        project.characters.length > 0 &&
        project.characters.some((c) => c.status === "done"),
      hasStoryboard: project.episodes.length > 0 || project.characters.length > 0,
      hasVideos:
        project.episodes.length > 0 &&
        project.episodes.some((ep) => ep.shots.some((s) => s.storyboard_image)),
      hasPostProduction: project.episodes.some((ep) => ep.shots.some((s) => s.video_url)),
      measuredHeights,
      stageStatuses,
      workflowMode,
      customSizes,
    });
  }, [project, measuredHeights, stageStatuses, workflowMode, customSizes]);

  // ── Content bounds for InfiniteCanvas (含自定义位置偏移) ──
  const contentBounds = useMemo(() => {
    if (layout.length === 0) return { width: 800, height: 600 };
    let maxX = 0, maxY = 0;
    for (const b of layout) {
      const offset = customPositions.get(b.key);
      const bx = b.x + (offset?.x ?? 0) + b.width;
      const by = b.y + (offset?.y ?? 0) + b.height;
      if (bx > maxX) maxX = bx;
      if (by > maxY) maxY = by;
    }
    return { width: maxX + 800, height: maxY + 800 };
  }, [layout, customPositions]);

  // ── Handlers (preserved from original CanvasPanel) ──

  const handleEditScript = () => {
    openEditPanel({ type: "script", id: "script" });
    setStage("script");
    addSystemMessage('已选中剧本进行编辑。你可以在右侧面板直接修改，也可以在对话中告诉我想要修改的内容。');
  };

  const handleRegenerateScript = () => {
    setStage("script");
    setSelectedBlock({ type: "script", id: "script", label: "剧本" });
    regenerateScript();
  };

  const handleEditCharacter = (charId: string, charName: string) => {
    openEditPanel({ type: "character", id: charId });
    setStage("character");
    addSystemMessage(`已选中角色「${charName}」进行编辑。你可以在右侧面板直接修改，也可以在对话中描述修改需求。`);
  };

  const handleRegenerateCharacter = (charId: string) => {
    const char = project?.characters.find((c) => c.id === charId);
    if (!char) return;
    addSystemMessage(`正在重新生成角色「${char.name}」的三视图...`);
    // 直接执行重新生成，与分镜/视频行为一致
    regenerateCharacterAction(charId);
  };

  const handleEditShot = (episodeId: string, shotId: string) => {
    openEditPanel({ type: "shot", id: shotId, episodeId });
    setStage("storyboard");
    addSystemMessage(`已选中镜头进行编辑。你可以在右侧面板直接修改，也可以在对话中描述修改需求。`);
  };

  const handleRegenerateShot = (episodeId: string, shotId: string) => {
    regenerateSingleStoryboard(episodeId, shotId);
  };

  const handleEditVideo = (episodeId: string, shotId: string) => {
    openEditPanel({ type: "shot", id: shotId, episodeId });
    setStage("video");
    addSystemMessage(`已选中视频进行编辑。你可以在右侧面板直接修改，也可以在对话中描述修改需求。`);
  };

  const handleRegenerateVideo = (episodeId: string, shotId: string) => {
    regenerateSingleVideo(episodeId, shotId);
  };

  const handleBackgroundClick = useCallback(() => {
    setSelectedBlock(null);
  }, [setSelectedBlock]);

  // ── Loading state ──
  if (!project) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
        加载中...
      </div>
    );
  }

  // ── Helper to find a layout block (with custom position offset applied) ──
  const findBlock = (key: string) => {
    const b = layout.find((b) => b.key === key);
    if (!b) return null;
    const offset = customPositions.get(key);
    if (!offset) return b;
    return { ...b, x: b.x + offset.x, y: b.y + offset.y };
  };

  // ── Render ──
  return (
    <>
    <InfiniteCanvas onBackgroundClick={handleBackgroundClick} contentBounds={contentBounds}>
      {/* Section labels */}
      {layout
        .filter((b) => b.type === "section-label")
        .map((b) => {
          // 找到对应的内容块 key 来获取位置偏移
          const contentKey = b.key.replace("section-", "");
          const keyMap: Record<string, string> = { "剧本分析": "script", "角色设计": "character", "分镜图": "storyboard", "视频生成": "video", "后期合成": "post" };
          const offset = customPositions.get(keyMap[contentKey] || contentKey);
          const x = b.x + (offset?.x ?? 0);
          const y = b.y + (offset?.y ?? 0);
          return <SectionLabel key={b.key} text={contentKey} x={x} y={y} width={b.width} />;
        })}

      {/* ── Script ── */}
      {(() => {
        const b = findBlock("script");
        if (!b) return null;
        return (
          <div style={{ position: "absolute", left: b.x, top: b.y }}>
            {/* AI 模型切换 */}
            <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap", alignItems: "center", position: "relative", zIndex: 10 }}>
              <span style={{ fontSize: 10, color: "#666", marginRight: 4 }}>AI模型:</span>
              {[
                { key: "claude-opus-4-6", label: "Opus 4.6" },
                { key: "claude-sonnet-4-6", label: "Sonnet 4.6" },
                { key: "gemini-2.5-pro", label: "Gemini Pro" },
              ].map((m) => (
                <button
                  key={m.key}
                  onClick={() => switchChatModel(m.key)}
                  style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    border: chatModel === m.key ? "1px solid #7c3aed" : "1px solid #444",
                    background: chatModel === m.key ? "#7c3aed22" : "transparent",
                    color: chatModel === m.key ? "#c084fc" : "#888",
                    fontSize: 10,
                    cursor: "pointer",
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <ResizableWrapper blockKey="script" initialWidth={b.width} onSizeChange={handleSizeChange} onPositionChange={handlePositionChange}>
            <ScriptBlock
              analysis={project.script.analysis}
              rawInput={project.script.raw_input}
              onEdit={handleEditScript}
              onRegenerate={handleRegenerateScript}
              onUpdateAnalysis={updateScriptAnalysis}
              blockKey="script"
              onResize={handleResize}
              isGenerating={chatLoading && stageProgress?.stage === "剧本分析"}
              progress={stageProgress?.stage === "剧本分析" ? stageProgress.percent : undefined}
              progressText={stageProgress?.stage === "剧本分析" ? stageProgress.step : undefined}
            />
            {/* 风格配置（合并到剧本阶段下方） */}
            {project.script?.analysis && (
              <div style={{ marginTop: 16, background: "#1e1e2e", borderRadius: 12, border: project.style_config ? "1px solid #4ade80" : "1px dashed #7c3aed", padding: 16 }}>
                {project.style_config && selectedBlock?.id !== "style-config" ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#4ade80", marginBottom: 4 }}>✓ 风格已配置</div>
                      <div style={{ fontSize: 12, color: "#999" }}>
                        {project.style_config.art_substyle} · {project.style_config.aspect_ratio} · {project.style_config.duration_sec}s · {project.style_config.episode_count || "?"}集
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedBlock({ type: "style", id: "style-config", label: "编辑风格" })}
                      style={{ fontSize: 12, padding: "4px 12px", borderRadius: 6, border: "1px solid #555", background: "transparent", color: "#ccc", cursor: "pointer" }}
                    >
                      修改
                    </button>
                  </div>
                ) : (
                  <StyleConfigStep
                    initialConfig={project.style_config || null}
                    scriptContent={project.script.raw_input || ""}
                    onSave={(config) => {
                      setStyleConfig(config);
                      setSelectedBlock(null);
                    }}
                  />
                )}
              </div>
            )}
            </ResizableWrapper>
          </div>
        );
      })()}

      {/* Style Config 已合并到 script block 内 */}

      {/* ── Generate Assets Button ── */}
      {(() => {
        const b = findBlock("generate-assets");
        if (!b) return null;
        return (
          <div style={{ position: "absolute", left: b.x, top: b.y }}>
            <ResizableWrapper blockKey="generate-assets" initialWidth={b.width} onSizeChange={handleSizeChange} onPositionChange={handlePositionChange}>
            <GenerateAssetsBtn
              onGenerateAll={() => generateAllAssetsAction()}
              onGenerateCharsOnly={() => generateCharacterImages()}
              disabled={chatLoading}
              progress={assetGenProgress}
            />
            </ResizableWrapper>
          </div>
        );
      })()}

      {/* ── Characters ── */}
      {project.characters.map((char) => {
            const b = findBlock(`character-${char.id}`);
            if (!b) return null;
            const isLocked = project.status === "assets_locked";
            return (
              <div key={char.id} style={{ position: "absolute", left: b.x, top: b.y }}>
                <ResizableWrapper blockKey={`character-${char.id}`} initialWidth={b.width} onSizeChange={handleSizeChange} onPositionChange={handlePositionChange}>
                <CharacterCard
                  character={char}
                  onEdit={() => handleEditCharacter(char.id, char.name)}
                  onRegenerate={() => handleRegenerateCharacter(char.id)}
                  isSelected={selectedBlock?.type === "character" && selectedBlock.id === char.id}
                  blockKey={`character-${char.id}`}
                  onResize={handleResize}
                  locked={isLocked}
                  onApproveView={(cid, vk) => approveView("character", cid, vk)}
                  onRegenerateView={(cid, vk) => regenerateViewAction("character", cid, vk)}
                  onUploadReplacement={(cid, vk, data) => uploadReplacementView("character", cid, vk, data)}
                  onEditPrompt={(cid, vk) => {
                    setStage("character");
                    setSelectedBlock({ type: "character", id: cid, label: `编辑 ${vk} 提示词` });
                  }}
                />
                </ResizableWrapper>
              </div>
            );
          })}


      {/* ── 资产锁定栏 ── */}
      {(() => {
        const b = findBlock("asset-lock");
        if (!b) return null;
        return (
          <div style={{ position: "absolute", left: b.x, top: b.y }}>
            <ResizableWrapper blockKey="asset-lock" initialWidth={b.width} onSizeChange={handleSizeChange} onPositionChange={handlePositionChange}>
            <AssetLockBar
              status={project.status}
              onLock={lockAssets}
              onUnlock={unlockAssets}
              onGenerateStoryboard={() => generateStoryboardImages()}
              disabled={chatLoading}
            />
            </ResizableWrapper>
          </div>
        );
      })()}

      {/* ── Storyboard ── */}
      {(() => {
        const b = findBlock("storyboard");
        if (!b) return null;
        return (
          <div style={{ position: "absolute", left: b.x, top: b.y }}>
            <ResizableWrapper blockKey="storyboard" initialWidth={b.width} onSizeChange={handleSizeChange} onPositionChange={handlePositionChange}>
            <div
              style={{
                background: "#1e1e2e",
                borderRadius: 12,
                border: "1px solid #333",
                padding: 16,
                width: "100%",
                boxSizing: "border-box",
              }}
              ref={makeResizeRef("storyboard")}
            >
              {/* Batch generate / regenerate buttons */}
              {project.episodes.length > 0 && (
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 8 }}>
                    {project.episodes.some((ep) => ep.shots.some((s) => !s.storyboard_image)) && (
                      <button
                        onClick={() => generateStoryboardImages()}
                        disabled={chatLoading}
                        style={{
                          padding: "4px 14px",
                          borderRadius: 6,
                          border: "none",
                          background: chatLoading ? "#444" : "#2563eb",
                          color: "#fff",
                          fontSize: 11,
                          cursor: chatLoading ? "not-allowed" : "pointer",
                        }}
                      >
                        批量生成分镜图
                      </button>
                    )}
                    {project.episodes.some((ep) => ep.shots.some((s) => s.storyboard_image)) && (
                      <button
                        onClick={() => {
                          // 清空所有分镜图后重新生成
                          const eps = project.episodes.map((ep) => ({
                            ...ep,
                            shots: ep.shots.map((s) => ({ ...s, storyboard_image: "" })),
                          }));
                          updateProjectData({ episodes: eps });
                          setTimeout(() => generateStoryboardImages(), 100);
                        }}
                        disabled={chatLoading}
                        style={{
                          padding: "4px 14px",
                          borderRadius: 6,
                          border: "1px solid #f59e0b",
                          background: "transparent",
                          color: "#f59e0b",
                          fontSize: 11,
                          cursor: chatLoading ? "not-allowed" : "pointer",
                        }}
                      >
                        重新生成全部分镜
                      </button>
                    )}
                  </div>
                )}
              <StoryboardGrid
                episodes={project.episodes}
                onEditShot={handleEditShot}
                onRegenerateShot={handleRegenerateShot}
                onApproveShot={(epId, shotId) => {
                  const eps = project.episodes.map((ep) =>
                    ep.id === epId
                      ? { ...ep, shots: ep.shots.map((shot) =>
                          shot.id === shotId ? { ...shot, approved: true } : shot
                        )}
                      : ep
                  );
                  updateProjectData({ episodes: eps });
                }}
                onUpdatePrompt={(epId, shotId, prompt) => {
                  const eps = project.episodes.map((ep) =>
                    ep.id === epId
                      ? { ...ep, shots: ep.shots.map((shot) =>
                          shot.id === shotId ? { ...shot, prompt, raw_description: prompt } : shot
                        )}
                      : ep
                  );
                  updateProjectData({ episodes: eps });
                  handleRegenerateShot(epId, shotId);
                }}
                selectedShotId={selectedBlock?.type === "shot" ? selectedBlock.id.split("/")[1] : null}
              />
            </div>
            </ResizableWrapper>
          </div>
        );
      })()}

      {/* ── Videos ── */}
      {(() => {
        const b = findBlock("video");
        if (!b) return null;
        return (
          <div style={{ position: "absolute", left: b.x, top: b.y }}>
            <ResizableWrapper blockKey="video" initialWidth={b.width} onSizeChange={handleSizeChange} onPositionChange={handlePositionChange}>
            <div
              style={{
                background: "#1e1e2e",
                borderRadius: 12,
                border: "1px solid #333",
                padding: 16,
                width: "100%",
                boxSizing: "border-box",
              }}
              ref={makeResizeRef("video")}
            >
              {/* Video provider selector + Batch generate button */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ marginRight: "auto", display: "flex", gap: 4 }}>
                  {[
                    { key: "jimeng", label: "即梦 3.0" },
                    { key: "gemini", label: "Veo 3.1" },
                  ].map((p) => (
                    <button
                      key={p.key}
                      onClick={() => switchVideoProvider(p.key)}
                      style={{
                        padding: "3px 10px",
                        borderRadius: 5,
                        border: videoProvider === p.key ? "1px solid #7c3aed" : "1px solid #444",
                        background: videoProvider === p.key ? "#7c3aed22" : "transparent",
                        color: videoProvider === p.key ? "#c084fc" : "#888",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      {p.label}
                    </button>
                  ))
                  }
                </div>
                <button
                  onClick={() => fillMissingVisualPrompts(true)}
                  disabled={chatLoading}
                  title="重新生成所有镜头的 visual_prompt（跨集不重复）"
                  style={{
                    padding: "4px 14px",
                    borderRadius: 6,
                    border: "1px solid #f59e0b",
                    background: "transparent",
                    color: "#fbbf24",
                    fontSize: 11,
                    cursor: chatLoading ? "not-allowed" : "pointer",
                    opacity: chatLoading ? 0.5 : 1,
                  }}
                >
                  重生提示词
                </button>
                {project.episodes.some((ep) => ep.shots.some((s) => !s.visual_prompt)) && (
                  <button
                    onClick={() => fillMissingVisualPrompts()}
                    disabled={chatLoading}
                    title="对 visual_prompt 为空的镜头，调用 AI 批量补填"
                    style={{
                      padding: "4px 14px",
                      borderRadius: 6,
                      border: "1px solid #7c3aed",
                      background: "transparent",
                      color: "#c084fc",
                      fontSize: 11,
                      cursor: chatLoading ? "not-allowed" : "pointer",
                      opacity: chatLoading ? 0.5 : 1,
                    }}
                  >
                    AI 补填提示词
                  </button>
                )}
                {!project.episodes.some((ep) => ep.shots.some((s) => s.video_url)) && (
                  <button
                    onClick={() => generateVideos()}
                    disabled={chatLoading}
                    style={{
                      padding: "4px 14px",
                      borderRadius: 6,
                      border: "none",
                      background: chatLoading ? "#444" : "#059669",
                      color: "#fff",
                      fontSize: 11,
                      cursor: chatLoading ? "not-allowed" : "pointer",
                    }}
                  >
                    批量生成视频
                  </button>
                )}
              </div>
              <VideoGrid
                episodes={project.episodes}
                onEditShot={handleEditVideo}
                onRegenerateVideo={handleRegenerateVideo}
                onApproveVideo={(epId, shotId) => {
                  const eps = project.episodes.map((ep) =>
                    ep.id === epId
                      ? { ...ep, shots: ep.shots.map((shot) =>
                          shot.id === shotId ? { ...shot, video_approved: true } : shot
                        )}
                      : ep
                  );
                  updateProjectData({ episodes: eps });
                }}
              />
            </div>
            </ResizableWrapper>
          </div>
        );
      })()}

      {/* ── Post-production ── */}
      {(() => {
        const b = findBlock("post");
        if (!b) return null;
        return (
          <div style={{ position: "absolute", left: b.x, top: b.y }}>
            <ResizableWrapper blockKey="post" initialWidth={b.width} onSizeChange={handleSizeChange} onPositionChange={handlePositionChange}>
            <div
              style={{
                background: "#1e1e2e",
                borderRadius: 12,
                border: "1px solid #333",
                padding: 16,
                width: "100%",
                boxSizing: "border-box",
              }}
              ref={makeResizeRef("post")}
            >
              <PostProduction
                projectId={project.id}
                projectStatus={project.status}
                subtitlesSrt={project.post_production.subtitles_srt}
                finalOutput={project.post_production.final_output}
                composeProgress={project.post_production.compose_progress}
                lastError={project.post_production.last_error}
                composeConfig={project.post_production.compose_config}
                onSubtitlesChange={(srt) => {
                  setSubtitlesSrt(srt);
                  updateProjectData({ post_production: { ...project.post_production, subtitles_srt: srt } });
                }}
                onRenderComplete={(url) => setFinalOutput(url)}
                onStatusChange={(status) => {
                  if (status === "done" || status === "compositing_failed") {
                    loadProject(project.id);
                  }
                }}
              />
            </div>
            </ResizableWrapper>
          </div>
        );
      })()}

      {/* ── Stage Confirm Bars ── */}
      {layout
        .filter((b) => b.type === "stage-confirm")
        .map((b) => {
          const stageKey = b.key.replace("stage-confirm-", "") as import("@/lib/store").WorkflowStage;
          const summaryMap: Record<string, string> = {
            script: `剧本分析完成，${project.characters.length} 个角色、${project.scenes.length} 个场景、${project.episodes.length} 集`,
            style: `风格配置完成: ${project.style_config?.art_substyle || "自定义"} · ${project.style_config?.aspect_ratio || ""}`,
            character: `角色资产生成完成，${project.characters.filter((c) => c.status === "done").length}/${project.characters.length} 已完成`,
            storyboard: `分镜图生成完成，${project.episodes.reduce((s, ep) => s + ep.shots.filter((sh) => sh.storyboard_image).length, 0)} 帧`,
            video: `视频生成完成，${project.episodes.reduce((s, ep) => s + ep.shots.filter((sh) => sh.video_url).length, 0)} 个片段`,
            post: "后期制作完成",
          };
          const offset = customPositions.get(stageKey);
          const x = b.x + (offset?.x ?? 0);
          const y = b.y + (offset?.y ?? 0);
          return (
            <div key={b.key} style={{ position: "absolute", left: x, top: y, width: b.width }}>
              <StageConfirmBar
                stage={stageKey}
                summary={summaryMap[stageKey] || ""}
                onConfirm={() => confirmStage(stageKey)}
              />
            </div>
          );
        })}

      {/* Empty state */}
      {layout.length === 0 && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 800,
            height: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div style={{ textAlign: "center", color: "#555" }}>
            <p style={{ fontSize: 36, marginBottom: 12 }}>🎬</p>
            <p style={{ fontSize: 18, fontWeight: 500 }}>从左侧开始创作</p>
            <p style={{ fontSize: 14, marginTop: 6 }}>填写剧本设置，开始你的漫剧创作之旅</p>
          </div>
        </div>
      )}
    </InfiniteCanvas>

    {/* 编辑面板（右侧抽屉） */}
    <EditPanel />
    </>
  );
}
