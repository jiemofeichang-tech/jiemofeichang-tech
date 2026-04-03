"use client";
import { memo } from "react";
import { Handle, Position } from "@xyflow/react";

function ResultCard({ data }: { data: { title?: string; images?: string[]; content?: string } }) {
  const hasImages = data.images && data.images.length > 0;
  const hasContent = !!data.content;

  return (
    <div style={{
      width: 280, background: "#fff", borderRadius: 10, border: "1px solid #e0e0d0",
      boxShadow: "0 2px 8px rgba(0,0,0,0.08)", overflow: "visible", position: "relative",
    }}>
      <div style={{
        padding: "8px 12px", fontSize: 12, fontWeight: 600, color: "#333",
        borderBottom: "1px solid #f0f0e8",
      }}>
        {data.title || "生成结果"}
      </div>

      <div style={{ padding: 8 }}>
        {hasImages && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {data.images!.map((img, i) => (
              <div key={i}>
                <div style={{ fontSize: 9, color: "#999", marginBottom: 2 }}>结果{i + 1}</div>
                <img src={img} alt="" style={{ width: 120, height: 160, objectFit: "cover", borderRadius: 6, border: "1px solid #eee" }} />
              </div>
            ))}
          </div>
        )}

        {!hasImages && hasContent && (
          <div className="nowheel nodrag nopan" style={{
            width: "100%", maxHeight: 200, overflow: "auto", background: "#f8f8f4",
            borderRadius: 6, padding: 8, fontSize: 10, color: "#333", lineHeight: 1.5, whiteSpace: "pre-wrap",
          }}>
            {data.content}
          </div>
        )}

        {!hasImages && !hasContent && (
          <div style={{
            width: "100%", height: 120, background: "#f8f8f4", borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center", color: "#ccc", fontSize: 12,
          }}>
            等待生成...
          </div>
        )}
      </div>

      <Handle type="target" position={Position.Left} style={{ width: 12, height: 12, background: "#94a3b8", border: "2px solid #fff" }} />
      <Handle type="source" position={Position.Right} style={{ width: 12, height: 12, background: "#4ade80", border: "2px solid #fff" }} />
    </div>
  );
}

export default memo(ResultCard);
