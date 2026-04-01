'use client';

import { useState, useEffect } from 'react';
import { checkPromptLength, type PromptLengthCheck } from '@/lib/prompt-system';

interface PromptEditorProps {
  stylePrompt: string;
  negativePrompt: string;
  manuallyEdited: boolean;
  conflictWarning: string | null;
  onEdit: (stylePrompt: string, negativePrompt: string) => void;
  onReset: () => void;
}

export default function PromptEditor({
  stylePrompt,
  negativePrompt,
  manuallyEdited,
  conflictWarning,
  onEdit,
  onReset,
}: PromptEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const [localStyle, setLocalStyle] = useState(stylePrompt);
  const [localNeg, setLocalNeg] = useState(negativePrompt);

  // Sync from parent when not editing (intentionally skip sync while expanded to avoid disrupting user edits)
  useEffect(() => {
    if (!expanded) {
      setLocalStyle(stylePrompt);
      setLocalNeg(negativePrompt);
    }
  }, [stylePrompt, negativePrompt, expanded]);

  const lengthCheck: PromptLengthCheck = checkPromptLength(localStyle, localNeg);

  const handleConfirmEdit = () => {
    if (!localStyle.trim()) return;
    onEdit(localStyle, localNeg);
    setExpanded(false);
  };

  const handleCancel = () => {
    setLocalStyle(stylePrompt);
    setLocalNeg(negativePrompt);
    setExpanded(false);
  };

  const handleReset = () => {
    onReset();
    setExpanded(false);
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-zinc-300">提示词预览</h3>

      {/* Conflict warning */}
      {conflictWarning && (
        <div className="rounded-lg border border-amber-600/40 bg-amber-900/20 px-4 py-3 text-xs text-amber-300">
          {conflictWarning}
        </div>
      )}

      {/* Collapsed preview */}
      {!expanded && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-800/60 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs text-zinc-400">
              {manuallyEdited ? (
                <span className="rounded bg-amber-600/20 px-2 py-0.5 text-amber-400">已手动编辑</span>
              ) : (
                <span className="rounded bg-green-600/20 px-2 py-0.5 text-green-400">自动合成</span>
              )}
              <span>~{lengthCheck.totalTokens} tokens</span>
            </span>
          </div>
          <p className="line-clamp-2 text-xs leading-relaxed text-zinc-300">
            {stylePrompt || '(请先选择风格)'}
          </p>
          {stylePrompt && (
            <button
              onClick={() => setExpanded(true)}
              className="mt-3 text-xs font-medium text-purple-400 transition-colors hover:text-purple-300"
            >
              展开高级编辑
            </button>
          )}
        </div>
      )}

      {/* Expanded editor */}
      {expanded && (
        <div className="rounded-xl border border-purple-600/40 bg-zinc-800/80 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-purple-300">高级编辑 — 风格提示词</span>
            {manuallyEdited && (
              <button
                onClick={handleReset}
                className="rounded bg-zinc-700 px-3 py-1 text-xs text-zinc-300 transition-colors hover:bg-zinc-600"
              >
                还原默认
              </button>
            )}
          </div>

          {/* Style prompt textarea */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400">正向提示词</label>
            <textarea
              value={localStyle}
              onChange={(e) => setLocalStyle(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:border-purple-500 focus:outline-none"
              placeholder="输入风格正向提示词..."
            />
          </div>

          {/* Negative prompt textarea */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400">反面提示词</label>
            <textarea
              value={localNeg}
              onChange={(e) => setLocalNeg(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:border-purple-500 focus:outline-none"
              placeholder="输入反面提示词..."
            />
          </div>

          {/* Length check */}
          <div className={`text-xs ${lengthCheck.ok ? 'text-zinc-500' : 'text-amber-400'}`}>
            {lengthCheck.ok
              ? `约 ${lengthCheck.totalTokens} / 350 tokens`
              : lengthCheck.warning}
          </div>

          {/* Validation */}
          {!localStyle.trim() && (
            <p className="text-xs text-red-400">提示词不能为空</p>
          )}

          {/* Warning about override */}
          <p className="text-[10px] text-zinc-500">
            手动修改后，重新选择风格将覆盖你的编辑内容
          </p>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleConfirmEdit}
              disabled={!localStyle.trim()}
              className="rounded-lg bg-purple-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
            >
              确认修改
            </button>
            <button
              onClick={handleCancel}
              className="rounded-lg bg-zinc-700 px-4 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-600"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
