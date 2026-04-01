"""
stage_evaluator.py 单元测试。

测试结构化评估逻辑（无需 LLM）。使用真实数据结构，验证各阶段的评分算法。
"""
from __future__ import annotations

import unittest
from unittest.mock import patch

from tests.test_mysql_storage import RecordingStorage

from stage_contract import STAGE_CONTRACTS
from stage_evaluator import CriterionScore, EvalResult, StageEvaluator

PROJECT_ID = "proj-eval-test"


def _make_evaluator(with_llm: bool = False) -> StageEvaluator:
    """创建评估器，默认无 LLM。"""
    config = {}
    if with_llm:
        config = {
            "ai_chat_base": "http://fake.test/v1/chat/completions",
            "api_key": "sk-fake",
            "ai_chat_model": "test-model",
        }
    return StageEvaluator(config)


class TestEvalResult(unittest.TestCase):
    """EvalResult 数据类测试。"""

    def test_compute_average_empty(self) -> None:
        r = EvalResult(stage="test", attempt=1)
        self.assertEqual(r.compute_average(), 0.0)

    def test_compute_weighted_average(self) -> None:
        r = EvalResult(stage="test", attempt=1, criterion_scores=[
            CriterionScore(name="A", score=10.0, weight=2, reason="ok"),
            CriterionScore(name="B", score=5.0, weight=3, reason="meh"),
            CriterionScore(name="C", score=8.0, weight=5, reason="good"),
        ])
        # (10*2 + 5*3 + 8*5) / (2+3+5) = (20+15+40)/10 = 7.5
        avg = r.compute_average()
        self.assertAlmostEqual(avg, 7.5, places=1)

    def test_to_dict_keys(self) -> None:
        r = EvalResult(stage="script", attempt=1, average=7.0,
                       recommendation="PASS", issues=["issue1"])
        d = r.to_dict()
        self.assertIn("stage", d)
        self.assertIn("attempt", d)
        self.assertIn("criterion_scores", d)
        self.assertIn("average", d)
        self.assertIn("issues", d)
        self.assertIn("recommendation", d)
        self.assertIn("detail", d)


