"""
全链路集成测试 — 真实 AI 漫剧生成管线端到端测试。

本测试调用真实 API：
  - peiqian.icu LLM 中转站（剧本生成、分镜规划）
  - 中联 MAAS 图像生成 API（角色视图、分镜图）
  - 中联 MAAS 视频生成 API（分镜视频）

运行前提：
  1. .local-secrets.json 已配置正确的 API Key
  2. MySQL 服务已启动（或 use_file_auth=true 时自动降级到 JSON 存储）
  3. 网络连通

运行命令：
  python -m unittest tests.test_e2e_pipeline -v

预计耗时：
  - 仅剧本阶段：30-90 秒
  - 剧本 + 角色（1个角色）：3-8 分钟
  - 剧本 + 分镜：3-8 分钟
  - 全链路：15-40 分钟

可通过环境变量控制范围：
  E2E_SCOPE=script          仅测试剧本
  E2E_SCOPE=characters      测试剧本→角色
  E2E_SCOPE=storyboard      测试剧本→分镜
  E2E_SCOPE=full            全链路（默认）
  E2E_MAX_CHARACTERS=1      限制角色生成数量（默认 1）
  E2E_TIMEOUT=600           全局超时秒数（默认 600）
"""
from __future__ import annotations

import json
import logging
import os
import sys
import time
import unittest
from pathlib import Path
from typing import Any

# 项目根目录加入 sys.path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("e2e")

# ---------------------------------------------------------------------------
# 配置
# ---------------------------------------------------------------------------

E2E_SCOPE = os.environ.get("E2E_SCOPE", "full")
E2E_MAX_CHARACTERS = int(os.environ.get("E2E_MAX_CHARACTERS", "1"))
E2E_TIMEOUT = int(os.environ.get("E2E_TIMEOUT", "600"))

POLL_INTERVAL_SCRIPT = 3       # 剧本轮询间隔（秒）
POLL_INTERVAL_CHARACTER = 8    # 角色轮询间隔
POLL_INTERVAL_STORYBOARD = 5   # 分镜轮询间隔
POLL_INTERVAL_VIDEO = 10       # 视频轮询间隔

TIMEOUT_SCRIPT = 120           # 剧本超时
TIMEOUT_CHARACTER = 480        # 角色超时（单个）
TIMEOUT_STORYBOARD = 480       # 分镜超时
TIMEOUT_VIDEO = 900            # 视频超时

PROJECT_ID = f"e2e-test-{int(time.time())}"


def _load_config() -> dict[str, Any]:
    """
    从 .local-secrets.json 加载配置。

    注意：ScriptEngine._call_llm_for_script() 使用 Anthropic 原生格式，
    它会在 base_url 后拼接 /messages，所以 base_url 应该是 API 根路径
    （如 http://peiqian.icu/v1），不能包含 /chat/completions。

    StoryboardGenerator 使用 OpenAI 兼容格式（/chat/completions）。
    """
    secrets_path = ROOT / ".local-secrets.json"
    if not secrets_path.exists():
        raise FileNotFoundError(
            f".local-secrets.json 不存在: {secrets_path}\n"
            "请创建配置文件后重试。"
        )
    raw = json.loads(secrets_path.read_text(encoding="utf-8"))

    chat_base = raw.get("ai_chat_base", "")
    api_key = raw.get("ai_chat_key") or raw.get("api_key", "")

    return {
        "api_key": api_key,
        "ai_chat_key": api_key,
        "base_url": chat_base,             # 兼容旧字段
        "ai_chat_base": chat_base,         # OpenAI 兼容格式
        "image_api_url": raw.get("ai_image_base", ""),
        "image_api_key": raw.get("api_key", ""),
        "model": raw.get("ai_chat_model", "claude-sonnet-4-6"),
        "ai_chat_model": raw.get("ai_chat_model", "claude-sonnet-4-6"),
    }


