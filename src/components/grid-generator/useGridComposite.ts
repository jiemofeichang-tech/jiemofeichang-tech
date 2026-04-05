"use client";

import { useCallback, useState } from "react";

interface UseGridCompositeOptions {
  imageUrls: string[];
  cols: number;
  cellWidth: number;
  cellHeight: number;
}

interface UseGridCompositeReturn {
  download: () => void;
  isCompositing: boolean;
}

export function useGridComposite({
  imageUrls,
  cols,
  cellWidth,
  cellHeight,
}: UseGridCompositeOptions): UseGridCompositeReturn {
  const [isCompositing, setIsCompositing] = useState(false);

  const download = useCallback(async () => {
    if (imageUrls.length === 0) return;
    setIsCompositing(true);

    try {
      const rows = Math.ceil(imageUrls.length / cols);
      const canvas = document.createElement("canvas");
      canvas.width = cellWidth * cols;
      canvas.height = cellHeight * rows;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context unavailable");

      // Load all images
      const images = await Promise.all(
        imageUrls.map(
          (url) =>
            new Promise<HTMLImageElement>((resolve, reject) => {
              const img = new Image();
              img.crossOrigin = "anonymous";
              img.onload = () => resolve(img);
              img.onerror = () => reject(new Error(`Failed to load: ${url}`));
              img.src = url;
            })
        )
      );

      // Draw each image at its grid position
      images.forEach((img, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        ctx.drawImage(img, col * cellWidth, row * cellHeight, cellWidth, cellHeight);
      });

      // Download
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `grid-${cols}x${Math.ceil(imageUrls.length / cols)}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    } catch (err) {
      console.error("Grid composite failed:", err);
    } finally {
      setIsCompositing(false);
    }
  }, [imageUrls, cols, cellWidth, cellHeight]);

  return { download, isCompositing };
}
