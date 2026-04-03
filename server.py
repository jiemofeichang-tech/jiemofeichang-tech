#!/usr/bin/env python3
import base64
import hashlib
import json
import mimetypes
import os
import re as _re_mod
import secrets
import shutil
import subprocess
import sys
import threading
from datetime import datetime, timedelta
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import error, parse, request

import pymysql
from mysql_storage import create_storage, migrate_legacy_storage, scoped_document_id

# ---------------------------------------------------------------------------
# Workflow modules (lazy-loaded; server starts even if these are missing)
# ---------------------------------------------------------------------------

_script_engine = None
_character_factory = None

def _get_workflow_engines():
    """Lazy-load workflow engines so startup doesn't fail if modules missing."""
    global _script_engine, _character_factory
    if _script_engine is None:
        try:
            from script_engine import ScriptEngine
            from character_factory import CharacterFactory
            cfg = _load_workflow_config()
            _script_engine = ScriptEngine(cfg)
            _character_factory = CharacterFactory(cfg)
        except Exception as exc:
            print(f"[workflow] Failed to load engines: {exc}")
    return _script_engine, _character_factory

def _load_workflow_config():
    """Build a config dict for workflow engines from STATE / env."""
    return {
        "api_key": get_api_key() or "",
        "base_url": STATE.get("ai_chat_base") or AI_CHAT_BASE,
        "ai_chat_base": STATE.get("ai_chat_base") or AI_CHAT_BASE,
        "ai_chat_key": get_ai_chat_key() or "",
        "image_api_url": STATE.get("ai_image_base") or AI_IMAGE_BASE,
        "image_api_key": get_api_key() or "",
        "model": STATE.get("ai_chat_model") or "gemini-2.5-pro",
        "ai_image_base": STATE.get("ai_image_base") or AI_IMAGE_BASE,
        "ai_image_model": STATE.get("ai_image_model") or "nano-banana-pro-preview",
        "gemini_api_key": STATE.get("gemini_api_key") or "",
    }

# ---------------------------------------------------------------------------

HOST = "127.0.0.1"
PORT = 8787
UPSTREAM_BASE = "http://zlhub.xiaowaiyou.cn/zhonglian/api/v1/proxy/ark/contents/generations/tasks"
AI_CHAT_BASE = "http://peiqian.icu/v1/chat/completions"
AI_IMAGE_BASE = "http://zlhub.xiaowaiyou.cn/zhonglian/api/v1/proxy/chat/completions"
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"
# 出站 HTTP 代理（zlhub 需要通过本地代理访问）
OUTBOUND_PROXY = os.environ.get("OUTBOUND_PROXY", "http://127.0.0.1:7897")
CORS_ORIGIN = os.environ.get("CORS_ORIGIN", "http://127.0.0.1:3001")
CORS_ORIGINS = {CORS_ORIGIN, "http://localhost:3001", "http://127.0.0.1:3001"}
STATIC_DIR = Path(__file__).resolve().parent
INDEX_FILE = STATIC_DIR / "index.html"
APP_JS_FILE = STATIC_DIR / "app.js"
STYLES_FILE = STATIC_DIR / "styles.css"
LOCAL_CONFIG_FILE = STATIC_DIR / ".local-secrets.json"
STORAGE_DIR = STATIC_DIR / "storage"
VIDEO_DIR = STORAGE_DIR / "videos"
PROJECTS_DIR = STORAGE_DIR / "projects"
MANIFEST_FILE = STORAGE_DIR / "manifest.json"


# ---------------------------------------------------------------------------
# 安全校验工具
# ---------------------------------------------------------------------------

_SAFE_NAME_RE = _re_mod.compile(r"^[a-zA-Z0-9_\-]+$")
_SAFE_FILENAME_RE = _re_mod.compile(r"^v\d{3}_[\dT]+\.json$")
_UPSTREAM_TASK_ID_RE = _re_mod.compile(r"^[a-z]{3}-\d{14}-[a-z0-9]{4,}$", _re_mod.IGNORECASE)


def _is_safe_id(name: str) -> bool:
    """校验 project_id 等 ID 不含路径穿越字符。"""
    return bool(name) and ".." not in name and _SAFE_NAME_RE.fullmatch(name) is not None


def _is_safe_version_filename(name: str) -> bool:
    """校验版本快照文件名格式 (v001_20260329T120000.json)。"""
    if not name or ".." in name or "/" in name or "\\" in name:
        return False
    return _SAFE_FILENAME_RE.fullmatch(name) is not None


def _looks_like_upstream_task_id(task_id: str) -> bool:
    """Only query the upstream task API for ids that match the provider format."""
    return bool(task_id) and _UPSTREAM_TASK_ID_RE.fullmatch(task_id) is not None


def ensure_storage():
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)


def ensure_project_dir(project_id):
    project_dir = PROJECTS_DIR / project_id
    (project_dir / "assets").mkdir(parents=True, exist_ok=True)
    (project_dir / "output").mkdir(parents=True, exist_ok=True)
    return project_dir


def load_project(project_id):
    return DOCUMENT_STORAGE.get_document("project", project_id)


def persist_project(project_id, data):
    ensure_project_dir(project_id)
    data["updated_at"] = now_iso()
    DOCUMENT_STORAGE.upsert_document(
        "project",
        project_id,
        data,
        project_id=project_id,
        status=data.get("status"),
        title=data.get("title"),
    )
    return data


# ---------------------------------------------------------------------------
# Step 3 剧本解析版本历史
# ---------------------------------------------------------------------------

MAX_STEP3_VERSIONS = 10
MAX_STEP4_VERSIONS = 5


def _list_snapshot_records(doc_type: str, project_id: str) -> list[dict]:
    return DOCUMENT_STORAGE.list_document_records(doc_type, project_id=project_id, newest_first=False)


def _next_snapshot_number(doc_type: str, project_id: str) -> int:
    max_ver = 0
    for record in _list_snapshot_records(doc_type, project_id):
        data = record.get("data", {})
        try:
            max_ver = max(max_ver, int(data.get("version", 0)))
        except (TypeError, ValueError):
            continue
    return max_ver + 1


def _trim_snapshot_records(doc_type: str, project_id: str, keep_count: int) -> None:
    records = _list_snapshot_records(doc_type, project_id)
    if len(records) < keep_count:
        return
    overflow = len(records) - keep_count + 1
    for record in records[:overflow]:
        data = record.get("data", {})
        snapshot_assets_dir = data.get("snapshot_assets_dir")
        if snapshot_assets_dir:
            shutil.rmtree(snapshot_assets_dir, ignore_errors=True)
        DOCUMENT_STORAGE.delete_document(doc_type, record["doc_id"])


def _snapshot_doc_id(project_id: str, filename: str) -> str:
    return scoped_document_id(project_id, filename)


def _load_project_snapshot(doc_type: str, project_id: str, filename: str) -> dict | None:
    snapshot = DOCUMENT_STORAGE.get_document(doc_type, _snapshot_doc_id(project_id, filename))
    if snapshot is not None:
        return snapshot
    for record in DOCUMENT_STORAGE.list_document_records(doc_type, project_id=project_id):
        data = record.get("data", {})
        if data.get("filename") == filename or record["doc_id"] == filename:
            return data
    return None


def create_step3_snapshot(project_id: str, reason: str) -> dict | None:
    """创建 Step 3 剧本解析快照，上限 MAX_STEP3_VERSIONS 个。"""
    if not _is_safe_id(project_id):
        return None
    project = load_project(project_id)
    if not project:
        return None

    analysis = (project.get("script") or {}).get("analysis")
    if not analysis:
        return None

    version_num = _next_snapshot_number("step3_snapshot", project_id)
    _trim_snapshot_records("step3_snapshot", project_id, MAX_STEP3_VERSIONS)
    ts = now_iso().replace(" ", "T").replace(":", "").replace("-", "")
    filename = f"v{version_num:03d}_{ts}.json"

    char_count = len(analysis.get("characters", []))
    scene_count = len(analysis.get("scenes", []))
    # Count shots: new schema uses beats[].suggested_shots[], old uses scenes[].shots[]
    shot_count = 0
    for ep in analysis.get("episodes", []):
        for beat in ep.get("beats", []):
            shot_count += len(beat.get("suggested_shots", []))
        if shot_count == 0:
            for sc in ep.get("scenes", []):
                shot_count += len(sc.get("shots", []))

    snapshot = {
        "version": version_num,
        "timestamp": now_iso(),
        "reason": reason,
        "filename": filename,
        "analysis": analysis,
        "summary": f"{char_count} 角色, {scene_count} 场景, {shot_count} 分镜",
    }
    DOCUMENT_STORAGE.upsert_document(
        "step3_snapshot",
        _snapshot_doc_id(project_id, filename),
        snapshot,
        project_id=project_id,
        parent_id=project_id,
        status="snapshot",
        title=reason,
        created_at=snapshot["timestamp"],
        updated_at=snapshot["timestamp"],
    )
    return snapshot


def list_step3_versions(project_id: str) -> list[dict]:
    if not _is_safe_id(project_id):
        return []
    versions = []
    for record in DOCUMENT_STORAGE.list_document_records("step3_snapshot", project_id=project_id):
        data = record.get("data", {})
        versions.append({
            "version": data.get("version"),
            "timestamp": data.get("timestamp"),
            "reason": data.get("reason"),
            "summary": data.get("summary", ""),
            "filename": data.get("filename") or record["doc_id"],
        })
    return versions


def restore_step3_version(project_id: str, version_filename: str) -> dict | None:
    if not _is_safe_id(project_id):
        return None
    if not _is_safe_version_filename(version_filename):
        return None
    snapshot = _load_project_snapshot("step3_snapshot", project_id, version_filename)
    if not snapshot:
        return None
    analysis = snapshot.get("analysis")
    if not analysis:
        return None

    project = load_project(project_id)
    if project:
        script = project.get("script", {})
        script["analysis"] = analysis
        project["script"] = script
        project["status"] = "script_parsed"
        project["updated_at"] = now_iso()
        persist_project(project_id, project)
    return project


# ---------------------------------------------------------------------------
# Step 4 版本历史
# ---------------------------------------------------------------------------

def create_step4_snapshot(project_id: str, reason: str) -> dict | None:
    if not _is_safe_id(project_id):
        return None
    project_dir = PROJECTS_DIR / project_id
    project = load_project(project_id)
    if not project:
        return None

    versions_dir = project_dir / "versions" / "step4"
    versions_dir.mkdir(parents=True, exist_ok=True)
    version_num = _next_snapshot_number("step4_snapshot", project_id)
    _trim_snapshot_records("step4_snapshot", project_id, MAX_STEP4_VERSIONS)

    ts = now_iso().replace(" ", "T").replace(":", "").replace("-", "")
    snapshot_name = f"v{version_num:03d}_{ts}"
    snapshot_assets_dir = versions_dir / f"{snapshot_name}_assets"
    snapshot_assets_dir.mkdir(parents=True, exist_ok=True)

    # 复制当前资产图片到版本目录
    assets_dir = project_dir / "assets"
    copied_files: list[str] = []
    if assets_dir.exists():
        for f in assets_dir.iterdir():
            if f.is_file() and f.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp"):
                shutil.copy2(f, snapshot_assets_dir / f.name)
                copied_files.append(f.name)

    # 保存快照元数据
    snapshot = {
        "version": version_num,
        "timestamp": now_iso(),
        "reason": reason,
        "filename": f"{snapshot_name}.json",
        "snapshot_assets_dir": str(snapshot_assets_dir),
        "characters": project.get("characters", []),
        "scenes": project.get("scenes", []),
        "asset_files": copied_files,
    }
    DOCUMENT_STORAGE.upsert_document(
        "step4_snapshot",
        _snapshot_doc_id(project_id, snapshot["filename"]),
        snapshot,
        project_id=project_id,
        parent_id=project_id,
        status="snapshot",
        title=reason,
        created_at=snapshot["timestamp"],
        updated_at=snapshot["timestamp"],
    )
    return snapshot


def list_step4_versions(project_id: str) -> list[dict]:
    if not _is_safe_id(project_id):
        return []
    versions = []
    for record in DOCUMENT_STORAGE.list_document_records("step4_snapshot", project_id=project_id):
        data = record.get("data", {})
        char_count = len(data.get("characters", []))
        scene_count = len(data.get("scenes", []))
        asset_count = len(data.get("asset_files", []))
        versions.append({
            "version": data.get("version"),
            "timestamp": data.get("timestamp"),
            "reason": data.get("reason"),
            "summary": f"{char_count} 角色, {scene_count} 场景, {asset_count} 张图",
            "filename": data.get("filename") or record["doc_id"],
        })
    return versions


def restore_step4_version(project_id: str, version_filename: str) -> dict | None:
    if not _is_safe_id(project_id):
        return None
    if not _is_safe_version_filename(version_filename):
        return None
    project_dir = PROJECTS_DIR / project_id
    snapshot = _load_project_snapshot("step4_snapshot", project_id, version_filename)
    if not snapshot:
        return None

    create_step4_snapshot(project_id, "恢复前自动备份")

    snapshot_name = version_filename.replace(".json", "")
    snapshot_assets_dir = Path(
        snapshot.get("snapshot_assets_dir")
        or (project_dir / "versions" / "step4" / f"{snapshot_name}_assets")
    )
    assets_dir = project_dir / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    for existing_file in assets_dir.iterdir():
        if existing_file.is_file() and existing_file.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp"):
            existing_file.unlink(missing_ok=True)

    if snapshot_assets_dir.exists():
        for f in snapshot_assets_dir.iterdir():
            if f.is_file():
                shutil.copy2(f, assets_dir / f.name)

    project = load_project(project_id)
    if project:
        project["characters"] = snapshot.get("characters", [])
        project["scenes"] = snapshot.get("scenes", [])
        project["status"] = "designing"  # 回退到未锁定状态
        persist_project(project_id, project)

    return project


def list_projects():
    projects = []
    for data in DOCUMENT_STORAGE.list_documents("project"):
        projects.append({
            "id": data.get("id", ""),
            "title": data.get("title", ""),
            "status": data.get("status", "draft"),
            "created_at": data.get("created_at", ""),
            "updated_at": data.get("updated_at", ""),
            "genre": data.get("script", {}).get("analysis", {}).get("genre", "") if data.get("script", {}).get("analysis") else "",
            "character_count": len(data.get("characters", [])),
            "episode_count": len(data.get("episodes", [])),
        })
    return sorted(projects, key=lambda p: p.get("updated_at", ""), reverse=True)


def delete_project(project_id):
    DOCUMENT_STORAGE.delete_documents_for_project(project_id)
    project_dir = PROJECTS_DIR / project_id
    if project_dir.exists():
        shutil.rmtree(project_dir)
        return True
    return False


def generate_project_id():
    import time
    import random
    ts = time.strftime("%Y%m%d%H%M%S")
    rand = "".join(random.choices("abcdefghijklmnopqrstuvwxyz0123456789", k=5))
    return f"proj-{ts}-{rand}"


def download_image_to_project(url, project_id, filename=None):
    """Download an image from URL and save to project assets directory."""
    project_dir = ensure_project_dir(project_id)
    if not filename:
        ext = splitext_from_url(url)
        if ext not in (".png", ".jpg", ".jpeg", ".webp"):
            ext = ".png"
        import time
        filename = f"img-{int(time.time() * 1000)}{ext}"
    target = project_dir / "assets" / filename
    _opener = request.build_opener(request.ProxyHandler({}))
    with _opener.open(url, timeout=120) as response, target.open("wb") as output:
        while True:
            chunk = response.read(1024 * 256)
            if not chunk:
                break
            output.write(chunk)
    return {
        "filename": filename,
        "local_path": str(target),
        "asset_url": f"/api/projects/{project_id}/assets/{filename}",
    }


