# 07 — API 接口规范与后端路由

> 完整的后端 API 设计、请求/响应格式、第三方 API 集成。

---

## 一、API 架构总览

```
前端 (Next.js :3001)
  │
  ├─ /api/*   ──► next.config.ts rewrite ──► Python server.py (:8787)
  └─ /media/* ──► next.config.ts rewrite ──► Python server.py (:8787)

Python server.py (:8787)
  │
  ├─ 本地处理: 项目CRUD、资产存储、认证
  │
  ├─ 代理到 peiqian.icu ──► LLM 文本生成（剧本解析、对话、提示词）
  │   URL: http://peiqian.icu/v1/chat/completions
  │   Key: sk-firstapi-b87240c0ba6d47728f50
  │
  ├─ 代理到中联 MAAS ──► 图像生成
  │   URL: https://zlhub.xiaowaiyou.cn/zhonglian/api/v1/proxy/images/generations
  │
  └─ 代理到中联 MAAS ──► 视频生成
      URL: https://zlhub.xiaowaiyou.cn/zhonglian/api/v1/proxy/ark/contents/generations/tasks
```

---

## 二、现有接口（已实现，无需修改）

### 2.1 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/auth/register` | 注册 |
| `POST` | `/api/auth/login` | 登录 |
| `POST` | `/api/auth/logout` | 登出 |
| `GET` | `/api/auth/me` | 当前用户 |

### 2.2 视频生成（Seedance）

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/tasks` | 创建视频生成任务 |
| `GET` | `/api/tasks/{id}` | 查询任务状态 |
| `GET` | `/api/history` | 任务历史 |
| `DELETE` | `/api/tasks/{id}` | 删除任务 |

### 2.3 库管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/library` | 资产库 |
| `POST` | `/api/library/save` | 保存到库 |
| `GET` | `/api/trash` | 回收站 |
| `POST` | `/api/trash/restore` | 恢复 |

### 2.4 图像生成

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/ai/image` | 图像生成（Nano Banana 2） |

### 2.5 项目 CRUD

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/projects` | 列出项目 |
| `POST` | `/api/projects` | 创建项目 |
| `GET` | `/api/projects/{id}` | 获取项目详情 |
| `PUT` | `/api/projects/{id}` | 更新项目 |
| `DELETE` | `/api/projects/{id}` | 删除项目 |
| `POST` | `/api/projects/{id}/assets` | 上传资产 |

---

## 三、需要修改的接口

### 3.1 AI 聊天 — 切换到 peiqian.icu

**现有接口**: `POST /api/ai/chat` 和 `POST /api/ai/chat/stream`

**修改内容**: 上游地址从中联 MAAS 切换到 peiqian.icu

```python
# server.py — 修改 handle_ai_chat 和 handle_ai_chat_stream

def handle_ai_chat(self):
    body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))

    # 🆕 使用 peiqian.icu
    api_base = STATE.get("ai_chat_base", "http://peiqian.icu/v1/chat/completions")
    api_key = STATE.get("ai_chat_key", "sk-firstapi-b87240c0ba6d47728f50")

    upstream_body = {
        "model": body.get("model", STATE.get("ai_chat_model", "claude-sonnet-4-6")),
        "messages": body.get("messages", []),
        "max_tokens": body.get("max_tokens", 16384),
        "temperature": body.get("temperature", 0.7),
    }

    req = request.Request(
        api_base,
        data=json.dumps(upstream_body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )

    resp = request.urlopen(req, timeout=120)
    data = json.loads(resp.read())
    self._json_response(data)
```

**流式版本**:

```python
def handle_ai_chat_stream(self):
    body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))

    api_base = STATE.get("ai_chat_base", "http://peiqian.icu/v1/chat/completions")
    api_key = STATE.get("ai_chat_key", "sk-firstapi-b87240c0ba6d47728f50")

    upstream_body = {
        "model": body.get("model", STATE.get("ai_chat_model", "claude-sonnet-4-6")),
        "messages": body.get("messages", []),
        "max_tokens": body.get("max_tokens", 16384),
        "temperature": body.get("temperature", 0.7),
        "stream": True,
    }

    req = request.Request(
        api_base,
        data=json.dumps(upstream_body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )

    self.send_response(200)
    self.send_header("Content-Type", "text/event-stream")
    self.send_header("Cache-Control", "no-cache")
    self.send_header("Access-Control-Allow-Origin", CORS_ORIGIN)
    self.end_headers()

    resp = request.urlopen(req, timeout=300)
    while True:
        chunk = resp.read(4096)
        if not chunk:
            break
        self.wfile.write(chunk)
        self.wfile.flush()
```

