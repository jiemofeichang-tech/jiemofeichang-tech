"""
Version Manager — 工作流步骤版本历史管理。

设计文档 §八：版本历史
- 自动存档触发：分镜图/视频重新生成、最终合成重新合成
- 首次生成不存档
- 最多保留 5 个版本
- 恢复前自动保存当前状态
- 视频文件仅记录路径引用，不复制
"""
from __future__ import annotations

import json
import logging
import re as _re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from mysql_storage import get_storage, scoped_document_id

log = logging.getLogger("version_manager")

# Maximum versions per step
MAX_VERSIONS_PER_STEP = 5

# Steps that support version history
VERSIONED_STEPS = ("step2", "step3", "step4", "step5")


def _validate_step(step: str) -> str:
    """Validate step is in allowed set."""
    if step not in VERSIONED_STEPS:
        raise ValueError(f"Invalid step: {step!r}, must be one of {VERSIONED_STEPS}")
    return step


def _validate_version_id(version_id: str) -> str:
    """Validate version_id format (v + digits only)."""
    if not _re.match(r"^v\d{1,4}$", version_id):
        raise ValueError(f"Invalid version_id: {version_id!r}")
    return version_id


def _validate_project_id(project_id: str) -> str:
    """Validate project_id contains only safe characters."""
    if not _re.match(r"^[a-zA-Z0-9_-]+$", project_id):
        raise ValueError(f"Invalid project_id: {project_id!r}")
    return project_id

PROJECTS_DIR = Path("storage/projects")


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _now_ts() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")


def _version_doc_type(step: str) -> str:
    _validate_step(step)
    return f"version_{step}"


def _version_doc_id(project_id: str, version_id: str) -> str:
    return scoped_document_id(project_id, version_id)


