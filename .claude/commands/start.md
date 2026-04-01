---
description: 启动项目（后端 8787 + 前端 3001），失败时优先按已知问题记录排查
---

在执行启动前，先读这些文件：
- `CLAUDE.md`
- `AGENTS.md`
- `docs/启动问题记录-20260329.md`

如果任务是启动项目或排查启动失败，按下面顺序执行：

1. 清理残留进程
   - `powershell.exe -Command "Stop-Process -Name node -Force -ErrorAction SilentlyContinue; Stop-Process -Name python -Force -ErrorAction SilentlyContinue"`

2. 启动后端（仓库根目录）
   - `python server.py`
   - 用 `curl http://127.0.0.1:8787/api/health` 验证返回 `{"ok": true}`

3. 启动前端（仓库根目录）
   - 前台：`npm run dev`
   - Windows 后台：`Start-Process (Get-Command npm.cmd).Source -WorkingDirectory 'D:\AiProject\AiComedyDrama' -ArgumentList 'run','dev'`
   - 用 `curl http://localhost:3001/login` 验证页面可访问

4. 如果启动失败
   - 先对照 `docs/启动问题记录-20260329.md`
   - 查看 `server_live_err.log`、`next_live_err.log`、`server_err.log`、`next_err.log`
   - 只有在确认不是启动方式、端口冲突、代理/VPN 或已知问题后，再修改代码

最终应输出：
- 后端：`http://127.0.0.1:8787`
- 前端：`http://localhost:3001/login`
