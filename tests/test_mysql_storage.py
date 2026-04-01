from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import pymysql


class RecordingStorage:
    def __init__(self) -> None:
        self.documents: dict[tuple[str, str], dict] = {}
        self.import_runs: list[dict] = []

    def upsert_document(
        self,
        doc_type: str,
        doc_id: str,
        data: dict,
        *,
        project_id: str | None = None,
        parent_id: str | None = None,
        status: str | None = None,
        title: str | None = None,
        created_at=None,
        updated_at=None,
    ) -> None:
        self.documents[(doc_type, doc_id)] = {
            "doc_type": doc_type,
            "doc_id": doc_id,
            "project_id": project_id,
            "parent_id": parent_id,
            "status": status,
            "title": title,
            "created_at": created_at,
            "updated_at": updated_at,
            "data": data,
        }

    def record_migration_run(self, summary: dict) -> None:
        self.import_runs.append(summary)

    def get_document(self, doc_type: str, doc_id: str):
        record = self.documents.get((doc_type, doc_id))
        return None if record is None else record["data"]

    def get_document_record(self, doc_type: str, doc_id: str):
        return self.documents.get((doc_type, doc_id))

    def list_document_records(
        self,
        doc_type: str,
        *,
        project_id: str | None = None,
        parent_id: str | None = None,
        status: str | None = None,
        newest_first: bool = True,
    ):
        records = [
            record
            for record in self.documents.values()
            if record["doc_type"] == doc_type
            and (project_id is None or record["project_id"] == project_id)
            and (parent_id is None or record["parent_id"] == parent_id)
            and (status is None or record["status"] == status)
        ]
        records.sort(
            key=lambda record: (
                record["updated_at"] or record["created_at"] or "",
                record["doc_id"],
            ),
            reverse=newest_first,
        )
        return records

    def list_documents(self, doc_type: str, **kwargs):
        return [record["data"] for record in self.list_document_records(doc_type, **kwargs)]

    def delete_document(self, doc_type: str, doc_id: str) -> None:
        self.documents.pop((doc_type, doc_id), None)


