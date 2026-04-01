"""
workflow_orchestrator.py 单元测试。

用 mock 替代真实引擎和 MySQL，测试编排器的核心逻辑：
- 策略决策（REFINE vs PIVOT）
- 阶段构建和评估循环
- 检查点保存
- 管线状态流转
- 关键阶段失败时终止
"""
from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from tests.test_mysql_storage import RecordingStorage

from stage_contract import STAGE_CONTRACTS
from stage_evaluator import CriterionScore, EvalResult
from workflow_orchestrator import WorkflowOrchestrator
from workflow_state import (
    PIPELINE_STATUS_COMPLETED,
    PIPELINE_STATUS_FAILED,
    PIPELINE_STATUS_RUNNING,
    STAGE_STATUS_FAILED,
    STAGE_STATUS_PASSED,
    STAGES,
    PipelineState,
)

PROJECT_ID = "proj-orch-test"
CONFIG = {
    "api_key": "sk-fake",
    "base_url": "http://fake/v1/chat/completions",
    "ai_chat_base": "http://fake/v1/chat/completions",
    "image_api_url": "http://fake/images",
    "model": "test-model",
}


def _pass_eval(stage: str, attempt: int = 1) -> EvalResult:
    """构造一个通过质量门控的 EvalResult。"""
    threshold = STAGE_CONTRACTS[stage].pass_threshold
    return EvalResult(
        stage=stage,
        attempt=attempt,
        criterion_scores=[
            CriterionScore(name="auto", score=threshold + 1, weight=10, reason="auto-pass"),
        ],
        average=threshold + 1,
        recommendation="PASS",
    )


def _fail_eval(stage: str, attempt: int = 1, score: float = 3.0) -> EvalResult:
    """构造一个未通过质量门控的 EvalResult。"""
    return EvalResult(
        stage=stage,
        attempt=attempt,
        criterion_scores=[
            CriterionScore(name="auto", score=score, weight=10, reason="auto-fail"),
        ],
        average=score,
        recommendation="REFINE",
    )


class TestDecideStrategy(unittest.TestCase):
    """REFINE vs PIVOT 策略决策测试。"""

    def setUp(self) -> None:
        self.storage = RecordingStorage()
        self.state_patcher = patch("workflow_state.get_storage", return_value=self.storage)
        self.cp_patcher = patch("workflow_checkpoint.get_storage", return_value=self.storage)
        self.contract_patcher = patch("stage_contract.get_storage", return_value=self.storage)
        self.eval_patcher = patch("stage_evaluator.get_storage", return_value=self.storage)
        self.state_patcher.start()
        self.cp_patcher.start()
        self.contract_patcher.start()
        self.eval_patcher.start()
        self.orch = WorkflowOrchestrator(CONFIG)

    def tearDown(self) -> None:
        self.state_patcher.stop()
        self.cp_patcher.stop()
        self.contract_patcher.stop()
        self.eval_patcher.stop()

    def test_single_score_returns_refine(self) -> None:
        self.assertEqual(self.orch._decide_strategy([5.0]), "REFINE")

    def test_improving_returns_refine(self) -> None:
        self.assertEqual(self.orch._decide_strategy([4.0, 6.0]), "REFINE")

    def test_slight_improvement_returns_refine(self) -> None:
        self.assertEqual(self.orch._decide_strategy([5.0, 5.3]), "REFINE")

    def test_stagnant_returns_pivot(self) -> None:
        self.assertEqual(self.orch._decide_strategy([5.0, 5.0]), "PIVOT")

    def test_declining_returns_pivot(self) -> None:
        self.assertEqual(self.orch._decide_strategy([6.0, 4.0]), "PIVOT")

    def test_empty_scores_returns_refine(self) -> None:
        self.assertEqual(self.orch._decide_strategy([]), "REFINE")


