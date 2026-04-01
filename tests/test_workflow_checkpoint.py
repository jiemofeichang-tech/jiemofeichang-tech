"""
workflow_checkpoint.py 单元测试。

用 RecordingStorage mock 测试 CheckpointManager 的保存、恢复、列表、删除和清理逻辑。
"""
from __future__ import annotations

import unittest
from unittest.mock import patch

from tests.test_mysql_storage import RecordingStorage

from workflow_checkpoint import CheckpointManager

PROJECT_ID = "proj-cp-test"


def _sample_state(stage: str = "script", status: str = "running") -> dict:
    """构造一个最小可用的 PipelineState dict。"""
    return {
        "pipeline_id": "pipeline_20260329_100000_abc123",
        "project_id": PROJECT_ID,
        "current_stage": stage,
        "stages": {
            "script": {"name": "script", "status": "passed", "attempt": 1, "score_history": [8.0]},
            "characters": {"name": "characters", "status": "pending", "attempt": 0, "score_history": []},
            "storyboard": {"name": "storyboard", "status": "pending", "attempt": 0, "score_history": []},
            "video": {"name": "video", "status": "pending", "attempt": 0, "score_history": []},
        },
        "params": {"genre": "喜剧"},
        "status": status,
        "created_at": "2026-03-29T10:00:00Z",
        "updated_at": "2026-03-29T10:05:00Z",
    }


class TestCheckpointManager(unittest.TestCase):

    def setUp(self) -> None:
        self.storage = RecordingStorage()
        self.patcher = patch("workflow_checkpoint.get_storage", return_value=self.storage)
        self.patcher.start()
        self.mgr = CheckpointManager()

    def tearDown(self) -> None:
        self.patcher.stop()

    # ---- save_checkpoint ----

    def test_save_returns_checkpoint_id(self) -> None:
        cp_id = self.mgr.save_checkpoint(PROJECT_ID, _sample_state(), reason="test")
        self.assertTrue(cp_id.startswith("cp_"))

    def test_save_persists_to_storage(self) -> None:
        cp_id = self.mgr.save_checkpoint(PROJECT_ID, _sample_state(), reason="stage_passed")
        doc = self.storage.get_document("pipeline_checkpoint", f"{PROJECT_ID}:{cp_id}")
        self.assertIsNotNone(doc)
        self.assertEqual(doc["checkpoint_id"], cp_id)
        self.assertEqual(doc["reason"], "stage_passed")
        self.assertIn("state", doc)
        self.assertEqual(doc["state"]["current_stage"], "script")

    def test_save_stores_metadata(self) -> None:
        cp_id = self.mgr.save_checkpoint(PROJECT_ID, _sample_state(), reason="before_pivot")
        record = self.storage.get_document_record("pipeline_checkpoint", f"{PROJECT_ID}:{cp_id}")
        self.assertEqual(record["project_id"], PROJECT_ID)
        self.assertEqual(record["parent_id"], PROJECT_ID)
        self.assertEqual(record["status"], "before_pivot")

    # ---- restore_checkpoint ----

    def test_restore_latest(self) -> None:
        state1 = _sample_state("script")
        state2 = _sample_state("characters", "running")
        self.mgr.save_checkpoint(PROJECT_ID, state1, reason="first")
        self.mgr.save_checkpoint(PROJECT_ID, state2, reason="second")

        restored = self.mgr.restore_checkpoint(PROJECT_ID, "latest")
        self.assertIsNotNone(restored)
        # 应该恢复最新的（second）
        self.assertEqual(restored["current_stage"], "characters")

    def test_restore_specific_checkpoint(self) -> None:
        state = _sample_state("storyboard")
        cp_id = self.mgr.save_checkpoint(PROJECT_ID, state, reason="specific")

        restored = self.mgr.restore_checkpoint(PROJECT_ID, cp_id)
        self.assertIsNotNone(restored)
        self.assertEqual(restored["current_stage"], "storyboard")

    def test_restore_nonexistent_returns_none(self) -> None:
        result = self.mgr.restore_checkpoint("nonexistent", "latest")
        self.assertIsNone(result)

    def test_restore_bad_id_returns_none(self) -> None:
        result = self.mgr.restore_checkpoint(PROJECT_ID, "cp_fake_000000")
        self.assertIsNone(result)

    # ---- list_checkpoints ----

    def test_list_empty(self) -> None:
        result = self.mgr.list_checkpoints("empty-project")
        self.assertEqual(result, [])

    def test_list_returns_summaries(self) -> None:
        self.mgr.save_checkpoint(PROJECT_ID, _sample_state("script"), reason="r1")
        self.mgr.save_checkpoint(PROJECT_ID, _sample_state("characters"), reason="r2")

        result = self.mgr.list_checkpoints(PROJECT_ID)
        self.assertEqual(len(result), 2)
        # 每条记录有标准字段
        for cp in result:
            self.assertIn("checkpoint_id", cp)
            self.assertIn("reason", cp)
            self.assertIn("created_at", cp)
            self.assertIn("current_stage", cp)
            self.assertIn("status", cp)

    # ---- delete_checkpoint ----

    def test_delete_existing(self) -> None:
        cp_id = self.mgr.save_checkpoint(PROJECT_ID, _sample_state(), reason="to_delete")
        ok = self.mgr.delete_checkpoint(PROJECT_ID, cp_id)
        self.assertTrue(ok)
        # 确认已删除
        doc = self.storage.get_document("pipeline_checkpoint", f"{PROJECT_ID}:{cp_id}")
        self.assertIsNone(doc)

    def test_delete_nonexistent(self) -> None:
        ok = self.mgr.delete_checkpoint(PROJECT_ID, "cp_nonexistent")
        self.assertFalse(ok)

    # ---- cleanup_old_checkpoints ----

    def test_cleanup_keeps_recent(self) -> None:
        # 创建 7 个检查点
        cp_ids = []
        for i in range(7):
            cp_id = self.mgr.save_checkpoint(
                PROJECT_ID, _sample_state(), reason=f"auto_{i}"
            )
            cp_ids.append(cp_id)

        deleted = self.mgr.cleanup_old_checkpoints(PROJECT_ID, keep_count=3)
        self.assertEqual(deleted, 4)

        # 验证剩余数量
        remaining = self.mgr.list_checkpoints(PROJECT_ID)
        self.assertEqual(len(remaining), 3)

    def test_cleanup_noop_when_under_limit(self) -> None:
        self.mgr.save_checkpoint(PROJECT_ID, _sample_state(), reason="only_one")
        deleted = self.mgr.cleanup_old_checkpoints(PROJECT_ID, keep_count=5)
        self.assertEqual(deleted, 0)


