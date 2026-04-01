"""
工作流状态机 — 文件持久化的管线状态管理。

灵感来源：HarnessEngineeringMaster 的文件通信模式。
Agent 间不共享内存，通过 workspace 文件（state.json）传递状态。

状态存储在 data/workflows/{project_id}/state.json
"""
from __future__ import annotations

import json
import logging
import random
import string
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from mysql_storage import get_storage

log = logging.getLogger("workflow.state")

# ---------------------------------------------------------------------------
# 常量
# ---------------------------------------------------------------------------

STAGES = ("script", "characters", "storyboard", "video")

STAGE_STATUS_PENDING = "pending"
STAGE_STATUS_RUNNING = "running"
STAGE_STATUS_EVALUATING = "evaluating"
STAGE_STATUS_PASSED = "passed"
STAGE_STATUS_FAILED = "failed"

PIPELINE_STATUS_RUNNING = "running"
PIPELINE_STATUS_PAUSED = "paused"
PIPELINE_STATUS_COMPLETED = "completed"
PIPELINE_STATUS_FAILED = "failed"

DEFAULT_MAX_ATTEMPTS = 3

_WORKFLOWS_DIR = Path("data/workflows")


# ---------------------------------------------------------------------------
# 工具函数
# ---------------------------------------------------------------------------

def _generate_id(prefix: str) -> str:
    """生成唯一 ID：{prefix}_{timestamp}_{random6}"""
    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    rand = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
    return f"{prefix}_{ts}_{rand}"


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _workflow_dir(project_id: str) -> Path:
    d = _WORKFLOWS_DIR / project_id
    d.mkdir(parents=True, exist_ok=True)
    return d


# ---------------------------------------------------------------------------
# StageState — 单个阶段的状态
# ---------------------------------------------------------------------------

@dataclass
class StageState:
    """
    单个工作流阶段的状态。

    对应 Harness 中每轮 Build→Evaluate 循环的状态追踪。
    """

    name: str
    status: str = STAGE_STATUS_PENDING
    attempt: int = 0
    max_attempts: int = DEFAULT_MAX_ATTEMPTS
    score_history: list[float] = field(default_factory=list)
    strategy: str | None = None  # "REFINE" | "PIVOT" | None
    artifact_id: str | None = None
    error: str | None = None

    @property
    def latest_score(self) -> float | None:
        return self.score_history[-1] if self.score_history else None

    @property
    def is_improving(self) -> bool:
        """分数是否在上升（Harness REFINE 信号）"""
        if len(self.score_history) < 2:
            return True
        return self.score_history[-1] > self.score_history[-2]

    @property
    def score_delta(self) -> float | None:
        """最近两次分数的差值"""
        if len(self.score_history) < 2:
            return None
        return self.score_history[-1] - self.score_history[-2]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> StageState:
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


# ---------------------------------------------------------------------------
# PipelineState — 完整管线状态
# ---------------------------------------------------------------------------

