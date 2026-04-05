"""
Scene 360° View Generator Module
AI-driven scene analysis + sequential view generation for 360° reconstruction.
"""

import base64
import json
import re
import threading
import time
import uuid
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# View Mode Definitions
# ---------------------------------------------------------------------------

VIEW_MODES: dict[int, list[dict[str, str]]] = {
    4: [
        {"key": "front",  "direction": "0°",   "label": "正前方(基准视图)"},
        {"key": "right",  "direction": "90°",  "label": "右转90°"},
        {"key": "back",   "direction": "180°", "label": "后方"},
        {"key": "left",   "direction": "270°", "label": "左转270°"},
    ],
    6: [
        {"key": "front",  "direction": "0°",   "label": "正前方(基准视图)"},
        {"key": "right",  "direction": "90°",  "label": "右转90°"},
        {"key": "back",   "direction": "180°", "label": "后方"},
        {"key": "left",   "direction": "270°", "label": "左转270°"},
        {"key": "up",     "direction": "up",   "label": "上方"},
        {"key": "down",   "direction": "down", "label": "下方"},
    ],
    8: [
        {"key": "front",      "direction": "0°",   "label": "正前方(基准视图)"},
        {"key": "front_right","direction": "45°",  "label": "右前方45°"},
        {"key": "right",      "direction": "90°",  "label": "右转90°"},
        {"key": "back_right", "direction": "135°", "label": "右后方135°"},
        {"key": "back",       "direction": "180°", "label": "后方"},
        {"key": "back_left",  "direction": "225°", "label": "左后方225°"},
        {"key": "left",       "direction": "270°", "label": "左转270°"},
        {"key": "front_left", "direction": "315°", "label": "左前方315°"},
    ],
}

# ---------------------------------------------------------------------------
# Analysis System Prompt
# ---------------------------------------------------------------------------

