# 前端开发指南

> Next.js 16 + React 19 + TypeScript + Tailwind CSS 4 前端开发指南。

---

## 一、项目结构

前端代码位于 `oii前端/oiioii-clone/` 目录下：

```
oii前端/oiioii-clone/
├── src/
│   ├── app/                    # Next.js App Router 页面
│   │   ├── page.tsx            # 首页（项目列表）
│   │   └── workflow/
│   │       └── [projectId]/
│   │           ├── ai-produce/
│   │           │   └── page.tsx    # 手动模式主页面
│   │           └── autonomous/
│   │               └── page.tsx    # 托管模式主页面
│   ├── components/             # React 组件
│   │   └── workflow/           # 工作流相关组件
│   ├── lib/                    # 核心库模块
│   │   ├── store.ts            # 状态管理
│   │   ├── workflow-engine.ts  # AI 编排引擎
│   │   ├── api.ts              # HTTP 客户端
│   │   ├── prompt-system.ts    # 提示词系统
│   │   └── styles-data.ts      # 风格库数据
│   └── types/                  # TypeScript 类型定义
│       └── workflow.ts
├── public/                     # 静态资产
├── next.config.ts              # 代理 rewrites 到 backend
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

> **重要**: 前端路径含中文字符 (`oii前端/`)，shell 命令中须加引号。

---

## 二、核心模块说明

### 2.1 `store.ts` — 状态管理

自研状态管理，基于 React 18+ 的 `useSyncExternalStore`，**零外部依赖**（不使用 Redux/Zustand/MobX）。

核心功能：
- 项目 CRUD 操作
- 工作流步骤状态跟踪
- 托管模式管线状态 (`pipelineStatus`)
- 风格配置管理 (`setStyleConfig`)

```typescript
// 使用方式
const project = useStore(s => s.currentProject);
const status = useStore(s => s.pipelineStatus);
```

### 2.2 `workflow-engine.ts` — AI 编排引擎

驱动 AI 五阶段流水线的前端引擎：

- `analyzeScript()` — 调用 LLM 解析剧本为结构化 JSON
- `generateCharacterViews()` — 生成角色三视图
- `generateCharacterExpressions()` — 生成角色表情图
- `generateSceneViews()` — 生成场景六视图
- `generateStoryboardImage()` — 生成分镜图
- `generateShotVideo()` — 生成分镜视频
- `buildScriptPrompt()` — 构建剧本解析提示词
- `buildShotImagePrompt()` — 构建分镜图提示词

### 2.3 `api.ts` — 类型安全 HTTP 客户端

30+ 函数的类型安全 HTTP 客户端，包含：

| 函数类别 | 示例 |
|---------|------|
| 项目 API | `wfCreateProject()`, `wfUpdateProject()`, `wfGetProject()` |
| AI 生成 | `wfAiChatStream()`, `wfGenerateImage()` |
| 任务管理 | `createTask()`, `queryTask()` |
| 版本历史 | `wfGetVersions()`, `wfRestoreVersion()` |
| 托管管线 | `wfStartPipeline()`, `wfPollPipelineStatus()` |
| 资产管理 | `wfUploadAsset()` |

### 2.4 `prompt-system.ts` — 5 层提示词组合系统

提示词层级架构：

```
Layer 0: 全局质量锚定词（固定，用户不可见）
Layer 1: 短片类型提示词（用户选择触发）
Layer 2: 风格子类提示词（用户选择触发）
Layer 3: 角色/场景专属提示词（AI 从剧本生成）
Layer 4: 分镜提示词（AI 从剧本生成）
Layer 5: 反面提示词（内部匹配，用户不可见）
```

合成公式：
```
最终图像提示词 = Layer 4 + Layer 3 + Layer 2 + Layer 1 + Layer 0
最终反面提示词 = 风格反面词 + 通用反面词
```

### 2.5 `styles-data.ts` — 100+ 预定义视觉风格

每种风格包含：
- `name` — 风格名称
- `cover` — 封面图片 URL
- `categories` — 所属分类
- `prompt` — 风格专属正面提示词（英文）
- `negativePrompt` — 风格专属反面提示词（英文）

分类：国风、IP风格、日系风格、插画风格、可爱Q版、欧美风格、韩系、立体风格。

---

## 三、TypeScript 配置

### Path Alias

```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