@dataclass
class PipelineState:
    """
    完整工作流管线的状态。

    对应 Harness.run() 中的外层循环状态：
    - current_stage 追踪当前执行位置
    - stages 记录各阶段的详细状态（分数、策略、产物 ID）
    - 所有状态通过 JSON 文件持久化（文件通信模式）
    """

    pipeline_id: str
    project_id: str
    current_stage: str = STAGES[0]
    stages: dict[str, StageState] = field(default_factory=dict)
    params: dict[str, Any] = field(default_factory=dict)
    created_at: str = ""
    updated_at: str = ""
    status: str = PIPELINE_STATUS_RUNNING

    def __post_init__(self) -> None:
        if not self.stages:
            self.stages = {name: StageState(name=name) for name in STAGES}
        if not self.created_at:
            self.created_at = _now_iso()
        if not self.updated_at:
            self.updated_at = _now_iso()

    # ---- 创建 / 加载 / 保存 ----

    @classmethod
    def create(cls, project_id: str, params: dict[str, Any] | None = None) -> PipelineState:
        """创建新管线状态"""
        state = cls(
            pipeline_id=_generate_id("pipeline"),
            project_id=project_id,
            params=params or {},
        )
        state.save()
        log.info(f"管线已创建: {state.pipeline_id} (项目 {project_id})")
        return state

    @classmethod
    def load(cls, project_id: str) -> PipelineState | None:
        """从 MySQL 恢复管线状态"""
        data = get_storage().get_document("pipeline_state", project_id)
        if data is None:
            log.warning(f"管线状态不存在: {project_id}")
            return None
        try:
            stages = {
                name: StageState.from_dict(s_data)
                for name, s_data in data.pop("stages", {}).items()
            }
            state = cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})
            state.stages = stages
            log.info(f"管线已恢复: {state.pipeline_id} (阶段 {state.current_stage})")
            return state
        except (json.JSONDecodeError, TypeError, KeyError) as exc:
            log.error(f"加载状态文件失败: {exc}")
            return None

    def save(self) -> None:
        """持久化管线状态到 MySQL"""
        self.updated_at = _now_iso()
        data = {
            "pipeline_id": self.pipeline_id,
            "project_id": self.project_id,
            "current_stage": self.current_stage,
            "stages": {name: s.to_dict() for name, s in self.stages.items()},
            "params": self.params,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "status": self.status,
        }
        get_storage().upsert_document(
            "pipeline_state",
            self.project_id,
            data,
            project_id=self.project_id,
            status=self.status,
            title=self.current_stage,
            created_at=self.created_at,
            updated_at=self.updated_at,
        )
        log.debug(f"状态已保存: {self.project_id}")

    # ---- 状态操作 ----

    def get_current_stage(self) -> StageState:
        """获取当前阶段的状态"""
        return self.stages[self.current_stage]

    def advance(self) -> bool:
        """
        推进到下一阶段。

        对应 Harness 中 score >= threshold 后进入下一轮。
        返回 True 表示还有后续阶段，False 表示管线已完成。
        """
        idx = STAGES.index(self.current_stage)
        if idx + 1 < len(STAGES):
            self.current_stage = STAGES[idx + 1]
            log.info(f"管线推进到阶段: {self.current_stage}")
            self.save()
            return True
        else:
            self.status = PIPELINE_STATUS_COMPLETED
            log.info("管线已完成所有阶段")
            self.save()
            return False

    def record_score(self, stage_name: str, score: float) -> None:
        """记录某阶段的评估分数"""
        stage = self.stages[stage_name]
        stage.score_history.append(score)
        log.info(
            f"[{stage_name}] 评分: {score:.1f}/10 "
            f"(历史: {stage.score_history})"
        )
        self.save()

    def mark_stage_running(self, stage_name: str) -> None:
        """标记阶段为运行中"""
        stage = self.stages[stage_name]
        stage.status = STAGE_STATUS_RUNNING
        stage.attempt += 1
        stage.error = None
        log.info(f"[{stage_name}] 开始第 {stage.attempt} 次尝试")
        self.save()

    def mark_stage_evaluating(self, stage_name: str) -> None:
        stage = self.stages[stage_name]
        stage.status = STAGE_STATUS_EVALUATING
        self.save()

    def mark_stage_passed(self, stage_name: str) -> None:
        stage = self.stages[stage_name]
        stage.status = STAGE_STATUS_PASSED
        log.info(f"[{stage_name}] 阶段通过 ✓")
        self.save()

    def mark_stage_failed(self, stage_name: str, error: str | None = None) -> None:
        stage = self.stages[stage_name]
        stage.status = STAGE_STATUS_FAILED
        stage.error = error
        log.warning(f"[{stage_name}] 阶段失败: {error or '达到最大尝试次数'}")
        self.save()

    def set_strategy(self, stage_name: str, strategy: str) -> None:
        """设置 REFINE 或 PIVOT 策略（Harness 核心决策）"""
        self.stages[stage_name].strategy = strategy
        log.info(f"[{stage_name}] 策略决策: {strategy}")
        self.save()

    # ---- 序列化 ----

    def to_dict(self) -> dict[str, Any]:
        return {
            "pipeline_id": self.pipeline_id,
            "project_id": self.project_id,
            "current_stage": self.current_stage,
            "stages": {name: s.to_dict() for name, s in self.stages.items()},
            "params": self.params,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "status": self.status,
        }
