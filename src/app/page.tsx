"use client";

import { useCallback, useEffect, useState } from "react";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import MainInput from "@/components/MainInput";
import TaskProgress from "@/components/TaskProgress";
import QuickTags from "@/components/QuickTags";
import ProjectsRow from "@/components/ProjectsRow";
import WorkflowProjects from "@/components/workflow/WorkflowProjects";
import HighlightsSection from "@/components/HighlightsSection";
import DiscoverSection from "@/components/DiscoverSection";
import Footer from "@/components/Footer";
import ProjectsPage from "@/components/ProjectsPage";
import TrashPage from "@/components/TrashPage";
import AssetPage from "@/components/assets/AssetPage";
import dynamic from "next/dynamic";
const CanvasPage = dynamic(() => import("@/components/NodeCanvas/CanvasPage"), { ssr: false });
const GridGeneratorView = dynamic(() => import("@/components/grid-generator/GridGeneratorView"), { ssr: false });
const SceneGeneratorView = dynamic(() => import("@/components/grid-generator/SceneGeneratorView"), { ssr: false });
const StoryboardGeneratorView = dynamic(() => import("@/components/grid-generator/StoryboardGeneratorView"), { ssr: false });
import AuthGuard from "@/components/AuthGuard";
import {
  authLogout,
  fetchConfig,
  fetchHistory,
  type AuthUser,
  type GenerationParams,
  type ServerConfig,
  type TaskRecord,
} from "@/lib/api";


export default function Home() {
  const [activeTab, setActiveTab] = useState("home");
  const [prompt, setPrompt] = useState("");
  const [activeStoryType, setActiveStoryType] = useState<string | undefined>();
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [currentTask, setCurrentTask] = useState<TaskRecord | null>(null);
  const [history, setHistory] = useState<TaskRecord[]>([]);
  const [genParams, setGenParams] = useState<GenerationParams>({
    mode: "text",
    model: "veo-2",
    resolution: "720p",
    ratio: "16:9",
    duration: -1,
    cameraPreset: "auto",
    motionSpeed: "steady",
    generateAudio: false,
  });

  const refreshHistory = useCallback(() => {
    fetchHistory().then((res) => setHistory(res.tasks)).catch(() => {});
  }, []);

  useEffect(() => {
    fetchConfig().then(setConfig).catch(() => {});
    refreshHistory();
  }, [refreshHistory]);

  const handleTaskCreated = useCallback((task: TaskRecord) => {
    setCurrentTask(task);
    refreshHistory();
  }, [refreshHistory]);

  const handleTaskUpdated = useCallback((task: TaskRecord) => {
    setCurrentTask(task);
    if (task.status === "succeeded" || task.local_asset) {
      refreshHistory();
    }
  }, [refreshHistory]);

  const handleConfigUpdated = useCallback(() => {
    fetchConfig().then(setConfig).catch(() => {});
  }, []);

  const handleLogout = useCallback(async () => {
    await authLogout();
    window.location.href = "/login";
  }, []);

  return (
    <AuthGuard>
      {(user: AuthUser) => (
        <div className="home-cinema-shell" data-home-shell="cinema" style={{ minHeight: "100vh" }}>
          <Header config={config} onConfigUpdated={handleConfigUpdated} user={user} onLogout={handleLogout} />
          <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

          <main className="home-main">
            {activeTab === "home" && (
              <div key="home" className="tab-enter">
                {!config?.hasApiKey && (
                  <div className="home-banner">
                    后端 API Key 还未配置。点击右上角头像进入设置后，就能把首页直接接到你的生成服务。
                  </div>
                )}

                <section className="home-hero">
                  <div>
                      <div className="home-input-shell">
                        <div style={{ marginBottom: 18 }}>
                          <div style={{ fontSize: 22, fontWeight: 700 }}>开始创作</div>
                        </div>

                        <MainInput
                          prompt={prompt}
                          setPrompt={setPrompt}
                          generationParams={genParams}
                          onTaskCreated={handleTaskCreated}
                          storyType={activeStoryType}
                          onClearStoryType={() => setActiveStoryType(undefined)}
                        />

                        <div style={{ marginTop: 18 }}>
                          <QuickTags
                            onSelect={(sel) => {
                              setPrompt(sel.prompt);
                              setActiveStoryType(sel.storyType);
                              if (sel.params) {
                                setGenParams((prev) => ({ ...prev, ...sel.params }));
                              }
                            }}
                          />
                        </div>
                      </div>
                  </div>
                </section>

                {currentTask && (
                  <div className="home-task-shell">
                    <TaskProgress task={currentTask} onTaskUpdated={handleTaskUpdated} />
                  </div>
                )}

                <WorkflowProjects />
                <ProjectsRow history={history} onOpenProjects={() => setActiveTab("projects")} />
                <HighlightsSection />
                <DiscoverSection />
                <Footer />
              </div>
            )}

            {activeTab === "projects" && (
              <div key="projects" className="tab-enter">
                <ProjectsPage history={history} onRefresh={refreshHistory} />
              </div>
            )}
            {activeTab === "community" && <div key="community" className="tab-enter"><AssetPage /></div>}
            {activeTab === "trash" && <div key="trash" className="tab-enter"><TrashPage /></div>}
            {activeTab === "canvas" && (
              <div key="canvas-page" style={{ position: "fixed", top: 0, left: 70, right: 0, bottom: 0, zIndex: 50 }}>
                <CanvasPage />
              </div>
            )}
            {activeTab === "grid" && (
              <div key="grid-page" style={{ position: "fixed", top: 0, left: 70, right: 0, bottom: 0, zIndex: 50 }}>
                <GridGeneratorView />
              </div>
            )}
            {activeTab === "scene-grid" && (
              <div key="scene-grid-page" style={{ position: "fixed", top: 0, left: 70, right: 0, bottom: 0, zIndex: 50 }}>
                <SceneGeneratorView />
              </div>
            )}
            {activeTab === "storyboard" && (
              <div key="storyboard-page" style={{ position: "fixed", top: 0, left: 70, right: 0, bottom: 0, zIndex: 50 }}>
                <StoryboardGeneratorView />
              </div>
            )}
          </main>
        </div>
      )}
    </AuthGuard>
  );
}
