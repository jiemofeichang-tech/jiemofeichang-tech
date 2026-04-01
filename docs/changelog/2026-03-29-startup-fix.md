# 启动问题修复记录 — 2026-03-29

> 整合自 `docs/启动问题记录-20260329.md`

## 本次启动结论

项目可以成功启动：

- 前端：`http://localhost:3001/login`
- 后端：`http://127.0.0.1:8787/api/health`

排查过程中确认了 **1 个真实代码问题**（已修复）和 **1 个 Windows 启动方式问题**（已记录）。

---

## 问题 1：无效任务 ID 会误打上游接口

### 现象

访问 `GET /api/tasks/{fake_id}` 时，本地不存在该任务，后端仍会继续请求上游任务接口。导致本应返回 `404` 的场景被上游 `502` 或 SSL 噪音污染。

### 根因

`server.py` 的任务查询路由对 task ID 只做了"安全字符"校验，没有先判断：

1. 该任务是否已经存在于本地缓存
2. 该 ID 是否符合上游任务 ID 的实际格式（`cgt-yyyyMMddHHmmss-xxxxx`）

### 修复内容

已在后端增加两层保护：

- **本地缓存优先**：已缓存且处于终态的任务直接返回，不再请求上游
- **格式校验**：明显不符合上游格式的 task ID 直接返回 `404`
- **同步修复**：`POST /api/library/save` 也增加了同样的拦截，避免对无效 ID 发起无意义的上游请求

### 验证

| 测试 | 预期 | 实际 |
|------|------|------|
| `GET /api/tasks/not-a-real-task-id`（已登录） | 404 | ✅ 404 |
| `GET /api/tasks/cgt-20260328005438-54lwk`（已登录） | 200 | ✅ 200 |
| 新增回归测试 `tests/test_task_routes.py` | 全部通过 | ✅ 通过 |

---

## 问题 2：Windows 后台启动前端不能直接用 `npm`

### 现象

在 PowerShell 中使用 `Start-Process npm -ArgumentList 'run','dev'` 启动前端会报：

```
%1 is not a valid Win32 application
```

### 根因

Windows 下 `npm` 实际应通过 `npm.cmd` 启动，`Start-Process` 不能直接把 `npm` 当作可执行文件处理。

### 正确做法

```powershell
Start-Process 'D:\WorkTools\Nodejs\npm.cmd' -ArgumentList 'run','dev'
```

> 该问题属于本机启动方式问题，不是仓库代码缺陷。

---

## 修复后验证状态

| 检查项 | 结果 |
|--------|------|
| 后端 `/api/health` | ✅ 200 |
| 前端 `/login` | ✅ 可访问 |
| 后端单测 | ✅ 124 项通过 |
| `npm run build` | ✅ 通过 |

---

## 仍需注意

如果本机代理/VPN 继续劫持 `zlhub.xiaowaiyou.cn`，视频/图片生成时仍可能出现上游 SSL 失败。这是外部网络环境问题，不属于本次代码修复范围。

**解决方案**：将 `zlhub.xiaowaiyou.cn` 加入代理软件的直连规则，或在测试视频生成时暂时关闭代理。
