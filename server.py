#!/usr/bin/env python3
import hashlib
import json
import mimetypes
import os
import secrets
import subprocess
import sys
import threading
from datetime import datetime, timedelta
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import error, parse, request

import pymysql

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
        "image_api_url": STATE.get("ai_image_base") or AI_IMAGE_BASE,
        "image_api_key": get_api_key() or "",
        "model": STATE.get("ai_chat_model") or "claude-opus-4-5",
    }

# ---------------------------------------------------------------------------

HOST = "127.0.0.1"
PORT = 8787
UPSTREAM_BASE = "https://zlhub.xiaowaiyou.cn/zhonglian/api/v1/proxy/ark/contents/generations/tasks"
AI_CHAT_BASE = "https://zlhub.xiaowaiyou.cn/zhonglian/api/v1/proxy/chat/completions"
AI_IMAGE_BASE = "https://zlhub.xiaowaiyou.cn/zhonglian/api/v1/proxy/images/generations"
CORS_ORIGIN = os.environ.get("CORS_ORIGIN", "*")
STATIC_DIR = Path(__file__).resolve().parent
INDEX_FILE = STATIC_DIR / "index.html"
APP_JS_FILE = STATIC_DIR / "app.js"
STYLES_FILE = STATIC_DIR / "styles.css"
LOCAL_CONFIG_FILE = STATIC_DIR / ".local-secrets.json"
STORAGE_DIR = STATIC_DIR / "storage"
VIDEO_DIR = STORAGE_DIR / "videos"
PROJECTS_DIR = STORAGE_DIR / "projects"
MANIFEST_FILE = STORAGE_DIR / "manifest.json"


def ensure_storage():
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    if not MANIFEST_FILE.exists():
        MANIFEST_FILE.write_text(json.dumps({"tasks": [], "assets": []}, ensure_ascii=False, indent=2), encoding="utf-8")


def ensure_project_dir(project_id):
    project_dir = PROJECTS_DIR / project_id
    (project_dir / "assets").mkdir(parents=True, exist_ok=True)
    (project_dir / "output").mkdir(parents=True, exist_ok=True)
    return project_dir


