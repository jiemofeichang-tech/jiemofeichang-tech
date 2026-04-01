# 我的资产页面重构设计文档

## 1. 背景与目标

### 1.1 现状问题

当前"我的资产"页面（`LibrarySection.tsx`）实际上是一个"本地作品库"，只展示已下载的视频文件。存在以下问题：

1. **资产类型单一** — 只展示视频，不包含角色、分镜、场景等工作流产出的资产
2. **无分类/筛选** — 没有 Tab 分类、搜索功能
3. **无创建入口** — 没有"创建新角色"等快捷操作入口
4. **无收藏机制** — 没有收藏/取消收藏功能
5. **UI 粗糙** — 使用内联样式，卡片设计缺乏层次感和交互反馈
6. **与工作流脱节** — 工作流中生成的角色、分镜资产无法进入资产库管理

### 1.2 对标分析（OiiOii.ai `/asset/role-list`）

根据截图分析，对标网站的资产页面具备：

| 功能 | 说明 |
|------|------|
| **Tab 分类** | "角色" Tab，可能有场景、分镜等其他 Tab |
| **角色卡片** | 卡通漫画风卡片，带编号（NO.）、角色形象预览 |
| **创建入口** | "创建新角色" 卡片（带 + 图标），与角色卡片同列 |
| **我的收藏** | 右上角"我的收藏"筛选按钮 |
| **搜索** | "搜索角色" 搜索框 |
| **加载更多** | 底部"加载更多..."无限滚动 |
| **品牌视觉** | 荧光绿边框、暗色背景、漫画风格装饰 |

### 1.3 目标

将"本地作品库"升级为完整的**资产管理中心**，统一管理工作流全链路产出的所有资产类型，对齐对标网站的交互体验。

---

## 2. 资产类型定义

### 2.1 资产分类 Tab

| Tab | 标识 | 数据来源 | 说明 |
|-----|------|----------|------|
| **角色** | `characters` | 工作流 Stage 2 角色设计 | 每角色 9 张资产图（3 视角 + 6 表情） |
| **分镜** | `storyboards` | 工作流 Stage 3 分镜生成 | 场景分镜面板图 |
| **视频** | `videos` | 工作流 Stage 4 + 本地作品库 | 生成的视频片段和合成视频 |
| **场景** | `scenes` | 工作流 Stage 1 剧本解析 | 场景描述和参考图 |

默认激活 Tab：**角色**（与对标网站一致）。

### 2.2 资产数据结构

```typescript
// 统一资产基础类型
interface BaseAsset {
  id: string;
  name: string;
  type: 'character' | 'storyboard' | 'video' | 'scene';
  projectId: string;         // 所属项目
  projectName: string;       // 项目名称
  createdAt: string;         // ISO timestamp
  thumbnailUrl: string;      // 缩略图
  favorited: boolean;        // 是否收藏
  tags: string[];            // 标签
}

// 角色资产
interface CharacterAsset extends BaseAsset {
  type: 'character';
  characterId: string;
  appearance: {
    face: string;
    hair: string;
    body: string;
    skin_tone: string;
  };
  images: Record<CharacterImageKey, string>;  // 9 张图
  // CharacterImageKey = front_view | side_view | back_view |
  //   expression_happy | expression_sad | expression_angry |
  //   expression_surprised | expression_thinking | expression_shy
}

// 分镜资产
interface StoryboardAsset extends BaseAsset {
  type: 'storyboard';
  panels: {
    panelId: string;
    imageUrl: string;
    shotType: string;
    cameraAngle: string;
    dialogue: string;
    duration: number;
  }[];
  episodeId: string;
}

// 视频资产（兼容现有 AssetRecord）
interface VideoAsset extends BaseAsset {
  type: 'video';
  remoteUrl: string;
  localUrl: string;
  downloadUrl: string;
  filename: string;
  resolution?: string;
  ratio?: string;
  duration?: number;
}

// 场景资产
interface SceneAsset extends BaseAsset {
  type: 'scene';
  sceneId: string;
  description: string;
  location: string;
  time: string;
  mood: string;
  referenceImages: string[];
}
```