class TestCheckpointRestoreIntegration(unittest.TestCase):
    """检查点保存→恢复→验证的集成测试。"""

    def setUp(self) -> None:
        self.storage = RecordingStorage()
        self.patcher = patch("workflow_checkpoint.get_storage", return_value=self.storage)
        self.patcher.start()
        self.mgr = CheckpointManager()

    def tearDown(self) -> None:
        self.patcher.stop()

    def test_save_restore_preserves_full_state(self) -> None:
        """保存完整状态 → 恢复后所有字段一致。"""
        original = {
            "pipeline_id": "pipeline_20260329_120000_xyz789",
            "project_id": PROJECT_ID,
            "current_stage": "storyboard",
            "stages": {
                "script": {
                    "name": "script", "status": "passed", "attempt": 2,
                    "max_attempts": 3, "score_history": [5.5, 7.8],
                    "strategy": "REFINE", "artifact_id": "script_001", "error": None,
                },
                "characters": {
                    "name": "characters", "status": "passed", "attempt": 1,
                    "max_attempts": 3, "score_history": [8.0],
                    "strategy": None, "artifact_id": "char_a,char_b", "error": None,
                },
                "storyboard": {
                    "name": "storyboard", "status": "running", "attempt": 1,
                    "max_attempts": 3, "score_history": [],
                    "strategy": None, "artifact_id": "sb_001", "error": None,
                },
                "video": {
                    "name": "video", "status": "pending", "attempt": 0,
                    "max_attempts": 3, "score_history": [],
                    "strategy": None, "artifact_id": None, "error": None,
                },
            },
            "params": {"genre": "科幻", "theme": "太空冒险", "characters_count": 5, "episodes_count": 3},
            "status": "running",
            "created_at": "2026-03-29T10:00:00Z",
            "updated_at": "2026-03-29T12:30:00Z",
        }

        cp_id = self.mgr.save_checkpoint(PROJECT_ID, original, reason="mid_storyboard")
        restored = self.mgr.restore_checkpoint(PROJECT_ID, cp_id)

        self.assertEqual(restored["pipeline_id"], original["pipeline_id"])
        self.assertEqual(restored["current_stage"], "storyboard")
        self.assertEqual(restored["params"]["genre"], "科幻")
        self.assertEqual(
            restored["stages"]["script"]["score_history"], [5.5, 7.8]
        )
        self.assertEqual(
            restored["stages"]["characters"]["artifact_id"], "char_a,char_b"
        )


if __name__ == "__main__":
    unittest.main()
