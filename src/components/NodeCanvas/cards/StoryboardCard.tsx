"use client";
import { memo } from "react";
import { Handle, Position } from "@xyflow/react";

function StoryboardCard({ data }: { data: { title?: string; content?: string; imageUrl?: string; shotType?: string } }) {
  return (
    <div style={{
      width: 140, minHeight: 200, background: "#fff", borderRadius: 8,
      border: "2px solid #f59e0b44", overflow: "visible", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", position: "relative",
    }}>
      {data.imageUrl ? (
        <div style={{ width: "100%", height: 170, background: "#f5f5f0" }}>
          <img src={data.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "6px 6px 0 0" }} />
        </div>
      ) : (
        <div style={{ width: "100%", height: 170, background: "#f59e0b08", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <span style={{ fontSize: 24, color: "#f59e0b" }}>🖼️</span>
          <span style={{ fontSize: 9, color: "#bbb" }}>分镜图</span>
        </div>
      )}
      <div style={{ padding: "6px 8px", borderTop: "1px solid #f0f0e0" }}>
        {data.shotType && <span style={{ fontSize: 9, background: "#f59e0b22", color: "#f59e0b", padding: "1px 6px", borderRadius: 3, fontWeight: 600 }}>{data.shotType}</span>}
        <div style={{ fontSize: 9, color: "#666", marginTop: 3, lineHeight: 1.4 }}>{data.content?.slice(0, 40) || data.title || ""}</div>
      </div>
      <Handle type="target" position={Position.Left} style={{ width: 10, height: 10, background: "#94a3b8", border: "2px solid #fff" }} />
      <Handle type="source" position={Position.Right} style={{ width: 10, height: 10, background: "#f59e0b", border: "2px solid #fff" }} />
    </div>
  );
}
export default memo(StoryboardCard);