### 3.2 项目创建 — 补充字段

**现有接口**: `POST /api/projects`

**补充请求字段**:

```json
{
  "title": "项目名",
  "raw_input": "剧本文本",
  "reference_images": ["data:image/png;base64,..."]  // 🆕
}
```

**补充响应字段**:

```json
{
  "id": "proj-xxx",
  "title": "...",
  "status": "draft",
  "style_config": null,          // 🆕 Step 2 填入
  "reference_images": [],        // 🆕
  "script": { ... },
  "characters": [],
  "scenes": [],
  "episodes": [],
  "post_production": { ... }
}
```

### 3.3 项目更新 — 支持 style_config

**现有接口**: `PUT /api/projects/{id}`

确保后端能接收并持久化以下新字段：

```json
{
  "style_config": {
    "story_type": "drama",
    "art_style": "日系风格",
    "art_substyle": "吉卜力",
    "aspect_ratio": "9:16",
    "duration_sec": 60,
    "language": "中文",
    "shot_duration_sec": 5,
    "compiled_style_prompt": "...",
    "compiled_negative_prompt": "...",
    "prompt_manually_edited": false,
    "prompt_edit_history": []
  },
  "status": "configured"
}
```

---

## 四、新增接口

### 4.1 获取风格列表

```
GET /api/styles

响应 200:
{
  "story_types": [
    {
      "id": "drama",
      "label": "剧情故事片",
      "icon": "🎬",
      "description": "完整叙事结构，起承转合，适合短剧",
      "prompt": "narrative structure, three-act story, ..."
    },
    ...
  ],
  "style_categories": ["全部", "国风", "IP风格", "日系风格", ...],
  "styles": [
    {
      "name": "吉卜力",
      "cover": "/styles/mkwezy4rab0b3437df8ddcb8.webp",
      "categories": ["IP风格", "日系风格", "插画风格"],
      "prompt": "Studio Ghibli style, ...",
      "negativePrompt": "3D render, ..."
    },
    ...
  ]
}
```

**实现方式**: 可直接从 `styles-data.ts` 的 JSON 版本在后端静态返回，或前端直接使用本地数据（推荐）。

### 4.2 提示词优化（可选）

```
POST /api/ai/optimize-prompt

请求:
{
  "prompt": "原始提示词",
  "type": "character_view | scene_view | storyboard | video",
  "style_context": "风格提示词"
}

响应:
{
  "optimized_prompt": "优化后的提示词",
  "suggestions": ["建议1", "建议2"]
}
```

**LLM 配置**: 使用 `claude-haiku-4-5`（轻量、快速、低成本）

### 4.3 批量分镜视频生成

```
POST /api/projects/{id}/shots/generate-batch

请求:
{
  "shot_ids": ["shot_001", "shot_002", ...],   // 指定生成哪些
  "generate_all": true                          // 或全部生成
}

响应 202:
{
  "message": "批量生成已开始",
  "total": 12,
  "submitted": 12
}
```

### 4.4 项目合成

```
POST /api/projects/{id}/render

请求:
{
  "include_subtitles": true,
  "subtitle_mode": "burn | external | off",
  "include_voiceover": true,
  "include_bgm": true,
  "bgm_source": "auto | custom",
  "bgm_path": "/path/to/custom.mp3",
  "output_quality": "720p | 1080p | 4k",
  "transition_style": "dissolve | fade | cut | none",
  "resume_from_stage": null
}

响应 202:
{
  "message": "合成已开始",
  "status": "compositing",
  "resume_from": null,
  "stages_total": 7
}
```

**断点续做**: 当合成失败后，可传入 `resume_from_stage` 参数（如 `"subtitle"`），从失败阶段重试，跳过已完成的阶段。

合成完成后通过轮询 `GET /api/projects/{id}` 获取结果：

```json
{
  "status": "done",
  "post_production": {
    "subtitles_srt": "/api/projects/proj-xxx/output/subtitles.srt",
    "final_output": "/api/projects/proj-xxx/output/final_output.mp4"
  }
}
```

