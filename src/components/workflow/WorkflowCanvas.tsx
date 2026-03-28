'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import type { WfWorkflowStatus, WfScript, WfCharacter, WfStoryboard, WfVideoTask } from '@/types/workflow';
import { wfGetScript, wfListCharacters, wfGetStoryboard, wfGetVideoTask } from '@/lib/workflowApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkflowCanvasProps {
  projectId: string;
  status: WfWorkflowStatus | null;
}

// ---------------------------------------------------------------------------
// Skeleton / loading placeholder
// ---------------------------------------------------------------------------

function Skeleton({ width, height, className = '' }: { width: number | string; height: number | string; className?: string }) {
  return (
    <div
      className={`bg-zinc-700 animate-pulse rounded ${className}`}
      style={{ width, height }}
    />
  );
}

// ---------------------------------------------------------------------------
// ScriptCard
// ---------------------------------------------------------------------------

function ScriptCard({ script }: { script: WfScript }) {
  return (
    <div
      className="absolute bg-zinc-800 rounded-xl p-4 shadow-xl border border-zinc-700"
      style={{ left: 40, top: 40, width: 280 }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-white font-bold text-base leading-tight">{script.title}</h3>
        <span className="flex-shrink-0 text-xs bg-purple-600/30 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/30">
          {script.genre}
        </span>
      </div>
      <p className="text-zinc-400 text-xs line-clamp-2 mb-3">{script.synopsis}</p>
      <div className="flex gap-2 text-xs text-zinc-500">
        <span className="bg-zinc-700 px-2 py-0.5 rounded-full">{script.episodes.length} 集</span>
        <span className="bg-zinc-700 px-2 py-0.5 rounded-full">{script.characters.length} 角色</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CharacterCard
// ---------------------------------------------------------------------------

function CharacterCard({ character, index }: { character: WfCharacter; index: number }) {
  const LEFT = 360 + index * 176;
  const viewKeys = ['front', 'side', 'back'] as const;
  const exprKeys = ['happy', 'sad', 'angry', 'surprised', 'thinking', 'shy'] as const;

  return (
    <div
      className="absolute bg-zinc-800 rounded-xl p-3 shadow-xl border border-zinc-700"
      style={{ left: LEFT, top: 40, width: 160 }}
    >
      {/* 3-view row */}
      <div className="flex gap-1 mb-2">
        {viewKeys.map((k) =>
          character.images[k] ? (
            <img
              key={k}
              src={character.images[k]}
              alt={k}
              className="rounded object-cover bg-zinc-700"
              style={{ width: 48, height: 64 }}
            />
          ) : (
            <Skeleton key={k} width={48} height={64} />
          )
        )}
      </div>
      {/* 6 expression grid */}
      <div className="grid grid-cols-3 gap-1 mb-2">
        {exprKeys.map((k) =>
          character.images[k] ? (
            <img
              key={k}
              src={character.images[k]}
              alt={k}
              className="rounded object-cover bg-zinc-700"
              style={{ width: 44, height: 44 }}
            />
          ) : (
            <Skeleton key={k} width={44} height={44} />
          )
        )}
      </div>
      <p className="text-white text-xs font-medium truncate">{character.name}</p>
      <span
        className={`text-xs mt-0.5 inline-block ${
          character.status === 'done'
            ? 'text-green-400'
            : character.status === 'error'
            ? 'text-red-400'
            : 'text-zinc-400'
        }`}
      >
        {character.status === 'done' ? '✓ 完成' : character.status === 'generating' ? '生成中...' : character.status}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StoryboardRow
// ---------------------------------------------------------------------------

function StoryboardRow({ storyboard }: { storyboard: WfStoryboard }) {
  return (
    <div className="absolute" style={{ left: 40, top: 340 }}>
      <div className="flex gap-3">
        {storyboard.panels.map((panel, i) => (
          <div
            key={panel.panel_id}
            className="relative bg-zinc-800 rounded-lg overflow-hidden border border-zinc-700 flex-shrink-0"
            style={{ width: 100, height: 140 }}
          >
            {/* Frame number badge */}
            <span className="absolute top-1 left-1 z-10 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded-full leading-none">
              {i + 1}
            </span>
            {/* Shot type badge */}
            <span className="absolute top-1 right-1 z-10 bg-purple-600/70 text-white text-xs px-1.5 py-0.5 rounded-full leading-none">
              {panel.shot_type.replace('_', ' ')}
            </span>
            {panel.status === 'done' && panel.image_url ? (
              <img src={panel.image_url} alt={`panel ${i + 1}`} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-zinc-700 animate-pulse" />
            )}
            {/* Dialogue */}
            <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1.5 py-1">
              <p className="text-white text-xs leading-tight truncate">{panel.dialogue_ref || '—'}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VideoCard
// ---------------------------------------------------------------------------

function VideoCard({ videoTask }: { videoTask: WfVideoTask }) {
  return (
    <div className="absolute" style={{ left: 40, top: 560 }}>
      <div
        className="bg-zinc-800 rounded-xl overflow-hidden border border-zinc-700"
        style={{ width: 180, height: 360 }}
      >
        {videoTask.status === 'done' && videoTask.output_url ? (
          <video
            src={videoTask.output_url}
            controls
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4">
            {videoTask.status === 'processing' ? (
              <>
                <div className="w-8 h-8 border-2 border-t-purple-400 border-zinc-600 rounded-full animate-spin" />
                <p className="text-zinc-400 text-xs text-center">合成中 {videoTask.progress}%</p>
                <div className="w-full h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 transition-all"
                    style={{ width: `${videoTask.progress}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-red-400 text-xs text-center">合成失败</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main canvas component
// ---------------------------------------------------------------------------

export default function WorkflowCanvas({ projectId, status }: WorkflowCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);

  const [scale, setScale] = useState(0.85);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  // Data loaded from API
  const [script, setScript] = useState<WfScript | null>(null);
  const [characters, setCharacters] = useState<WfCharacter[]>([]);
  const [storyboard, setStoryboard] = useState<WfStoryboard | null>(null);
  const [videoTask, setVideoTask] = useState<WfVideoTask | null>(null);

  // Load data when status changes
  useEffect(() => {
    if (!status) return;
    if (status.steps.script.done && status.steps.script.id) {
      wfGetScript(status.steps.script.id).then(setScript).catch(() => {});
    }
    if (status.steps.characters.done) {
      wfListCharacters(projectId).then(setCharacters).catch(() => {});
    }
    if (status.steps.storyboard.done && status.steps.storyboard.id) {
      wfGetStoryboard(status.steps.storyboard.id).then(setStoryboard).catch(() => {});
    }
    if (status.steps.video.done && status.steps.video.id) {
      wfGetVideoTask(status.steps.video.id).then(setVideoTask).catch(() => {});
    }
  }, [status, projectId]);

  // ---------------------------------------------------------------------------
  // Mouse / wheel handlers
  // ---------------------------------------------------------------------------

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 1) return; // middle button only
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }, [offset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setOffset({ x: dragStart.current.ox + dx, y: dragStart.current.oy + dy });
  }, [isDragging]);

  const stopDrag = useCallback(() => setIsDragging(false), []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
      setScale((s) => Math.min(2, Math.max(0.5, s - e.deltaY * 0.001)));
    } else {
      setOffset((o) => ({ x: o.x, y: o.y - e.deltaY }));
    }
  }, []);

  const zoomIn = () => setScale((s) => Math.min(2, s + 0.1));
  const zoomOut = () => setScale((s) => Math.max(0.5, s - 0.1));
  const resetView = () => { setScale(0.85); setOffset({ x: 0, y: 0 }); };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isEmpty = !script && characters.length === 0 && !storyboard && !videoTask;

  return (
    <div
      ref={canvasRef}
      className="relative flex-1 overflow-hidden bg-zinc-950 cursor-default"
      style={{ cursor: isDragging ? 'grabbing' : 'default' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
      onWheel={handleWheel}
    >
      {/* Infinite canvas layer */}
      <div
        className="absolute origin-top-left"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: '0 0',
          width: 2000,
          height: 1200,
        }}
      >
        {/* Grid background */}
        <svg className="absolute inset-0 w-full h-full opacity-10 pointer-events-none" style={{ position: 'absolute' }}>
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#6b7280" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Content nodes */}
        {script && <ScriptCard script={script} />}
        {characters.map((c, i) => <CharacterCard key={c.character_id} character={c} index={i} />)}
        {storyboard && <StoryboardRow storyboard={storyboard} />}
        {videoTask && <VideoCard videoTask={videoTask} />}

        {/* Empty state */}
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-zinc-600">
              <p className="text-4xl mb-3">🎬</p>
              <p className="text-lg font-medium">从左侧开始创作</p>
              <p className="text-sm mt-1">填写剧本设置，开始你的漫剧创作之旅</p>
            </div>
          </div>
        )}
      </div>

      {/* Fixed toolbar */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1.5 bg-zinc-800 border border-zinc-700 rounded-xl p-2 shadow-xl">
        <button
          onClick={zoomIn}
          className="w-8 h-8 flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors text-lg"
        >
          +
        </button>
        <div className="text-center text-xs text-zinc-500 py-0.5">
          {Math.round(scale * 100)}%
        </div>
        <button
          onClick={zoomOut}
          className="w-8 h-8 flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors text-lg"
        >
          −
        </button>
        <div className="h-px bg-zinc-700 mx-1" />
        <button
          onClick={resetView}
          title="重置视图"
          className="w-8 h-8 flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors text-sm"
        >
          ⊕
        </button>
      </div>
    </div>
  );
}
