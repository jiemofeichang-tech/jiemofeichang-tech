# 后端开发指南

> Python stdlib HTTPServer 后端开发指南。无 Flask/FastAPI 依赖。

---

## 一、架构概述

后端基于 Python 标准库的 `http.server.HTTPServer` + `concurrent.futures.ThreadPoolExecutor`，不依赖任何 Web 框架。

```
server.py (入口)
├─ HTTPServer (端口 8787)
├─ ThreadPoolExecutor (并发任务)
├─ 路由分发 → 各处理函数
└─ 反向代理 → 上游 API
```

**唯一外部依赖**: `pymysql>=1.1.0`（见 `requirements.txt`）

### 启动命令

```bash
python server.py    # 启动 http://127.0.0.1:8787
```

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VIDEO_CONSOLE_HOST` | 服务器绑定地址 | `127.0.0.1` |
| `VIDEO_CONSOLE_PORT` | 服务器端口 | `8787` |
| `VIDEO_MODEL_API_KEY` | 上游 API key | 从 `.local-secrets.json` |
| `CORS_ORIGIN` | CORS 允许来源 | `*` |

---

## 二、模块职责

### 2.1 核心路由与代理

| 模块 | 文件 | 职责 |
|------|------|------|
| **路由器** | `server.py` | HTTP 请求路由、CORS 处理、静态文件 serve、反向代理 |

### 2.2 AI 管线引擎

| 模块 | 文件 | 职责 |
|------|------|------|
| **管线编排** | `workflow_orchestrator.py` (~350行) | 5 阶段 Pipeline 状态机，Plan-Build-Evaluate 循环 |
| **剧本引擎** | `script_engine.py` (303行) | Stage 1: 调用 LLM 将剧本文本解析为结构化 JSON |
| **角色工厂** | `character_factory.py` (505行) | Stage 2: 生成角色三视图 + 表情图，每角色 9 张资产 |
| **分镜生成** | `storyboard_generator.py` (442行) | Stage 3: 场景 -> 镜头 -> 分镜参考图 |
| **视频合成** | `video_composer.py` (339行) | Stage 5: FFmpeg 拼接、转场、字幕、配音、BGM、渲染 |

### 2.3 质量评估与契约

| 模块 | 文件 | 职责 |
|------|------|------|
| **质量评估** | `stage_evaluator.py` (~400行) | 混合评估：结构检查（确定性）+ LLM 深度评分 |
| **阶段契约** | `stage_contract.py` (~150行) | 定义各阶段验收标准（维度、权重、门槛分） |

### 2.4 状态与持久化

| 模块 | 文件 | 职责 |
|------|------|------|
| **MySQL 存储** | `mysql_storage.py` | MySQL 持久化层，context manager pattern |
| **版本管理** | `version_manager.py` | 快照版本化，每步骤可回退 |
| **检查点** | `workflow_checkpoint.py` (~120行) | Pipeline 断点续传，自动保存/恢复 |
| **管线状态** | `workflow_state.py` (~200行) | PipelineState 状态机管理 |

---

## 三、server.py 路由分发

`server.py` 中的请求处理基于 URL path 的字符串匹配：

```python
class RequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/api/config":
            self.handle_config()
        elif self.path == "/api/history":
            self.handle_history()
        elif self.path.startswith("/api/projects"):
            self.handle_projects_get()
        elif self.path.startswith("/api/tasks/"):
            self.handle_task_query()
        # ... 更多路由

    def do_POST(self):
        if self.path == "/api/tasks":
            self.handle_create_task()
        elif self.path == "/api/ai/chat/stream":
            self.handle_ai_chat_stream()
        elif self.path.startswith("/api/workflow/pipeline/"):
            self.handle_pipeline_api()
        # ... 更多路由