SCENE_360_ANALYSIS_PROMPT = """你是一个专业的场景空间分析师和图像 prompt 工程师。请仔细分析用户上传的参考图片，完成以下任务：

1. **画风锚定分析**：精确描述图片的渲染风格、材质表现、纹理精细度、色彩风格、光影处理和整体氛围。
2. **场景基础信息**：判断场景类型、观察者位置、视角范围、主光源方向、时间段等。
3. **360°视图画面描述**：基于参考图中可见的元素，为6个方向各写一段**完整的、可直接用于 AI 绘画的英文画面描述**。

重要：每个方向的 image_prompt 必须是**独立完整的画面描述**，描述观察者转向该方向时看到的具体画面。不要使用角度数字（如 "looking 90°"），而是用具体的视觉内容来描述。

请严格按以下JSON格式输出，不要添加任何额外文字：

```json
{
  "style_anchor": {
    "rendering_type": "写实3D渲染 / 卡通3D / 赛璐璐2D / 厚涂半写实 等，精确描述",
    "material_aging": "heavy / medium / light / new",
    "texture_density": "high / medium / simplified",
    "surface_wear": "具体磨损特征描述",
    "vegetation": "植被表现描述",
    "color_style": "饱和度+色调倾向+对比度描述",
    "lighting": "硬光/柔光+阴影锐度+是否有体积光",
    "atmosphere": "整体氛围描述"
  },
  "scene_info": {
    "scene_type": "室内/室外/奇幻/科幻等",
    "ref_angle": "参考图的拍摄角度描述",
    "observer_position": "观察者位置描述",
    "covered_fov": "参考图覆盖的视角范围",
    "main_light": "主光源方向和特征",
    "time_of_day": "时间段"
  },
  "spatial_elements": [
    {
      "direction": "0°(正前方)",
      "visible": ["从参考图中可直接看到的元素列表"],
      "inferred": ["根据场景逻辑推断应存在的元素"],
      "reasoning": "推理依据说明",
      "image_prompt": "A detailed English prompt describing the exact scene viewed from this direction. Example: 'A traditional Chinese old street with cobblestone path, two-story wooden buildings on both sides with red lanterns hanging, shop signs reading herbal medicine store, warm golden sunset light casting long shadows, a few wooden barrels and potted plants near doorways, misty atmosphere in the distance'"
    },
    {
      "direction": "90°(右侧)",
      "visible": ["参考图右边缘可见的元素"],
      "inferred": ["推断的右侧空间元素"],
      "reasoning": "推理依据",
      "image_prompt": "Complete English scene description for what is seen when turning right..."
    },
    {
      "direction": "180°(后方)",
      "visible": [],
      "inferred": ["根据场景类型推断的背后元素"],
      "reasoning": "推理依据",
      "image_prompt": "Complete English scene description for what is behind the observer..."
    },
    {
      "direction": "270°(左侧)",
      "visible": ["参考图左边缘可见的元素"],
      "inferred": ["推断的左侧空间元素"],
      "reasoning": "推理依据",
      "image_prompt": "Complete English scene description for what is seen when turning left..."
    },
    {
      "direction": "up(上方)",
      "visible": ["参考图上方可见的元素"],
      "inferred": ["推断的上方元素（天花板/天空等）"],
      "reasoning": "推理依据",
      "image_prompt": "Complete English scene description looking upward..."
    },
    {
      "direction": "down(下方)",
      "visible": ["参考图下方可见的地面元素"],
      "inferred": ["推断的地面纹理和细节"],
      "reasoning": "推理依据",
      "image_prompt": "Complete English scene description looking downward at the ground..."
    }
  ]
}
```

关键要求：
- rendering_type 必须精确描述（禁止笼统词如"好看的"），例如："厚涂半写实风格，带有强烈笔触感的数字绘画"
- 空间推理必须合理：室内场景至少有一扇门，家具位置符合功能逻辑
- 相邻方向的边缘元素必须能逻辑衔接
- **image_prompt 是最重要的字段**：必须是完整的英文画面描述，50-100个英文单词，包含具体的物体、材质、光影、氛围。描述应该让图像生成模型仅凭这段文字就能画出准确的画面
- image_prompt 中**禁止使用角度数字**（如"90 degrees"、"looking left"），只用具体的视觉内容
- 6个方向的 image_prompt 之间应保持风格、光影、材质一致，但画面内容不同
- 仅输出JSON，不要加任何解释性文字"""

# ---------------------------------------------------------------------------
# Prompt Template
# ---------------------------------------------------------------------------

VIEW_PROMPT_TEMPLATE = (
    "{image_prompt}. "
    "[Exact rendering style: {rendering_type}], "
    "[Material: {surface_wear}, aging level: {material_aging}], "
    "[Texture density: {texture_density}], "
    "[Color palette: {color_style}], "
    "[Lighting: {lighting}, main light from {main_light}], "
    "[Atmosphere: {atmosphere}], "
    "[Time of day: {time_of_day}], "
    "[Aspect ratio: {aspect_ratio}], "
    "no text, no labels, no watermarks, no UI elements, no annotations"
)

# ---------------------------------------------------------------------------
# Storage & Job Registry
# ---------------------------------------------------------------------------

GRID_STORAGE_DIR = Path("storage/grid-jobs")
_jobs: dict[str, dict[str, Any]] = {}
_jobs_lock = threading.Lock()


# ---------------------------------------------------------------------------
# JSON Parsing (triple strategy)
# ---------------------------------------------------------------------------

def _parse_ai_json(text: str) -> dict:
    """Parse JSON from AI response. Tries raw → fenced → regex."""
    text = text.strip()
    # Strategy 1: raw JSON
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Strategy 2: fenced ```json ... ```
    match = re.search(r"```json\s*([\s\S]*?)```", text)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass
    # Strategy 3: first { ... } block
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    raise ValueError(f"无法解析AI返回的JSON: {text[:200]}...")


