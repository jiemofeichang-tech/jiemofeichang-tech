import json
import unittest
from http.server import HTTPServer
from http import HTTPStatus
from threading import Thread
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import urlopen

import server


class _FakeHandler:
    def __init__(self, path="/api/config", payload=None, cookie=None):
        self.path = path
        self.error = None
        self.response = None
        self.cookie = None
        self._payload = payload or {}
        self._cookie = cookie

    def send_error_json(self, status, message):
        self.error = (status, message)

    def send_json(self, status, payload):
        self.response = (status, payload)
        return self.response

    def send_json_with_cookie(self, status, payload, cookie_value):
        self.cookie = cookie_value
        self.response = (status, payload)
        return self.response

    def read_json(self):
        return self._payload

    def _parse_cookie_sid(self):
        return self._cookie

    def ensure_auth_service(self):
        return server.AppHandler.ensure_auth_service(self)


class AuthEnforcementTests(unittest.TestCase):
    def test_ensure_auth_service_returns_503_when_db_is_unavailable(self):
        handler = _FakeHandler()

        with patch.object(server, "DB_AVAILABLE", False), patch.object(server, "load_local_config", return_value={}):
            ok = server.AppHandler.ensure_auth_service(handler)

        self.assertFalse(ok)
        self.assertEqual(handler.error[0], HTTPStatus.SERVICE_UNAVAILABLE)
        self.assertIn("MySQL", handler.error[1])
        self.assertIn(".local-secrets.json", handler.error[1])

    def test_require_auth_fails_closed_when_db_is_unavailable(self):
        handler = _FakeHandler("/api/config")

        with patch.object(server, "DB_AVAILABLE", False), patch.object(server, "load_local_config", return_value={}):
            ok = server.AppHandler.require_auth(handler)

        self.assertFalse(ok)
        self.assertEqual(handler.error[0], HTTPStatus.SERVICE_UNAVAILABLE)

    def test_register_uses_file_auth_when_mysql_is_unavailable(self):
        config = {
            "use_file_auth": True,
            "demo_user": {"username": "admin", "password": "123456"},
        }

        def load_config():
            return {
                "use_file_auth": config["use_file_auth"],
                "demo_user": dict(config["demo_user"]),
                "auth_users": [dict(item) for item in config.get("auth_users", [])],
            }

        def persist_config(new_config):
            config.clear()
            config.update(new_config)

        handler = _FakeHandler(
            "/api/auth/register",
            payload={"username": "writer", "password": "secret123"},
        )

        with (
            patch.object(server, "DB_AVAILABLE", False),
            patch.object(server, "load_local_config", side_effect=load_config),
            patch.object(server, "persist_local_config", side_effect=persist_config),
        ):
            server.AppHandler.handle_auth_register(handler)

        self.assertIsNone(handler.error)
        self.assertIsNotNone(handler.response)
        self.assertEqual(handler.response[0], HTTPStatus.OK)
        self.assertEqual(handler.response[1]["user"]["username"], "writer")
        self.assertIn("sid=", handler.cookie)
        self.assertEqual(config["auth_users"][0]["username"], "writer")
        self.assertIn("password_hash", config["auth_users"][0])
        self.assertIn("salt", config["auth_users"][0])

    def test_login_and_me_use_file_auth_when_mysql_is_unavailable(self):
        config = {
            "use_file_auth": True,
            "demo_user": {"username": "admin", "password": "123456"},
        }

        login_handler = _FakeHandler(
            "/api/auth/login",
            payload={"username": "admin", "password": "123456"},
        )

        with patch.object(server, "DB_AVAILABLE", False), patch.object(server, "load_local_config", return_value=config):
            server.AppHandler.handle_auth_login(login_handler)

            self.assertIsNone(login_handler.error)
            self.assertIsNotNone(login_handler.response)
            self.assertEqual(login_handler.response[0], HTTPStatus.OK)
            self.assertIn("sid=", login_handler.cookie)

            sid = login_handler.cookie.split(";", 1)[0].split("=", 1)[1]
            me_handler = _FakeHandler("/api/auth/me", cookie=sid)
            server.AppHandler.handle_auth_me(me_handler)

        self.assertIsNone(me_handler.error)
        self.assertEqual(me_handler.response[0], HTTPStatus.OK)
        self.assertEqual(me_handler.response[1]["user"]["username"], "admin")

    def test_update_local_config_preserves_file_auth_settings(self):
        persisted = {}
        handler = _FakeHandler(
            "/api/session/key",
            payload={"userId": "new-user", "defaultModel": "demo-model", "autoSave": False},
        )

        def save_config(new_config):
            persisted.clear()
            persisted.update(new_config)

        with (
            patch.object(
                server,
                "load_local_config",
                return_value={
                    "api_key": "old-key",
                    "use_file_auth": True,
                    "demo_user": {"username": "admin", "password": "123456"},
                },
            ),
            patch.object(server, "persist_local_config", side_effect=save_config),
        ):
            server.AppHandler.update_local_config(handler)

        self.assertEqual(handler.response[0], HTTPStatus.OK)
        self.assertTrue(persisted["use_file_auth"])
        self.assertEqual(persisted["demo_user"]["username"], "admin")
        self.assertEqual(persisted["user_id"], "new-user")
        self.assertEqual(persisted["default_model"], "demo-model")
        self.assertFalse(persisted["auto_save"])

    def test_auth_me_still_returns_401_json_when_stderr_is_broken(self):
        class BrokenStderr:
            def write(self, *_args, **_kwargs):
                raise BrokenPipeError("broken stderr")

            def flush(self):
                return None

        httpd = HTTPServer(("127.0.0.1", 0), server.AppHandler)
        thread = Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(httpd.server_close)
        self.addCleanup(thread.join, 1)
        self.addCleanup(httpd.shutdown)

        with (
            patch.object(server, "DB_AVAILABLE", False),
            patch.object(
                server,
                "load_local_config",
                return_value={"use_file_auth": True, "demo_user": {"username": "admin", "password": "123456"}},
            ),
            patch.object(server.sys, "stderr", BrokenStderr()),
        ):
            with self.assertRaises(HTTPError) as ctx:
                urlopen(f"http://127.0.0.1:{httpd.server_address[1]}/api/auth/me", timeout=5)

        self.assertEqual(ctx.exception.code, HTTPStatus.UNAUTHORIZED)
        payload = json.loads(ctx.exception.read().decode("utf-8"))
        self.assertEqual(payload["ok"], False)
        self.assertIn("error", payload)


if __name__ == "__main__":
    unittest.main()