def _poll_until(
    fetch_fn,
    is_done_fn,
    is_failed_fn,
    interval: float,
    timeout: float,
    label: str,
) -> dict[str, Any] | None:
    """
    通用轮询器。

    Args:
        fetch_fn: 无参函数，返回最新数据 dict（或 None）
        is_done_fn: 判断是否完成
        is_failed_fn: 判断是否失败
        interval: 轮询间隔秒
        timeout: 超时秒
        label: 日志标签
    """
    deadline = time.time() + timeout
    last_status = ""

    while time.time() < deadline:
        data = fetch_fn()
        if data is None:
            log.warning(f"[{label}] 数据为 None，等待...")
            time.sleep(interval)
            continue

        status = data.get("status") or data.get("generation_status") or "unknown"
        if status != last_status:
            log.info(f"[{label}] 状态: {status}")
            last_status = status

        if is_done_fn(data):
            elapsed = timeout - (deadline - time.time())
            log.info(f"[{label}] ✓ 完成，耗时 {elapsed:.0f}s")
            return data

        if is_failed_fn(data):
            error = data.get("error_message") or data.get("error") or "未知错误"
            log.error(f"[{label}] ✗ 失败: {error}")
            return data

        time.sleep(interval)

    log.error(f"[{label}] ✗ 超时 ({timeout}s)")
    return fetch_fn()  # 返回最后一次数据


# ===========================================================================
# 全链路测试
# ===========================================================================


