from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import server
from storyboard_generator import StoryboardGenerator
from video_composer import VideoComposer
from version_manager import VersionManager
from workflow_checkpoint import CheckpointManager
from workflow_orchestrator import WorkflowOrchestrator

from tests.test_mysql_storage import RecordingStorage


class _WorkflowStatusHandler:
    def __init__(self) -> None:
        self.response = None

    def send_json(self, status, payload):
        self.response = (status, payload)
        return self.response


class MySQLStorageAdoptionTests(unittest.TestCase):
    def test_storyboard_generator_loads_script_and_updates_storyboard_from_storage(self) -> None:
        storage = RecordingStorage()
        storyboard_id = "storyboard_storage_only"
        script_id = "script_storage_only"
        storage.upsert_document(
            "storyboard",
            storyboard_id,
            {
                "storyboard_id": storyboard_id,
                "project_id": "proj-001",
                "status": "pending",
                "panels": [],
                "created_at": "2026-03-29T10:00:00Z",
                "updated_at": "2026-03-29T10:00:00Z",
            },
            project_id="proj-001",
        )
        storage.upsert_document(
            "script",
            script_id,
            {
                "script_id": script_id,
                "project_id": "proj-001",
                "status": "completed",
                "synopsis": "synopsis",
                "characters": [{"name": "A"}],
                "episodes": [{"scenes": [{"scene_id": "scene_1", "description": "d"}]}],
                "scenes": [{"scene_id": "scene_1", "description": "d"}],
            },
            project_id="proj-001",
        )

        generator = StoryboardGenerator({})

        with tempfile.TemporaryDirectory() as tmp, patch(
            "storyboard_generator.get_storage",
            return_value=storage,
            create=True,
        ):
            generator.storyboards_dir = Path(tmp) / "storyboards"
            generator.storyboards_dir.mkdir(parents=True, exist_ok=True)

            with patch.object(
                generator,
                "_llm_generate_panels",
                return_value=[
                    {
                        "scene_id": "scene_1",
                        "shot_type": "medium_shot",
                        "image_prompt": "shot",
                        "duration": 3,
                    }
                ],
            ), patch.object(generator, "_generate_panels_concurrent", return_value=None):
                generator._generate_worker(storyboard_id, "proj-001", script_id, 0, None)

        storyboard = storage.get_document("storyboard", storyboard_id)
        self.assertIsNotNone(storyboard)
        self.assertEqual(storyboard["status"], "done")
        self.assertEqual(len(storyboard["panels"]), 1)
        self.assertEqual(storyboard["panels"][0]["scene_id"], "scene_1")

    def test_video_composer_loads_storyboard_and_updates_task_from_storage(self) -> None:
        storage = RecordingStorage()
        task_id = "video_storage_only"
        storyboard_id = "storyboard_storage_only"
        storage.upsert_document(
            "video_task",
            task_id,
            {
                "task_id": task_id,
                "project_id": "proj-001",
                "status": "pending",
                "progress": 0,
                "clips": [],
                "created_at": "2026-03-29T10:00:00Z",
                "updated_at": "2026-03-29T10:00:00Z",
            },
            project_id="proj-001",
        )
        storage.upsert_document(
            "storyboard",
            storyboard_id,
            {
                "storyboard_id": storyboard_id,
                "project_id": "proj-001",
                "status": "done",
                "panels": [
                    {
                        "panel_id": "panel-1",
                        "status": "done",
                        "image_url": "https://example.com/panel.png",
                        "duration": 3,
                    }
                ],
            },
            project_id="proj-001",
        )

        composer = VideoComposer({})

        with tempfile.TemporaryDirectory() as tmp, patch(
            "video_composer.get_storage",
            return_value=storage,
            create=True,
        ):
            composer.video_tasks_dir = Path(tmp) / "video_tasks"
            composer.video_tasks_dir.mkdir(parents=True, exist_ok=True)
            composer.videos_dir = Path(tmp) / "videos"
            composer.videos_dir.mkdir(parents=True, exist_ok=True)

            output_path = composer.videos_dir / "final.mp4"
            output_path.write_bytes(b"video")

            with patch.object(
                composer,
                "_panel_to_clip",
                return_value={
                    "panel_id": "panel-1",
                    "index": 0,
                    "image_url": "https://example.com/panel.png",
                    "clip_url": None,
                    "duration": 3.0,
                    "status": "static",
                },
            ), patch.object(composer, "_merge_clips", return_value=output_path):
                composer._compose_worker(task_id, "proj-001", storyboard_id, None, 0)

        task = storage.get_document("video_task", task_id)
        self.assertIsNotNone(task)
        self.assertEqual(task["status"], "done")
        self.assertEqual(task["progress"], 100)
        self.assertEqual(task["output_url"], f"/media/videos/{output_path.name}")

    def test_workflow_orchestrator_reads_latest_artifacts_from_storage(self) -> None:
        storage = RecordingStorage()
        storage.upsert_document(
            "script",
            "script-old",
            {
                "script_id": "script-old",
                "project_id": "proj-001",
                "status": "done",
                "created_at": "2026-03-29T09:00:00Z",
            },
            project_id="proj-001",
            updated_at="2026-03-29T09:00:00Z",
        )
        storage.upsert_document(
            "script",
            "script-new",
            {
                "script_id": "script-new",
                "project_id": "proj-001",
                "status": "done",
                "created_at": "2026-03-29T10:00:00Z",
            },
            project_id="proj-001",
            updated_at="2026-03-29T10:00:00Z",
        )
        storage.upsert_document(
            "storyboard",
            "sb-new",
            {
                "storyboard_id": "sb-new",
                "project_id": "proj-001",
                "status": "done",
                "created_at": "2026-03-29T11:00:00Z",
            },
            project_id="proj-001",
            updated_at="2026-03-29T11:00:00Z",
        )
        storage.upsert_document(
            "video_task",
            "video-new",
            {
                "task_id": "video-new",
                "project_id": "proj-001",
                "status": "done",
                "created_at": "2026-03-29T12:00:00Z",
            },
            project_id="proj-001",
            updated_at="2026-03-29T12:00:00Z",
        )

        with patch("workflow_orchestrator.get_storage", return_value=storage, create=True):
            orchestrator = WorkflowOrchestrator({})
            latest_script = orchestrator._find_latest_script("proj-001")
            latest_storyboard = orchestrator._find_latest_storyboard("proj-001")
            latest_video = orchestrator._get_artifact_data("video", "video-new", "proj-001")

        self.assertEqual(latest_script["script_id"], "script-new")
        self.assertEqual(latest_storyboard["storyboard_id"], "sb-new")
        self.assertEqual(latest_video["task_id"], "video-new")

    def test_version_manager_stores_versions_with_project_scoped_ids(self) -> None:
        storage = RecordingStorage()

        with tempfile.TemporaryDirectory() as tmp, patch(
            "version_manager.get_storage",
            return_value=storage,
            create=True,
        ), patch("version_manager._now_ts", return_value="20260329T120000"):
            manager = VersionManager(projects_dir=tmp)
            manager.save_version("proj-001", "step5", {"project_id": "proj-001"})
            manager.save_version("proj-002", "step5", {"project_id": "proj-002"})

            versions_one = manager.list_versions("proj-001", "step5")
            versions_two = manager.list_versions("proj-002", "step5")

        self.assertIn(("version_step5", "proj-001:v001"), storage.documents)
        self.assertIn(("version_step5", "proj-002:v001"), storage.documents)
        self.assertEqual(versions_one["versions"][0]["version_id"], "v001")
        self.assertEqual(versions_two["versions"][0]["version_id"], "v001")

    def test_checkpoint_manager_scopes_checkpoint_ids_per_project(self) -> None:
        storage = RecordingStorage()
        checkpoint_data = {"project_id": "proj-001", "current_stage": "script", "status": "running"}

        with patch("workflow_checkpoint.get_storage", return_value=storage), patch(
            "workflow_checkpoint._now_ts",
            return_value="20260329_120000",
        ):
            manager = CheckpointManager()
            first = manager.save_checkpoint("proj-001", checkpoint_data, reason="auto")
            second = manager.save_checkpoint(
                "proj-002",
                {"project_id": "proj-002", "current_stage": "script", "status": "running"},
                reason="auto",
            )

        self.assertEqual(first, "cp_20260329_120000")
        self.assertEqual(second, "cp_20260329_120000")
        self.assertIn(("pipeline_checkpoint", "proj-001:cp_20260329_120000"), storage.documents)
        self.assertIn(("pipeline_checkpoint", "proj-002:cp_20260329_120000"), storage.documents)

    def test_server_workflow_status_uses_document_storage_for_script_step(self) -> None:
        storage = RecordingStorage()
        storage.upsert_document(
            "script",
            "script-1",
            {
                "script_id": "script-1",
                "project_id": "proj-001",
                "status": "done",
            },
            project_id="proj-001",
            status="done",
        )

        handler = _WorkflowStatusHandler()

        with patch.object(server, "DOCUMENT_STORAGE", storage), patch.object(
            server,
            "_get_workflow_engines",
            return_value=(object(), None),
        ):
            server.AppHandler._handle_workflow_status(handler, "proj-001")

        self.assertIsNotNone(handler.response)
        _, payload = handler.response
        self.assertTrue(payload["steps"]["script"]["done"])
        self.assertEqual(payload["steps"]["script"]["id"], "script-1")


if __name__ == "__main__":
    unittest.main()