class MySQLStorageContractTests(unittest.TestCase):
    def test_infer_document_metadata_uses_project_and_status_fields(self) -> None:
        from mysql_storage import infer_document_metadata

        data = {
            "project_id": "proj-001",
            "status": "done",
            "title": "Demo Project",
            "created_at": "2026-03-29T10:00:00Z",
            "updated_at": "2026-03-29T11:00:00Z",
        }

        metadata = infer_document_metadata("project", "proj-001", data)

        self.assertEqual(metadata["project_id"], "proj-001")
        self.assertEqual(metadata["status"], "done")
        self.assertEqual(metadata["title"], "Demo Project")
        self.assertEqual(metadata["created_at"].strftime("%Y-%m-%dT%H:%M:%SZ"), "2026-03-29T10:00:00Z")
        self.assertEqual(metadata["updated_at"].strftime("%Y-%m-%dT%H:%M:%SZ"), "2026-03-29T11:00:00Z")

    def test_migrate_legacy_storage_imports_core_documents(self) -> None:
        from mysql_storage import migrate_legacy_storage

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "storage" / "projects" / "proj-001" / "versions" / "step3").mkdir(parents=True)
            (root / "storage" / "projects" / "proj-001" / "versions" / "step4").mkdir(parents=True)
            (root / "data" / "workflows" / "proj-001" / "checkpoints").mkdir(parents=True)
            (root / "data" / "scripts").mkdir(parents=True)
            (root / "data" / "characters").mkdir(parents=True)
            (root / "data" / "storyboards").mkdir(parents=True)
            (root / "data" / "video_tasks").mkdir(parents=True)

            manifest = {
                "tasks": [{"id": "task-1", "status": "succeeded", "title": "Task 1", "updated_at": "2026-03-29 10:00:00"}],
                "assets": [{"task_id": "task-1", "title": "Asset 1", "saved_at": "2026-03-29 10:05:00"}],
                "trash_tasks": [{"id": "task-trash", "status": "failed", "trashed_at": "2026-03-29 10:06:00"}],
                "trash_assets": [{"task_id": "asset-trash", "title": "Asset Trash", "trashed_at": "2026-03-29 10:07:00"}],
            }
            (root / "storage" / "manifest.json").parent.mkdir(parents=True, exist_ok=True)
            (root / "storage" / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")

            project = {
                "id": "proj-001",
                "title": "Project 1",
                "status": "draft",
                "created_at": "2026-03-29T09:00:00Z",
                "updated_at": "2026-03-29T09:10:00Z",
            }
            (root / "storage" / "projects" / "proj-001" / "project.json").write_text(
                json.dumps(project, ensure_ascii=False), encoding="utf-8"
            )

            step3 = {"version": 1, "timestamp": "2026-03-29T09:30:00Z", "reason": "snapshot", "analysis": {"title": "A"}}
            (root / "storage" / "projects" / "proj-001" / "versions" / "step3" / "v001_20260329T093000.json").write_text(
                json.dumps(step3, ensure_ascii=False), encoding="utf-8"
            )
            step4 = {"version": 1, "timestamp": "2026-03-29T09:40:00Z", "reason": "snapshot", "characters": []}
            (root / "storage" / "projects" / "proj-001" / "versions" / "step4" / "v001_20260329T094000.json").write_text(
                json.dumps(step4, ensure_ascii=False), encoding="utf-8"
            )

            state = {"pipeline_id": "pipe-1", "project_id": "proj-001", "current_stage": "script", "status": "running"}
            (root / "data" / "workflows" / "proj-001" / "state.json").write_text(
                json.dumps(state, ensure_ascii=False), encoding="utf-8"
            )
            checkpoint = {"checkpoint_id": "cp_1", "reason": "auto", "state": state}
            (root / "data" / "workflows" / "proj-001" / "checkpoints" / "cp_1.json").write_text(
                json.dumps(checkpoint, ensure_ascii=False), encoding="utf-8"
            )
            contract = {"stage": "script", "criteria": [], "pass_threshold": 7.0}
            (root / "data" / "workflows" / "proj-001" / "contract_script.json").write_text(
                json.dumps(contract, ensure_ascii=False), encoding="utf-8"
            )
            feedback = {"stage": "script", "attempt": 1, "average": 8.2}
            (root / "data" / "workflows" / "proj-001" / "feedback_script_1.json").write_text(
                json.dumps(feedback, ensure_ascii=False), encoding="utf-8"
            )

            script = {"script_id": "script-1", "project_id": "proj-001", "status": "completed", "title": "Script 1"}
            (root / "data" / "scripts" / "script-1.json").write_text(json.dumps(script, ensure_ascii=False), encoding="utf-8")
            character = {"character_id": "char-1", "project_id": "proj-001", "generation_status": "completed", "name": "Hero"}
            (root / "data" / "characters" / "char-1.json").write_text(json.dumps(character, ensure_ascii=False), encoding="utf-8")
            storyboard = {"storyboard_id": "sb-1", "project_id": "proj-001", "status": "done"}
            (root / "data" / "storyboards" / "sb-1.json").write_text(json.dumps(storyboard, ensure_ascii=False), encoding="utf-8")
            video_task = {"task_id": "video-1", "project_id": "proj-001", "status": "done"}
            (root / "data" / "video_tasks" / "video-1.json").write_text(json.dumps(video_task, ensure_ascii=False), encoding="utf-8")

            storage = RecordingStorage()
            summary = migrate_legacy_storage(storage, root)

            self.assertGreaterEqual(summary["imported"], 11)
            self.assertIn(("project", "proj-001"), storage.documents)
            self.assertIn(("task", "task-1"), storage.documents)
            self.assertIn(("asset", "task-1"), storage.documents)
            self.assertIn(("trash_task", "task-trash"), storage.documents)
            self.assertIn(("trash_asset", "asset-trash"), storage.documents)
            self.assertIn(("pipeline_state", "proj-001"), storage.documents)
            self.assertIn(("pipeline_checkpoint", "proj-001:cp_1"), storage.documents)
            self.assertIn(("stage_contract", "proj-001:script"), storage.documents)
            self.assertIn(("stage_feedback", "proj-001:script:1"), storage.documents)
            self.assertIn(("script", "script-1"), storage.documents)
            self.assertIn(("character", "char-1"), storage.documents)
            self.assertIn(("storyboard", "sb-1"), storage.documents)
            self.assertIn(("video_task", "video-1"), storage.documents)
            self.assertIn(("step3_snapshot", "proj-001:v001_20260329T093000.json"), storage.documents)
            self.assertIn(("step4_snapshot", "proj-001:v001_20260329T094000.json"), storage.documents)
            self.assertEqual(len(storage.import_runs), 1)

    def test_migrate_legacy_storage_keeps_project_scoped_versions(self) -> None:
        from mysql_storage import migrate_legacy_storage

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for project_id in ("proj-001", "proj-002"):
                version_dir = root / "storage" / "projects" / project_id / "versions" / "step5"
                version_dir.mkdir(parents=True, exist_ok=True)
                version = {
                    "version_id": "v001",
                    "project_id": project_id,
                    "created_at": "2026-03-29T12:00:00Z",
                    "trigger": "manual_save",
                    "data": {"project_id": project_id},
                }
                (version_dir / "v001_20260329T120000.json").write_text(
                    json.dumps(version, ensure_ascii=False),
                    encoding="utf-8",
                )

            storage = RecordingStorage()
            migrate_legacy_storage(storage, root)

            self.assertIn(("version_step5", "proj-001:v001"), storage.documents)
            self.assertIn(("version_step5", "proj-002:v001"), storage.documents)

    def test_create_storage_falls_back_to_local_json_when_mysql_is_unavailable(self) -> None:
        from mysql_storage import LocalJsonStorage, create_storage

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            config_path = root / ".local-secrets.json"
            config_path.write_text("{}", encoding="utf-8")

            with patch("mysql_storage.MySQLStorage.ensure_schema", side_effect=pymysql.err.OperationalError(1045, "denied")):
                storage = create_storage(local_config_path=config_path, base_dir=root)

            self.assertIsInstance(storage, LocalJsonStorage)

            storage.upsert_document("task", "task-1", {"id": "task-1", "status": "done"})
            self.assertEqual(storage.get_document("task", "task-1")["status"], "done")
            self.assertEqual(storage.list_documents("task")[0]["id"], "task-1")


if __name__ == "__main__":
    unittest.main()
