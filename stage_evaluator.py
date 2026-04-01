"""
阶段评估器 — 混合评估系统（结构检查 + LLM 评分）。

灵感来源：HarnessEngineeringMaster 的 Evaluator Agent。
Evaluator 用 Playwright 实际操作页面并打分，写入 feedback.md。

本模块对每个阶段的产物进行评估：
1. 结构化检查（无需 LLM）：字段完整性、资产数量、格式合规
2. LLM 评估（可选）：内容质量、创意、连贯性
3. 综合打分，写入 feedback_{stage}_{attempt}.json
"""
from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from mysql_storage import get_storage
from stage_contract import Criterion, StageContract

log = logging.getLogger("workflow.evaluator")

_WORKFLOWS_DIR = Path("data/workflows")


# ---------------------------------------------------------------------------
# 评估结果
# ---------------------------------------------------------------------------

@dataclass
class CriterionScore:
    """单条标准的评分"""
    name: str
    score: float  # 0-10
    weight: int
    reason: str


@dataclass
class EvalResult:
    """
    阶段评估结果。

    对应 Harness 中 feedback.md 的结构化版本：
    - scores: 每条标准的分数
    - average: 加权平均分（对应 Harness 的 Average: X/10）
    - issues: 发现的问题列表
    - recommendation: PASS / REFINE / PIVOT
    """

    stage: str
    attempt: int
    criterion_scores: list[CriterionScore] = field(default_factory=list)
    average: float = 0.0
    issues: list[str] = field(default_factory=list)
    recommendation: str = "REFINE"  # "PASS" | "REFINE" | "PIVOT"
    detail: str = ""

    def compute_average(self) -> float:
        """计算加权平均分"""
        if not self.criterion_scores:
            self.average = 0.0
            return 0.0
        total_weight = sum(cs.weight for cs in self.criterion_scores)
        if total_weight == 0:
            self.average = 0.0
            return 0.0
        weighted = sum(cs.score * cs.weight for cs in self.criterion_scores)
        self.average = round(weighted / total_weight, 1)
        return self.average

    def to_dict(self) -> dict[str, Any]:
        return {
            "stage": self.stage,
            "attempt": self.attempt,
            "criterion_scores": [asdict(cs) for cs in self.criterion_scores],
            "average": self.average,
            "issues": self.issues,
            "recommendation": self.recommendation,
            "detail": self.detail,
        }


# ---------------------------------------------------------------------------
# LLM 调用工具
# ---------------------------------------------------------------------------

def _call_llm(
    base_url: str,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    max_tokens: int = 2000,
) -> str:
    """调用 LLM 获取评估结果"""
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "max_tokens": max_tokens,
        "temperature": 0.3,  # 评估需要确定性
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        base_url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            return result["choices"][0]["message"]["content"]
    except (urllib.error.URLError, KeyError, json.JSONDecodeError) as exc:
        log.error(f"LLM 评估调用失败: {exc}")
        return ""


# ---------------------------------------------------------------------------
# 评估系统提示词
# ---------------------------------------------------------------------------

_EVALUATOR_SYSTEM = """你是一个专业的内容质量评估专家。
你需要根据给定的验收标准，对提交的内容进行严格评分。

评分规则：
- 每条标准打 0-10 分（10=完美，7=合格，5=勉强，3=差，0=完全不符合）
- 必须给出每条标准的具体扣分原因
- 列出所有发现的问题

输出格式（严格 JSON）：
{
  "scores": [
    {"name": "标准名", "score": 8.0, "reason": "扣分原因或优点说明"}
  ],
  "issues": ["问题1", "问题2"],
  "detail": "总体评价（2-3句话）"
}"""


# ---------------------------------------------------------------------------
# StageEvaluator — 主评估器
# ---------------------------------------------------------------------------