class TestEvalScriptStructural(unittest.TestCase):
    """剧本阶段的结构化评估测试。"""

    def setUp(self) -> None:
        self.storage = RecordingStorage()
        self.patcher = patch("stage_evaluator.get_storage", return_value=self.storage)
        self.patcher.start()
        self.evaluator = _make_evaluator()
        self.contract = STAGE_CONTRACTS["script"]

    def tearDown(self) -> None:
        self.patcher.stop()

    def test_perfect_script(self) -> None:
        """完整剧本应该拿到高分。"""
        data = {
            "title": "办公室囧事",
            "synopsis": "一群实习生在办公室的搞笑故事",
            "characters_count": 3,
            "episodes_count": 2,
            "characters": [
                {"name": "小明", "personality": "开朗活泼", "appearance": "高个子男生", "role": "主角"},
                {"name": "小红", "personality": "认真严谨", "appearance": "戴眼镜女生", "role": "主角"},
                {"name": "老王", "personality": "幽默老练", "appearance": "中年大叔", "role": "配角"},
            ],
            "episodes": [
                {
                    "ep_num": 1, "title": "第一天",
                    "scenes": [
                        {"dialogue": [{"char": "小明", "line": "你好"}, {"char": "小红", "line": "嗨"}]},
                        {"dialogue": [{"char": "老王", "line": "年轻人"}, {"char": "小明", "line": "老板好"}]},
                        {"dialogue": [{"char": "小红", "line": "加油"}]},
                    ],
                },
                {
                    "ep_num": 2, "title": "第二天",
                    "scenes": [
                        {"dialogue": [{"char": "小明", "line": "迟到了"}, {"char": "老王", "line": "没事"}]},
                        {"dialogue": [{"char": "小红", "line": "开会了"}]},
                    ],
                },
            ],
        }
        result = self.evaluator.evaluate("script", data, self.contract, attempt=1)
        # 结构完整性应该满分 10
        struct_score = next(
            cs for cs in result.criterion_scores if cs.name == "结构完整性"
        )
        self.assertEqual(struct_score.score, 10.0)
        # 角色数量满足要求
        char_score = next(
            cs for cs in result.criterion_scores if cs.name == "角色丰富度"
        )
        self.assertGreaterEqual(char_score.score, 7.0)
        # 总分应该 > 5（喜剧效果因无 LLM 会给基础分 5.0）
        self.assertGreater(result.average, 5.0)

    def test_empty_script(self) -> None:
        """空数据应该拿到低分。"""
        data = {}
        result = self.evaluator.evaluate("script", data, self.contract, attempt=1)
        self.assertLess(result.average, 3.0)
        self.assertGreater(len(result.issues), 0)

    def test_missing_characters(self) -> None:
        """缺少角色数据。"""
        data = {
            "title": "Test",
            "synopsis": "Test",
            "characters": [],
            "episodes": [{"ep_num": 1, "title": "E1", "scenes": [{"dialogue": []}]}],
        }
        result = self.evaluator.evaluate("script", data, self.contract, attempt=1)
        char_score = next(
            cs for cs in result.criterion_scores if cs.name == "角色丰富度"
        )
        self.assertEqual(char_score.score, 0.0)
        self.assertIn("没有角色数据", result.issues)

    def test_insufficient_characters(self) -> None:
        """角色数量不足时扣分。"""
        data = {
            "title": "Test",
            "synopsis": "Test",
            "characters_count": 4,
            "characters": [
                {"name": "A", "personality": "x", "appearance": "y", "role": "主角"},
            ],
            "episodes": [{"ep_num": 1, "title": "E1", "scenes": [{"dialogue": [{"char": "A", "line": "hi"}]}]}],
        }
        result = self.evaluator.evaluate("script", data, self.contract, attempt=1)
        self.assertTrue(any("角色数量不足" in issue for issue in result.issues))

    def test_insufficient_episodes(self) -> None:
        """剧集数量不足时扣分。"""
        data = {
            "title": "Test",
            "synopsis": "Test",
            "characters": [{"name": "A", "personality": "x", "appearance": "y"}],
            "episodes_count": 3,
            "episodes": [
                {"ep_num": 1, "title": "E1", "scenes": [{"dialogue": [{"char": "A", "line": "hi"}]}]},
            ],
        }
        result = self.evaluator.evaluate("script", data, self.contract, attempt=1)
        self.assertTrue(any("剧集数量不足" in issue for issue in result.issues))

    def test_saves_feedback_when_project_id(self) -> None:
        """传入 project_id 时应保存 feedback。"""
        data = {"title": "T", "synopsis": "S", "characters": [], "episodes": []}
        result = self.evaluator.evaluate(
            "script", data, self.contract, attempt=1, project_id=PROJECT_ID
        )
        doc = self.storage.get_document("stage_feedback", f"{PROJECT_ID}:script:1")
        self.assertIsNotNone(doc)
        self.assertEqual(doc["stage"], "script")
        self.assertEqual(doc["attempt"], 1)


class TestEvalCharactersStructural(unittest.TestCase):
    """角色阶段的结构化评估测试。"""

    def setUp(self) -> None:
        self.storage = RecordingStorage()
        self.patcher = patch("stage_evaluator.get_storage", return_value=self.storage)
        self.patcher.start()
        self.evaluator = _make_evaluator()
        self.contract = STAGE_CONTRACTS["characters"]

    def tearDown(self) -> None:
        self.patcher.stop()

    def test_all_assets_complete(self) -> None:
        """所有 9 个视图都有图片 → 完成度满分。"""
        views = {
            "front": "url1", "side": "url2", "back": "url3",
            "happy": "url4", "sad": "url5", "angry": "url6",
            "surprised": "url7", "thinking": "url8", "shy": "url9",
        }
        data = {
            "characters": [
                {"name": "Alice", "images": views, "status": "done"},
                {"name": "Bob", "images": views, "status": "done"},
            ],
        }
        result = self.evaluator.evaluate("characters", data, self.contract, attempt=1)
        completion = next(
            cs for cs in result.criterion_scores if cs.name == "完成度"
        )
        self.assertEqual(completion.score, 10.0)

    def test_partial_assets(self) -> None:
        """部分视图缺失 → 完成度扣分。"""
        data = {
            "characters": [
                {
                    "name": "Alice",
                    "images": {"front": "url1", "side": "url2", "happy": "url3"},
                    "status": "partial",
                },
            ],
        }
        result = self.evaluator.evaluate("characters", data, self.contract, attempt=1)
        completion = next(
            cs for cs in result.criterion_scores if cs.name == "完成度"
        )
        # 3/9 = 33% → 3.3 分
        self.assertAlmostEqual(completion.score, 3.3, places=1)

    def test_no_characters(self) -> None:
        data = {"characters": []}
        result = self.evaluator.evaluate("characters", data, self.contract, attempt=1)
        self.assertLess(result.average, 1.0)
        self.assertIn("没有角色资产", result.issues)


