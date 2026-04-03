"use client";
import { memo } from "react";
import { Handle, Position } from "@xyflow/react";

function CharacterCard({ data }: { data: { title?: string; content?: string; imageUrl?: string } }) {
  return (
    <div style={{
      width: 180, minHeight: 220, background: "#fff", borderRadius: 10,
      border: "1px solid #e0e0d0", overflow: "visible", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", position: "relative",
    }}>
      {data.imageUrl ? (
        <div style={{ width: "100%", height: 140, background: "#f5f5f0" }}>
          <img src={data.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "10px 10px 0 0" }} />
        </div>
      ) : (
        <div style={{ width: "100%", height: 140, background: "#05966911", display: "flex", alignItems: "center", justifyContent: "center", color: "#059669", fontSize: 32, borderRadius: "10px 10px 0 0" }}>🧑</div>
      )}
      <div style={{ padding: "8px 10px", borderTop: "1px solid #e0e0d0" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#333" }}>{data.title || "角色"}</div>
        <div style={{ fontSize: 9, color: "#999", marginTop: 2 }}>{data.content || "正面 · 侧面 · 背面"}</div>
      </div>
      <Handle type="target" position={Position.Left} style={{ width: 10, height: 10, background: "#94a3b8", border: "2px solid #fff" }} />
      <Handle type="source" position={Position.Right} style={{ width: 10, height: 10, background: "#059669", border: "2px solid #fff" }} />
    </div>
  );
}
export default memo(CharacterCard);
