'use client';

import React, { useState, useCallback, useMemo } from 'react';
import type { StyleConfig } from '@/lib/api';
import {
  compileStylePrompt,
  detectStyleConflict,
  calcShotCount,
} from '@/lib/prompt-system';
import { styleItems } from '@/lib/styles-data';
import StoryTypeSelector from './StoryTypeSelector';
import FilmParamsPanel, { type FilmParams } from './FilmParamsPanel';
import StylePickerModal from './StylePickerModal';
import PromptEditor from './PromptEditor';

interface StyleConfigStepProps {
  /** 现有的 style_config（用于回显已保存的配置） */
  initialConfig: StyleConfig | null;
  /** 剧本内容（用于风格冲突检测） */
  scriptContent: string;
  /** 保存回调 */
  onSave: (config: StyleConfig) => void;
}

const DEFAULT_FILM_PARAMS: FilmParams = {
  durationSec: 60,
  aspectRatio: '9:16' as const,
  language: '中文',
  shotDurationSec: 5,
  episodeCount: 3,
};

// --- Step progress indicator ---
function StepProgress({ steps, currentStep }: { steps: { label: string; done: boolean }[]; currentStep: number }) {
  return (
    <div className="flex items-center gap-1">
      {steps.map((step, i) => {
        const isActive = i === currentStep;
        const isDone = step.done;
        return (
          <React.Fragment key={step.label}>
            {i > 0 && (
              <div className={`h-px flex-1 transition-colors ${isDone || isActive ? 'bg-purple-500' : 'bg-zinc-700'}`} />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-all ${
                  isDone
                    ? 'bg-green-500 text-white'
                    : isActive
                      ? 'bg-purple-600 text-white ring-2 ring-purple-400/40'
                      : 'bg-zinc-800 text-zinc-500'
                }`}
              >
                {isDone ? '✓' : i + 1}
              </div>
              <span
                className={`hidden text-[11px] font-medium sm:inline ${
                  isDone ? 'text-green-400' : isActive ? 'text-purple-300' : 'text-zinc-500'
                }`}
              >
                {step.label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// --- Config summary card ---
function ConfigSummary({
  storyType,
  artSubstyle,
  filmParams,
  activeStylePrompt,
}: {
  storyType: string;
  artSubstyle: string;
  filmParams: FilmParams;
  activeStylePrompt: string;
}) {
  const shotCount = calcShotCount(filmParams.durationSec, filmParams.shotDurationSec);
  const selectedStyle = styleItems.find((s) => s.name === artSubstyle);

  const storyLabels: Record<string, string> = {
    drama: '剧情故事片',
    music_video: '音乐概念片',
    comic_adapt: '漫画转视频',
    promo: '产品宣传片',
    edu: '教育解说片',
  };

  return (
    <div className="rounded-xl border border-zinc-700/60 bg-gradient-to-br from-zinc-800/80 to-zinc-900/80 p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-600/20">
          <svg className="h-3 w-3 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <span className="text-xs font-medium text-zinc-400">配置概览</span>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <span className="text-zinc-500">类型</span>
          <p className="mt-0.5 font-medium text-white">{storyLabels[storyType] || storyType}</p>
        </div>
        <div>
          <span className="text-zinc-500">风格</span>
          <p className="mt-0.5 font-medium text-purple-300">{artSubstyle || '未选择'}</p>
        </div>
        <div>
          <span className="text-zinc-500">比例 / 时长</span>
          <p className="mt-0.5 font-medium text-white">
            {filmParams.aspectRatio} · {filmParams.durationSec}s
          </p>
        </div>
        <div>
          <span className="text-zinc-500">预计分镜</span>
          <p className="mt-0.5 font-medium text-purple-400">{shotCount} 个镜头</p>
        </div>
      </div>
      {activeStylePrompt && (
        <div className="mt-3 rounded-lg bg-zinc-900/60 p-2.5">
          <span className="text-[10px] font-medium text-zinc-500">合成提示词</span>
          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-zinc-400">{activeStylePrompt}</p>
        </div>
      )}
    </div>
  );
}

export default function StyleConfigStep({ initialConfig, scriptContent, onSave }: StyleConfigStepProps) {
  // --- State ---
  const [storyType, setStoryType] = useState(initialConfig?.story_type || 'drama');
  const [filmParams, setFilmParams] = useState<FilmParams>(
    initialConfig
      ? {
          durationSec: initialConfig.duration_sec,
          aspectRatio: initialConfig.aspect_ratio,
          language: initialConfig.language,
          shotDurationSec: initialConfig.shot_duration_sec,
          episodeCount: initialConfig.episode_count || 3,
        }
      : DEFAULT_FILM_PARAMS,
  );
  const [artSubstyle, setArtSubstyle] = useState(initialConfig?.art_substyle || '');
  const [stylePickerOpen, setStylePickerOpen] = useState(false);
  const [manuallyEdited, setManuallyEdited] = useState(initialConfig?.prompt_manually_edited || false);
  const [editHistory, setEditHistory] = useState<string[]>(initialConfig?.prompt_edit_history || []);
  // 自定义风格模式
  const [isCustomStyle, setIsCustomStyle] = useState(initialConfig?.art_substyle === '自定义风格');
  const [customPromptInput, setCustomPromptInput] = useState(
    initialConfig?.art_substyle === '自定义风格' ? (initialConfig?.compiled_style_prompt || '') : '',
  );
  const [customNegInput, setCustomNegInput] = useState(
    initialConfig?.art_substyle === '自定义风格' ? (initialConfig?.compiled_negative_prompt || '') : '',
  );

  // Compiled prompts
  const compiled = useMemo(() => {
    if (!artSubstyle) return { stylePrompt: '', negativePrompt: '' };
    return compileStylePrompt({
      storyType,
      artSubstyle,
      aspectRatio: filmParams.aspectRatio,
    });
  }, [storyType, artSubstyle, filmParams.aspectRatio]);

  const [customStylePrompt, setCustomStylePrompt] = useState(initialConfig?.compiled_style_prompt || '');
  const [customNegativePrompt, setCustomNegativePrompt] = useState(initialConfig?.compiled_negative_prompt || '');

  // Use custom if manually edited or custom style, otherwise auto-compiled
  const activeStylePrompt = isCustomStyle ? customPromptInput : (manuallyEdited ? customStylePrompt : compiled.stylePrompt);
  const activeNegativePrompt = isCustomStyle ? customNegInput : (manuallyEdited ? customNegativePrompt : compiled.negativePrompt);

  // Conflict detection
  const conflictWarning = useMemo(() => {
    if (!artSubstyle || !scriptContent) return null;
    return detectStyleConflict(scriptContent, artSubstyle);
  }, [artSubstyle, scriptContent]);

  // Determine art_style_category from selected style
  const artStyleCategory = useMemo(() => {
    if (!artSubstyle) return '';
    const style = styleItems.find((s) => s.name === artSubstyle);
    return style?.categories[0] || '';
  }, [artSubstyle]);

  // --- Confirm dialog state ---
  const [pendingAction, setPendingAction] = useState<{ type: 'style' | 'storyType'; value: string } | null>(null);

  const confirmPendingAction = useCallback(() => {
    if (!pendingAction) return;
    if (pendingAction.type === 'style') {
      setArtSubstyle(pendingAction.value);
      setIsCustomStyle(false);
    } else {
      setStoryType(pendingAction.value);
    }
    setManuallyEdited(false);
    setPendingAction(null);
  }, [pendingAction]);

  // --- Handlers ---

  const handleStyleSelect = useCallback((styleName: string) => {
    // 先关闭 Modal，避免 Modal 和确认弹窗 z-index 冲突导致页面卡住
    setStylePickerOpen(false);
    if (manuallyEdited && styleName !== artSubstyle) {
      setPendingAction({ type: 'style', value: styleName });
      return;
    }
    setArtSubstyle(styleName);
    setIsCustomStyle(false);
    setManuallyEdited(false);
  }, [manuallyEdited, artSubstyle]);

  const handleSwitchToCustom = useCallback(() => {
    setIsCustomStyle(true);
    setArtSubstyle('自定义风格');
    setManuallyEdited(true);
  }, []);

  const handleStoryTypeChange = useCallback((id: string) => {
    if (manuallyEdited && id !== storyType) {
      setPendingAction({ type: 'storyType', value: id });
      return;
    }
    setStoryType(id);
    setManuallyEdited(false);
  }, [manuallyEdited, storyType]);

  const handlePromptEdit = useCallback((newStyle: string, newNeg: string) => {
    if (!manuallyEdited) {
      setEditHistory((prev) => [...prev.slice(-9), activeStylePrompt]); // 最多保留 10 个版本
    }
    setCustomStylePrompt(newStyle);
    setCustomNegativePrompt(newNeg);
    setManuallyEdited(true);
  }, [manuallyEdited, activeStylePrompt]);

  const handlePromptReset = useCallback(() => {
    setManuallyEdited(false);
    setCustomStylePrompt('');
    setCustomNegativePrompt('');
  }, []);

  const handleSave = useCallback(() => {
    if (!storyType || !artSubstyle) return;
    // 自定义风格模式下提示词不能为空
    if (isCustomStyle && !customPromptInput.trim()) return;

    const config: StyleConfig = {
      story_type: storyType,
      art_style_category: isCustomStyle ? '自定义' : artStyleCategory,
      art_substyle: artSubstyle,
      aspect_ratio: filmParams.aspectRatio,
      duration_sec: filmParams.durationSec,
      language: filmParams.language,
      shot_duration_sec: filmParams.shotDurationSec,
      episode_count: filmParams.episodeCount,
      compiled_style_prompt: activeStylePrompt,
      compiled_negative_prompt: activeNegativePrompt,
      prompt_manually_edited: manuallyEdited,
      prompt_edit_history: editHistory,
    };

    onSave(config);
  }, [
    storyType, artSubstyle, artStyleCategory, filmParams, isCustomStyle, customPromptInput,
    activeStylePrompt, activeNegativePrompt, manuallyEdited, editHistory, onSave,
  ]);

  // --- Selected style info ---
  const selectedStyle = artSubstyle ? styleItems.find((s) => s.name === artSubstyle) : null;

  const isComplete = !!storyType && !!artSubstyle && (!isCustomStyle || !!customPromptInput.trim());

  // --- Step progress ---
  const steps = [
    { label: '短片类型', done: !!storyType },
    { label: '影片参数', done: true }, // always has defaults
    { label: '艺术风格', done: !!artSubstyle },
    { label: '提示词确认', done: !!artSubstyle && !!activeStylePrompt },
  ];
  const currentStep = !storyType ? 0 : !artSubstyle ? 2 : isCustomStyle ? 2 : 3;

  return (
    <div className="space-y-6">
      {/* Header with step progress */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-600 text-sm font-bold text-white">
            2
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-white">风格定调与参数配置</h2>
            <p className="text-xs text-zinc-400">选择短片类型、艺术风格、影片参数，自动合成提示词</p>
          </div>
        </div>
        <StepProgress steps={steps} currentStep={currentStep} />
      </div>

      {/* Step 1: Story type */}
      <StoryTypeSelector value={storyType} onChange={handleStoryTypeChange} />

      {/* Step 2: Film params */}
      <FilmParamsPanel value={filmParams} onChange={setFilmParams} />

      {/* Step 3: Art style */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-zinc-300">艺术风格</h3>
        {isCustomStyle ? (
          /* 自定义风格模式 */
          <div className="space-y-3 rounded-xl border border-purple-600/40 bg-zinc-800/60 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600/20">
                  <svg className="h-4 w-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-purple-300">自定义风格</span>
              </div>
              <button
                onClick={() => {
                  setIsCustomStyle(false);
                  setArtSubstyle('');
                  setManuallyEdited(false);
                }}
                className="rounded-lg bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-600"
              >
                切换为预设风格
              </button>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400">正向提示词（描述你想要的画面风格）</label>
              <textarea
                value={customPromptInput}
                onChange={(e) => setCustomPromptInput(e.target.value)}
                rows={4}
                className="w-full resize-none rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs leading-relaxed text-white placeholder:text-zinc-500 focus:border-purple-500 focus:outline-none"
                placeholder="例如：Studio Ghibli style, soft watercolor textures, hand-painted backgrounds, warm color palette..."
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400">反向提示词（可选，描述你不想要的元素）</label>
              <textarea
                value={customNegInput}
                onChange={(e) => setCustomNegInput(e.target.value)}
                rows={2}
                className="w-full resize-none rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs leading-relaxed text-white placeholder:text-zinc-500 focus:border-purple-500 focus:outline-none"
                placeholder="例如：low quality, blurry, distorted, ugly..."
              />
            </div>
            {!customPromptInput.trim() && (
              <p className="text-xs text-amber-400">请输入正向提示词</p>
            )}
          </div>
        ) : selectedStyle ? (
          <div className="flex items-center gap-4 rounded-xl border border-zinc-700 bg-zinc-800/60 p-4 transition-all hover:border-zinc-600">
            <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedStyle.cover}
                alt={selectedStyle.name}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{selectedStyle.name}</p>
              <p className="mt-1 flex flex-wrap gap-1">
                {selectedStyle.categories.map((cat) => (
                  <span
                    key={cat}
                    className="rounded bg-zinc-700/80 px-1.5 py-0.5 text-[10px] text-zinc-400"
                  >
                    {cat}
                  </span>
                ))}
              </p>
              {selectedStyle.prompt && (
                <p className="mt-1.5 line-clamp-1 text-[11px] text-zinc-500">
                  {selectedStyle.prompt}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <button
                onClick={() => setStylePickerOpen(true)}
                className="rounded-lg bg-zinc-700 px-4 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-600"
              >
                更换风格
              </button>
              <button
                onClick={handleSwitchToCustom}
                className="rounded-lg border border-zinc-600 px-4 py-2 text-xs font-medium text-zinc-400 transition-colors hover:border-purple-500 hover:text-purple-400"
              >
                自定义风格
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={() => setStylePickerOpen(true)}
              className="group flex-1 rounded-xl border-2 border-dashed border-zinc-600 py-8 text-sm text-zinc-400 transition-all hover:border-purple-500 hover:bg-purple-500/5 hover:text-purple-400"
            >
              <svg className="mx-auto mb-2 h-8 w-8 text-zinc-600 transition-colors group-hover:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
              </svg>
              选择预设风格 · 170+ 种可选
            </button>
            <button
              onClick={handleSwitchToCustom}
              className="group rounded-xl border-2 border-dashed border-zinc-600 px-6 py-8 text-sm text-zinc-400 transition-all hover:border-purple-500 hover:bg-purple-500/5 hover:text-purple-400"
            >
              <svg className="mx-auto mb-2 h-8 w-8 text-zinc-600 transition-colors group-hover:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
              自定义风格
            </button>
          </div>
        )}
      </div>

      {/* Conflict warning (elevated to top level for visibility) */}
      {conflictWarning && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-600/40 bg-amber-900/20 px-4 py-3">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-xs font-medium text-amber-300">风格冲突提示</p>
            <p className="mt-0.5 text-xs text-amber-400/80">{conflictWarning}</p>
          </div>
        </div>
      )}

      {/* Step 4: Prompt preview / editor (自定义模式下不显示，因为用户已直接输入提示词) */}
      {artSubstyle && !isCustomStyle && (
        <PromptEditor
          stylePrompt={activeStylePrompt}
          negativePrompt={activeNegativePrompt}
          manuallyEdited={manuallyEdited}
          conflictWarning={null} // conflict warning is shown above now
          onEdit={handlePromptEdit}
          onReset={handlePromptReset}
        />
      )}

      {/* Config summary (shown when complete) */}
      {isComplete && (
        <ConfigSummary
          storyType={storyType}
          artSubstyle={artSubstyle}
          filmParams={filmParams}
          activeStylePrompt={activeStylePrompt}
        />
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={!isComplete}
        className={`w-full rounded-xl py-3 text-sm font-semibold transition-all ${
          isComplete
            ? 'bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-lg shadow-purple-500/20 hover:from-purple-500 hover:to-purple-400'
            : 'cursor-not-allowed bg-zinc-800 text-zinc-500'
        }`}
      >
        {isComplete ? '确认并保存风格配置' : '请完成上方所有选项'}
      </button>

      {/* Style picker modal */}
      <StylePickerModal
        open={stylePickerOpen}
        selected={artSubstyle}
        onSelect={handleStyleSelect}
        onClose={() => setStylePickerOpen(false)}
      />

      {/* Confirm override dialog */}
      {pendingAction && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" role="dialog" data-modal-overlay="" onWheel={(e) => e.stopPropagation()}>
          <div className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
                <svg className="h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">覆盖确认</h3>
                <p className="text-xs text-zinc-400">
                  {pendingAction.type === 'style' ? '重新选择风格' : '切换类型'}将覆盖手动编辑
                </p>
              </div>
            </div>
            <p className="mb-5 text-xs text-zinc-400">
              你已手动编辑过提示词，此操作将覆盖你的编辑内容。是否继续？
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setPendingAction(null)}
                className="rounded-lg bg-zinc-800 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-700"
              >
                取消
              </button>
              <button
                onClick={confirmPendingAction}
                className="rounded-lg bg-purple-600 px-4 py-2 text-xs font-medium text-white hover:bg-purple-500"
              >
                确认覆盖
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
