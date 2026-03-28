---
description: 启动 OiiOii 前后端项目（即梦后端 + OII前端）
---

请按以下步骤启动项目：

1. 先停掉可能残留的旧进程：
   - 用 `powershell.exe -Command "Stop-Process -Name node -Force -ErrorAction SilentlyContinue; Stop-Process -Name python -Force -ErrorAction SilentlyContinue"` 杀掉旧的 node 和 python 进程
   - 等待 2 秒确认端口 3000 和 8787 已释放
   - 清理 Next.js lock 文件：`rm -f "E:/AI工作流/oii前端/oiioii-clone/.next/dev/lock"`

2. 启动后端（Python，端口 8787）：
   - 在后台运行 `cd "E:/AI工作流" && python server.py`
   - 等待启动后用 `curl http://127.0.0.1:8787/api/health` 验证返回 `{"ok": true}`

3. 启动前端（Next.js，端口 3000）：
   - 在后台运行 `cd "E:/AI工作流/oii前端/oiioii-clone" && npx next dev --port 3000`
   - 等待启动后用 `curl -o /dev/null -w "%{http_code}" http://localhost:3000/` 验证返回 200

4. 输出最终状态：
   - 后端地址：http://127.0.0.1:8787
   - 前端地址：http://localhost:3000
   - 告知用户在浏览器打开 http://localhost:3000 即可使用