合成进行中的轮询响应：

```json
{
  "status": "compositing",
  "post_production": {
    "compose_progress": {
      "current_stage": "subtitle",
      "stages_completed": ["concat", "transition"],
      "stages_total": 7,
      "percent": 28
    }
  }
}
```

合成失败的轮询响应：

```json
{
  "status": "compositing_failed",
  "post_production": {
    "last_error": {
      "code": "SUBTITLE_BURN_FAILED",
      "message": "字幕烧录失败",
      "suggestion": "可关闭硬字幕，改用外挂 SRT",
      "failed_stage": "subtitle"
    },
    "compose_config": { ... }
  }
}
```

### 4.5 版本历史

#### 获取版本列表

```
GET /api/projects/{id}/versions?step=step3

响应 200:
{
  "step": "step3",
  "versions": [
    {
      "version_id": "v003",
      "created_at": "2026-03-28T15:30:00Z",
      "trigger": "regenerate",
      "label": null,
      "preview": {
        "characters_count": 3,
        "scenes_count": 4,
        "shots_count": 12
      }
    },
    {
      "version_id": "v002",
      "created_at": "2026-03-28T14:20:00Z",
      "trigger": "ai_chat_modify",
      "label": null,
      "preview": {
        "characters_count": 3,
        "scenes_count": 3,
        "shots_count": 10
      }
    }
  ],
  "max_versions": 10
}
```

#### 获取版本详情

```
GET /api/projects/{id}/versions/{step}/{version_id}

响应 200:
{
  "version_id": "v002",
  "step": "step3",
  "created_at": "2026-03-28T14:20:00Z",
  "trigger": "ai_chat_modify",
  "data": { ... }     // 完整快照数据
}
```

#### 恢复版本

```
POST /api/projects/{id}/versions/{step}/{version_id}/restore

响应 200:
{
  "message": "已恢复到 v002",
  "auto_saved_as": "v004"
}
```

> **注意**: 恢复前会自动保存当前状态为新版本（trigger: `before_restore`）。

#### 手动创建版本快照

```
POST /api/projects/{id}/versions

请求:
{
  "step": "step3",
  "label": "手动保存点"
}

响应 201:
{
  "version_id": "v005",
  "created_at": "2026-03-28T16:00:00Z",
  "trigger": "manual_save",
  "label": "手动保存点"
}
```

#### 删除版本

```
DELETE /api/projects/{id}/versions/{step}/{version_id}

响应 200:
{
  "message": "版本 v002 已删除"
}
```

---

## 五、第三方 API 集成详情

### 5.1 peiqian.icu — LLM 文本生成

| 项 | 值 |
|----|-----|
| Base URL | `http://peiqian.icu/v1` |
| API Key | `sk-firstapi-b87240c0ba6d47728f50` |
| 协议 | OpenAI Chat Completions 兼容 |
| 支持 Stream | ✅ |

**用途**:
- 剧本解析（Step 3）→ `claude-sonnet-4-6`
- 对话微调（Step 3）→ `claude-sonnet-4-6`
- 提示词优化（可选）→ `claude-haiku-4-5`

**请求格式**:
```json
{
  "model": "claude-sonnet-4-6",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."}
  ],
  "max_tokens": 16384,
  "temperature": 0.7,
  "stream": true
}
```

**响应格式** (非流式):
```json
{
  "id": "chatcmpl-xxx",
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "..."
    }
  }],
  "usage": {
    "prompt_tokens": 1234,
    "completion_tokens": 5678
  }
}
```

### 5.2 中联 MAAS — 图像生成

| 项 | 值 |
|----|-----|
| Base URL | `https://zlhub.xiaowaiyou.cn/zhonglian/api/v1/proxy/images/generations` |
| API Key | 从 `.local-secrets.json` 的 `api_key` |
| Model | `nano-banana-2` |

**请求格式**:
```json
{
  "model": "nano-banana-2",
  "prompt": "...",
  "n": 1,
  "size": "1024x1536"
}
```

### 5.3 中联 MAAS — 视频生成 (Seedance 2.0)

| 项 | 值 |
|----|-----|
| Base URL | `https://zlhub.xiaowaiyou.cn/zhonglian/api/v1/proxy/ark/contents/generations/tasks` |
| API Key | 从 `.local-secrets.json` 的 `api_key` |
| Model | `doubao-seedance-2.0` |

