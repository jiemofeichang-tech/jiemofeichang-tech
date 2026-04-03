"use client";

import { useCallback, useState, useRef } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  Panel,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import CanvasToolbar from "./CanvasToolbar";
import AiChatPanel from "./AiChatPanel";
import ContextMenu from "./ContextMenu";
import { SCRIPT_ANALYSIS_PROMPT } from "./prompts";
import ScriptCard from "./cards/ScriptCard";
import CharacterCard from "./cards/CharacterCard";
import SceneCard from "./cards/SceneCard";
import StoryboardCard from "./cards/StoryboardCard";
import ProcessCard from "./cards/ProcessCard";
import ResultCard from "./cards/ResultCard";

// 卡片类型注册
const nodeTypes = {
  scriptCard: ScriptCard,
  characterCard: CharacterCard,
  sceneCard: SceneCard,
  storyboardCard: StoryboardCard,
  processCard: ProcessCard,
  resultCard: ResultCard,
};

// 行标题节点
function RowLabel({ data }: { data: { label: string; color: string } }) {
  return (
    <div style={{
      writingMode: "vertical-rl",
      textOrientation: "mixed",
      fontSize: 13,
      fontWeight: 700,
      color: data.color,
      letterSpacing: 4,
      padding: "12px 4px",
      userSelect: "none",
    }}>
      {data.label}
    </div>
  );
}

const allNodeTypes = { ...nodeTypes, rowLabel: RowLabel };

// 初始布局：按行排列
const ROW_Y = { script: 0, character: 250, scene: 500, storyboard: 750 };
const CARD_W = 200;
const CARD_GAP = 20;
const LABEL_X = 0;
const CONTENT_X = 60;

function buildInitialNodes(): Node[] {
  const nodes: Node[] = [];

  // 示例：文本输入 → AI 分析 → 角色结果
  nodes.push({
    id: "script-1",
    type: "scriptCard",
    position: { x: 50, y: 100 },
    data: { title: "第1集 剧本", content: "输入剧本文本，连线到 AI 分析节点..." },
  });

  nodes.push({
    id: "process-analysis",
    type: "processCard",
    position: { x: 350, y: 80 },
    data: { title: "AI 剧本分析", processType: "ai_analysis", model: "Opus 4.6", params: "3集 | 60s" },
  });

  nodes.push({
    id: "result-chars",
    type: "resultCard",
    position: { x: 680, y: 50 },
    data: { title: "角色设计结果", images: [] },
  });

  // 分镜流程
  nodes.push({
    id: "process-storyboard",
    type: "processCard",
    position: { x: 350, y: 320 },
    data: { title: "分镜生成", processType: "storyboard", model: "NanoBanana 2", params: "9:16 | 1080p" },
  });

  nodes.push({
    id: "result-storyboard",
    type: "resultCard",
    position: { x: 680, y: 300 },
    data: { title: "分镜图结果", images: [] },
  });

  // 视频流程
  nodes.push({
    id: "process-video",
    type: "processCard",
    position: { x: 1050, y: 180 },
    data: { title: "视频生成", processType: "text2video", model: "即梦 3.0", params: "9:16 | 5s" },
  });

  return nodes;
}

function buildInitialEdges(): Edge[] {
  return [
    { id: "e1", source: "script-1", target: "process-analysis", type: "smoothstep", animated: true, style: { stroke: "#7c3aed", strokeWidth: 2 } },
    { id: "e2", source: "process-analysis", target: "result-chars", type: "smoothstep", animated: true, style: { stroke: "#059669", strokeWidth: 2 } },
    { id: "e3", source: "process-analysis", target: "process-storyboard", type: "smoothstep", animated: true, style: { stroke: "#94a3b8", strokeWidth: 2 } },
    { id: "e4", source: "process-storyboard", target: "result-storyboard", type: "smoothstep", animated: true, style: { stroke: "#f59e0b", strokeWidth: 2 } },
    { id: "e5", source: "result-storyboard", target: "process-video", type: "smoothstep", animated: true, style: { stroke: "#94a3b8", strokeWidth: 2 } },
    { id: "e6", source: "result-chars", target: "process-video", type: "smoothstep", animated: true, style: { stroke: "#94a3b8", strokeWidth: 2 } },
  ];
}

