"""
阶段验收标准管理 — Sprint Contract 模式。

灵感来源：HarnessEngineeringMaster 的 contract 协商机制。
在 Harness 中，Builder 和 Evaluator 每轮开始前协商 "done 长什么样"，
写入 contract.md 作为评估依据。

本模块为每个工作流阶段定义验收标准模板，并支持：
- 预定义标准（权重可调）
- 写入 contract_{stage}.json 供评估器使用
- 自定义阈值覆盖
"""
from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from mysql_storage import get_storage

log = logging.getLogger("workflow.contract")

_WORKFLOWS_DIR = Path("data/workflows")


# ---------------------------------------------------------------------------
# 数据结构
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Criterion:
    """单条验收标准"""
    name: str
    desc: str
    weight: int  # 1-5，用于加权平均


@dataclass
class StageContract:
    """阶段验收合同"""
    stage: str
    criteria: list[Criterion]
    pass_threshold: float
    max_attempts: int = 3

    def to_dict(self) -> dict[str, Any]:
        return {
            "stage": self.stage,
            "criteria": [asdict(c) for c in self.criteria],
            "pass_threshold": self.pass_threshold,
            "max_attempts": self.max_attempts,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> StageContract:
        return cls(
            stage=data["stage"],
            criteria=[Criterion(**c) for c in data.get("criteria", [])],
            pass_threshold=data.get("pass_threshold", 7.0),
            max_attempts=data.get("max_attempts", 3),
        )


# ---------------------------------------------------------------------------
# 预定义验收标准模板
# ---------------------------------------------------------------------------

STAGE_CONTRACTS: dict[str, StageContract] = {
    "script": StageContract(
        stage="script",
        criteria=[
            Criterion(
                name="结构完整性",
                desc="剧本包含所有必要字段：标题、简介、角色列表、剧集和场景",
                weight=2,
            ),
            Criterion(
                name="角色丰富度",
                desc="角色有清晰的性格特征、外貌描述和角色定位",
                weight=2,
            ),
            Criterion(
                name="剧情连贯性",
                desc="场景之间逻辑通顺，对白自然流畅，剧情发展合理",
                weight=3,
            ),
            Criterion(
                name="喜剧效果",
                desc="包含明确的笑点、反转或喜剧冲突，符合所选类型",
                weight=3,
            ),
        ],
        pass_threshold=7.0,
    ),
    "characters": StageContract(
        stage="characters",
        criteria=[
            Criterion(
                name="完成度",
                desc="所有角色的 9 个视图（3 视角 + 6 表情）全部生成成功",
                weight=4,
            ),
            Criterion(
                name="风格一致性",
                desc="同一角色不同视图的画风、比例、配色保持统一",
                weight=3,
            ),
            Criterion(
                name="角色辨识度",
                desc="不同角色在视觉上可以明确区分",
                weight=3,
            ),
        ],
        pass_threshold=7.0,
    ),
    "storyboard": StageContract(
        stage="storyboard",
        criteria=[
            Criterion(
                name="场景覆盖",
                desc="每个场景都有对应的分镜画面，无遗漏",
                weight=3,
            ),
            Criterion(
                name="构图质量",
                desc="镜头类型（特写/中景/全景）和角度多样，避免单调",
                weight=3,
            ),
            Criterion(
                name="叙事流畅",
                desc="分镜顺序能清晰传达故事脉络，画面之间过渡自然",
                weight=4,
            ),
        ],
        pass_threshold=7.0,
    ),
    "video": StageContract(
        stage="video",
        criteria=[
            Criterion(
                name="生成成功",
                desc="视频文件成功生成并且可以正常播放",
                weight=5,
            ),
            Criterion(
                name="时长合理",
                desc="视频时长与剧本场景匹配，不过短也不过长",
                weight=2,
            ),
            Criterion(
                name="画面质量",
                desc="视频清晰度可接受，无明显伪影或画面错乱",
                weight=3,
            ),
        ],
        pass_threshold=6.0,  # 视频阶段门槛稍低（生成模型限制）
    ),
}


# ---------------------------------------------------------------------------
# ContractManager — 合同管理
# ---------------------------------------------------------------------------

class ContractManager:
    """
    管理各阶段的验收合同。

    对应 Harness 的 _negotiate_contract() 方法：
    - 提供预定义标准模板
    - 写入合同文件供评估器读取
    - 支持自定义覆盖
    """

    def get_contract(self, stage: str) -> StageContract:
        """获取指定阶段的验收合同"""
        if stage not in STAGE_CONTRACTS:
            raise ValueError(f"未知阶段: {stage}，有效值: {list(STAGE_CONTRACTS.keys())}")
        return STAGE_CONTRACTS[stage]

    def save_contract(self, project_id: str, contract: StageContract) -> Path:
        """
        将合同写入项目工作流目录。

        对应 Harness 中写入 contract.md 的操作。
        """
        contract_file = _WORKFLOWS_DIR / project_id / f"contract_{contract.stage}.json"
        get_storage().upsert_document(
            "stage_contract",
            f"{project_id}:{contract.stage}",
            contract.to_dict(),
            project_id=project_id,
            parent_id=project_id,
            status="contract",
            title=contract.stage,
        )
        log.info(f"合同已写入: {contract_file}")
        return contract_file

    def load_contract(self, project_id: str, stage: str) -> StageContract | None:
        """从 MySQL 加载已保存的合同"""
        data = get_storage().get_document("stage_contract", f"{project_id}:{stage}")
        if data is None:
            return None
        try:
            return StageContract.from_dict(data)
        except (json.JSONDecodeError, KeyError) as exc:
            log.error(f"加载合同失败: {exc}")
            return None

    def write_all_contracts(self, project_id: str) -> None:
        """为项目写入所有阶段的默认合同"""
        for stage, contract in STAGE_CONTRACTS.items():
            self.save_contract(project_id, contract)
        log.info(f"已为项目 {project_id} 写入 {len(STAGE_CONTRACTS)} 个阶段合同")