class TestEvalStoryboardStructural(unittest.TestCase):
    """分镜阶段的结构化评估测试。"""

    def setUp(self) -> None:
        self.storage = RecordingStorage()
        self.patcher = patch("stage_evaluator.get_storage", return_value=self.storage)
        self.patcher.start()
        self.evaluator = _make_evaluator()
        self.contract = STAGE_CONTRACTS["storyboard"]

    def tearDown(self) -> None:
        self.patcher.stop()

    def test_all_panels_done(self) -> None:
        data = {
            "panels": [
                {"panel_id": "p1", "status": "done", "shot_type": "close_up", "camera_angle": "eye_level"},
                {"panel_id": "p2", "status": "done", "shot_type": "medium", "camera_angle": "low_angle"},
                {"panel_id": "p3", "status": "done", "shot_type": "wide", "camera_angle": "high_angle"},
                {"panel_id": "p4", "status": "done", "shot_type": "full", "camera_angle": "dutch_angle"},
            ],
        }
        result = self.evaluator.evaluate("storyboard", data, self.contract, attempt=1)
        coverage = next(cs for cs in result.criterion_scores if cs.name == "场景覆盖")
        self.assertEqual(coverage.score, 10.0)
        # 4 种镜头 + 4 种角度 → 多样性高
        comp = next(cs for cs in result.criterion_scores if cs.name == "构图质量")
        self.assertGreater(comp.score, 5.0)

    def test_no_panels(self) -> None:
        data = {"panels": []}
        result = self.evaluator.evaluate("storyboard", data, self.contract, attempt=1)
        self.assertLess(result.average, 1.0)

    def test_partial_panels(self) -> None:
        data = {
            "panels": [
                {"panel_id": "p1", "status": "done", "shot_type": "close_up", "camera_angle": "eye_level"},
                {"panel_id": "p2", "status": "generating"},
                {"panel_id": "p3", "status": "error"},
            ],
        }
        result = self.evaluator.evaluate("storyboard", data, self.contract, attempt=1)
        coverage = next(cs for cs in result.criterion_scores if cs.name == "场景覆盖")
        # 1/3 完成 → 3.3 分
        self.assertAlmostEqual(coverage.score, 3.3, places=1)


class TestEvalVideoStructural(unittest.TestCase):
    """视频阶段的结构化评估测试。"""

    def setUp(self) -> None:
        self.storage = RecordingStorage()
        self.patcher = patch("stage_evaluator.get_storage", return_value=self.storage)
        self.patcher.start()
        self.evaluator = _make_evaluator()
        self.contract = STAGE_CONTRACTS["video"]

    def tearDown(self) -> None:
        self.patcher.stop()

    def test_video_done(self) -> None:
        data = {"status": "done", "output_url": "/media/videos/test.mp4"}
        result = self.evaluator.evaluate("video", data, self.contract, attempt=1)
        success = next(cs for cs in result.criterion_scores if cs.name == "生成成功")
        self.assertEqual(success.score, 10.0)
        self.assertGreaterEqual(result.average, 6.0)  # 应通过 6.0 阈值

    def test_video_processing(self) -> None:
        data = {"status": "processing"}
        result = self.evaluator.evaluate("video", data, self.contract, attempt=1)
        success = next(cs for cs in result.criterion_scores if cs.name == "生成成功")
        self.assertEqual(success.score, 3.0)
        self.assertIn("视频仍在生成中", result.issues)

    def test_video_failed(self) -> None:
        data = {"status": "failed"}
        result = self.evaluator.evaluate("video", data, self.contract, attempt=1)
        success = next(cs for cs in result.criterion_scores if cs.name == "生成成功")
        self.assertEqual(success.score, 0.0)

    def test_recommendation_pass(self) -> None:
        """分数 >= 6.0 时 recommendation 应为 PASS。"""
        data = {"status": "done", "output_url": "/media/videos/test.mp4"}
        result = self.evaluator.evaluate("video", data, self.contract, attempt=1)
        self.assertEqual(result.recommendation, "PASS")

    def test_recommendation_refine(self) -> None:
        """分数 < 6.0 时 recommendation 应为 REFINE。"""
        data = {"status": "processing"}
        result = self.evaluator.evaluate("video", data, self.contract, attempt=1)
        self.assertEqual(result.recommendation, "REFINE")


if __name__ == "__main__":
    unittest.main()