class TestRunStage(unittest.TestCase):
    """_run_stage 单个阶段循环测试。"""

    def setUp(self) -> None:
        self.storage = RecordingStorage()
        self.state_patcher = patch("workflow_state.get_storage", return_value=self.storage)
        self.cp_patcher = patch("workflow_checkpoint.get_storage", return_value=self.storage)
        self.contract_patcher = patch("stage_contract.get_storage", return_value=self.storage)
        self.eval_patcher = patch("stage_evaluator.get_storage", return_value=self.storage)
        self.state_patcher.start()
        self.cp_patcher.start()
        self.contract_patcher.start()
        self.eval_patcher.start()
        self.orch = WorkflowOrchestrator(CONFIG)

    def tearDown(self) -> None:
        self.state_patcher.stop()
        self.cp_patcher.stop()
        self.contract_patcher.stop()
        self.eval_patcher.stop()

    def test_stage_passes_on_first_attempt(self) -> None:
        """首次尝试即通过 → 返回 True，状态为 passed。"""
        state = PipelineState.create(PROJECT_ID)

        self.orch._build_stage = MagicMock(return_value="script_001")
        self.orch._wait_for_completion = MagicMock(return_value={
            "title": "T", "synopsis": "S", "characters": [], "episodes": [],
            "status": "done",
        })
        self.orch.evaluator.evaluate = MagicMock(return_value=_pass_eval("script"))

        passed = self.orch._run_stage(state, "script")
        self.assertTrue(passed)
        self.assertEqual(state.stages["script"].status, STAGE_STATUS_PASSED)
        self.assertEqual(state.stages["script"].attempt, 1)

    def test_stage_retries_on_low_score(self) -> None:
        """首次低分 → 重试 → 第二次通过。"""
        state = PipelineState.create(PROJECT_ID)

        self.orch._build_stage = MagicMock(return_value="script_001")
        self.orch._wait_for_completion = MagicMock(return_value={
            "title": "T", "synopsis": "S", "characters": [], "episodes": [],
            "status": "done",
        })
        # 第一次 5.0 分（低于 7.0），第二次 8.0 分
        self.orch.evaluator.evaluate = MagicMock(
            side_effect=[_fail_eval("script", 1, 5.0), _pass_eval("script", 2)]
        )

        passed = self.orch._run_stage(state, "script")
        self.assertTrue(passed)
        self.assertEqual(state.stages["script"].attempt, 2)
        self.assertEqual(state.stages["script"].score_history, [5.0, 8.0])

    def test_stage_fails_after_max_attempts(self) -> None:
        """达到最大尝试次数仍未通过 → 返回 False。"""
        state = PipelineState.create(PROJECT_ID)

        self.orch._build_stage = MagicMock(return_value="script_001")
        self.orch._wait_for_completion = MagicMock(return_value={
            "title": "T", "synopsis": "S", "characters": [], "episodes": [],
            "status": "done",
        })
        # 3 次都不通过
        self.orch.evaluator.evaluate = MagicMock(
            side_effect=[_fail_eval("script", i, 4.0) for i in range(1, 4)]
        )

        passed = self.orch._run_stage(state, "script")
        self.assertFalse(passed)
        self.assertEqual(state.stages["script"].status, STAGE_STATUS_FAILED)
        self.assertEqual(state.stages["script"].attempt, 3)

    def test_build_failure_continues_to_retry(self) -> None:
        """构建异常时继续重试下一次。"""
        state = PipelineState.create(PROJECT_ID)

        call_count = [0]

        def build_side_effect(*args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                raise RuntimeError("API 超时")
            return "script_002"

        self.orch._build_stage = MagicMock(side_effect=build_side_effect)
        self.orch._wait_for_completion = MagicMock(return_value={
            "title": "T", "synopsis": "S", "characters": [], "episodes": [],
            "status": "done",
        })
        self.orch.evaluator.evaluate = MagicMock(return_value=_pass_eval("script"))

        passed = self.orch._run_stage(state, "script")
        self.assertTrue(passed)
        self.assertEqual(state.stages["script"].attempt, 2)

    def test_wait_timeout_continues_to_retry(self) -> None:
        """等待超时时继续重试。"""
        state = PipelineState.create(PROJECT_ID)

        call_count = [0]

        def wait_side_effect(*args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                return None  # 超时
            return {"title": "T", "synopsis": "S", "characters": [], "episodes": [], "status": "done"}

        self.orch._build_stage = MagicMock(return_value="script_001")
        self.orch._wait_for_completion = MagicMock(side_effect=wait_side_effect)
        self.orch.evaluator.evaluate = MagicMock(return_value=_pass_eval("script"))

        passed = self.orch._run_stage(state, "script")
        self.assertTrue(passed)

    def test_checkpoint_saved_after_each_eval(self) -> None:
        """每次评估后都应保存检查点。"""
        state = PipelineState.create(PROJECT_ID)

        self.orch._build_stage = MagicMock(return_value="script_001")
        self.orch._wait_for_completion = MagicMock(return_value={
            "title": "T", "synopsis": "S", "characters": [], "episodes": [],
            "status": "done",
        })
        self.orch.evaluator.evaluate = MagicMock(return_value=_pass_eval("script"))
        self.orch.checkpoint_mgr.save_checkpoint = MagicMock(return_value="cp_001")

        self.orch._run_stage(state, "script")
        self.orch.checkpoint_mgr.save_checkpoint.assert_called_once()


class TestRunPipelineWorker(unittest.TestCase):
    """_run_pipeline_worker 完整管线测试。"""

    def setUp(self) -> None:
        self.storage = RecordingStorage()
        self.state_patcher = patch("workflow_state.get_storage", return_value=self.storage)
        self.cp_patcher = patch("workflow_checkpoint.get_storage", return_value=self.storage)
        self.contract_patcher = patch("stage_contract.get_storage", return_value=self.storage)
        self.eval_patcher = patch("stage_evaluator.get_storage", return_value=self.storage)
        self.state_patcher.start()
        self.cp_patcher.start()
        self.contract_patcher.start()
        self.eval_patcher.start()
        self.orch = WorkflowOrchestrator(CONFIG)

    def tearDown(self) -> None:
        self.state_patcher.stop()
        self.cp_patcher.stop()
        self.contract_patcher.stop()
        self.eval_patcher.stop()

    def test_all_stages_pass(self) -> None:
        """所有阶段通过 → 管线标记完成。"""
        state = PipelineState.create(PROJECT_ID)

        def run_stage_mock(s, name):
            s.mark_stage_running(name)
            s.record_score(name, 8.0)
            s.mark_stage_passed(name)
            return True

        self.orch._run_stage = MagicMock(side_effect=run_stage_mock)
        self.orch._run_pipeline_worker(state)

        self.assertEqual(state.status, PIPELINE_STATUS_COMPLETED)

    def test_critical_stage_failure_stops_pipeline(self) -> None:
        """script 阶段失败 → 管线终止（不继续到 characters）。"""
        state = PipelineState.create(PROJECT_ID)

        def run_stage_mock(s, name):
            if name == "script":
                s.mark_stage_failed(name, "生成失败")
                return False
            s.mark_stage_passed(name)
            return True

        self.orch._run_stage = MagicMock(side_effect=run_stage_mock)
        self.orch._run_pipeline_worker(state)

        self.assertEqual(state.status, PIPELINE_STATUS_FAILED)
        # characters 不应被执行
        self.assertEqual(state.stages["characters"].status, "pending")

    def test_non_critical_stage_failure_continues(self) -> None:
        """characters 阶段失败 → 继续执行 storyboard。"""
        state = PipelineState.create(PROJECT_ID)

        def run_stage_mock(s, name):
            if name == "characters":
                s.mark_stage_failed(name, "部分角色生成失败")
                return False
            s.mark_stage_running(name)
            s.mark_stage_passed(name)
            return True

        self.orch._run_stage = MagicMock(side_effect=run_stage_mock)
        self.orch._run_pipeline_worker(state)

        # characters 失败但管线继续
        self.assertEqual(state.stages["characters"].status, STAGE_STATUS_FAILED)
        # 管线最终完成（因为 video 不是关键阶段……等等，video IS 关键阶段）
        # 实际上 video 也通过了，所以管线完成
        self.assertEqual(state.status, PIPELINE_STATUS_COMPLETED)

    def test_resume_from_middle_stage(self) -> None:
        """从 storyboard 阶段恢复 → 只执行 storyboard 和 video。"""
        state = PipelineState.create(PROJECT_ID)
        state.stages["script"].status = STAGE_STATUS_PASSED
        state.stages["characters"].status = STAGE_STATUS_PASSED
        state.current_stage = "storyboard"
        state.save()

        call_stages = []

        def run_stage_mock(s, name):
            call_stages.append(name)
            s.mark_stage_running(name)
            s.mark_stage_passed(name)
            return True

        self.orch._run_stage = MagicMock(side_effect=run_stage_mock)
        self.orch._run_pipeline_worker(state)

        # 只执行了 storyboard 和 video
        self.assertEqual(call_stages, ["storyboard", "video"])
        self.assertEqual(state.status, PIPELINE_STATUS_COMPLETED)


class TestStartAndResumePipeline(unittest.TestCase):
    """start_pipeline 和 resume_pipeline 入口测试。"""

    def setUp(self) -> None:
        self.storage = RecordingStorage()
        self.state_patcher = patch("workflow_state.get_storage", return_value=self.storage)
        self.cp_patcher = patch("workflow_checkpoint.get_storage", return_value=self.storage)
        self.contract_patcher = patch("stage_contract.get_storage", return_value=self.storage)
        self.eval_patcher = patch("stage_evaluator.get_storage", return_value=self.storage)
        self.state_patcher.start()
        self.cp_patcher.start()
        self.contract_patcher.start()
        self.eval_patcher.start()
        self.orch = WorkflowOrchestrator(CONFIG)

    def tearDown(self) -> None:
        self.state_patcher.stop()
        self.cp_patcher.stop()
        self.contract_patcher.stop()
        self.eval_patcher.stop()

    def test_start_pipeline_sync(self) -> None:
        """同步启动管线（async_run=False）。"""
        # Mock _run_stage 使所有阶段立即通过
        def run_stage_mock(s, name):
            s.mark_stage_running(name)
            s.mark_stage_passed(name)
            return True

        self.orch._run_stage = MagicMock(side_effect=run_stage_mock)

        state = self.orch.start_pipeline(
            PROJECT_ID,
            {"genre": "喜剧", "theme": "办公室", "characters_count": 3, "episodes_count": 1},
            async_run=False,
        )
        self.assertIsNotNone(state)
        self.assertEqual(state.project_id, PROJECT_ID)
        self.assertEqual(state.status, PIPELINE_STATUS_COMPLETED)

    def test_start_pipeline_writes_contracts(self) -> None:
        """启动管线应写入所有阶段合同。"""
        self.orch._run_pipeline_worker = MagicMock()  # 不实际运行

        state = self.orch.start_pipeline(PROJECT_ID, {}, async_run=False)

        for stage in STAGES:
            doc = self.storage.get_document("stage_contract", f"{PROJECT_ID}:{stage}")
            self.assertIsNotNone(doc, f"阶段 {stage} 的合同未写入")

    def test_resume_nonexistent_returns_none(self) -> None:
        result = self.orch.resume_pipeline("nonexistent", async_run=False)
        self.assertIsNone(result)

    def test_resume_completed_no_rerun(self) -> None:
        """已完成的管线不应重新运行。"""
        state = PipelineState.create(PROJECT_ID)
        state.status = PIPELINE_STATUS_COMPLETED
        state.save()

        result = self.orch.resume_pipeline(PROJECT_ID, async_run=False)
        self.assertIsNotNone(result)
        self.assertEqual(result.status, PIPELINE_STATUS_COMPLETED)

    def test_get_pipeline_status(self) -> None:
        PipelineState.create(PROJECT_ID, {"genre": "科幻"})
        status = self.orch.get_pipeline_status(PROJECT_ID)
        self.assertIsNotNone(status)
        self.assertEqual(status.project_id, PROJECT_ID)


if __name__ == "__main__":
    unittest.main()
