"""
Storyboard Grid Generator Module
AI-driven cinematic storyboard analysis + sequential frame generation.
9-frame (3x3) three-act structure / 25-frame (5x5) five-act structure.
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
# Frame Structure Definitions
# ---------------------------------------------------------------------------

FRAME_STRUCTURE_9 = {
    "name": "三段式",
    "acts": [
        {"name": "Setup (铺垫)", "frames": ["P1", "P2", "P3"]},
        {"name": "Action (冲突)", "frames": ["P4", "P5", "P6"]},
        {"name": "Resolution (结局)", "frames": ["P7", "P8", "P9"]},
    ],
}

FRAME_STRUCTURE_25 = {
    "name": "五段式",
    "acts": [
        {"name": "Prologue (序幕)", "frames": ["P1", "P2", "P3", "P4", "P5"]},
        {"name": "Setup (铺垫)", "frames": ["P6", "P7", "P8", "P9", "P10"]},
        {"name": "Confrontation (对抗)", "frames": ["P11", "P12", "P13", "P14", "P15"]},
        {"name": "Climax (高潮)", "frames": ["P16", "P17", "P18", "P19", "P20"]},
        {"name": "Resolution (结局)", "frames": ["P21", "P22", "P23", "P24", "P25"]},
    ],
}

# ---------------------------------------------------------------------------
# Analysis System Prompt
# ---------------------------------------------------------------------------

STORYBOARD_ANALYSIS_PROMPT_9 = """你是一位电影摄影指导(DP)兼视觉叙事导演。请分析用户上传的参考图片，完成以下任务：

1. **风格锚定**：提取参考图的视觉DNA（渲染风格、光影、色调、材质）
2. **剧情推演**：根据图片内容，推断一段合理的叙事（约10-30秒的戏）
3. **9帧分镜规划**：使用三段式结构（Setup → Action → Resolution），为每帧设计镜头

三段式结构：
- P1-P3 Setup（铺垫）：建立场景、推进、聚焦细节
- P4-P6 Action（冲突/变化）：变化开始、高潮、反应
- P7-P9 Resolution（结局）：俯瞰、审视新状态、全景收尾

请严格按以下JSON格式输出：

```json
{
  "style_anchor": {
    "rendering_type": "精确的渲染/绘画风格描述",
    "color_style": "色调、饱和度、对比度",
    "lighting": "光影特征",
    "atmosphere": "整体氛围"
  },
  "story": {
    "subject": "主体描述",
    "narrative": "剧情概要（2-3句话）",
    "time_span": "时间跨度（如：10秒慢动作、1小时、一天等）",
    "emotion_curve": "情绪曲线（如：平静→紧张→爆发→释然）"
  },
  "frames": [
    {
      "id": "P1",
      "act": "Setup",
      "shot_type": "Wide Shot / Medium Shot / Close-up / Extreme Close-up / High Angle / Low Angle / Dutch Tilt 等",
      "description": "这一帧的中文画面描述",
      "image_prompt": "Complete English prompt for image generation. Must describe the exact visual content, camera angle, lighting, mood. 50-80 words. Must maintain the same subject and style as reference image. NO angle numbers, only visual descriptions."
    },
    {
      "id": "P2",
      "act": "Setup",
      "shot_type": "...",
      "description": "...",
      "image_prompt": "..."
    }
  ]
}
```

关键要求：
- image_prompt 是最重要的字段，必须是完整的英文画面描述
- 9帧之间必须呈现连续的时间流逝或状态变化
- 动作必须接戏（Match Action），空间关系统一
- 景别必须服务于叙事：大动作用远景，微变化用特写，压迫感用低角度
- 运镜逻辑：如先推入捕捉细节，再拉出展示全貌
- 主体同一性：观众必须一眼认出是同一个主体
- 仅输出JSON"""

STORYBOARD_ANALYSIS_PROMPT_25 = """你是一位电影摄影指导(DP)兼视觉叙事导演。请分析用户上传的参考图片，完成以下任务：

1. **风格锚定**：提取参考图的视觉DNA（渲染风格、光影、色调、材质）
2. **剧情推演**：根据图片内容，推断一段更完整的叙事
3. **25帧分镜规划**：使用五段式结构，为每帧设计镜头

五段式结构：
- P1-P5 Prologue（序幕）：前史、环境交代、气氛铺垫
- P6-P10 Setup（铺垫）：主体出场、状态建立、伏笔
- P11-P15 Confrontation（对抗）：冲突爆发、变化开始、张力升级
- P16-P20 Climax（高潮）：最大变化、最强情绪、转折点
- P21-P25 Resolution（结局）：后果、新状态、余韵、终章

请严格按以下JSON格式输出：