---

## 3. 页面结构设计

### 3.1 整体布局

```
┌──────────────────────────────────────────────────────┐
│  页头区域                                              │
│  ┌──────────────────────────────────────────────────┐│
│  │ 标题: "我的资产"                                    ││
│  │ Tab栏: [角色] [分镜] [视频] [场景]                    ││
│  │ 右侧: [● 我的收藏]  [搜索框 🔍]                      ││
│  └──────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────┤
│  内容区域                                              │
│  ┌──────────────────────────────────────────────────┐│
│  │  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐         ││
│  │  │ 创建  │  │ 资产1 │  │ 资产2 │  │ 资产3 │        ││
│  │  │ 新XX  │  │      │  │      │  │      │         ││
│  │  │  +   │  │      │  │      │  │      │         ││
│  │  └──────┘  └──────┘  └──────┘  └──────┘         ││
│  │                                                   ││
│  │  ┌──────┐  ┌──────┐  ┌──────┐                    ││
│  │  │ 资产4 │  │ 资产5 │  │ 资产6 │                   ││
│  │  │      │  │      │  │      │                    ││
│  │  └──────┘  └──────┘  └──────┘                    ││
│  └──────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────┤
│  底部: "加载更多..." / 无更多数据                         │
└──────────────────────────────────────────────────────┘
```

### 3.2 组件树

```
AssetPage (新组件，替代 LibrarySection)
├── AssetHeader
│   ├── Title ("我的资产")
│   ├── AssetTabs (角色/分镜/视频/场景)
│   └── AssetToolbar
│       ├── FavoriteFilter (我的收藏 toggle)
│       └── SearchInput (搜索框)
├── AssetGrid
│   ├── CreateCard (创建新XX，仅角色Tab)
│   ├── CharacterAssetCard[] (角色Tab)
│   ├── StoryboardAssetCard[] (分镜Tab)
│   ├── VideoAssetCard[] (视频Tab)
│   └── SceneAssetCard[] (场景Tab)
├── AssetDetailModal (资产详情弹窗)
│   ├── CharacterDetail (角色9图展示)
│   ├── StoryboardDetail (分镜面板浏览)
│   ├── VideoDetail (视频播放器)
│   └── SceneDetail (场景详情)
└── LoadMore / EmptyState
```

---

## 4. 各 Tab 卡片设计

### 4.1 角色卡片（CharacterAssetCard）

对标网站风格：漫画风卡片，带编号和角色形象。

```
┌─────────────────────┐
│  NO. 001            │  ← 左上角编号标签
│ ┌─────────────────┐ │
│ │                 │ │  ← 角色正面图（front_view）
│ │   [角色形象]     │ │     宽高比 3:4
│ │                 │ │     hover: 切换到侧面图
│ │                 │ │
│ └─────────────────┘ │
│  角色名称            │  ← 单行，超长截断
│  项目名 · 3视角6表情  │  ← 副标题行
│  ★ ↓ ⋯              │  ← 收藏/下载/更多 操作图标
└─────────────────────┘
```

**交互行为：**
- **Hover**: 图片从正面图切换为侧面图（平滑过渡）
- **点击**: 打开 CharacterDetailModal，展示 9 张全部资产
- **收藏**: 点击星标切换收藏状态
- **下载**: 打包下载该角色全部 9 张图片（ZIP）
- **更多菜单**: 删除、在工作流中编辑

**视觉样式：**
- 荧光绿边框（`#BFFF00`），与对标网站一致
- 暗色卡片背景（`rgba(255,255,255,0.05)`）
- 圆角 12px
- 编号标签：黑底白字，左上角绝对定位

### 4.2 分镜卡片（StoryboardAssetCard）

```
┌─────────────────────┐
│ ┌────┬────┬────┐    │  ← 分镜缩略图 2x2 网格预览
│ │ P1 │ P2 │ P3 │    │     取前4张面板
│ ├────┼────┤    │    │
│ │ P4 │ +N │    │    │     "+N" 表示剩余面板数
│ └────┴────┴────┘    │
│  分镜名称            │
│  8 个镜头 · 项目名    │
│  ★ ↓ ⋯              │
└─────────────────────┘
```

