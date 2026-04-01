# 启动相关 FAQ

---

## Q: Windows 下 npm 启动报错 "%1 is not a valid Win32 application"

**场景**：在 PowerShell 中使用 `Start-Process npm -ArgumentList 'run','dev'` 后台启动前端。

**原因**：Windows 下 `npm` 不是一个可执行文件（.exe），而是一个 `.cmd` 脚本。`Start-Process` 不能直接运行 `.cmd` 文件（不带扩展名时）。

**解决方案**：

```powershell
# 方案 1：使用 npm.cmd 的完整路径
Start-Process 'D:\WorkTools\Nodejs\npm.cmd' -ArgumentList 'run','dev'

# 方案 2：使用 cmd /c 包裹
Start-Process cmd -ArgumentList '/c', 'npm run dev'

# 方案 3：直接在终端前台运行（最简单）
npm run dev
```

> 注意：直接在终端敲 `npm run dev` 是没问题的，只有用 `Start-Process` 后台启动时才会遇到此问题。

---

## Q: Cloud / Codex 这类自动化环境里，每次后台启动前端都报错，怎么处理

**现象**：代理或自动化脚本每次尝试后台拉起前端时都会失败，看起来像是 “项目启动失败”，但手动前台执行 `npm run dev` 又可能是正常的。

**本次确认的根因**：问题通常不在项目代码，而在启动命令。Windows 下自动化环境如果调用的是：

```powershell
Start-Process npm -ArgumentList 'run','dev'
```

就很容易触发 `%1 is not a valid Win32 application`，因为这里真正应该执行的是 `npm.cmd`。

**这次实际可用的做法**：

1. 先确认 `npm.cmd` 路径

```powershell
where.exe npm.cmd
```

2. 后台启动前端时，显式调用 `npm.cmd`

```powershell
Start-Process 'D:\WorkTools\Nodejs\npm.cmd' `
  -ArgumentList 'run','dev' `
  -WorkingDirectory 'D:\AiProject\AiComedyDrama'
```

3. 启动后不要只看进程，要立即做健康检查

```powershell
Invoke-WebRequest -UseBasicParsing 'http://localhost:3001/login'
Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8787/api/health'
```

**结论**：如果是在 Cloud、Codex 或其他自动化环境里“每次启动都报错”，优先检查是不是用了 `Start-Process npm`。这类问题大多是 Windows 启动方式错误，不是仓库本身的前端代码故障。

---

## Q: 端口 8787 或 3001 被占用

**场景**：启动后端报 `Address already in use` 或前端报端口冲突。

**排查步骤**：

```powershell
# Windows — 查看占用端口的进程
netstat -ano | findstr :8787
netstat -ano | findstr :3001

# 终止占用进程（PID 替换为上面查到的数字）
taskkill /PID <PID> /F
```

```bash
# Linux/macOS
lsof -i :8787
lsof -i :3001
kill -9 <PID>
```

**修改端口（如需）**：

- 后端：`VIDEO_CONSOLE_PORT=9000 python server.py`
- 前端：修改 `oii前端/oiioii-clone/package.json` 中 dev 脚本的端口，同时更新 `next.config.ts` 中的 rewrite 目标

---

## Q: 后端启动后前端 502

**场景**：前端页面能打开，但所有 `/api/*` 请求返回 502 Bad Gateway。

**原因**：Next.js 前端通过 `next.config.ts` 的 rewrites 将 `/api/*` 代理到 `localhost:8787`。如果后端未运行，代理会返回 502。

**排查步骤**：

1. 确认后端正在运行：`curl http://127.0.0.1:8787/api/health`
2. 如果后端未运行，先启动后端：`python server.py`
3. 如果后端运行但仍 502：
   - 检查后端日志是否有报错
   - 确认后端监听的端口和前端代理目标一致
   - 重启前端 dev server

**注意**：必须先启动后端，再启动前端。前端依赖后端提供 API 服务。

---

## Q: MySQL 连接失败

**场景**：后端启动日志中出现 MySQL 连接报错。

**影响**：后端会自动回退到 JSON 文件存储（`storage/manifest.json`），基本功能不受影响。但以下功能可能异常：

- 用户认证（注册/登录）
- 工作流项目持久化
- 多用户数据隔离

**排查步骤**：

1. 确认 MySQL 服务正在运行：

```bash
# Windows
net start mysql

# Linux
sudo systemctl status mysql
```

2. 检查 `.local-secrets.json` 中的 MySQL 配置：

```json
{
  "mysql_host": "127.0.0.1",
  "mysql_port": 3306,
  "mysql_user": "root",
  "mysql_password": "你的密码",
  "mysql_database": "seedance"
}
```

3. 确认数据库存在：

```sql
CREATE DATABASE IF NOT EXISTS seedance CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

4. 测试连接：

```bash
mysql -u root -p -h 127.0.0.1 seedance
```

**如果不需要 MySQL**：后端会自动回退到 JSON 存储，忽略连接报错即可。认证相关功能可能不可用。
