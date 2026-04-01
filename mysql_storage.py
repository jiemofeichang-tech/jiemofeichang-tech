from __future__ import annotations

import json
from copy import deepcopy
from contextlib import contextmanager
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterator
import threading

import pymysql


BASE_DIR = Path(__file__).resolve().parent
LOCAL_CONFIG_FILE = BASE_DIR / ".local-secrets.json"


def _safe_json_load(path: Path) -> dict[str, Any] | list[Any] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if not isinstance(value, str):
        return None

    text = value.strip()
    candidates = [
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d",
    ]
    for fmt in candidates:
        try:
            dt = datetime.strptime(text, fmt)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _ensure_datetime(value: Any) -> datetime | None:
    dt = _parse_datetime(value)
    if dt is None:
        return None
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def load_db_config(local_config_path: str | Path | None = None) -> dict[str, Any]:
    cfg_path = Path(local_config_path) if local_config_path else LOCAL_CONFIG_FILE
    raw = _safe_json_load(cfg_path)
    if not isinstance(raw, dict):
        raw = {}
    return {
        "host": raw.get("db_host", "127.0.0.1"),
        "port": int(raw.get("db_port", 3306)),
        "user": raw.get("db_user", "root"),
        "password": raw.get("db_password", ""),
        "database": raw.get("db_name", "seedance_studio"),
        "charset": "utf8mb4",
        "autocommit": True,
    }


def infer_document_metadata(
    doc_type: str,
    doc_id: str,
    data: dict[str, Any],
    *,
    project_id: str | None = None,
    parent_id: str | None = None,
    status: str | None = None,
    title: str | None = None,
    created_at: Any = None,
    updated_at: Any = None,
) -> dict[str, Any]:
    inferred_project_id = project_id or data.get("project_id")
    if inferred_project_id is None and doc_type == "project":
        inferred_project_id = doc_id

    inferred_status = status
    if inferred_status is None:
        inferred_status = data.get("status") or data.get("generation_status")

    inferred_title = title
    if inferred_title is None:
        inferred_title = data.get("title") or data.get("name") or data.get("label")

    created_value = created_at or data.get("created_at") or data.get("saved_at") or data.get("timestamp")
    updated_value = updated_at or data.get("updated_at") or data.get("tracked_at") or data.get("saved_at") or data.get("trashed_at")

    return {
        "doc_type": doc_type,
        "doc_id": doc_id,
        "project_id": inferred_project_id,
        "parent_id": parent_id,
        "status": inferred_status,
        "title": inferred_title,
        "created_at": _ensure_datetime(created_value),
        "updated_at": _ensure_datetime(updated_value),
    }


def scoped_document_id(project_id: str, document_id: str) -> str:
    return f"{project_id}:{document_id}"


