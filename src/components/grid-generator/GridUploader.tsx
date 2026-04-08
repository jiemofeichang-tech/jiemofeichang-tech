"use client";

import { useCallback, useRef, useState } from "react";

interface RefImage {
  base64: string;
  width: number;
  height: number;
  mime: string;
}

interface GridUploaderProps {
  onUpload: (image: RefImage) => void;
}

export default function GridUploader({ onUpload }: GridUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const rawBase64 = e.target?.result as string;

        const img = new Image();
        img.onload = () => {
          const origW = img.naturalWidth;
          const origH = img.naturalHeight;
          setDimensions({ w: origW, h: origH });

          // Compress if larger than 2048px on any side (keeps aspect ratio)
          const MAX_DIM = 2048;
          let w = origW, h = origH;
          if (w > MAX_DIM || h > MAX_DIM) {
            const scale = Math.min(MAX_DIM / w, MAX_DIM / h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
          }

          if (w !== origW || h !== origH) {
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(img, 0, 0, w, h);
            const compressed = canvas.toDataURL("image/jpeg", 0.85);
            setPreview(compressed);
            onUpload({ base64: compressed, width: w, height: h, mime: "image/jpeg" });
          } else {
            setPreview(rawBase64);
            onUpload({ base64: rawBase64, width: origW, height: origH, mime: file.type });
          }
        };
        img.src = rawBase64;
      };
      reader.readAsDataURL(file);
    },
    [onUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  return (
    <div className="flex flex-col items-center gap-6">
      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`w-full max-w-lg aspect-square rounded-2xl border-2 border-dashed cursor-pointer
          flex flex-col items-center justify-center gap-4 transition-all
          ${
            isDragging
              ? "border-orange-400 bg-orange-500/10"
              : "border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/10"
          }`}
      >
        {preview ? (
          <div className="relative w-full h-full p-4">
            <img
              src={preview}
              alt="预览"
              className="w-full h-full object-contain rounded-lg"
            />
            {dimensions && (
              <div className="absolute bottom-6 right-6 px-2 py-1 bg-black/60 rounded text-xs text-white/80">
                {dimensions.w} x {dimensions.h}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-white/40"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-white/60 text-sm">拖拽图片到这里，或点击上传</p>
              <p className="text-white/30 text-xs mt-1">支持 PNG / JPG / WebP</p>
            </div>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
