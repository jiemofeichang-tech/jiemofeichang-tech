# MySQL Storage Unification Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用统一的 MySQL 仓储层替换项目内分散的 JSON/文件业务持久化，并提供旧数据自动导入能力。

**Architecture:** 新增 `mysql_storage.py` 作为统一仓储层，使用一张文档表承载项目、任务、流程状态和阶段产物；文件系统只保留媒体资产和本机配置。各工作流模块通过仓储层读写，不再直接读写 JSON 文件。

**Tech Stack:** Python 3, `pymysql`, `unittest`, Next.js 16, TypeScript

---

## Chunk 1: Storage Foundation

### Task 1: 创建仓储层测试

**Files:**
- Create: `tests/test_mysql_storage.py`
- Test: `tests/test_mysql_storage.py`

- [ ] **Step 1: 写失败测试，覆盖旧文件迁移扫描与文档 upsert 元数据抽取**
- [ ] **Step 2: 运行 `python -m unittest tests.test_mysql_storage -v`，确认失败**
- [ ] **Step 3: 实现 `mysql_storage.py` 的基础仓储接口和迁移扫描函数**
- [ ] **Step 4: 再次运行 `python -m unittest tests.test_mysql_storage -v`，确认通过**

### Task 2: 建立正式 schema

**Files:**
- Modify: `mysql_storage.py`
- Modify: `server.py`

- [ ] **Step 1: 在仓储层中加入 schema 初始化**
- [ ] **Step 2: 让服务启动阶段初始化统一 schema**
- [ ] **Step 3: 保持原有认证表继续可用**

## Chunk 2: Replace Server Persistence

### Task 3: 项目与 manifest 持久化迁移

**Files:**
- Modify: `server.py`
- Modify: `mysql_storage.py`

- [ ] **Step 1: 将 `load_project` / `persist_project` / `list_projects` / `delete_project` 改为走仓储层**
- [ ] **Step 2: 将 `load_manifest` / `persist_manifest` 及任务、资产、回收站帮助函数改为走仓储层**
- [ ] **Step 3: 保持项目资产和视频文件仍写入磁盘**

### Task 4: Step 3 / Step 4 快照迁移

**Files:**
- Modify: `server.py`
- Modify: `mysql_storage.py`

- [ ] **Step 1: 将 Step 3 快照元数据和 JSON 内容迁移到 MySQL**
- [ ] **Step 2: 将 Step 4 快照元数据迁移到 MySQL，资产副本继续落盘**
- [ ] **Step 3: 保持现有 API 输出字段兼容**

## Chunk 3: Replace Workflow Persistence

### Task 5: 流程状态与评估持久化迁移

**Files:**
- Modify: `workflow_state.py`
- Modify: `workflow_checkpoint.py`
- Modify: `stage_contract.py`
- Modify: `stage_evaluator.py`
- Modify: `mysql_storage.py`

- [ ] **Step 1: 将 pipeline state 改为 MySQL 文档**
- [ ] **Step 2: 将 checkpoints / contracts / feedback 改为 MySQL 文档**
- [ ] **Step 3: 维持现有调用接口不变**

### Task 6: 阶段产物持久化迁移

**Files:**
- Modify: `script_engine.py`
- Modify: `character_factory.py`
- Modify: `storyboard_generator.py`
- Modify: `video_composer.py`
- Modify: `workflow_orchestrator.py`
- Modify: `mysql_storage.py`

- [ ] **Step 1: 将 script / character / storyboard / video_task 改为 MySQL 文档**
- [ ] **Step 2: 修改 orchestrator 的最新产物查询逻辑**
- [ ] **Step 3: 保持输出媒体文件仍在原目录生成**

## Chunk 4: Legacy Migration And Verification

### Task 7: 实现旧数据导入

**Files:**
- Create: `migrate_legacy_storage.py`
- Modify: `mysql_storage.py`
- Modify: `server.py`

- [ ] **Step 1: 实现旧数据目录扫描与幂等导入**
- [ ] **Step 2: 在服务启动时触发一次自动导入**
- [ ] **Step 3: 记录导入摘要供排障**

### Task 8: 运行验证

**Files:**
- Modify: `progress.md`

- [ ] **Step 1: 运行 `python -m unittest tests.test_mysql_storage -v`**
- [ ] **Step 2: 运行 `python -m unittest discover tests -v`**
- [ ] **Step 3: 运行 `npm run build`**
- [ ] **Step 4: 记录结果与剩余风险**
