"use client";
import { useWorkflowStore } from "@/lib/store";
import ScriptBlock from "./canvas/ScriptBlock";
import CharacterCard from "./canvas/CharacterCard";
import SceneCard from "./canvas/SceneCard";
import StoryboardGrid from "./canvas/StoryboardGrid";
import VideoGrid from "./canvas/VideoGrid";
import PostProduction from "./canvas/PostProduction";

export default function CanvasPanel() {
  const {
    project,
    selectedBlock,
    chatLoading,
    setSelectedBlock,
    setStage,
    setSubtitlesSrt,
    generateCharacterImages,
    generateStoryboardImages,
    generateVideos,
    regenerateSingleStoryboard,
    regenerateSingleVideo,
    setFinalOutput,
    updateProjectData,
  } = useWorkflowStore();

  if (!project) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
        加载中...
      </div>
    );
  }

  const handleEditScript = () => {
    setStage("script");
    setSelectedBlock({ type: "script", id: "script", label: "剧本" });
  };

  const handleRegenerateScript = () => {
    setStage("script");
    setSelectedBlock({ type: "script", id: "script", label: "重新分析剧本" });
  };

  const handleEditCharacter = (charId: string, charName: string) => {
    setStage("character");
    setSelectedBlock({ type: "character", id: charId, label: charName });
  };

  const handleRegenerateCharacter = (charId: string) => {
    setStage("character");
    setSelectedBlock({ type: "character", id: charId, label: "重新生成角色" });
  };

  const handleEditShot = (episodeId: string, shotId: string) => {
    setStage("storyboard");
    setSelectedBlock({ type: "shot", id: `${episodeId}/${shotId}`, label: `镜头 ${shotId}` });
  };

  const handleRegenerateShot = (episodeId: string, shotId: string) => {
    regenerateSingleStoryboard(episodeId, shotId);
  };

  const handleEditVideo = (episodeId: string, shotId: string) => {
    setStage("video");
    setSelectedBlock({ type: "video", id: `${episodeId}/${shotId}`, label: `视频 ${shotId}` });
  };

  const handleRegenerateVideo = (episodeId: string, shotId: string) => {
    regenerateSingleVideo(episodeId, shotId);
  };

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: 20,
        background: "#111118",
      }}
    >
      {/* Section Title */}
      <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 2, marginBottom: 16 }}>
        项目画布
      </div>

      {/* Section 1: Script */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: "#666", marginBottom: 8, borderBottom: "1px solid #222", paddingBottom: 4 }}>
          ── 剧本分析结果 ──
        </div>
        <ScriptBlock
          analysis={project.script.analysis}
          rawInput={project.script.raw_input}
          onEdit={handleEditScript}
          onRegenerate={handleRegenerateScript}
        />
      </div>

      {/* Section 2: Characters */}
      {(project.characters.length > 0 || project.script.analysis) && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 8, borderBottom: "1px solid #222", paddingBottom: 4 }}>
            ── 角色设计 ──
          </div>
          {project.characters.length === 0 ? (
            <div
              style={{
                background: "#1e1e2e",
                borderRadius: 12,
                padding: 20,
                textAlign: "center",
                color: "#555",
                fontSize: 13,
                border: "1px dashed #333",
                marginBottom: 16,
              }}
            >
              剧本分析完成后，点击下方按钮开始角色设计
              {project.script.analysis && (
                <div style={{ marginTop: 12 }}>
                  <button
                    onClick={() => generateCharacterImages()}
                    disabled={chatLoading}
                    style={{
                      padding: "8px 20px",
                      borderRadius: 8,
                      border: "none",
                      background: chatLoading ? "#444" : "#7c3aed",
                      color: "#fff",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: chatLoading ? "not-allowed" : "pointer",
                    }}
                  >
                    生成全部角色三视图
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))", gap: 12 }}>
              {project.characters.map((char) => (
                <CharacterCard
                  key={char.id}
                  character={char}
                  onEdit={() => handleEditCharacter(char.id, char.name)}
                  onRegenerate={() => handleRegenerateCharacter(char.id)}
                  isSelected={selectedBlock?.type === "character" && selectedBlock.id === char.id}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Section 2b: Scenes */}
      {project.scenes.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 8, borderBottom: "1px solid #222", paddingBottom: 4 }}>
            ── 场景设计 ──
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))", gap: 12 }}>
            {project.scenes.map((scene) => (
              <SceneCard
                key={scene.id}
                scene={scene}
                onEdit={() => {
                  setStage("character");
                  setSelectedBlock({ type: "scene", id: scene.id, label: scene.name });
                }}
                onRegenerate={() => {
                  setStage("character");
                  setSelectedBlock({ type: "scene", id: scene.id, label: "重新生成场景" });
                }}
                isSelected={selectedBlock?.type === "scene" && selectedBlock.id === scene.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Section 3: Storyboard */}
      {(project.episodes.length > 0 || project.characters.length > 0) && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, borderBottom: "1px solid #222", paddingBottom: 4 }}>
            <span style={{ fontSize: 12, color: "#666" }}>── 分镜图 ──</span>
            {project.episodes.length > 0 && !project.episodes[0]?.shots[0]?.storyboard_image && (
              <button
                onClick={() => generateStoryboardImages()}
                disabled={chatLoading}
                style={{
                  padding: "4px 14px",
                  borderRadius: 6,
                  border: "none",
                  background: chatLoading ? "#444" : "#2563eb",
                  color: "#fff",
                  fontSize: 11,
                  cursor: chatLoading ? "not-allowed" : "pointer",
                }}
              >
                批量生成分镜图
              </button>
            )}
          </div>
          <StoryboardGrid
            episodes={project.episodes}
            onEditShot={handleEditShot}
            onRegenerateShot={handleRegenerateShot}
            selectedShotId={selectedBlock?.type === "shot" ? selectedBlock.id.split("/")[1] : null}
          />
        </div>
      )}

      {/* Section 4: Videos */}
      {project.episodes.length > 0 && project.episodes.some((ep) => ep.shots.some((s) => s.storyboard_image)) && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, borderBottom: "1px solid #222", paddingBottom: 4 }}>
            <span style={{ fontSize: 12, color: "#666" }}>── 视频生成 ──</span>
            {!project.episodes.some((ep) => ep.shots.some((s) => s.video_url)) && (
              <button
                onClick={() => generateVideos()}
                disabled={chatLoading}
                style={{
                  padding: "4px 14px",
                  borderRadius: 6,
                  border: "none",
                  background: chatLoading ? "#444" : "#059669",
                  color: "#fff",
                  fontSize: 11,
                  cursor: chatLoading ? "not-allowed" : "pointer",
                }}
              >
                批量生成视频
              </button>
            )}
          </div>
          <VideoGrid
            episodes={project.episodes}
            onEditShot={handleEditVideo}
            onRegenerateVideo={handleRegenerateVideo}
          />
        </div>
      )}

      {/* Section 5: Post-production */}
      {project.episodes.some((ep) => ep.shots.some((s) => s.video_url)) && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 8, borderBottom: "1px solid #222", paddingBottom: 4 }}>
            ── 后期合成 & 导出 ──
          </div>
          <PostProduction
            projectId={project.id}
            subtitlesSrt={project.post_production.subtitles_srt}
            finalOutput={project.post_production.final_output}
            onSubtitlesChange={(srt) => {
              setSubtitlesSrt(srt);
              updateProjectData({ post_production: { ...project.post_production, subtitles_srt: srt } });
            }}
            onRenderComplete={(url) => setFinalOutput(url)}
          />
        </div>
      )}

      {/* Bottom spacer */}
      <div style={{ height: 100 }} />
    </div>
  );
}
