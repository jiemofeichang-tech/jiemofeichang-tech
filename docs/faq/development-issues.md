# 开发常见问题

---

## Q: 路径含中文字符导致命令执行失败

**现象**：在终端中执行 `cd oii前端/oiioii-clone/` 等命令时报错。

**解决方案**：

Shell 命令中引用含中文字符的路径时，务必加引号：

```bash
# 正确
cd "oii前端/oiioii-clone/"
npm run dev --prefix "oii前端/oiioii-clone/"

# 错误
cd oii前端/oiioii-clone/
```

---

## Q: TypeScript `@/*` 路径别名不生效

**现象**：`import { xxx } from '@/lib/api'` 编译报错 `Module not found`。

**原因**：路径别名 `@/*` 映射到 `./src/*`，需要在 `tsconfig.json` 中正确配置。

**检查步骤**：

1. 确认 `oii前端/oiioii-clone/tsconfig.json` 中有：
   ```json
   {
     "compilerOptions": {
       "paths": {
         "@/*": ["./src/*"]
       }
     }
   }
   ```
2. 重启 Next.js dev server
3. 确保文件确实存在于 `src/` 目录下

---

## Q: 前端代理到后端的请求被拦截或 404

**现象**：前端发起 `/api/*` 或 `/media/*` 请求返回 404 或不走代理。

**原因**：Next.js 的 rewrite 规则未生效。

**检查步骤**：

1. 确认 `oii前端/oiioii-clone/next.config.ts` 中 rewrites 配置正确：
   ```typescript
   async rewrites() {
     return [
       { source: '/api/:path*', destination: 'http://localhost:8787/api/:path*' },
       { source: '/media/:path*', destination: 'http://localhost:8787/media/:path*' },
     ]
   }
   ```
2. 确认 Python 后端正在 8787 端口运行
3. 重启 Next.js dev server（修改 `next.config.ts` 后需要重启）

---

## Q: 如何添加新的 API 路由

**步骤**：

1. **后端**：在 `server.py` 中添加路由处理方法
   ```python
   # 在 do_GET 或 do_POST 中添加路由匹配
   elif path.startswith('/api/your-endpoint'):
       self.handle_your_endpoint()
   ```
2. **前端 API 客户端**：在 `src/lib/api.ts` 中添加类型安全的调用函数
   ```typescript
   export async function yourEndpoint(params: YourParams): Promise<YourResponse> {
     return fetchApi('/api/your-endpoint', { method: 'POST', body: JSON.stringify(params) })
   }
   ```
3. **前端代理**：如果路径已匹配 `/api/*` 规则，无需额外配置

---

## Q: 如何添加新的视频生成模式

**步骤**：

1. **了解模式结构**：每种模式对应不同的 `content` reference 结构
   - 现有模式：`text`, `first_frame`, `first_last_frame`, `image_to_video`, `video_reference`, `extend_video`

2. **前端**：
   - 在 `src/lib/api.ts` 的 `buildPayload()` 函数中添加新模式的 payload 构造逻辑
   - 在 UI 组件中添加模式选择入口

3. **后端**：通常不需要修改，因为后端只做代理转发。除非新模式需要特殊的预处理或后处理。

---

## Q: `npm run build` 报 TypeScript 类型错误

**现象**：构建时出现类型错误。

**解决方案**：

1. 这是项目的主要正确性检验手段（未配置独立 linter）
2. 根据报错信息修复类型问题
3. 常见原因：
   - 新增了未导出的类型
   - API 响应结构变更但前端类型未同步
   - `any` 类型被严格模式拒绝

---

## Q: 后端 `server.py` 修改后如何生效

**现象**：修改了 Python 代码但行为未变化。

**解决方案**：

- 后端使用 stdlib `http.server`，**没有热重载**
- 修改代码后需要**手动重启** `python server.py`
- 前端 Next.js dev server 有热重载，修改后自动生效

---

## Q: MySQL 连接失败但项目仍可运行

**现象**：后端日志显示 MySQL 连接错误，但服务正常启动。

**原因**：后端设计了降级策略，MySQL 不可用时会回退到 JSON 文件存储。

**注意**：
- JSON 存储模式下部分功能可能表现不同
- 建议开发环境安装 MySQL 以获得完整体验
- MySQL 连接信息配置在 `.local-secrets.json` 中