**交互行为：**
- **点击**: 打开分镜浏览模式，左右滑动查看每个面板
- **下载**: 打包全部分镜图为 ZIP

### 4.3 视频卡片（VideoAssetCard）

保留现有视频卡片设计，增强为：

```
┌─────────────────────┐
│ ┌─────────────────┐ │
│ │                 │ │  ← 视频封面帧
│ │   ▶ 0:15       │ │     右下角时长标签
│ │                 │ │     hover: 自动播放
│ └─────────────────┘ │
│  视频标题            │
│  720p · 16:9 · 15s  │  ← 元数据标签
│  ★ ↓ 🔗 ⋯           │  ← 收藏/下载/远程链接/更多
└─────────────────────┘
```

### 4.4 场景卡片（SceneAssetCard）

```
┌─────────────────────┐
│ ┌─────────────────┐ │
│ │   [参考图/       │ │  ← 场景参考图或渐变占位
│ │    渐变色块]     │ │
│ └─────────────────┘ │
│  场景名称            │
│  ☀ 白天 · 🏙 城市    │  ← 时间/地点标签
│  ★ ⋯                │
└─────────────────────┘
```

### 4.5 创建卡片（CreateCard）

仅在"角色" Tab 显示，作为第一张卡片：

```
┌─────────────────────┐
│                     │
│        ⊕            │  ← 大号加号图标，荧光绿色
│                     │
│    创建新角色         │  ← 居中文字
│                     │
└─────────────────────┘
```

**样式**：虚线边框，荧光绿（`#BFFF00`），hover 时背景微亮。
**点击行为**：跳转到工作流创建页面（`/workflow/new`），预设到角色设计阶段。

---

## 5. 搜索与筛选

### 5.1 搜索

- **搜索框**：右上角，圆角输入框 + 搜索图标
- **搜索范围**：当前激活 Tab 内的资产名称
- **实现**：前端过滤（数据量小），debounce 300ms
- **Placeholder**：根据 Tab 动态变化（"搜索角色"、"搜索分镜"...）

### 5.2 收藏筛选

- **位置**：搜索框左侧
- **样式**：`● 我的收藏` 圆形指示器 + 文字
- **行为**：toggle 开关，激活时只显示 `favorited: true` 的资产
- **状态持久化**：保存在 `localStorage`

---

## 6. 资产详情弹窗（AssetDetailModal）

### 6.1 角色详情

```
┌──────────────────────────────────────────┐
│  ✕                     角色名称          │
├──────────────────────────────────────────┤
│  三视角展示区域                            │
│  ┌──────┐  ┌──────┐  ┌──────┐           │
│  │ 正面  │  │ 侧面  │  │ 背面  │          │
│  │      │  │      │  │      │           │
│  └──────┘  └──────┘  └──────┘           │
│                                          │
│  表情展示区域                              │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐│
│  │😊  │ │😢  │ │😠  │ │😲  │ │🤔  │ │😳  ││
│  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘│
│                                          │
│  角色信息                                  │
│  外貌: xxx  性格: xxx                      │
│  所属项目: xxx                             │
│                                          │
│  [★ 收藏]  [↓ 下载全部]  [在工作流中编辑]   │
└──────────────────────────────────────────┘
```

### 6.2 视频详情

保留现有播放逻辑，增加全屏播放、远程链接查看。

---

## 7. 数据流与 API

### 7.1 新增/修改 API

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/assets` | 统一资产列表，支持 `?type=character&search=xxx&favorited=true` |
| `GET` | `/api/assets/:id` | 资产详情 |
| `POST` | `/api/assets/:id/favorite` | 切换收藏状态 |
| `DELETE` | `/api/assets/:id` | 删除资产（移入回收站） |
| `GET` | `/api/assets/:id/download` | 打包下载（角色返回 ZIP，视频返回 MP4） |

### 7.2 后端实现

在 `server.py` 中新增资产聚合逻辑：

```python
def list_all_assets(asset_type=None, search=None, favorited=None):
    """
    聚合所有项目中的资产：
    1. 遍历 storage/projects/ 下的项目
    2. 从每个项目的 data.json 中提取 characters, storyboards, scenes
    3. 合并现有 manifest.assets 中的视频资产
    4. 应用筛选条件
    5. 按创建时间倒序返回
    """
