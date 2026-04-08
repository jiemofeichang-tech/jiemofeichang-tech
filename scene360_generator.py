"""
Scene 360° View Generator Module
AI-driven scene analysis + sequential view generation for 360° reconstruction.
"""

import base64
import json
import os
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

def _analyze_via_oai_chat(ref_b64: str, mime_type: str, system_prompt: str, chat_base: str, chat_model: str, chat_key: str) -> dict:
    """Analyze image via OAI-compatible chat endpoint, routed through Next.js proxy."""
    import urllib.request as _ureq

    data_uri = f"data:{mime_type};base64,{ref_b64}"
    messages = [
        {"role": "user", "content": [
            {"type": "text", "text": system_prompt},
            {"type": "image_url", "image_url": {"url": data_uri}},
        ]},
    ]

    proxy_payload = {
        "baseUrl": chat_base,
        "model": chat_model,
        "apiKey": chat_key,
        "messages": messages,
    }

    body = json.dumps(proxy_payload, ensure_ascii=False).encode("utf-8")
    opener = _ureq.build_opener(_ureq.ProxyHandler({}))
    proxy_origins: list[str] = []
    for candidate in (
        os.environ.get("NEXT_PROXY_ORIGIN"),
        os.environ.get("NEXT_PUBLIC_APP_ORIGIN"),
        "http://127.0.0.1:3002",
        "http://localhost:3002",
        "http://127.0.0.1:3001",
        "http://localhost:3001",
    ):
        if candidate and candidate not in proxy_origins:
            proxy_origins.append(candidate)

    last_error = None
    for origin in proxy_origins:
        req = _ureq.Request(f"{origin}/api/oai-chat-proxy", data=body, headers={
            "Content-Type": "application/json",
        })
        try:
            with opener.open(req, timeout=280) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                break
        except Exception as exc:
            last_error = exc
    else:
        raise RuntimeError(f"OAI chat proxy unavailable: {last_error}")

    if "error" in result:
        raise RuntimeError(result["error"])

    text = result.get("content", "")
    if not text:
        raise RuntimeError("AI 未返回分析结果")
    return _parse_ai_json(text)


def _extract_oai_text_direct(result: dict) -> str:
    """Extract text from common OpenAI-compatible response shapes."""
    choices = result.get("choices")
    if isinstance(choices, list) and choices:
        message = choices[0].get("message", {})
        content = message.get("content", "")
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                if not isinstance(item, dict):
                    continue
                if item.get("type") == "text" and isinstance(item.get("text"), str):
                    parts.append(item["text"])
                elif isinstance(item.get("text"), str):
                    parts.append(item["text"])
            if parts:
                return "\n".join(parts).strip()

    output_text = result.get("output_text")
    if isinstance(output_text, str):
        return output_text.strip()

    content = result.get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict) and isinstance(item.get("text"), str):
                parts.append(item["text"])
        if parts:
            return "\n".join(parts).strip()

    return ""


def _looks_like_missing_image_reply(text: str) -> bool:
    normalized = (text or "").lower()
    return any(
        phrase in normalized
        for phrase in (
            '"saw_image": false',
            '"saw_image":false',
            "no image",
            "no image attached",
            "haven't actually uploaded any image",
            "you haven't actually uploaded",
            "don't see any image",
            "please upload",
            "没有看到任何图片",
            "没有接收到图片",
            "请上传",
        )
    )


def _compress_image_b64(b64_data: str, mime_type: str, max_bytes: int = 1_500_000) -> tuple[str, str]:
    """Compress base64-encoded image to fit within max_bytes. Returns (new_b64, new_mime)."""
    raw = base64.b64decode(b64_data)
    if len(raw) <= max_bytes:
        return b64_data, mime_type
    try:
        import io
        import struct
        # Parse PNG dimensions from header
        if raw[:4] == b'\x89PNG':
            w, h = struct.unpack('>II', raw[16:24])
        else:
            # For JPEG, attempt a rough decode or just scale down aggressively
            w, h = 2000, 2000  # fallback
        # Scale down to reduce size
        scale = (max_bytes / len(raw)) ** 0.5
        new_w, new_h = max(int(w * scale), 512), max(int(h * scale), 512)
        # Use tkinter (stdlib) to resize if available, otherwise just convert to JPEG via raw resize
        try:
            from PIL import Image
            img = Image.open(io.BytesIO(raw))
            img = img.convert("RGB")
            img = img.resize((new_w, new_h), Image.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=75)
            print(f"[scene360] Compressed image from {len(raw)} to {buf.tell()} bytes ({w}x{h} -> {new_w}x{new_h})", flush=True)
            return base64.b64encode(buf.getvalue()).decode(), "image/jpeg"
        except ImportError:
            # No PIL — try converting PNG to lower-quality JPEG via subprocess
            import subprocess, tempfile
            with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp_in:
                tmp_in.write(raw)
                tmp_in_path = tmp_in.name
            tmp_out_path = tmp_in_path.replace('.png', '.jpg')
            try:
                subprocess.run(['magick', tmp_in_path, '-resize', f'{new_w}x{new_h}', '-quality', '75', tmp_out_path],
                              capture_output=True, timeout=30)
                with open(tmp_out_path, 'rb') as f:
                    compressed = f.read()
                print(f"[scene360] Compressed image via magick from {len(raw)} to {len(compressed)} bytes", flush=True)
                return base64.b64encode(compressed).decode(), "image/jpeg"
            except Exception:
                pass
            finally:
                for p in [tmp_in_path, tmp_out_path]:
                    try: os.remove(p)
                    except: pass
    except Exception as exc:
        print(f"[scene360] Image compression failed: {exc}, sending original", flush=True)
    return b64_data, mime_type


