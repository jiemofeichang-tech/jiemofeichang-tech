"use client";

import { useCallback, useEffect, useState, useRef } from "react";
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
import StylePresetCard from "./cards/StylePresetCard";

// 卡片类型注册（组件外定义，避免 React Flow 警告）
const allNodeTypes = {
  scriptCard: ScriptCard,
  characterCard: CharacterCard,
  sceneCard: SceneCard,
  storyboardCard: StoryboardCard,
  processCard: ProcessCard,
  resultCard: ResultCard,
  stylePresetCard: StylePresetCard,
};

// 布局常量
const ROW_Y = { script: 0, character: 250, scene: 500, storyboard: 750 };
const CARD_W = 200;
const CARD_GAP = 20;
const CONTENT_X = 60;

// ---------------------------------------------------------------------------
// localStorage 持久化
// ---------------------------------------------------------------------------
const STORAGE_KEY = "nodecanvas-state-v2";

/** 回调函数 key 列表，保存时需要过滤掉（不可序列化） */
const CALLBACK_KEYS = new Set(["onRun", "onTextChange", "onStyleChange"]);

function loadSavedState(): { nodes: Node[]; edges: Edge[] } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) return parsed;
    return null;
  } catch {
    return null;
  }
}

function saveState(nodes: Node[], edges: Edge[]) {
  try {
    const cleanNodes = nodes.map(({ data, ...rest }) => {
      const cleanData: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
        if (!CALLBACK_KEYS.has(k)) cleanData[k] = v;
      }
      return { ...rest, data: cleanData };
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes: cleanNodes, edges }));
  } catch {
    // 静默失败（localStorage 满等）
  }
}

// ---------------------------------------------------------------------------
// 初始布局：串行流程
// 剧本 → 风格预设 ─┐
//                    ├→ AI 分析 → 角色结果 → 分镜生成 → 分镜结果 → 视频生成
// ---------------------------------------------------------------------------
function buildInitialNodes(): Node[] {
  return [
    // 第 1 列：文本输入
    {
      id: "script-1",
      type: "scriptCard",
      position: { x: 50, y: 120 },
      data: { title: "第1集 剧本", content: "" },
    },
    // 第 2 列：风格预设（紧跟文本后面）
    {
      id: "style-preset",
      type: "stylePresetCard",
      position: { x: 50, y: 340 },
      data: { title: "全局风格", selectedStyle: "anime" },
    },
    // 第 3 列：AI 剧本分析
    {
      id: "process-analysis",
      type: "processCard",
      position: { x: 350, y: 100 },
      data: { title: "AI 剧本分析", processType: "ai_analysis", model: "Opus 4.6" },
    },
    // 第 4 列：角色设计结果
    {
      id: "result-chars",
      type: "resultCard",
      position: { x: 680, y: 80 },
      data: { title: "角色设计结果", images: [] },
    },
    // 第 5 列：分镜生成（串行在角色之后）
    {
      id: "process-storyboard",
      type: "processCard",
      position: { x: 1020, y: 100 },
      data: { title: "分镜生成", processType: "storyboard", model: "NanoBanana 2" },
    },
    // 第 6 列：分镜结果
    {
      id: "result-storyboard",
      type: "resultCard",
      position: { x: 1350, y: 80 },
      data: { title: "分镜图结果", images: [] },
    },
    // 第 7 列：视频生成
    {
      id: "process-video",
      type: "processCard",
      position: { x: 1690, y: 100 },
      data: { title: "视频生成", processType: "text2video", model: "即梦 3.0" },
    },
    // 角色节点（画布下方）
    {
      id: "character-default",
      type: "characterCard",
      position: { x: 850, y: 480 },
      data: { title: "新角色", content: "正面 · 侧面 · 背面" },
    },
    // 场景节点（画布下方）
    {
      id: "scene-default",
      type: "sceneCard",
      position: { x: 600, y: 480 },
      data: { title: "新场景", content: "场景描述" },
    },
  ];
}

