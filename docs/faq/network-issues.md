# 网络相关常见问题

---

## Q: 视频生成返回 502 SSL 错误

**现象**：`POST /api/tasks` 返回 `502`，后端日志出现 `SSL: CERTIFICATE_VERIFY_FAILED` 或类似错误。

**原因**：上游域名 `zlhub.xiaowaiyou.cn` 的 DNS 被 VPN/代理软件劫持到虚拟 IP（如 `198.18.0.85`），导致 SSL 握手失败。

**解决方案**：

1. 将 `zlhub.xiaowaiyou.cn` 加入代理软件的**直连规则**（不走代理）
2. 或暂时关闭 VPN/代理软件
3. 验证 DNS 解析是否正常：
   ```bash
   nslookup zlhub.xiaowaiyou.cn
   # 应返回真实 IP，而非 198.18.x.x 虚拟地址
   ```

---

## Q: VPN/代理干扰上游 API

**现象**：视频生成、图片生成功能不可用，但 AI Chat（剧本生成）正常。

**原因**：视频/图片生成使用 `zlhub.xiaowaiyou.cn`（中联 MAAS），AI Chat 使用 `peiqian.icu`。两者走不同通道，代理软件可能只影响其中一个。

**解决方案**：

- 检查代理软件规则，确保 `zlhub.xiaowaiyou.cn` 走直连
- 如果 `peiqian.icu` 也受影响，同样加入直连规则

**受影响功能**：

| 功能 | 依赖域名 | 说明 |
|------|---------|------|
| 视频生成 | `zlhub.xiaowaiyou.cn` | Seedance 2.0 API |
| 图片生成 | `zlhub.xiaowaiyou.cn` | Nano Banana 2 API |
| AI Chat / 剧本 | `peiqian.icu` | LLM 中转站 |

---

## Q: AI Chat 接口不可用

**现象**：`POST /api/ai/chat` 或 `/api/ai/chat/stream` 返回 502 或超时。

**原因**：AI Chat 服务 `peiqian.icu` 可能暂时不可用，或被网络环境阻断。

**排查步骤**：

1. 直接测试上游可达性：
   ```bash
   curl -s http://peiqian.icu/v1/models
   ```
2. 如果超时，检查是否被代理/防火墙拦截
3. 确认 `.local-secrets.json` 中 `ai_chat_base` 和 `ai_chat_key` 配置正确

---

## Q: 上游域名 DNS 解析异常

**现象**：所有上游 API 请求失败，日志中出现 DNS 相关错误。

**排查步骤**：

1. 检查 DNS 解析：
   ```bash
   nslookup zlhub.xiaowaiyou.cn
   nslookup peiqian.icu
   ```
2. 如果解析到虚拟 IP（`198.18.x.x`、`127.0.0.1` 等），说明被代理软件劫持
3. 尝试切换 DNS 服务器：
   ```bash
   # 使用公共 DNS
   nslookup zlhub.xiaowaiyou.cn 8.8.8.8
   ```
4. 检查 `hosts` 文件是否有异常条目

---

## Q: 前端代理请求到后端超时

**现象**：前端页面能打开，但 API 请求一直 loading，最终超时。

**原因**：Next.js 的 rewrite 代理到 `localhost:8787` 超时，可能是后端处理慢或上游响应慢。

**排查步骤**：

1. 确认后端正在运行：`curl http://127.0.0.1:8787/api/health`
2. 检查后端日志是否有请求阻塞
3. 如果是视频生成轮询，等待时间可能较长（2-5 分钟属正常）
4. 检查后端 `PROXY_TIMEOUT` 配置（默认 180 秒）
