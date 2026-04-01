'use client';

import React from 'react';
import { STORY_TYPES, type StoryTypeInfo } from '@/lib/prompt-system';

interface StoryTypeSelectorProps {
  value: string;
  onChange: (storyTypeId: string) => void;
}

export default function StoryTypeSelector({ value, onChange }: StoryTypeSelectorProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-zinc-300">选择短片类型</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {STORY_TYPES.map((st: StoryTypeInfo) => {
          const isSelected = value === st.id;
          return (
            <button
              key={st.id}
              onClick={() => onChange(st.id)}
              className={`relative flex flex-col items-start gap-1.5 rounded-xl border p-4 text-left transition-all ${
                isSelected
                  ? 'border-purple-500 bg-purple-500/10 ring-1 ring-purple-500/40'
                  : 'border-zinc-700 bg-zinc-800/60 hover:border-zinc-500 hover:bg-zinc-800'
              }`}
            >
              {isSelected && (
                <span className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-purple-500 text-[10px] text-white">
                  ✓
                </span>
              )}
              <span className="text-2xl leading-none">{st.icon}</span>
              <span className="text-sm font-semibold text-white">{st.label}</span>
              <span className="text-xs text-zinc-400 leading-relaxed">{st.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
