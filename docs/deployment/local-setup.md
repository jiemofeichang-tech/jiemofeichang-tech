# 本地环境搭建指南

## 前置要求

| 依赖 | 最低版本 | 说明 |
|------|----------|------|
| Python | 3.8+ | 后端运行环境 |
| Node.js | 18+ | Next.js 前端运行环境 |
| npm | 随 Node.js 安装 | 包管理器 |
| MySQL | 5.7+（可选） | 持久化存储，未安装时自动回退到 JSON 文件存储 |
| Git | 任意 | 代码克隆 |

---

## 步骤一：克隆仓库

```bash
git clone <仓库地址>
cd AiComedyDrama
```

---

## 步骤二：后端配置

### 2.1 安装 Python 依赖

```bash
pip install -r requirements.txt
```

> 唯一外部依赖：`pymysql>=1.1.0`

### 2.2 创建本地配置文件

在项目根目录创建 `.local-secrets.json`（此文件已 gitignore）：

```json
{
  "api_key": "你的众联 MAAS API Key",
  "user_id": "你的用户 ID",
  "default_model": "doubao-seedance-2.0",
  "auto_save": true,
  "ai_chat_base": "http://peiqian.icu/v1/chat/completions",
  "ai_chat_key": "你的 AI Chat API Key",
  "ai_chat_model": "claude-sonnet-4-6"
}
```

如需 MySQL，额外添加：

```json
{
  "mysql_host": "127.0.0.1",
  "mysql_port": 3306,
  "mysql_user": "root",
  "mysql_password": "你的密码",
  "mysql_database": "seedance"
}
```

### 2.3 创建存储目录

```bash
mkdir -p storage/videos storage/projects
```

> 通常后端首次启动时会自动创建，但手动确认可避免权限问题。

---

## 步骤三：前端配置

```bash
cd "oii前端/oiioii-clone/"
npm install
```

> 注意：路径含中文字符 `oii前端`，在 shell 中必须加引号。

---

## 步骤四：启动服务

### 4.1 先启动后端

```bash
# 在项目根目录
python server.py
```

预期输出：
```
Server running on http://127.0.0.1:8787
```

### 4.2 再启动前端

新开一个终端：

```bash
cd "oii前端/oiioii-clone/"
npm run dev
```

预期输出：
```
Ready on http://localhost:3001
```

> **前端依赖后端**：前端通过 `next.config.ts` 将 `/api/*` 和 `/media/*` 请求代理到 `localhost:8787`，所以必须先启动后端。

---

## 步骤五：验证成功

### 检查清单

| # | 检查项 | 操作 | 预期 |
|---|--------|------|------|
| 1 | 后端健康检查 | 浏览器访问 `http://127.0.0.1:8787/api/health` | 返回 200 |
| 2 | 前端页面 | 浏览器访问 `http://localhost:3001/login` | 显示登录页 |
| 3 | 代理转发 | 浏览器访问 `http://localhost:3001/api/config` | 返回 JSON（含 `hasApiKey`） |
| 4 | MySQL 连接 | 后端启动日志无 DB 连接报错 | 正常或回退 JSON |
| 5 | 后端单测 | `pytest tests/ -v` | 全部通过 |
| 6 | 前端构建 | `cd "oii前端/oiioii-clone/" && npm run build` | 编译成功 |

---

## Windows 注意事项

### npm.cmd 问题

Windows 下使用 PowerShell 后台启动前端时，不能直接用 `npm`，需要使用 `npm.cmd`：

```powershell
# ❌ 错误 — 报 "%1 is not a valid Win32 application"
Start-Process npm -ArgumentList 'run','dev'

# ✅ 正确
Start-Process 'D:\WorkTools\Nodejs\npm.cmd' -ArgumentList 'run','dev'

# ✅ 或者直接在终端运行（不需要后台）
npm run dev
```

### 中文路径

项目中 `oii前端/` 目录含中文字符：
- 在 PowerShell/CMD 中使用时加引号：`cd "oii前端/oiioii-clone/"`
- 部分工具（如某些 IDE 插件）可能不兼容中文路径

### 端口冲突

确保以下端口未被占用：
- `8787` — Python 后端
- `3001` — Next.js 前端

检查端口占用：
```powershell
netstat -ano | findstr :8787
netstat -ano | findstr :3001
```

---

## 常见问题

- **后端启动失败** → 检查 Python 版本和 `pymysql` 是否安装
- **前端启动报错** → 确保 `npm install` 已执行，Node.js 版本 ≥ 18
- **前端 502** → 后端未启动，先启动后端再启动前端
- **MySQL 连接失败** → 后端会自动回退到 JSON 存储，不影响基本功能

更多问题请参考 [FAQ 文档](../faq/)。