def load_local_config():
    if not LOCAL_CONFIG_FILE.exists():
        return {}
    try:
        return json.loads(LOCAL_CONFIG_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def persist_local_config(config):
    LOCAL_CONFIG_FILE.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        os.chmod(LOCAL_CONFIG_FILE, 0o600)
    except OSError:
        pass


def load_manifest():
    ensure_storage()
    return {
        "tasks": sort_tasks(DOCUMENT_STORAGE.list_documents("task")),
        "assets": sorted(DOCUMENT_STORAGE.list_documents("asset"), key=lambda item: item.get("saved_at", ""), reverse=True),
        "trash_tasks": sort_tasks(DOCUMENT_STORAGE.list_documents("trash_task")),
        "trash_assets": sorted(DOCUMENT_STORAGE.list_documents("trash_asset"), key=lambda item: item.get("trashed_at", ""), reverse=True),
    }


def persist_manifest(data):
    ensure_storage()
    DOCUMENT_STORAGE.replace_collection("task", data.get("tasks", []), key_field="id")
    DOCUMENT_STORAGE.replace_collection("asset", data.get("assets", []), key_field="task_id")
    DOCUMENT_STORAGE.replace_collection("trash_task", data.get("trash_tasks", []), key_field="id")
    DOCUMENT_STORAGE.replace_collection("trash_asset", data.get("trash_assets", []), key_field="task_id")


LOCAL_CONFIG = load_local_config()
ensure_storage()
DOCUMENT_STORAGE = create_storage(local_config_path=LOCAL_CONFIG_FILE, base_dir=STATIC_DIR)

STATE = {
    "api_key": os.environ.get("VIDEO_MODEL_API_KEY", LOCAL_CONFIG.get("api_key", "")).strip(),
    "user_id": str(LOCAL_CONFIG.get("user_id", "")).strip(),
    "default_model": str(LOCAL_CONFIG.get("default_model", "")).strip(),
    "auto_save": bool(LOCAL_CONFIG.get("auto_save", True)),
    "ai_chat_base": LOCAL_CONFIG.get("ai_chat_base", AI_CHAT_BASE),
    "ai_chat_key": LOCAL_CONFIG.get("ai_chat_key", ""),
    "ai_image_base": LOCAL_CONFIG.get("ai_image_base", AI_IMAGE_BASE),
    "ai_chat_model": LOCAL_CONFIG.get("ai_chat_model", "gemini-2.5-pro"),
    "ai_image_model": LOCAL_CONFIG.get("ai_image_model", "nano-banana-pro-preview"),
    "gemini_api_key": LOCAL_CONFIG.get("gemini_api_key", ""),
    "ai_video_base": LOCAL_CONFIG.get("ai_video_base", GEMINI_BASE),
    "ai_video_model": LOCAL_CONFIG.get("ai_video_model", "veo-2.0-generate-001"),
    "jimeng_access_key": LOCAL_CONFIG.get("jimeng_access_key", ""),
    "jimeng_secret_key": LOCAL_CONFIG.get("jimeng_secret_key", ""),
    "ai_video_provider": LOCAL_CONFIG.get("ai_video_provider", ""),
}


def get_api_key():
    return (STATE.get("api_key") or "").strip()


def get_ai_chat_key() -> str:
    """AI 聊天请求优先使用 ai_chat_key，回退到通用 api_key。"""
    return (STATE.get("ai_chat_key") or get_api_key() or "").strip()


# ---------------------------------------------------------------------------
# Async image job queue — avoids Next.js proxy timeout on slow generations
# ---------------------------------------------------------------------------

_image_jobs: dict = {}          # job_id → {"status": "pending"|"done"|"error", "result": ..., "error": ...}
_image_jobs_lock = threading.Lock()


def _run_image_job(job_id: str, data: dict, api_key: str, project_id, asset_filename, image_url: str):
    """Background worker: calls upstream, downloads, writes job result."""
    try:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        req = request.Request(image_url, data=body, headers=headers, method="POST")
        opener = request.build_opener(request.ProxyHandler({}))
        try:
            with opener.open(req, timeout=300) as response:
                raw = response.read()
                status = response.status
        except error.HTTPError as exc:
            raw = exc.read()
            status = exc.code
        except error.URLError as exc:
            with _image_jobs_lock:
                _image_jobs[job_id] = {"status": "error", "error": f"图像生成请求失败: {exc.reason}"}
            return

        try:
            result = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            result = {"raw": raw.decode("utf-8", errors="replace")}

        if project_id and status < 400:
            saved_assets = []
            images = result.get("data", [])
            for i, img in enumerate(images):
                img_url = img.get("url")
                if img_url:
                    fname = asset_filename or f"gen-{i}"
                    if not fname.endswith((".png", ".jpg", ".jpeg", ".webp")):
                        fname += ".png"
                    try:
                        asset_info = download_image_to_project(img_url, project_id, fname)
                        saved_assets.append(asset_info)
                    except Exception as exc:
                        saved_assets.append({"error": str(exc), "url": img_url})
            result["saved_assets"] = saved_assets

        with _image_jobs_lock:
            if status >= 400:
                _image_jobs[job_id] = {"status": "error", "error": result.get("error", {}).get("message", str(result)), "result": result}
            else:
                _image_jobs[job_id] = {"status": "done", "result": result}
    except Exception as exc:
        with _image_jobs_lock:
            _image_jobs[job_id] = {"status": "error", "error": str(exc)}


# ---------------------------------------------------------------------------
# Gemini API helpers (Imagen for images, Veo for videos)
# ---------------------------------------------------------------------------

def _get_gemini_key() -> str:
    """Return Gemini API key from config, or empty string."""
    return (STATE.get("gemini_api_key") or "").strip()


def _is_gemini_mode() -> bool:
    """Check if Gemini API key is configured."""
    return bool(_get_gemini_key())


def _gemini_request(url: str, payload: dict | None = None, method: str = "POST", timeout: int = 300):
    """Make a request to Gemini API with key auth."""
    key = _get_gemini_key()
    separator = "&" if "?" in url else "?"
    full_url = f"{url}{separator}key={key}"
    headers = {"Content-Type": "application/json"}
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload else None
    req = request.Request(full_url, data=body, headers=headers, method=method)
    # Gemini API is public, no need for local proxy
    opener = request.build_opener(request.ProxyHandler({}))
    with opener.open(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _gemini_generate_image(prompt: str, aspect_ratio: str = "1:1", count: int = 1, reference_images: list[dict] | None = None) -> list[dict]:
    """
    Call Gemini image generation API.
    Supports both:
      - Imagen models (predict endpoint) → returns predictions[].bytesBase64Encoded
      - generateContent models (nano-banana, gemini-*-image) → returns candidates[].content.parts[].inlineData
    reference_images: list of {"data": base64_str, "mimeType": "image/png"} for character anchoring.
    Returns list of {"bytesBase64Encoded": ..., "mimeType": ...}.
    """
    model = STATE.get("ai_image_model") or "nano-banana-pro-preview"
    base = STATE.get("ai_image_base") or GEMINI_BASE

    # Imagen models use predict endpoint
    if model.startswith("imagen"):
        url = f"{base}/models/{model}:predict"
        ratio_map = {
            "1024x1024": "1:1", "2k": "1:1",
            "1024x1536": "3:4", "1536x1024": "4:3",
            "9:16": "9:16", "16:9": "16:9", "1:1": "1:1",
            "3:4": "3:4", "4:3": "4:3",
        }
        gemini_ratio = ratio_map.get(aspect_ratio, aspect_ratio)
        if gemini_ratio not in ("1:1", "3:4", "4:3", "9:16", "16:9"):
            gemini_ratio = "1:1"
        payload = {
            "instances": [{"prompt": prompt}],
            "parameters": {
                "sampleCount": min(count, 4),
                "aspectRatio": gemini_ratio,
                "outputOptions": {"mimeType": "image/png"},
                "personGeneration": "allow_adult",
            },
        }
        result = _gemini_request(url, payload)
        return result.get("predictions", [])

    # generateContent models (nano-banana, gemini-*-image, etc.)
    url = f"{base}/models/{model}:generateContent"
    parts: list[dict] = []
    # Add reference images first (character turnaround sheets for anchoring)
    if reference_images:
        for ref in reference_images:
            parts.append({"inlineData": {"mimeType": ref.get("mimeType", "image/png"), "data": ref["data"]}})
        parts.append({"text": (
            "CRITICAL: The reference images above are the OFFICIAL character design turnaround sheets. "
            "You MUST strictly follow these references: "
            "1) Draw the EXACT same character(s) — identical face shape, eye style, hairstyle, hair color, skin tone, clothing design, and proportions. "
            "2) Match the EXACT same art style (e.g. if the reference is 3D cartoon/国风/anime, the output MUST be in the same style, NOT photorealistic or cinematic). "
            "3) The art style of the reference sheet takes absolute priority over any style keywords in the prompt. "
            f"Now generate this scene using the same art style as the reference sheets: {prompt}"
        )})
    else:
        parts.append({"text": prompt})
    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {"responseModalities": ["IMAGE"]},
    }
    result = _gemini_request(url, payload, timeout=300)

    # Extract inlineData from candidates
    images = []
    for candidate in result.get("candidates", []):
        for part in candidate.get("content", {}).get("parts", []):
            inline = part.get("inlineData")
            if inline and inline.get("data"):
                images.append({
                    "bytesBase64Encoded": inline["data"],
                    "mimeType": inline.get("mimeType", "image/png"),
                })
    return images


def _save_base64_image_to_project(b64_data: str, mime_type: str, project_id: str, filename: str | None = None) -> dict:
    """Save base64-encoded image data to project assets directory."""
    project_dir = ensure_project_dir(project_id)
    ext_map = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
    ext = ext_map.get(mime_type, ".png")
    if not filename:
        import time as _t
        filename = f"img-{int(_t.time() * 1000)}{ext}"
    elif not filename.endswith((".png", ".jpg", ".jpeg", ".webp")):
        filename += ext

    target = project_dir / "assets" / filename
    target.write_bytes(base64.b64decode(b64_data))

    return {
        "filename": filename,
        "local_path": str(target),
        "asset_url": f"/api/projects/{project_id}/assets/{filename}",
    }


def _run_gemini_image_job(job_id: str, prompt: str, aspect_ratio: str, project_id: str | None, asset_filename: str | None, reference_images: list[dict] | None = None):
    """Background worker for Gemini Imagen image generation."""
    try:
        import sys
        if reference_images:
            print(f"[gemini-image] 使用 {len(reference_images)} 张参考图生成, prompt={prompt[:80]}...", flush=True)
        else:
            print(f"[gemini-image] 纯文本生成, prompt={prompt[:80]}...", flush=True)
        sys.stdout.flush()
        predictions = _gemini_generate_image(prompt, aspect_ratio, reference_images=reference_images)
        if not predictions:
            with _image_jobs_lock:
                _image_jobs[job_id] = {"status": "error", "error": "Gemini Imagen 未返回任何图片"}
            return

        result: dict = {"data": []}
        saved_assets = []
        for i, pred in enumerate(predictions):
            b64 = pred.get("bytesBase64Encoded", "")
            mime = pred.get("mimeType", "image/png")
            if not b64:
                continue

            if project_id:
                fname = asset_filename or f"gen-{i}"
                try:
                    asset_info = _save_base64_image_to_project(b64, mime, project_id, fname)
                    saved_assets.append(asset_info)
                    result["data"].append({"url": asset_info["asset_url"]})
                except Exception as exc:
                    saved_assets.append({"error": str(exc)})
            else:
                # Return as data URI if no project context
                result["data"].append({"url": f"data:{mime};base64,{b64}"})

        if saved_assets:
            result["saved_assets"] = saved_assets

        with _image_jobs_lock:
            _image_jobs[job_id] = {"status": "done", "result": result}

    except Exception as exc:
        with _image_jobs_lock:
            _image_jobs[job_id] = {"status": "error", "error": f"Gemini 图像生成失败: {exc}"}


# ---------------------------------------------------------------------------
# 即梦 (Jimeng) API helpers — 火山引擎直连
# ---------------------------------------------------------------------------

def _get_jimeng_keys() -> tuple[str, str]:
    """Return (access_key, secret_key) from config."""
    ak = (STATE.get("jimeng_access_key") or "").strip()
    sk = (STATE.get("jimeng_secret_key") or "").strip()
    return ak, sk


def _is_jimeng_mode() -> bool:
    """Check if Jimeng API credentials are configured and video provider is set to jimeng."""
    ak, sk = _get_jimeng_keys()
    provider = (STATE.get("ai_video_provider") or "").strip().lower()
    return provider == "jimeng" and bool(ak) and bool(sk)


def _jimeng_request(action: str, body: dict, timeout: int = 300) -> dict:
    """Make a signed request to Volcengine visual API."""
    import hmac as _hmac
    import hashlib as _hashlib
    from datetime import datetime as _dt, timezone as _tz

    ak, sk = _get_jimeng_keys()
    if not ak or not sk:
        raise ValueError("即梦 Access Key 或 Secret Key 未配置")

    host = "visual.volcengineapi.com"
    endpoint = f"https://{host}"
    region = "cn-north-1"
    service = "cv"

    query_params = {"Action": action, "Version": "2022-08-31"}
    canonical_querystring = "&".join(f"{k}={v}" for k, v in sorted(query_params.items()))

    body_str = json.dumps(body, ensure_ascii=False)
    body_bytes = body_str.encode("utf-8")

    t = _dt.now(_tz.utc)
    current_date = t.strftime("%Y%m%dT%H%M%SZ")
    datestamp = t.strftime("%Y%m%d")

    payload_hash = _hashlib.sha256(body_bytes).hexdigest()
    signed_headers = "content-type;host;x-content-sha256;x-date"
    canonical_headers = (
        f"content-type:application/json\n"
        f"host:{host}\n"
        f"x-content-sha256:{payload_hash}\n"
        f"x-date:{current_date}\n"
    )
    canonical_request = (
        f"POST\n/\n{canonical_querystring}\n"
        f"{canonical_headers}\n{signed_headers}\n{payload_hash}"
    )

    credential_scope = f"{datestamp}/{region}/{service}/request"
    string_to_sign = (
        f"HMAC-SHA256\n{current_date}\n{credential_scope}\n"
        + _hashlib.sha256(canonical_request.encode("utf-8")).hexdigest()
    )

    def _sign(key: bytes, msg: str) -> bytes:
        return _hmac.new(key, msg.encode("utf-8"), _hashlib.sha256).digest()

    k_date = _sign(sk.encode("utf-8"), datestamp)
    k_region = _sign(k_date, region)
    k_service = _sign(k_region, service)
    k_signing = _sign(k_service, "request")
    signature = _hmac.new(k_signing, string_to_sign.encode("utf-8"), _hashlib.sha256).hexdigest()

    authorization = (
        f"HMAC-SHA256 Credential={ak}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )

    headers = {
        "Content-Type": "application/json",
        "Host": host,
        "X-Date": current_date,
        "X-Content-Sha256": payload_hash,
        "Authorization": authorization,
    }

    url = f"{endpoint}?{canonical_querystring}"
    req = request.Request(url, data=body_bytes, headers=headers, method="POST")
    opener = request.build_opener(request.ProxyHandler({}))
    with opener.open(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _jimeng_create_video_task(
    prompt: str,
    aspect_ratio: str = "16:9",
    duration: int = 5,
    image_b64: str | None = None,
    extra_images_b64: list[str] | None = None,
) -> dict:
    """Create a Jimeng 3.0 video generation task. Returns API response with task_id."""
    # 选择 req_key（即梦 3.0 1080p）
    if image_b64:
        req_key = "jimeng_i2v_first_v30_1080"
    else:
        req_key = "jimeng_t2v_v30_1080p"

    # frames: 121 ≈ 5s, 241 ≈ 10s
    frames = 241 if duration >= 8 else 121

    # 合法宽高比
    valid_ratios = {"16:9", "4:3", "1:1", "3:4", "9:16", "21:9"}
    if aspect_ratio not in valid_ratios:
        aspect_ratio = "16:9"

    body: dict = {
        "req_key": req_key,
        "prompt": prompt,
        "seed": -1,
        "frames": frames,
        "aspect_ratio": aspect_ratio,
    }
    if image_b64:
        # 首帧 + 可选的额外参考图（角色三视图）
        images = [image_b64]
        if extra_images_b64:
            images.extend(extra_images_b64[:2])  # 最多 3 张总计
        body["binary_data_base64"] = images
        print(f"[Jimeng] Passing {len(images)} images (1 first frame + {len(images)-1} reference)")

    print(f"[Jimeng] Creating task: req_key={req_key}, ratio={aspect_ratio}, frames={frames}")
    return _jimeng_request("CVSync2AsyncSubmitTask", body)


def _jimeng_poll_task(task_id: str, req_key: str) -> dict:
    """Poll a Jimeng task status. Returns API response."""
    body = {"req_key": req_key, "task_id": task_id}
    return _jimeng_request("CVSync2AsyncGetResult", body, timeout=30)


def _generate_jimeng_task_id() -> str:
    """Generate a local task ID for Jimeng tasks."""
    from datetime import datetime as _dt
    import random as _rnd
    ts = _dt.now().strftime("%Y%m%d%H%M%S")
    suffix = "".join(_rnd.choices("abcdefghijklmnopqrstuvwxyz0123456789", k=6))
    return f"jim-{ts}-{suffix}"


def _gemini_create_video_task(
    prompt: str,
    aspect_ratio: str = "16:9",
    duration: int = 8,
    image_b64: str | None = None,
    image_mime: str | None = None,
    model_override: str | None = None,
    reference_images: list | None = None,
) -> dict:
    """
    Call Gemini Veo API to start a video generation.
    Returns the operation object {"name": "operations/...", "done": false}.

    reference_images: list of {"b64": str, "mime": str} dicts for referenceImages (asset type).
    NOTE: image (first frame) and referenceImages cannot be used simultaneously.
    """
    model = model_override or STATE.get("ai_video_model") or "veo-3.1-generate-preview"
    base = STATE.get("ai_video_base") or GEMINI_BASE
    url = f"{base}/models/{model}:predictLongRunning"

    # Map aspect ratios
    ratio_map = {"adaptive": "16:9", "21:9": "16:9"}
    gemini_ratio = ratio_map.get(aspect_ratio, aspect_ratio)
    if gemini_ratio not in ("16:9", "9:16", "1:1"):
        gemini_ratio = "16:9"

    # Clamp duration to Gemini-supported range (5-8 seconds)
    gemini_duration = max(5, min(int(duration), 8))

    instance: dict = {"prompt": prompt}

    if image_b64 and image_mime:
        # 有首帧图 → 用 image 字段（不能同时用 referenceImages）
        instance["image"] = {
            "bytesBase64Encoded": image_b64,
            "mimeType": image_mime or "image/png",
        }
    elif reference_images:
        # 无首帧但有参考图 → 用 referenceImages（最多 3 张 asset 类型）
        ref_list = []
        for ref in reference_images[:3]:
            ref_list.append({
                "image": {
                    "bytesBase64Encoded": ref["b64"],
                    "mimeType": ref.get("mime", "image/png"),
                },
                "referenceType": "asset",
            })
        if ref_list:
            instance["referenceImages"] = ref_list
            print(f"[Gemini Veo] Injecting {len(ref_list)} reference images (asset type)")

    payload = {
        "instances": [instance],
        "parameters": {
            "aspectRatio": gemini_ratio,
            "personGeneration": "allow_adult",
            "durationSeconds": gemini_duration,
        },
    }

    return _gemini_request(url, payload)


def _gemini_poll_operation(operation_name: str) -> dict:
    """Poll a Gemini long-running operation. Returns operation status."""
    base = STATE.get("ai_video_base") or GEMINI_BASE
    url = f"{base}/{operation_name}"
    return _gemini_request(url, payload=None, method="GET", timeout=30)


def _generate_gemini_task_id() -> str:
    """Generate a task ID matching the upstream format for compatibility."""
    from datetime import datetime as _dt
    import random as _rnd
    ts = _dt.now().strftime("%Y%m%d%H%M%S")
    suffix = "".join(_rnd.choices("abcdefghijklmnopqrstuvwxyz0123456789", k=6))
    return f"gem-{ts}-{suffix}"


# ---------------------------------------------------------------------------
# Auth: Database helpers
# ---------------------------------------------------------------------------

_thread_local = threading.local()
AUTH_UNAVAILABLE_MESSAGE = "认证服务不可用，请检查 MySQL 是否已启动，并确认 .local-secrets.json 中的数据库配置正确。"


def load_db_config():
    cfg = load_local_config()
    return {
        "host": cfg.get("db_host", "127.0.0.1"),
        "port": int(cfg.get("db_port", 3306)),
        "user": cfg.get("db_user", "root"),
        "password": cfg.get("db_password", ""),
        "database": cfg.get("db_name", "seedance_studio"),
    }


def open_db_connection(database_name=None):
    cfg = load_db_config()
    kwargs = {
        "host": cfg["host"],
        "port": cfg["port"],
        "user": cfg["user"],
        "password": cfg["password"],
        "charset": "utf8mb4",
        "autocommit": True,
    }
    if database_name:
        kwargs["database"] = database_name
    return pymysql.connect(**kwargs)


def get_db():
    """Get a pymysql connection for the current thread (thread-local reuse)."""
    if not hasattr(_thread_local, "db") or _thread_local.db is None:
        _thread_local.db = open_db_connection(load_db_config()["database"])
    try:
        _thread_local.db.ping(reconnect=True)
    except Exception:
        _thread_local.db = None
        # 避免无限递归：只重试一次
        try:
            _thread_local.db = open_db_connection(load_db_config()["database"])
            _thread_local.db.ping(reconnect=False)
        except Exception as retry_exc:
            _thread_local.db = None
            raise ConnectionError("数据库连接失败，请检查配置") from retry_exc
    return _thread_local.db


def init_db():
    """Create users/sessions tables if they don't exist."""
    try:
        cfg = load_db_config()
        bootstrap_db = open_db_connection()
        with bootstrap_db.cursor() as cur:
            db_name = cfg["database"].replace("`", "``")
            cur.execute(
                f"CREATE DATABASE IF NOT EXISTS `{db_name}` "
                "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )
        bootstrap_db.close()
        _thread_local.db = None
        db = get_db()
        DOCUMENT_STORAGE.ensure_schema()
    except Exception as exc:
        print(f"[AUTH] 数据库连接失败: {exc}")
        print("[AUTH] 认证功能不可用，请检查 MySQL 和 .local-secrets.json 中的数据库配置。")
        return False
    with db.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(64) NOT NULL UNIQUE,
                password_hash VARCHAR(256) NOT NULL,
                salt VARCHAR(64) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                session_id VARCHAR(64) PRIMARY KEY,
                user_id INT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_expires (expires_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
    print("[AUTH] 数据库和认证表已就绪")
    try:
        summary = migrate_legacy_storage(DOCUMENT_STORAGE, STATIC_DIR)
        print(
            "[STORAGE] legacy import summary: "
            f"imported={summary.get('imported', 0)} "
            f"skipped={summary.get('skipped', 0)} "
            f"errors={summary.get('errors', 0)}"
        )
    except Exception as exc:
        print(f"[STORAGE] legacy import failed: {exc}")
    return True


DB_AVAILABLE = False  # set to True after successful init_db()
FILE_AUTH_SESSIONS = {}
FILE_AUTH_LOCK = threading.Lock()


def is_file_auth_enabled():
    cfg = load_local_config()
    return bool(cfg.get("use_file_auth"))


def list_file_auth_users(config=None):
    cfg = config if isinstance(config, dict) else load_local_config()
    users = []

    demo_user = cfg.get("demo_user")
    if isinstance(demo_user, dict):
        username = str(demo_user.get("username", "")).strip()
        if username:
            users.append(
                {
                    "id": 1,
                    "username": username,
                    "password": str(demo_user.get("password", "")),
                    "password_hash": demo_user.get("password_hash"),
                    "salt": demo_user.get("salt"),
                }
            )

    auth_users = cfg.get("auth_users", [])
    if not isinstance(auth_users, list):
        auth_users = []

    next_id = 2
    for entry in auth_users:
        if not isinstance(entry, dict):
            continue
        username = str(entry.get("username", "")).strip()
        if not username:
            continue
        user_id = entry.get("id")
        try:
            user_id = int(user_id)
        except (TypeError, ValueError):
            user_id = next_id
        next_id = max(next_id, user_id + 1)
        users.append(
            {
                "id": user_id,
                "username": username,
                "password": str(entry.get("password", "")),
                "password_hash": entry.get("password_hash"),
                "salt": entry.get("salt"),
            }
        )

    return users


def find_file_auth_user(username, config=None):
    username_key = str(username or "").strip().casefold()
    if not username_key:
        return None
    for user in list_file_auth_users(config):
        if user["username"].casefold() == username_key:
            return user
    return None


def verify_file_auth_user(user, password):
    password_hash = user.get("password_hash")
    salt = user.get("salt")
    if password_hash and salt:
        return verify_password(password, password_hash, salt)
    stored_password = user.get("password")
    if stored_password is None:
        return False
    return secrets.compare_digest(str(stored_password), str(password))


def create_file_auth_user(username, password):
    cfg = load_local_config()
    if find_file_auth_user(username, cfg):
        raise ValueError("duplicate user")

    auth_users = cfg.get("auth_users", [])
    if not isinstance(auth_users, list):
        auth_users = []

    next_id = max((user["id"] for user in list_file_auth_users(cfg)), default=0) + 1
    password_hash, salt = hash_password(password)
    auth_users.append(
        {
            "id": next_id,
            "username": username,
            "password_hash": password_hash,
            "salt": salt,
            "created_at": now_iso(),
        }
    )
    cfg["auth_users"] = auth_users
    persist_local_config(cfg)
    return {"id": next_id, "username": username, "password_hash": password_hash, "salt": salt}


def prune_file_auth_sessions():
    now = datetime.now()
    expired = [sid for sid, session in FILE_AUTH_SESSIONS.items() if session["expires_at"] <= now]
    for sid in expired:
        FILE_AUTH_SESSIONS.pop(sid, None)


# ---------------------------------------------------------------------------
# Auth: Password hashing
# ---------------------------------------------------------------------------

def hash_password(password: str):
    salt = secrets.token_hex(32)
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000)
    return hashed.hex(), salt


def verify_password(password: str, password_hash: str, salt: str) -> bool:
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000)
    return secrets.compare_digest(hashed.hex(), password_hash)


# ---------------------------------------------------------------------------
# Auth: Session helpers
# ---------------------------------------------------------------------------

SESSION_MAX_AGE = 7 * 24 * 3600  # 7 days in seconds


def create_session(user_id: int, username: str | None = None) -> str:
    session_id = secrets.token_hex(32)
    expires = datetime.now() + timedelta(seconds=SESSION_MAX_AGE)
    if not DB_AVAILABLE and is_file_auth_enabled():
        with FILE_AUTH_LOCK:
            prune_file_auth_sessions()
            FILE_AUTH_SESSIONS[session_id] = {
                "user_id": user_id,
                "username": username or "",
                "expires_at": expires,
            }
        return session_id
    db = get_db()
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO sessions (session_id, user_id, expires_at) VALUES (%s, %s, %s)",
            (session_id, user_id, expires),
        )
    return session_id


def validate_session(session_id: str):
    """Return (user_id, username) if session is valid, else None."""
    if not DB_AVAILABLE and is_file_auth_enabled():
        with FILE_AUTH_LOCK:
            prune_file_auth_sessions()
            session = FILE_AUTH_SESSIONS.get(session_id)
            if not session:
                return None
            return session["user_id"], session["username"]
    db = get_db()
    with db.cursor() as cur:
        cur.execute(
            "SELECT u.id, u.username FROM sessions s JOIN users u ON s.user_id = u.id "
            "WHERE s.session_id = %s AND s.expires_at > NOW()",
            (session_id,),
        )
        return cur.fetchone()


def delete_session(session_id: str):
    if not DB_AVAILABLE and is_file_auth_enabled():
        with FILE_AUTH_LOCK:
            FILE_AUTH_SESSIONS.pop(session_id, None)
        return
    db = get_db()
    with db.cursor() as cur:
        cur.execute("DELETE FROM sessions WHERE session_id = %s", (session_id,))


def now_iso():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def splitext_from_url(url):
    path = parse.urlparse(url).path
    suffix = Path(path).suffix.lower()
    return suffix if suffix else ".mp4"


def extract_video_urls(payload):
    matches = []

    def walk(node):
        if isinstance(node, dict):
            for key, value in node.items():
                if isinstance(value, str) and value.startswith("http"):
                    lower = value.lower()
                    if lower.endswith(".mp4") or "video" in key.lower():
                        matches.append(value)
                else:
                    walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(payload)
    return list(dict.fromkeys(matches))


def sanitize_payload_for_storage(payload):
    if isinstance(payload, dict):
        sanitized = {}
        for key, value in payload.items():
            if key == "url" and isinstance(value, str) and value.startswith("data:"):
                prefix, _, body = value.partition(",")
                sanitized[key] = f"{prefix},<omitted {len(body)} chars>"
            else:
                sanitized[key] = sanitize_payload_for_storage(value)
        return sanitized
    if isinstance(payload, list):
        return [sanitize_payload_for_storage(item) for item in payload]
    return payload


def sort_tasks(tasks):
    def normalize(value):
        if isinstance(value, (int, float)):
            return int(value)
        if isinstance(value, str):
            text = value.strip()
            if not text:
                return 0
            if text.isdigit():
                return int(text)
            try:
                return int(datetime.strptime(text, "%Y-%m-%d %H:%M:%S").timestamp())
            except ValueError:
                return 0
        return 0

    def key(record):
        updated = normalize(record.get("updated_at") or record.get("updatedAt") or record.get("tracked_at"))
        created = normalize(record.get("created_at") or record.get("createdAt"))
        return (updated, created)

    return sorted(tasks, key=key, reverse=True)


def upsert_task_record(record):
    manifest = load_manifest()
    tasks = manifest.get("tasks", [])
    existing_index = next((index for index, item in enumerate(tasks) if item.get("id") == record.get("id")), None)
    if existing_index is None:
        tasks.append(record)
    else:
        merged = tasks[existing_index]
        merged.update(record)
        tasks[existing_index] = merged
    manifest["tasks"] = sort_tasks(tasks)
    persist_manifest(manifest)
    return next(item for item in manifest["tasks"] if item.get("id") == record.get("id"))


def find_task_record(task_id):
    manifest = load_manifest()
    for item in manifest.get("tasks", []):
        if item.get("id") == task_id:
            return item
    return None


def list_task_records():
    manifest = load_manifest()
    return sort_tasks(manifest.get("tasks", []))


def list_assets():
    manifest = load_manifest()
    return sorted(manifest.get("assets", []), key=lambda item: item.get("saved_at", ""), reverse=True)


def save_asset_record(asset):
    manifest = load_manifest()
    assets = manifest.get("assets", [])
    existing_index = next((index for index, item in enumerate(assets) if item.get("task_id") == asset.get("task_id")), None)
    if existing_index is None:
        assets.append(asset)
    else:
        assets[existing_index].update(asset)
    manifest["assets"] = sorted(assets, key=lambda item: item.get("saved_at", ""), reverse=True)
    persist_manifest(manifest)


def trash_task(task_id):
    """Soft-delete a task: move from tasks to trash_tasks."""
    manifest = load_manifest()
    tasks = manifest.get("tasks", [])
    idx = next((i for i, t in enumerate(tasks) if t.get("id") == task_id), None)
    if idx is None:
        return False
    item = tasks.pop(idx)
    item["trashed_at"] = now_iso()
    manifest["tasks"] = tasks
    manifest.setdefault("trash_tasks", []).insert(0, item)
    persist_manifest(manifest)
    return True


def trash_asset(task_id):
    """Soft-delete a library asset: move from assets to trash_assets."""
    manifest = load_manifest()
    assets = manifest.get("assets", [])
    idx = next((i for i, a in enumerate(assets) if a.get("task_id") == task_id), None)
    if idx is None:
        return False
    item = assets.pop(idx)
    item["trashed_at"] = now_iso()
    manifest["assets"] = assets
    manifest.setdefault("trash_assets", []).insert(0, item)
    persist_manifest(manifest)
    return True


def list_trash():
    manifest = load_manifest()
    return {
        "tasks": manifest.get("trash_tasks", []),
        "assets": manifest.get("trash_assets", []),
    }


def restore_from_trash(item_type, item_id):
    """Restore an item from trash back to its original list."""
    manifest = load_manifest()
    if item_type == "task":
        trash = manifest.get("trash_tasks", [])
        idx = next((i for i, t in enumerate(trash) if t.get("id") == item_id), None)
        if idx is None:
            return False
        item = trash.pop(idx)
        item.pop("trashed_at", None)
        manifest["trash_tasks"] = trash
        manifest.setdefault("tasks", []).append(item)
        manifest["tasks"] = sort_tasks(manifest["tasks"])
    elif item_type == "asset":
        trash = manifest.get("trash_assets", [])
        idx = next((i for i, a in enumerate(trash) if a.get("task_id") == item_id), None)
        if idx is None:
            return False
        item = trash.pop(idx)
        item.pop("trashed_at", None)
        manifest["trash_assets"] = trash
        manifest.setdefault("assets", []).append(item)
        manifest["assets"] = sorted(manifest["assets"], key=lambda a: a.get("saved_at", ""), reverse=True)
    else:
        return False
    persist_manifest(manifest)
    return True


def empty_trash():
    """Permanently delete all trashed items."""
    manifest = load_manifest()
    count = len(manifest.get("trash_tasks", [])) + len(manifest.get("trash_assets", []))
    manifest["trash_tasks"] = []
    manifest["trash_assets"] = []
    persist_manifest(manifest)
    return count


def toggle_favorite(task_id):
    """Toggle favorite status on a task record."""
    manifest = load_manifest()
    tasks = manifest.get("tasks", [])
    for task in tasks:
        if task.get("id") == task_id:
            task["favorite"] = not task.get("favorite", False)
            persist_manifest(manifest)
            return task["favorite"]
    return None


def download_video(url, task_id):
    extension = splitext_from_url(url)
    filename = f"{task_id}{extension}"
    target = VIDEO_DIR / filename
    if not target.exists():
        _opener = request.build_opener(request.ProxyHandler({}))
        with _opener.open(url, timeout=180) as response, target.open("wb") as output:
            while True:
                chunk = response.read(1024 * 256)
                if not chunk:
                    break
                output.write(chunk)

    return {
        "filename": filename,
        "local_path": str(target),
        "local_url": f"/media/videos/{filename}",
        "download_url": f"/media/videos/{filename}?download=1",
    }


def save_task_video(task_record):
    url = task_record.get("content", {}).get("video_url") or (task_record.get("_proxy", {}).get("videoUrls") or [None])[0]
    if not url:
        return task_record

    if task_record.get("local_asset"):
        return task_record

    try:
        local_asset = download_video(url, task_record["id"])
    except Exception as exc:  # noqa: BLE001 - keep server resilient on download failures
        task_record.setdefault("local_asset_error", str(exc))
        return upsert_task_record(task_record)

    local_asset.update(
        {
            "task_id": task_record["id"],
            "title": task_record.get("meta", {}).get("title") or task_record.get("title") or task_record["id"],
            "saved_at": now_iso(),
            "source": "auto_save",
            "remote_url": url,
            "resolution": task_record.get("resolution"),
            "ratio": task_record.get("ratio"),
            "duration": task_record.get("duration"),
        }
    )
    task_record["local_asset"] = local_asset
    save_asset_record(local_asset)
    return upsert_task_record(task_record)


def build_task_record(response_data, request_payload=None, meta=None):
    record = find_task_record(response_data.get("id")) or {}
    record.update(response_data)
    record["tracked_at"] = now_iso()
    if request_payload is not None:
        record["request_payload"] = sanitize_payload_for_storage(request_payload)
    if meta is not None:
        record["meta"] = meta
    if "request_payload" in record and "title" not in record:
        text_items = [item.get("text") for item in record["request_payload"].get("content", []) if item.get("type") == "text"]
        if text_items:
            record["title"] = text_items[0][:48]
    return upsert_task_record(record)


class AppHandler(BaseHTTPRequestHandler):
    server_version = "SeedanceStudio/2.0"

    def add_cors_headers(self):
        origin = self.headers.get("Origin", "")
        allowed = origin if origin in CORS_ORIGINS else CORS_ORIGIN
        self.send_header("Access-Control-Allow-Origin", allowed)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Max-Age", "86400")

    # --- Auth helpers ---

    def send_json_with_cookie(self, status, payload, cookie_value):
        """Like send_json but with an extra Set-Cookie header."""
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(int(status))
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Set-Cookie", cookie_value)
        self.add_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _parse_cookie_sid(self):
        cookie_header = self.headers.get("Cookie", "")
        for part in cookie_header.split(";"):
            part = part.strip()
            if part.startswith("sid="):
                return part[4:]
        return None

    def ensure_auth_service(self):
        if DB_AVAILABLE or is_file_auth_enabled():
            return True
        self.send_error_json(HTTPStatus.SERVICE_UNAVAILABLE, AUTH_UNAVAILABLE_MESSAGE)
        return False

    def require_auth(self):
        """Check auth for API routes. Returns True if authorized (or whitelisted). Sends 401 and returns False otherwise."""
        path = self.path.split("?", 1)[0]

        # Non-API paths (static files, media) don't need auth
        if not path.startswith("/api/"):
            return True

        # Auth whitelist
        if path.startswith("/api/auth/"):
            return True
        if path == "/api/health":
            return True

        if not self.ensure_auth_service():
            return False

        sid = self._parse_cookie_sid()
        if not sid:
            self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "未登录"})
            return False

        result = validate_session(sid)
        if not result:
            self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "会话已过期，请重新登录"})
            return False

        return True

    def handle_auth_register(self):
        if not self.ensure_auth_service():
            return
        try:
            data = self.read_json()
        except ValueError:
            return
        username = (data.get("username") or "").strip()
        password = data.get("password") or ""
        if len(username) < 2 or len(username) > 64:
            return self.send_error_json(HTTPStatus.BAD_REQUEST, "用户名需要 2-64 个字符")
        if len(password) < 6 or len(password) > 128:
            return self.send_error_json(HTTPStatus.BAD_REQUEST, "密码需要 6-128 个字符")

        # File-based auth (when DB is unavailable)
        if not DB_AVAILABLE and is_file_auth_enabled():
            try:
                user = create_file_auth_user(username, password)
            except ValueError:
                return self.send_error_json(HTTPStatus.CONFLICT, "用户名已存在")
            session_id = create_session(user["id"], user["username"])
            cookie = f"sid={session_id}; HttpOnly; SameSite=Lax; Path=/; Max-Age={SESSION_MAX_AGE}"
            return self.send_json_with_cookie(HTTPStatus.OK, {"ok": True, "user": {"id": user["id"], "username": user["username"]}}, cookie)

        # Database auth
        pw_hash, salt = hash_password(password)
        db = get_db()
        try:
            with db.cursor() as cur:
                cur.execute(
                    "INSERT INTO users (username, password_hash, salt) VALUES (%s, %s, %s)",
                    (username, pw_hash, salt),
                )
                user_id = cur.lastrowid
        except pymysql.err.IntegrityError:
            return self.send_error_json(HTTPStatus.CONFLICT, "用户名已存在")

        session_id = create_session(user_id, username)
        cookie = f"sid={session_id}; HttpOnly; SameSite=Lax; Path=/; Max-Age={SESSION_MAX_AGE}"
        return self.send_json_with_cookie(HTTPStatus.OK, {"ok": True, "user": {"id": user_id, "username": username}}, cookie)

    def handle_auth_login(self):
        if not self.ensure_auth_service():
            return
        try:
            data = self.read_json()
        except ValueError:
            return
        username = (data.get("username") or "").strip()
        password = data.get("password") or ""
        if not username or not password:
            return self.send_error_json(HTTPStatus.BAD_REQUEST, "请输入用户名和密码")

        try:
            # File-based auth (when DB is unavailable)
            if not DB_AVAILABLE and is_file_auth_enabled():
                user = find_file_auth_user(username)
                if not user:
                    return self.send_error_json(HTTPStatus.UNAUTHORIZED, "用户名或密码错误")
                if not verify_file_auth_user(user, password):
                    return self.send_error_json(HTTPStatus.UNAUTHORIZED, "用户名或密码错误")
                session_id = create_session(user["id"], user["username"])
                cookie = f"sid={session_id}; HttpOnly; SameSite=Lax; Path=/; Max-Age={SESSION_MAX_AGE}"
                return self.send_json_with_cookie(HTTPStatus.OK, {"ok": True, "user": {"id": user["id"], "username": user["username"]}}, cookie)

            # Database auth
            db = get_db()
            with db.cursor() as cur:
                cur.execute("SELECT id, password_hash, salt FROM users WHERE username = %s", (username,))
                row = cur.fetchone()
            if not row:
                return self.send_error_json(HTTPStatus.UNAUTHORIZED, "用户名或密码错误")

            user_id, pw_hash, salt = row
            if not verify_password(password, pw_hash, salt):
                return self.send_error_json(HTTPStatus.UNAUTHORIZED, "用户名或密码错误")

            session_id = create_session(user_id, username)
            cookie = f"sid={session_id}; HttpOnly; SameSite=Lax; Path=/; Max-Age={SESSION_MAX_AGE}"
            return self.send_json_with_cookie(HTTPStatus.OK, {"ok": True, "user": {"id": user_id, "username": username}}, cookie)
        except Exception as exc:
            import traceback
            traceback.print_exc()
            return self.send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, f"登录处理异常: {exc}")

    def handle_auth_logout(self):
        sid = self._parse_cookie_sid()
        if sid:
            if DB_AVAILABLE:
                delete_session(sid)
            elif is_file_auth_enabled():
                with FILE_AUTH_LOCK:
                    FILE_AUTH_SESSIONS.pop(sid, None)
        cookie = "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
        return self.send_json_with_cookie(HTTPStatus.OK, {"ok": True}, cookie)

    def handle_auth_me(self):
        if not self.ensure_auth_service():
            return
        sid = self._parse_cookie_sid()
        if not sid:
            return self.send_json(HTTPStatus.UNAUTHORIZED, {"ok": False, "error": "未登录"})
        result = validate_session(sid)
        if not result:
            return self.send_json(HTTPStatus.UNAUTHORIZED, {"ok": False, "error": "会话已过期"})
        user_id, username = result
        return self.send_json(HTTPStatus.OK, {"ok": True, "user": {"id": user_id, "username": username}})

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.add_cors_headers()
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path in {"/", "/index.html"}:
            return self.serve_file(INDEX_FILE, "text/html; charset=utf-8")
        if path == "/styles.css":
            return self.serve_file(STYLES_FILE, "text/css; charset=utf-8")
        if path == "/app.js":
            return self.serve_file(APP_JS_FILE, "application/javascript; charset=utf-8")
        if path == "/favicon.ico":
            self.send_response(HTTPStatus.NO_CONTENT)
            self.end_headers()
            return
        if path.startswith("/media/"):
            return self.serve_media(path)

        # Auth route
        if path == "/api/auth/me":
            return self.handle_auth_me()

        # Async image job status — no auth needed (job_id is an unguessable UUID)
        img_job_match = _re_mod.match(r"^/api/ai/image/job/([^/]+)$", path)
        if img_job_match:
            return self.get_image_job_status(img_job_match.group(1))

        # Auth check for all other API routes
        if not self.require_auth():
            return

        if path == "/api/config":
            return self.send_json(
                HTTPStatus.OK,
                {
                    "hasApiKey": bool(get_api_key() or _get_gemini_key()),
                    "userId": STATE.get("user_id") or "",
                    "defaultModel": STATE.get("default_model") or "",
                    "autoSave": STATE.get("auto_save", True),
                    "storageDir": str(VIDEO_DIR),
                    "upstreamBase": UPSTREAM_BASE,
                    "docsSummary": "创建任务 POST /tasks，查询任务 GET /tasks/{id}，生成成功后会自动保存到本地作品库。",
                    "modelHints": {
                        "resolution": ["480p", "720p"],
                        "ratio": ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"],
                        "duration": [-1, 4, 5, 6, 7, 8, 9, 10, 12, 15],
                    },
                    "aiConfig": {
                        "chatBase": STATE.get("ai_chat_base", ""),
                        "imageBase": STATE.get("ai_image_base", ""),
                        "chatModel": STATE.get("ai_chat_model", "gemini-2.5-pro"),
                        "imageModel": STATE.get("ai_image_model", "imagen-4.0-generate-001"),
                        "videoModel": STATE.get("ai_video_model", "veo-2.0-generate-001"),
                        "geminiEnabled": _is_gemini_mode(),
                        "jimengEnabled": _is_jimeng_mode(),
                        "videoProvider": "jimeng" if _is_jimeng_mode() else ("gemini" if _is_gemini_mode() else "upstream"),
                    },
                },
            )
        if path == "/api/health":
            return self.send_json(HTTPStatus.OK, {"ok": True})
        if path == "/api/history":
            return self.send_json(HTTPStatus.OK, {"tasks": list_task_records()})
        if path == "/api/library":
            return self.send_json(HTTPStatus.OK, {"assets": list_assets()})
        if path == "/api/trash":
            return self.send_json(HTTPStatus.OK, list_trash())
        if path.startswith("/api/tasks/"):
            task_id = path.rsplit("/", 1)[-1].strip()
            if not task_id or not _is_safe_id(task_id):
                return self.send_error_json(HTTPStatus.BAD_REQUEST, "无效的任务 ID")
            cached_record = find_task_record(task_id)
            if cached_record and cached_record.get("status") in {"succeeded", "failed", "cancelled"}:
                return self.send_json(HTTPStatus.OK, cached_record)

            # Jimeng task polling
            if cached_record and cached_record.get("jimeng_task_id"):
                return self._poll_jimeng_task(cached_record)

            # Gemini Veo operation polling
            if cached_record and cached_record.get("gemini_operation"):
                return self._poll_gemini_task(cached_record)

            if not _looks_like_upstream_task_id(task_id):
                return self.send_error_json(HTTPStatus.NOT_FOUND, "任务不存在")
            data = self.proxy_upstream("GET", f"{UPSTREAM_BASE}/{task_id}", return_data=True)
            if isinstance(data, tuple):
                status, payload = data
            else:
                status, payload = HTTPStatus.BAD_GATEWAY, {"error": "上游返回异常"}
            if status >= 400:
                return self.send_json(status, payload)
            task_record = build_task_record(payload)
            if STATE.get("auto_save", True) and task_record.get("status") == "succeeded":
                task_record = save_task_video(task_record)
            return self.send_json(status, task_record)

        # --- Style library (static, served for frontend convenience) ---
        if path == "/api/styles":
            return self.send_json(HTTPStatus.OK, {
                "story_types": [
                    {"id": "drama", "label": "剧情故事片", "icon": "🎬", "description": "完整叙事结构，起承转合，适合短剧"},
                    {"id": "music_video", "label": "音乐概念片", "icon": "🎵", "description": "配合音乐节奏的视觉叙事，MV 风格"},
                    {"id": "comic_adapt", "label": "漫画转视频", "icon": "📖", "description": "静态漫画面板转动态视频"},
                    {"id": "promo", "label": "产品宣传片", "icon": "📢", "description": "品牌/产品动画广告"},
                    {"id": "edu", "label": "教育解说片", "icon": "📚", "description": "知识讲解动画"},
                ],
                "style_categories": ["全部", "国风", "IP风格", "日系风格", "插画风格", "可爱Q版", "欧美风格", "韩系", "立体风格"],
            })

        # --- Workflow: Project routes ---
        if path == "/api/projects":
            return self.send_json(HTTPStatus.OK, {"projects": list_projects()})

        # /api/projects/{id}/assets/{filename}
        import re
        asset_match = re.match(r"^/api/projects/([^/]+)/assets/(.+)$", path)
        if asset_match:
            project_id, filename = asset_match.group(1), asset_match.group(2)
            if not _is_safe_id(project_id):
                return self.send_error_json(HTTPStatus.BAD_REQUEST, "无效的项目 ID")
            asset_file = (PROJECTS_DIR / project_id / "assets" / filename).resolve()
            # 路径穿越防护：确保目标文件在项目目录内
            if not str(asset_file).startswith(str((PROJECTS_DIR / project_id).resolve())):
                return self.send_error_json(HTTPStatus.FORBIDDEN, "禁止访问该路径")
            if not asset_file.exists() or not asset_file.is_file():
                return self.send_error_json(HTTPStatus.NOT_FOUND, "资产文件不存在")
            guessed, _ = mimetypes.guess_type(str(asset_file))
            return self.serve_file(asset_file, guessed or "application/octet-stream")

        # /api/projects/{id}/versions/step3
        step3_versions_match = re.match(r"^/api/projects/([^/]+)/versions/step3$", path)
        if step3_versions_match:
            project_id = step3_versions_match.group(1)
            return self.send_json(HTTPStatus.OK, {"versions": list_step3_versions(project_id)})

        # /api/projects/{id}/versions/step4
        versions_match = re.match(r"^/api/projects/([^/]+)/versions/step4$", path)
        if versions_match:
            project_id = versions_match.group(1)
            return self.send_json(HTTPStatus.OK, {"versions": list_step4_versions(project_id)})

        # GET /api/projects/{id}/versions?step=stepN  — 版本历史列表
        versions_list_match = re.match(r"^/api/projects/([^/]+)/versions$", path)
        if versions_list_match:
            project_id = versions_list_match.group(1)
            query_string = self.path.split("?", 1)[1] if "?" in self.path else ""
            params = dict(p.split("=", 1) for p in query_string.split("&") if "=" in p)
            step = params.get("step", "step5")
            try:
                from version_manager import VersionManager
                vm = VersionManager()
                result = vm.list_versions(project_id, step)
                return self.send_json(HTTPStatus.OK, result)
            except Exception as exc:
                return self.send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc))

        # GET /api/projects/{id}/versions/{step}/{version_id}  — 版本详情
        version_detail_match = re.match(r"^/api/projects/([^/]+)/versions/(step\d+)/([^/]+)$", path)
        if version_detail_match:
            project_id = version_detail_match.group(1)
            step = version_detail_match.group(2)
            version_id = version_detail_match.group(3)
            try:
                from version_manager import VersionManager
                vm = VersionManager()
                result = vm.get_version(project_id, step, version_id)
                if result:
                    return self.send_json(HTTPStatus.OK, result)
                return self.send_error_json(HTTPStatus.NOT_FOUND, f"版本 {version_id} 不存在")
            except Exception as exc:
                return self.send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc))

        # /api/projects/{id}
        project_match = re.match(r"^/api/projects/([^/]+)$", path)
        if project_match:
            project_id = project_match.group(1)
            project = load_project(project_id)
            if not project:
                return self.send_error_json(HTTPStatus.NOT_FOUND, "项目不存在")
            return self.send_json(HTTPStatus.OK, project)

        # ---------------------------------------------------------------------------
        # Workflow API routes
        # ---------------------------------------------------------------------------
        if path.startswith("/api/workflow/"):
            return self._handle_workflow_get(path)

        self.send_error_json(HTTPStatus.NOT_FOUND, f"未找到路径: {path}")

    def _handle_workflow_get(self, path: str):
        """Dispatch GET /api/workflow/* routes."""
        import re
        se, cf = _get_workflow_engines()

        # GET /api/workflow/script/{script_id}
        m = re.match(r"^/api/workflow/script/([^/]+)$", path)
        if m:
            if se is None:
                return self.send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, "剧本引擎未初始化")
            script = se.get_script(m.group(1))
            if script:
                return self.send_json(HTTPStatus.OK, script)
            return self.send_error_json(HTTPStatus.NOT_FOUND, "剧本不存在")

        # GET /api/workflow/character/list/{project_id}
        m = re.match(r"^/api/workflow/character/list/([^/]+)$", path)
        if m:
            if cf is None:
                return self.send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, "角色工厂未初始化")
            chars = cf.list_characters(m.group(1))
            return self.send_json(HTTPStatus.OK, chars)

        # GET /api/workflow/character/{character_id}
        m = re.match(r"^/api/workflow/character/([^/]+)$", path)
        if m:
            if cf is None:
                return self.send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, "角色工厂未初始化")
            char = cf.get_character(m.group(1))
            if char:
                return self.send_json(HTTPStatus.OK, char)
            return self.send_error_json(HTTPStatus.NOT_FOUND, "角色不存在")

        # GET /api/workflow/storyboard/{storyboard_id}
        m = re.match(r"^/api/workflow/storyboard/([^/]+)$", path)
        if m:
            try:
                from storyboard_generator import StoryboardGenerator
                cfg = _load_workflow_config()
                sg = StoryboardGenerator(cfg)
                sb = sg.get_storyboard(m.group(1))
                if sb:
                    return self.send_json(HTTPStatus.OK, sb)
                return self.send_error_json(HTTPStatus.NOT_FOUND, "分镜不存在")
            except ImportError:
                return self.send_error_json(HTTPStatus.NOT_IMPLEMENTED, "分镜模块尚未安装")

        # GET /api/workflow/video/task/{task_id}
        m = re.match(r"^/api/workflow/video/task/([^/]+)$", path)
        if m:
            try:
                from video_composer import VideoComposer
                cfg = _load_workflow_config()
                vc = VideoComposer(cfg)
                vt = vc.get_video_task(m.group(1))
                if vt:
                    return self.send_json(HTTPStatus.OK, vt)
                return self.send_error_json(HTTPStatus.NOT_FOUND, "视频任务不存在")
            except ImportError:
                return self.send_error_json(HTTPStatus.NOT_IMPLEMENTED, "视频合成模块尚未安装")

        # GET /api/workflow/status/{project_id}
        m = re.match(r"^/api/workflow/status/([^/]+)$", path)
        if m:
            return self._handle_workflow_status(m.group(1))

        # GET /api/workflow/pipeline/status/{project_id}
        # 查询 Harness 风格管线的完整状态（含各阶段分数、策略、检查点）
        m = re.match(r"^/api/workflow/pipeline/status/([^/]+)$", path)
        if m:
            return self._handle_pipeline_status(m.group(1))

        # GET /api/workflow/pipeline/checkpoints/{project_id}
        # 列出项目的所有检查点
        m = re.match(r"^/api/workflow/pipeline/checkpoints/([^/]+)$", path)
        if m:
            return self._handle_pipeline_checkpoints(m.group(1))

        self.send_error_json(HTTPStatus.NOT_FOUND, f"未找到 workflow 路径: {path}")

    def _handle_workflow_status(self, project_id: str):
        """Aggregate workflow status for a project."""
        se, cf = _get_workflow_engines()
        status: dict = {
            "project_id": project_id,
            "steps": {
                "script": {"done": False},
                "characters": {"done": False, "count": 0, "total": 0},
                "storyboard": {"done": False},
                "video": {"done": False},
            }
        }
        # Script
        if se:
            try:
                for script in DOCUMENT_STORAGE.list_documents("script", project_id=project_id):
                    if script.get("status") in {"done", "succeeded", "completed"}:
                        status["steps"]["script"] = {
                            "done": True,
                            "id": script.get("script_id"),
                        }
                        break
            except Exception:
                pass
        # Characters
        if cf:
            try:
                chars = cf.list_characters(project_id)
                done_chars = [c for c in chars if c.get("status") == "done"]
                status["steps"]["characters"] = {
                    "done": len(chars) > 0 and len(done_chars) == len(chars),
                    "count": len(done_chars),
                    "total": len(chars),
                }
            except Exception:
                pass
        return self.send_json(HTTPStatus.OK, status)

    # ---- Harness 风格管线路由 ----

    def _handle_pipeline_start(self):
        """
        POST /api/workflow/pipeline/start
        启动完整的自动化管线（Harness 三 Agent 架构）。

        Body: { project_id, genre, theme, characters_count, episodes_count }
        Returns: { pipeline_id, status: "running", project_id }
        """
        try:
            body = self.read_json()
        except ValueError:
            return

        required = ["project_id", "genre", "theme", "characters_count", "episodes_count"]
        for p in required:
            if p not in body:
                return self.send_error_json(HTTPStatus.BAD_REQUEST, f"缺少参数: {p}")

        try:
            from workflow_orchestrator import WorkflowOrchestrator
            cfg = _load_workflow_config()
            orchestrator = WorkflowOrchestrator(cfg)
            state = orchestrator.start_pipeline(
                project_id=body["project_id"],
                params={
                    "genre": body["genre"],
                    "theme": body["theme"],
                    "characters_count": int(body["characters_count"]),
                    "episodes_count": int(body["episodes_count"]),
                },
            )
            return self.send_json(HTTPStatus.OK, {
                "pipeline_id": state.pipeline_id,
                "project_id": state.project_id,
                "status": state.status,
                "current_stage": state.current_stage,
            })
        except ImportError as exc:
            return self.send_error_json(HTTPStatus.NOT_IMPLEMENTED, f"管线模块未安装: {exc}")
        except Exception as exc:
            return self.send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc))

    def _handle_pipeline_resume(self):
        """
        POST /api/workflow/pipeline/resume
        从检查点恢复管线（Harness checkpoint/restore 模式）。

        Body: { project_id }
        Returns: { pipeline_id, status, current_stage, resumed_from }
        """
        try:
            body = self.read_json()
        except ValueError:
            return

        project_id = body.get("project_id")
        if not project_id:
            return self.send_error_json(HTTPStatus.BAD_REQUEST, "缺少参数: project_id")

        try:
            from workflow_orchestrator import WorkflowOrchestrator
            cfg = _load_workflow_config()
            orchestrator = WorkflowOrchestrator(cfg)
            state = orchestrator.resume_pipeline(project_id=project_id)
            if state is None:
                return self.send_error_json(HTTPStatus.NOT_FOUND, "没有可恢复的管线状态")
            return self.send_json(HTTPStatus.OK, {
                "pipeline_id": state.pipeline_id,
                "project_id": state.project_id,
                "status": state.status,
                "current_stage": state.current_stage,
                "resumed_from": state.current_stage,
            })
        except ImportError as exc:
            return self.send_error_json(HTTPStatus.NOT_IMPLEMENTED, f"管线模块未安装: {exc}")
        except Exception as exc:
            return self.send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc))

    def _handle_pipeline_status(self, project_id: str):
        """
        GET /api/workflow/pipeline/status/{project_id}
        查询 Harness 风格管线的完整状态。

        返回包含：各阶段状态、分数历史、REFINE/PIVOT 策略决策、检查点信息。
        """
        try:
            from workflow_orchestrator import WorkflowOrchestrator
            cfg = _load_workflow_config()
            orchestrator = WorkflowOrchestrator(cfg)
            state = orchestrator.get_pipeline_status(project_id)
            if state is None:
                return self.send_error_json(HTTPStatus.NOT_FOUND, "管线状态不存在")
            return self.send_json(HTTPStatus.OK, state.to_dict())
        except ImportError as exc:
            return self.send_error_json(HTTPStatus.NOT_IMPLEMENTED, f"管线模块未安装: {exc}")
        except Exception as exc:
            return self.send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc))

    def _handle_pipeline_checkpoints(self, project_id: str):
        """
        GET /api/workflow/pipeline/checkpoints/{project_id}
        列出项目的所有检查点。
        """
        try:
            from workflow_checkpoint import CheckpointManager
            cm = CheckpointManager()
            checkpoints = cm.list_checkpoints(project_id)
            return self.send_json(HTTPStatus.OK, {"checkpoints": checkpoints})
        except ImportError as exc:
            return self.send_error_json(HTTPStatus.NOT_IMPLEMENTED, f"检查点模块未安装: {exc}")
        except Exception as exc:
            return self.send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc))

    def do_HEAD(self):
        path = self.path.split("?", 1)[0]
        if path in {"/", "/index.html"}:
            return self.serve_file(INDEX_FILE, "text/html; charset=utf-8", head_only=True)
        if path == "/styles.css":
            return self.serve_file(STYLES_FILE, "text/css; charset=utf-8", head_only=True)
        if path == "/app.js":
            return self.serve_file(APP_JS_FILE, "application/javascript; charset=utf-8", head_only=True)
        if path.startswith("/media/"):
            return self.serve_media(path, head_only=True)
        self.send_error_json(HTTPStatus.NOT_FOUND, f"未找到路径: {path}")

    def do_POST(self):
        path = self.path.split("?", 1)[0]

        # Auth routes (no auth check needed)
        if path == "/api/auth/register":
            return self.handle_auth_register()
        if path == "/api/auth/login":
            return self.handle_auth_login()
        if path == "/api/auth/logout":
            return self.handle_auth_logout()

        # AI proxy routes — skip auth (API key is server-side, allows cross-origin streaming)
        if path == "/api/ai/chat":
            return self.proxy_ai_chat()
        if path == "/api/ai/chat/stream":
            return self.proxy_ai_chat_stream()

        # Auth check for all other API routes
        if not self.require_auth():
            return

        if path == "/api/session/key":
            return self.update_local_config()
        if path == "/api/tasks":
            return self.create_task()
        if path == "/api/library/save":
            return self.save_library_item()
        if path == "/api/open-storage":
            return self.open_storage_directory()

        if path == "/api/trash/restore":
            return self.restore_trash_item()
        if path == "/api/trash/empty":
            return self.empty_trash_handler()

        import re
        favorite_match = re.match(r"^/api/tasks/([^/]+)/favorite$", path)
        if favorite_match:
            return self.toggle_task_favorite(favorite_match.group(1))

        # --- Workflow routes ---
        if path == "/api/projects":
            return self.create_project()
        if path == "/api/ai/image":
            return self.proxy_ai_image()

        import re
        render_match = re.match(r"^/api/projects/([^/]+)/render$", path)
        if render_match:
            return self.render_project(render_match.group(1))

        # POST /api/projects/{id}/shots/generate-batch  — 批量分镜视频生成
        batch_match = re.match(r"^/api/projects/([^/]+)/shots/generate-batch$", path)
        if batch_match:
            return self._handle_batch_shot_generate(batch_match.group(1))

        # POST /api/projects/{id}/versions/{step}/{version_id}/restore  — 恢复版本
        restore_ver_match = re.match(r"^/api/projects/([^/]+)/versions/(step\d+)/([^/]+)/restore$", path)
        if restore_ver_match:
            return self._handle_version_restore(
                restore_ver_match.group(1),
                restore_ver_match.group(2),
                restore_ver_match.group(3),
            )

        # POST /api/projects/{id}/versions  — 手动创建版本快照
        create_ver_match = re.match(r"^/api/projects/([^/]+)/versions$", path)
        if create_ver_match:
            return self._handle_version_create(create_ver_match.group(1))

        asset_upload_match = re.match(r"^/api/projects/([^/]+)/assets$", path)
        if asset_upload_match:
            return self.upload_project_asset(asset_upload_match.group(1))

        # Step 3 版本快照
        step3_snapshot_match = re.match(r"^/api/projects/([^/]+)/versions/step3/snapshot$", path)
        if step3_snapshot_match:
            project_id = step3_snapshot_match.group(1)
            body = self.read_json()
            if body is None:
                return
            reason = body.get("reason", "手动快照")
            result = create_step3_snapshot(project_id, reason)
            if result:
                return self.send_json(HTTPStatus.OK, {"snapshot": result})
            return self.send_error_json(HTTPStatus.NOT_FOUND, "项目不存在或无剧本分析数据")

        # Step 3 版本恢复
        step3_restore_match = re.match(r"^/api/projects/([^/]+)/versions/step3/restore$", path)
        if step3_restore_match:
            project_id = step3_restore_match.group(1)
            body = self.read_json()
            if body is None:
                return
            filename = body.get("filename", "")
            result = restore_step3_version(project_id, filename)
            if result:
                return self.send_json(HTTPStatus.OK, result)
            return self.send_error_json(HTTPStatus.NOT_FOUND, "版本快照不存在")

        # Step 4 版本快照
        snapshot_match = re.match(r"^/api/projects/([^/]+)/versions/step4/snapshot$", path)
        if snapshot_match:
            project_id = snapshot_match.group(1)
            body = self.read_json()
            if body is None:
                return
            reason = body.get("reason", "手动快照")
            result = create_step4_snapshot(project_id, reason)
            if result:
                return self.send_json(HTTPStatus.OK, {"snapshot": result})
            return self.send_error_json(HTTPStatus.NOT_FOUND, "项目不存在")

        # Step 4 版本恢复
        restore_match = re.match(r"^/api/projects/([^/]+)/versions/step4/restore$", path)
        if restore_match:
            project_id = restore_match.group(1)
            body = self.read_json()
            if body is None:
                return
            filename = body.get("filename", "")
            if not filename or not _is_safe_version_filename(filename):
                return self.send_error_json(HTTPStatus.BAD_REQUEST, "无效的版本文件名")
            result = restore_step4_version(project_id, filename)
            if result:
                return self.send_json(HTTPStatus.OK, result)
            return self.send_error_json(HTTPStatus.NOT_FOUND, "版本快照不存在")

        # Pipeline API POST routes (Harness 风格管线)
        if path == "/api/workflow/pipeline/start":
            return self._handle_pipeline_start()
        if path == "/api/workflow/pipeline/resume":
            return self._handle_pipeline_resume()

        # Workflow API POST routes
        if path.startswith("/api/workflow/"):
            return self._handle_workflow_post(path)

        self.send_error_json(HTTPStatus.NOT_FOUND, f"未找到路径: {path}")

    def _handle_workflow_post(self, path: str):
        """Dispatch POST /api/workflow/* routes."""
        try:
            body = self.read_json()
        except ValueError:
            return

        se, cf = _get_workflow_engines()

        # POST /api/workflow/script/generate
        if path == "/api/workflow/script/generate":
            if se is None:
                return self.send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, "剧本引擎未初始化")
            required = ["project_id", "genre", "theme", "characters_count", "episodes_count"]
            for p in required:
                if p not in body:
                    return self.send_error_json(HTTPStatus.BAD_REQUEST, f"缺少参数: {p}")
            try:
                script_id = se.generate_script(
                    project_id=body["project_id"],
                    genre=body["genre"],
                    theme=body["theme"],
                    characters_count=int(body["characters_count"]),
                    episodes_count=int(body["episodes_count"]),
                )
                return self.send_json(HTTPStatus.OK, {"script_id": script_id})
            except Exception as exc:
                return self.send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc))

        # POST /api/workflow/character/create
        if path == "/api/workflow/character/create":
            if cf is None:
                return self.send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, "角色工厂未初始化")
            required = ["project_id", "name", "personality", "appearance_desc", "role_type"]
            for p in required:
                if p not in body:
                    return self.send_error_json(HTTPStatus.BAD_REQUEST, f"缺少参数: {p}")
            try:
                char_id = cf.create_character(
                    project_id=body["project_id"],
                    name=body["name"],
                    personality=body["personality"],
                    appearance_desc=body["appearance_desc"],
                    role_type=body["role_type"],
                )
                return self.send_json(HTTPStatus.OK, {"character_id": char_id})
            except Exception as exc:
                return self.send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc))

        # POST /api/workflow/storyboard/generate
        if path == "/api/workflow/storyboard/generate":
            try:
                from storyboard_generator import StoryboardGenerator
                cfg = _load_workflow_config()
                sg = StoryboardGenerator(cfg)
                required = ["project_id", "script_id"]
                for p in required:
                    if p not in body:
                        return self.send_error_json(HTTPStatus.BAD_REQUEST, f"缺少参数: {p}")
                sb_id = sg.generate_storyboard(
                    project_id=body["project_id"],
                    script_id=body["script_id"],
                    episode_index=int(body.get("episode_index", body.get("episode_num", 0))),
                )
                return self.send_json(HTTPStatus.OK, {"storyboard_id": sb_id})
            except ImportError:
                return self.send_error_json(HTTPStatus.NOT_IMPLEMENTED, "分镜模块尚未安装")
            except Exception as exc:
                return self.send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc))

        # POST /api/workflow/video/compose
        if path == "/api/workflow/video/compose":
            try:
                from video_composer import VideoComposer
                cfg = _load_workflow_config()
                vc = VideoComposer(cfg)
                required = ["project_id", "storyboard_id"]
                for p in required:
                    if p not in body:
                        return self.send_error_json(HTTPStatus.BAD_REQUEST, f"缺少参数: {p}")
                task_id = vc.compose_video(
                    project_id=body["project_id"],
                    storyboard_id=body["storyboard_id"],
                    script_id=body.get("script_id"),
                    episode_index=int(body.get("episode_index", 0)),
                )
                return self.send_json(HTTPStatus.OK, {"video_task_id": task_id})
            except ImportError:
                return self.send_error_json(HTTPStatus.NOT_IMPLEMENTED, "视频合成模块尚未安装")
            except Exception as exc:
                return self.send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc))

        return self.send_error_json(HTTPStatus.NOT_FOUND, f"未找到 workflow POST 路径: {path}")

    def do_PUT(self):
        if not self.require_auth():
            return
        path = self.path.split("?", 1)[0]
        import re
        project_match = re.match(r"^/api/projects/([^/]+)$", path)
        if project_match:
            return self.update_project(project_match.group(1))
        self.send_error_json(HTTPStatus.NOT_FOUND, f"未找到路径: {path}")

    def do_DELETE(self):
        if not self.require_auth():
            return
        path = self.path.split("?", 1)[0]
        import re

        # DELETE /api/tasks/{id} — soft delete task to trash
        task_match = re.match(r"^/api/tasks/([^/]+)$", path)
        if task_match:
            task_id = task_match.group(1)
            if trash_task(task_id):
                return self.send_json(HTTPStatus.OK, {"message": "任务已移入回收站"})
            return self.send_error_json(HTTPStatus.NOT_FOUND, "任务不存在")

        # DELETE /api/library/{taskId} — soft delete library asset to trash
        library_match = re.match(r"^/api/library/([^/]+)$", path)
        if library_match:
            task_id = library_match.group(1)
            if trash_asset(task_id):
                return self.send_json(HTTPStatus.OK, {"message": "资产已移入回收站"})
            return self.send_error_json(HTTPStatus.NOT_FOUND, "资产不存在")

        project_match = re.match(r"^/api/projects/([^/]+)$", path)
        if project_match:
            project_id = project_match.group(1)
            if delete_project(project_id):
                return self.send_json(HTTPStatus.OK, {"message": "项目已删除"})
            return self.send_error_json(HTTPStatus.NOT_FOUND, "项目不存在")

        # DELETE /api/projects/{id}/versions/{step}/{version_id}  — 删除版本
        ver_del_match = re.match(r"^/api/projects/([^/]+)/versions/(step\d+)/([^/]+)$", path)
        if ver_del_match:
            project_id = ver_del_match.group(1)
            step = ver_del_match.group(2)
            version_id = ver_del_match.group(3)
            try:
                from version_manager import VersionManager
                vm = VersionManager()
                if vm.delete_version(project_id, step, version_id):
                    return self.send_json(HTTPStatus.OK, {"message": f"版本 {version_id} 已删除"})
                return self.send_error_json(HTTPStatus.NOT_FOUND, f"版本 {version_id} 不存在")
            except Exception as exc:
                return self.send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc))

    def update_local_config(self):
        try:
            data = self.read_json()
        except ValueError:
            return

        api_key = (data.get("apiKey") or STATE.get("api_key") or "").strip()
        user_id = str(data.get("userId") or STATE.get("user_id") or "").strip()
        default_model = str(data.get("defaultModel") or STATE.get("default_model") or "").strip()
        auto_save = bool(data.get("autoSave", STATE.get("auto_save", True)))
        ai_chat_base = data.get("aiChatBase") or STATE.get("ai_chat_base", AI_CHAT_BASE)
        ai_image_base = data.get("aiImageBase") or STATE.get("ai_image_base", AI_IMAGE_BASE)
        ai_chat_model = data.get("aiChatModel") or STATE.get("ai_chat_model", "gemini-2.5-pro")
        ai_image_model = data.get("aiImageModel") or STATE.get("ai_image_model", "nano-banana-pro-preview")
        ai_video_provider = data.get("aiVideoProvider") if "aiVideoProvider" in data else STATE.get("ai_video_provider", "")

        STATE.update(
            {
                "api_key": api_key,
                "user_id": user_id,
                "default_model": default_model,
                "auto_save": auto_save,
                "ai_chat_base": ai_chat_base,
                "ai_image_base": ai_image_base,
                "ai_chat_model": ai_chat_model,
                "ai_image_model": ai_image_model,
                "ai_video_provider": ai_video_provider,
            }
        )
        persisted_config = load_local_config()
        if not isinstance(persisted_config, dict):
            persisted_config = {}
        persisted_config.update(
            {
                "api_key": api_key,
                "user_id": user_id,
                "default_model": default_model,
                "auto_save": auto_save,
                "ai_chat_base": ai_chat_base,
                "ai_image_base": ai_image_base,
                "ai_chat_model": ai_chat_model,
                "ai_image_model": ai_image_model,
                "ai_video_provider": ai_video_provider,
            }
        )
        persist_local_config(persisted_config)
        return self.send_json(
            HTTPStatus.OK,
            {
                "hasApiKey": bool(api_key),
                "userId": user_id,
                "defaultModel": default_model,
                "autoSave": auto_save,
                "message": "本地配置已保存。生成成功的视频会根据设置自动入库。",
            },
        )

    def create_task(self):
        try:
            data = self.read_json()
        except ValueError:
            return

        payload = data.get("payload") if isinstance(data, dict) and "payload" in data else data
        meta = data.get("meta") if isinstance(data, dict) else None

        if not payload:
            return self.send_error_json(HTTPStatus.BAD_REQUEST, "请求体不能为空")
        if not payload.get("model"):
            return self.send_error_json(HTTPStatus.BAD_REQUEST, "缺少 model")
        if not payload.get("content"):
            return self.send_error_json(HTTPStatus.BAD_REQUEST, "缺少 content")

        # Convert local asset paths to base64 data URIs before sending upstream
        self._resolve_local_urls(payload)

        if _is_jimeng_mode():
            return self._create_task_jimeng(payload, meta)
        if _is_gemini_mode():
            return self._create_task_gemini(payload, meta)

        upstream = self.proxy_upstream("POST", UPSTREAM_BASE, payload, return_data=True)
        if not isinstance(upstream, tuple):
            return self.send_error_json(HTTPStatus.BAD_GATEWAY, "上游返回异常")
        status, response_data = upstream
        if status >= 400:
            return self.send_json(status, response_data)

        record = build_task_record(response_data, request_payload=payload, meta=meta)
        return self.send_json(status, record)

    def _create_task_gemini(self, payload: dict, meta: dict | None):
        """Create a video generation task via Gemini Veo API."""
        # Extract prompt text, first-frame image, and additional reference images from content array
        content = payload.get("content", [])
        prompt_text = ""
        first_frame_b64 = None
        first_frame_mime = None
        extra_ref_images: list[dict] = []  # {"b64": str, "mime": str}
        is_first_image = True

        for item in content:
            if not isinstance(item, dict):
                continue
            if item.get("type") == "text":
                prompt_text += item.get("text", "") + " "
            elif item.get("type") == "image_url":
                url_obj = item.get("image_url", {})
                url = url_obj.get("url", "")
                b64_data = None
                mime_type = None

                if url.startswith("data:"):
                    header, _, b64_body = url.partition(",")
                    b64_data = b64_body
                    mime_type = header.replace("data:", "").replace(";base64", "")
                elif url.startswith("http"):
                    try:
                        opener = request.build_opener(request.ProxyHandler({}))
                        with opener.open(url, timeout=60) as resp:
                            raw = resp.read()
                        b64_data = base64.b64encode(raw).decode("ascii")
                        ct = resp.headers.get("Content-Type", "image/png")
                        mime_type = ct.split(";")[0].strip()
                    except Exception as exc:
                        print(f"[Gemini] Failed to download reference image: {exc}")
                        continue
                if not b64_data:
                    continue

                if is_first_image:
                    # 第一张图视为首帧（first frame）
                    first_frame_b64 = b64_data
                    first_frame_mime = mime_type
                    is_first_image = False
                else:
                    # 后续图片为额外参考图（角色三视图等）
                    extra_ref_images.append({"b64": b64_data, "mime": mime_type or "image/png"})

        prompt_text = prompt_text.strip()
        if not prompt_text:
            return self.send_error_json(HTTPStatus.BAD_REQUEST, "缺少视频描述文本")

        aspect_ratio = payload.get("ratio", "16:9")
        duration = payload.get("duration", 8)
        if duration == -1:
            duration = 8

        # 前端 payload 可指定 model 覆盖默认值
        model_from_payload = payload.get("model", "")
        model_override = None
        if model_from_payload:
            MODEL_ALIAS = {
                "veo-2": "veo-2.0-generate-001",
                "veo-3": "veo-3.0-generate-001",
                "veo-3.1": "veo-3.1-generate-preview",
            }
            model_override = MODEL_ALIAS.get(model_from_payload, model_from_payload)

        # 策略：首帧图 (image) 和 referenceImages 不能同时使用
        # 有首帧 → 用 image；无首帧但有参考图 → 用 referenceImages
        print(f"[Gemini Veo] first_frame={'yes' if first_frame_b64 else 'no'}, extra_refs={len(extra_ref_images)}")

        try:
            operation = _gemini_create_video_task(
                prompt=prompt_text,
                aspect_ratio=aspect_ratio,
                duration=duration,
                image_b64=first_frame_b64,
                image_mime=first_frame_mime,
                model_override=model_override,
                reference_images=extra_ref_images if not first_frame_b64 else None,
            )
        except error.HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="replace")
            try:
                err_data = json.loads(raw)
            except json.JSONDecodeError:
                err_data = {"error": raw}
            return self.send_json(exc.code, err_data)
        except Exception as exc:
            return self.send_error_json(HTTPStatus.BAD_GATEWAY, f"Gemini Veo 请求失败: {exc}")

        # Create a local task record with compatible ID
        task_id = _generate_gemini_task_id()
        operation_name = operation.get("name", "")

        record = {
            "id": task_id,
            "status": "submitted",
            "gemini_operation": operation_name,
            "tracked_at": now_iso(),
            "model": payload.get("model", "veo-2.0-generate-001"),
            "content": {},
        }
        if meta:
            record["meta"] = meta
        record["request_payload"] = sanitize_payload_for_storage(payload)
        # Extract title from prompt
        text_items = [item.get("text") for item in content if isinstance(item, dict) and item.get("type") == "text"]
        if text_items:
            record["title"] = text_items[0][:48]

        record = upsert_task_record(record)
        return self.send_json(HTTPStatus.OK, record)

    def _poll_gemini_task(self, cached_record: dict):
        """Poll a Gemini Veo video generation operation."""
        operation_name = cached_record["gemini_operation"]
        try:
            op = _gemini_poll_operation(operation_name)
        except error.HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="replace")
            try:
                err_data = json.loads(raw)
            except json.JSONDecodeError:
                err_data = {"error": raw}
            # If 404, the operation may have expired
            if exc.code == 404:
                cached_record["status"] = "failed"
                cached_record["error"] = "Gemini 操作已过期或不存在"
                upsert_task_record(cached_record)
            return self.send_json(exc.code, err_data)
        except Exception as exc:
            return self.send_error_json(HTTPStatus.BAD_GATEWAY, f"Gemini 轮询失败: {exc}")

        if op.get("done"):
            # Extract video URL from response
            # Format: response.generateVideoResponse.generatedSamples[].video.uri
            response = op.get("response", {})
            gen_resp = response.get("generateVideoResponse", response)
            samples = gen_resp.get("generatedSamples", [])
            video_uri = ""
            for sample in samples:
                video = sample.get("video", {})
                uri = video.get("uri", "")
                if uri:
                    # Gemini file download URLs require API key
                    if "generativelanguage.googleapis.com" in uri and "key=" not in uri:
                        separator = "&" if "?" in uri else "?"
                        uri = f"{uri}{separator}key={_get_gemini_key()}"
                    video_uri = uri
                    break

            if video_uri:
                cached_record["status"] = "succeeded"
                cached_record["content"] = {"video_url": video_uri}
                cached_record["_proxy"] = {"videoUrls": [video_uri], "status": 200}
                upsert_task_record(cached_record)
                # Auto-download
                if STATE.get("auto_save", True):
                    cached_record = save_task_video(cached_record)
            else:
                # Check for error
                err = op.get("error", {})
                if err:
                    cached_record["status"] = "failed"
                    cached_record["error"] = err.get("message", str(err))
                else:
                    cached_record["status"] = "failed"
                    cached_record["error"] = "Gemini Veo 未返回视频"
                upsert_task_record(cached_record)
        else:
            # Still processing
            cached_record["status"] = "processing"
            # Don't persist intermediate status to avoid excessive writes

        return self.send_json(HTTPStatus.OK, cached_record)

    def _create_task_jimeng(self, payload: dict, meta: dict | None):
        """Create a video generation task via Jimeng (火山引擎) API."""
        content = payload.get("content", [])
        prompt_text = ""
        all_images_b64: list[str] = []

        for item in content:
            if not isinstance(item, dict):
                continue
            if item.get("type") == "text":
                prompt_text += item.get("text", "") + " "
            elif item.get("type") == "image_url":
                url_obj = item.get("image_url", {})
                url = url_obj.get("url", "")
                b64_data = None
                if url.startswith("data:"):
                    _, _, b64_body = url.partition(",")
                    b64_data = b64_body
                elif url.startswith("http"):
                    try:
                        opener = request.build_opener(request.ProxyHandler({}))
                        with opener.open(url, timeout=60) as resp:
                            raw_bytes = resp.read()
                        b64_data = base64.b64encode(raw_bytes).decode("ascii")
                    except Exception as exc:
                        print(f"[Jimeng] Failed to download image: {exc}")
                if b64_data:
                    all_images_b64.append(b64_data)

        first_frame_b64 = all_images_b64[0] if all_images_b64 else None

        prompt_text = prompt_text.strip()
        if not prompt_text:
            return self.send_error_json(HTTPStatus.BAD_REQUEST, "缺少视频描述文本")

        aspect_ratio = payload.get("ratio", "16:9")
        duration = payload.get("duration", 5)
        if duration == -1:
            duration = 5

        try:
            resp = _jimeng_create_video_task(
                prompt=prompt_text,
                aspect_ratio=aspect_ratio,
                duration=duration,
                image_b64=first_frame_b64,
                extra_images_b64=all_images_b64[1:] if len(all_images_b64) > 1 else None,
            )
        except error.HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="replace")
            try:
                err_data = json.loads(raw)
            except json.JSONDecodeError:
                err_data = {"error": raw}
            return self.send_json(exc.code, err_data)
        except Exception as exc:
            return self.send_error_json(HTTPStatus.BAD_GATEWAY, f"即梦请求失败: {exc}")

        # 解析即梦响应
        code = resp.get("code", -1)
        data = resp.get("data", {})
        jimeng_task_id = data.get("task_id", "")

        if code != 10000 or not jimeng_task_id:
            err_msg = resp.get("message", "") or data.get("message", "") or str(resp)
            return self.send_error_json(HTTPStatus.BAD_GATEWAY, f"即梦任务创建失败: {err_msg}")

        # 确定 req_key 以便后续轮询
        req_key = "jimeng_i2v_first_v30_1080" if first_frame_b64 else "jimeng_t2v_v30_1080p"

        task_id = _generate_jimeng_task_id()
        record = {
            "id": task_id,
            "status": "submitted",
            "jimeng_task_id": jimeng_task_id,
            "jimeng_req_key": req_key,
            "tracked_at": now_iso(),
            "model": payload.get("model", "jimeng-3.0-pro"),
            "content": {},
        }
        if meta:
            record["meta"] = meta
        record["request_payload"] = sanitize_payload_for_storage(payload)
        text_items = [item.get("text") for item in content if isinstance(item, dict) and item.get("type") == "text"]
        if text_items:
            record["title"] = text_items[0][:48]

        record = upsert_task_record(record)
        print(f"[Jimeng] Task created: local={task_id}, jimeng={jimeng_task_id}")
        return self.send_json(HTTPStatus.OK, record)

    def _poll_jimeng_task(self, cached_record: dict):
        """Poll a Jimeng video generation task."""
        jimeng_task_id = cached_record["jimeng_task_id"]
        req_key = cached_record.get("jimeng_req_key", "jimeng_t2v_v30_1080p")

        try:
            resp = _jimeng_poll_task(jimeng_task_id, req_key)
        except error.HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="replace")
            try:
                err_data = json.loads(raw)
            except json.JSONDecodeError:
                err_data = {"error": raw}
            return self.send_json(exc.code, err_data)
        except Exception as exc:
            return self.send_error_json(HTTPStatus.BAD_GATEWAY, f"即梦轮询失败: {exc}")

        code = resp.get("code", -1)
        data = resp.get("data", {})
        status = data.get("status", "")

        if code == 10000 and status == "done":
            video_url = data.get("video_url", "")
            if video_url:
                cached_record["status"] = "succeeded"
                cached_record["content"] = {"video_url": video_url}
                cached_record["_proxy"] = {"videoUrls": [video_url], "status": 200}
                upsert_task_record(cached_record)
                if STATE.get("auto_save", True):
                    cached_record = save_task_video(cached_record)
            else:
                cached_record["status"] = "failed"
                cached_record["error"] = "即梦未返回视频 URL"
                upsert_task_record(cached_record)
        elif status in ("failed", "error") or (code != 10000 and code != 0):
            err_msg = data.get("message", "") or resp.get("message", "") or f"code={code}"
            cached_record["status"] = "failed"
            cached_record["error"] = f"即梦生成失败: {err_msg}"
            upsert_task_record(cached_record)
        else:
            # Still processing
            cached_record["status"] = "processing"

        return self.send_json(HTTPStatus.OK, cached_record)

    def save_library_item(self):
        try:
            data = self.read_json()
        except ValueError:
            return
        task_id = (data.get("taskId") or "").strip()
        if not task_id:
            return self.send_error_json(HTTPStatus.BAD_REQUEST, "缺少 taskId")

        record = find_task_record(task_id)
        if not record:
            if not _looks_like_upstream_task_id(task_id):
                return self.send_error_json(HTTPStatus.NOT_FOUND, "任务不存在")
            upstream = self.proxy_upstream("GET", f"{UPSTREAM_BASE}/{task_id}", return_data=True)
            if not isinstance(upstream, tuple):
                return self.send_error_json(HTTPStatus.BAD_GATEWAY, "上游返回异常")
            status, response_data = upstream
            if status >= 400:
                return self.send_json(status, response_data)
            record = build_task_record(response_data)

        if record.get("status") != "succeeded":
            return self.send_error_json(HTTPStatus.BAD_REQUEST, "任务还没有成功完成，暂时无法保存到本地")

        record = save_task_video(record)
        return self.send_json(HTTPStatus.OK, {"message": "视频已保存到本地作品库。", "task": record})

    def open_storage_directory(self):
        try:
            if sys.platform == "win32":
                os.startfile(str(VIDEO_DIR))
            elif sys.platform == "darwin":
                subprocess.Popen(["open", str(VIDEO_DIR)])
            else:
                subprocess.Popen(["xdg-open", str(VIDEO_DIR)])
        except OSError as exc:
            return self.send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, f"无法打开目录: {exc}")
        return self.send_json(HTTPStatus.OK, {"message": f"已尝试打开目录 {VIDEO_DIR}"})

    # --- Workflow: Project & AI handlers ---

    def create_project(self):
        try:
            data = self.read_json()
        except ValueError:
            return
        title = data.get("title", "未命名项目")
        raw_input = data.get("raw_input", "")
        project_id = generate_project_id()

        # 处理参考图片
        import base64 as _b64
        ref_images_data = data.get("reference_images", [])
        ref_image_urls: list[str] = []
        if ref_images_data and isinstance(ref_images_data, list):
            project_dir = ensure_project_dir(project_id)
            for i, img_data in enumerate(ref_images_data[:5]):  # 最多 5 张
                if not img_data or not isinstance(img_data, str):
                    continue
                filename = f"reference_{i + 1:02d}.png"
                target = project_dir / "assets" / filename
                # 去除 data URL 前缀
                raw = img_data.split(",", 1)[1] if "," in img_data else img_data
                try:
                    target.write_bytes(_b64.b64decode(raw))
                    ref_image_urls.append(f"/api/projects/{project_id}/assets/{filename}")
                except Exception:
                    pass  # 跳过解码失败的图片

        project = {
            "id": project_id,
            "title": title,
            "status": "draft",
            "created_at": now_iso(),
            "updated_at": now_iso(),
            "script": {
                "raw_input": raw_input,
                "analysis": None,
                "chat_history": [],
            },
            "characters": [],
            "scenes": [],
            "style_guide": None,
            "style_config": None,
            "reference_images": ref_image_urls,
            "episodes": [],
            "post_production": {
                "subtitles_srt": None,
                "final_output": None,
            },
        }
        persist_project(project_id, project)
        return self.send_json(HTTPStatus.CREATED, project)

    def update_project(self, project_id):
        existing = load_project(project_id)
        if not existing:
            return self.send_error_json(HTTPStatus.NOT_FOUND, "项目不存在")
        try:
            patch = self.read_json()
        except ValueError:
            return
        # Deep merge top-level keys
        for key, value in patch.items():
            if key in ("id", "created_at"):
                continue
            existing[key] = value
        persist_project(project_id, existing)
        return self.send_json(HTTPStatus.OK, existing)

    def upload_project_asset(self, project_id):
        """Save base64-encoded image data as project asset."""
        try:
            data = self.read_json()
        except ValueError:
            return
        image_data = data.get("image_data", "")
        filename = data.get("filename", "")
        if not image_data:
            return self.send_error_json(HTTPStatus.BAD_REQUEST, "缺少 image_data")
        project_dir = ensure_project_dir(project_id)
        if not filename:
            import time
            filename = f"asset-{int(time.time() * 1000)}.png"
        import base64
        # 文件名安全校验：禁止路径穿越
        safe_filename = Path(filename).name  # 只取文件名部分，去除任何路径
        if not safe_filename or safe_filename.startswith(".") or ".." in filename:
            return self.send_error_json(HTTPStatus.BAD_REQUEST, "无效的文件名")
        target = project_dir / "assets" / safe_filename
        # Strip data URL prefix if present
        if "," in image_data:
            image_data = image_data.split(",", 1)[1]
        target.write_bytes(base64.b64decode(image_data))
        return self.send_json(HTTPStatus.OK, {
            "filename": safe_filename,
            "asset_url": f"/api/projects/{project_id}/assets/{safe_filename}",
        })

    def restore_trash_item(self):
        try:
            data = self.read_json()
        except ValueError:
            return
        item_type = (data.get("type") or "").strip()
        item_id = (data.get("id") or "").strip()
        if not item_type or not item_id:
            return self.send_error_json(HTTPStatus.BAD_REQUEST, "缺少 type 或 id")
        if item_type not in ("task", "asset"):
            return self.send_error_json(HTTPStatus.BAD_REQUEST, "type 必须为 task 或 asset")
        if restore_from_trash(item_type, item_id):
            return self.send_json(HTTPStatus.OK, {"message": "已从回收站恢复"})
        return self.send_error_json(HTTPStatus.NOT_FOUND, "回收站中未找到该项目")

    def empty_trash_handler(self):
        count = empty_trash()
        return self.send_json(HTTPStatus.OK, {"message": f"已清空回收站，共删除 {count} 个项目"})

    def toggle_task_favorite(self, task_id):
        result = toggle_favorite(task_id)
        if result is None:
            return self.send_error_json(HTTPStatus.NOT_FOUND, "任务不存在")
        return self.send_json(HTTPStatus.OK, {"favorite": result, "message": "已收藏" if result else "已取消收藏"})

    @staticmethod
    def _resolve_local_urls(payload: dict):
        """Convert all local URL references to base64 data URIs before upstream forwarding.

        Handles both image_url and video_url content items.
        Supported local path patterns:
          - /api/projects/{id}/assets/{filename}  (storyboard images, character views)
          - /media/videos/{filename}              (generated video files)
        """
        import re as _re
        content = payload.get("content")
        if not isinstance(content, list):
            return

        _patterns = [
            (r"^/api/projects/([^/]+)/assets/(.+)$", PROJECTS_DIR),
            (r"^/media/videos/(.+)$", VIDEO_DIR),
        ]

        for item in content:
            if not isinstance(item, dict):
                continue

            # Handle image_url
            for url_key in ("image_url", "video_url"):
                url_obj = item.get(url_key)
                if not isinstance(url_obj, dict):
                    continue
                url = url_obj.get("url", "")
                if not url or url.startswith("data:") or url.startswith("http"):
                    continue

                resolved = False
                # Pattern 1: /api/projects/{id}/assets/{filename}
                m = _re.match(r"^/api/projects/([^/]+)/assets/(.+)$", url)
                if m:
                    project_id, filename = m.group(1), m.group(2)
                    if _is_safe_id(project_id):
                        asset_file = (PROJECTS_DIR / project_id / "assets" / filename).resolve()
                        if asset_file.exists() and asset_file.is_file():
                            raw = asset_file.read_bytes()
                            guessed, _ = mimetypes.guess_type(str(asset_file))
                            mime = guessed or ("image/png" if url_key == "image_url" else "video/mp4")
                            b64 = base64.b64encode(raw).decode("ascii")
                            url_obj["url"] = f"data:{mime};base64,{b64}"
                            resolved = True

                # Pattern 2: /media/videos/{filename}
                if not resolved:
                    m = _re.match(r"^/media/videos/(.+)$", url)
                    if m:
                        filename = m.group(1)
                        video_file = (VIDEO_DIR / filename).resolve()
                        if video_file.exists() and video_file.is_file():
                            raw = video_file.read_bytes()
                            guessed, _ = mimetypes.guess_type(str(video_file))
                            mime = guessed or "video/mp4"
                            b64 = base64.b64encode(raw).decode("ascii")
                            url_obj["url"] = f"data:{mime};base64,{b64}"

    @staticmethod
    def _make_opener(target_url: str = ""):
        """Return a urllib opener that bypasses system/env proxies.

        The local machine often has http_proxy / https_proxy env vars set
        (e.g. Clash on 127.0.0.1:7897).  urllib's default opener honours
        those vars, causing upstream requests to zlhub.xiaowaiyou.cn to
        fail with 502.  Using ``ProxyHandler({})`` explicitly disables
        all proxy resolution so requests go direct.
        """
        return request.build_opener(request.ProxyHandler({}))

    @staticmethod
    def _normalize_messages(data: dict) -> dict:
        """Convert system-role messages for Claude compatibility.

        Claude Messages API rejects role:"system" inside messages array.
        Extract system messages and prepend their content to the first user message.
        """
        messages = data.get("messages", [])
        if not messages:
            return data

        system_parts = []
        non_system = []
        for msg in messages:
            if msg.get("role") == "system":
                system_parts.append(msg.get("content", ""))
            else:
                non_system.append(msg)

        if system_parts and non_system:
            system_text = "\n\n".join(system_parts)
            # Prepend system content to the first user message
            if non_system[0].get("role") == "user":
                non_system[0] = {
                    **non_system[0],
                    "content": f"[System Instructions]\n{system_text}\n\n[User Request]\n{non_system[0].get('content', '')}",
                }
            else:
                # Insert as first user message
                non_system.insert(0, {"role": "user", "content": system_text})

        data["messages"] = non_system
        data.pop("system", None)
        return data

    def proxy_ai_chat(self):
        """Proxy chat completion request to upstream LLM (non-streaming)."""
        try:
            data = self.read_json()
        except ValueError:
            return
        api_key = get_ai_chat_key()
        if not api_key:
            return self.send_error_json(HTTPStatus.BAD_REQUEST, "还没有设置 API Key")

        # Normalize: extract system messages to top-level param
        data = self._normalize_messages(data)
        # Ensure stream is off
        data["stream"] = False
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        req = request.Request(STATE["ai_chat_base"], data=body, headers=headers, method="POST")
        opener = self._make_opener(STATE["ai_chat_base"])
        try:
            with opener.open(req, timeout=600) as response:
                raw = response.read()
                status = response.status
        except error.HTTPError as exc:
            raw = exc.read()
            status = exc.code
        except error.URLError as exc:
            return self.send_error_json(HTTPStatus.BAD_GATEWAY, f"AI 请求失败: {exc.reason}")

        try:
            result = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            result = {"raw": raw.decode("utf-8", errors="replace")}
        return self.send_json(status, result)

    def proxy_ai_chat_stream(self):
        """Proxy streaming chat completion request, forwarding SSE chunks."""
        try:
            data = self.read_json()
        except ValueError:
            return
        api_key = get_ai_chat_key()
        if not api_key:
            return self.send_error_json(HTTPStatus.BAD_REQUEST, "还没有设置 API Key")

        # Normalize: extract system messages to top-level param
        data = self._normalize_messages(data)
        data["stream"] = True
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        req = request.Request(STATE["ai_chat_base"], data=body, headers=headers, method="POST")
        opener = self._make_opener(STATE["ai_chat_base"])

        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("X-Accel-Buffering", "no")
        self.add_cors_headers()
        self.end_headers()

        try:
            with opener.open(req, timeout=300) as response:
                while True:
                    line = response.readline()
                    if not line:
                        break
                    self.wfile.write(line)
                    self.wfile.flush()
        except (error.HTTPError, error.URLError, OSError) as exc:
            err_line = f"data: {json.dumps({'error': str(exc)})}\n\n".encode("utf-8")
            try:
                self.wfile.write(err_line)
                self.wfile.flush()
            except OSError:
                pass

    def proxy_ai_image(self):
        """Start async image generation job; returns job_id immediately to avoid proxy timeout."""
        try:
            data = self.read_json()
        except ValueError:
            return

        project_id = data.pop("project_id", None)
        asset_filename = data.pop("asset_filename", None)

        import uuid
        job_id = str(uuid.uuid4())
        with _image_jobs_lock:
            _image_jobs[job_id] = {"status": "pending"}

        image_base = STATE.get("ai_image_base", "")
        image_model = STATE.get("ai_image_model", "")
        if _is_gemini_mode() and ("generativelanguage.googleapis.com" in image_base or image_model.startswith("imagen") or image_model.startswith("nano-banana")):
            # Gemini Imagen path (only when image base points to Gemini)
            prompt = data.get("prompt", "")
            pixel_size = data.get("size", "1024x1536")
            ar_map = {"1024x1024": "1:1", "1024x1536": "3:4", "1536x1024": "4:3", "2k": "1:1", "3k": "1:1"}
            aspect_ratio = ar_map.get(pixel_size, "1:1")
            # 参考图（角色三视图锚定）
            reference_images = data.get("reference_images") or None
            # 如果传了 reference_image_urls，从本地文件读取 base64
            ref_urls = data.get("reference_image_urls") or []
            if ref_urls and project_id and not reference_images:
                reference_images = []
                for ref_url in ref_urls:
                    # /api/projects/{id}/assets/xxx.png → storage/projects/{id}/assets/xxx.png
                    if ref_url.startswith("/api/projects/"):
                        local_path = STATIC_DIR / "storage" / ref_url.replace("/api/", "").lstrip("/")
                        if local_path.exists():
                            import base64 as b64mod
                            img_data = b64mod.b64encode(local_path.read_bytes()).decode("ascii")
                            mime = "image/png" if str(local_path).endswith(".png") else "image/jpeg"
                            reference_images.append({"data": img_data, "mimeType": mime})
            t = threading.Thread(
                target=_run_gemini_image_job,
                args=(job_id, prompt, aspect_ratio, project_id, asset_filename, reference_images or None),
                daemon=True,
            )
        else:
            # Legacy Zhonglian path
            api_key = get_api_key()
            if not api_key:
                return self.send_error_json(HTTPStatus.BAD_REQUEST, "还没有设置 API Key")
            if "n" in data or "sequential_image_generation" not in data:
                pixel_size = data.pop("size", "1024x1536")
                size_map = {"1024x1024": "2k", "1024x1536": "2k", "1536x1024": "2k", "2048x2048": "2k", "2K": "2k", "1K": "2k", "3K": "3k"}
                data.pop("n", None)
                data.setdefault("sequential_image_generation", "disabled")
                data.setdefault("response_format", "url")
                data["size"] = size_map.get(pixel_size, "2k")
                data.setdefault("stream", False)
                data.setdefault("watermark", False)
            image_url = STATE["ai_image_base"]
            t = threading.Thread(
                target=_run_image_job,
                args=(job_id, data, api_key, project_id, asset_filename, image_url),
                daemon=True,
            )

        t.daemon = True
        t.start()
        return self.send_json(HTTPStatus.ACCEPTED, {"job_id": job_id, "status": "pending"})

    def get_image_job_status(self, job_id: str):
        """Return current status of an async image generation job."""
        with _image_jobs_lock:
            job = _image_jobs.get(job_id)
        if job is None:
            return self.send_error_json(HTTPStatus.NOT_FOUND, "任务不存在")
        return self.send_json(HTTPStatus.OK, job)

    def render_project(self, project_id):
        """
        Render final video using 7-stage composition pipeline.

        Supports: subtitle mode, voiceover, BGM, quality, transition style,
        and resume from failed stage.
        """
        project = load_project(project_id)
        if not project:
            return self.send_error_json(HTTPStatus.NOT_FOUND, "项目不存在")

        # Parse request body for compose config
        compose_config = {
            "include_subtitles": True,
            "subtitle_mode": "burn",
            "include_voiceover": False,
            "include_bgm": False,
            "bgm_source": "auto",
            "bgm_path": "",
            "bgm_volume": 0.3,
            "output_quality": "1080p",
            "transition_style": "dissolve",
        }
        resume_from = None

        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length > 0:
                body = json.loads(self.rfile.read(content_length))
                compose_config.update({
                    k: body[k] for k in compose_config if k in body
                })
                resume_from = body.get("resume_from_stage")
        except (json.JSONDecodeError, ValueError):
            pass  # Use defaults

        # Collect video files from shots
        video_files = []
        shots_for_srt = []
        for ep in project.get("episodes", []):
            for shot in ep.get("shots", []):
                video_path = shot.get("video_local_path") or shot.get("video_url", "")
                if video_path:
                    if video_path.startswith("/media/videos/"):
                        abs_path = VIDEO_DIR / video_path.split("/")[-1]
                    elif video_path.startswith("/api/projects/"):
                        parts = video_path.split("/assets/", 1)
                        if len(parts) == 2:
                            abs_path = (PROJECTS_DIR / project_id / "assets" / parts[1]).resolve()
                            # 路径穿越防护
                            if not str(abs_path).startswith(str((PROJECTS_DIR / project_id).resolve())):
                                continue
                        else:
                            continue
                    else:
                        # 安全校验：只允许 STORAGE_DIR 内的路径
                        abs_path = Path(video_path).resolve()
                        if not str(abs_path).startswith(str(STORAGE_DIR.resolve())):
                            continue
                    if abs_path.exists():
                        video_files.append(str(abs_path))
                        shots_for_srt.append(shot)

        if not video_files:
            return self.send_error_json(HTTPStatus.BAD_REQUEST, "没有可合成的视频片段")

        # Auto-save version before compositing (设计文档 §八)
        try:
            from version_manager import VersionManager
            vm = VersionManager()
            existing_output = project.get("post_production", {}).get("final_output")
            if existing_output:  # Only version if re-compositing
                vm.save_version(project_id, "step5", project, trigger="regenerate")
        except Exception:
            pass  # Version save is best-effort

        # Generate SRT subtitles from dialogue
        if compose_config.get("include_subtitles"):
            try:
                from video_composer import generate_srt
                srt_content = generate_srt(shots_for_srt)
                if srt_content:
                    project_dir = ensure_project_dir(project_id)
                    srt_path = project_dir / "output" / "subtitles.srt"
                    srt_path.parent.mkdir(parents=True, exist_ok=True)
                    srt_path.write_text(srt_content, encoding="utf-8")
                    compose_config["srt_path"] = str(srt_path)
                    # Also save SRT URL in project
                    project.setdefault("post_production", {})["subtitles_srt_path"] = str(srt_path)
            except Exception as exc:
                log.warning(f"SRT generation failed: {exc}")

        # Run staged composition in background thread
        import threading

        _compose_pid = project_id  # capture for closure (immutable str)

        def do_compose():
            try:
                from video_composer import VideoComposer
                cfg = _load_workflow_config()
                vc = VideoComposer(cfg)

                def _on_progress(progress: dict):
                    """Write compose progress to project data so frontend polling can read it."""
                    try:
                        proj = load_project(_compose_pid) or {}
                        proj.setdefault("post_production", {})["compose_progress"] = progress
                        persist_project(_compose_pid, proj)
                    except Exception:
                        pass

                result = vc.compose_video_staged(
                    _compose_pid, video_files, compose_config, resume_from,
                    progress_callback=_on_progress,
                )
                # Re-load project to avoid race with main thread
                proj = load_project(_compose_pid) or {}
                if result.get("final_output"):
                    proj["status"] = "done"
                    proj.setdefault("post_production", {})["final_output"] = (
                        f"/media/projects/{_compose_pid}/output/final_output.mp4"
                    )
                    proj["post_production"]["compose_config"] = compose_config
                else:
                    proj["status"] = "compositing_failed"
                    proj.setdefault("post_production", {})["last_error"] = result.get("stages_failed")
                    proj["post_production"]["compose_config"] = compose_config
                persist_project(_compose_pid, proj)
            except Exception as exc:
                proj = load_project(_compose_pid) or {}
                proj["status"] = "compositing_failed"
                proj.setdefault("post_production", {})["last_error"] = {
                    "code": "UNKNOWN",
                    "message": str(exc),
                }
                persist_project(_compose_pid, proj)

        threading.Thread(target=do_compose, daemon=True).start()

        project["status"] = "compositing"
        persist_project(project_id, project)

        return self.send_json(HTTPStatus.ACCEPTED, {
            "message": "合成已开始",
            "status": "compositing",
            "resume_from": resume_from,
            "stages_total": 7,
        })

    # ------------------------------------------------------------------
    # Batch Shot Video Generation (设计文档 §4.3 of 07)
    # ------------------------------------------------------------------

    def _handle_batch_shot_generate(self, project_id):
        """POST /api/projects/{id}/shots/generate-batch"""
        try:
            body = self.read_json()
        except (ValueError, AttributeError):
            return self.send_error_json(HTTPStatus.BAD_REQUEST, "无效的请求体")

        project = load_project(project_id)
        if not project:
            return self.send_error_json(HTTPStatus.NOT_FOUND, "项目不存在")

        shot_ids = body.get("shot_ids", [])
        generate_all = body.get("generate_all", False)

        # Collect shots from project
        all_shots = []
        for ep in project.get("episodes", []):
            for shot in ep.get("shots", []):
                all_shots.append(shot)

        if generate_all:
            target_shots = all_shots
        else:
            target_shots = [s for s in all_shots if s.get("shot_id") in shot_ids or s.get("id") in shot_ids]

        if not target_shots:
            return self.send_error_json(HTTPStatus.BAD_REQUEST, "没有找到匹配的镜头")

        # Auto-save version before regeneration
        try:
            from version_manager import VersionManager
            vm = VersionManager()
            vm.save_version(project_id, "step5", project, trigger="regenerate")
        except Exception:
            pass

        # Start batch generation in background
        import threading

        _batch_pid = project_id
        _batch_style = project.get("style_config")

        def do_batch():
            try:
                from video_composer import VideoComposer
                cfg = _load_workflow_config()
                vc = VideoComposer(cfg)
                vc.generate_all_videos(target_shots, _batch_style)
                # Re-load project to avoid race condition
                proj = load_project(_batch_pid) or {}
                persist_project(_batch_pid, proj)
            except Exception as exc:
                log.error("Batch shot generation failed: %s", exc)

        threading.Thread(target=do_batch, daemon=True).start()

        return self.send_json(HTTPStatus.ACCEPTED, {
            "message": "批量生成已开始",
            "total": len(target_shots),
            "submitted": len(target_shots),
        })

    # ------------------------------------------------------------------
    # Version History Handlers (设计文档 §八)
    # ------------------------------------------------------------------

    def _handle_version_restore(self, project_id, step, version_id):
        """POST /api/projects/{id}/versions/{step}/{version_id}/restore"""
        project = load_project(project_id)
        if not project:
            return self.send_error_json(HTTPStatus.NOT_FOUND, "项目不存在")

        try:
            from version_manager import VersionManager
            vm = VersionManager()
            result = vm.restore_version(project_id, step, version_id, current_data=project)
            if result is None:
                return self.send_error_json(HTTPStatus.NOT_FOUND, f"版本 {version_id} 不存在")

            # Apply restored data to project
            restored_data = result.get("data", {})
            if step == "step5":
                if "episodes" in restored_data:
                    project["episodes"] = restored_data["episodes"]
                if "post_production" in restored_data:
                    project["post_production"] = restored_data["post_production"]
            elif step == "step4":
                if "characters" in restored_data:
                    project["characters"] = restored_data["characters"]
            elif step == "step3":
                if "script" in restored_data:
                    project["script"] = restored_data["script"]
            elif step == "step2":
                if "style_config" in restored_data:
                    project["style_config"] = restored_data["style_config"]

            persist_project(project_id, project)

            return self.send_json(HTTPStatus.OK, {
                "message": result["message"],
                "auto_saved_as": result.get("auto_saved_as"),
            })
        except Exception as exc:
            return self.send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc))

    def _handle_version_create(self, project_id):
        """POST /api/projects/{id}/versions  — 手动创建版本快照"""
        try:
            body = self.read_json()
        except (ValueError, AttributeError):
            return self.send_error_json(HTTPStatus.BAD_REQUEST, "无效的请求体")

        step = body.get("step", "step5")
        label = body.get("label")

        project = load_project(project_id)
        if not project:
            return self.send_error_json(HTTPStatus.NOT_FOUND, "项目不存在")

        try:
            from version_manager import VersionManager
            vm = VersionManager()
            result = vm.save_version(
                project_id=project_id,
                step=step,
                data=project,
                trigger="manual_save",
                label=label,
            )
            return self.send_json(HTTPStatus.CREATED, result)
        except Exception as exc:
            return self.send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc))

    def proxy_upstream(self, method, url, payload=None, return_data=False):
        api_key = get_api_key()
        if not api_key:
            result = (HTTPStatus.BAD_REQUEST, {"error": "还没有设置 API Key。"})
            return result if return_data else self.send_json(*result)

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = request.Request(url, data=body, headers=headers, method=method)
        opener = self._make_opener(url)

        try:
            with opener.open(req, timeout=180) as response:
                raw = response.read()
                status = response.status
                content_type = response.headers.get("Content-Type", "application/json; charset=utf-8")
        except error.HTTPError as exc:
            raw = exc.read()
            status = exc.code
            content_type = exc.headers.get("Content-Type", "application/json; charset=utf-8")
        except error.URLError as exc:
            result = (HTTPStatus.BAD_GATEWAY, {"error": f"上游请求失败: {exc.reason}"})
            return result if return_data else self.send_json(*result)

        try:
            data = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            data = {"raw": raw.decode("utf-8", errors="replace")}

        if isinstance(data, dict):
            data.setdefault("_proxy", {})
            data["_proxy"]["status"] = status
            data["_proxy"]["videoUrls"] = extract_video_urls(data)
            data["_proxy"]["contentType"] = content_type

        result = (status, data)
        return result if return_data else self.send_json(*result)

    def serve_media(self, path, head_only=False):
        relative = path.removeprefix("/media/")
        # Support both storage/videos/ and storage/projects/ paths
        target = (STORAGE_DIR / relative).resolve()
        # 路径穿越防护：确保目标文件在 STORAGE_DIR 内
        if not str(target).startswith(str(STORAGE_DIR.resolve())):
            return self.send_error_json(HTTPStatus.FORBIDDEN, "禁止访问该路径")
        if not target.exists() or not target.is_file():
            return self.send_error_json(HTTPStatus.NOT_FOUND, "本地文件不存在")
        guessed, _ = mimetypes.guess_type(str(target))
        return self.serve_file(target, guessed or "application/octet-stream", as_attachment="download=1" in self.path, head_only=head_only)

    def serve_file(self, file_path, content_type, as_attachment=False, head_only=False):
        if not file_path.exists():
            return self.send_error_json(HTTPStatus.NOT_FOUND, f"文件不存在: {file_path.name}")

        body = file_path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.add_cors_headers()
        if as_attachment:
            self.send_header("Content-Disposition", f'attachment; filename="{file_path.name}"')
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

    MAX_REQUEST_BODY = 50 * 1024 * 1024  # 50MB 上限

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}
        if length > self.MAX_REQUEST_BODY:
            self.send_error_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, f"请求体过大: {length} 字节，上限 {self.MAX_REQUEST_BODY} 字节")
            raise ValueError("request body too large")
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError as exc:
            self.send_error_json(HTTPStatus.BAD_REQUEST, f"JSON 解析失败: {exc}")
            raise ValueError("invalid json") from exc

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(int(status))
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.add_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, status, message):
        return self.send_json(status, {"error": message})

    def log_message(self, fmt, *args):
        try:
            sys.stderr.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), fmt % args))
        except OSError:
            # Detached/background launches can leave stdio handles unavailable.
            # Logging must never break the actual HTTP response path.
            return


