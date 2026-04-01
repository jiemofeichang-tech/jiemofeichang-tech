"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  wfListProjects, wfGetProject,
  fetchLibrary, openStorage,
  type WfProject, type WfProjectSummary, type AssetRecord,
} from "@/lib/api";
import type {
  AssetTab,
  CharacterAssetItem,
  SceneAssetItem,
  StoryboardAssetItem,
  VideoAssetItem,
} from "@/types/assets";

import AssetTabs from "./AssetTabs";
import AssetSearchBar from "./AssetSearchBar";
import AssetGrid from "./AssetGrid";
import CreateCard from "./CreateCard";
import CharacterAssetCard from "./CharacterAssetCard";
import VideoAssetCard from "./VideoAssetCard";
import AssetDetailModal from "./AssetDetailModal";

export default function AssetPage() {
  const [activeTab, setActiveTab] = useState<AssetTab>("characters");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [projects, setProjects] = useState<WfProject[]>([]);
  const [libraryAssets, setLibraryAssets] = useState<AssetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterAssetItem | null>(null);

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [projectList, library] = await Promise.all([
        wfListProjects().catch(() => ({ projects: [] as WfProjectSummary[] })),
        fetchLibrary().catch(() => ({ assets: [] as AssetRecord[] })),
      ]);
      setLibraryAssets(library.assets);

      // 获取每个项目的完整数据
      const fullProjects = await Promise.all(
        projectList.projects.map((p) =>
          wfGetProject(p.id).catch(() => null)
        )
      );
      setProjects(fullProjects.filter((p): p is WfProject => p !== null));
    } catch (err) {
      console.error("[AssetPage] 加载资产数据失败:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // 从项目中聚合角色资产
  const allCharacters = useMemo<CharacterAssetItem[]>(() => {
    let index = 1;
    const items: CharacterAssetItem[] = [];
    for (const proj of projects) {
      for (const ch of proj.characters || []) {
        items.push({
          character: ch,
          projectId: proj.id,
          projectName: proj.title,
          index: index++,
        });
      }
    }
    return items;
  }, [projects]);

  // 从项目中聚合场景资产
  const allScenes = useMemo<SceneAssetItem[]>(() => {
    const items: SceneAssetItem[] = [];
    for (const proj of projects) {
      for (const sc of proj.scenes || []) {
        items.push({ scene: sc, projectId: proj.id, projectName: proj.title });
      }
    }
    return items;
  }, [projects]);

  // 从项目中聚合分镜资产（有 storyboard_image 的 shot）
  const allStoryboards = useMemo<StoryboardAssetItem[]>(() => {
    const items: StoryboardAssetItem[] = [];
    for (const proj of projects) {
      for (const ep of proj.episodes || []) {
        for (const shot of ep.shots || []) {
          if (shot.storyboard_image) {
            items.push({
              shot,
              projectId: proj.id,
              projectName: proj.title,
              episodeTitle: ep.title,
            });
          }
        }
      }
    }
    return items;
  }, [projects]);

  // 合并视频资产（library + workflow）
  const allVideos = useMemo<VideoAssetItem[]>(() => {
    const items: VideoAssetItem[] = [];
    // Library 视频
    for (const asset of libraryAssets) {
      items.push({ asset, source: "library" });
    }
    // 工作流中已完成的视频
    for (const proj of projects) {
      for (const ep of proj.episodes || []) {
        for (const shot of ep.shots || []) {
          if (shot.video_url || shot.video_local_path) {
            items.push({
              shot,
              projectId: proj.id,
              projectName: proj.title,
              source: "workflow",
            });
          }
        }
      }
    }
    return items;
  }, [projects, libraryAssets]);

  // 搜索过滤
  const query = searchQuery.toLowerCase().trim();

  const filteredCharacters = useMemo(() =>
    allCharacters.filter((c) =>
      !query || c.character.name.toLowerCase().includes(query) || c.projectName.toLowerCase().includes(query)
    ), [allCharacters, query]);

  const filteredScenes = useMemo(() =>
    allScenes.filter((s) =>
      !query || s.scene.name.toLowerCase().includes(query) || s.projectName.toLowerCase().includes(query)
    ), [allScenes, query]);

  const filteredStoryboards = useMemo(() =>
    allStoryboards.filter((sb) =>
      !query || sb.shot.prompt?.toLowerCase().includes(query) || sb.projectName.toLowerCase().includes(query)
    ), [allStoryboards, query]);

  const filteredVideos = useMemo(() =>
    allVideos.filter((v) => {
      if (!query) return true;
      if (v.source === "library") return v.asset.title?.toLowerCase().includes(query);
      return v.shot.prompt?.toLowerCase().includes(query) || v.projectName.toLowerCase().includes(query);
    }), [allVideos, query]);

  // Tab 计数
  const counts = useMemo(() => ({
    characters: allCharacters.length,
    storyboards: allStoryboards.length,
    videos: allVideos.length,
    scenes: allScenes.length,
  }), [allCharacters, allStoryboards, allVideos, allScenes]);

  const handleOpenStorage = async () => {
    try { await openStorage(); } catch (err) { alert((err as Error).message); }
  };

  return (
    <div style={{ padding: "32px 40px" }}>
      {/* 头部 */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 24,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary, #fff)", margin: 0 }}>
            我的资产
          </h1>
          <AssetTabs activeTab={activeTab} onTabChange={setActiveTab} counts={counts} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <AssetSearchBar
            activeTab={activeTab}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            showFavoritesOnly={showFavoritesOnly}
            onToggleFavorites={() => setShowFavoritesOnly(!showFavoritesOnly)}
          />
          <button
            onClick={handleOpenStorage}
            style={{
              padding: "6px 14px", borderRadius: 8, fontSize: 12,
              color: "rgba(255,255,255,0.6)", backgroundColor: "rgba(255,255,255,0.08)",
              border: "none", cursor: "pointer",
            }}
          >
            打开目录
          </button>
          <button
            onClick={loadData}
            style={{
              padding: "6px 14px", borderRadius: 8, fontSize: 12,
              color: "rgba(255,255,255,0.6)", backgroundColor: "rgba(255,255,255,0.08)",
              border: "none", cursor: "pointer",
            }}
          >
            刷新
          </button>
        </div>
      </div>

      {/* 加载状态 */}
      {loading ? (
        <div style={{
          textAlign: "center", padding: 80, color: "rgba(255,255,255,0.3)",
        }}>
          <div style={{
            width: 32, height: 32, border: "3px solid rgba(255,255,255,0.1)",
            borderTopColor: "#BFFF00", borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            margin: "0 auto 16px",
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ fontSize: 14 }}>加载中...</p>
        </div>
      ) : (
        <>
          {/* 角色 Tab */}
          {activeTab === "characters" && (
            filteredCharacters.length === 0 ? (
              <EmptyState message="暂无角色资产" sub="在工作流中完成角色设计后，角色资产会自动出现在这里" />
            ) : (
              <AssetGrid>
                <CreateCard />
                {filteredCharacters.map((item) => (
                  <CharacterAssetCard
                    key={`${item.projectId}-${item.character.id}`}
                    item={item}
                    onClick={() => setSelectedCharacter(item)}
                  />
                ))}
              </AssetGrid>
            )
          )}

          {/* 分镜 Tab */}
          {activeTab === "storyboards" && (
            filteredStoryboards.length === 0 ? (
              <EmptyState message="暂无分镜资产" sub="在工作流中完成分镜生成后，分镜资产会自动出现在这里" />
            ) : (
              <AssetGrid>
                {filteredStoryboards.map((item) => (
                  <StoryboardCard key={`${item.projectId}-${item.shot.id}`} item={item} />
                ))}
              </AssetGrid>
            )
          )}

          {/* 视频 Tab */}
          {activeTab === "videos" && (
            filteredVideos.length === 0 ? (
              <EmptyState message="暂无视频资产" sub="生成成功的视频会自动保存到这里" />
            ) : (
              <AssetGrid>
                {filteredVideos.map((item, i) => (
                  <VideoAssetCard
                    key={item.source === "library" ? item.asset.task_id : `wf-${item.projectId}-${item.shot.id}-${i}`}
                    item={item}
                    onRefresh={loadData}
                  />
                ))}
              </AssetGrid>
            )
          )}

          {/* 场景 Tab */}
          {activeTab === "scenes" && (
            filteredScenes.length === 0 ? (
              <EmptyState message="暂无场景资产" sub="在工作流中完成剧本解析后，场景资产会自动出现在这里" />
            ) : (
              <AssetGrid>
                {filteredScenes.map((item) => (
                  <SceneCard key={`${item.projectId}-${item.scene.id}`} item={item} />
                ))}
              </AssetGrid>
            )
          )}
        </>
      )}

      {/* 角色详情弹窗 */}
      <AssetDetailModal
        item={selectedCharacter}
        onClose={() => setSelectedCharacter(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 内联子组件（分镜卡片、场景卡片、空状态）
// ---------------------------------------------------------------------------

function StoryboardCard({ item }: { item: StoryboardAssetItem }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 12, overflow: "hidden",
        border: hovered ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(255,255,255,0.06)",
        backgroundColor: hovered ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.05)",
        transition: "all 0.25s ease",
        cursor: "pointer",
      }}
    >
      <div style={{ height: 180, overflow: "hidden", backgroundColor: "#111" }}>
        {item.shot.storyboard_image ? (
          <img
            src={item.shot.storyboard_image}
            alt="分镜"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div style={{
            width: "100%", height: "100%",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "rgba(255,255,255,0.15)",
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="9" y1="21" x2="9" y2="9" />
            </svg>
          </div>
        )}
      </div>
      <div style={{ padding: "8px 12px 12px" }}>
        <h3 style={{
          fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.9)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0,
        }}>
          {item.shot.prompt?.slice(0, 50) || "分镜画面"}
        </h3>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
          {item.projectName} &middot; {item.episodeTitle}
        </p>
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          {item.shot.shot_type && (
            <span style={{
              padding: "1px 6px", borderRadius: 4, fontSize: 10,
              color: "rgba(255,255,255,0.4)", backgroundColor: "rgba(255,255,255,0.06)",
            }}>
              {item.shot.shot_type}
            </span>
          )}
          {item.shot.camera_movement && (
            <span style={{
              padding: "1px 6px", borderRadius: 4, fontSize: 10,
              color: "rgba(255,255,255,0.4)", backgroundColor: "rgba(255,255,255,0.06)",
            }}>
              {item.shot.camera_movement}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function SceneCard({ item }: { item: SceneAssetItem }) {
  const [hovered, setHovered] = useState(false);
  const firstView = item.scene.views
    ? Object.values(item.scene.views).find((v) => v)
    : null;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 12, overflow: "hidden",
        border: hovered ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(255,255,255,0.06)",
        backgroundColor: hovered ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.05)",
        transition: "all 0.25s ease",
        cursor: "pointer",
      }}
    >
      <div style={{ height: 160, overflow: "hidden", backgroundColor: "#111" }}>
        {firstView ? (
          <img src={firstView} alt={item.scene.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{
            width: "100%", height: "100%",
            background: "linear-gradient(135deg, rgba(124,58,237,0.2), rgba(59,130,246,0.2))",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "rgba(255,255,255,0.2)",
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
        )}
      </div>
      <div style={{ padding: "8px 12px 12px" }}>
        <h3 style={{
          fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.9)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0,
        }}>
          {item.scene.name}
        </h3>
        <p style={{
          fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {item.projectName}
          {item.scene.description ? ` \u00B7 ${item.scene.description.slice(0, 30)}` : ""}
        </p>
        <span style={{
          display: "inline-block", marginTop: 6,
          padding: "2px 8px", borderRadius: 4, fontSize: 10,
          color: item.scene.status === "done" ? "#BFFF00" : "rgba(255,255,255,0.4)",
          backgroundColor: item.scene.status === "done" ? "rgba(191,255,0,0.1)" : "rgba(255,255,255,0.06)",
        }}>
          {item.scene.status === "done" ? "已完成" : item.scene.status === "generating" ? "生成中" : "待生成"}
        </span>
      </div>
    </div>
  );
}

function EmptyState({ message, sub }: { message: string; sub: string }) {
  return (
    <div style={{ textAlign: "center", padding: 80, color: "rgba(255,255,255,0.3)" }}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
        style={{ marginBottom: 16, opacity: 0.3 }}>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
      <p style={{ fontSize: 14 }}>{message}</p>
      <p style={{ fontSize: 12, marginTop: 4 }}>{sub}</p>
    </div>
  );
}