```

### 7.3 收藏持久化

收藏状态保存在 `manifest.json` 中新增的 `favorites` 字段：

```json
{
  "favorites": {
    "character_001": true,
    "video_abc123": true
  }
}
```

### 7.4 前端 API 函数

在 `src/lib/api.ts` 新增：

```typescript
// 获取统一资产列表
export function fetchAssets(params?: {
  type?: string;
  search?: string;
  favorited?: boolean;
}) {
  const qs = new URLSearchParams();
  if (params?.type) qs.set('type', params.type);
  if (params?.search) qs.set('search', params.search);
  if (params?.favorited) qs.set('favorited', '1');
  return api<{ assets: BaseAsset[] }>(`/api/assets?${qs}`);
}

// 切换收藏
export function toggleFavorite(assetId: string) {
  return api<{ favorited: boolean }>(`/api/assets/${assetId}/favorite`, {
    method: 'POST',
  });
}

// 下载资产（角色ZIP / 视频MP4）
export function downloadAsset(assetId: string) {
  window.open(`/api/assets/${assetId}/download`, '_blank');
}
```

---

## 8. 工作流资产自动入库

### 8.1 触发时机

资产在以下时刻自动进入"我的资产"：

| 阶段 | 触发条件 | 入库资产 |
|------|----------|----------|
| Stage 2 角色设计 | 角色 9 图全部生成完成（status=done） | CharacterAsset |
| Stage 3 分镜生成 | 分镜面板全部生成完成 | StoryboardAsset |
| Stage 4 视频生成 | 视频下载到本地 | VideoAsset |
| Stage 1 剧本解析 | 场景列表解析完成 | SceneAsset（可选） |

### 8.2 实现方式

在各阶段 Builder 完成回调中，调用 `save_asset_record()` 写入 manifest：

```python
# character_factory.py 中，角色生成完成后
def on_character_complete(project_id, character):
    asset = {
        "id": f"char_{character['character_id']}",
        "type": "character",
        "name": character["name"],
        "projectId": project_id,
        # ... 其他字段
    }
    save_asset_record(asset)
```

---

## 9. 文件变更清单

### 新建文件

| 文件 | 说明 |
|------|------|
| `src/components/AssetPage.tsx` | 资产页面主组件（替代 LibrarySection） |
| `src/components/assets/AssetTabs.tsx` | Tab 切换组件 |
| `src/components/assets/AssetGrid.tsx` | 资产网格布局 |
| `src/components/assets/CharacterAssetCard.tsx` | 角色卡片 |
| `src/components/assets/StoryboardAssetCard.tsx` | 分镜卡片 |
| `src/components/assets/VideoAssetCard.tsx` | 视频卡片（重构自 AssetCard） |
| `src/components/assets/SceneAssetCard.tsx` | 场景卡片 |
| `src/components/assets/CreateCard.tsx` | 创建新资产卡片 |
| `src/components/assets/AssetDetailModal.tsx` | 资产详情弹窗 |
| `src/components/assets/AssetSearchBar.tsx` | 搜索+收藏筛选 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `src/app/page.tsx` | 将 `community` Tab 渲染从 LibrarySection 切换到 AssetPage |
| `src/components/Sidebar.tsx` | 更新"我的资产"图标为资产图标 |
| `src/lib/api.ts` | 新增 `fetchAssets`、`toggleFavorite`、`downloadAsset` |
| `server.py` | 新增 `/api/assets` 系列路由 + 资产聚合逻辑 |
| `character_factory.py` | 角色完成后自动入库 |
| `storyboard_generator.py` | 分镜完成后自动入库 |

### 废弃文件

| 文件 | 处理 |
|------|------|
| `src/components/LibrarySection.tsx` | 功能迁移到 AssetPage 后删除 |

---

## 10. 视觉规范

### 10.1 颜色

| 用途 | 色值 | 说明 |
|------|------|------|
| 卡片高亮边框 | `#BFFF00` | 荧光绿，对标网站特征色 |
| 卡片背景 | `rgba(255,255,255,0.05)` | 暗色背景 |
| 卡片 hover 背景 | `rgba(255,255,255,0.08)` | 轻微提亮 |
| Tab 激活 | `#fff` 文字 + 底部指示线 | |
| Tab 默认 | `rgba(255,255,255,0.5)` | |
| 收藏星标 | `#FFD700` | 金色 |
| 删除色 | `#ff6b6b` | 红色 |
| 创建卡片边框 | `#BFFF00` 虚线 | |