class VersionManager:
    """
    Manage version history for workflow steps.

    Storage layout:
      storage/projects/{project_id}/versions/{step}/v{num}_{timestamp}.json
    """

    def __init__(self, projects_dir: str | Path | None = None):
        self.projects_dir = Path(projects_dir) if projects_dir else PROJECTS_DIR

    def _versions_dir(self, project_id: str, step: str, create: bool = True) -> Path:
        _validate_project_id(project_id)
        _validate_step(step)
        d = self.projects_dir / project_id / "versions" / step
        if create:
            d.mkdir(parents=True, exist_ok=True)
        return d

    def _next_version_num(self, project_id: str, step: str) -> int:
        """Get the next version number for a step."""
        records = get_storage().list_document_records(
            _version_doc_type(step),
            project_id=project_id,
            newest_first=False,
        )
        nums: list[int] = []
        for record in records:
            version_id = (
                record.get("data", {}).get("version_id")
                or record["doc_id"].rsplit(":", 1)[-1]
            )
            try:
                nums.append(int(str(version_id).lstrip("v")))
            except ValueError:
                continue
        return max(nums, default=0) + 1

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def save_version(
        self,
        project_id: str,
        step: str,
        data: dict[str, Any],
        trigger: str = "auto",
        label: str | None = None,
    ) -> dict[str, Any]:
        """
        Save a version snapshot.

        Args:
            project_id: Project ID
            step: Step name (step2, step3, step4, step5)
            data: The data to snapshot
            trigger: What triggered the save (regenerate, ai_chat_modify, manual_save, before_restore)
            label: Optional human-readable label

        Returns:
            Version metadata dict
        """
        version_num = self._next_version_num(project_id, step)
        version_id = f"v{version_num:03d}"

        version_doc: dict[str, Any] = {
            "version_id": version_id,
            "step": step,
            "project_id": project_id,
            "created_at": _now_iso(),
            "trigger": trigger,
            "label": label,
            "data": data,
        }

        get_storage().upsert_document(
            _version_doc_type(step),
            _version_doc_id(project_id, version_id),
            version_doc,
            project_id=project_id,
            parent_id=project_id,
            status=trigger,
            title=label or version_id,
            created_at=version_doc["created_at"],
            updated_at=version_doc["created_at"],
        )

        log.info(f"版本已保存: {version_id} (step={step}, trigger={trigger})")

        # Enforce max versions
        self._cleanup_old_versions(project_id, step)

        return {
            "version_id": version_id,
            "created_at": version_doc["created_at"],
            "trigger": trigger,
            "label": label,
        }

    def list_versions(
        self,
        project_id: str,
        step: str,
    ) -> dict[str, Any]:
        """
        List all versions for a step, newest first.

        Returns:
            {
                "step": step,
                "versions": [...],
                "max_versions": MAX_VERSIONS_PER_STEP
            }
        """
        versions: list[dict[str, Any]] = []

        for record in get_storage().list_document_records(
            _version_doc_type(step),
            project_id=project_id,
        ):
            doc = record.get("data", {})
            preview = self._build_preview(doc.get("data", {}), step)
            versions.append(
                {
                    "version_id": doc.get("version_id", record["doc_id"].rsplit(":", 1)[-1]),
                    "created_at": doc.get("created_at", ""),
                    "trigger": doc.get("trigger", "unknown"),
                    "label": doc.get("label"),
                    "preview": preview,
                }
            )

        return {
            "step": step,
            "versions": versions,
            "max_versions": MAX_VERSIONS_PER_STEP,
        }

    def get_version(
        self,
        project_id: str,
        step: str,
        version_id: str,
    ) -> dict[str, Any] | None:
        """
        Get full version data.

        Returns version doc or None.
        """
        _validate_version_id(version_id)
        doc = get_storage().get_document(
            _version_doc_type(step),
            _version_doc_id(project_id, version_id),
        )
        if doc is not None:
            return doc

        for record in get_storage().list_document_records(
            _version_doc_type(step),
            project_id=project_id,
        ):
            doc = record.get("data", {})
            if doc.get("version_id") == version_id or record["doc_id"] == version_id:
                return doc
        return None

    def restore_version(
        self,
        project_id: str,
        step: str,
        version_id: str,
        current_data: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        """
        Restore a version.

        Before restoring, auto-saves current state as a new version
        with trigger="before_restore".

        Returns:
            {"message": "已恢复到 vXXX", "auto_saved_as": "vYYY", "data": restored_data}
            or None if version not found.
        """
        # Get the version to restore
        version_doc = self.get_version(project_id, step, version_id)
        if version_doc is None:
            return None

        # Auto-save current state before restoring
        auto_saved: dict[str, Any] | None = None
        if current_data:
            auto_saved = self.save_version(
                project_id=project_id,
                step=step,
                data=current_data,
                trigger="before_restore",
                label=f"自动备份 (恢复 {version_id} 前)",
            )

        restored_data = version_doc.get("data", {})

        result: dict[str, Any] = {
            "message": f"已恢复到 {version_id}",
            "data": restored_data,
        }
        if auto_saved:
            result["auto_saved_as"] = auto_saved["version_id"]

        log.info(f"版本已恢复: {version_id} (step={step})")
        return result

    def delete_version(
        self,
        project_id: str,
        step: str,
        version_id: str,
    ) -> bool:
        """Delete a specific version."""
        _validate_version_id(version_id)
        doc_id = _version_doc_id(project_id, version_id)
        storage = get_storage()
        record = storage.get_document_record(_version_doc_type(step), doc_id)
        if record is None:
            for candidate in storage.list_document_records(
                _version_doc_type(step),
                project_id=project_id,
            ):
                doc = candidate.get("data", {})
                if doc.get("version_id") == version_id or candidate["doc_id"] == version_id:
                    record = candidate
                    break
        if record is not None:
            storage.delete_document(_version_doc_type(step), record["doc_id"])
            log.info(f"版本已删除: {version_id} (step={step})")
            return True

        return False

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _cleanup_old_versions(self, project_id: str, step: str) -> int:
        """Remove oldest versions beyond MAX_VERSIONS_PER_STEP."""
        records = get_storage().list_document_records(
            _version_doc_type(step),
            project_id=project_id,
            newest_first=False,
        )
        if len(records) <= MAX_VERSIONS_PER_STEP:
            return 0

        to_delete = records[: len(records) - MAX_VERSIONS_PER_STEP]
        for record in to_delete:
            get_storage().delete_document(_version_doc_type(step), record["doc_id"])

        deleted = len(to_delete)
        log.info(f"已清理 {deleted} 个旧版本 (step={step})")
        return deleted

    @staticmethod
    def _build_preview(data: dict[str, Any], step: str) -> dict[str, Any]:
        """Build a lightweight preview of version data."""
        preview: dict[str, Any] = {}

        if step == "step3":
            # Script analysis
            characters = data.get("characters", [])
            scenes = data.get("scenes", [])
            episodes = data.get("episodes", [])
            shots_count = 0
            for ep in episodes:
                for beat in ep.get("beats", []):
                    shots_count += len(beat.get("suggested_shots", []))
                if shots_count == 0:  # fallback: old schema
                    for sc in ep.get("scenes", []):
                        shots_count += len(sc.get("shots", []))
            preview = {
                "characters_count": len(characters),
                "scenes_count": len(scenes),
                "shots_count": shots_count,
            }

        elif step == "step4":
            # Character assets
            characters = data.get("characters", [])
            assets_done = sum(
                1
                for c in characters
                if c.get("status") == "done"
            )
            preview = {
                "characters_count": len(characters),
                "assets_done": assets_done,
            }

        elif step == "step5":
            # Storyboard + video
            panels = data.get("panels", [])
            shots = data.get("shots", [])
            done_panels = sum(1 for p in panels if p.get("status") == "done")
            done_videos = sum(1 for s in shots if s.get("video_url"))
            preview = {
                "panels_count": len(panels),
                "panels_done": done_panels,
                "videos_count": len(shots),
                "videos_done": done_videos,
            }

            # Post production info
            pp = data.get("post_production", {})
            if pp.get("final_output"):
                preview["has_final_output"] = True

        elif step == "step2":
            # Style config
            sc = data.get("style_config", {})
            preview = {
                "art_style": sc.get("art_style", ""),
                "art_substyle": sc.get("art_substyle", ""),
                "aspect_ratio": sc.get("aspect_ratio", ""),
            }

        return preview