# ---------------------------------------------------------------------------
# Step 1: Scene Analysis
# ---------------------------------------------------------------------------

def analyze_scene(ref_b64: str, mime_type: str, gemini_request_fn: Any) -> dict:
    """Analyze a reference image using Gemini vision. Returns structured analysis."""
    from server import STATE, _get_gemini_key, GEMINI_BASE

    # Use image model for vision analysis (it supports generateContent with images)
    model = STATE.get("ai_image_model") or "gemini-2.5-pro"
    base = STATE.get("ai_image_base") or GEMINI_BASE

    parts = [
        {"inlineData": {"mimeType": mime_type, "data": ref_b64}},
        {"text": SCENE_360_ANALYSIS_PROMPT},
    ]

    payload = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"responseMimeType": "text/plain"},
    }

    url = f"{base}/models/{model}:generateContent"
    result = gemini_request_fn(url, payload, timeout=120)

    # Extract text from response
    text = ""
    for candidate in result.get("candidates", []):
        for part in candidate.get("content", {}).get("parts", []):
            if "text" in part:
                text += part["text"]

    if not text:
        raise RuntimeError("AI 未返回分析结果")

    return _parse_ai_json(text)


# ---------------------------------------------------------------------------
# Step 3: View Generation
# ---------------------------------------------------------------------------

def build_view_prompt(analysis: dict, view: dict, aspect_ratio: str) -> str:
    """Build image generation prompt from analysis + view direction.
    Uses image_prompt from spatial elements as the primary scene description.
    Falls back to visible/inferred elements if image_prompt is missing.
    """
    style = analysis.get("style_anchor", {})
    scene = analysis.get("scene_info", {})
    spatial = analysis.get("spatial_elements", [])

    # Find spatial elements for this direction
    direction = view["direction"]
    image_prompt = ""
    for elem in spatial:
        elem_dir = elem.get("direction", "")
        if direction in elem_dir or elem_dir.startswith(direction):
            # Prefer image_prompt (complete scene description)
            image_prompt = elem.get("image_prompt", "")
            if not image_prompt:
                # Fallback: build from visible + inferred lists
                parts = []
                visible = elem.get("visible", [])
                inferred = elem.get("inferred", [])
                if visible:
                    parts.append(", ".join(visible))
                if inferred:
                    parts.append(", ".join(inferred))
                image_prompt = "; ".join(parts) if parts else f"Scene view from observer position"
            break

    if not image_prompt:
        image_prompt = f"Scene view showing {scene.get('scene_type', 'environment')}"

    return VIEW_PROMPT_TEMPLATE.format(
        image_prompt=image_prompt,
        rendering_type=style.get("rendering_type", "detailed illustration"),
        surface_wear=style.get("surface_wear", "clean"),
        material_aging=style.get("material_aging", "light"),
        texture_density=style.get("texture_density", "medium"),
        color_style=style.get("color_style", "balanced"),
        lighting=style.get("lighting", "natural"),
        main_light=scene.get("main_light", "ambient"),
        atmosphere=style.get("atmosphere", "neutral"),
        time_of_day=scene.get("time_of_day", "daytime"),
        aspect_ratio=aspect_ratio,
    )


