"""
stage_contract.py 单元测试。

测试验收标准模板的完整性和 ContractManager 的持久化操作。
"""
from __future__ import annotations

import unittest
from unittest.mock import patch

from tests.test_mysql_storage import RecordingStorage

from stage_contract import (
    ContractManager,
    Criterion,
    STAGE_CONTRACTS,
    StageContract,
)
from workflow_state import STAGES

PROJECT_ID = "proj-contract-test"


class TestCriterion(unittest.TestCase):
    """Criterion 数据类测试。"""

    def test_frozen_immutable(self) -> None:
        c = Criterion(name="测试", desc="描述", weight=3)
        with self.assertRaises(AttributeError):
            c.name = "修改"  # type: ignore[misc]

    def test_fields(self) -> None:
        c = Criterion(name="结构完整性", desc="包含所有必要字段", weight=2)
        self.assertEqual(c.name, "结构完整性")
        self.assertEqual(c.weight, 2)


class TestStageContract(unittest.TestCase):
    """StageContract 序列化测试。"""

    def test_roundtrip(self) -> None:
        contract = StageContract(
            stage="script",
            criteria=[
                Criterion(name="A", desc="a desc", weight=2),
                Criterion(name="B", desc="b desc", weight=3),
            ],
            pass_threshold=7.0,
            max_attempts=3,
        )
        d = contract.to_dict()
        restored = StageContract.from_dict(d)
        self.assertEqual(restored.stage, "script")
        self.assertEqual(len(restored.criteria), 2)
        self.assertEqual(restored.criteria[0].name, "A")
        self.assertEqual(restored.pass_threshold, 7.0)


class TestStageContractsTemplate(unittest.TestCase):
    """验证预定义合同模板的完整性。"""

    def test_all_stages_have_contracts(self) -> None:
        for stage in STAGES:
            self.assertIn(stage, STAGE_CONTRACTS, f"阶段 {stage} 缺少合同模板")

    def test_script_contract(self) -> None:
        c = STAGE_CONTRACTS["script"]
        self.assertEqual(c.stage, "script")
        self.assertEqual(c.pass_threshold, 7.0)
        self.assertEqual(len(c.criteria), 4)
        names = {cr.name for cr in c.criteria}
        self.assertIn("结构完整性", names)
        self.assertIn("角色丰富度", names)
        self.assertIn("剧情连贯性", names)
        self.assertIn("喜剧效果", names)

    def test_characters_contract(self) -> None:
        c = STAGE_CONTRACTS["characters"]
        self.assertEqual(c.pass_threshold, 7.0)
        self.assertEqual(len(c.criteria), 3)
        names = {cr.name for cr in c.criteria}
        self.assertIn("完成度", names)
        self.assertIn("风格一致性", names)
        self.assertIn("角色辨识度", names)

    def test_storyboard_contract(self) -> None:
        c = STAGE_CONTRACTS["storyboard"]
        self.assertEqual(c.pass_threshold, 7.0)
        names = {cr.name for cr in c.criteria}
        self.assertIn("场景覆盖", names)
        self.assertIn("构图质量", names)
        self.assertIn("叙事流畅", names)

    def test_video_contract_lower_threshold(self) -> None:
        c = STAGE_CONTRACTS["video"]
        self.assertEqual(c.pass_threshold, 6.0)
        names = {cr.name for cr in c.criteria}
        self.assertIn("生成成功", names)

    def test_all_weights_positive(self) -> None:
        for stage, contract in STAGE_CONTRACTS.items():
            for cr in contract.criteria:
                self.assertGreater(
                    cr.weight, 0,
                    f"{stage}/{cr.name} 的权重应大于 0",
                )

    def test_total_weight_is_ten(self) -> None:
        """每阶段的权重之和应为 10（便于打分理解）。"""
        for stage, contract in STAGE_CONTRACTS.items():
            total = sum(cr.weight for cr in contract.criteria)
            self.assertEqual(
                total, 10,
                f"{stage} 的权重之和为 {total}，期望 10",
            )


class TestContractManager(unittest.TestCase):
    """ContractManager 持久化测试。"""

    def setUp(self) -> None:
        self.storage = RecordingStorage()
        self.patcher = patch("stage_contract.get_storage", return_value=self.storage)
        self.patcher.start()
        self.mgr = ContractManager()

    def tearDown(self) -> None:
        self.patcher.stop()

    def test_get_contract_valid(self) -> None:
        c = self.mgr.get_contract("script")
        self.assertEqual(c.stage, "script")

    def test_get_contract_invalid_raises(self) -> None:
        with self.assertRaises(ValueError):
            self.mgr.get_contract("unknown_stage")

    def test_save_and_load(self) -> None:
        contract = self.mgr.get_contract("script")
        self.mgr.save_contract(PROJECT_ID, contract)

        loaded = self.mgr.load_contract(PROJECT_ID, "script")
        self.assertIsNotNone(loaded)
        self.assertEqual(loaded.stage, "script")
        self.assertEqual(loaded.pass_threshold, contract.pass_threshold)
        self.assertEqual(len(loaded.criteria), len(contract.criteria))

    def test_save_stores_correct_doc_id(self) -> None:
        """合同 doc_id 应为 {project_id}:{stage} 格式。"""
        contract = self.mgr.get_contract("characters")
        self.mgr.save_contract(PROJECT_ID, contract)

        doc = self.storage.get_document("stage_contract", f"{PROJECT_ID}:characters")
        self.assertIsNotNone(doc)
        self.assertEqual(doc["stage"], "characters")

    def test_load_nonexistent_returns_none(self) -> None:
        result = self.mgr.load_contract("fake_project", "script")
        self.assertIsNone(result)

    def test_write_all_contracts(self) -> None:
        self.mgr.write_all_contracts(PROJECT_ID)

        for stage in STAGES:
            doc = self.storage.get_document("stage_contract", f"{PROJECT_ID}:{stage}")
            self.assertIsNotNone(doc, f"阶段 {stage} 的合同未写入")
            self.assertEqual(doc["stage"], stage)


if __name__ == "__main__":
    unittest.main()
