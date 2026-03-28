"use client";
import type { WfScene } from "@/lib/api";
import CanvasBlock from "./CanvasBlock";

interface SceneCardProps {
  scene: WfScene;
  onEdit: () => void;
  onRegenerate: () => void;
  isSelected: boolean;
}

const VIEW_LABELS: Record<string, string> = {
  front: "正面",
  back: "背面",
  left: "左侧",
  right: "右侧",
  top: "俯视",
  detail: "细节",
};

export default function SceneCard({ scene, onEdit, onRegenerate, isSelected }: SceneCardProps) {
  const viewEntries = Object.entries(scene.views || {});
  const hasAnyView = viewEntries.some(([, v]) => v);

  return (
    <CanvasBlock
      title={`场景: ${scene.name}`}
      status={scene.status}
      onEdit={onEdit}
      onRegenerate={onRegenerate}
      highlight={isSelected}
    >
      <p style={{ fontSize: 12, color: "#aaa", marginBottom: 10 }}>
        {scene.description.slice(0, 120)}
        {scene.description.length > 120 ? "..." : ""}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(hasAnyView ? viewEntries : Object.entries(VIEW_LABELS).map(([k]) => [k, null] as [string, string | null])).map(
          ([key, url]) => (
            <div key={key} style={{ textAlign: "center" }}>
              <div
                style={{
                  width: 100,
                  height: 60,
                  background: "#252535",
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  border: "1px solid #333",
                }}
              >
                {url ? (
                  <img src={url} alt={VIEW_LABELS[key] || key} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ color: "#444", fontSize: 10 }}>?</span>
                )}
              </div>
              <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>{VIEW_LABELS[key] || key}</div>
            </div>
          ),
        )}
      </div>
    </CanvasBlock>
  );
}