def create_scene360_job(
    ref_b64: str,
    mime_type: str,
    analysis: dict,
    view_count: int,
    aspect_ratio: str,
    generate_image_fn: Any,
) -> str:
    """Create and start a scene 360° generation job. Returns job_id."""
    if view_count not in VIEW_MODES:
        raise ValueError(f"view_count must be 4, 6, or 8, got {view_count}")

    job_id = str(uuid.uuid4())
    views = VIEW_MODES[view_count]

    job_dir = GRID_STORAGE_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    results = [
        {"key": v["key"], "label": v["label"], "direction": v["direction"],
         "status": "pending", "image_url": None}
        for v in views
    ]

    job: dict[str, Any] = {
        "job_id": job_id,
        "status": "pending",
        "view_count": view_count,
        "aspect_ratio": aspect_ratio,
        "completed": 0,
        "total": len(views),
        "results": results,
        "stitch_guide": None,
        "created_at": time.time(),
        "_ref_b64": ref_b64,
        "_ref_mime": mime_type,
        "_analysis": analysis,
    }

    with _jobs_lock:
        _jobs[job_id] = job

    thread = threading.Thread(
        target=_scene360_worker,
        args=(job_id, ref_b64, mime_type, analysis, views, aspect_ratio, generate_image_fn),
        name=f"scene360_{job_id}",
        daemon=True,
    )
    thread.start()
    return job_id


def get_scene360_job_status(job_id: str) -> dict[str, Any] | None:
    """Return current status of a scene 360 job."""
    with _jobs_lock:
        job = _jobs.get(job_id)
    if job is None:
        return None
    return {
        "job_id": job["job_id"],
        "status": job["status"],
        "view_count": job["view_count"],
        "completed": job["completed"],
        "total": job["total"],
        "results": [
            {k: v for k, v in r.items() if not k.startswith("_")}
            for r in job["results"]
        ],
        "stitch_guide": job.get("stitch_guide"),
    }


def regenerate_single_view(
    job_id: str,
    view_key: str,
    generate_image_fn: Any,
) -> bool:
    """Regenerate a single view in an existing job."""
    with _jobs_lock:
        job = _jobs.get(job_id)
        if job is None:
            return False

        target_index = None
        for i, r in enumerate(job["results"]):
            if r["key"] == view_key:
                target_index = i
                break
        if target_index is None:
            return False

        ref_b64 = job.get("_ref_b64")
        mime_type = job.get("_ref_mime", "image/png")
        analysis = job.get("_analysis", {})
        aspect_ratio = job.get("aspect_ratio", "16:9")
        if not ref_b64:
            return False

        job["results"][target_index]["status"] = "generating"
        job["results"][target_index]["image_url"] = None
        job["status"] = "generating"
        job["completed"] = sum(1 for r in job["results"] if r["status"] in ("done", "failed"))

    views = VIEW_MODES.get(job["view_count"], VIEW_MODES[6])
    view_config = next((v for v in views if v["key"] == view_key), None)
    if not view_config:
        return False

    def _regen_worker() -> None:
        job_dir = GRID_STORAGE_DIR / job_id
        prompt = build_view_prompt(analysis, view_config, aspect_ratio)
        reference_images = [{"data": ref_b64, "mimeType": mime_type}]

        try:
            predictions = generate_image_fn(
                prompt, aspect_ratio=aspect_ratio, reference_images=reference_images
            )
            if not predictions:
                raise RuntimeError("API 未返回图片")
            pred = predictions[0]
            img_b64 = pred.get("bytesBase64Encoded", "")
            if not img_b64:
                raise RuntimeError("API 返回空图片数据")

            img_mime = pred.get("mimeType", "image/png")
            ext = ".png" if "png" in img_mime else ".jpg"
            filename = f"{view_key}{ext}"
            (job_dir / filename).write_bytes(base64.b64decode(img_b64))
            image_url = f"/api/grid/assets/{job_id}/{filename}?t={int(time.time())}"

            with _jobs_lock:
                job["results"][target_index]["status"] = "done"
                job["results"][target_index]["image_url"] = image_url
        except Exception as exc:
            with _jobs_lock:
                job["results"][target_index]["status"] = "failed"
                job["results"][target_index]["error"] = str(exc)

        with _jobs_lock:
            job["completed"] = sum(1 for r in job["results"] if r["status"] in ("done", "failed"))
            failed = sum(1 for r in job["results"] if r["status"] == "failed")
            if failed == job["total"]:
                job["status"] = "failed"
            elif failed > 0:
                job["status"] = "partial"
            elif job["completed"] == job["total"]:
                job["status"] = "done"
                job["stitch_guide"] = generate_stitch_guide(analysis, job["view_count"])

    threading.Thread(target=_regen_worker, daemon=True).start()
    return True


