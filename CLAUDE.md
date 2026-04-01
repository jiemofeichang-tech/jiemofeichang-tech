# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Startup Triage Order

If the task is to start the project, fix a startup failure, or explain why the repo does not run:

1. Read `docs/启动问题记录-20260329.md` first.
2. Then read `docs/test-results-20260329.md`.
3. Use `AGENTS.md` for command, layout, and test conventions.

Do not edit runtime code before checking known startup issues. On Windows, background frontend startup must use `npm.cmd`, not plain `npm`.

## Priority Reference Files

Read these files early before changing startup, environment, or contributor workflow behavior:

- `AGENTS.md` — repository-wide contributor guide, command summary, testing entry points, and naming conventions
- `docs/启动问题记录-20260329.md` — known startup issues, root causes, and confirmed fixes from the latest bring-up session
- `docs/test-results-20260329.md` — functional test baseline, upstream network caveats, and startup troubleshooting supplement

If the task is about failing startup, local environment issues, or "why does this project not run", check `docs/启动问题记录-20260329.md` first before editing runtime code.

## Project Overview

**Seedance Studio** — AI 视频生成工作台，通过众联 MAAS 代理 Seedance 2.0 视频 API。管理完整工作流：剧本分析 → 角色设计 → 分镜生成 → 视频生成 → 后期制作，支持手动单任务和 AI 编排的全流水线。

## Architecture

```
┌─────────────────────────────────┐
│  Next.js Frontend (:3001)       │  React 19 + TypeScript + Tailwind CSS 4
│  store.ts ← workflow-engine.ts  │  零外部状态库 (useSyncExternalStore)
│  api.ts → /api/* /media/*       │
└───────────┬─────────────────────┘
            │ next.config.ts rewrites
┌───────────▼─────────────────────┐
│  Python Backend (:8787)         │  stdlib HTTPServer + ThreadPoolExecutor
│  server.py (router/proxy)       │
│  ├─ workflow_orchestrator.py    │  5-stage pipeline state machine
│  ├─ script_engine.py            │  Stage 1: 剧本 → JSON
│  ├─ character_factory.py        │  Stage 2: 角色 → 9 assets/character
│  ├─ storyboard_generator.py     │  Stage 3: 分镜 → images
│  ├─ stage_evaluator.py          │  Hybrid evaluation (structural + LLM)
│  ├─ stage_contract.py           │  Builder ↔ Evaluator negotiation
│  ├─ video_composer.py           │  Stage 5: 后期合成
│  ├─ mysql_storage.py            │  MySQL persistence layer
│  ├─ version_manager.py          │  Snapshot versioning
│  └─ workflow_checkpoint.py      │  Recovery checkpoints
└───────────┬─────────────────────┘
            │ reverse proxy
┌───────────▼─────────────────────┐
│  Upstream: zlhub.xiaowaiyou.cn  │  Seedance 2.0 async video API
└─────────────────────────────────┘
```

Frontend 从不直接持有 API token，所有上游请求经 Python server 代发。

### AI Pipeline (核心架构)

5 阶段流水线，每阶段有 Builder → Evaluator 协商循环：

1. **Script Analysis** — LLM 分析故事文本 → 结构化 JSON (characters, scenes, episodes)
2. **Character Design** — 每角色生成 9 张资产 (3 视角 × 正面/侧面/背面 + 6 表情)，ThreadPoolExecutor 并发
3. **Storyboard** — 场景 → 镜头 → 分镜图，LLM 生成描述 + 图像 API 生成帧，并发执行
4. **Video Generation** — Seedance API 异步任务 → 轮询 → 自动下载 MP4
5. **Post-Production** — 调色、特效、字幕

重试策略：每阶段最多 3 次（前 2 次 REFINE 改进，第 3 次 PIVOT 换策略）。

### Frontend Core Modules

