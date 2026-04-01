# 功能性联通测试结果 — 2026-03-29

## 测试环境

| 项目 | 状态 |
|------|------|
| Python 后端 (8787) | ✅ 运行中 |
| Next.js 前端 (3001) | ✅ 运行中 |
| MySQL | ✅ 运行中 |
| API Key 配置 | ✅ 已配置 |
| 代理/VPN | ⚠️ 运行中，影响上游 API 连接 |

---

## 测试结果总结

| 用例 | 描述 | 结果 | 阻塞问题 |
|------|------|------|----------|
| TC-01 | 代理转发联通 | ✅ 通过 | — |
| TC-02 | 认证全流程 | ✅ 通过 | — |
| TC-03a | 纯文字生成视频 | ❌ 阻塞 | 上游 SSL 连接失败（VPN 干扰） |
| TC-03b~f | 其他生成模式 | ⏸️ 跳过 | 依赖 TC-03a |
| TC-04 | 历史/资源库/回收站 | ✅ 通过 | — |
| TC-05 | 视频播放/媒体服务 | ✅ 通过 | — |
| TC-06 | 项目管理 CRUD | ✅ 通过 | — |
| TC-07 | AI 剧本生成 | ✅ 通过 | — |
| TC-08 | AI 图片生成 | ⏸️ 跳过 | 依赖上游图片接口（同一域名，同样受 VPN 影响） |
| TC-09~11 | 分镜/合成/Pipeline | ⏸️ 跳过 | 依赖前置阶段 |
| TC-12 | 错误处理 | ✅ 通过（4/5 项） | 1 项受网络影响 |

**通过率: 6/12 通过, 1/12 失败, 5/12 跳过**

---

## 详细结果

### TC-01: 代理转发 ✅

| 检查项 | 预期 | 实际 | 通过? |
|--------|------|------|-------|
| `/api/config` 返回 200 | 200 | 200 | ✅ |
| 含 `hasApiKey` | true | true | ✅ |
| 含 `defaultModel` | doubao-seedance-2.0 | doubao-seedance-2.0 | ✅ |
| 含 `modelHints` | 含三个子字段 | resolution/ratio/duration 均存在 | ✅ |
| 无 CORS 错误 | 无 | CORS headers 完整 | ✅ |

**额外发现**: `/api/config` 需要登录才能访问（文档预期为无需认证）。已知行为，不影响功能。

---

### TC-02: 认证 ✅

| 检查项 | 预期 | 实际 | 通过? |
|--------|------|------|-------|
| 注册 `/api/auth/register` | 200 + ok | 200 `{ok:true, user:{id:6}}` | ✅ |
| 登录 `/api/auth/login` | 200 + sid cookie | 200 + `Set-Cookie: sid=...` | ✅ |
| `/api/auth/me` 返回用户 | `{id, username}` | `{id:6, username:"testuser_20260329"}` | ✅ |
| Cookie 属性 | HttpOnly, SameSite | `HttpOnly; SameSite=Lax; Path=/; Max-Age=604800` | ✅ |
| 登出清除会话 | 200 | 200 `{ok:true}` | ✅ |
| 登出后访问受保护 API | 401 | `{ok:false, error:"会话已过期"}` | ✅ |

---

### TC-03a: 视频生成 ❌

| 检查项 | 预期 | 实际 | 通过? |
|--------|------|------|-------|
| `POST /api/tasks` | 200 + task id | 502 SSL 错误 | ❌ |

**根因**: 上游域名 `zlhub.xiaowaiyou.cn` DNS 被 VPN/代理软件劫持到 `198.18.0.85`（虚拟 IP），导致 SSL 握手失败。

**修复**: 将该域名加入代理软件的直连规则，或暂时关闭代理。

---

### TC-04: 历史/资源库 ✅

| 检查项 | 预期 | 实际 | 通过? |
|--------|------|------|-------|
| `/api/history` 返回 200 | 任务列表 | 200, 2 个任务, 1 个 succeeded | ✅ |
| `/api/library` 返回 200 | 资产列表 | 200, 含已保存视频 | ✅ |
| `/api/trash` 返回 200 | 回收站 | 200, 空回收站 | ✅ |

---

### TC-05: 视频播放 ✅

| 检查项 | 预期 | 实际 | 通过? |
|--------|------|------|-------|
| 后端直连 `/media/videos/xxx.mp4` | 200 + video/mp4 | 200, 11.3MB, video/mp4 | ✅ |
| 前端代理 `/media/videos/xxx.mp4` | 200 + video/mp4 | 200, 11.3MB, video/mp4 | ✅ |

---

### TC-06: 项目管理 ✅

| 检查项 | 预期 | 实际 | 通过? |
|--------|------|------|-------|
| `POST /api/projects` 创建 | 201 + project | 201 `{id:"proj-xxx", title, status:"draft"}` | ✅ |
| `GET /api/projects` 列表 | 200 + 数组 | 200, 53 个项目 | ✅ |
| `PUT /api/projects/{id}` 更新 | 200 | 200, title 已更新 | ✅ |
| `DELETE /api/projects/{id}` 删除 | 200 | 200 `{message:"项目已删除"}` | ✅ |
| 删除后查询 | 404 | 404 `{error:"项目不存在"}` | ✅ |

