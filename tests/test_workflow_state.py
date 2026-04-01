"""
workflow_state.py 单元测试。

用 RecordingStorage mock 替代真实 MySQL，测试 PipelineState 和 StageState 的
全部状态流转逻辑。所有断言都基于真实数据结构和方法签名。
"""
from __future__ import annotations

import unittest
from unittest.mock import patch

from tests.test_mysql_storage import RecordingStorage

from workflow_state import (
    DEFAULT_MAX_ATTEMPTS,
    PIPELINE_STATUS_COMPLETED,
    PIPELINE_STATUS_FAILED,
    PIPELINE_STATUS_PAUSED,
    PIPELINE_STATUS_RUNNING,
    STAGE_STATUS_EVALUATING,
    STAGE_STATUS_FAILED,
    STAGE_STATUS_PASSED,
    STAGE_STATUS_PENDING,
    STAGE_STATUS_RUNNING,
    STAGES,
    PipelineState,
    StageState,
)

PROJECT_ID = "proj-test-001"


def _make_storage() -> RecordingStorage:
    """创建并注入 RecordingStorage mock。"""
    storage = RecordingStorage()
    return storage


class TestStageState(unittest.TestCase):
    """StageState 数据类测试。"""

    def test_default_values(self) -> None:
        s = StageState(name="script")
        self.assertEqual(s.status, STAGE_STATUS_PENDING)
        self.assertEqual(s.attempt, 0)
        self.assertEqual(s.max_attempts, DEFAULT_MAX_ATTEMPTS)
        self.assertEqual(s.score_history, [])
        self.assertIsNone(s.strategy)
        self.assertIsNone(s.artifact_id)
        self.assertIsNone(s.error)

    def test_latest_score_empty(self) -> None:
        s = StageState(name="script")
        self.assertIsNone(s.latest_score)

    def test_latest_score_with_history(self) -> None:
        s = StageState(name="script", score_history=[3.0, 5.5, 7.2])
        self.assertEqual(s.latest_score, 7.2)

    def test_is_improving_with_single_score(self) -> None:
        s = StageState(name="script", score_history=[5.0])
        self.assertTrue(s.is_improving)

    def test_is_improving_true(self) -> None:
        s = StageState(name="script", score_history=[4.0, 6.0])
        self.assertTrue(s.is_improving)

    def test_is_improving_false(self) -> None:
        s = StageState(name="script", score_history=[6.0, 4.0])
        self.assertFalse(s.is_improving)

    def test_score_delta(self) -> None:
        s = StageState(name="script", score_history=[4.0, 6.5])
        self.assertAlmostEqual(s.score_delta, 2.5)

    def test_score_delta_none_when_insufficient(self) -> None:
        s = StageState(name="script", score_history=[5.0])
        self.assertIsNone(s.score_delta)

    def test_roundtrip_dict(self) -> None:
        s = StageState(
            name="characters",
            status=STAGE_STATUS_RUNNING,
            attempt=2,
            score_history=[3.0, 5.0],
            strategy="REFINE",
            artifact_id="char_001,char_002",
        )
        d = s.to_dict()
        s2 = StageState.from_dict(d)
        self.assertEqual(s.name, s2.name)
        self.assertEqual(s.status, s2.status)
        self.assertEqual(s.attempt, s2.attempt)
        self.assertEqual(s.score_history, s2.score_history)
        self.assertEqual(s.strategy, s2.strategy)
        self.assertEqual(s.artifact_id, s2.artifact_id)