export default function CanvasPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState(buildInitialNodes());
  const [edges, setEdges, onEdgesChange] = useEdgesState(buildInitialEdges());

  // 存储 ScriptCard 的文本内容
  const scriptTexts = useRef<Map<string, string>>(new Map());

  // 节点执行引擎
  const handleNodeRun = useCallback(async (nodeId: string, config: Record<string, string>) => {
    // 1. 设置节点为 running 状态
    setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, status: "running" } } : n));

    // 2. 找上游节点（通过连线）
    const incomingEdges = edges.filter((e) => e.target === nodeId);
    const sourceNodeIds = incomingEdges.map((e) => e.source);

    // 3. 从上游收集输入数据
    let inputText = "";
    for (const srcId of sourceNodeIds) {
      const srcNode = nodes.find((n) => n.id === srcId);
      if (srcNode?.type === "scriptCard") {
        inputText = scriptTexts.current.get(srcId) || (srcNode.data as Record<string, string>).content || "";
      }
    }

    // 4. 找下游节点（通过连线）
    const outgoingEdges = edges.filter((e) => e.source === nodeId);
    const targetNodeIds = outgoingEdges.map((e) => e.target);

    const backendBase = `http://${window.location.hostname}:8787`;

    try {
      if (config.processType === "ai_analysis") {
        // AI 剧本分析 — 使用专业分镜编剧提示词
        if (!inputText) {
          alert("请先在文本输入节点输入剧本内容");
          setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, status: undefined } } : n));
          return;
        }

        const modelMap: Record<string, string> = {
          "Opus 4.6": "claude-opus-4-6",
          "Sonnet 4.6": "claude-sonnet-4-6",
          "Gemini Pro": "gemini-2.5-pro",
        };

        // 注入集数和总时长到提示词
        const episodeHint = config.episodes ? `\n\n用户要求分 ${config.episodes}。` : "";
        const durationHint = config.totalDuration ? `总时长约 ${config.totalDuration}。` : "";

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000); // 10分钟超时
        const res = await fetch(`${backendBase}/api/ai/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            model: modelMap[config.model] || "claude-opus-4-6",
            max_tokens: 16000,
            messages: [{
              role: "user",
              content: `${SCRIPT_ANALYSIS_PROMPT}${episodeHint}${durationHint}\n\n以下是用户的剧本原文：\n\n${inputText}`,
            }],
          }),
        });
        clearTimeout(timeoutId);
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || "";

        // 把结果写入下游结果节点
        setNodes((nds) => nds.map((n) => {
          if (n.id === nodeId) return { ...n, data: { ...n.data, status: "done" } };
          if (targetNodeIds.includes(n.id) && n.type === "resultCard") {
            return { ...n, data: { ...n.data, title: "分镜技术指令单", content } };
          }
          return n;
        }));
      } else {
        // 其他类型暂时模拟
        await new Promise((r) => setTimeout(r, 2000));
        setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, status: "done" } } : n));
      }
    } catch (err) {
      setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, status: "error" } } : n));
      alert(`执行失败: ${(err as Error).message}`);
    }
  }, [nodes, edges, setNodes]);

  // 给所有 ProcessCard 注入 onRun 回调
  const nodesWithCallbacks = nodes.map((n) => {
    if (n.type === "processCard") {
      return { ...n, data: { ...n.data, onRun: handleNodeRun } };
    }
    if (n.type === "scriptCard") {
      return { ...n, data: { ...n.data, onTextChange: (text: string) => scriptTexts.current.set(n.id, text) } };
    }
    return n;
  });

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({
      ...params,
      type: "smoothstep",
      animated: true,
      style: { stroke: "#7c3aed", strokeWidth: 2 },
    }, eds)),
    [setEdges],
  );
  const [chatOpen, setChatOpen] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; flowX: number; flowY: number; edgeId?: string } | null>(null);
  const idCounter = useRef(100);

  // 添加卡片
  const addCard = useCallback((type: string, row: keyof typeof ROW_Y) => {
    idCounter.current++;
    const existingInRow = nodes.filter((n) => n.position.y >= ROW_Y[row] && n.position.y < ROW_Y[row] + 200 && n.type !== "rowLabel");
    const x = CONTENT_X + existingInRow.length * (CARD_W + CARD_GAP);

    const newNode: Node = {
      id: `${type}-${idCounter.current}`,
      type,
      position: { x, y: ROW_Y[row] },
      data: { title: `新${type === "scriptCard" ? "剧本" : type === "characterCard" ? "角色" : type === "sceneCard" ? "场景" : "分镜"}`, content: "" },
    };
    setNodes((nds) => [...nds, newNode]);
  }, [nodes, setNodes]);

  // AI 生成回调
  const onAiGenerate = useCallback((result: { type: string; cards: { title: string; content: string; imageUrl?: string }[] }) => {
    const row = result.type === "script" ? "script"
      : result.type === "character" ? "character"
      : result.type === "scene" ? "scene"
      : "storyboard";

    const newNodes: Node[] = result.cards.map((card, i) => {
      idCounter.current++;
      const existingInRow = nodes.filter((n) => n.position.y >= ROW_Y[row] && n.position.y < ROW_Y[row] + 200 && n.type !== "rowLabel");
      return {
        id: `${result.type}Card-${idCounter.current}`,
        type: `${result.type}Card`,
        position: { x: CONTENT_X + (existingInRow.length + i) * (CARD_W + CARD_GAP), y: ROW_Y[row] },
        data: card,
      };
    });
    setNodes((nds) => [...nds, ...newNodes]);
  }, [nodes, setNodes]);

  return (
    <div style={{ display: "flex", width: "100%", height: "calc(100vh - 40px)", background: "#0a0a14" }}>
      {/* 左侧工具栏 */}
      <CanvasToolbar onAddCard={addCard} />

      {/* 中间画布 */}
      <div style={{ flex: 1, position: "relative" }}>
        <ReactFlow
          nodes={nodesWithCallbacks}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={allNodeTypes}
          defaultEdgeOptions={{ type: "smoothstep" }}
          fitView
          style={{ background: "#0a0a14" }}
          minZoom={0.05}
          maxZoom={2}
          defaultViewport={{ x: 0, y: 0, zoom: 0.6 }}
          onEdgeContextMenu={(event, edge) => {
            event.preventDefault();
            setContextMenu({ x: event.clientX, y: event.clientY, flowX: 0, flowY: 0, edgeId: edge.id });
          }}
          onPaneContextMenu={(event) => {
            event.preventDefault();
            setContextMenu({ x: event.clientX, y: event.clientY, flowX: event.clientX - 300, flowY: event.clientY - 100 });
          }}
          onPaneClick={() => setContextMenu(null)}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1a1a2e" />
          <Controls style={{ background: "#1e1e2e", border: "1px solid #333", borderRadius: 8 }} />
          <MiniMap
            style={{ background: "#1e1e2e", border: "1px solid #333", borderRadius: 8 }}
            nodeColor={(n) => {
              if (n.type === "scriptCard") return "#7c3aed";
              if (n.type === "characterCard") return "#059669";
              if (n.type === "sceneCard") return "#2563eb";
              if (n.type === "storyboardCard") return "#f59e0b";
              return "#333";
            }}
          />

          {/* 顶部标题栏 */}
          <Panel position="top-center">
            <div style={{
              background: "#1e1e2e99",
              border: "1px solid #333",
              borderRadius: 8,
              padding: "6px 20px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              backdropFilter: "blur(8px)",
            }}>
              <span style={{ color: "#ccc", fontSize: 13, fontWeight: 600 }}>AI 漫剧故事板</span>
              <button
                onClick={() => setChatOpen(!chatOpen)}
                style={{
                  padding: "3px 10px",
                  borderRadius: 5,
                  border: "1px solid #7c3aed",
                  background: chatOpen ? "#7c3aed33" : "transparent",
                  color: "#c084fc",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {chatOpen ? "收起 AI" : "展开 AI"}
              </button>
            </div>
          </Panel>
        </ReactFlow>

        {/* 右键菜单 */}
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={() => setContextMenu(null)}
            items={contextMenu.edgeId ? [
              { label: "删除连线", shortcut: "Del", onClick: () => setEdges((eds) => eds.filter((e) => e.id !== contextMenu.edgeId)) },
            ] : [
              { label: "插入文本节点", shortcut: "T", onClick: () => addCard("scriptCard", "script") },
              { label: "插入处理节点", shortcut: "P", onClick: () => addCard("processCard", "character") },
              { label: "插入角色节点", shortcut: "C", onClick: () => addCard("characterCard", "character") },
              { label: "插入场景节点", shortcut: "S", onClick: () => addCard("sceneCard", "scene") },
              { label: "插入分镜节点", shortcut: "B", onClick: () => addCard("storyboardCard", "storyboard") },
              { label: "插入结果节点", shortcut: "R", onClick: () => addCard("resultCard", "storyboard") },
              { label: "添加组", shortcut: "", onClick: () => {} },
              { label: "显示所有内容", shortcut: "⇧+C", onClick: () => {}, divider: true },
              { label: "复制", shortcut: "", onClick: () => {}, divider: true },
              { label: "粘贴", shortcut: "", onClick: () => {} },
              { label: "添加到视频编辑器", shortcut: "", onClick: () => {}, disabled: true, divider: true },
            ]}
          />
        )}
      </div>

      {/* 右侧 AI 面板 */}
      {chatOpen && <AiChatPanel onGenerate={onAiGenerate} />}
    </div>
  );
}