def _scene360_worker(
    job_id: str,
    ref_b64: str,
    mime_type: str,
    analysis: dict,
    views: list[dict[str, str]],
    aspect_ratio: str,
    generate_image_fn: Any,
) -> None:
    """Background worker: generate views SEQUENTIALLY for consistency."""
    with _jobs_lock:
        _jobs[job_id]["status"] = "generating"

    job_dir = GRID_STORAGE_DIR / job_id
    reference_images = [{"data": ref_b64, "mimeType": mime_type}]

    for i, view in enumerate(views):
        prompt = build_view_prompt(analysis, view, aspect_ratio)

        try:
            predictions = generate_image_fn(
                prompt, aspect_ratio=aspect_ratio, reference_images=reference_images
            )
            if not predictions:
                raise RuntimeError("API 未返回图片")

            pred = predictions[0]
            img_b64 = pred.get("bytesBase64Encoded", "")
            img_mime = pred.get("mimeType", "image/png")
            if not img_b64:
                raise RuntimeError("API 返回空图片数据")

            ext = ".png" if "png" in img_mime else ".jpg"
            filename = f"{view['key']}{ext}"
            (job_dir / filename).write_bytes(base64.b64decode(img_b64))
            image_url = f"/api/grid/assets/{job_id}/{filename}"

            with _jobs_lock:
                job = _jobs[job_id]
                job["results"][i]["status"] = "done"
                job["results"][i]["image_url"] = image_url
                job["completed"] = sum(1 for r in job["results"] if r["status"] in ("done", "failed"))

        except Exception as exc:
            with _jobs_lock:
                job = _jobs[job_id]
                job["results"][i]["status"] = "failed"
                job["results"][i]["error"] = str(exc)
                job["completed"] = sum(1 for r in job["results"] if r["status"] in ("done", "failed"))

    # Final status + stitch guide
    with _jobs_lock:
        job = _jobs[job_id]
        failed = sum(1 for r in job["results"] if r["status"] == "failed")
        if failed == job["total"]:
            job["status"] = "failed"
        elif failed > 0:
            job["status"] = "partial"
        else:
            job["status"] = "done"
        job["stitch_guide"] = generate_stitch_guide(analysis, job["view_count"])


# ---------------------------------------------------------------------------
# Step 4: Stitch Guide
# ---------------------------------------------------------------------------

def generate_stitch_guide(analysis: dict, view_count: int) -> str:
    """Generate stitching guidance text based on analysis and view count."""
    scene_type = analysis.get("scene_info", {}).get("scene_type", "场景")
    lines = [
        f"## 全景拼接指南（{view_count}视图）",
        "",
        f"**场景类型**: {scene_type}",
        "",
        "### 拼接顺序",
    ]

    if view_count in (4, 6, 8):
        lines.append("水平拼接顺序: 正前方(0°) → 右侧(90°) → 后方(180°) → 左侧(270°)")
        if view_count >= 8:
            lines.append("包含对角视图: 45°, 135°, 225°, 315°")
        if view_count == 6:
            lines.append("垂直视图: 上方 + 下方（用于立方体贴图）")

    lines.extend([
        "",
        "### 接缝处理",
        "- 相邻视图的边缘区域可能需要手动调整以确保无缝衔接",
        "- 注意光影方向在接缝处的连续性",
        "- 地面纹理和天空在接缝处应自然过渡",
        "",
        "### 推荐工具",
        "- **Hugin** (免费): 支持自定义控制点的全景拼接",
        "- **PTGui**: 专业全景拼接软件",
        "- **在线工具**: 可搜索 equirectangular stitching tools",
    ])

    return "\n".join(lines)
