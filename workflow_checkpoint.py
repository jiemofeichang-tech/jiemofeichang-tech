"""
检查点管理器 — 管线状态的快照保存与恢复。

灵感来源：HarnessEngineeringMaster 的 context.py
- create_checkpoint()  → 写交接文档（progress.md）
- restore_from_checkpoint() → 全新白板 + checkpoint 摘要

在本项目中，checkpoint 保存整个 PipelineState 的快照，
使得长时间运行的工作流可以在中断后从任意阶段恢复。
"""
from __future__ import annotations

import json
import logging
import shutil
from itertools import count
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from mysql_storage import get_storage, scoped_document_id

log = logging.getLogger("workflow.checkpoint")

_WORKFLOWS_DIR = Path("data/workflows")
_CHECKPOINT_SEQUENCE = count()


def _checkpoint_dir(project_id: str) -> Path:
    d = _WORKFLOWS_DIR / project_id / "checkpoints"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _now_ts() -> str:
    return (
        f"{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
        f"_{next(_CHECKPOINT_SEQUENCE):06d}_{uuid.uuid4().hex[:6]}"
    )


def _checkpoint_doc_id(project_id: str, checkpoint_id: str) -> str:
    return scoped_document_id(project_id, checkpoint_id)


def _find_checkpoint_record(project_id: str, checkpoint_id: str) -> dict[str, Any] | None:
    storage = get_storage()
    record = storage.get_document_record(
        "pipeline_checkpoint",
        _checkpoint_doc_id(project_id, checkpoint_id),
    )
    if record is not None:
        return record

    for item in storage.list_document_records("pipeline_checkpoint", project_id=project_id):
        data = item.get("data", {})
        if data.get("checkpoint_id") == checkpoint_id or item["doc_id"] == checkpoint_id:
            return item
    return None


class CheckpointManager:
    """
    管线检查点管理。

    对应 Harness context.py 中的 create_checkpoint / restore_from_checkpoint：
    - save_checkpoint: 保存管线完整状态快照
    - restore_checkpoint: 从快照恢复，从中断点继续
    - list_checkpoints: 查看历史检查点
    """

    def save_checkpoint(
        self,
        project_id: str,
        state_data: dict[str, Any],
        reason: str = "auto",
    ) -> str:
        """
        保存当前管线状态为检查点。

        Args:
            project_id: 项目 ID
            state_data: PipelineState.to_dict() 的结果
            reason: 保存原因（"stage_passed", "before_pivot", "manual" 等）

        Returns:
            checkpoint_id
        """
        checkpoint_id = f"cp_{_now_ts()}"

        checkpoint = {
            "checkpoint_id": checkpoint_id,
            "reason": reason,
            "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "state": state_data,
        }

        get_storage().upsert_document(
            "pipeline_checkpoint",
            _checkpoint_doc_id(project_id, checkpoint_id),
            checkpoint,
            project_id=project_id,
            parent_id=project_id,
            status=reason,
            title=reason,
            created_at=checkpoint["created_at"],
            updated_at=checkpoint["created_at"],
        )

        log.info(
            f"检查点已保存: {checkpoint_id} "
            f"(阶段: {state_data.get('current_stage', '?')}, 原因: {reason})"
        )
        return checkpoint_id

    def restore_checkpoint(
        self,
        project_id: str,
        checkpoint_id: str = "latest",
    ) -> dict[str, Any] | None:
        """
        从检查点恢复管线状态。

        Args:
            project_id: 项目 ID
            checkpoint_id: 检查点 ID，默认 "latest" 恢复最近一个

        Returns:
            PipelineState 可用的 dict，或 None 表示无检查点
        """
        try:
            if checkpoint_id == "latest":
                records = get_storage().list_document_records(
                    "pipeline_checkpoint",
                    project_id=project_id,
                    newest_first=True,
                )
                if not records:
                    log.warning(f"检查点不存在: {project_id}/latest")
                    return None
                checkpoint = records[0]["data"]
            else:
                record = _find_checkpoint_record(project_id, checkpoint_id)
                if record is None:
                    log.warning(f"检查点不存在: {project_id}/{checkpoint_id}")
                    return None
                checkpoint = record["data"]
            state_data = checkpoint.get("state", {})
            log.info(
                f"检查点已恢复: {checkpoint.get('checkpoint_id', '?')} "
                f"(阶段: {state_data.get('current_stage', '?')})"
            )
            return state_data
        except (json.JSONDecodeError, KeyError) as exc:
            log.error(f"恢复检查点失败: {exc}")
            return None

    def list_checkpoints(self, project_id: str) -> list[dict[str, Any]]:
        """
        列出项目的所有检查点。

        Returns:
            按时间排序的检查点摘要列表
        """
        checkpoints: list[dict[str, Any]] = []
        for record in get_storage().list_document_records("pipeline_checkpoint", project_id=project_id):
            data = record.get("data", {})
            checkpoints.append({
                "checkpoint_id": data.get("checkpoint_id", record["doc_id"]),
                "reason": data.get("reason", "unknown"),
                "created_at": data.get("created_at", ""),
                "current_stage": data.get("state", {}).get("current_stage", "?"),
                "status": data.get("state", {}).get("status", "?"),
            })

        return checkpoints

    def delete_checkpoint(self, project_id: str, checkpoint_id: str) -> bool:
        """删除指定检查点"""
        record = _find_checkpoint_record(project_id, checkpoint_id)
        if record is None:
            return False
        get_storage().delete_document("pipeline_checkpoint", record["doc_id"])
        log.info(f"检查点已删除: {checkpoint_id}")
        return True

    def cleanup_old_checkpoints(
        self, project_id: str, keep_count: int = 5
    ) -> int:
        """
        清理旧检查点，只保留最近 N 个。

        对应 Harness 的上下文管理思想：
        不是无限积累，而是主动清理旧数据。

        Returns:
            删除的检查点数量
        """
        records = get_storage().list_document_records("pipeline_checkpoint", project_id=project_id, newest_first=False)
        if len(records) <= keep_count:
            return 0

        to_delete = records[:-keep_count]
        for record in to_delete:
            get_storage().delete_document("pipeline_checkpoint", record["doc_id"])

        deleted = len(to_delete)
        log.info(f"已清理 {deleted} 个旧检查点，保留最近 {keep_count} 个")
        return deleted
