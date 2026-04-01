# MySQL Storage Unification Design

## 背景
当前仓库存在多套独立持久化方案：

- `server.py` 使用 `storage/manifest.json`、`storage/projects/*/project.json`
- 工作流编排模块使用 `data/workflows/*`
- 各阶段产物使用 `data/scripts`、`data/characters`、`data/storyboards`、`data/video_tasks`
- 媒体文件和项目资产使用文件系统
- 认证已单独接入 MySQL

这导致状态源分散、恢复逻辑分裂、迁移困难，也不利于后续查询和一致性维护。

## 目标
- 统一业务状态、项目数据、流程状态、阶段产物、版本元数据到 MySQL
- 保持现有 API 路径和响应结构尽量兼容
- 图片、视频、导出文件继续使用文件系统，数据库仅存元数据和路径
- 提供旧文件数据导入能力，兼容现有仓库中的历史数据

## 非目标
- 不把图片/视频二进制内容写进 MySQL
- 不移除 `.local-secrets.json` 这类本机配置文件
- 不对前端 API 做大规模重构

## 设计原则
- 统一存储入口：所有业务读写都经过一个 MySQL 仓储层
- 数据结构务实：核心筛选字段单独建列，完整文档以 JSON 文本存储
- 文件系统只保留媒体和本机配置
- 历史迁移可重复执行，采用幂等 upsert

## 总体架构
新增 `mysql_storage.py` 作为统一存储层，负责：

- 建表
- 文档型业务对象的 CRUD
- 项目相关文档按 `project_id` 聚合查询
- 旧文件导入

后端模块不再直接读写 JSON 文件，而是改为：

- `server.py` 通过仓储层处理任务、作品库、项目、版本、回收站
- `workflow_state.py`、`workflow_checkpoint.py`、`stage_contract.py`、`stage_evaluator.py` 使用仓储层保存流程状态
- `script_engine.py`、`character_factory.py`、`storyboard_generator.py`、`video_composer.py` 使用仓储层保存阶段产物
- `workflow_orchestrator.py` 通过仓储层查找最新脚本/分镜/视频任务，而不是扫描目录

## 存储边界
### 存入 MySQL
- 用户与会话
- 项目主数据
- 任务历史、作品库索引、收藏、回收站
- 流程状态、检查点、合同、评估反馈
- 脚本、角色、分镜、视频任务等阶段产物
- 版本快照元数据和 JSON 内容
- 资产元数据

### 继续存文件系统
- `storage/videos/*`
- `storage/projects/<project_id>/assets/*`
- `storage/projects/<project_id>/output/*`
- Step 4 版本资产副本文件
- `.local-secrets.json`

## 数据模型
采用一张统一文档表承载大部分业务对象。

### `storage_documents`
- `doc_type`
- `doc_id`
- `project_id`
- `parent_id`
- `status`
- `title`
- `created_at`
- `updated_at`
- `data_json`

典型 `doc_type`：

- `project`
- `task`
- `asset`
- `trash_task`
- `trash_asset`
- `script`
- `character`
- `storyboard`
- `video_task`
- `pipeline_state`
- `pipeline_checkpoint`
- `stage_contract`
- `stage_feedback`
- `step3_snapshot`
- `step4_snapshot`
- `version_step2`
- `version_step3`
- `version_step4`
- `version_step5`

### `storage_migration_runs`
记录旧数据导入执行情况，用于排障与审计。

## 兼容策略
- API 路径保持不变
- 响应结构保持不变
- 旧的文件路径 URL 保持不变
- 删除项目时同时删除数据库中的项目相关文档，并清理对应项目目录

## 迁移策略
新增 `migrate_legacy_storage.py`，扫描以下旧数据源并幂等导入：

- `storage/manifest.json`
- `storage/projects/*/project.json`
- `storage/projects/*/versions/**/*`
- `data/scripts/*.json`
- `data/characters/*.json`
- `data/storyboards/*.json`
- `data/video_tasks/*.json`
- `data/workflows/*/state.json`
- `data/workflows/*/checkpoints/*.json`
- `data/workflows/*/contract_*.json`
- `data/workflows/*/feedback_*.json`

导入行为：

- 数据库已有同主键文档时执行 upsert
- 文件型媒体资产不搬迁，只记录其元数据和路径
- Step 4 快照资产副本仍保留在文件系统中

## 风险与应对
- 仓库当前是脏工作区：只做增量修改，不回退现有改动
- 无现成测试框架：新增基于 `unittest` 的后端测试
- MySQL 不可用时服务可能无法完整工作：保留清晰错误信息，初始化阶段尽早失败

## 验证
- 迁移扫描测试通过
- 仓储层基本 CRUD 测试通过
- 工作流状态读写测试通过
- `npm run build` 不因后端改动破坏前端类型
- Python 侧冒烟测试覆盖项目、任务、流程状态和阶段产物的关键路径