- **`store.ts`** — 自研状态管理，基于 `useSyncExternalStore`，零外部依赖
- **`workflow-engine.ts`** — AI 编排引擎，驱动 5 阶段流水线
- **`api.ts`** — 类型安全 HTTP 客户端 (30+ 函数)，含工作流 API (`wf*`)、AI 聊天流式接口、任务管理
- **`prompt-system.ts`** — 5 层提示词组合系统 (全局锚点 → 故事模板 → 风格子模板 → 角色场景 → 镜头级)
- **`styles-data.ts`** — 100+ 预定义视觉风格，每种含色彩、纹理、光照参数

### Legacy Frontend

根目录 `index.html` + `app.js` + `styles.css`，原始 vanilla JS 界面，由 Python server 直接 serve。

## Commands

### Python Backend
```bash
python server.py           # Start on http://127.0.0.1:8787
```
Environment vars: `VIDEO_CONSOLE_HOST`, `VIDEO_CONSOLE_PORT`, `VIDEO_MODEL_API_KEY`, `CORS_ORIGIN`

Python 唯一外部依赖：`pymysql>=1.1.0`（见 `requirements.txt`）

### Next.js Frontend (from `oii前端/oiioii-clone/`)
```bash
npm run dev                # Dev server on http://localhost:3001
npm run build              # Production build
npm start                  # Production server
```

### Tests
```bash
# Python (from project root)
pytest tests/                        # All tests
pytest tests/test_integration.py     # Integration tests
pytest tests/test_character_factory.py  # Single module

# E2E (from oii前端/oiioii-clone/)
npx playwright test                  # All E2E tests
```

## API Routes (Python Server)

- `GET /api/config` — server config
- `GET /api/history` — task history from manifest
- `GET /api/library` — saved assets
- `GET /api/tasks/{id}` — proxy upstream task status + auto-download on success
- `POST /api/tasks` — create generation task via upstream
- `POST /api/library/save` — save task video to library
- `POST /api/session/key` — update local API key/config
- `POST /api/open-storage` — open storage dir in OS file explorer
- `GET /media/videos/*` — serve local MP4 files
- `POST /api/workflow/*` — AI 工作流 CRUD（project, stages, chat）
- `POST /api/auth/*` — 登录/登出

## Generation Modes

`text`, `first_frame`, `first_last_frame`, `image_to_video`, `video_reference`, `extend_video` — each maps to different `content` reference structures in the upstream API payload.

## Key Data Structures

**WfProject** — 工作流项目核心类型：
- `storyType`: `drama | music_video | comic_adapt | promo | edu | merch | free_gen`
- 包含 `scriptAnalysis`, `characters[]`, `scenes[]`, `episodes[]`, `shots[]`, `videos[]`

**WfCharacter** — 角色资产：`appearance` (face/hair/body/skin_tone) + `assets` (9 张：3 视角 + 6 表情)

**EvalResult** — 评估结果：`scores[]` (criterion + weight + reason) → `average` → `passed`

## Storage

- `storage/videos/` — 下载的 MP4 文件
- `storage/projects/` — 项目数据
- `storage/manifest.json` — 任务历史和资产索引
- `.local-secrets.json` — 本地配置 (api_key, user_id, default_model, auto_save, MySQL 连接信息)，gitignored

## Notes

- Next.js 前端路径含中文字符 (`oii前端/`)，shell 命令中须加引号。
- TypeScript path alias: `@/*` → `./src/*`
- `.claude/launch.json` under `oii前端/` 配置 Claude Preview dev server (name: `oiioii-dev`, port 3001)。
- 后端 `server.py` 使用 stdlib `http.server`，无 Flask/FastAPI 依赖。
- MySQL 通过 `mysql_storage.py` 抽象，使用 context manager pattern。

## 交互规则

1. 动机或目标不清晰时，停下来问，不猜测不讨论。
2. 目标清晰但路径不是最短的，直接建议更好的办法。
3. 遇到问题追根因，不打补丁。每个决策都要能回答"为什么"。
4. 输出说重点，砍掉一切不改变决策的信息。

## 语言规则

所有回答必须全部使用中文。