def _analyze_via_oai_chat_direct(ref_b64: str, mime_type: str, system_prompt: str, chat_base: str, chat_model: str, chat_key: str) -> dict:
    """Analyze image via an OpenAI-compatible chat endpoint directly from Python."""
    import urllib.request as _ureq

    ref_b64, mime_type = _compress_image_b64(ref_b64, mime_type)
    data_uri = f"data:{mime_type};base64,{ref_b64}"
    messages = [
        {"role": "user", "content": [
            {"type": "text", "text": system_prompt},
            {"type": "image_url", "image_url": {"url": data_uri}},
        ]},
    ]
    payload = {
        "model": chat_model,
        "messages": messages,
        "max_tokens": 8000,
    }

    url = chat_base if "/chat/completions" in chat_base else f"{chat_base.rstrip('/')}/v1/chat/completions"
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    opener = _ureq.build_opener(_ureq.ProxyHandler({}))
    req = _ureq.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {chat_key}",
        },
    )
    with opener.open(req, timeout=280) as resp:
        result = json.loads(resp.read().decode("utf-8"))

    text = _extract_oai_text_direct(result)
    if not text:
        raise RuntimeError("AI did not return analysis content")
    if _looks_like_missing_image_reply(text):
        raise RuntimeError("当前文本模型未真正接收到图片，暂不支持场景图片分析。请换成支持视觉输入的模型。")
    return _parse_ai_json(text)


def analyze_scene(ref_b64: str, mime_type: str, gemini_request_fn: Any) -> dict:
    """Analyze a reference image. Tries OAI chat first, falls back to Gemini."""
    from server import STATE, GEMINI_BASE, get_ai_chat_key

    # Use ycapis for analysis via Next.js proxy
    chat_base = (STATE.get("ai_chat_base") or "").strip()
    chat_model = (STATE.get("ai_chat_model") or "").strip()
    api_key = get_ai_chat_key()

    if chat_base and chat_model and api_key:
        try:
            return _analyze_via_oai_chat_direct(ref_b64, mime_type, SCENE_360_ANALYSIS_PROMPT, chat_base, chat_model, api_key)
        except Exception as e:
            print(f"[scene360] OAI chat analysis failed: {e}, falling back to Gemini", flush=True)

    # Fallback: Gemini native (analysis always uses gemini-2.5-pro on official API)
    model = "gemini-2.5-pro"
    base = GEMINI_BASE

    # Compress image for Gemini too (avoid oversized payloads)
    compressed_b64, compressed_mime = _compress_image_b64(ref_b64, mime_type, max_bytes=3_000_000)
    parts = [
        {"inlineData": {"mimeType": compressed_mime, "data": compressed_b64}},
        {"text": SCENE_360_ANALYSIS_PROMPT},
    ]

    payload = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"responseMimeType": "text/plain"},
    }

    url = f"{base}/models/{model}:generateContent"
    try:
        print(f"[scene360] Gemini request: model={model}, base={base}, payload_keys={list(payload.keys())}", flush=True)
        result = gemini_request_fn(url, payload, timeout=120)
        print(f"[scene360] Gemini raw result keys: {list(result.keys()) if isinstance(result, dict) else type(result)}", flush=True)
    except Exception as exc:
        print(f"[scene360] Gemini request failed: {exc}", flush=True)
        raise RuntimeError(f"Gemini 分析失败: {exc}")

    # Extract text from response
    text = ""
    candidates = result.get("candidates", [])
    print(f"[scene360] Gemini candidates count: {len(candidates)}", flush=True)
    for candidate in candidates:
        for part in candidate.get("content", {}).get("parts", []):
            if "text" in part:
                text += part["text"]

    if not text:
        print(f"[scene360] Gemini full result: {json.dumps(result, ensure_ascii=False)[:500]}", flush=True)
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
        if i > 0:
            time.sleep(5)

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
