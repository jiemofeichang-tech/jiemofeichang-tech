'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { styleItems, styleCategories, type StyleCategory } from '@/lib/styles-data';

interface StylePickerModalProps {
  open: boolean;
  selected: string;
  onSelect: (styleName: string) => void;
  onClose: () => void;
}

export default function StylePickerModal({ open, selected, onSelect, onClose }: StylePickerModalProps) {
  const [activeCategory, setActiveCategory] = useState<StyleCategory>('全部');
  const [hovered, setHovered] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    let items = styleItems;
    if (activeCategory !== '全部') {
      items = items.filter((s) => s.categories.includes(activeCategory));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      items = items.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.categories.some((c) => c.toLowerCase().includes(q)) ||
          (s.prompt && s.prompt.toLowerCase().includes(q)),
      );
    }
    return items;
  }, [activeCategory, searchQuery]);

  // 当前选中/悬停的风格详情
  const detailStyle = useMemo(() => {
    const name = hovered || selected;
    if (!name) return null;
    return styleItems.find((s) => s.name === name) || null;
  }, [hovered, selected]);

  // ESC 键关闭
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  // 重置搜索
  useEffect(() => {
    if (open) {
      setSearchQuery('');
    }
  }, [open]);

  if (!open) return null;

  const handleConfirm = () => {
    if (selected) onClose();
  };

  // 点击遮罩关闭
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  // 统计缺少 prompt 的风格数
  const hasPromptCount = filtered.filter((s) => s.prompt).length;
  const noPromptCount = filtered.length - hasPromptCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={handleBackdropClick} role="dialog" aria-modal="true" data-modal-overlay="" onWheel={(e) => e.stopPropagation()}>
      <div className="relative flex h-[85vh] w-[90vw] max-w-6xl flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-700 px-6 py-4">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-white">选择艺术风格</h2>
            <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-400">
              {filtered.length} 种风格
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search + Category tabs */}
        <div className="space-y-3 border-b border-zinc-800 px-6 py-3">
          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索风格名称、分类或提示词关键字..."
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 py-2 pl-10 pr-4 text-sm text-white placeholder:text-zinc-500 focus:border-purple-500 focus:outline-none"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Category tabs */}
          <div className="flex gap-1 overflow-x-auto">
            {styleCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                  activeCategory === cat
                    ? 'bg-purple-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Main content: grid + detail sidebar */}
        <div className="flex flex-1 overflow-hidden">
          {/* Style grid */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {filtered.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-zinc-500">
                没有找到匹配的风格
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4">
                {filtered.map((style) => {
                  const isSelected = selected === style.name;
                  const isHovered = hovered === style.name;
                  const hasPrompt = !!style.prompt;
                  return (
                    <button
                      key={style.name}
                      onClick={() => onSelect(style.name)}
                      onMouseEnter={() => setHovered(style.name)}
                      onMouseLeave={() => setHovered(null)}
                      className={`group relative flex flex-col overflow-hidden rounded-xl border transition-all hover:scale-[1.02] hover:shadow-lg ${
                        isSelected
                          ? 'border-purple-500 ring-2 ring-purple-500/40 shadow-purple-500/10'
                          : 'border-zinc-700/60 hover:border-zinc-500'
                      }`}
                    >
                      {/* Cover image */}
                      <div className="relative aspect-[3/4] w-full bg-zinc-800">
                        <Image
                          src={style.cover}
                          alt={style.name}
                          fill
                          className="object-cover transition-transform duration-300 group-hover:scale-105"
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 20vw"
                          unoptimized
                        />
                        {/* Hover overlay with name */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                        {/* Selected check */}
                        {isSelected && (
                          <div className="absolute inset-0 flex items-center justify-center bg-purple-600/30">
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-600 text-sm text-white shadow-lg">
                              ✓
                            </span>
                          </div>
                        )}
                        {/* Prompt badge */}
                        {hasPrompt && (
                          <div className="absolute right-2 top-2">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500/90 text-[9px] font-bold text-white shadow-sm" title="已配置提示词">
                              P
                            </span>
                          </div>
                        )}
                      </div>
                      {/* Name */}
                      <div className={`px-2.5 py-2.5 text-center text-xs font-medium leading-tight ${
                        isSelected ? 'bg-purple-600/10 text-purple-300' : 'text-zinc-300'
                      }`}>
                        <span className="line-clamp-1">{style.name}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Detail sidebar */}
          <div className="hidden w-72 shrink-0 overflow-hidden border-l border-zinc-800 lg:block">
            <div className="flex h-full flex-col overflow-y-auto p-4">
              {detailStyle ? (
                <>
                  {/* Preview image */}
                  <div className="relative mb-4 aspect-[3/4] w-full overflow-hidden rounded-xl bg-zinc-800">
                    <Image
                      src={detailStyle.cover}
                      alt={detailStyle.name}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>

                  {/* Style name */}
                  <h3 className="mb-2 text-base font-semibold text-white">{detailStyle.name}</h3>

                  {/* Categories */}
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {detailStyle.categories.map((cat) => (
                      <span
                        key={cat}
                        className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-[10px] font-medium text-zinc-400"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>

                  {/* Prompt preview */}
                  {detailStyle.prompt ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                        <span className="text-[10px] font-medium uppercase tracking-wider text-green-400">正向提示词</span>
                      </div>
                      <p className="break-words rounded-lg bg-zinc-800/60 p-3 text-[11px] leading-relaxed text-zinc-400">
                        {detailStyle.prompt}
                      </p>
                      {detailStyle.negativePrompt && (
                        <>
                          <div className="flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                            <span className="text-[10px] font-medium uppercase tracking-wider text-red-400">反向提示词</span>
                          </div>
                          <p className="break-words rounded-lg bg-zinc-800/60 p-3 text-[11px] leading-relaxed text-zinc-500">
                            {detailStyle.negativePrompt}
                          </p>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-zinc-700 p-3 text-center text-xs text-zinc-500">
                      此风格暂无专属提示词，将使用通用质量锚定词
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-full items-center justify-center text-center text-xs text-zinc-500">
                  <div>
                    <svg className="mx-auto mb-3 h-8 w-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    悬停风格卡片查看详情
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-700 px-6 py-4">
          <span className="text-xs text-zinc-500">
            {selected ? `已选择: ${selected}` : '请选择一种风格'} {noPromptCount > 0 && `· ${noPromptCount} 个风格缺少专属提示词`}
          </span>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="rounded-lg bg-zinc-800 px-5 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selected}
              className="rounded-lg bg-purple-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
            >
              确认选择
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
