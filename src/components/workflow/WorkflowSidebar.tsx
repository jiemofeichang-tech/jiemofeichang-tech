'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { WfScript, WfCharacter, WfStoryboard, WfVideoTask, WfWorkflowStatus } from '@/types/workflow';
import {
  wfGenerateScript,
  wfGetScript,
  wfCreateCharacter,
  wfGetCharacter,
  wfListCharacters,
  wfGenerateStoryboard,
  wfGetStoryboard,
  wfComposeVideo,
  wfGetVideoTask,
  wfGetWorkflowStatus,
} from '@/lib/workflowApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkflowSidebarProps {
  projectId: string;
  onStatusChange?: (status: WfWorkflowStatus) => void;
}

type StepId = 'script' | 'characters' | 'storyboard' | 'video' | 'done';

const GENRES = ['仙侠', '重生穿越', '都市逆袭', '甜宠', '悬疑', '搞笑'];
const STYLES = ['赛博朝克', '仙侠水墨', '都市写实', '唯美古风'];
const SPEAKERS = ['男低音旁白', '女声温柔', '中性解说'];

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-t-purple-400 border-zinc-600 rounded-full animate-spin" />
  );
}

// ---------------------------------------------------------------------------
// Step header
// ---------------------------------------------------------------------------

interface StepHeaderProps {
  stepNum: number;
  title: string;
  isActive: boolean;
  isDone: boolean;
  isLocked: boolean;
  expanded: boolean;
  onToggle: () => void;
}