```json
{
  "style_anchor": {
    "rendering_type": "精确的渲染/绘画风格描述",
    "color_style": "色调、饱和度、对比度",
    "lighting": "光影特征",
    "atmosphere": "整体氛围"
  },
  "story": {
    "subject": "主体描述",
    "narrative": "剧情概要（3-5句话，因为25帧需要更丰富的叙事）",
    "time_span": "时间跨度",
    "emotion_curve": "情绪曲线（五段式，如：宁静→好奇→紧张→爆发→释然）"
  },
  "frames": [
    {
      "id": "P1",
      "act": "Prologue",
      "shot_type": "景别",
      "description": "中文画面描述",
      "image_prompt": "Complete English prompt, 50-80 words..."
    }
  ]
}
```

关键要求同上。25帧需要更细腻的节奏控制：
- 每个段落（5帧）应有自己的小高潮
- 段落之间有清晰的节奏转换
- 运镜要更丰富（推拉摇移、俯仰、手持、斯坦尼康等）
- 仅输出JSON"""

ANALYSIS_PROMPTS = {9: STORYBOARD_ANALYSIS_PROMPT_9, 25: STORYBOARD_ANALYSIS_PROMPT_25}

# ---------------------------------------------------------------------------
# Prompt Template (per frame)
# ---------------------------------------------------------------------------

FRAME_PROMPT_TEMPLATE = (
    "{image_prompt}. "
    "[Exact rendering style: {rendering_type}], "
    "[Color palette: {color_style}], "
    "[Lighting: {lighting}], "
    "[Atmosphere: {atmosphere}], "
    "[Aspect ratio: {aspect_ratio}], "
    "cinematic composition, film grain, depth of field, "
    "no text, no labels, no watermarks, no UI elements"
)

# ---------------------------------------------------------------------------
# Storage & Job Registry
# ---------------------------------------------------------------------------

GRID_STORAGE_DIR = Path("storage/grid-jobs")
_jobs: dict[str, dict[str, Any]] = {}
_jobs_lock = threading.Lock()


# ---------------------------------------------------------------------------
# JSON Parsing
# ---------------------------------------------------------------------------

def _parse_ai_json(text: str) -> dict:
    """Parse JSON from AI response. Tries raw → fenced → regex."""
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"```json\s*([\s\S]*?)```", text)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    raise ValueError(f"无法解析AI返回的JSON: {text[:200]}...")


# ---------------------------------------------------------------------------
# Step 1: Storyboard Analysis
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

    # Route through Next.js proxy (Node.js fetch bypasses Cloudflare/proxy issues)
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


def _analyze_via_oai_chat_direct(ref_b64: str, mime_type: str, system_prompt: str, chat_base: str, chat_model: str, chat_key: str) -> dict:
    """Analyze image via an OpenAI-compatible chat endpoint directly from Python."""
    import urllib.request as _ureq

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
        raise RuntimeError("当前文本模型未真正接收到图片，暂不支持图片分析。请换成支持视觉输入的模型。")
    return _parse_ai_json(text)


def analyze_storyboard(ref_b64: str, mime_type: str, grid_size: int, gemini_request_fn: Any) -> dict:
    """Analyze reference image and generate storyboard plan."""
    from server import STATE, GEMINI_BASE, get_ai_chat_key

    prompt = ANALYSIS_PROMPTS.get(grid_size, STORYBOARD_ANALYSIS_PROMPT_9)

    # Use configured chat model for analysis via Next.js proxy.
    chat_base = (STATE.get("ai_chat_base") or "").strip()
    chat_model = (STATE.get("ai_chat_model") or "").strip()
    api_key = get_ai_chat_key()

    if chat_base and chat_model and api_key:
        try:
            return _analyze_via_oai_chat_direct(ref_b64, mime_type, prompt, chat_base, chat_model, api_key)
        except Exception as e:
            print(f"[storyboard] OAI chat analysis failed: {e}, falling back to Gemini", flush=True)

    # Fallback: Gemini native (analysis always uses gemini-2.5-pro on official API)
    model = "gemini-2.5-pro"
    base = GEMINI_BASE

    parts = [
        {"inlineData": {"mimeType": mime_type, "data": ref_b64}},
        {"text": prompt},
    ]

    payload = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"responseMimeType": "text/plain"},
    }

    url = f"{base}/models/{model}:generateContent"
    result = gemini_request_fn(url, payload, timeout=120)

    text = ""
    for candidate in result.get("candidates", []):
        for part in candidate.get("content", {}).get("parts", []):
            if "text" in part:
                text += part["text"]

    if not text:
        raise RuntimeError("AI 未返回分析结果")

    return _parse_ai_json(text)


# ---------------------------------------------------------------------------
# Step 3: Frame Generation
# ---------------------------------------------------------------------------

def build_frame_prompt(analysis: dict, frame: dict, aspect_ratio: str) -> str:
    """Build image generation prompt for a single frame."""
    style = analysis.get("style_anchor", {})
    image_prompt = frame.get("image_prompt", frame.get("description", ""))

    return FRAME_PROMPT_TEMPLATE.format(
        image_prompt=image_prompt,
        rendering_type=style.get("rendering_type", "cinematic"),
        color_style=style.get("color_style", "natural"),
        lighting=style.get("lighting", "natural"),
        atmosphere=style.get("atmosphere", "cinematic"),
        aspect_ratio=aspect_ratio,
    )


def create_storyboard_job(
    ref_b64: str,
    mime_type: str,
    analysis: dict,
    grid_size: int,
    aspect_ratio: str,
    generate_image_fn: Any,
) -> str:
    """Create and start a storyboard generation job."""
    frames = analysis.get("frames", [])
    if not frames:
        raise ValueError("分析结果中没有 frames 数据")

    job_id = str(uuid.uuid4())
    job_dir = GRID_STORAGE_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    results = [
        {
            "key": f["id"],
            "label": f"{f['id']} {f.get('act', '')}",
            "shot_type": f.get("shot_type", ""),
            "description": f.get("description", ""),
            "status": "pending",
            "image_url": None,
        }
        for f in frames
    ]

    job: dict[str, Any] = {
        "job_id": job_id,
        "status": "pending",
        "grid_size": grid_size,
        "aspect_ratio": aspect_ratio,
        "completed": 0,
        "total": len(frames),
        "results": results,
        "created_at": time.time(),
        "_ref_b64": ref_b64,
        "_ref_mime": mime_type,
        "_analysis": analysis,
    }

    with _jobs_lock:
        _jobs[job_id] = job

    thread = threading.Thread(
        target=_storyboard_worker,
        args=(job_id, ref_b64, mime_type, analysis, frames, aspect_ratio, generate_image_fn),
        name=f"storyboard_{job_id}",
        daemon=True,
    )
    thread.start()
    return job_id


def get_storyboard_job_status(job_id: str) -> dict[str, Any] | None:
    """Return current status of a storyboard job."""
    with _jobs_lock:
        job = _jobs.get(job_id)
    if job is None:
        return None
    return {
        "job_id": job["job_id"],
        "status": job["status"],
        "grid_size": job["grid_size"],
        "completed": job["completed"],
        "total": job["total"],
        "results": [
            {k: v for k, v in r.items() if not k.startswith("_")}
            for r in job["results"]
        ],
    }


def regenerate_single_frame(
    job_id: str,
    frame_key: str,
    generate_image_fn: Any,
) -> bool:
    """Regenerate a single frame."""
    with _jobs_lock:
        job = _jobs.get(job_id)
        if job is None:
            return False

        target_index = None
        for i, r in enumerate(job["results"]):
            if r["key"] == frame_key:
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

    frames = analysis.get("frames", [])
    frame = next((f for f in frames if f["id"] == frame_key), None)
    if not frame:
        return False

    def _regen() -> None:
        job_dir = GRID_STORAGE_DIR / job_id
        prompt = build_frame_prompt(analysis, frame, aspect_ratio)
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

            ext = ".png" if "png" in pred.get("mimeType", "image/png") else ".jpg"
            filename = f"{frame_key}{ext}"
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

    threading.Thread(target=_regen, daemon=True).start()
    return True


def _storyboard_worker(
    job_id: str,
    ref_b64: str,
    mime_type: str,
    analysis: dict,
    frames: list[dict],
    aspect_ratio: str,
    generate_image_fn: Any,
) -> None:
    """Background worker: generate frames sequentially for continuity."""
    with _jobs_lock:
        _jobs[job_id]["status"] = "generating"

    job_dir = GRID_STORAGE_DIR / job_id
    reference_images = [{"data": ref_b64, "mimeType": mime_type}]

    for i, frame in enumerate(frames):
        # Rate limit: wait between requests to avoid API throttling (429)
        if i > 0:
            time.sleep(5)

        prompt = build_frame_prompt(analysis, frame, aspect_ratio)

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

            ext = ".png" if "png" in pred.get("mimeType", "image/png") else ".jpg"
            filename = f"{frame['id']}{ext}"
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

    with _jobs_lock:
        job = _jobs[job_id]
        failed = sum(1 for r in job["results"] if r["status"] == "failed")
        if failed == job["total"]:
            job["status"] = "failed"
        elif failed > 0:
            job["status"] = "partial"
        else:
            job["status"] = "done"