def _app_handle_auth_register(self):
    if not self.ensure_auth_service():
        return
    try:
        data = self.read_json()
    except ValueError:
        return

    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if len(username) < 2 or len(username) > 64:
        return self.send_error_json(HTTPStatus.BAD_REQUEST, "用户名需要 2-64 个字符")
    if len(password) < 6 or len(password) > 128:
        return self.send_error_json(HTTPStatus.BAD_REQUEST, "密码需要 6-128 个字符")

    if DB_AVAILABLE:
        password_hash, salt = hash_password(password)
        db = get_db()
        try:
            with db.cursor() as cur:
                cur.execute(
                    "INSERT INTO users (username, password_hash, salt) VALUES (%s, %s, %s)",
                    (username, password_hash, salt),
                )
                user_id = cur.lastrowid
        except pymysql.err.IntegrityError:
            return self.send_error_json(HTTPStatus.CONFLICT, "用户名已存在")
    else:
        try:
            user = create_file_auth_user(username, password)
        except ValueError:
            return self.send_error_json(HTTPStatus.CONFLICT, "用户名已存在")
        user_id = user["id"]

    session_id = create_session(user_id, username)
    cookie = f"sid={session_id}; HttpOnly; SameSite=Lax; Path=/; Max-Age={SESSION_MAX_AGE}"
    return self.send_json_with_cookie(HTTPStatus.OK, {"ok": True, "user": {"id": user_id, "username": username}}, cookie)