function buildInitialEdges(): Edge[] {
  const edge = (id: string, source: string, target: string, color: string): Edge => ({
    id, source, target, type: "smoothstep", animated: true,
    style: { stroke: color, strokeWidth: 2 },
  });

  return [
    // 剧本 → AI 分析
    edge("e1", "script-1", "process-analysis", "#7c3aed"),
    // 风格 → AI 分析（风格上下文注入）
    edge("e-style", "style-preset", "process-analysis", "#059669"),
    // AI 分析 → 角色结果
    edge("e2", "process-analysis", "result-chars", "#059669"),
    // 角色结果 → 分镜生成（串行：先角色后分镜）
    edge("e3", "result-chars", "process-storyboard", "#f59e0b"),
    // 风格 → 分镜生成（风格上下文注入）
    edge("e-style-sb", "style-preset", "process-storyboard", "#059669"),
    // 分镜生成 → 分镜结果
    edge("e4", "process-storyboard", "result-storyboard", "#f59e0b"),
    // 分镜结果 → 视频生成
    edge("e5", "result-storyboard", "process-video", "#dc2626"),
    // 风格 → 视频生成（风格上下文注入）
    edge("e-style-vid", "style-preset", "process-video", "#059669"),
  ];
}

export default function CanvasPage() {
  const [savedState] = useState(loadSavedState);
  const [nodes, setNodes, onNodesChange] = useNodesState(savedState?.nodes ?? buildInitialNodes());
  const [edges, setEdges, onEdgesChange] = useEdgesState(savedState?.edges ?? buildInitialEdges());

  // 存储 ScriptCard 的文本内容
  const scriptTexts = useRef<Map<string, string>>(new Map());
  // 存储 StylePresetCard 的选中风格
  const styleSelections = useRef<Map<string, string>>(new Map());

  // 自动保存到 localStorage（防抖 500ms）
  useEffect(() => {
    const timer = setTimeout(() => saveState(nodes, edges), 500);
    return () => clearTimeout(timer);
  }, [nodes, edges]);

  // ---------------------------------------------------------------------------
  // 递归从上游收集上下文（剧本文本、风格、角色结果）
  // ---------------------------------------------------------------------------
  const collectUpstreamContext = useCallback((nodeId: string, currentNodes: Node[], currentEdges: Edge[]) => {
    const ctx: { inputText: string; style: string; characterContent: string } = {
      inputText: "",
      style: "",
      characterContent: "",
    };

    const visited = new Set<string>();
    const queue = [nodeId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const incoming = currentEdges.filter((e) => e.target === current);
      for (const edge of incoming) {
        const srcNode = currentNodes.find((n) => n.id === edge.source);
        if (!srcNode) continue;

        if (srcNode.type === "scriptCard") {
          ctx.inputText = scriptTexts.current.get(srcNode.id)
            || (srcNode.data as Record<string, string>).content || "";
        }
        if (srcNode.type === "stylePresetCard") {
          ctx.style = styleSelections.current.get(srcNode.id)
            || (srcNode.data as Record<string, string>).selectedStyle || "";
        }
        if (srcNode.type === "resultCard") {
          const content = (srcNode.data as Record<string, string>).content;
          if (content) ctx.characterContent = content;
        }

        queue.push(srcNode.id);
      }
    }

    return ctx;
  }, []);

  // ---------------------------------------------------------------------------
  // 节点执行引擎
  // ---------------------------------------------------------------------------
  const handleNodeRun = useCallback(async (nodeId: string, config: Record<string, string>) => {
    setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, status: "running" } } : n));

    // 从上游递归收集上下文
    const ctx = collectUpstreamContext(nodeId, nodes, edges);

    // 找下游节点
    const targetNodeIds = edges.filter((e) => e.source === nodeId).map((e) => e.target);

    const backendBase = `http://127.0.0.1:8787`;

    try {
      if (config.processType === "ai_analysis") {
        if (!ctx.inputText) {
          alert("请先在文本输入节点输入剧本内容");
          setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, status: undefined } } : n));
          return;
        }

        const modelMap: Record<string, string> = {
          "Opus 4.6": "claude-opus-4-6",
          "Sonnet 4.6": "claude-sonnet-4-6",
          "Gemini Pro": "gemini-2.5-pro",
        };

        const episodeHint = config.episodes ? `\n\n用户要求分 ${config.episodes}。` : "";
        const durationHint = config.totalDuration ? `总时长约 ${config.totalDuration}。` : "";
        const styleHint = ctx.style ? `\n\n全局风格预设：${ctx.style}。所有角色设计和分镜描述都必须严格遵循该风格。` : "";

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000);
        const res = await fetch(`${backendBase}/api/ai/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            model: modelMap[config.model] || "claude-opus-4-6",
            max_tokens: 16000,
            messages: [{
              role: "user",
              content: `${SCRIPT_ANALYSIS_PROMPT}${episodeHint}${durationHint}${styleHint}\n\n以下是用户的剧本原文：\n\n${ctx.inputText}`,
            }],
          }),
        });
        clearTimeout(timeoutId);
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || "";

        setNodes((nds) => nds.map((n) => {
          if (n.id === nodeId) return { ...n, data: { ...n.data, status: "done" } };
          if (targetNodeIds.includes(n.id) && n.type === "resultCard") {
            return { ...n, data: { ...n.data, title: "角色设计结果", content } };
          }
          return n;
        }));
      } else if (config.processType === "storyboard") {
        // 分镜生成：确保有角色上下文
        if (!ctx.characterContent) {
          alert("请先完成角色设计（确保上游角色结果节点有内容）");
          setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, status: undefined } } : n));
          return;
        }

        const styleHint = ctx.style ? `\n全局风格：${ctx.style}` : "";

        // 暂时模拟分镜生成（后续接真实 API）
        await new Promise((r) => setTimeout(r, 2000));

        setNodes((nds) => nds.map((n) => {
          if (n.id === nodeId) return { ...n, data: { ...n.data, status: "done" } };
          if (targetNodeIds.includes(n.id) && n.type === "resultCard") {
            return {
              ...n,
              data: {
                ...n.data,
                title: "分镜图结果",
                content: `[基于角色设计生成的分镜]${styleHint}\n\n角色上下文已注入，分镜将保持人物一致性。\n\n（接入图像生成 API 后将输出实际分镜图）`,
              },
            };
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
  }, [nodes, edges, setNodes, collectUpstreamContext]);

  // 给节点注入回调
  const nodesWithCallbacks = nodes.map((n) => {
    if (n.type === "processCard") {
      return { ...n, data: { ...n.data, onRun: handleNodeRun } };
    }
    if (n.type === "scriptCard") {
      return { ...n, data: { ...n.data, onTextChange: (text: string) => scriptTexts.current.set(n.id, text) } };
    }
    if (n.type === "stylePresetCard") {
      return {
        ...n,
        data: {
          ...n.data,
          onStyleChange: (styleId: string) => styleSelections.current.set(n.id, styleId),
        },
      };
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

    const labelMap: Record<string, string> = {
      scriptCard: "剧本", characterCard: "角色", sceneCard: "场景",
      storyboardCard: "分镜", stylePresetCard: "风格预设",
    };

    const newNode: Node = {
      id: `${type}-${idCounter.current}`,
      type,
      position: { x, y: ROW_Y[row] },
      data: { title: `新${labelMap[type] || "节点"}`, content: "" },
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
    <div style={{ display: "flex", width: "100%", height: "100%", background: "#0a0a14" }}>
      {/* 左侧工具栏 */}
      <CanvasToolbar onAddCard={addCard} />

      {/* 中间画布 */}
      <div style={{ flex: 1, position: "relative", height: "100%", minHeight: 0 }}>
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
              if (n.type === "stylePresetCard") return "#059669";
              if (n.type === "characterCard") return "#059669";
              if (n.type === "sceneCard") return "#2563eb";
              if (n.type === "storyboardCard") return "#f59e0b";
              if (n.type === "processCard") return "#2563eb";
              if (n.type === "resultCard") return "#4ade80";
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
              { label: "插入风格预设", shortcut: "Y", onClick: () => addCard("stylePresetCard", "script") },
              { label: "插入处理节点", shortcut: "P", onClick: () => addCard("processCard", "character") },
              { label: "插入角色节点", shortcut: "C", onClick: () => addCard("characterCard", "character") },
              { label: "插入场景节点", shortcut: "S", onClick: () => addCard("sceneCard", "scene") },
              { label: "插入分镜节点", shortcut: "B", onClick: () => addCard("storyboardCard", "storyboard") },
              { label: "插入结果节点", shortcut: "R", onClick: () => addCard("resultCard", "storyboard") },
              { label: "添加组", shortcut: "", onClick: () => {}, divider: true },
              { label: "复制", shortcut: "", onClick: () => {} },
              { label: "粘贴", shortcut: "", onClick: () => {} },
            ]}
          />
        )}
      </div>

      {/* 右侧 AI 面板 */}
      {chatOpen ? (
        <AiChatPanel onGenerate={onAiGenerate} onMinimize={() => setChatOpen(false)} />
      ) : (
        <button
          onClick={() => setChatOpen(true)}
          title="展开 AI 助手"
          style={{
            position: "absolute",
            right: 16,
            bottom: 16,
            width: 48,
            height: 48,
            borderRadius: 24,
            border: "none",
            background: "#7c3aed",
            color: "#fff",
            fontSize: 22,
            cursor: "pointer",
            boxShadow: "0 4px 16px rgba(124,58,237,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
          }}
        >
          🤖
        </button>
      )}
    </div>
  );
}
