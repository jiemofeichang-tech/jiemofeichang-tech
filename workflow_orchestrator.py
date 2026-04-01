"""
工作流编排器 — 四阶段生产管线的核心循环。

灵感来源：HarnessEngineeringMaster 的 harness.py
  - Harness.run(): 外层 Plan → Build → Evaluate 循环
  - _negotiate_contract(): Sprint 合同协商
  - _extract_score(): 分数提取和趋势分析
  - REFINE vs PIVOT 策略决策

本模块将这些模式映射到视频制作管线：
  Script → Characters → Storyboard → Video

每个阶段遵循 Build → Evaluate → (REFINE/PIVOT) 循环，
直到分数达到验收标准或耗尽最大尝试次数。
"""
from __future__ import annotations

import json
import logging
import threading
import time
from pathlib import Path
from typing import Any

from mysql_storage import get_storage
from stage_contract import ContractManager, StageContract
from stage_evaluator import EvalResult, StageEvaluator
from workflow_checkpoint import CheckpointManager
from workflow_state import (
    PIPELINE_STATUS_COMPLETED,
    PIPELINE_STATUS_FAILED,
    PIPELINE_STATUS_PAUSED,
    PIPELINE_STATUS_RUNNING,
    STAGES,
    PipelineState,
)

log = logging.getLogger("workflow.orchestrator")

# ---------------------------------------------------------------------------
# 常量
# ---------------------------------------------------------------------------

# 等待异步任务完成的轮询间隔（秒）
POLL_INTERVAL = 5
# 等待超时（秒）
POLL_TIMEOUT = 600  # 10 分钟


# ---------------------------------------------------------------------------
# WorkflowOrchestrator — 核心编排器
# ---------------------------------------------------------------------------

