# 环境变量与配置说明

Seedance Studio 的配置分为两层：**环境变量**（系统级）和 **`.local-secrets.json`**（项目级）。

---

## 环境变量

通过系统环境变量或启动命令传入，优先级高于配置文件。

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `VIDEO_CONSOLE_HOST` | `127.0.0.1` | 后端监听地址 |
| `VIDEO_CONSOLE_PORT` | `8787` | 后端监听端口 |
| `VIDEO_MODEL_API_KEY` | （无） | 众联 MAAS API Key，覆盖 `.local-secrets.json` 中的 `api_key` |
| `CORS_ORIGIN` | `http://127.0.0.1:3001` | 允许的跨域来源 |
| `MOCK_MODE` | `false` | 启用 Mock 模式（计划中，见 [mock-strategy.md](../testing/mock-strategy.md)） |

### 使用示例

```bash
# Linux/macOS
VIDEO_CONSOLE_PORT=9000 CORS_ORIGIN="http://localhost:3000" python server.py

# Windows PowerShell
$env:VIDEO_CONSOLE_PORT="9000"; python server.py

# Windows CMD
set VIDEO_CONSOLE_PORT=9000 && python server.py
```

---

## `.local-secrets.json` 配置

项目根目录下的本地配置文件（已 gitignore，不会提交到版本库）。

### 基础配置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `api_key` | string | （必填） | 众联 MAAS API Key，用于视频/图片生成 |
| `user_id` | string | `""` | 用户标识 |
| `default_model` | string | `"doubao-seedance-2.0"` | 默认视频生成模型 |
| `auto_save` | boolean | `true` | 视频生成成功后是否自动下载到本地 |

### AI Chat 配置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `ai_chat_base` | string | `"http://peiqian.icu/v1/chat/completions"` | AI 聊天接口地址 |
| `ai_chat_key` | string | （无） | AI 聊天 API Key |
| `ai_chat_model` | string | `"claude-opus-4-6"` | 默认 AI 聊天模型 |

### AI 图片配置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `ai_image_base` | string | `"http://zlhub.xiaowaiyou.cn/..."` | AI 图片生成接口地址 |

### MySQL 配置（可选）

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `mysql_host` | string | `"127.0.0.1"` | MySQL 服务器地址 |
| `mysql_port` | number | `3306` | MySQL 端口 |
| `mysql_user` | string | `"root"` | MySQL 用户名 |
| `mysql_password` | string | `""` | MySQL 密码 |
| `mysql_database` | string | `"seedance"` | 数据库名 |

> 如果 MySQL 未配置或连接失败，后端自动回退到 JSON 文件存储（`storage/manifest.json`）。

### 完整示例

```json
{
  "api_key": "sk-your-maas-api-key",
  "user_id": "user001",
  "default_model": "doubao-seedance-2.0",
  "auto_save": true,

  "ai_chat_base": "http://peiqian.icu/v1/chat/completions",
  "ai_chat_key": "sk-your-chat-api-key",
  "ai_chat_model": "claude-sonnet-4-6",

  "mysql_host": "127.0.0.1",
  "mysql_port": 3306,
  "mysql_user": "root",
  "mysql_password": "your-password",
  "mysql_database": "seedance"
}
```

---

## 配置优先级

```
环境变量 > .local-secrets.json > 代码内硬编码默认值
```

例如：`VIDEO_MODEL_API_KEY` 环境变量会覆盖 `.local-secrets.json` 中的 `api_key`。

---

## 上游服务地址

以下是后端代码中硬编码的上游服务地址（可通过 `.local-secrets.json` 覆盖）：

| 服务 | 默认地址 | 配置覆盖字段 |
|------|----------|-------------|
| 视频生成 API | `https://zlhub.xiaowaiyou.cn/zhonglian/api/v1/proxy/ark/contents/generations/tasks` | — |
| AI Chat | `http://peiqian.icu/v1/chat/completions` | `ai_chat_base` |
| AI 图片 | `http://zlhub.xiaowaiyou.cn/zhonglian/api/v1/proxy/chat/completions` | `ai_image_base` |

---

## 安全提醒

- `.local-secrets.json` 已在 `.gitignore` 中，**绝对不要**提交到版本库
- 不要在代码中硬编码真实 API Key
- 生产环境建议通过环境变量传入敏感配置