**请求格式**:
```json
{
  "model": "doubao-seedance-2.0",
  "content": [
    {"type": "text", "text": "..."},
    {"type": "image_url", "image_url": {"url": "..."}, "role": "reference_image"}
  ],
  "resolution": "720p",
  "ratio": "9:16",
  "duration": 5,
  "generate_audio": false
}
```

---

## 六、.local-secrets.json 完整配置

```json
{
  "api_key": "sk-sp0YcXd0...",

  "ai_chat_base": "http://peiqian.icu/v1/chat/completions",
  "ai_chat_key": "sk-firstapi-b87240c0ba6d47728f50",
  "ai_chat_model": "claude-sonnet-4-6",
  "ai_chat_model_light": "claude-haiku-4-5",

  "ai_image_base": "https://zlhub.xiaowaiyou.cn/zhonglian/api/v1/proxy/images/generations",
  "ai_image_model": "nano-banana-2",

  "ai_video_base": "https://zlhub.xiaowaiyou.cn/zhonglian/api/v1/proxy/ark/contents/generations/tasks",
  "ai_video_model": "doubao-seedance-2.0",

  "auto_save": true,
  "use_file_auth": true,
  "demo_user": { "username": "admin", "password": "123456" },

  "db_host": "127.0.0.1",
  "db_port": 3306,
  "db_user": "root",
  "db_password": "",
  "db_name": "seedance_studio"
}
```

---

## 七、接口汇总表

### 工作流各步骤的 API 调用关系

| 步骤 | 前端调用 | 后端路由 | 上游 API |
|------|---------|---------|---------|
| **Step 1** 新建项目 | `wfCreateProject()` | `POST /api/projects` | 本地 |
| **Step 1** 上传参考图 | `wfUploadAsset()` | `POST /api/projects/{id}/assets` | 本地 |
| **Step 2** 获取风格 | 本地数据 | 无 / `GET /api/styles` | 无 |
| **Step 2** 保存配置 | `wfUpdateProject()` | `PUT /api/projects/{id}` | 本地 |
| **Step 3** 剧本解析 | `wfAiChatStream()` | `POST /api/ai/chat/stream` | **peiqian.icu** |
| **Step 3** 对话微调 | `wfAiChatStream()` | `POST /api/ai/chat/stream` | **peiqian.icu** |
| **Step 3** 保存结果 | `wfUpdateProject()` | `PUT /api/projects/{id}` | 本地 |
| **Step 4** 角色三视图 | `wfGenerateImage()` | `POST /api/ai/image` | **中联 MAAS** |
| **Step 4** 场景六视图 | `wfGenerateImage()` | `POST /api/ai/image` | **中联 MAAS** |
| **Step 4** 锁定资产 | `wfUpdateProject()` | `PUT /api/projects/{id}` | 本地 |
| **Step 5a** 分镜图 | `wfGenerateImage()` | `POST /api/ai/image` | **中联 MAAS** |
| **Step 5b** 分镜视频 | `createTask()` | `POST /api/tasks` | **中联 MAAS** |
| **Step 5b** 轮询状态 | `queryTask()` | `GET /api/tasks/{id}` | **中联 MAAS** |
| **Step 5c** 合成 | `wfRenderProject()` | `POST /api/projects/{id}/render` | **本地 FFmpeg** |
| **Step 5c** 获取结果 | `wfGetProject()` | `GET /api/projects/{id}` | 本地 |

| **版本历史** 列表 | `wfGetVersions()` | `GET /api/projects/{id}/versions?step=` | 本地 |
| **版本历史** 详情 | `wfGetVersion()` | `GET /api/projects/{id}/versions/{step}/{vid}` | 本地 |
| **版本历史** 恢复 | `wfRestoreVersion()` | `POST /api/projects/{id}/versions/{step}/{vid}/restore` | 本地 |
| **版本历史** 手动保存 | `wfCreateVersion()` | `POST /api/projects/{id}/versions` | 本地 |
| **版本历史** 删除 | `wfDeleteVersion()` | `DELETE /api/projects/{id}/versions/{step}/{vid}` | 本地 |

### 颜色编码

- 🟢 **本地处理** — 不调用外部 API
- 🔵 **peiqian.icu** — LLM 文本生成
- 🟠 **中联 MAAS** — 图像/视频生成