function StepHeader({ stepNum, title, isActive, isDone, isLocked, expanded, onToggle }: StepHeaderProps) {
  return (
    <button
      onClick={onToggle}
      disabled={isLocked}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
        isLocked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-zinc-700 cursor-pointer'
      } ${isActive ? 'border-l-2 border-purple-500 bg-zinc-800' : ''}`}
    >
      <span
        className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
          isDone
            ? 'bg-green-500 text-white'
            : isActive
            ? 'bg-purple-500 text-white'
            : 'bg-zinc-600 text-zinc-400'
        }`}
      >
        {isDone ? '✓' : stepNum}
      </span>
      <span className={`flex-1 text-sm font-medium ${isActive ? 'text-white' : 'text-zinc-400'}`}>
        {title}
      </span>
      {!isLocked && (
        <span className="text-zinc-500 text-xs">{expanded ? '▲' : '▼'}</span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function WorkflowSidebar({ projectId, onStatusChange }: WorkflowSidebarProps) {
  const router = useRouter();

  // --- Active step & expand state ---
  const [activeStep, setActiveStep] = useState<StepId>('script');
  const [expandedStep, setExpandedStep] = useState<StepId>('script');

  // --- Step 1: Script ---
  const [genre, setGenre] = useState('仙侠');
  const [theme, setTheme] = useState('');
  const [episodesCount, setEpisodesCount] = useState(3);
  const [charsCount, setCharsCount] = useState(2);
  const [scriptLoading, setScriptLoading] = useState(false);
  const [scriptError, setScriptError] = useState('');
  const [script, setScript] = useState<WfScript | null>(null);

  // --- Step 2: Characters ---
  const [charAppearances, setCharAppearances] = useState<Record<string, string>>({});
  const [charGenerating, setCharGenerating] = useState(false);
  const [characters, setCharacters] = useState<WfCharacter[]>([]);

  // --- Step 3: Storyboard ---
  const [selectedEpisode, setSelectedEpisode] = useState(1);
  const [storyboardStyle, setStoryboardStyle] = useState('唯美古风');
  const [storyboardLoading, setStoryboardLoading] = useState(false);
  const [storyboard, setStoryboard] = useState<WfStoryboard | null>(null);

  // --- Step 4: Video ---
  const [speaker, setSpeaker] = useState('女声温柔');
  const [speed, setSpeed] = useState(1.0);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoTask, setVideoTask] = useState<WfVideoTask | null>(null);

  // Poll workflow status on mount
  useEffect(() => {
    wfGetWorkflowStatus(projectId).then((status) => {
      onStatusChange?.(status);
      if (status.steps.video.done) setActiveStep('done');
      else if (status.steps.storyboard.done) setActiveStep('video');
      else if (status.steps.characters.done) setActiveStep('storyboard');
      else if (status.steps.script.done) {
        setActiveStep('characters');
        if (status.steps.script.id) {
          // re-hydrate script would require an extra API call; skip for now
        }
      }
    }).catch(() => {});
  }, [projectId, onStatusChange]);

  // Pre-fill character appearances from script
  useEffect(() => {
    if (!script) return;
    const appearances: Record<string, string> = {};
    script.characters.forEach((c) => {
      appearances[c.name] = c.appearance || '';
    });
    setCharAppearances(appearances);
  }, [script]);

  // Poll character status while generating
  useEffect(() => {
    if (!charGenerating || characters.length === 0) return;
    const interval = setInterval(async () => {
      try {
        const updated = await wfListCharacters(projectId);
        setCharacters(updated);
        const allDone = updated.every((c) => c.status === 'done' || c.status === 'error');
        if (allDone) {
          setCharGenerating(false);
          setActiveStep('storyboard');
          setExpandedStep('storyboard');
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [charGenerating, characters, projectId]);

  // Poll storyboard while generating
  useEffect(() => {
    if (!storyboardLoading || !storyboard) return;
    const interval = setInterval(async () => {
      try {
        const updated = await wfGetStoryboard(storyboard.storyboard_id);
        setStoryboard(updated);
        const allDone = updated.panels.every((p) => p.status === 'done' || p.status === 'error');
        if (allDone) {
          setStoryboardLoading(false);
          setActiveStep('video');
          setExpandedStep('video');
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [storyboardLoading, storyboard]);

  // Poll video task while processing
  useEffect(() => {
    if (!videoLoading || !videoTask) return;
    const interval = setInterval(async () => {
      try {
        const updated = await wfGetVideoTask(videoTask.video_task_id);
        setVideoTask(updated);
        if (updated.status === 'done' || updated.status === 'error') {
          setVideoLoading(false);
          if (updated.status === 'done') {
            setActiveStep('done');
            setExpandedStep('done');
          }
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [videoLoading, videoTask]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleGenerateScript = useCallback(async () => {
    if (!theme.trim()) {
      setScriptError('请输入故事主题');
      return;
    }
    setScriptLoading(true);
    setScriptError('');
    try {
      const { script_id } = await wfGenerateScript({
        project_id: projectId,
        genre,
        theme,
        characters_count: charsCount,
        episodes_count: episodesCount,
      });
      // Poll until script generation is done (up to 3 minutes)
      let tries = 0;
      let done = false;
      while (tries < 36 && !done) {
        await new Promise((r) => setTimeout(r, 5000));
        tries++;
        const s = await wfGetScript(script_id).catch(() => null);
        const scriptStatus = s ? (s as any).status : '';
        if (s && (scriptStatus === 'done' || scriptStatus === 'completed')) {
          setScript(s);
          setActiveStep('characters');
          setExpandedStep('characters');
          done = true;
        } else if (s && (scriptStatus === 'error' || scriptStatus === 'failed')) {
          throw new Error((s as any).error_message || '剧本生成失败');
        }
      }
      if (!done) throw new Error('生成超时，请重试');
    } catch (e) {
      setScriptError(e instanceof Error ? e.message : '生成失败，请重试');
    } finally {
      setScriptLoading(false);
    }
  }, [projectId, genre, theme, charsCount, episodesCount]);

  const handleGenerateCharacters = useCallback(async () => {
    if (!script) return;
    setCharGenerating(true);
    try {
      // Submit all character creation requests (get IDs only)
      const charIds: string[] = [];
      for (const c of script.characters) {
        const { character_id } = await wfCreateCharacter({
          project_id: projectId,
          name: c.name,
          personality: c.personality,
          appearance_desc: charAppearances[c.name] || c.appearance || '',
          role_type: c.role,
        });
        charIds.push(character_id);
      }
      // Load initial character data
      const initial: WfCharacter[] = await Promise.all(
        charIds.map((id) => wfGetCharacter(id).catch(() => ({ character_id: id } as WfCharacter)))
      );
      setCharacters(initial);
      // Polling continues via useEffect
    } catch {}
  }, [script, projectId, charAppearances]);

  const handleGenerateStoryboard = useCallback(async () => {
    if (!script) return;
    setStoryboardLoading(true);
    try {
      const { storyboard_id } = await wfGenerateStoryboard({
        project_id: projectId,
        script_id: script.script_id,
        episode_num: selectedEpisode,
        style: storyboardStyle,
      });
      // Load initial storyboard data
      const sb = await wfGetStoryboard(storyboard_id).catch(() => null);
      if (sb) setStoryboard(sb);
      // Polling continues via useEffect
    } catch {
      setStoryboardLoading(false);
    }
  }, [script, projectId, selectedEpisode, storyboardStyle]);

  const handleComposeVideo = useCallback(async () => {
    if (!storyboard) return;
    setVideoLoading(true);
    try {
      const { video_task_id } = await wfComposeVideo({
        project_id: projectId,
        storyboard_id: storyboard.storyboard_id,
        voice_config: { speaker, speed },
      });
      // Load initial video task data
      const vt = await wfGetVideoTask(video_task_id).catch(() => null);
      if (vt) setVideoTask(vt);
      // Polling continues via useEffect
    } catch {
      setVideoLoading(false);
    }
  }, [storyboard, projectId, speaker, speed]);

  // ---------------------------------------------------------------------------
  // Step unlock logic
  // ---------------------------------------------------------------------------

  const stepDone: Record<StepId, boolean> = {
    script: !!script,
    characters: characters.length > 0 && characters.every((c) => c.status === 'done'),
    storyboard: !!storyboard && storyboard.panels.every((p) => p.status === 'done'),
    video: !!videoTask && videoTask.status === 'done',
    done: false,
  };

  const stepLocked: Record<StepId, boolean> = {
    script: false,
    characters: !stepDone.script,
    storyboard: !stepDone.characters,
    video: !stepDone.storyboard,
    done: true,
  };

  function toggleExpand(step: StepId) {
    if (stepLocked[step]) return;
    setExpandedStep(expandedStep === step ? ('' as StepId) : step);
  }

  // Character progress
  const charDoneCount = characters.filter((c) => c.status === 'done').length;
  const charTotal = characters.length;

  // Storyboard progress
  const panelDoneCount = storyboard?.panels.filter((p) => p.status === 'done').length ?? 0;
  const panelTotal = storyboard?.panels.length ?? 0;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <aside className="flex flex-col h-full bg-zinc-900 border-r border-zinc-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-700">
        <button
          onClick={() => router.back()}
          className="text-zinc-400 hover:text-white transition-colors text-sm"
        >
          ← 返回
        </button>
        <span className="text-white font-semibold truncate">创作工作流</span>
      </div>

      {/* Steps */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Step 1: Script ── */}
        <StepHeader
          stepNum={1}
          title="剧本设置"
          isActive={activeStep === 'script'}
          isDone={stepDone.script}
          isLocked={stepLocked.script}
          expanded={expandedStep === 'script'}
          onToggle={() => toggleExpand('script')}
        />
        {expandedStep === 'script' && (
          <div className="px-4 pb-4 space-y-3">
            {/* Genre */}
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">题材</label>
              <select
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
              >
                {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            {/* Theme */}
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">故事主题</label>
              <textarea
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="用一两句话描述故事主题..."
                rows={3}
                className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none focus:border-purple-500 placeholder:text-zinc-500"
              />
            </div>
            {/* Episodes / chars count */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-zinc-400 mb-1 block">集数</label>
                <input
                  type="number"
                  value={episodesCount}
                  onChange={(e) => setEpisodesCount(Number(e.target.value))}
                  min={1}
                  max={12}
                  className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-zinc-400 mb-1 block">主角数量</label>
                <input
                  type="number"
                  value={charsCount}
                  onChange={(e) => setCharsCount(Number(e.target.value))}
                  min={1}
                  max={6}
                  className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>
            {scriptError && <p className="text-red-400 text-xs">{scriptError}</p>}
            <button
              onClick={handleGenerateScript}
              disabled={scriptLoading}
              className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
            >
              {scriptLoading ? <><Spinner /> 生成中...</> : '生成剧本'}
            </button>
            {/* Script result preview */}
            {script && (
              <div className="bg-zinc-800 rounded-lg p-3 space-y-2">
                <p className="text-white text-sm font-medium">{script.title}</p>
                <p className="text-zinc-400 text-xs line-clamp-2">{script.synopsis}</p>
                <div className="flex flex-wrap gap-1">
                  {script.characters.map((c) => (
                    <span key={c.name} className="bg-zinc-700 text-zinc-300 text-xs px-2 py-0.5 rounded-full">
                      {c.name} · {c.role}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Characters ── */}
        <StepHeader
          stepNum={2}
          title="角色设计"
          isActive={activeStep === 'characters'}
          isDone={stepDone.characters}
          isLocked={stepLocked.characters}
          expanded={expandedStep === 'characters'}
          onToggle={() => toggleExpand('characters')}
        />
        {expandedStep === 'characters' && !stepLocked.characters && (
          <div className="px-4 pb-4 space-y-3">
            {script?.characters.map((c) => {
              const charStatus = characters.find((ch) => ch.name === c.name);
              const doneImages = charStatus
                ? Object.values(charStatus.images).filter((url) => !!url).length
                : 0;
              return (
                <div key={c.name} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-white text-sm font-medium">{c.name}</span>
                    <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">{c.role}</span>
                  </div>
                  <input
                    value={charAppearances[c.name] || ''}
                    onChange={(e) => setCharAppearances((prev) => ({ ...prev, [c.name]: e.target.value }))}
                    placeholder="外貌描述..."
                    className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500 placeholder:text-zinc-500"
                  />
                  {charStatus && (
                    <div className="flex items-center gap-2 text-xs">
                      {charStatus.status === 'done' ? (
                        <span className="text-green-400">✓ 已完成 (9/9)</span>
                      ) : charStatus.status === 'generating' ? (
                        <span className="text-zinc-400 flex items-center gap-1">
                          <Spinner /> 生成中 ({doneImages}/9)
                        </span>
                      ) : charStatus.status === 'error' ? (
                        <span className="text-red-400">生成失败</span>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
            <button
              onClick={handleGenerateCharacters}
              disabled={charGenerating}
              className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
            >
              {charGenerating ? <><Spinner /> 批量生成中 ({charDoneCount}/{charTotal})...</> : '批量生成角色图'}
            </button>
          </div>
        )}

        {/* ── Step 3: Storyboard ── */}
        <StepHeader
          stepNum={3}
          title="生成分镜"
          isActive={activeStep === 'storyboard'}
          isDone={stepDone.storyboard}
          isLocked={stepLocked.storyboard}
          expanded={expandedStep === 'storyboard'}
          onToggle={() => toggleExpand('storyboard')}
        />
        {expandedStep === 'storyboard' && !stepLocked.storyboard && (
          <div className="px-4 pb-4 space-y-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">选择集数</label>
              <select
                value={selectedEpisode}
                onChange={(e) => setSelectedEpisode(Number(e.target.value))}
                className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
              >
                {script?.episodes.map((ep) => (
                  <option key={ep.ep_num} value={ep.ep_num}>
                    第{ep.ep_num}集：{ep.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">画风</label>
              <select
                value={storyboardStyle}
                onChange={(e) => setStoryboardStyle(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
              >
                {STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {storyboard && (
              <div className="text-xs text-zinc-400">
                已生成 {panelDoneCount}/{panelTotal} 帧
                <div className="mt-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 transition-all"
                    style={{ width: panelTotal > 0 ? `${(panelDoneCount / panelTotal) * 100}%` : '0%' }}
                  />
                </div>
              </div>
            )}
            <button
              onClick={handleGenerateStoryboard}
              disabled={storyboardLoading}
              className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
            >
              {storyboardLoading ? <><Spinner /> 生成分镜中...</> : '生成分镜'}
            </button>
          </div>
        )}

        {/* ── Step 4: Video ── */}
        <StepHeader
          stepNum={4}
          title="合成视频"
          isActive={activeStep === 'video'}
          isDone={stepDone.video}
          isLocked={stepLocked.video}
          expanded={expandedStep === 'video'}
          onToggle={() => toggleExpand('video')}
        />
        {expandedStep === 'video' && !stepLocked.video && (
          <div className="px-4 pb-4 space-y-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">配音风格</label>
              <select
                value={speaker}
                onChange={(e) => setSpeaker(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
              >
                {SPEAKERS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block flex justify-between">
                <span>语速</span>
                <span className="text-purple-400">{speed.toFixed(1)}x</span>
              </label>
              <input
                type="range"
                min={0.8}
                max={1.2}
                step={0.1}
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                className="w-full accent-purple-500"
              />
            </div>
            {/* Progress bars */}
            {videoTask && (
              <div className="space-y-2">
                {[
                  { label: 'TTS配音', value: Math.min(videoTask.progress, 33) / 33 * 100 },
                  { label: '视频生成', value: Math.min(Math.max(videoTask.progress - 33, 0), 33) / 33 * 100 },
                  { label: '最终合并', value: Math.min(Math.max(videoTask.progress - 66, 0), 34) / 34 * 100 },
                ].map((bar) => (
                  <div key={bar.label} className="text-xs text-zinc-400">
                    <div className="flex justify-between mb-0.5">
                      <span>{bar.label}</span>
                      <span>{Math.round(bar.value)}%</span>
                    </div>
                    <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500 transition-all"
                        style={{ width: `${bar.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={handleComposeVideo}
              disabled={videoLoading}
              className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
            >
              {videoLoading ? <><Spinner /> 合成中...</> : '开始合成'}
            </button>
          </div>
        )}

        {/* ── Step 5: Done ── */}
        <StepHeader
          stepNum={5}
          title="完成"
          isActive={activeStep === 'done'}
          isDone={false}
          isLocked={!stepDone.video}
          expanded={expandedStep === 'done'}
          onToggle={() => toggleExpand('done')}
        />
        {expandedStep === 'done' && stepDone.video && videoTask?.output_url && (
          <div className="px-4 pb-4 space-y-3">
            <div className="bg-green-900/30 border border-green-700 rounded-lg p-3 text-green-400 text-sm">
              🎉 视频已生成完成！
            </div>
            <a
              href={videoTask.output_url}
              download
              className="w-full flex items-center justify-center gap-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg px-4 py-2 text-sm text-white transition-colors"
            >
              ↓ 下载视频
            </a>
            <button
              onClick={() => navigator.clipboard.writeText(videoTask.output_url!)}
              className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg px-4 py-2 text-sm text-zinc-300 transition-colors"
            >
              复制链接
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