class MySQLStorage:
    def __init__(
        self,
        *,
        db_config: dict[str, Any] | None = None,
        local_config_path: str | Path | None = None,
    ) -> None:
        self.db_config = db_config or load_db_config(local_config_path)

    @contextmanager
    def connect(self) -> Iterator[pymysql.connections.Connection]:
        conn = pymysql.connect(**self.db_config)
        try:
            yield conn
        finally:
            conn.close()

    def ensure_schema(self) -> None:
        with self.connect() as db:
            with db.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS storage_documents (
                        doc_type VARCHAR(64) NOT NULL,
                        doc_id VARCHAR(191) NOT NULL,
                        project_id VARCHAR(191) NULL,
                        parent_id VARCHAR(191) NULL,
                        status VARCHAR(64) NULL,
                        title VARCHAR(255) NULL,
                        created_at DATETIME NULL,
                        updated_at DATETIME NULL,
                        data_json LONGTEXT NOT NULL,
                        PRIMARY KEY (doc_type, doc_id),
                        INDEX idx_storage_documents_type_project (doc_type, project_id),
                        INDEX idx_storage_documents_type_parent (doc_type, parent_id),
                        INDEX idx_storage_documents_type_status (doc_type, status),
                        INDEX idx_storage_documents_type_project_updated (doc_type, project_id, updated_at)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """
                )
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS storage_migration_runs (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        imported INT NOT NULL DEFAULT 0,
                        skipped INT NOT NULL DEFAULT 0,
                        errors INT NOT NULL DEFAULT 0,
                        summary_json LONGTEXT NOT NULL,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """
                )

    def upsert_document(
        self,
        doc_type: str,
        doc_id: str,
        data: dict[str, Any],
        *,
        project_id: str | None = None,
        parent_id: str | None = None,
        status: str | None = None,
        title: str | None = None,
        created_at: Any = None,
        updated_at: Any = None,
    ) -> None:
        meta = infer_document_metadata(
            doc_type,
            doc_id,
            data,
            project_id=project_id,
            parent_id=parent_id,
            status=status,
            title=title,
            created_at=created_at,
            updated_at=updated_at,
        )
        payload = json.dumps(data, ensure_ascii=False)
        with self.connect() as db:
            with db.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO storage_documents (
                        doc_type, doc_id, project_id, parent_id, status, title, created_at, updated_at, data_json
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        project_id = VALUES(project_id),
                        parent_id = VALUES(parent_id),
                        status = VALUES(status),
                        title = VALUES(title),
                        created_at = VALUES(created_at),
                        updated_at = VALUES(updated_at),
                        data_json = VALUES(data_json)
                    """,
                    (
                        meta["doc_type"],
                        meta["doc_id"],
                        meta["project_id"],
                        meta["parent_id"],
                        meta["status"],
                        meta["title"],
                        meta["created_at"],
                        meta["updated_at"],
                        payload,
                    ),
                )

    def get_document(self, doc_type: str, doc_id: str) -> dict[str, Any] | None:
        record = self.get_document_record(doc_type, doc_id)
        if not record:
            return None
        return record["data"]

    def get_document_record(self, doc_type: str, doc_id: str) -> dict[str, Any] | None:
        with self.connect() as db:
            with db.cursor() as cur:
                cur.execute(
                    """
                    SELECT doc_type, doc_id, project_id, parent_id, status, title, created_at, updated_at, data_json
                    FROM storage_documents
                    WHERE doc_type = %s AND doc_id = %s
                    """,
                    (doc_type, doc_id),
                )
                row = cur.fetchone()
        if not row:
            return None
        return {
            "doc_type": row[0],
            "doc_id": row[1],
            "project_id": row[2],
            "parent_id": row[3],
            "status": row[4],
            "title": row[5],
            "created_at": row[6],
            "updated_at": row[7],
            "data": json.loads(row[8]),
        }

    def list_documents(
        self,
        doc_type: str,
        *,
        project_id: str | None = None,
        parent_id: str | None = None,
        status: str | None = None,
        newest_first: bool = True,
    ) -> list[dict[str, Any]]:
        return [record["data"] for record in self.list_document_records(
            doc_type,
            project_id=project_id,
            parent_id=parent_id,
            status=status,
            newest_first=newest_first,
        )]

    def list_document_records(
        self,
        doc_type: str,
        *,
        project_id: str | None = None,
        parent_id: str | None = None,
        status: str | None = None,
        newest_first: bool = True,
    ) -> list[dict[str, Any]]:
        clauses = ["doc_type = %s"]
        params: list[Any] = [doc_type]
        if project_id is not None:
            clauses.append("project_id = %s")
            params.append(project_id)
        if parent_id is not None:
            clauses.append("parent_id = %s")
            params.append(parent_id)
        if status is not None:
            clauses.append("status = %s")
            params.append(status)

        order = "DESC" if newest_first else "ASC"
        sql = (
            "SELECT doc_type, doc_id, project_id, parent_id, status, title, created_at, updated_at, data_json FROM storage_documents WHERE "
            + " AND ".join(clauses)
            + f" ORDER BY COALESCE(updated_at, created_at) {order}, doc_id {order}"
        )
        with self.connect() as db:
            with db.cursor() as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()
        return [
            {
                "doc_type": row[0],
                "doc_id": row[1],
                "project_id": row[2],
                "parent_id": row[3],
                "status": row[4],
                "title": row[5],
                "created_at": row[6],
                "updated_at": row[7],
                "data": json.loads(row[8]),
            }
            for row in rows
        ]

    def delete_document(self, doc_type: str, doc_id: str) -> None:
        with self.connect() as db:
            with db.cursor() as cur:
                cur.execute(
                    "DELETE FROM storage_documents WHERE doc_type = %s AND doc_id = %s",
                    (doc_type, doc_id),
                )

    def replace_collection(self, doc_type: str, records: list[dict[str, Any]], *, key_field: str) -> None:
        incoming_ids = {str(record[key_field]) for record in records if record.get(key_field) is not None}
        with self.connect() as db:
            with db.cursor() as cur:
                cur.execute("SELECT doc_id FROM storage_documents WHERE doc_type = %s", (doc_type,))
                existing_ids = {row[0] for row in cur.fetchall()}

        for record in records:
            key = record.get(key_field)
            if key is None:
                continue
            self.upsert_document(doc_type, str(key), record)

        for stale_id in existing_ids - incoming_ids:
            self.delete_document(doc_type, stale_id)

    def record_migration_run(self, summary: dict[str, Any]) -> None:
        with self.connect() as db:
            with db.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO storage_migration_runs (imported, skipped, errors, summary_json)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (
                        int(summary.get("imported", 0)),
                        int(summary.get("skipped", 0)),
                        int(summary.get("errors", 0)),
                        json.dumps(summary, ensure_ascii=False),
                    ),
                )

    def count_documents(self, doc_type: str, *, project_id: str | None = None) -> int:
        clauses = ["doc_type = %s"]
        params: list[Any] = [doc_type]
        if project_id is not None:
            clauses.append("project_id = %s")
            params.append(project_id)
        with self.connect() as db:
            with db.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM storage_documents WHERE " + " AND ".join(clauses), params)
                row = cur.fetchone()
        return int(row[0] if row else 0)

    def delete_documents_for_project(self, project_id: str) -> None:
        with self.connect() as db:
            with db.cursor() as cur:
                cur.execute("DELETE FROM storage_documents WHERE project_id = %s OR doc_id = %s", (project_id, project_id))


def _serialize_meta_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    return value


class LocalJsonStorage:
    def __init__(self, *, base_dir: str | Path | None = None) -> None:
        root = Path(base_dir) if base_dir else BASE_DIR
        self.base_dir = root
        self.storage_file = root / "storage" / "document_store.json"
        self._lock = threading.RLock()

    def ensure_schema(self) -> None:
        self.storage_file.parent.mkdir(parents=True, exist_ok=True)
        if not self.storage_file.exists():
            self._write_state({"documents": {}, "migration_runs": []})

    def _read_state(self) -> dict[str, Any]:
        self.ensure_schema()
        raw = _safe_json_load(self.storage_file)
        if not isinstance(raw, dict):
            return {"documents": {}, "migration_runs": []}
        documents = raw.get("documents")
        if not isinstance(documents, dict):
            documents = {}
        migration_runs = raw.get("migration_runs")
        if not isinstance(migration_runs, list):
            migration_runs = []
        return {"documents": documents, "migration_runs": migration_runs}

    def _write_state(self, state: dict[str, Any]) -> None:
        self.storage_file.parent.mkdir(parents=True, exist_ok=True)
        self.storage_file.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

    def _record_key(self, doc_type: str, doc_id: str) -> str:
        return f"{doc_type}::{doc_id}"

    def upsert_document(
        self,
        doc_type: str,
        doc_id: str,
        data: dict[str, Any],
        *,
        project_id: str | None = None,
        parent_id: str | None = None,
        status: str | None = None,
        title: str | None = None,
        created_at: Any = None,
        updated_at: Any = None,
    ) -> None:
        meta = infer_document_metadata(
            doc_type,
            doc_id,
            data,
            project_id=project_id,
            parent_id=parent_id,
            status=status,
            title=title,
            created_at=created_at,
            updated_at=updated_at,
        )
        record = {
            "doc_type": meta["doc_type"],
            "doc_id": meta["doc_id"],
            "project_id": meta["project_id"],
            "parent_id": meta["parent_id"],
            "status": meta["status"],
            "title": meta["title"],
            "created_at": _serialize_meta_value(meta["created_at"]),
            "updated_at": _serialize_meta_value(meta["updated_at"]),
            "data": deepcopy(data),
        }
        with self._lock:
            state = self._read_state()
            state["documents"][self._record_key(doc_type, doc_id)] = record
            self._write_state(state)

    def get_document(self, doc_type: str, doc_id: str) -> dict[str, Any] | None:
        record = self.get_document_record(doc_type, doc_id)
        if not record:
            return None
        return deepcopy(record["data"])

    def get_document_record(self, doc_type: str, doc_id: str) -> dict[str, Any] | None:
        with self._lock:
            state = self._read_state()
            record = state["documents"].get(self._record_key(doc_type, doc_id))
        return None if record is None else deepcopy(record)

    def list_document_records(
        self,
        doc_type: str,
        *,
        project_id: str | None = None,
        parent_id: str | None = None,
        status: str | None = None,
        newest_first: bool = True,
    ) -> list[dict[str, Any]]:
        with self._lock:
            state = self._read_state()
            records = []
            for record in state["documents"].values():
                if record.get("doc_type") != doc_type:
                    continue
                if project_id is not None and record.get("project_id") != project_id:
                    continue
                if parent_id is not None and record.get("parent_id") != parent_id:
                    continue
                if status is not None and record.get("status") != status:
                    continue
                records.append(deepcopy(record))

        records.sort(
            key=lambda record: (
                record.get("updated_at") or record.get("created_at") or "",
                record.get("doc_id") or "",
            ),
            reverse=newest_first,
        )
        return records

    def list_documents(self, doc_type: str, **kwargs) -> list[dict[str, Any]]:
        return [record["data"] for record in self.list_document_records(doc_type, **kwargs)]

    def delete_document(self, doc_type: str, doc_id: str) -> None:
        with self._lock:
            state = self._read_state()
            state["documents"].pop(self._record_key(doc_type, doc_id), None)
            self._write_state(state)

    def replace_collection(self, doc_type: str, records: list[dict[str, Any]], *, key_field: str) -> None:
        incoming_ids = {str(record[key_field]) for record in records if record.get(key_field) is not None}
        existing_ids = {record["doc_id"] for record in self.list_document_records(doc_type, newest_first=False)}

        for record in records:
            key = record.get(key_field)
            if key is None:
                continue
            self.upsert_document(doc_type, str(key), record)

        for stale_id in existing_ids - incoming_ids:
            self.delete_document(doc_type, stale_id)

    def record_migration_run(self, summary: dict[str, Any]) -> None:
        with self._lock:
            state = self._read_state()
            state["migration_runs"].append(deepcopy(summary))
            self._write_state(state)

    def count_documents(self, doc_type: str, *, project_id: str | None = None) -> int:
        return len(self.list_document_records(doc_type, project_id=project_id, newest_first=False))

    def delete_documents_for_project(self, project_id: str) -> None:
        with self._lock:
            state = self._read_state()
            keys_to_delete = [
                key
                for key, record in state["documents"].items()
                if record.get("project_id") == project_id or record.get("doc_id") == project_id
            ]
            for key in keys_to_delete:
                state["documents"].pop(key, None)
            self._write_state(state)


def create_storage(
    *,
    db_config: dict[str, Any] | None = None,
    local_config_path: str | Path | None = None,
    base_dir: str | Path | None = None,
) -> MySQLStorage | LocalJsonStorage:
    storage = MySQLStorage(db_config=db_config, local_config_path=local_config_path)
    try:
        storage.ensure_schema()
        return storage
    except Exception:
        fallback = LocalJsonStorage(base_dir=base_dir)
        fallback.ensure_schema()
        if fallback.count_documents("project") == 0 and fallback.count_documents("task") == 0:
            migrate_legacy_storage(fallback, base_dir or BASE_DIR)
        return fallback


def _import_document(
    storage: Any,
    summary: dict[str, Any],
    doc_type: str,
    doc_id: str,
    data: dict[str, Any],
    *,
    project_id: str | None = None,
    parent_id: str | None = None,
    status: str | None = None,
    title: str | None = None,
    created_at: Any = None,
    updated_at: Any = None,
) -> None:
    storage.upsert_document(
        doc_type,
        doc_id,
        data,
        project_id=project_id,
        parent_id=parent_id,
        status=status,
        title=title,
        created_at=created_at,
        updated_at=updated_at,
    )
    summary["imported"] += 1


def migrate_legacy_storage(storage: Any, base_dir: str | Path | None = None) -> dict[str, Any]:
    root = Path(base_dir) if base_dir else BASE_DIR
    summary: dict[str, Any] = {"imported": 0, "skipped": 0, "errors": 0, "root": str(root)}

    def read_json(path: Path) -> dict[str, Any] | list[Any] | None:
        data = _safe_json_load(path)
        if data is None:
            summary["skipped"] += 1
        return data

    manifest_path = root / "storage" / "manifest.json"
    manifest = read_json(manifest_path)
    if isinstance(manifest, dict):
        for doc_type, key_field in (
            ("task", "id"),
            ("asset", "task_id"),
            ("trash_task", "id"),
            ("trash_asset", "task_id"),
        ):
            source_key = {
                "task": "tasks",
                "asset": "assets",
                "trash_task": "trash_tasks",
                "trash_asset": "trash_assets",
            }[doc_type]
            for item in manifest.get(source_key, []):
                key = item.get(key_field)
                if key is None:
                    summary["skipped"] += 1
                    continue
                _import_document(storage, summary, doc_type, str(key), item)

    projects_dir = root / "storage" / "projects"
    if projects_dir.exists():
        for project_file in projects_dir.glob("*/project.json"):
            project = read_json(project_file)
            if not isinstance(project, dict):
                continue
            project_id = str(project.get("id") or project_file.parent.name)
            _import_document(
                storage,
                summary,
                "project",
                project_id,
                project,
                project_id=project_id,
                status=project.get("status"),
                title=project.get("title"),
            )

        for step3_file in projects_dir.glob("*/versions/step3/*.json"):
            project_id = step3_file.parents[2].name
            snapshot = read_json(step3_file)
            if not isinstance(snapshot, dict):
                continue
            _import_document(
                storage,
                summary,
                "step3_snapshot",
                scoped_document_id(project_id, step3_file.name),
                snapshot,
                project_id=project_id,
                parent_id=project_id,
                status="snapshot",
                title=snapshot.get("reason"),
                created_at=snapshot.get("timestamp"),
                updated_at=snapshot.get("timestamp"),
            )

        for step4_file in projects_dir.glob("*/versions/step4/*.json"):
            project_id = step4_file.parents[2].name
            snapshot = read_json(step4_file)
            if not isinstance(snapshot, dict):
                continue
            if "snapshot_assets_dir" not in snapshot:
                snapshot["snapshot_assets_dir"] = str(step4_file.with_suffix("").with_name(f"{step4_file.stem}_assets"))
            _import_document(
                storage,
                summary,
                "step4_snapshot",
                scoped_document_id(project_id, step4_file.name),
                snapshot,
                project_id=project_id,
                parent_id=project_id,
                status="snapshot",
                title=snapshot.get("reason"),
                created_at=snapshot.get("timestamp"),
                updated_at=snapshot.get("timestamp"),
            )

        for version_file in projects_dir.glob("*/versions/step*/*.json"):
            step = version_file.parent.name
            if step in {"step3", "step4"}:
                continue
            project_id = version_file.parents[2].name
            version_doc = read_json(version_file)
            if not isinstance(version_doc, dict):
                continue
            _import_document(
                storage,
                summary,
                f"version_{step}",
                scoped_document_id(project_id, version_file.stem.split("_", 1)[0]),
                version_doc,
                project_id=project_id,
                parent_id=project_id,
                status=version_doc.get("trigger"),
                title=version_doc.get("label"),
                created_at=version_doc.get("created_at"),
                updated_at=version_doc.get("created_at"),
            )

    simple_dirs = (
        ("script", root / "data" / "scripts", "script_id", "status", "title"),
        ("character", root / "data" / "characters", "character_id", "generation_status", "name"),
        ("storyboard", root / "data" / "storyboards", "storyboard_id", "status", "storyboard_id"),
        ("video_task", root / "data" / "video_tasks", "task_id", "status", "task_id"),
    )
    for doc_type, directory, key_field, status_field, title_field in simple_dirs:
        if not directory.exists():
            continue
        for file_path in directory.glob("*.json"):
            data = read_json(file_path)
            if not isinstance(data, dict):
                continue
            key = data.get(key_field) or data.get("video_task_id") or file_path.stem
            _import_document(
                storage,
                summary,
                doc_type,
                str(key),
                data,
                project_id=data.get("project_id"),
                status=data.get(status_field),
                title=data.get(title_field),
            )

    workflows_dir = root / "data" / "workflows"
    if workflows_dir.exists():
        for project_dir in workflows_dir.iterdir():
            if not project_dir.is_dir():
                continue
            project_id = project_dir.name

            state = read_json(project_dir / "state.json")
            if isinstance(state, dict):
                _import_document(
                    storage,
                    summary,
                    "pipeline_state",
                    project_id,
                    state,
                    project_id=project_id,
                    status=state.get("status"),
                    title=state.get("current_stage"),
                )

            checkpoints_dir = project_dir / "checkpoints"
            if checkpoints_dir.exists():
                for cp_file in checkpoints_dir.glob("cp_*.json"):
                    checkpoint = read_json(cp_file)
                    if not isinstance(checkpoint, dict):
                        continue
                    checkpoint_id = str(checkpoint.get("checkpoint_id") or cp_file.stem)
                    _import_document(
                        storage,
                        summary,
                        "pipeline_checkpoint",
                        scoped_document_id(project_id, checkpoint_id),
                        checkpoint,
                        project_id=project_id,
                        parent_id=project_id,
                        status=checkpoint.get("reason"),
                        title=checkpoint.get("reason"),
                        created_at=checkpoint.get("created_at"),
                        updated_at=checkpoint.get("created_at"),
                    )

            for contract_file in project_dir.glob("contract_*.json"):
                contract = read_json(contract_file)
                if not isinstance(contract, dict):
                    continue
                stage = str(contract.get("stage") or contract_file.stem.replace("contract_", ""))
                _import_document(
                    storage,
                    summary,
                    "stage_contract",
                    f"{project_id}:{stage}",
                    contract,
                    project_id=project_id,
                    parent_id=project_id,
                    status="contract",
                    title=stage,
                )

            for feedback_file in project_dir.glob("feedback_*.json"):
                feedback = read_json(feedback_file)
                if not isinstance(feedback, dict):
                    continue
                stage = str(feedback.get("stage") or "unknown")
                attempt = str(feedback.get("attempt") or 0)
                _import_document(
                    storage,
                    summary,
                    "stage_feedback",
                    f"{project_id}:{stage}:{attempt}",
                    feedback,
                    project_id=project_id,
                    parent_id=project_id,
                    status=feedback.get("recommendation"),
                    title=stage,
                )

    recorder = getattr(storage, "record_migration_run", None)
    if callable(recorder):
        recorder(summary)
    return summary


@lru_cache(maxsize=1)
def get_storage() -> MySQLStorage | LocalJsonStorage:
    return create_storage()