### 10.2 卡片尺寸

- 网格列：`repeat(auto-fill, minmax(200px, 1fr))`
- 卡片间距：`20px`
- 卡片圆角：`12px`
- 缩略图高度：角色 `240px`、视频 `160px`、分镜 `180px`
- 卡片内边距：`0`（图片占满宽度）+ `12px`（文字区域）

### 10.3 响应式断点

| 宽度 | 列数 |
|------|------|
| ≥ 1400px | 5 列 |
| ≥ 1100px | 4 列 |
| ≥ 800px | 3 列 |
| ≥ 500px | 2 列 |
| < 500px | 1 列 |

---

## 11. 实现优先级

### Phase 1 — MVP（本次实现）

1. AssetPage 框架 + Tab 切换
2. 角色卡片 + 角色详情弹窗
3. 视频卡片（迁移自 LibrarySection）
4. 搜索功能
5. 后端 `/api/assets` 聚合 API

### Phase 2 — 增强

6. 收藏功能
7. 分镜卡片 + 分镜详情
8. 场景卡片
9. 创建新角色卡片（跳转工作流）
10. 工作流资产自动入库

### Phase 3 — 打磨

11. 批量操作（多选删除、批量下载）
12. 角色 ZIP 打包下载
13. 排序选项（时间、名称）
14. 回收站中的资产恢复
15. 无限滚动分页

---

## 12. 审核记录 (2026-03-29)

### 审核结论

设计文档整体方向正确，Phase 1 已实施完成。以下是实施中的调整：

| 设计文档原内容 | 实际调整 | 原因 |
|---|---|---|
| 路径 `oii前端/oiioii-clone/src/` | 改为 `src/` | 项目已扁平化到根目录 |
| 新建 `BaseAsset`、`CharacterAsset` 等类型 | 复用 `api.ts` 中的 `WfCharacter`、`WfScene`、`WfShot`、`AssetRecord` | 避免类型重复 |
| 新建后端 `/api/assets` 聚合 API | 前端直接用 `wfListProjects` + `wfGetProject` 聚合 | Phase 1 不需后端改动 |
| Phase 2 的分镜卡片、场景卡片 | 提前到 Phase 1 一并实现 | 代码量不大，一步到位 |

### Phase 1 实施清单

**新建文件（10 个）：**
- `src/types/assets.ts` — 资产类型定义
- `src/components/assets/AssetPage.tsx` — 主组件
- `src/components/assets/AssetTabs.tsx` — Tab 切换
- `src/components/assets/AssetGrid.tsx` — 网格布局
- `src/components/assets/AssetSearchBar.tsx` — 搜索 + 收藏筛选
- `src/components/assets/CharacterAssetCard.tsx` — 角色卡片
- `src/components/assets/VideoAssetCard.tsx` — 视频卡片
- `src/components/assets/CreateCard.tsx` — 创建新角色卡片
- `src/components/assets/AssetDetailModal.tsx` — 角色详情弹窗

**修改文件（2 个）：**
- `src/app/page.tsx` — community Tab 渲染 AssetPage 替代 LibrarySection
- `src/components/Sidebar.tsx` — GlobeIcon 替换为 AssetIcon（立方体图标）