def _app_handle_auth_login(self):
    if not self.ensure_auth_service():
        return
    try:
        data = self.read_json()
    except ValueError:
        return

    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if not username or not password:
        return self.send_error_json(HTTPStatus.BAD_REQUEST, "请输入用户名和密码")

    user_id = None

    # 1) Try database auth
    if DB_AVAILABLE:
        db = get_db()
        with db.cursor() as cur:
            cur.execute("SELECT id, password_hash, salt FROM users WHERE username = %s", (username,))
            row = cur.fetchone()
        if row:
            uid, password_hash, salt = row
            if verify_password(password, password_hash, salt):
                user_id = uid

    # 2) Fallback to file-based auth (demo_user + auth_users in .local-secrets.json)
    #    When DB is available, auto-migrate the user into MySQL on first file-auth login
    if user_id is None and is_file_auth_enabled():
        user = find_file_auth_user(username)
        if user and verify_file_auth_user(user, password):
            if DB_AVAILABLE:
                # Auto-migrate: insert into DB so future logins + session JOINs work
                pw_hash, pw_salt = hash_password(password)
                db = get_db()
                try:
                    with db.cursor() as cur:
                        cur.execute(
                            "INSERT INTO users (username, password_hash, salt) VALUES (%s, %s, %s)",
                            (username, pw_hash, pw_salt),
                        )
                        user_id = cur.lastrowid
                    print(f"[AUTH] 文件用户 '{username}' 已自动迁移到数据库 (id={user_id})")
                except Exception:
                    # Duplicate or other DB error – try to fetch existing row
                    with db.cursor() as cur:
                        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
                        r = cur.fetchone()
                    user_id = r[0] if r else user["id"]
            else:
                user_id = user["id"]

    if user_id is None:
        return self.send_error_json(HTTPStatus.UNAUTHORIZED, "用户名或密码错误")

    session_id = create_session(user_id, username)
    cookie = f"sid={session_id}; HttpOnly; SameSite=Lax; Path=/; Max-Age={SESSION_MAX_AGE}"
    return self.send_json_with_cookie(HTTPStatus.OK, {"ok": True, "user": {"id": user_id, "username": username}}, cookie)


def _app_handle_auth_logout(self):
    sid = self._parse_cookie_sid()
    if sid:
        delete_session(sid)
    cookie = "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
    return self.send_json_with_cookie(HTTPStatus.OK, {"ok": True}, cookie)


AppHandler.handle_auth_register = _app_handle_auth_register
AppHandler.handle_auth_login = _app_handle_auth_login
AppHandler.handle_auth_logout = _app_handle_auth_logout


class Handler(AppHandler):
    """Compatibility HTTP handler used by legacy tests."""

    def require_auth(self):
        return True


def main():
    global DB_AVAILABLE
    host = os.environ.get("VIDEO_CONSOLE_HOST", HOST)
    port = int(os.environ.get("VIDEO_CONSOLE_PORT", PORT))
    DB_AVAILABLE = init_db()
    server = ThreadingHTTPServer((host, port), AppHandler)
    print(f"Seedance Studio running on http://{host}:{port}")
    print(f"Video library directory: {VIDEO_DIR}")
    if DB_AVAILABLE:
        print("[AUTH] 用户认证已启用")
    else:
        print("[AUTH] 用户认证未启用（数据库不可用）")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
