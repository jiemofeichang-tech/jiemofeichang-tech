"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import NotificationBanner from "@/components/NotificationBanner";
import MainInput from "@/components/MainInput";
import GenerationPanel from "@/components/GenerationPanel";
import TaskProgress from "@/components/TaskProgress";
import QuickTags from "@/components/QuickTags";
import ProjectsRow from "@/components/ProjectsRow";
import WorkflowProjects from "@/components/workflow/WorkflowProjects";
import HighlightsSection from "@/components/HighlightsSection";
import DiscoverSection from "@/components/DiscoverSection";
import Footer from "@/components/Footer";
import ProjectsPage from "@/components/ProjectsPage";
import CommunityPage from "@/components/CommunityPage";
import TrashPage from "@/components/TrashPage";
import LibrarySection from "@/components/LibrarySection";
import AuthGuard from "@/components/AuthGuard";
import {
  fetchConfig, fetchHistory, fetchLibrary, authLogout,
  type ServerConfig, type TaskRecord, type AssetRecord, type GenerationParams, type AuthUser,
} from "@/lib/api";

export default function Home() {
  const [activeTab, setActiveTab] = useState("home");
  const [prompt, setPrompt] = useState("");
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [currentTask, setCurrentTask] = useState<TaskRecord | null>(null);
  const [history, setHistory] = useState<TaskRecord[]>([]);
  const [library, setLibrary] = useState<AssetRecord[]>([]);
  const [genParams, setGenParams] = useState<GenerationParams>({
    mode: "text",
    model: "doubao-seedance-2.0",
    resolution: "720p",
    ratio: "16:9",
    duration: -1,
    cameraPreset: "auto",
    motionSpeed: "steady",
    generateAudio: false,
  });

  useEffect(() => {
    fetchConfig().then(setConfig).catch(() => {});
    refreshHistory();
    refreshLibrary();
  }, []);

  const refreshHistory = useCallback(() => {
    fetchHistory().then((res) => setHistory(res.tasks)).catch(() => {});
  }, []);

  const refreshLibrary = useCallback(() => {
    fetchLibrary().then((res) => setLibrary(res.assets)).catch(() => {});
  }, []);

  const handleTaskCreated = useCallback((task: TaskRecord) => {
    setCurrentTask(task);
    refreshHistory();
  }, [refreshHistory]);

  const handleTaskUpdated = useCallback((task: TaskRecord) => {
    setCurrentTask(task);
    if (task.status === "succeeded" || task.local_asset) {
      refreshHistory();
      refreshLibrary();
    }
  }, [refreshHistory, refreshLibrary]);

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
        <div style={{ minHeight: "100vh", backgroundColor: "var(--bg)" }}>
          <Header config={config} onConfigUpdated={handleConfigUpdated} user={user} onLogout={handleLogout} />
          <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

          <main style={{ paddingTop: "var(--header-height)" }}>
            {activeTab === "home" && (
              <>
                <NotificationBanner />
                {!config?.hasApiKey && (
                  <div style={{
                    margin: "12px auto 0", padding: "10px 16px", borderRadius: 8, maxWidth: 800,
                    backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                    color: "#ef4444", fontSize: 13, textAlign: "center",
                  }}>
                    尚未配置 API Key，请点击右上角头像 → 设置 来配置后端连接。
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 20px 0" }}>
                  <MainInput
                    prompt={prompt}
                    setPrompt={setPrompt}
                    generationParams={genParams}
                    onTaskCreated={handleTaskCreated}
                  />
                  <QuickTags onSelect={(text) => setPrompt(text)} />
                </div>
                <div style={{ maxWidth: 800, margin: "0 auto", padding: "0 20px" }}>
                  <TaskProgress task={currentTask} onTaskUpdated={handleTaskUpdated} />
                </div>
                <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 20px" }}>
                  <WorkflowProjects />
                </div>
                <ProjectsRow history={history} />
                <HighlightsSection />
                <DiscoverSection />
                <Footer />
              </>
            )}

            {activeTab === "projects" && (
              <ProjectsPage history={history} onRefresh={refreshHistory} />
            )}
            {activeTab === "community" && (
              <LibrarySection library={library} onRefresh={refreshLibrary} />
            )}
            {activeTab === "trash" && <TrashPage />}
          </main>
        </div>
      )}
    </AuthGuard>
  );
}
