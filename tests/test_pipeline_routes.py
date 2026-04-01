"""
server.py 管线路由集成测试。

测试 Pipeline API 端点的 HTTP 请求/响应格式。
使用 RecordingStorage mock 替代 MySQL，使用 mock 替代真实引擎。
"""
from __future__ import annotations

import io
import json
import unittest
from http.server import HTTPServer
from threading import Thread
from unittest.mock import MagicMock, patch
from urllib.request import Request, urlopen
from urllib.error import HTTPError

from tests.test_mysql_storage import RecordingStorage


# 全局 mock storage，在 server 模块加载前注入
_test_storage = RecordingStorage()


def _setup_server():
    """导入 server 模块并创建测试服务器。"""
    # 必须在 patch 之后 import，确保所有模块使用 mock storage
    import server as srv
    return srv


class TestPipelineRoutes(unittest.TestCase):
    """Pipeline HTTP API 路由测试。"""

    @classmethod
    def setUpClass(cls) -> None:
        """启动测试 HTTP 服务器。"""
        cls.storage = RecordingStorage()

        # 收集所有需要 patch 的路径
        cls.patchers = [
            patch("workflow_state.get_storage", return_value=cls.storage),
            patch("workflow_checkpoint.get_storage", return_value=cls.storage),
            patch("stage_contract.get_storage", return_value=cls.storage),
            patch("stage_evaluator.get_storage", return_value=cls.storage),
            # 绕过认证——让 require_auth 始终返回 True
            patch("server.AppHandler.require_auth", return_value=True),
        ]
        for p in cls.patchers:
            p.start()

        # 导入 server（此时 workflow 模块已被 patch）
        import importlib
        import server as srv
        cls.srv = srv

        # 创建测试服务器（随机端口）
        cls.server = HTTPServer(("127.0.0.1", 0), srv.AppHandler)
        cls.port = cls.server.server_address[1]
        cls.base = f"http://127.0.0.1:{cls.port}"

        # 在后台线程运行
        cls.thread = Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        for p in cls.patchers:
            p.stop()

    def _request(self, method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
        """发送 HTTP 请求，返回 (status_code, json_body)。"""
        url = f"{self.base}{path}"
        data = json.dumps(body).encode() if body else None
        req = Request(url, data=data, method=method)
        req.add_header("Content-Type", "application/json")

        try:
            with urlopen(req, timeout=10) as resp:
                return resp.status, json.loads(resp.read().decode())
        except HTTPError as e:
            return e.code, json.loads(e.read().decode()) if e.readable() else {}

    # ---- POST /api/workflow/pipeline/start ----

    def test_start_missing_params(self) -> None:
        """缺少必需参数 → 400。"""
        status, body = self._request("POST", "/api/workflow/pipeline/start", {
            "project_id": "proj-001",
            # 缺少 genre, theme 等
        })
        self.assertEqual(status, 400)

    def test_start_success(self) -> None:
        """正常启动 → 200，返回 pipeline_id。"""
        # Mock orchestrator 避免启动真实后台线程
        with patch("workflow_orchestrator.WorkflowOrchestrator") as MockOrch:
            mock_state = MagicMock()
            mock_state.pipeline_id = "pipeline_test_001"
            mock_state.project_id = "proj-start-001"
            mock_state.status = "running"
            mock_state.current_stage = "script"
            MockOrch.return_value.start_pipeline.return_value = mock_state

            status, body = self._request("POST", "/api/workflow/pipeline/start", {
                "project_id": "proj-start-001",
                "genre": "喜剧",
                "theme": "办公室",
                "characters_count": 3,
                "episodes_count": 1,
            })

        self.assertEqual(status, 200)
        self.assertIn("pipeline_id", body)
        self.assertEqual(body["status"], "running")
        self.assertEqual(body["current_stage"], "script")

    # ---- POST /api/workflow/pipeline/resume ----

    def test_resume_missing_project_id(self) -> None:
        status, body = self._request("POST", "/api/workflow/pipeline/resume", {})
        self.assertEqual(status, 400)

    def test_resume_nonexistent(self) -> None:
        with patch("workflow_orchestrator.WorkflowOrchestrator") as MockOrch:
            MockOrch.return_value.resume_pipeline.return_value = None
            status, body = self._request("POST", "/api/workflow/pipeline/resume", {
                "project_id": "nonexistent",
            })
        self.assertEqual(status, 404)

    # ---- GET /api/workflow/pipeline/status/{project_id} ----

    def test_status_nonexistent(self) -> None:
        with patch("workflow_orchestrator.WorkflowOrchestrator") as MockOrch:
            MockOrch.return_value.get_pipeline_status.return_value = None
            status, body = self._request("GET", "/api/workflow/pipeline/status/nonexistent")
        self.assertEqual(status, 404)

    def test_status_exists(self) -> None:
        """查询已存在的管线状态。"""
        from workflow_state import PipelineState
        PipelineState.create("proj-status-test", {"genre": "科幻"})

        status, body = self._request("GET", "/api/workflow/pipeline/status/proj-status-test")
        self.assertEqual(status, 200)
        self.assertIn("pipeline_id", body)
        self.assertIn("stages", body)
        self.assertIn("script", body["stages"])
        self.assertEqual(body["current_stage"], "script")

    # ---- GET /api/workflow/pipeline/checkpoints/{project_id} ----

    def test_checkpoints_empty(self) -> None:
        status, body = self._request("GET", "/api/workflow/pipeline/checkpoints/empty-proj")
        self.assertEqual(status, 200)
        self.assertEqual(body["checkpoints"], [])

    def test_checkpoints_with_data(self) -> None:
        from workflow_checkpoint import CheckpointManager
        mgr = CheckpointManager()
        mgr.save_checkpoint("proj-cp-route", {"current_stage": "script", "status": "running"}, reason="test")

        status, body = self._request("GET", "/api/workflow/pipeline/checkpoints/proj-cp-route")
        self.assertEqual(status, 200)
        self.assertGreater(len(body["checkpoints"]), 0)
        cp = body["checkpoints"][0]
        self.assertIn("checkpoint_id", cp)
        self.assertIn("reason", cp)


class TestPipelineResponseFormat(unittest.TestCase):
    """验证 Pipeline API 返回格式符合前端 TypeScript 类型定义。"""

    def setUp(self) -> None:
        self.storage = RecordingStorage()
        self.patchers = [
            patch("workflow_state.get_storage", return_value=self.storage),
            patch("workflow_checkpoint.get_storage", return_value=self.storage),
            patch("stage_contract.get_storage", return_value=self.storage),
            patch("stage_evaluator.get_storage", return_value=self.storage),
        ]
        for p in self.patchers:
            p.start()

    def tearDown(self) -> None:
        for p in self.patchers:
            p.stop()

    def test_pipeline_state_matches_typescript_type(self) -> None:
        """
        验证 PipelineState.to_dict() 的键与 WfPipelineState 类型定义一致。

        TypeScript 定义（src/types/workflow.ts）：
        - pipeline_id: string
        - project_id: string
        - status: PipelineStatus
        - current_stage: string
        - stages: Record<string, WfPipelineStage>
        - params: Record<string, unknown>
        - created_at: string
        - updated_at: string
        """
        from workflow_state import PipelineState
        state = PipelineState.create("proj-format-test", {"genre": "喜剧"})
        d = state.to_dict()

        # 顶层字段
        expected_keys = {
            "pipeline_id", "project_id", "status", "current_stage",
            "stages", "params", "created_at", "updated_at",
        }
        self.assertEqual(set(d.keys()), expected_keys)

        # stages 子结构
        for stage_name, stage_data in d["stages"].items():
            stage_keys = set(stage_data.keys())
            expected_stage_keys = {
                "name", "status", "attempt", "max_attempts",
                "score_history", "strategy", "artifact_id", "error",
            }
            self.assertEqual(
                stage_keys, expected_stage_keys,
                f"阶段 {stage_name} 的键与 WfPipelineStage 不匹配",
            )

        # 类型检查
        self.assertIsInstance(d["pipeline_id"], str)
        self.assertIsInstance(d["created_at"], str)
        self.assertIn(d["status"], {"running", "paused", "completed", "failed"})
        self.assertIn(d["current_stage"], {"script", "characters", "storyboard", "video"})


if __name__ == "__main__":
    unittest.main()