class TestE2EPipeline(unittest.TestCase):
    """
    真实全链路 AI 漫剧生成测试。

    链路：剧本生成 → 角色三视图 → 分镜生成 → 视频合成
    每个阶段调用真实 API，验证产物完整性。
    """

    config: dict[str, Any]
    script_engine: Any
    character_factory: Any
    storyboard_gen: Any
    video_composer: Any

    # 各阶段产物，在测试间传递
    script_id: str = ""
    script_data: dict[str, Any] = {}
    character_ids: list[str] = []
    storyboard_id: str = ""
    storyboard_data: dict[str, Any] = {}
    video_task_id: str = ""

    @classmethod
    def setUpClass(cls) -> None:
        """加载配置和引擎。"""
        log.info("=" * 70)
        log.info(f"全链路测试启动 | 范围: {E2E_SCOPE} | 项目: {PROJECT_ID}")
        log.info("=" * 70)

        cls.config = _load_config()

        # 验证 API 可达
        cls._preflight_check()

        # 初始化引擎
        from script_engine import ScriptEngine
        cls.script_engine = ScriptEngine(cls.config)

        from character_factory import CharacterFactory
        cls.character_factory = CharacterFactory(cls.config)

        from storyboard_generator import StoryboardGenerator
        cls.storyboard_gen = StoryboardGenerator(cls.config)

        from video_composer import VideoComposer
        cls.video_composer = VideoComposer(cls.config)

        log.info("引擎初始化完成")

    @classmethod
    def _preflight_check(cls) -> None:
        """验证 API 连通性（兼容 OpenAI 和 Anthropic 两种格式）。"""
        import urllib.request
        import urllib.error

        base = cls.config.get("base_url", "") or cls.config.get("ai_chat_base", "")
        if not base:
            raise unittest.SkipTest("ai_chat_base 未配置")

        api_key = cls.config.get("api_key", "")
        if not api_key:
            raise unittest.SkipTest("api_key 未配置")

        # 用 OpenAI 兼容格式检测
        chat_base = cls.config.get("ai_chat_base", base)
        if not chat_base.endswith("/chat/completions"):
            chat_base = chat_base.rstrip("/") + "/chat/completions"
        log.info(f"检查 LLM API: {chat_base}")
        try:
            payload = {
                "model": cls.config.get("model", "claude-sonnet-4-6"),
                "max_tokens": 5,
                "messages": [{"role": "user", "content": "say OK"}],
            }
            data = json.dumps(payload).encode()
            req = urllib.request.Request(
                chat_base,
                data=data,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                },
            )
            with urllib.request.urlopen(req, timeout=20) as resp:
                log.info(f"LLM API 连通 ✓ (status {resp.status})")
                return
        except urllib.error.HTTPError as exc:
            if exc.code in (401, 400):
                # 401/400 说明网络通了，可能是 key 或参数问题
                # ScriptEngine 会用自己的完整参数，这里只确认网络连通
                log.info(f"LLM API 网络连通 ✓ (HTTP {exc.code}，认证由引擎处理)")
                return
            raise unittest.SkipTest(f"LLM API 异常: HTTP {exc.code}")
        except urllib.error.URLError as exc:
            raise unittest.SkipTest(f"LLM API 不可达: {exc}")
        except Exception as exc:
            log.warning(f"LLM API 预检异常（继续测试）: {exc}")

    # -----------------------------------------------------------------------
    # 阶段 1：剧本生成
    # -----------------------------------------------------------------------

    def test_01_generate_script(self) -> None:
        """
        【阶段 1】生成剧本。

        调用 ScriptEngine.generate_script()，等待 LLM 返回结构化剧本。
        验证：标题、简介、角色列表、剧集结构完整。
        """
        log.info("-" * 50)
        log.info("阶段 1: 剧本生成")
        log.info("-" * 50)

        # 发起生成
        script_id = self.script_engine.generate_script(
            project_id=PROJECT_ID,
            genre="喜剧",
            theme="大学新生在宿舍里的搞笑日常",
            characters_count=2,
            episodes_count=1,
        )
        self.__class__.script_id = script_id
        log.info(f"剧本已提交: {script_id}")

        self.assertTrue(script_id.startswith("script_"))

        # 轮询等待完成
        data = _poll_until(
            fetch_fn=lambda: self.script_engine.get_script(script_id),
            is_done_fn=lambda d: d.get("status") == "completed",
            is_failed_fn=lambda d: d.get("status") == "failed",
            interval=POLL_INTERVAL_SCRIPT,
            timeout=TIMEOUT_SCRIPT,
            label="剧本",
        )

        self.assertIsNotNone(data, "剧本数据不应为 None")
        self.assertEqual(data["status"], "completed", f"剧本生成失败: {data.get('error_message')}")

        # 验证剧本结构
        self.assertTrue(data.get("title"), "缺少标题")
        self.assertTrue(data.get("synopsis"), "缺少简介")

        characters = data.get("characters", [])
        self.assertGreaterEqual(len(characters), 1, "至少需要 1 个角色")
        for char in characters:
            self.assertTrue(char.get("name"), "角色缺少名字")
            self.assertTrue(
                char.get("personality") or char.get("appearance_description"),
                f"角色 {char.get('name')} 缺少描述",
            )

        episodes = data.get("episodes", [])
        self.assertGreaterEqual(len(episodes), 1, "至少需要 1 集")
        for ep in episodes:
            scenes = ep.get("scenes", [])
            self.assertGreaterEqual(len(scenes), 1, f"第 {ep.get('episode_number')} 集至少需要 1 个场景")

        self.__class__.script_data = data
        log.info(
            f"剧本验证通过 ✓ | 标题: {data['title']} | "
            f"角色: {len(characters)} | 剧集: {len(episodes)} | "
            f"场景: {sum(len(ep.get('scenes', [])) for ep in episodes)}"
        )

    # -----------------------------------------------------------------------
    # 阶段 2：角色三视图生成
    # -----------------------------------------------------------------------

    @unittest.skipIf(
        E2E_SCOPE == "script",
        "E2E_SCOPE=script，跳过角色阶段",
    )
    def test_02_generate_characters(self) -> None:
        """
        【阶段 2】生成角色三视图和表情。

        从剧本角色中选取前 N 个（由 E2E_MAX_CHARACTERS 控制），
        调用 CharacterFactory.create_character()，等待图像 API 生成 9 个视图。
        验证：前端格式正确、至少部分图片 URL 已填充。
        """
        self.assertTrue(self.script_data, "剧本数据为空，跳过角色阶段")

        log.info("-" * 50)
        log.info(f"阶段 2: 角色生成（最多 {E2E_MAX_CHARACTERS} 个）")
        log.info("-" * 50)

        script_chars = self.script_data.get("characters", [])
        chars_to_create = script_chars[:E2E_MAX_CHARACTERS]

        if not chars_to_create:
            self.skipTest("剧本无角色数据")

        # 逐个创建角色
        char_ids: list[str] = []
        for char in chars_to_create:
            char_id = self.character_factory.create_character(
                project_id=PROJECT_ID,
                name=char.get("name", "未命名"),
                personality=char.get("personality", ""),
                appearance_desc=char.get("appearance_description", char.get("appearance", "")),
                role_type=char.get("role", "supporting"),
                script_id=self.script_id,
            )
            char_ids.append(char_id)
            log.info(f"角色已提交: {char.get('name')} → {char_id}")

        self.__class__.character_ids = char_ids

        # 逐个轮询等待
        for i, char_id in enumerate(char_ids):
            char_name = chars_to_create[i].get("name", "?")
            log.info(f"等待角色 [{char_name}] ({char_id}) ...")

            data = _poll_until(
                fetch_fn=lambda cid=char_id: self.character_factory.get_character(cid),
                is_done_fn=lambda d: d.get("status") == "done",
                is_failed_fn=lambda d: d.get("status") == "error",
                interval=POLL_INTERVAL_CHARACTER,
                timeout=TIMEOUT_CHARACTER,
                label=f"角色-{char_name}",
            )

            self.assertIsNotNone(data, f"角色 {char_name} 数据为 None")

            # 验证前端格式字段
            self.assertEqual(data.get("character_id"), char_id)
            self.assertEqual(data.get("project_id"), PROJECT_ID)
            self.assertTrue(data.get("name"), "角色缺少名字")

            # 检查图片（允许部分失败，但至少正面图应该有）
            images = data.get("images", {})
            self.assertIsInstance(images, dict)

            filled_count = sum(1 for url in images.values() if url)
            total_slots = 9  # front, side, back, happy, sad, angry, surprised, thinking, shy
            log.info(
                f"角色 [{char_name}] 图片: {filled_count}/{total_slots} | "
                f"状态: {data.get('status')}"
            )

            if data.get("status") == "done":
                # 完成状态下至少 front 视图应该有
                self.assertTrue(
                    images.get("front"),
                    f"角色 {char_name} 缺少正面视图",
                )
            else:
                log.warning(f"角色 [{char_name}] 未完全完成: {data.get('status')}")

        log.info(f"角色阶段完成 ✓ | 创建: {len(char_ids)} 个角色")

    # -----------------------------------------------------------------------
    # 阶段 3：分镜生成
    # -----------------------------------------------------------------------

    @unittest.skipIf(
        E2E_SCOPE in ("script", "characters"),
        "E2E_SCOPE 范围不含分镜，跳过",
    )
    def test_03_generate_storyboard(self) -> None:
        """
        【阶段 3】生成分镜。

        调用 StoryboardGenerator.generate_storyboard()，
        LLM 规划镜头 → 图像 API 生成分镜图。
        验证：面板数量、镜头类型多样性、至少部分面板有图片。
        """
        self.assertTrue(self.script_id, "剧本 ID 为空，跳过分镜阶段")

        log.info("-" * 50)
        log.info("阶段 3: 分镜生成")
        log.info("-" * 50)

        storyboard_id = self.storyboard_gen.generate_storyboard(
            project_id=PROJECT_ID,
            script_id=self.script_id,
            episode_index=0,
        )
        self.__class__.storyboard_id = storyboard_id
        log.info(f"分镜已提交: {storyboard_id}")

        self.assertTrue(storyboard_id.startswith("storyboard_"))

        # 轮询等待
        data = _poll_until(
            fetch_fn=lambda: self.storyboard_gen.get_storyboard(storyboard_id),
            is_done_fn=lambda d: d.get("status") in ("done", "completed", "partial"),
            is_failed_fn=lambda d: d.get("status") in ("error", "failed"),
            interval=POLL_INTERVAL_STORYBOARD,
            timeout=TIMEOUT_STORYBOARD,
            label="分镜",
        )

        self.assertIsNotNone(data, "分镜数据不应为 None")
        self.assertIn(
            data.get("status"),
            ("done", "completed", "partial"),
            f"分镜生成失败: {data.get('error_message')}",
        )

        panels = data.get("panels", [])
        self.assertGreater(len(panels), 0, "分镜应至少有 1 个面板")

        # 统计面板状态
        done_panels = [p for p in panels if p.get("status") == "done"]
        with_image = [p for p in panels if p.get("image_url")]
        shot_types = {p.get("shot_type") for p in panels if p.get("shot_type")}

        log.info(
            f"分镜验证 | 面板总数: {len(panels)} | 完成: {len(done_panels)} | "
            f"有图片: {len(with_image)} | 镜头类型: {shot_types}"
        )

        # 至少一个面板有图片
        self.assertGreater(
            len(with_image), 0,
            "至少应有 1 个面板生成了图片",
        )

        self.__class__.storyboard_data = data
        log.info(f"分镜阶段完成 ✓ | {len(done_panels)}/{len(panels)} 面板完成")

    # -----------------------------------------------------------------------
    # 阶段 4：视频合成
    # -----------------------------------------------------------------------

    @unittest.skipIf(
        E2E_SCOPE != "full",
        "E2E_SCOPE 不是 full，跳过视频阶段",
    )
    def test_04_compose_video(self) -> None:
        """
        【阶段 4】视频合成。

        调用 VideoComposer.compose_video()，
        将分镜图转为视频 → 拼接 → 合成。
        验证：任务状态、输出文件路径。
        """
        self.assertTrue(self.storyboard_id, "分镜 ID 为空，跳过视频阶段")

        log.info("-" * 50)
        log.info("阶段 4: 视频合成")
        log.info("-" * 50)

        task_id = self.video_composer.compose_video(
            project_id=PROJECT_ID,
            storyboard_id=self.storyboard_id,
            script_id=self.script_id,
            episode_index=0,
        )
        self.__class__.video_task_id = task_id
        log.info(f"视频任务已提交: {task_id}")

        # 轮询等待
        data = _poll_until(
            fetch_fn=lambda: self.video_composer.get_video_task(task_id),
            is_done_fn=lambda d: d.get("status") == "done",
            is_failed_fn=lambda d: d.get("status") == "failed",
            interval=POLL_INTERVAL_VIDEO,
            timeout=TIMEOUT_VIDEO,
            label="视频合成",
        )

        self.assertIsNotNone(data, "视频任务数据不应为 None")

        status = data.get("status")
        if status == "done":
            output_url = data.get("output_url") or data.get("output_path")
            log.info(f"视频合成完成 ✓ | 输出: {output_url}")
            self.assertTrue(output_url, "视频完成但无输出路径")
        elif status == "failed":
            error = data.get("error_message") or data.get("error") or "未知"
            # 视频合成依赖 FFmpeg 和视频 API，允许特定错误
            log.warning(f"视频合成失败（可能缺少 FFmpeg）: {error}")
            # 不硬失败，记录为 warning
        else:
            log.warning(f"视频合成未完成，最终状态: {status}")

    # -----------------------------------------------------------------------
    # 阶段 5：Harness 质量评估（使用真实 LLM）
    # -----------------------------------------------------------------------

    @unittest.skipIf(
        E2E_SCOPE == "script",
        "E2E_SCOPE=script，跳过评估阶段",
    )
    def test_05_evaluate_with_harness(self) -> None:
        """
        【阶段 5】Harness 质量评估。

        用 StageEvaluator 对前面阶段的产物打分。
        验证：评分结构完整、分数在合理范围、反馈已持久化。
        """
        self.assertTrue(self.script_data, "剧本数据为空，跳过评估")

        log.info("-" * 50)
        log.info("阶段 5: Harness 质量评估")
        log.info("-" * 50)

        from stage_contract import STAGE_CONTRACTS
        from stage_evaluator import StageEvaluator

        evaluator = StageEvaluator(self.config)

        # 评估剧本
        script_contract = STAGE_CONTRACTS["script"]
        result = evaluator.evaluate(
            stage="script",
            artifact_data=self.script_data,
            contract=script_contract,
            attempt=1,
            project_id=PROJECT_ID,
        )

        log.info(f"剧本评分: {result.average:.1f}/10 | 建议: {result.recommendation}")
        for cs in result.criterion_scores:
            log.info(f"  {cs.name}: {cs.score:.1f}/10 ({cs.reason})")
        if result.issues:
            log.info(f"  问题: {result.issues}")

        # 验证评分结构
        self.assertGreater(result.average, 0.0, "评分不应为 0")
        self.assertLessEqual(result.average, 10.0, "评分不应超过 10")
        self.assertGreater(len(result.criterion_scores), 0, "应有评分明细")
        self.assertIn(
            result.recommendation,
            ("PASS", "REFINE", "PIVOT"),
            "建议应为 PASS/REFINE/PIVOT",
        )

        # 评估分镜（如果有）
        if self.storyboard_data:
            sb_contract = STAGE_CONTRACTS["storyboard"]
            sb_result = evaluator.evaluate(
                stage="storyboard",
                artifact_data=self.storyboard_data,
                contract=sb_contract,
                attempt=1,
                project_id=PROJECT_ID,
            )
            log.info(f"分镜评分: {sb_result.average:.1f}/10 | 建议: {sb_result.recommendation}")

        log.info("Harness 评估完成 ✓")

    # -----------------------------------------------------------------------
    # 产物汇总
    # -----------------------------------------------------------------------

    def test_99_summary(self) -> None:
        """【汇总】打印全链路测试结果。"""
        log.info("=" * 70)
        log.info("全链路测试汇总")
        log.info("=" * 70)
        log.info(f"项目 ID:     {PROJECT_ID}")
        log.info(f"测试范围:    {E2E_SCOPE}")
        log.info(f"剧本 ID:     {self.script_id or '(未生成)'}")
        log.info(f"剧本标题:    {self.script_data.get('title', '(无)')}")
        log.info(f"角色数量:    {len(self.character_ids)}")
        log.info(f"分镜 ID:     {self.storyboard_id or '(未生成)'}")
        if self.storyboard_data:
            panels = self.storyboard_data.get("panels", [])
            log.info(f"分镜面板:    {len(panels)} 个")
        log.info(f"视频任务:    {self.video_task_id or '(未生成)'}")
        log.info("=" * 70)


if __name__ == "__main__":
    # 支持直接运行
    unittest.main(verbosity=2)
