# 编码规范与贡献指南

> 从 AGENTS.md 提取并扩充，适用于本项目所有贡献者。

---

## 一、Python 编码风格

- **缩进**：4 空格
- **命名**：`snake_case` 用于函数名、变量名、文件名
- **类名**：`PascalCase`
- **函数设计**：小而聚焦的辅助函数，单一职责
- **文件组织**：
  - 根目录 Python 服务：`server.py`、`script_engine.py`、`character_factory.py`、`storyboard_generator.py`、`video_composer.py`
  - 不要修改 `storage/`、`.next/`、日志文件等运行时目录

### 示例

```python
def handle_project_render(self, project_id: str) -> dict:
    """将分镜视频合成为最终影片。"""
    project = load_project(project_id)
    if not project:
        return self._json_error(404, "项目不存在")

    shot_videos = collect_shot_videos(project)
    # ...
```

---

## 二、TypeScript/React 编码风格

- **缩进**：2 空格（项目现有风格）
- **组件命名**：`PascalCase`（如 `StoryTypeSelector.tsx`、`FilmParamsPanel.tsx`）
- **函数/hooks**：`camelCase`（如 `useProjectStore`、`handlePromptEdit`）
- **页面文件**：遵循 Next.js 约定，位于 `src/app/**/page.tsx`
- **路径别名**：`@/*` 映射到 `./src/*`（配置于 `tsconfig.json`）
- **前端目录**：`src/`（`app/`、`components/`、`lib/`、`types/`）

### 示例

```typescript
export function StoryTypeSelector({
  selectedType,
  onSelect,
}: StoryTypeSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {STORY_TYPES.map((type) => (
        <TypeCard
          key={type.id}
          type={type}
          selected={type.id === selectedType}
          onClick={() => onSelect(type.id)}
        />
      ))}
    </div>
  );
}
```

---

## 三、测试文件命名约定

| 类型 | 命名模式 | 位置 | 运行命令 |
|------|---------|------|---------|
| Python 单元测试 | `test_*.py` | `tests/` | `python -m unittest discover -s tests -v` |
| 特定模块测试 | `test_{module}.py` | `tests/` | `python -m unittest tests.test_task_routes -v` |
| 浏览器功能测试 | `*.mjs`（Playwright 风格） | `tests/` | `node tests/functional_test.mjs` |

### 测试指南

- 优先为后端行为和 API 路由编写针对性的单元测试
- 新测试文件放在 `tests/` 目录下，与相关模块对应
- UI 行为变更时，在 `tests/*.mjs` 中添加或更新 Playwright 脚本
- 回归测试覆盖关键 API 路由

---

## 四、Commit 消息格式

使用 **Conventional Commits** 规范：

```
<type>: <简短描述>

<可选的详细说明>
```

### 类型

| 类型 | 用途 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat: AI漫剧生成工作流 Phase 1 MVP` |
| `fix` | Bug 修复 | `fix: avoid upstream lookup for invalid task ids` |
| `refactor` | 代码重构 | `refactor: extract prompt compilation logic` |
| `docs` | 文档更新 | `docs: add workflow pipeline documentation` |
| `test` | 测试 | `test: add regression coverage for task routes` |
| `chore` | 杂项维护 | `chore: update dependencies` |
| `perf` | 性能优化 | `perf: reduce LLM token usage in evaluation` |
| `ci` | CI/CD 配置 | `ci: add build check workflow` |

### 要求

- 使用简短的祈使语气主题行
- 主题行尽量不超过 70 个字符
- 可选的正文部分提供详细说明

---

## 五、Pull Request 要求

PR 应包含以下内容：

1. **行为变更摘要**：简要说明做了什么、为什么做
2. **测试/构建命令**：列出已执行的验证命令
3. **截图**：如有可见的 UI 变更，附上截图
4. **配置说明**：涉及的配置变更（`.local-secrets.json`、MySQL、上游 API 等）

### PR 模板

```markdown
## 摘要
- 简要描述行为变更

## 测试
- `npm run build` ✅
- `python -m unittest discover -s tests -v` ✅

## 截图
（如有 UI 变更）

## 配置说明
（如有配置/环境变更）
```

---

## 六、安全与配置提示

### 敏感文件

- **`.local-secrets.json`**：存储 API key、数据库凭据等敏感信息，**绝不提交到版本控制**
- 已在 `.gitignore` 中排除
- 代码审查时注意检查是否有硬编码的密钥或凭据

### 环境依赖

- 本地开发需要 MySQL 和上游网络访问
- 调试应用逻辑前，先验证数据库连接和网络可达性
- 后端和前端需同时运行：后端 `python server.py`（端口 8787），前端 `npm run dev`（端口 3001）

### 运行时数据目录

以下目录为运行时生成，不应手动编辑（除非任务明确要求）：

- `.next/` — Next.js 构建产物
- `storage/` — 项目数据、视频文件、manifest
- 日志文件

---

## 七、正确性检验

本项目**不使用 formatter 或 linter**。以下两项作为主要的正确性检验手段：

### 前端

```bash
npm run build
```

- 执行 TypeScript 类型检查和 Next.js 生产构建
- 所有类型错误和构建错误必须在提交前修复

### 后端

```bash
python -m unittest discover -s tests -v
```

- 运行所有 Python 单元测试
- 确保关键路由和业务逻辑的测试覆盖

### 启动验证

如需验证完整启动流程，参考 `docs/启动问题记录-20260329.md` 中的已知问题和修复方案（包括无效 task ID 处理和 Windows 环境下使用 `npm.cmd` 的要求）。
