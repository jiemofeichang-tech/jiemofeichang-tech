# 功能性联通测试计划

> 版本: 1.1 | 日期: 2026-03-29
> 完整详细版本见 `docs/functional-test-plan.md`

## 概述

本文档是功能性联通测试计划的精简版，保留核心测试用例结构和关键验证点，用于快速了解测试范围和执行顺序。

---

## 测试环境准备

### 服务启动检查清单

| 序号 | 检查项 | 命令 | 预期 |
|------|--------|------|------|
| 1 | Python 后端 | `python server.py` | 监听 `127.0.0.1:8787` |
| 2 | Next.js 前端 | `npm run dev` | 监听 `localhost:3001` |
| 3 | MySQL 数据库 | 后端日志无 DB 错误 | 正常连接或回退 JSON 存储 |
| 4 | `.local-secrets.json` | 检查 `api_key` 非空 | 文件存在且含有效 key |
| 5 | 代理转发 | 访问 `localhost:3001/api/config` | 返回 JSON（`hasApiKey: true`） |

### 测试素材

| 素材 | 要求 | 用途 |
|------|------|------|
| `test_source.png` | 清晰图片 ≤ 2MB | 图生视频 (TC-03d) |
| `test_first_frame.png` | 首帧截图/设计图 | 首帧控制 (TC-03b) |
| `test_last_frame.png` | 尾帧截图/设计图 | 首尾帧控制 (TC-03c) |

---

## 测试用例概要

### TC-01: 代理转发基础联通 (P0)

- **目的**: 验证 Next.js → Python 后端代理转发
- **关键验证**: `/api/config` 返回 200，含 `hasApiKey`、`defaultModel`、`modelHints`，无 CORS 错误
- **失败排查**: 502→后端未启动；CORS→重启前端；`hasApiKey: false`→检查配置

### TC-02: 用户认证全流程 (P0)

- **目的**: 注册 → 登录 → 会话保持 → 登出
- **关键验证**: 注册/登录返回 200，`sid` cookie 设置正确，`/api/auth/me` 返回用户信息，登出后 401
- **失败排查**: 注册 400→用户名重复；无 cookie→检查 `SameSite`/`Domain`

### TC-03: 视频生成全模式验证 (P0)

6 种模式，每种独立子用例：

| 子用例 | 模式 | 关键验证 |
|--------|------|----------|
| TC-03a ★必测 | 纯文字生成 (text) | `POST /api/tasks` 请求体正确，轮询状态流转，自动下载 MP4 |
| TC-03b | 首帧控制 (first_frame) | `content` 含 text + image_url，base64 编码正确 |
| TC-03c | 首尾帧控制 (first_last_frame) | `content` 含 text + 2 个 image_url |
| TC-03d | 图生视频 (image_to_video) | image_url role 为参考图 |
| TC-03e | 视频参考 (video_reference) | `content` 含 `video_url` 类型 |
| TC-03f | 延长视频 (extend_video) | `content` 含 `task_id` 类型 |

> 费用说明：每次生成约 ￥2-5（480p/5秒）。TC-03a 必测，其余按需。

### TC-04: 历史记录与资源库 (P1)

- **目的**: 历史查询、保存到资源库、删除与回收站
- **关键验证**: `/api/history`、`/api/library`、`/api/library/save`、`DELETE /api/tasks/{id}` 均正常

### TC-05: 视频播放与媒体服务 (P1)

- **目的**: 本地视频文件服务和播放
- **关键验证**: `/media/videos/xxx.mp4` 返回 200 + video/mp4，支持 Range 请求

### TC-06: 工作流 — 项目创建与管理 (P1)

- **目的**: 项目 CRUD + 导航
- **子用例**: 创建 (TC-06a)、列表查询 (TC-06b)、更新与删除 (TC-06c)
- **关键验证**: `POST/GET/PUT/DELETE /api/projects` 全部正常

### TC-07: 工作流 — AI 剧本生成 (P1)

- **目的**: AI 对话 → 剧本生成 → 版本快照
- **子用例**: 流式对话 (TC-07a)、剧本引擎 (TC-07b)、版本快照 (TC-07c)
- **关键验证**: SSE 流式正常，剧本结构含 characters/episodes/scenes

### TC-08: 工作流 — 角色设计 (P1)

- **目的**: 角色创建 + AI 图片生成
- **关键验证**: 角色列表自动提取，`POST /api/ai/image` 返回图片数据

### TC-09: 工作流 — 分镜设计 (P1)

- **目的**: 场景拆解 → 镜头规划 → 关键帧
- **关键验证**: shots 数组含 prompt/camera/duration 字段

### TC-10: 工作流 — 视频合成 (P1)

- **目的**: 批量生成 + 最终合成
- **关键验证**: 每个 shot 对应一个任务，合成输出到 `storage/projects/{id}/output/`
- ⚠️ 费用较高，建议仅选 1-2 个 shot 测试

### TC-11: Pipeline 自动化 (P1)

- **目的**: 一键四阶段自动流水线
- **关键验证**: `POST /api/workflow/pipeline/start`，阶段自动推进
- ⚠️ 耗时 10-30 分钟，消耗三种 API 额度

### TC-12: 错误处理与边界情况 (P1)

- **目的**: 异常场景下系统表现
- **场景**: 空提示词、未登录、后端未启动、无效 ID、重复保存、超长提示词、并发点击、无效文件上传、不存在的项目

---

## 执行顺序

```
TC-01 代理联通 (P0)
  ↓
TC-02 认证 (P0)
  ↓
TC-03a 文字生成 (P0 ★核心)
  ↓
  ├── TC-03b~03d (首帧/首尾帧/图生视频) ← 可选，可并行
  ├── TC-04 历史/资源库
  └── TC-05 视频播放
        ↓
TC-03e~03f (视频参考/延长) ← 依赖 TC-03a 成功视频
  ↓
TC-06 项目创建 → TC-07 剧本 → TC-08 角色 → TC-09 分镜 → TC-10 合成
  ↓
TC-11 Pipeline 自动化 ← 费用高，可选
  ↓
TC-12 错误处理 ← 任何时候可执行
```

### 最小联通测试集（~15 分钟，~￥3）

| 用例 | 耗时 | 费用 |
|------|------|------|
| TC-01 代理联通 | 1 分钟 | 免费 |
| TC-02 认证 | 3 分钟 | 免费 |
| TC-03a 文字生成 | 5 分钟 | ~￥3 |
| TC-06a 项目创建 | 2 分钟 | 免费 |
| TC-07a AI 对话 | 3 分钟 | ~￥0.1 |

---

## 已知风险

1. **API 费用**: 视频生成 480p/5秒 约 ￥2-5/次
2. **上游依赖**: `zlhub.xiaowaiyou.cn` 宕机则视频/图片不可用
3. **AI Chat 依赖**: `peiqian.icu` 不可用则剧本生成不可用
4. **MySQL**: 未运行时回退 JSON 存储，行为可能不一致
5. **中文路径**: `oii前端` 目录名可能导致部分工具兼容问题
6. **端口冲突**: 确保 8787 和 3001 未被占用
