# Seedance Studio

这是一个本地视频生成工作台，专门承接众联 MAAS 代理层里的 `doubao-seedance-2.0` 这类异步视频任务接口。

它解决的不是“怎么发请求”，而是完整工作流：

- 在同一页面里写提示词、挂参考素材、切换生成模式
- 自动创建任务并轮询查询
- 生成成功后自动把 MP4 下载到本地
- 在作品库里直接预览、回放、下载本地副本

## 启动

```bash
cd "/Users/mac/Documents/New project/video_api_console"
python3 server.py
```

启动后访问：

```text
http://127.0.0.1:8787
```

## 本地配置

本地配置保存在：

```text
/Users/mac/Documents/New project/video_api_console/.local-secrets.json
```

会保存这些字段：

- `api_key`
- `user_id`
- `default_model`
- `auto_save`

前端不会直接持有 token；请求由本地 Python 服务代发。

## 当前支持的创作模式

- 纯文生
- 首帧控制
- 首尾帧
- 图像参考
- 视频参考
- 延长视频

另外还支持：

- 智能运镜预设
- 镜头速度预设
- 联网搜索工具开关
- 图生视频本地上传与拖拽上传
- 音频参考 URL
- `asset://` 虚拟人音频素材 ID

说明：

- “首尾帧”和“智能运镜”这两类能力，目前是基于文档中可见的 `content` reference 能力加提示词增强层实现的。
- 如果上游后续开放了单独字段，可以继续把前端映射成显式参数。

## 存储位置

生成成功的视频会自动落到：

```text
/Users/mac/Documents/New project/video_api_console/storage/videos
```

任务与作品库索引保存在：

```text
/Users/mac/Documents/New project/video_api_console/storage/manifest.json
```

## 主要接口

本地服务：

- `GET /api/config`
- `GET /api/history`
- `GET /api/library`
- `GET /api/tasks/{id}`
- `POST /api/tasks`
- `POST /api/library/save`
- `POST /api/session/key`
- `POST /api/open-storage`

上游代理接口：

- `POST /zhonglian/api/v1/proxy/ark/contents/generations/tasks`
- `GET /zhonglian/api/v1/proxy/ark/contents/generations/tasks/{id}`

## 使用流程

1. 启动 `server.py`
2. 打开 `http://127.0.0.1:8787`
3. 在“设置”里确认默认模型、用户 ID、自动入库状态
4. 在“生成”里选择模式，填写提示词和参考素材
5. 点击“创建任务”
6. 等待自动轮询
7. 成功后在右侧即时预览和下方作品库中直接查看本地视频

## 文档导航

| 分类 | 目录 | 说明 |
|------|------|------|
| 开发文档 | [`docs/development/`](docs/development/) | 架构、API 规范、前后端指南、工作流、提示词系统、编码规范 |
| 测试文档 | [`docs/testing/`](docs/testing/) | 测试计划、测试结果、测试编写指南、Mock 策略 |
| 变更日志 | [`docs/changelog/`](docs/changelog/) | 版本变更记录、问题修复记录 |
| 部署文档 | [`docs/deployment/`](docs/deployment/) | 本地搭建、环境变量、生产部署 |
| 常见问题 | [`docs/faq/`](docs/faq/) | 启动问题、网络问题、开发问题 |
| 设计归档 | [`docs/design/`](docs/design/) | 原始设计文档（历史参考） |

## 已验证

这套控制台已经完成过真实回归：

- 可正常读取本地 token
- 可创建上游视频任务
- 可查询成功任务
- 可把成功返回的视频自动下载到本地
- 可从作品库直接访问本地 MP4