def load_project(project_id):
    project_file = PROJECTS_DIR / project_id / "project.json"
    if not project_file.exists():
        return None
    try:
        return json.loads(project_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def persist_project(project_id, data):
    project_dir = ensure_project_dir(project_id)
    data["updated_at"] = now_iso()
    (project_dir / "project.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data


def list_projects():
    if not PROJECTS_DIR.exists():
        return []
    projects = []
    for project_dir in PROJECTS_DIR.iterdir():
        if not project_dir.is_dir():
            continue
        project_file = project_dir / "project.json"
        if project_file.exists():
            try:
                data = json.loads(project_file.read_text(encoding="utf-8"))
                projects.append({
                    "id": data.get("id", project_dir.name),
                    "title": data.get("title", ""),
                    "status": data.get("status", "draft"),
                    "created_at": data.get("created_at", ""),
                    "updated_at": data.get("updated_at", ""),
                    "genre": data.get("script", {}).get("analysis", {}).get("genre", "") if data.get("script", {}).get("analysis") else "",
                    "character_count": len(data.get("characters", [])),
                    "episode_count": len(data.get("episodes", [])),
                })
            except json.JSONDecodeError:
                continue
    return sorted(projects, key=lambda p: p.get("updated_at", ""), reverse=True)


def delete_project(project_id):
    import shutil
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
    with request.urlopen(url, timeout=120) as response, target.open("wb") as output:
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
    try:
        data = json.loads(MANIFEST_FILE.read_text(encoding="utf-8"))
        # Ensure trash arrays exist
        data.setdefault("trash_tasks", [])
        data.setdefault("trash_assets", [])
        return data
    except json.JSONDecodeError:
        return {"tasks": [], "assets": [], "trash_tasks": [], "trash_assets": []}


def persist_manifest(data):
    ensure_storage()
    MANIFEST_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


LOCAL_CONFIG = load_local_config()
ensure_storage()

STATE = {
    "api_key": os.environ.get("VIDEO_MODEL_API_KEY", LOCAL_CONFIG.get("api_key", "")).strip(),
    "user_id": str(LOCAL_CONFIG.get("user_id", "")).strip(),
    "default_model": str(LOCAL_CONFIG.get("default_model", "")).strip(),
    "auto_save": bool(LOCAL_CONFIG.get("auto_save", True)),
    "ai_chat_base": LOCAL_CONFIG.get("ai_chat_base", AI_CHAT_BASE),
    "ai_image_base": LOCAL_CONFIG.get("ai_image_base", AI_IMAGE_BASE),
    "ai_chat_model": LOCAL_CONFIG.get("ai_chat_model", "claude-opus-4-6"),
    "ai_image_model": LOCAL_CONFIG.get("ai_image_model", "nano-banana-2"),
}


def get_api_key():
    return (STATE.get("api_key") or "").strip()


# ---------------------------------------------------------------------------
# Auth: Database helpers
# ---------------------------------------------------------------------------

_thread_local = threading.local()


def get_db():
    """Get a pymysql connection for the current thread (thread-local reuse)."""
    if not hasattr(_thread_local, "db") or _thread_local.db is None:
        cfg = load_local_config()
        _thread_local.db = pymysql.connect(
            host=cfg.get("db_host", "127.0.0.1"),
            port=int(cfg.get("db_port", 3306)),
            user=cfg.get("db_user", "root"),
            password=cfg.get("db_password", ""),
            database=cfg.get("db_name", "seedance_studio"),
            charset="utf8mb4",
            autocommit=True,
        )
    try:
        _thread_local.db.ping(reconnect=True)
    except Exception:
        _thread_local.db = None
        return get_db()
    return _thread_local.db


def init_db():
    """Create users/sessions tables if they don't exist."""
    try:
        db = get_db()
    except Exception as exc:
        print(f"[AUTH] 数据库连接失败: {exc}")
        print("[AUTH] 认证功能不可用，请检查 .local-secrets.json 中的数据库配置")
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
    print("[AUTH] 数据库表已就绪")
    return True


DB_AVAILABLE = False  # set to True after successful init_db()


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


def create_session(user_id: int) -> str:
    session_id = secrets.token_hex(32)
    expires = datetime.now() + timedelta(seconds=SESSION_MAX_AGE)
    db = get_db()
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO sessions (session_id, user_id, expires_at) VALUES (%s, %s, %s)",
            (session_id, user_id, expires),
        )
    return session_id


def validate_session(session_id: str):
    """Return (user_id, username) if session is valid, else None."""
    db = get_db()
    with db.cursor() as cur:
        cur.execute(
            "SELECT u.id, u.username FROM sessions s JOIN users u ON s.user_id = u.id "
            "WHERE s.session_id = %s AND s.expires_at > NOW()",
            (session_id,),
        )
        return cur.fetchone()


def delete_session(session_id: str):
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
        with request.urlopen(url, timeout=180) as response, target.open("wb") as output:
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
        self.send_header("Access-Control-Allow-Origin", CORS_ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
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

        # If DB is not available, skip auth
        if not DB_AVAILABLE:
            return True

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

        session_id = create_session(user_id)
        cookie = f"sid={session_id}; HttpOnly; SameSite=Lax; Path=/; Max-Age={SESSION_MAX_AGE}"
        return self.send_json_with_cookie(HTTPStatus.OK, {"ok": True, "user": {"id": user_id, "username": username}}, cookie)

    def handle_auth_login(self):
        try:
            data = self.read_json()
        except ValueError:
            return
        username = (data.get("username") or "").strip()
        password = data.get("password") or ""
        if not username or not password:
            return self.send_error_json(HTTPStatus.BAD_REQUEST, "请输入用户名和密码")

        db = get_db()
        with db.cursor() as cur:
            cur.execute("SELECT id, password_hash, salt FROM users WHERE username = %s", (username,))
            row = cur.fetchone()
        if not row:
            return self.send_error_json(HTTPStatus.UNAUTHORIZED, "用户名或密码错误")

        user_id, pw_hash, salt = row
        if not verify_password(password, pw_hash, salt):
            return self.send_error_json(HTTPStatus.UNAUTHORIZED, "用户名或密码错误")

        session_id = create_session(user_id)
        cookie = f"sid={session_id}; HttpOnly; SameSite=Lax; Path=/; Max-Age={SESSION_MAX_AGE}"
        return self.send_json_with_cookie(HTTPStatus.OK, {"ok": True, "user": {"id": user_id, "username": username}}, cookie)

    def handle_auth_logout(self):
        sid = self._parse_cookie_sid()
        if sid:
            delete_session(sid)
        cookie = "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
        return self.send_json_with_cookie(HTTPStatus.OK, {"ok": True}, cookie)

    def handle_auth_me(self):
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

        # Auth check for all other API routes
        if not self.require_auth():
            return

        if path == "/api/config":
            return self.send_json(
                HTTPStatus.OK,
                {
                    "hasApiKey": bool(get_api_key()),
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
                        "chatModel": STATE.get("ai_chat_model", "claude-opus-4-6"),
                        "imageModel": STATE.get("ai_image_model", "nano-banana-2"),
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
            if not task_id:
                return self.send_error_json(HTTPStatus.BAD_REQUEST, "缺少任务 ID")
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

        # --- Workflow: Project routes ---
        if path == "/api/projects":
            return self.send_json(HTTPStatus.OK, {"projects": list_projects()})

        # /api/projects/{id}/assets/{filename}
        import re
        asset_match = re.match(r"^/api/projects/([^/]+)/assets/(.+)$", path)
        if asset_match:
            project_id, filename = asset_match.group(1), asset_match.group(2)
            asset_file = PROJECTS_DIR / project_id / "assets" / filename
            if not asset_file.exists() or not asset_file.is_file():
                return self.send_error_json(HTTPStatus.NOT_FOUND, "资产文件不存在")
            guessed, _ = mimetypes.guess_type(str(asset_file))
            return self.serve_file(asset_file, guessed or "application/octet-stream")

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
                import os
                data_dir = Path("data/scripts")
                if data_dir.exists():
                    for f in data_dir.glob(f"script_*_{project_id}*.json"):
                        import json as _json
                        d = _json.loads(f.read_text(encoding="utf-8"))
                        if d.get("project_id") == project_id and d.get("status") == "done":
                            status["steps"]["script"] = {"done": True, "id": d.get("script_id")}
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
        if path == "/api/ai/chat":
            return self.proxy_ai_chat()
        if path == "/api/ai/chat/stream":
            return self.proxy_ai_chat_stream()
        if path == "/api/ai/image":
            return self.proxy_ai_image()

        import re
        render_match = re.match(r"^/api/projects/([^/]+)/render$", path)
        if render_match:
            return self.render_project(render_match.group(1))

        asset_upload_match = re.match(r"^/api/projects/([^/]+)/assets$", path)
        if asset_upload_match:
            return self.upload_project_asset(asset_upload_match.group(1))

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
        ai_chat_model = data.get("aiChatModel") or STATE.get("ai_chat_model", "claude-opus-4-6")
        ai_image_model = data.get("aiImageModel") or STATE.get("ai_image_model", "nano-banana-2")

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
            }
        )
        persist_local_config(
            {
                "api_key": api_key,
                "user_id": user_id,
                "default_model": default_model,
                "auto_save": auto_save,
                "ai_chat_base": ai_chat_base,
                "ai_image_base": ai_image_base,
                "ai_chat_model": ai_chat_model,
                "ai_image_model": ai_image_model,
            }
        )
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

        upstream = self.proxy_upstream("POST", UPSTREAM_BASE, payload, return_data=True)
        if not isinstance(upstream, tuple):
            return self.send_error_json(HTTPStatus.BAD_GATEWAY, "上游返回异常")
        status, response_data = upstream
        if status >= 400:
            return self.send_json(status, response_data)

        record = build_task_record(response_data, request_payload=payload, meta=meta)
        return self.send_json(status, record)

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
        target = project_dir / "assets" / filename
        import base64
        # Strip data URL prefix if present
        if "," in image_data:
            image_data = image_data.split(",", 1)[1]
        target.write_bytes(base64.b64decode(image_data))
        return self.send_json(HTTPStatus.OK, {
            "filename": filename,
            "asset_url": f"/api/projects/{project_id}/assets/{filename}",
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

    def proxy_ai_chat(self):
        """Proxy chat completion request to upstream LLM (non-streaming)."""
        try:
            data = self.read_json()
        except ValueError:
            return
        api_key = get_api_key()
        if not api_key:
            return self.send_error_json(HTTPStatus.BAD_REQUEST, "还没有设置 API Key")

        # Ensure stream is off
        data["stream"] = False
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        req = request.Request(STATE["ai_chat_base"], data=body, headers=headers, method="POST")
        try:
            with request.urlopen(req, timeout=300) as response:
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
        api_key = get_api_key()
        if not api_key:
            return self.send_error_json(HTTPStatus.BAD_REQUEST, "还没有设置 API Key")

        data["stream"] = True
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        req = request.Request(STATE["ai_chat_base"], data=body, headers=headers, method="POST")

        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("X-Accel-Buffering", "no")
        self.add_cors_headers()
        self.end_headers()

        try:
            with request.urlopen(req, timeout=300) as response:
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
        """Proxy image generation request and optionally download result to project assets."""
        try:
            data = self.read_json()
        except ValueError:
            return
        api_key = get_api_key()
        if not api_key:
            return self.send_error_json(HTTPStatus.BAD_REQUEST, "还没有设置 API Key")

        project_id = data.pop("project_id", None)
        asset_filename = data.pop("asset_filename", None)

        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        req = request.Request(STATE["ai_image_base"], data=body, headers=headers, method="POST")
        try:
            with request.urlopen(req, timeout=300) as response:
                raw = response.read()
                status = response.status
        except error.HTTPError as exc:
            raw = exc.read()
            status = exc.code
        except error.URLError as exc:
            return self.send_error_json(HTTPStatus.BAD_GATEWAY, f"图像生成请求失败: {exc.reason}")

        try:
            result = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            result = {"raw": raw.decode("utf-8", errors="replace")}

        # If project_id provided, download generated images to project assets
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

        return self.send_json(status, result)

    def render_project(self, project_id):
        """Render final video using FFmpeg concat + optional subtitle burn-in."""
        project = load_project(project_id)
        if not project:
            return self.send_error_json(HTTPStatus.NOT_FOUND, "项目不存在")

        # Collect video files from shots
        video_files = []
        for ep in project.get("episodes", []):
            for shot in ep.get("shots", []):
                video_path = shot.get("video_local_path") or shot.get("video_url", "")
                if video_path:
                    # Resolve to absolute path
                    if video_path.startswith("/media/videos/"):
                        abs_path = VIDEO_DIR / video_path.split("/")[-1]
                    elif video_path.startswith("/api/projects/"):
                        # Extract relative path within project
                        parts = video_path.split("/assets/", 1)
                        if len(parts) == 2:
                            abs_path = PROJECTS_DIR / project_id / "assets" / parts[1]
                        else:
                            continue
                    else:
                        abs_path = Path(video_path)
                    if abs_path.exists():
                        video_files.append(abs_path)

        if not video_files:
            return self.send_error_json(HTTPStatus.BAD_REQUEST, "没有可合成的视频片段")

        project_dir = ensure_project_dir(project_id)
        output_dir = project_dir / "output"

        # Write filelist for FFmpeg concat
        filelist = project_dir / "filelist.txt"
        with filelist.open("w", encoding="utf-8") as f:
            for vf in video_files:
                f.write(f"file '{vf}'\n")

        output_file = output_dir / "final.mp4"
        cmd = [
            "ffmpeg", "-y", "-f", "concat", "-safe", "0",
            "-i", str(filelist), "-c", "copy", str(output_file),
        ]

        try:
            subprocess.run(cmd, capture_output=True, check=True, timeout=600)
        except FileNotFoundError:
            return self.send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, "FFmpeg 未安装或不在 PATH 中")
        except subprocess.CalledProcessError as exc:
            return self.send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, f"FFmpeg 合成失败: {exc.stderr.decode('utf-8', errors='replace')[:500]}")
        except subprocess.TimeoutExpired:
            return self.send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, "FFmpeg 合成超时")

        # Optional subtitle burn-in
        srt_content = project.get("post_production", {}).get("subtitles_srt")
        if srt_content:
            srt_file = project_dir / "subtitles.srt"
            srt_file.write_text(srt_content, encoding="utf-8")
            output_with_sub = output_dir / "final_sub.mp4"
            sub_cmd = [
                "ffmpeg", "-y", "-i", str(output_file),
                "-vf", f"subtitles='{srt_file}'",
                "-c:a", "copy", str(output_with_sub),
            ]
            try:
                subprocess.run(sub_cmd, capture_output=True, check=True, timeout=600)
                output_file = output_with_sub
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
                pass  # Fall back to version without subtitles

        # Update project
        project.setdefault("post_production", {})["final_output"] = f"/api/projects/{project_id}/assets/../output/{output_file.name}"
        persist_project(project_id, project)

        return self.send_json(HTTPStatus.OK, {
            "message": "合成完成",
            "output_url": f"/media/projects/{project_id}/output/{output_file.name}",
            "output_path": str(output_file),
        })

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

        try:
            with request.urlopen(req, timeout=180) as response:
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
        target = STORAGE_DIR / relative
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

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}
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
        sys.stderr.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), fmt % args))


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