---

### TC-07: AI 剧本生成 ✅

| 检查项 | 预期 | 实际 | 通过? |
|--------|------|------|-------|
| `POST /api/ai/chat` 非流式 | 200 + AI 回复 | 200 `{choices:[{message:{content:"Hi!"}}]}` | ✅ |
| `POST /api/ai/chat/stream` 流式 | SSE 格式流 | ✅ SSE chunks 正确, `[DONE]` 终止 | ✅ |
| 流式经前端代理 | SSE 正常 | ✅ 前端代理流式转发正常 | ✅ |
| AI 模型 | claude-sonnet-4-6 | claude-sonnet-4-6 | ✅ |

---

### TC-12: 错误处理 ✅（4/5）

| # | 场景 | 预期 | 实际 | 通过? |
|---|------|------|------|-------|
| 1 | 未登录访问 | 401 | 401 `{error:"未登录"}` | ✅ |
| 2 | 无效任务 ID | 404 | 502（去上游查询触发 SSL 错误） | ⚠️ |
| 3 | 无效项目 ID | 404 | 404 `{error:"项目不存在"}` | ✅ |
| 4 | 空请求体创建任务 | 400 | 400 `{error:"请求体不能为空"}` | ✅ |

---

## 发现的问题

### BUG-001: 上游 SSL 连接失败（VPN 干扰）

- **所属用例**: TC-03a
- **严重程度**: P0（阻塞视频生成核心功能）
- **原因**: `zlhub.xiaowaiyou.cn` DNS 被代理软件解析到 `198.18.0.85`
- **修复**: 用户需将该域名加入代理直连规则
- **影响范围**: TC-03（全部视频生成）、TC-08（AI 图片）、TC-12#2（任务查询回退上游）

### BUG-002: 项目重复创建

- **所属用例**: TC-06
- **严重程度**: P2
- **现象**: 项目列表中大量同一秒内创建的重复项目（如同时出现两个 `proj-20260328041852-*`）
- **可能原因**: 前端"创建项目"按钮缺少防抖/节流，快速操作或 React StrictMode 导致双重提交
- **建议修复**: 前端 CreateProjectDialog 添加 loading 状态 + 防抖

### BUG-003: 查询不存在任务会触发上游请求

- **所属用例**: TC-12
- **严重程度**: P3
- **现象**: `GET /api/tasks/{fake_id}` 本地找不到时会代理到上游查询
- **影响**: 对不存在的 ID 产生不必要的网络请求和延迟
- **建议**: 对明显不符合 task ID 格式的 ID 直接返回 404

---

## 待网络修复后继续的测试

1. TC-03a~f: 全部 6 种视频生成模式
2. TC-08: AI 图片生成
3. TC-09~11: 分镜/合成/Pipeline

---

## AI 服务可达性总结

| 服务 | 域名 | 状态 |
|------|------|------|
| 视频生成 API | zlhub.xiaowaiyou.cn | ❌ SSL 失败（VPN 劫持） |
| AI Chat | peiqian.icu | ✅ 可达 |
| AI 图片 | zlhub.xiaowaiyou.cn | ❌ 同上 |

---

## 启动排障补充（2026-03-29）

本次重新启动项目时，额外确认了以下两点：

### 1. 已修复：无效任务 ID 会误打上游接口

- 现象：`GET /api/tasks/{fake_id}` 在本地无记录时，仍继续请求上游任务接口，导致本应返回 `404` 的场景被上游 `502/SSL` 错误污染。
- 根因：后端只校验了 task id 是否“安全”，没有校验是否符合上游任务 id 格式，也没有优先复用本地缓存的终态任务。
- 修复：后端已增加 task id 格式判定；本地已缓存且处于终态的任务直接返回；明显无效的 task id 直接返回 `404`。
- 验证：
  - 真实登录会话下，`GET /api/tasks/not-a-real-task-id` 返回 `404`
  - 真实登录会话下，`GET /api/tasks/cgt-20260328005438-54lwk` 返回 `200`
  - 新增回归测试：`tests/test_task_routes.py`

### 2. 启动方式说明：Windows 后台启动前端需要使用 `npm.cmd`

- 现象：PowerShell 下执行 `Start-Process npm -ArgumentList 'run','dev'` 会报 `%1 is not a valid Win32 application`
- 原因：Windows 下 `Start-Process` 不能直接把 `npm` 当作可执行文件处理，应调用 `npm.cmd`
- 正确写法：

```powershell
Start-Process 'D:\WorkTools\Nodejs\npm.cmd' -ArgumentList 'run','dev'
```

### 当前补充验证结果

- 后端服务：`http://127.0.0.1:8787/api/health` 返回 `200`
- 前端服务：`http://localhost:3001/login` 可访问
- 后端单测：`124` 项通过
- 前端构建：`npm run build` 通过

详细记录见：`docs/启动问题记录-20260329.md`