使用方式：
```typescript
import { useStore } from '@/lib/store';
import { wfCreateProject } from '@/lib/api';
import type { WfProject } from '@/types/workflow';
```

### 关键类型定义

```typescript
// src/types/workflow.ts

interface StyleConfig {
  story_type: string;
  art_style: string;
  art_substyle: string;
  aspect_ratio: "16:9" | "9:16" | "1:1";
  duration_sec: number;
  language: string;
  shot_duration_sec: number;
  compiled_style_prompt: string;
  compiled_negative_prompt: string;
  prompt_manually_edited: boolean;
  prompt_edit_history: string[];
}

interface StoryTypeOption {
  id: string;
  label: string;
  description: string;
  prompt: string;
}

interface StyleOption {
  name: string;
  cover: string;
  categories: string[];
  prompt: string;
  negativePrompt: string;
}
```

---

## 四、状态管理

### 设计原则

- 使用 `useSyncExternalStore`，无外部状态库依赖
- Store 为单例模式，通过 `useStore(selector)` hook 订阅
- 所有异步操作（API 调用）封装在 store actions 中

### 托管模式扩展

```typescript
interface StoreState {
  // 现有字段...
  pipelineStatus: PipelineStatus | null;
  pipelinePolling: boolean;
}

// 新增 Actions
startPipeline(params) → Promise<void>
pollPipelineStatus() → Promise<void>
resumePipeline() → Promise<void>
cancelPipeline() → Promise<void>
```

### 轮询策略

```
启动管线 → 开始轮询（间隔 3s）
  ├─ status === "running" → 继续轮询
  ├─ status === "completed" → 停止，展示报告
  ├─ status === "failed" → 停止，展示错误
  └─ status === "paused" → 停止，展示恢复按钮
```

---

## 五、Next.js 配置

### 代理 Rewrites

`next.config.ts` 中配置了请求代理，将 `/api/*` 和 `/media/*` 转发到 Python 后端 `:8787`：

```typescript
// next.config.ts
async rewrites() {
  return [
    { source: '/api/:path*', destination: 'http://localhost:8787/api/:path*' },
    { source: '/media/:path*', destination: 'http://localhost:8787/media/:path*' },
  ];
}
```

### 开发命令

```bash
# 从 oii前端/oiioii-clone/ 目录执行
npm run dev     # 开发服务器 http://localhost:3001
npm run build   # 生产构建 + TypeScript 检查
npm start       # 生产服务器
```

### Claude Preview 配置

`.claude/launch.json` under `oii前端/` 配置了 Claude Preview dev server：
- Name: `oiioii-dev`
- Port: `3001`

---

## 六、组件组织

### 工作流组件 (`src/components/workflow/`)

| 组件 | 功能 |
|------|------|
| `WorkflowSidebar.tsx` | 步骤指示器和导航 |
| `StoryTypeSelector.tsx` | 短片类型选择卡片组 |
| `FilmParamsPanel.tsx` | 影片参数设置面板 |
| `StylePickerModal.tsx` | 全屏风格选择弹窗 |
| `PromptEditor.tsx` | 提示词高级编辑面板 |
| `VersionHistoryPanel.tsx` | 版本列表面板 |
| `VersionBadge.tsx` | 版本计数徽章 |

### 页面组织

```
src/app/
├── page.tsx                              # 项目列表
└── workflow/[projectId]/
    ├── ai-produce/page.tsx               # 手动模式 5 步工作流
    └── autonomous/page.tsx               # 托管模式（全自动）
```

---

## 七、注意事项

1. **路径含中文**：前端路径包含 `oii前端/`，在 shell 命令中必须用引号括起来
2. **Windows 兼容**：后台启动前端需使用 `npm.cmd` 而非 `npm`
3. **无 Linter/Formatter**：项目未配置专用 linter，使用 `npm run build` 和单元测试作为主要正确性检查
4. **TypeScript 严格模式**：所有新代码应符合 TypeScript 类型安全要求
5. **Tailwind CSS 4**：使用最新版 Tailwind，注意 v4 的语法变化
