# Mock 策略文档

## 为什么需要 Mock

Seedance Studio 依赖多个外部 API 服务，直接调用存在以下问题：

1. **费用成本**：视频生成 API 每次调用约 ￥2-5（480p/5秒），批量测试费用高昂
2. **服务不稳定**：上游 `zlhub.xiaowaiyou.cn` 可能因 VPN 干扰、DNS 劫持、维护等原因不可用
3. **响应延迟**：视频生成需要 2-5 分钟，严重拖慢测试反馈循环
4. **不可控**：测试结果受网络环境影响，无法保证一致性和可重复性
5. **AI 聊天服务依赖**：`peiqian.icu` 如果不可用，剧本生成链路完全中断

引入 Mock 可以实现：
- 零成本反复测试
- 毫秒级响应
- 离线可用
- 结果确定性

---

## Mock 方案建议

### 方案一：Python 端 Mock Server（推荐）

在 `server.py` 中增加 Mock 模式，通过环境变量或配置控制：

```python
# 启动时通过环境变量启用
MOCK_MODE = os.environ.get("MOCK_MODE", "false").lower() == "true"
```

- **优点**：改动最小，前端完全无感知，与真实代理路径一致
- **实现**：在代理转发前拦截，返回预制的 JSON 响应和测试视频文件
- **适用**：后端集成测试、前端开发调试

### 方案二：环境变量控制 Mock 模式

在 `.local-secrets.json` 中增加 Mock 配置：

```json
{
  "mock_mode": true,
  "mock_video_delay_seconds": 3,
  "mock_chat_delay_seconds": 1
}
```

- **优点**：配置灵活，不需要重启服务即可切换
- **实现**：后端读取配置决定是否代理到真实上游
- **适用**：开发环境日常使用

### 方案三：前端 MSW (Mock Service Worker)

在 Next.js 前端使用 MSW 拦截网络请求：

```bash
npm install msw --save-dev
```

- **优点**：前端独立开发，不依赖后端
- **实现**：在浏览器层拦截 `/api/*` 请求，返回模拟数据
- **适用**：前端组件开发、UI 测试

### 推荐组合

| 场景 | 方案 |
|------|------|
| 后端单元/集成测试 | 方案一（Python Mock Server） |
| 前端日常开发 | 方案一 或 方案二 |
| 前端组件隔离测试 | 方案三（MSW） |
| E2E 联通测试 | 方案一 + 方案二 |

---

## 需要 Mock 的接口列表

### 视频生成（费用最高，优先 Mock）

| 接口 | 上游 | Mock 返回 |
|------|------|-----------|
| `POST /api/tasks` | zlhub 视频生成 | 返回模拟 task ID + queued 状态 |
| `GET /api/tasks/{id}` | zlhub 任务查询 | 模拟状态流转：queued → running → succeeded |
| 视频文件下载 | zlhub 视频 URL | 返回预置的测试 MP4 文件 |

### 图片生成

| 接口 | 上游 | Mock 返回 |
|------|------|-----------|
| `POST /api/ai/image` | zlhub 图片接口 | 返回预置的测试图片（base64 或 URL） |

### AI Chat

| 接口 | 上游 | Mock 返回 |
|------|------|-----------|
| `POST /api/ai/chat` | peiqian.icu | 返回预制的 AI 回复 JSON |
| `POST /api/ai/chat/stream` | peiqian.icu | 返回模拟的 SSE 流式数据 |

### 不需要 Mock 的接口

以下接口是本地操作，无外部依赖，无需 Mock：

- `/api/config` — 本地配置读取
- `/api/auth/*` — 本地认证（MySQL）
- `/api/history`、`/api/library` — 本地存储读取
- `/api/projects/*` — 本地项目 CRUD
- `/media/videos/*` — 本地文件服务

---

## 预期收益

| 指标 | 真实 API | Mock 模式 |
|------|----------|-----------|
| 视频生成测试耗时 | 2-5 分钟/次 | < 5 秒/次 |
| 单次测试费用 | ￥2-5 | ￥0 |
| 网络依赖 | 需要公网 + 无 VPN 干扰 | 完全离线 |
| 结果一致性 | 受上游状态影响 | 100% 确定 |
| CI/CD 可用性 | 困难（需 API Key + 网络） | 轻松集成 |

---

## 后续实施计划

1. **Phase 1**: 在 `server.py` 中实现基础 Mock 模式（环境变量控制）
2. **Phase 2**: 准备测试数据集（Mock 视频、图片、AI 回复模板）
3. **Phase 3**: 编写 Mock 模式下的自动化测试套件
4. **Phase 4**（可选）: 前端 MSW 集成