class StageEvaluator:
    """
    混合评估系统。

    对应 Harness 的 Evaluator Agent：
    - 读取 spec.md（剧本）了解承诺内容
    - 读取 contract.md（合同）了解验收标准
    - 检查产物并打分
    - 写入 feedback.md（评估反馈）
    """

    def __init__(self, config: dict[str, Any] | None = None):
        """
        Args:
            config: 包含 LLM API 配置的字典
                - ai_chat_base: LLM API 地址
                - api_key: API 密钥
                - ai_chat_model: 模型名称
        """
        self.config = config or {}
        self._llm_available = bool(
            self.config.get("ai_chat_base") and self.config.get("api_key")
        )
        if not self._llm_available:
            log.warning("LLM 配置不完整，将只使用结构化检查（分数可能偏低）")

    def evaluate(
        self,
        stage: str,
        artifact_data: dict[str, Any],
        contract: StageContract,
        attempt: int = 1,
        project_id: str | None = None,
    ) -> EvalResult:
        """
        对阶段产物进行评估。

        Args:
            stage: 阶段名称
            artifact_data: 产物数据（script JSON / character list / etc.）
            contract: 阶段验收合同
            attempt: 当前尝试次数
            project_id: 项目 ID（用于保存 feedback 文件）

        Returns:
            EvalResult 包含分数、问题和建议
        """
        log.info(f"[{stage}] 开始评估（第 {attempt} 次）...")

        # 1. 结构化检查
        result = self._structural_check(stage, artifact_data, contract, attempt)

        # 2. LLM 评估（如果可用且结构检查通过基本门槛）
        if self._llm_available and result.average >= 3.0:
            llm_result = self._llm_evaluate(stage, artifact_data, contract)
            if llm_result:
                result = self._merge_results(result, llm_result)

        # 3. 计算最终平均分
        result.compute_average()

        # 4. 决定建议
        if result.average >= contract.pass_threshold:
            result.recommendation = "PASS"
        else:
            result.recommendation = "REFINE"

        log.info(
            f"[{stage}] 评估完成: {result.average:.1f}/10 "
            f"(阈值: {contract.pass_threshold}, 建议: {result.recommendation})"
        )

        # 5. 保存 feedback 文件
        if project_id:
            self._save_feedback(project_id, result)

        return result

    # ---- 结构化检查 ----

    def _structural_check(
        self,
        stage: str,
        data: dict[str, Any],
        contract: StageContract,
        attempt: int,
    ) -> EvalResult:
        """纯结构化检查（无需 LLM）"""
        dispatch = {
            "script": self._check_script,
            "characters": self._check_characters,
            "storyboard": self._check_storyboard,
            "video": self._check_video,
        }
        checker = dispatch.get(stage)
        if checker is None:
            return EvalResult(stage=stage, attempt=attempt)
        return checker(data, contract, attempt)

    def _check_script(
        self, data: dict[str, Any], contract: StageContract, attempt: int
    ) -> EvalResult:
        """剧本结构检查"""
        result = EvalResult(stage="script", attempt=attempt)
        criteria = contract.criteria

        # 结构完整性
        required_fields = ["title", "synopsis", "characters", "episodes"]
        missing = [f for f in required_fields if not data.get(f)]
        completeness = max(0, 10 - len(missing) * 2.5)
        if missing:
            result.issues.append(f"缺少字段: {', '.join(missing)}")
        result.criterion_scores.append(CriterionScore(
            name="结构完整性",
            score=completeness,
            weight=self._find_weight(criteria, "结构完整性"),
            reason=f"缺少 {len(missing)} 个必需字段" if missing else "所有字段完整",
        ))

        # 角色丰富度
        characters = data.get("characters", [])
        expected_count = data.get("characters_count", 0)
        if isinstance(characters, list) and characters:
            char_fields = ["name", "personality", "appearance"]
            char_completeness = 0
            for char in characters:
                filled = sum(1 for f in char_fields if char.get(f))
                char_completeness += filled / len(char_fields)
            char_score = min(10, (char_completeness / max(len(characters), 1)) * 10)
            # 数量也要达标
            if expected_count > 0 and len(characters) < expected_count:
                char_score *= len(characters) / expected_count
                result.issues.append(
                    f"角色数量不足: 期望 {expected_count}, 实际 {len(characters)}"
                )
        else:
            char_score = 0.0
            result.issues.append("没有角色数据")
        result.criterion_scores.append(CriterionScore(
            name="角色丰富度",
            score=round(char_score, 1),
            weight=self._find_weight(criteria, "角色丰富度"),
            reason=f"{len(characters)} 个角色" if characters else "无角色",
        ))

        # 剧情连贯性（结构化：检查场景数量和对白）
        episodes = data.get("episodes", [])
        expected_episodes = data.get("episodes_count", 0)
        if episodes:
            total_scenes = sum(
                max(len(ep.get("scenes", [])), len(ep.get("episode_scenes", [])))
                for ep in episodes
            )
            total_dialogue = sum(
                len(scene.get("dialogues", scene.get("dialogue", [])))
                for ep in episodes
                for scene in ep.get("scenes", [])
            )
            # Also count dialogue from beats structure
            total_dialogue += sum(
                len(beat.get("dialogue", []))
                for ep in episodes
                for beat in ep.get("beats", [])
            )
            coherence = min(10, (total_scenes * 2 + total_dialogue * 0.5))
            if expected_episodes > 0 and len(episodes) < expected_episodes:
                coherence *= len(episodes) / expected_episodes
                result.issues.append(
                    f"剧集数量不足: 期望 {expected_episodes}, 实际 {len(episodes)}"
                )
        else:
            coherence = 0.0
            result.issues.append("没有剧集数据")
        result.criterion_scores.append(CriterionScore(
            name="剧情连贯性",
            score=round(coherence, 1),
            weight=self._find_weight(criteria, "剧情连贯性"),
            reason=f"{len(episodes)} 集, {total_scenes if episodes else 0} 场景",
        ))

        # 喜剧效果（结构化无法评判，给基础分）
        base_comedy = 5.0 if episodes else 0.0
        result.criterion_scores.append(CriterionScore(
            name="喜剧效果",
            score=base_comedy,
            weight=self._find_weight(criteria, "喜剧效果"),
            reason="结构化检查无法评判喜剧效果，需 LLM 评估",
        ))

        result.compute_average()
        return result

    def _check_characters(
        self, data: dict[str, Any], contract: StageContract, attempt: int
    ) -> EvalResult:
        """角色资产检查"""
        result = EvalResult(stage="characters", attempt=attempt)
        criteria = contract.criteria
        characters = data.get("characters", [])

        if not characters:
            for c in criteria:
                result.criterion_scores.append(CriterionScore(
                    name=c.name, score=0.0, weight=c.weight, reason="无角色数据",
                ))
            result.issues.append("没有角色资产")
            result.compute_average()
            return result

        # 完成度：检查每个角色的 9 个视图
        expected_keys = {"front", "side", "back", "happy", "sad", "angry",
                         "surprised", "thinking", "shy"}
        total_slots = len(characters) * len(expected_keys)
        filled_slots = 0
        for char in characters:
            images = char.get("images", {})
            for key in expected_keys:
                if images.get(key):
                    filled_slots += 1
        completion_rate = filled_slots / max(total_slots, 1)
        completion_score = round(completion_rate * 10, 1)
        if completion_rate < 1.0:
            result.issues.append(
                f"资产完成度: {filled_slots}/{total_slots} "
                f"({completion_rate:.0%})"
            )
        result.criterion_scores.append(CriterionScore(
            name="完成度",
            score=completion_score,
            weight=self._find_weight(criteria, "完成度"),
            reason=f"{filled_slots}/{total_slots} 个视图已生成",
        ))

        # 风格一致性 & 角色辨识度（结构化只能给基础分）
        for name in ("风格一致性", "角色辨识度"):
            base = 5.0 if completion_rate > 0.5 else 3.0
            result.criterion_scores.append(CriterionScore(
                name=name,
                score=base,
                weight=self._find_weight(criteria, name),
                reason="结构化检查无法评判视觉质量，需 LLM 评估",
            ))

        result.compute_average()
        return result

    def _check_storyboard(
        self, data: dict[str, Any], contract: StageContract, attempt: int
    ) -> EvalResult:
        """分镜结构检查"""
        result = EvalResult(stage="storyboard", attempt=attempt)
        criteria = contract.criteria
        panels = data.get("panels", [])

        if not panels:
            for c in criteria:
                result.criterion_scores.append(CriterionScore(
                    name=c.name, score=0.0, weight=c.weight, reason="无分镜数据",
                ))
            result.issues.append("没有分镜面板")
            result.compute_average()
            return result

        # 场景覆盖
        done_panels = [p for p in panels if p.get("status") == "done"]
        coverage = len(done_panels) / max(len(panels), 1)
        coverage_score = round(coverage * 10, 1)
        if coverage < 1.0:
            result.issues.append(
                f"分镜完成度: {len(done_panels)}/{len(panels)} ({coverage:.0%})"
            )
        result.criterion_scores.append(CriterionScore(
            name="场景覆盖",
            score=coverage_score,
            weight=self._find_weight(criteria, "场景覆盖"),
            reason=f"{len(done_panels)}/{len(panels)} 个面板已完成",
        ))

        # 构图质量（检查镜头多样性）
        shot_types = {p.get("shot_type") for p in panels if p.get("shot_type")}
        angle_types = {p.get("camera_angle") for p in panels if p.get("camera_angle")}
        diversity = min(10, (len(shot_types) + len(angle_types)) * 1.5)
        result.criterion_scores.append(CriterionScore(
            name="构图质量",
            score=round(diversity, 1),
            weight=self._find_weight(criteria, "构图质量"),
            reason=f"{len(shot_types)} 种镜头类型, {len(angle_types)} 种角度",
        ))

        # 叙事流畅（结构化给基础分）
        base_narrative = 5.0 if len(done_panels) >= 3 else 3.0
        result.criterion_scores.append(CriterionScore(
            name="叙事流畅",
            score=base_narrative,
            weight=self._find_weight(criteria, "叙事流畅"),
            reason="结构化检查无法评判叙事流畅度，需 LLM 评估",
        ))

        result.compute_average()
        return result

    def _check_video(
        self, data: dict[str, Any], contract: StageContract, attempt: int
    ) -> EvalResult:
        """视频生成检查"""
        result = EvalResult(stage="video", attempt=attempt)
        criteria = contract.criteria

        status = data.get("status", "")
        output_url = data.get("output_url", "")

        # 生成成功
        if status == "done" and output_url:
            success_score = 10.0
        elif status == "processing":
            success_score = 3.0
            result.issues.append("视频仍在生成中")
        else:
            success_score = 0.0
            result.issues.append(f"视频生成失败: status={status}")
        result.criterion_scores.append(CriterionScore(
            name="生成成功",
            score=success_score,
            weight=self._find_weight(criteria, "生成成功"),
            reason=f"状态: {status}",
        ))

        # 时长和画面质量（结构化给基础分）
        for name in ("时长合理", "画面质量"):
            base = 6.0 if status == "done" else 0.0
            result.criterion_scores.append(CriterionScore(
                name=name,
                score=base,
                weight=self._find_weight(criteria, name),
                reason="视频已生成" if status == "done" else "视频未完成",
            ))

        result.compute_average()
        return result

    # ---- LLM 评估 ----

    def _llm_evaluate(
        self, stage: str, data: dict[str, Any], contract: StageContract
    ) -> EvalResult | None:
        """使用 LLM 进行深度内容评估"""
        if not self._llm_available:
            return None

        # 构建评估 prompt
        criteria_text = "\n".join(
            f"- {c.name}（权重 {c.weight}）: {c.desc}"
            for c in contract.criteria
        )

        # 截断数据避免超出 token 限制
        data_str = json.dumps(data, ensure_ascii=False, indent=1)
        if len(data_str) > 8000:
            data_str = data_str[:8000] + "\n... (已截断)"

        user_prompt = (
            f"请评估以下「{stage}」阶段的产物。\n\n"
            f"## 验收标准\n{criteria_text}\n\n"
            f"## 产物数据\n```json\n{data_str}\n```\n\n"
            f"请严格按照 JSON 格式输出评分结果。"
        )

        try:
            response = _call_llm(
                base_url=self.config["ai_chat_base"],
                api_key=self.config["api_key"],
                model=self.config.get("ai_chat_model", "claude-opus-4-6"),
                system_prompt=_EVALUATOR_SYSTEM,
                user_prompt=user_prompt,
            )
            if not response:
                return None

            # 解析 LLM 响应
            # 尝试提取 JSON 块
            json_str = response
            if "```json" in response:
                start = response.index("```json") + 7
                end = response.index("```", start)
                json_str = response[start:end].strip()
            elif "```" in response:
                start = response.index("```") + 3
                end = response.index("```", start)
                json_str = response[start:end].strip()

            llm_data = json.loads(json_str)

            result = EvalResult(stage=stage, attempt=0)
            for score_item in llm_data.get("scores", []):
                weight = self._find_weight(contract.criteria, score_item["name"])
                result.criterion_scores.append(CriterionScore(
                    name=score_item["name"],
                    score=float(score_item.get("score", 5.0)),
                    weight=weight,
                    reason=score_item.get("reason", ""),
                ))
            result.issues = llm_data.get("issues", [])
            result.detail = llm_data.get("detail", "")
            result.compute_average()
            return result

        except (json.JSONDecodeError, KeyError, ValueError) as exc:
            log.warning(f"LLM 评估结果解析失败: {exc}")
            return None

    # ---- 结果合并 ----

    def _merge_results(
        self, structural: EvalResult, llm: EvalResult
    ) -> EvalResult:
        """
        合并结构化检查和 LLM 评估结果。

        策略：取两者的加权平均（结构化 40% + LLM 60%）。
        对于结构化无法评判的标准（基础分 5.0），以 LLM 分数为准。
        """
        merged = EvalResult(
            stage=structural.stage,
            attempt=structural.attempt,
            detail=llm.detail,
        )

        # 建立 LLM 分数索引
        llm_scores = {cs.name: cs for cs in llm.criterion_scores}

        for s_cs in structural.criterion_scores:
            l_cs = llm_scores.get(s_cs.name)
            if l_cs is None:
                merged.criterion_scores.append(s_cs)
                continue

            # 如果结构化给了"基础分"（5.0），以 LLM 为准
            if "需 LLM 评估" in s_cs.reason:
                final_score = l_cs.score
                reason = l_cs.reason
            else:
                # 加权合并：结构化 40% + LLM 60%
                final_score = round(s_cs.score * 0.4 + l_cs.score * 0.6, 1)
                reason = f"结构({s_cs.score:.1f}) + LLM({l_cs.score:.1f})"

            merged.criterion_scores.append(CriterionScore(
                name=s_cs.name,
                score=final_score,
                weight=s_cs.weight,
                reason=reason,
            ))

        # 合并问题列表（去重）
        all_issues = list(dict.fromkeys(structural.issues + llm.issues))
        merged.issues = all_issues

        return merged

    # ---- 反馈文件保存 ----

    def _save_feedback(self, project_id: str, result: EvalResult) -> None:
        """
        保存评估反馈到文件。

        对应 Harness 中 Evaluator 写入 feedback.md 的操作。
        """
        feedback_file = _WORKFLOWS_DIR / project_id / f"feedback_{result.stage}_{result.attempt}.json"
        get_storage().upsert_document(
            "stage_feedback",
            f"{project_id}:{result.stage}:{result.attempt}",
            result.to_dict(),
            project_id=project_id,
            parent_id=project_id,
            status=result.recommendation,
            title=result.stage,
        )
        log.info(f"评估反馈已保存: {feedback_file}")

    # ---- 工具方法 ----

    @staticmethod
    def _find_weight(criteria: list[Criterion], name: str) -> int:
        """在标准列表中查找权重"""
        for c in criteria:
            if c.name == name:
                return c.weight
        return 1
