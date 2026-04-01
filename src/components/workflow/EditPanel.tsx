"use client";
import { useWorkflowStore } from "@/lib/store";
import { EditScriptForm, EditCharacterForm, EditSceneForm, EditShotForm, EditEpisodeForm } from "./edit";

export default function EditPanel() {
  const {
    project,
    editPanelTarget,
    closeEditPanel,
    updateCharacterDeep,
    updateSceneDeep,
    updateShotDeep,
    updateEpisodeDeep,
    regenerateViewAction,
    regenerateSingleStoryboard,
    regenerateCharacterAction,
    updateScriptAnalysis,
    sendMessage,
    addSystemMessage,
  } = useWorkflowStore();

  if (!editPanelTarget || !project) return null;

  const { type, id, episodeId } = editPanelTarget;

  const handleAiOptimize = (data: string) => {
    sendMessage(`请帮我优化以下内容:\n${data}`);
    addSystemMessage("已发送给 AI 优化，请查看左侧对话。");
  };

  let content: React.ReactNode = null;
  let panelTitle = "";

  switch (type) {
    case "script": {
      const scriptAnalysis = project.script?.analysis;
      if (!scriptAnalysis) break;
      panelTitle = `编辑剧本: ${scriptAnalysis.title}`;
      content = (
        <EditScriptForm
          analysis={scriptAnalysis}
          onSave={(updated) => {
            updateScriptAnalysis(updated);
            addSystemMessage(`剧本「${updated.title}」已保存，正在调用 AI 重新优化结构...`);
            sendMessage(`剧本已修改，请根据以下最新剧本数据重新优化并生成完整的结构化剧本JSON：\n标题: ${updated.title}\n类型: ${updated.genre}\n风格: ${updated.style}\n角色数: ${updated.characters.length}\n场景数: ${updated.scenes.length}\n分集数: ${updated.episodes.length}`);
          }}
          onAiOptimize={handleAiOptimize}
        />
      );
      break;
    }
    case "character": {
      const char = project.characters.find((c) => c.id === id);
      const ac = project.script?.analysis?.characters.find((c) => c.char_id === id) || null;
      if (!char) break;
      panelTitle = `编辑角色: ${char.name}`;
      content = (
        <EditCharacterForm
          character={char}
          analysisChar={ac}
          onSave={(patch) => {
            updateCharacterDeep(id, patch);
            addSystemMessage(`角色「${patch.name || char.name}」已保存，开始重新生成三视图...`);
            for (const view of ["front", "side", "back"] as const) {
              regenerateViewAction("character", id, view);
            }
          }}
          onSaveAndRegenerate={(patch) => {
            updateCharacterDeep(id, patch);
            addSystemMessage(`角色已保存，开始重新生成三视图...`);
            for (const view of ["front", "side", "back"] as const) {
              regenerateViewAction("character", id, view);
            }
          }}
          onAiOptimize={handleAiOptimize}
        />
      );
      break;
    }
    case "scene": {
      const scene = project.scenes.find((s) => s.id === id);
      const as2 = project.script?.analysis?.scenes.find((s) => s.scene_id === id) || null;
      if (!scene) break;
      panelTitle = `编辑场景: ${scene.name}`;
      content = (
        <EditSceneForm
          scene={scene}
          analysisScene={as2}
          onSave={(patch) => {
            updateSceneDeep(id, patch);
            addSystemMessage(`场景「${patch.name || scene.name}」已保存，开始重新生成视图...`);
            for (const view of ["front", "back", "left", "right", "top", "detail"]) {
              regenerateViewAction("scene", id, view);
            }
          }}
          onSaveAndRegenerate={(patch) => {
            updateSceneDeep(id, patch);
            addSystemMessage(`场景已保存，开始重新生成视图...`);
            for (const view of ["front", "back", "left", "right", "top", "detail"]) {
              regenerateViewAction("scene", id, view);
            }
          }}
          onAiOptimize={handleAiOptimize}
        />
      );
      break;
    }
    case "shot": {
      const ep = project.episodes.find((e) => e.id === episodeId);
      const shot = ep?.shots.find((s) => s.id === id);
      if (!shot || !episodeId) break;
      panelTitle = `编辑镜头 #${(ep?.shots.indexOf(shot) ?? 0) + 1}`;
      content = (
        <EditShotForm
          shot={shot}
          onSave={(patch) => {
            updateShotDeep(episodeId, id, patch);
            addSystemMessage(`镜头已保存，开始重新生成分镜图...`);
            regenerateSingleStoryboard(episodeId, id);
          }}
          onSaveAndRegenerate={(patch) => {
            updateShotDeep(episodeId, id, patch);
            addSystemMessage(`镜头已保存，开始重新生成分镜图...`);
            regenerateSingleStoryboard(episodeId, id);
          }}
          onAiOptimize={handleAiOptimize}
        />
      );
      break;
    }
    case "episode": {
      const ep = project.episodes.find((e) => e.id === id);
      if (!ep) break;
      panelTitle = `编辑分集: ${ep.title}`;
      content = (
        <EditEpisodeForm
          episode={ep}
          onSave={(patch) => {
            updateEpisodeDeep(id, patch);
            addSystemMessage(`分集已保存修改。`);
          }}
          onAiOptimize={handleAiOptimize}
        />
      );
      break;
    }
  }

  if (!content) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: 460,
        height: "100vh",
        background: "#13131d",
        borderLeft: "1px solid #2a2a3a",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        boxShadow: "-4px 0 20px rgba(0,0,0,0.5)",
        animation: "slideInRight 0.25s ease-out",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid #2a2a3a",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: "#e0e0e0" }}>
          ✏️ {panelTitle}
        </span>
        <button
          onClick={closeEditPanel}
          style={{
            background: "transparent",
            border: "none",
            color: "#888",
            fontSize: 18,
            cursor: "pointer",
            padding: "4px 8px",
          }}
        >
          &times;
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {content}
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
