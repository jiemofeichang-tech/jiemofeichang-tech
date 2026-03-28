"use client";
import type { WfCharacter } from "@/lib/api";
import CanvasBlock from "./CanvasBlock";

interface CharacterCardProps {
  character: WfCharacter;
  onEdit: () => void;
  onRegenerate: () => void;
  isSelected: boolean;
}

function ImageSlot({ src, label }: { src: string | null; label: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          width: 120,
          height: 180,
          background: "#252535",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          border: "1px solid #333",
        }}
      >
        {src ? (
          <img src={src} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ color: "#555", fontSize: 24 }}>?</span>
        )}
      </div>
      <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{label}</div>
    </div>
  );
}

export default function CharacterCard({ character, onEdit, onRegenerate, isSelected }: CharacterCardProps) {
  return (
    <CanvasBlock
      title={`角色: ${character.name}`}
      status={character.status}
      onEdit={onEdit}
      onRegenerate={onRegenerate}
      highlight={isSelected}
    >
      <p style={{ fontSize: 12, color: "#aaa", marginBottom: 10 }}>
        {character.description.slice(0, 120)}
        {character.description.length > 120 ? "..." : ""}
      </p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <ImageSlot src={character.front_view} label="正面" />
        <ImageSlot src={character.side_view} label="侧面" />
        <ImageSlot src={character.back_view} label="背面" />
      </div>
      {character.expression_sheet && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>表情合集</div>
          <img
            src={character.expression_sheet}
            alt="表情合集"
            style={{ width: "100%", maxHeight: 100, objectFit: "cover", borderRadius: 6 }}
          />
        </div>
      )}
    </CanvasBlock>
  );
}