class TestPipelineState(unittest.TestCase):
    """PipelineState 状态机测试。"""

    def setUp(self) -> None:
        self.storage = _make_storage()
        self.patcher = patch("workflow_state.get_storage", return_value=self.storage)
        self.patcher.start()

    def tearDown(self) -> None:
        self.patcher.stop()

    def test_create_initializes_all_stages(self) -> None:
        state = PipelineState.create(PROJECT_ID, {"genre": "喜剧"})
        self.assertTrue(state.pipeline_id.startswith("pipeline_"))
        self.assertEqual(state.project_id, PROJECT_ID)
        self.assertEqual(state.status, PIPELINE_STATUS_RUNNING)
        self.assertEqual(state.current_stage, "script")
        self.assertEqual(set(state.stages.keys()), set(STAGES))
        for s in state.stages.values():
            self.assertEqual(s.status, STAGE_STATUS_PENDING)

    def test_create_persists_to_storage(self) -> None:
        state = PipelineState.create(PROJECT_ID)
        doc = self.storage.get_document("pipeline_state", PROJECT_ID)
        self.assertIsNotNone(doc)
        self.assertEqual(doc["pipeline_id"], state.pipeline_id)
        self.assertEqual(doc["status"], PIPELINE_STATUS_RUNNING)

    def test_load_roundtrip(self) -> None:
        state = PipelineState.create(PROJECT_ID, {"genre": "喜剧", "theme": "办公室"})
        state.mark_stage_running("script")
        state.record_score("script", 8.0)
        state.mark_stage_passed("script")

        loaded = PipelineState.load(PROJECT_ID)
        self.assertIsNotNone(loaded)
        self.assertEqual(loaded.pipeline_id, state.pipeline_id)
        self.assertEqual(loaded.stages["script"].status, STAGE_STATUS_PASSED)
        self.assertEqual(loaded.stages["script"].score_history, [8.0])
        self.assertEqual(loaded.params["genre"], "喜剧")

    def test_load_nonexistent_returns_none(self) -> None:
        result = PipelineState.load("nonexistent-project")
        self.assertIsNone(result)

    def test_advance_moves_to_next_stage(self) -> None:
        state = PipelineState.create(PROJECT_ID)
        self.assertEqual(state.current_stage, "script")

        has_next = state.advance()
        self.assertTrue(has_next)
        self.assertEqual(state.current_stage, "characters")

        has_next = state.advance()
        self.assertTrue(has_next)
        self.assertEqual(state.current_stage, "storyboard")

        has_next = state.advance()
        self.assertTrue(has_next)
        self.assertEqual(state.current_stage, "video")

        # 最后一个阶段推进后，管线标记完成
        has_next = state.advance()
        self.assertFalse(has_next)
        self.assertEqual(state.status, PIPELINE_STATUS_COMPLETED)

    def test_mark_stage_running_increments_attempt(self) -> None:
        state = PipelineState.create(PROJECT_ID)
        state.mark_stage_running("script")
        self.assertEqual(state.stages["script"].attempt, 1)
        self.assertEqual(state.stages["script"].status, STAGE_STATUS_RUNNING)

        state.mark_stage_running("script")
        self.assertEqual(state.stages["script"].attempt, 2)

    def test_mark_stage_evaluating(self) -> None:
        state = PipelineState.create(PROJECT_ID)
        state.mark_stage_evaluating("script")
        self.assertEqual(state.stages["script"].status, STAGE_STATUS_EVALUATING)

    def test_mark_stage_passed(self) -> None:
        state = PipelineState.create(PROJECT_ID)
        state.mark_stage_passed("script")
        self.assertEqual(state.stages["script"].status, STAGE_STATUS_PASSED)

    def test_mark_stage_failed_with_error(self) -> None:
        state = PipelineState.create(PROJECT_ID)
        state.mark_stage_failed("script", "API 超时")
        self.assertEqual(state.stages["script"].status, STAGE_STATUS_FAILED)
        self.assertEqual(state.stages["script"].error, "API 超时")

    def test_record_score(self) -> None:
        state = PipelineState.create(PROJECT_ID)
        state.record_score("script", 5.5)
        state.record_score("script", 7.2)
        self.assertEqual(state.stages["script"].score_history, [5.5, 7.2])

    def test_set_strategy(self) -> None:
        state = PipelineState.create(PROJECT_ID)
        state.set_strategy("script", "PIVOT")
        self.assertEqual(state.stages["script"].strategy, "PIVOT")

    def test_get_current_stage(self) -> None:
        state = PipelineState.create(PROJECT_ID)
        current = state.get_current_stage()
        self.assertEqual(current.name, "script")

    def test_to_dict_structure(self) -> None:
        state = PipelineState.create(PROJECT_ID, {"genre": "科幻"})
        d = state.to_dict()
        self.assertIn("pipeline_id", d)
        self.assertIn("project_id", d)
        self.assertIn("current_stage", d)
        self.assertIn("stages", d)
        self.assertIn("params", d)
        self.assertIn("created_at", d)
        self.assertIn("updated_at", d)
        self.assertIn("status", d)
        # stages 是嵌套 dict
        self.assertIn("script", d["stages"])
        self.assertIsInstance(d["stages"]["script"], dict)
        self.assertEqual(d["stages"]["script"]["name"], "script")


class TestPipelineStateStatusMachine(unittest.TestCase):
    """测试完整状态流转路径（模拟 Harness 工作流循环）。"""

    def setUp(self) -> None:
        self.storage = _make_storage()
        self.patcher = patch("workflow_state.get_storage", return_value=self.storage)
        self.patcher.start()

    def tearDown(self) -> None:
        self.patcher.stop()

    def test_full_happy_path(self) -> None:
        """模拟 4 阶段全部通过的完整路径。"""
        state = PipelineState.create(PROJECT_ID)

        for stage_name in STAGES:
            self.assertEqual(state.current_stage, stage_name)
            state.mark_stage_running(stage_name)
            state.record_score(stage_name, 8.0)
            state.mark_stage_passed(stage_name)
            state.advance()

        self.assertEqual(state.status, PIPELINE_STATUS_COMPLETED)
        for s in state.stages.values():
            self.assertEqual(s.status, STAGE_STATUS_PASSED)

    def test_refine_then_pass(self) -> None:
        """模拟 script 阶段第一次未通过 → REFINE → 第二次通过。"""
        state = PipelineState.create(PROJECT_ID)

        # 第一次尝试：5.5 分，未通过
        state.mark_stage_running("script")
        state.record_score("script", 5.5)

        # 第二次尝试：REFINE 策略
        state.set_strategy("script", "REFINE")
        state.mark_stage_running("script")
        state.record_score("script", 7.5)
        state.mark_stage_passed("script")

        self.assertEqual(state.stages["script"].score_history, [5.5, 7.5])
        self.assertEqual(state.stages["script"].strategy, "REFINE")
        self.assertEqual(state.stages["script"].attempt, 2)

    def test_pivot_after_decline(self) -> None:
        """模拟分数下降 → PIVOT。"""
        state = PipelineState.create(PROJECT_ID)

        state.mark_stage_running("script")
        state.record_score("script", 6.0)
        state.mark_stage_running("script")
        state.record_score("script", 4.5)

        # 分数下降，应该 PIVOT
        self.assertFalse(state.stages["script"].is_improving)
        self.assertAlmostEqual(state.stages["script"].score_delta, -1.5)
        state.set_strategy("script", "PIVOT")
        self.assertEqual(state.stages["script"].strategy, "PIVOT")


if __name__ == "__main__":
    unittest.main()