class WorkflowOrchestrator:
    """
    四阶段生产管线编排器。

    架构对应 Harness.run()：
    ┌──────────────── 对每个阶段 ────────────────┐
    │                                              │
    │  1. 加载验收合同 (contract.json)              │
    │  2. Build（调用对应引擎）                     │
    │  3. Evaluate（结构检查 + LLM 评分）           │
    │  4. 如果 score >= threshold → 推进            │
    │     否则 → REFINE 或 PIVOT 后重试             │
    │  5. 保存检查点                                │
    │                                              │
    └──────────────────────────────────────────────┘
    """

    def __init__(self, config: dict[str, Any]):
        """
        Args:
            config: 工作流配置字典，包含：
                - api_key: API 密钥
                - base_url / ai_chat_base: LLM API 地址
                - image_api_url / ai_image_base: 图像 API 地址
                - model / ai_chat_model: LLM 模型名称
        """
        self.config = config
        self.contract_mgr = ContractManager()
        self.evaluator = StageEvaluator(config)
        self.checkpoint_mgr = CheckpointManager()

        # 引擎实例（懒加载）
        self._engines: dict[str, Any] = {}

    # ---- 引擎管理（懒加载） ----

    def _get_engine(self, name: str) -> Any:
        """懒加载工作流引擎"""
        if name not in self._engines:
            if name == "script":
                from script_engine import ScriptEngine
                self._engines[name] = ScriptEngine(self.config)
            elif name == "characters":
                from character_factory import CharacterFactory
                self._engines[name] = CharacterFactory(self.config)
            elif name == "storyboard":
                from storyboard_generator import StoryboardGenerator
                self._engines[name] = StoryboardGenerator(self.config)
            elif name == "video":
                from video_composer import VideoComposer
                self._engines[name] = VideoComposer(self.config)
            else:
                raise ValueError(f"未知引擎: {name}")
        return self._engines[name]

    # ---- 主管线入口 ----

    def start_pipeline(
        self,
        project_id: str,
        params: dict[str, Any],
        async_run: bool = True,
    ) -> PipelineState:
        """
        启动完整管线。

        Args:
            project_id: 项目 ID
            params: 管线参数 (genre, theme, characters_count, episodes_count)
            async_run: 是否在后台线程运行

        Returns:
            PipelineState（如果 async_run=True，状态为 running）
        """
        state = PipelineState.create(project_id, params)

        # 写入所有阶段的默认合同
        self.contract_mgr.write_all_contracts(project_id)

        if async_run:
            thread = threading.Thread(
                target=self._run_pipeline_worker,
                args=(state,),
                name=f"pipeline_{state.pipeline_id}",
                daemon=True,
            )
            thread.start()
            log.info(f"管线已在后台启动: {state.pipeline_id}")
        else:
            self._run_pipeline_worker(state)

        return state

    def resume_pipeline(
        self,
        project_id: str,
        async_run: bool = True,
    ) -> PipelineState | None:
        """
        从检查点恢复管线。

        对应 Harness 的 restore_from_checkpoint()。
        """
        # 优先从 state.json 恢复
        state = PipelineState.load(project_id)
        if state is None:
            # 尝试从检查点恢复
            cp_data = self.checkpoint_mgr.restore_checkpoint(project_id)
            if cp_data is None:
                log.error(f"项目 {project_id} 没有可恢复的状态")
                return None
            state = PipelineState.load(project_id)
            if state is None:
                return None

        if state.status == PIPELINE_STATUS_COMPLETED:
            log.info(f"管线已完成，无需恢复: {state.pipeline_id}")
            return state

        state.status = PIPELINE_STATUS_RUNNING
        state.save()

        if async_run:
            thread = threading.Thread(
                target=self._run_pipeline_worker,
                args=(state,),
                name=f"pipeline_resume_{state.pipeline_id}",
                daemon=True,
            )
            thread.start()
            log.info(f"管线已在后台恢复: {state.pipeline_id} (从 {state.current_stage} 阶段)")
        else:
            self._run_pipeline_worker(state)

        return state

    def get_pipeline_status(self, project_id: str) -> PipelineState | None:
        """查询管线当前状态"""
        return PipelineState.load(project_id)

    # ---- 核心循环 ----

    def _run_pipeline_worker(self, state: PipelineState) -> None:
        """
        管线主循环（在后台线程中运行）。

        对应 Harness.run() 的核心逻辑：
          for round in range(MAX_ROUNDS):
            negotiate_contract()
            builder.run()
            evaluator.run()
            score = extract_score()
            if score >= threshold: break
        """
        total_start = time.time()

        try:
            # 找到起始阶段索引（用于恢复）
            start_idx = STAGES.index(state.current_stage)

            for i in range(start_idx, len(STAGES)):
                stage_name = STAGES[i]
                state.current_stage = stage_name
                state.save()

                log.info("=" * 60)
                log.info(f"阶段 {i + 1}/{len(STAGES)}: {stage_name.upper()}")
                log.info("=" * 60)

                stage_start = time.time()
                passed = self._run_stage(state, stage_name)
                stage_duration = time.time() - stage_start

                log.info(
                    f"[{stage_name}] 阶段耗时: {stage_duration:.0f}s, "
                    f"结果: {'通过 ✓' if passed else '未通过 ✗'}"
                )

                if not passed:
                    # 关键阶段失败 → 停止管线
                    if stage_name in ("script", "video"):
                        state.status = PIPELINE_STATUS_FAILED
                        state.save()
                        log.error(f"关键阶段 [{stage_name}] 失败，管线终止")
                        return
                    # 非关键阶段 → 标记警告，继续
                    log.warning(f"[{stage_name}] 未通过但继续执行后续阶段")

                # 推进到下一阶段
                if i + 1 < len(STAGES):
                    state.current_stage = STAGES[i + 1]
                    state.save()

            # 所有阶段完成
            state.status = PIPELINE_STATUS_COMPLETED
            state.save()

            total_duration = time.time() - total_start
            log.info("=" * 60)
            log.info(f"管线完成 — 总耗时: {total_duration / 60:.1f} 分钟")
            log.info(f"项目: {state.project_id}")
            log.info("=" * 60)

        except Exception as exc:
            log.exception(f"管线执行异常: {exc}")
            state.status = PIPELINE_STATUS_FAILED
            state.mark_stage_failed(state.current_stage, str(exc))

    def _run_stage(self, state: PipelineState, stage_name: str) -> bool:
        """
        执行单个阶段的 Build → Evaluate → REFINE/PIVOT 循环。

        对应 Harness 的内层循环：
        ```
        for round in range(MAX_ROUNDS):
            builder.run(task)
            evaluator.run(eval_task)
            score = extract_score()
            if score >= threshold: break
            # REFINE vs PIVOT 决策
        ```
        """
        contract = self.contract_mgr.get_contract(stage_name)
        stage = state.stages[stage_name]

        for attempt in range(1, contract.max_attempts + 1):
            # ---- 1. 策略决策（Harness REFINE vs PIVOT） ----
            if attempt > 1:
                strategy = self._decide_strategy(stage.score_history)
                state.set_strategy(stage_name, strategy)
                log.info(
                    f"[{stage_name}] 第 {attempt} 次尝试 | "
                    f"策略: {strategy} | "
                    f"分数历史: {stage.score_history}"
                )
            else:
                strategy = None

            # ---- 2. Build（调用引擎） ----
            state.mark_stage_running(stage_name)
            try:
                artifact_id = self._build_stage(
                    stage_name, state.project_id, state.params, strategy
                )
                stage.artifact_id = artifact_id
                state.save()
            except Exception as exc:
                log.error(f"[{stage_name}] 构建失败: {exc}")
                state.mark_stage_failed(stage_name, str(exc))
                continue

            # ---- 3. 等待完成 ----
            artifact_data = self._wait_for_completion(stage_name, artifact_id, state)
            if artifact_data is None:
                log.error(f"[{stage_name}] 等待产物超时或失败")
                state.mark_stage_failed(stage_name, "超时或产物获取失败")
                continue

            # ---- 4. Evaluate（评分） ----
            state.mark_stage_evaluating(stage_name)
            eval_result = self.evaluator.evaluate(
                stage=stage_name,
                artifact_data=artifact_data,
                contract=contract,
                attempt=attempt,
                project_id=state.project_id,
            )
            state.record_score(stage_name, eval_result.average)

            # ---- 5. 检查点（Harness checkpoint） ----
            self.checkpoint_mgr.save_checkpoint(
                project_id=state.project_id,
                state_data=state.to_dict(),
                reason=f"stage_{stage_name}_attempt_{attempt}",
            )

            # ---- 6. 质量门控 ----
            if eval_result.average >= contract.pass_threshold:
                state.mark_stage_passed(stage_name)
                log.info(
                    f"[{stage_name}] ✓ 通过质量门控: "
                    f"{eval_result.average:.1f}/10 >= {contract.pass_threshold}"
                )
                return True
            else:
                log.info(
                    f"[{stage_name}] ✗ 未通过: "
                    f"{eval_result.average:.1f}/10 < {contract.pass_threshold} "
                    f"(建议: {eval_result.recommendation})"
                )
                if eval_result.issues:
                    log.info(f"[{stage_name}] 问题: {eval_result.issues[:3]}")

        # 达到最大尝试次数
        state.mark_stage_failed(
            stage_name,
            f"在 {contract.max_attempts} 次尝试后仍未达到 {contract.pass_threshold} 分",
        )
        return False

    # ---- 策略决策 ----

    def _decide_strategy(self, scores: list[float]) -> str:
        """
        Harness REFINE vs PIVOT 策略。

        来源：harness.py 中的分数趋势分析
          if delta > 0: IMPROVING → REFINE
          if delta == 0: STAGNANT → PIVOT
          if delta < 0: DECLINING → PIVOT
        """
        if len(scores) < 2:
            return "REFINE"

        delta = scores[-1] - scores[-2]

        if delta > 0.5:
            log.info(f"分数趋势: 上升 (+{delta:.1f}) → REFINE")
            return "REFINE"
        elif delta > 0:
            log.info(f"分数趋势: 微升 (+{delta:.1f}) → REFINE")
            return "REFINE"
        elif delta == 0:
            log.info(f"分数趋势: 停滞 → PIVOT")
            return "PIVOT"
        else:
            log.info(f"分数趋势: 下降 ({delta:.1f}) → PIVOT")
            return "PIVOT"

    # ---- 构建阶段 ----

    def _build_stage(
        self,
        stage: str,
        project_id: str,
        params: dict[str, Any],
        strategy: str | None,
    ) -> str:
        """
        调用对应引擎生成产物。

        对应 Harness 中 Builder.run(build_task) 的调用。
        如果 strategy == "PIVOT"，传递参数让引擎尝试不同方案。
        """
        if stage == "script":
            return self._build_script(project_id, params, strategy)
        elif stage == "characters":
            return self._build_characters(project_id, params, strategy)
        elif stage == "storyboard":
            return self._build_storyboard(project_id, params, strategy)
        elif stage == "video":
            return self._build_video(project_id, params, strategy)
        else:
            raise ValueError(f"未知阶段: {stage}")

    def _build_script(
        self, project_id: str, params: dict[str, Any], strategy: str | None
    ) -> str:
        """生成剧本"""
        engine = self._get_engine("script")

        genre = params.get("genre", "喜剧")
        theme = params.get("theme", "")
        characters_count = int(params.get("characters_count", 4))
        episodes_count = int(params.get("episodes_count", 1))

        # PIVOT 策略：调整参数产生不同结果
        if strategy == "PIVOT":
            log.info("[script] PIVOT: 调整主题角度重新生成")
            theme = f"（换一个完全不同的角度和风格）{theme}"

        script_id = engine.generate_script(
            project_id=project_id,
            genre=genre,
            theme=theme,
            characters_count=characters_count,
            episodes_count=episodes_count,
        )
        log.info(f"[script] 已提交生成: {script_id}")
        return script_id

    def _build_characters(
        self, project_id: str, params: dict[str, Any], strategy: str | None
    ) -> str:
        """生成角色资产"""
        engine = self._get_engine("characters")

        # 从已生成的剧本中提取角色信息
        script_engine = self._get_engine("script")
        # 查找项目最新的剧本
        script_data = self._find_latest_script(project_id)
        if not script_data:
            raise RuntimeError("没有可用的剧本，无法生成角色")

        characters = script_data.get("characters", [])
        if not characters:
            raise RuntimeError("剧本中没有角色信息")

        # 为每个角色创建资产
        char_ids: list[str] = []
        for char in characters:
            char_id = engine.create_character(
                project_id=project_id,
                name=char.get("name", "未命名"),
                personality=char.get("personality", ""),
                appearance_desc=char.get("appearance", ""),
                role_type=char.get("role", "配角"),
                script_id=script_data.get("script_id", ""),
            )
            char_ids.append(char_id)
            log.info(f"[characters] 已提交角色生成: {char.get('name')} → {char_id}")

        # 返回以逗号分隔的 ID（后续查询用）
        return ",".join(char_ids)

    def _build_storyboard(
        self, project_id: str, params: dict[str, Any], strategy: str | None
    ) -> str:
        """生成分镜"""
        engine = self._get_engine("storyboard")

        script_data = self._find_latest_script(project_id)
        if not script_data:
            raise RuntimeError("没有可用的剧本，无法生成分镜")

        sb_id = engine.generate_storyboard(
            project_id=project_id,
            script_id=script_data.get("script_id", ""),
            episode_index=int(params.get("episode_index", 0)),
        )
        log.info(f"[storyboard] 已提交分镜生成: {sb_id}")
        return sb_id

    def _build_video(
        self, project_id: str, params: dict[str, Any], strategy: str | None
    ) -> str:
        """合成视频"""
        engine = self._get_engine("video")

        script_data = self._find_latest_script(project_id)
        # 查找项目最新的分镜
        sb_data = self._find_latest_storyboard(project_id)
        if not sb_data:
            raise RuntimeError("没有可用的分镜，无法合成视频")

        task_id = engine.compose_video(
            project_id=project_id,
            storyboard_id=sb_data.get("storyboard_id", ""),
            script_id=script_data.get("script_id", "") if script_data else None,
            episode_index=int(params.get("episode_index", 0)),
        )
        log.info(f"[video] 已提交视频合成: {task_id}")
        return task_id

    # ---- 等待完成 ----

    def _wait_for_completion(
        self,
        stage: str,
        artifact_id: str,
        state: PipelineState,
    ) -> dict[str, Any] | None:
        """
        轮询等待异步任务完成。

        所有引擎都是异步的（返回 ID 后在后台线程生成），
        这里需要轮询检查状态直到完成。
        """
        deadline = time.time() + POLL_TIMEOUT

        while time.time() < deadline:
            try:
                data = self._get_artifact_data(stage, artifact_id, state.project_id)
                if data is None:
                    time.sleep(POLL_INTERVAL)
                    continue

                status = data.get("status", "")
                if status in ("done", "succeeded"):
                    log.info(f"[{stage}] 产物已完成: {artifact_id}")
                    return data
                elif status in ("error", "failed"):
                    log.error(f"[{stage}] 产物生成失败: {artifact_id}")
                    return data
                else:
                    log.debug(f"[{stage}] 等待中... 状态: {status}")

            except Exception as exc:
                log.warning(f"[{stage}] 查询产物状态异常: {exc}")

            time.sleep(POLL_INTERVAL)

        log.error(f"[{stage}] 等待超时 ({POLL_TIMEOUT}s): {artifact_id}")
        return None

    def _get_artifact_data(
        self, stage: str, artifact_id: str, project_id: str
    ) -> dict[str, Any] | None:
        """获取产物数据"""
        if stage == "script":
            engine = self._get_engine("script")
            return engine.get_script(artifact_id)

        elif stage == "characters":
            engine = self._get_engine("characters")
            char_ids = artifact_id.split(",")
            characters = []
            for cid in char_ids:
                char = engine.get_character(cid.strip())
                if char:
                    characters.append(char)
            if not characters:
                return None
            # 聚合状态：所有角色都 done 才算 done
            all_done = all(c.get("status") == "done" for c in characters)
            any_error = any(c.get("status") == "error" for c in characters)
            return {
                "characters": characters,
                "status": "done" if all_done else ("error" if any_error else "generating"),
            }

        elif stage == "storyboard":
            return get_storage().get_document("storyboard", artifact_id)

        elif stage == "video":
            return get_storage().get_document("video_task", artifact_id)

        return None

    # ---- 辅助查找方法 ----

    def _find_latest_script(self, project_id: str) -> dict[str, Any] | None:
        """查找项目最新的已完成剧本"""
        for data in get_storage().list_documents("script", project_id=project_id):
            if data.get("status") in ("done", "succeeded", "completed"):
                return data
        return None

    def _find_latest_storyboard(self, project_id: str) -> dict[str, Any] | None:
        """查找项目最新的已完成分镜"""
        for data in get_storage().list_documents("storyboard", project_id=project_id):
            if data.get("status") in ("done", "succeeded", "completed"):
                return data
        return None
