"use client";

import type { ReactNode } from "react";

interface AssetGridProps {
  children: ReactNode;
}

export default function AssetGrid({ children }: AssetGridProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: 20,
      }}
    >
      {children}
    </div>
  );
}
