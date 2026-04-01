# 系统架构总览

> 本文档整合 CLAUDE.md 和 docs/00 的架构信息，描述 Seedance Studio 的整体系统架构。

---

## 一、系统架构图

```
┌─────────────────────────────────┐
│  Next.js Frontend (:3001)       │  React 19 + TypeScript + Tailwind CSS 4
│  store.ts <- workflow-engine.ts │  零外部状态库 (useSyncExternalStore)
│  api.ts -> /api/* /media/*      │
└───────────┬─────────────────────┘
            │ next.config.ts rewrites
┌───────────▼─────────────────────┐
│  Python Backend (:8787)         │  stdlib HTTPServer + ThreadPoolExecutor
│  server.py (router/proxy)       │
│  ├─ workflow_orchestrator.py    │  5-stage pipeline state machine
│  ├─ script_engine.py            │  Stage 1: 剧本 -> JSON
│  ├─ character_factory.py        │  Stage 2: 角色 -> 9 assets/character
│  ├─ storyboard_generator.py     │  Stage 3: 分镜 -> images
│  ├─ stage_evaluator.py          │  Hybrid evaluation (structural + LLM)
│  ├─ stage_contract.py           │  Builder <-> Evaluator negotiation
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

### Legacy Frontend

根目录 `index.html` + `app.js` + `styles.css`，原始 vanilla JS 界面，由 Python server 直接 serve。

---

## 二、AI 五阶段流水线概览

5 阶段流水线，每阶段有 Builder -> Evaluator 协商循环：

| 阶段 | 名称 | 说明 | 生成模型 |
|------|------|------|---------|
| 1 | Script Analysis | LLM 分析故事文本 -> 结构化 JSON (characters, scenes, episodes) | claude-sonnet-4-6 |
| 2 | Character Design | 每角色生成 9 张资产 (3 视角 x 正面/侧面/背面 + 6 表情)，ThreadPoolExecutor 并发 | nano-banana-2 |
| 3 | Storyboard | 场景 -> 镜头 -> 分镜图，LLM 生成描述 + 图像 API 生成帧，并发执行 | nano-banana-2 |
| 4 | Video Generation | Seedance API 异步任务 -> 轮询 -> 自动下载 MP4 | doubao-seedance-2.0 |
| 5 | Post-Production | 调色、特效、字幕、配音、BGM | 本地 FFmpeg |

**重试策略**：每阶段最多 3 次（前 2 次 REFINE 改进，第 3 次 PIVOT 换策略）。

### 整体工作流

```
用户输入剧本 ──► 风格定调 ──► AI剧本解析 ──► 资产生成 ──► 视频合成
   Step 1         Step 2       Step 3        Step 4       Step 5
```

---

## 三、项目状态机

```
draft -> configured -> scripting -> script_parsed -> designing ->
assets_locked -> storyboarding -> filming -> compositing -> done
                                                  |
                                          compositing_failed
                                        （可调整参数后重试）
```

对应 `WfProject.status` 字段：

| 状态 | 说明 |
|------|------|
| `draft` | 新建项目，未填剧本 |
| `configured` | 风格配置完成（Step 2） |
| `scripting` | 剧本解析中（Step 3） |
| `script_parsed` | 剧本解析完成，待确认 |
| `designing` | 角色/场景资产生成中（Step 4） |
| `assets_locked` | 资产锁定（Step 4 完成） |
| `storyboarding` | 分镜图生成中（Step 5a） |
| `filming` | 分镜视频生成中（Step 5b） |
| `compositing` | 后期合成中（Step 5c） |
| `compositing_failed` | 合成失败（可调整参数后重试） |
| `done` | 完成 |

---

## 四、第三方 API 配置

### 4.1 LLM 中转站（剧本解析、对话、提示词优化）

| 配置项 | 值 |
|--------|-----|
| **Base URL** | `http://peiqian.icu/v1` |
| **协议** | OpenAI Chat Completions 兼容 |
| **推荐模型** | `claude-sonnet-4-6`（主力编剧/分镜）、`claude-haiku-4-5`（轻量校验/提示词优化）、`gpt-4o`（备选） |

### 4.2 图像生成

| 用途 | 通道 | 模型 |
|------|------|------|
| 图像生成 | 中联 MAAS (`zlhub.xiaowaiyou.cn`) | `nano-banana-2` |

### 4.3 视频生成