```

### API 路由一览

| 类别 | 路由 |
|------|------|
| 配置 | `GET /api/config` |
| 认证 | `POST /api/auth/*` |
| 项目 CRUD | `GET/POST/PUT/DELETE /api/projects/*` |
| 任务管理 | `GET/POST/DELETE /api/tasks/*` |
| AI 聊天 | `POST /api/ai/chat`, `POST /api/ai/chat/stream` |
| AI 图像 | `POST /api/ai/image` |
| 库管理 | `GET/POST /api/library/*` |
| 合成 | `POST /api/projects/{id}/render` |
| 版本历史 | `GET/POST/DELETE /api/projects/{id}/versions/*` |
| 托管管线 | `POST /api/workflow/pipeline/*` |
| 媒体文件 | `GET /media/videos/*` |
| 系统工具 | `POST /api/open-storage` |

---

## 四、反向代理机制

`server.py` 作为反向代理，将不同类型的 AI 请求分发到不同上游：

```python
# 文本 AI 请求 → peiqian.icu
AI_CHAT_BASE = STATE.get("ai_chat_base", "http://peiqian.icu/v1/chat/completions")
AI_CHAT_KEY = STATE.get("ai_chat_key", "...")

# 图像生成 → 中联 MAAS
AI_IMAGE_BASE = STATE.get("ai_image_base", "https://zlhub.xiaowaiyou.cn/.../images/generations")

# 视频生成 → 中联 MAAS
AI_VIDEO_BASE = STATE.get("ai_video_base", "https://zlhub.xiaowaiyou.cn/.../tasks")
```

前端从不直接持有 API token。

---

## 五、存储结构

### 5.1 文件存储

```
storage/
├── videos/                      # 下载的视频文件
├── projects/
│   └── proj-xxx/
│       ├── project.json         # 项目主数据
│       ├── versions/            # 版本历史
│       │   ├── step2/           # 风格配置版本
│       │   ├── step3/           # 剧本解析版本
│       │   ├── step4/           # 资产生成版本（含图片副本）
│       │   └── step5/           # 分镜/合成版本
│       ├── assets/              # 角色视图、场景视图、分镜图
│       │   ├── char_001_front.png
│       │   ├── char_001_side.png
│       │   ├── char_001_back.png
│       │   ├── char_001_expr_neutral.png
│       │   ├── scene_001_front.png
│       │   └── storyboard_ep1_s0.png
│       └── output/              # 最终合成产物
│           ├── final_output.mp4
│           ├── subtitles.srt
│           └── stages/          # 合成中间产物（断点续做用）
└── manifest.json                # 任务历史和资产索引
```

### 5.2 配置文件

```
.local-secrets.json              # 本地配置（gitignored）
├── api_key                      # 中联 MAAS API key
├── ai_chat_base / ai_chat_key   # LLM 中转站配置
├── ai_image_base / ai_image_model
├── ai_video_base / ai_video_model
├── db_host / db_port / db_user  # MySQL 连接信息
├── demo_user                    # 演示账号
└── auto_save                    # 自动保存开关
```

### 5.3 MySQL 数据库

通过 `mysql_storage.py` 抽象层访问 MySQL，使用 context manager pattern：

```python
from mysql_storage import get_storage

with get_storage() as storage:
    project = storage.load_project(project_id)
    storage.save_project(project_id, data)
```

---

## 六、设计决策

### 为什么不使用 Flask/FastAPI？

- **零依赖启动**：stdlib `http.server` 无需安装框架，降低部署门槛
- **简单透明**：路由逻辑直接可见，无魔法装饰器
- **代理场景适配**：主要工作是反向代理上游 API，不需要复杂路由框架
- **唯一外部依赖**：仅 `pymysql` 用于数据库访问

### 并发模型

- `ThreadPoolExecutor` 处理并行任务（资产生成、视频轮询）
- 合成和管线运行在后台 daemon 线程
- 无 async/await，全部使用线程模型

### 托管模式编排

- `WorkflowOrchestrator` 在后台线程中运行完整 Pipeline
- 每阶段 Plan-Build-Evaluate 循环
- 评估：结构检查（确定性） + LLM 评分（可选）
- 重试策略：REFINE（精化）vs PIVOT（转向），由分数趋势决定

---

## 七、测试

```bash
# 从项目根目录执行
pytest tests/                           # 全部测试
pytest tests/test_integration.py        # 集成测试
pytest tests/test_character_factory.py  # 单模块

# 也支持 unittest
python -m unittest discover -s tests -v
python -m unittest tests.test_task_routes -v
python -m unittest tests.test_pipeline_routes -v
```

测试文件命名：`test_*.py`，位于 `tests/` 目录。

---

## 八、开发注意事项

1. **配置加载**：启动时从 `.local-secrets.json` 加载配置到 `STATE` 全局字典
2. **CORS**：所有响应包含 CORS 头，支持跨域请求
3. **错误处理**：使用 `_json_error(code, message)` 和 `_json_response(data)` 统一响应格式
4. **文件路径**：使用 `pathlib.Path` 处理文件路径，注意 Windows 兼容性
5. **已知 Bug**：检查点清理未自动触发、resume 未真正使用检查点数据、无并发管线保护 — 详见 `docs/08-托管模式设计文档.md` §十二
