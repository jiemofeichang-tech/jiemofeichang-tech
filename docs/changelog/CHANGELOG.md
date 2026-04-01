# 变更日志

本文件记录 Seedance Studio 项目的所有重要版本变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [Unreleased]

暂无。

---

## [0.1.0] - 2026-03-29

初始版本，AI 漫剧生成工作台 MVP。

### Added

- **Python 后端** (`server.py`)：基于 stdlib `http.server` + `ThreadPoolExecutor` 的反向代理服务器
  - API 路由：config、history、library、tasks（CRUD + 代理上游）、session、open-storage
  - 工作流 API：项目 CRUD、阶段管理、AI Chat 代理
  - 认证系统：注册/登录/登出，基于 cookie 的会话管理
  - 视频自动下载：上游任务成功后自动拉取 MP4 到本地
  - 媒体文件服务：支持 Range 请求的 MP4 文件服务
  - MySQL 持久化层（`mysql_storage.py`），支持回退到 JSON 存储

- **Next.js 前端** (`oii前端/oiioii-clone/`)：React 19 + TypeScript + Tailwind CSS 4
  - 自研状态管理（`store.ts`，基于 `useSyncExternalStore`）
  - AI 编排引擎（`workflow-engine.ts`，5 阶段流水线）
  - 类型安全 API 客户端（`api.ts`，30+ 函数）
  - 5 层提示词组合系统（`prompt-system.ts`）
  - 100+ 预定义视觉风格（`styles-data.ts`）

- **AI 工作流 Pipeline**：5 阶段自动化流水线
  - Stage 1: 剧本分析（`script_engine.py`）— LLM 分析故事 → 结构化 JSON
  - Stage 2: 角色设计（`character_factory.py`）— 每角色 9 张资产，并发生成
  - Stage 3: 分镜生成（`storyboard_generator.py`）— 场景 → 镜头 → 关键帧
  - Stage 4: 视频生成 — Seedance API 异步任务 + 轮询 + 自动下载
  - Stage 5: 后期制作（`video_composer.py`）— 调色、特效、字幕
  - Builder → Evaluator 协商循环（`stage_evaluator.py` + `stage_contract.py`）
  - 重试策略：每阶段最多 3 次（2 次 REFINE + 1 次 PIVOT）

- **6 种视频生成模式**：text、first_frame、first_last_frame、image_to_video、video_reference、extend_video

- **版本管理**（`version_manager.py`）：工作流阶段快照和恢复

- **工作流检查点**（`workflow_checkpoint.py`）：Pipeline 中断恢复

- **Legacy 前端**：根目录 `index.html` + `app.js` + `styles.css`，原始 vanilla JS 界面

### Fixed

- 无效任务 ID 会误触上游请求 — 增加 task ID 格式判定，不符合格式直接返回 404
- 本地已缓存的终态任务现在直接返回，不再重复请求上游

### Known Issues

- 上游 `zlhub.xiaowaiyou.cn` 在 VPN/代理环境下可能 SSL 握手失败（DNS 被劫持到虚拟 IP）
- 前端"创建项目"按钮缺少防抖，可能导致重复创建（BUG-002）
