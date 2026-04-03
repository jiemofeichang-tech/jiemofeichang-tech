"use client";
import { memo, useState } from "react";
import { Handle, Position } from "@xyflow/react";

function ScriptCard({ data }: { data: { title?: string; content?: string; onTextChange?: (text: string) => void } }) {
  const [text, setText] = useState(data.content || "");
  const handleChange = (val: string) => { setText(val); data.onTextChange?.(val); };

  return (
    <div style={{
      width: 220,
      minHeight: 160,
      background: "#fff",
      borderRadius: 10,
      border: "1px solid #e0e0d0",
      overflow: "visible",
      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      position: "relative",
    }}>
      <div style={{
        fontSize: 11,
        color: "#7c3aed",
        padding: "4px 10px",
        fontWeight: 600,
      }}>
        文本输入
      </div>
      {/* nowheel + nodrag + nopan 阻止 ReactFlow 拦截输入事件 */}
      <div className="nowheel nodrag nopan" style={{ padding: "0 8px 4px" }}>
        <textarea
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onPaste={(e) => e.stopPropagation()}
          onCopy={(e) => e.stopPropagation()}
          onCut={(e) => e.stopPropagation()}
          onFocus={(e) => e.stopPropagation()}
          placeholder="在此输入剧本或描述文本..."
          style={{
            width: "100%",
            minHeight: 80,
            background: "#fafaf6",
            border: "1px solid #eee",
            borderRadius: 6,
            color: "#333",
            fontSize: 11,
            padding: 8,
            resize: "vertical",
            outline: "none",
            lineHeight: 1.6,
          }}
        />
      </div>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "2px 10px 6px",
      }}>
        <span style={{ fontSize: 9, color: "#bbb" }}>{text.length} 字</span>
        <div style={{ display: "flex", gap: 6 }}>
          <span style={{ fontSize: 12, cursor: "pointer", color: "#999" }}>🗑</span>
          <span style={{ fontSize: 12, cursor: "pointer", color: "#999" }}>✏️</span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 12,
          height: 12,
          background: "#3b82f6",
          border: "2px solid #fff",
          boxShadow: "0 0 4px rgba(59,130,246,0.5)",
        }}
      />
    </div>
  );
}

export default memo(ScriptCard);
