import json
import unittest
from http.server import HTTPServer
from threading import Thread
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import urlopen

import server


class _FakeHandler:
    def __init__(self, payload=None):
        self.error = None
        self.response = None
        self._payload = payload or {}

    def send_error_json(self, status, message):
        self.error = (status, message)
        return self.error

    def send_json(self, status, payload):
        self.response = (status, payload)
        return self.response

    def read_json(self):
        return self._payload

    def proxy_upstream(self, *_args, **_kwargs):
        raise AssertionError("proxy_upstream should not be called")


class TaskRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = HTTPServer(("127.0.0.1", 0), server.AppHandler)
        cls.thread = Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.httpd.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.thread.join(timeout=1)
        cls.httpd.server_close()

    def _get_json(self, path):
        try:
            with urlopen(f"{self.base_url}{path}", timeout=5) as response:
                return response.status, json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            return exc.code, json.loads(exc.read().decode("utf-8"))

    def test_get_task_reuses_cached_terminal_record_without_proxying_upstream(self):
        cached = {
            "id": "cgt-20260329000000-abcd1",
            "status": "succeeded",
            "title": "cached task",
        }

        with (
            patch.object(server.AppHandler, "require_auth", return_value=True),
            patch.object(server, "find_task_record", return_value=cached),
            patch.object(server.AppHandler, "proxy_upstream") as proxy_upstream,
        ):
            status, payload = self._get_json(f"/api/tasks/{cached['id']}")

        self.assertEqual(status, 200)
        self.assertEqual(payload["id"], cached["id"])
        self.assertEqual(payload["status"], "succeeded")
        proxy_upstream.assert_not_called()

    def test_get_task_returns_404_for_invalid_format_without_proxying_upstream(self):
        with (
            patch.object(server.AppHandler, "require_auth", return_value=True),
            patch.object(server, "find_task_record", return_value=None),
            patch.object(server.AppHandler, "proxy_upstream") as proxy_upstream,
        ):
            status, payload = self._get_json("/api/tasks/not-a-real-task-id")

        self.assertEqual(status, 404)
        self.assertIn("error", payload)
        proxy_upstream.assert_not_called()

    def test_save_library_rejects_invalid_task_id_without_proxying_upstream(self):
        handler = _FakeHandler(payload={"taskId": "not-a-real-task-id"})

        with (
            patch.object(server, "find_task_record", return_value=None),
            patch.object(server.AppHandler, "proxy_upstream") as proxy_upstream,
        ):
            server.AppHandler.save_library_item(handler)

        self.assertEqual(handler.error[0], 404)
        proxy_upstream.assert_not_called()


if __name__ == "__main__":
    unittest.main()
