'use client';

import React from 'react';
import {
  DURATION_OPTIONS,
  LANGUAGE_OPTIONS,
  ASPECT_RATIO_PROMPTS,
  calcShotCount,
} from '@/lib/prompt-system';

export interface FilmParams {
  durationSec: number;
  aspectRatio: '16:9' | '9:16' | '1:1';
  language: string;
  shotDurationSec: number;
  episodeCount: number;
}

interface FilmParamsPanelProps {
  value: FilmParams;
  onChange: (params: FilmParams) => void;
}

const ASPECT_RATIOS: ('16:9' | '9:16' | '1:1')[] = ['16:9', '9:16', '1:1'];

export default function FilmParamsPanel({ value, onChange }: FilmParamsPanelProps) {
  const shotCount = calcShotCount(value.durationSec, value.shotDurationSec);

  const update = (patch: Partial<FilmParams>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-medium text-zinc-300">影片参数</h3>

      {/* 时长 */}
      <div className="space-y-2">
        <label className="text-xs text-zinc-400">故事时长</label>
        <div className="flex gap-2">
          {DURATION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => update({ durationSec: opt.value })}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                value.durationSec === opt.value
                  ? 'bg-purple-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 画面比例 */}
      <div className="space-y-2">
        <label className="text-xs text-zinc-400">画面比例</label>
        <div className="flex gap-2">
          {ASPECT_RATIOS.map((ratio) => (
            <button
              key={ratio}
              onClick={() => update({ aspectRatio: ratio })}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                value.aspectRatio === ratio
                  ? 'bg-purple-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
              }`}
            >
              {ratio}
            </button>
          ))}
        </div>
      </div>

      {/* 对白语言 */}
      <div className="space-y-2">
        <label className="text-xs text-zinc-400">对白语言</label>
        <select
          value={value.language}
          onChange={(e) => update({ language: e.target.value })}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
        >
          {LANGUAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* 单镜头时长 */}
      <div className="space-y-2">
        <label className="flex items-center justify-between text-xs text-zinc-400">
          <span>单镜头时长</span>
          <span className="text-purple-400 font-medium">{value.shotDurationSec}s</span>
        </label>
        <input
          type="range"
          min={3}
          max={8}
          step={1}
          value={value.shotDurationSec}
          onChange={(e) => update({ shotDurationSec: Number(e.target.value) })}
          className="w-full accent-purple-500"
        />
        <div className="flex justify-between text-[10px] text-zinc-500">
          <span>3s</span>
          <span>8s</span>
        </div>
      </div>

      {/* 集数 */}
      <div className="space-y-2">
        <label className="text-xs text-zinc-400">集数</label>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
            <button
              key={n}
              onClick={() => update({ episodeCount: n })}
              className={`flex-1 rounded-lg px-2 py-2 text-sm font-medium transition-colors ${
                value.episodeCount === n
                  ? 'bg-purple-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
              }`}
            >
              {n}集
            </button>
          ))}
        </div>
      </div>

      {/* 预计分镜数 */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-center">
        <span className="text-xs text-zinc-400">预计生成 </span>
        <span className="text-lg font-bold text-purple-400">{shotCount}</span>
        <span className="text-xs text-zinc-400"> 个分镜</span>
      </div>
    </div>
  );
}