| 用途 | 通道 | 模型 |
|------|------|------|
| 视频生成 | 中联 MAAS (`zlhub.xiaowaiyou.cn`) | `doubao-seedance-2.0` |

> **注意**: 图片和视频生成使用中联 MAAS 通道，**不走** peiqian.icu 中转站。只有文本类的 AI 请求走 peiqian.icu。

### 4.4 `.local-secrets.json` 配置字段

```json
{
  "ai_chat_base": "http://peiqian.icu/v1/chat/completions",
  "ai_chat_model": "claude-sonnet-4-6",
  "ai_chat_model_light": "claude-haiku-4-5",

  "ai_image_base": "https://zlhub.xiaowaiyou.cn/zhonglian/api/v1/proxy/images/generations",
  "ai_image_model": "nano-banana-2",

  "ai_video_base": "https://zlhub.xiaowaiyou.cn/zhonglian/api/v1/proxy/ark/contents/generations/tasks",
  "ai_video_model": "doubao-seedance-2.0"
}
```

### 4.5 模型选择策略

| 任务 | 推荐模型 | 原因 |
|------|---------|------|
| 剧本解析（Step 3） | `claude-sonnet-4-6` | 结构化 JSON 输出能力强 |
| 提示词优化/校验 | `claude-haiku-4-5` | 轻量快速，适合高频小任务 |
| 对话式微调 | `claude-sonnet-4-6` | 多轮对话理解力好 |
| 图像生成 | `nano-banana-2` | 现有配置 |
| 视频生成 | `doubao-seedance-2.0` | 现有配置 |

---

## 五、关键数据结构

### WfProject — 工作流项目核心类型

```typescript
interface WfProject {
  id: string;
  title: string;
  status: string;  // 见状态机
  storyType: "drama" | "music_video" | "comic_adapt" | "promo" | "edu" | "merch" | "free_gen";
  style_config: StyleConfig | null;
  reference_images: string[];
  script: { raw_input: string; analysis: ScriptAnalysis | null; chat_history: [] };
  characters: WfCharacter[];
  scenes: WfScene[];
  episodes: Episode[];
  shots: WfShot[];
  videos: WfVideo[];
  post_production: { subtitles_srt: string | null; final_output: string | null };
  version_index: { step2: VersionEntry[]; step3: VersionEntry[]; step4: VersionEntry[]; step5: VersionEntry[] };
}
```

### WfCharacter — 角色资产

```typescript
interface WfCharacter {
  id: string;
  name: string;
  appearance: {
    face: string;    // 面部特征
    hair: string;    // 发型发色
    body: string;    // 体型
    skin_tone: string;
  };
  assets: {
    front_view: string | null;   // 正面视图
    side_view: string | null;    // 侧面视图
    back_view: string | null;    // 背面视图
    expressions: Record<string, string | null>;  // 6 种表情
  };
  status: "pending" | "generating" | "done";
}
```

### EvalResult — 评估结果

```typescript
interface EvalResult {
  scores: Array<{
    criterion: string;   // 评估维度名
    weight: number;      // 权重
    score: number;       // 0-10 分
    reason: string;      // 评分理由
  }>;
  average: number;       // 加权平均分
  passed: boolean;       // 是否通过门槛
  issues: string[];      // 发现的问题列表
  recommendation: "PASS" | "REFINE";
}
```

---

## 六、存储结构

```
storage/
├── videos/              # 下载的 MP4 文件
├── projects/            # 项目数据
│   └── proj-xxx/
│       ├── project.json
│       ├── versions/    # 版本历史
│       ├── assets/      # 角色/场景图片
│       └── output/      # 最终合成输出
└── manifest.json        # 任务历史和资产索引

.local-secrets.json      # 本地配置（gitignored）
```

---

## 七、与现有项目的集成

项目已有完整基础设施：

- 5 步工作流 UI（`workflow/[projectId]/ai-produce/page.tsx`）
- 工作流引擎（`src/lib/workflow-engine.ts`）
- 后端工作流路由（`/api/workflow/*`）
- 风格库数据（`src/lib/styles-data.ts`）— 100+ 风格
- TypeScript 类型定义（`src/types/workflow.ts`）
- 状态管理（`src/lib/store.ts`）

两种运行模式共享底层引擎：
- **手动模式**：前端 `store.ts` 逐步调用，用户点击触发
- **托管模式**：后端 `WorkflowOrchestrator` 自动循环，后台线程执行
