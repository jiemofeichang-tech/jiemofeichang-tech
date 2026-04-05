"""
Grid Generator Module
Generates 9-grid (3x3) or 25-grid (5x5) images from a reference image,
maintaining character/scene consistency across all sub-images.
"""

import base64
import json
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Expression Presets
# ---------------------------------------------------------------------------

GRID_9_EXPRESSIONS: list[dict[str, str]] = [
    {
        "key": "happy",
        "label": "开心",
        "prompt_suffix": (
            "genuine happy expression, bright eyes with visible highlights, "
            "natural joyful smile showing slight teeth, raised cheeks, relaxed eyebrows"
        ),
    },
    {
        "key": "sad",
        "label": "难过",
        "prompt_suffix": (
            "sad expression, downcast eyes with lowered gaze, slightly trembling lower lip, "
            "furrowed inner eyebrows, drooping mouth corners"
        ),
    },
    {
        "key": "angry",
        "label": "生气",
        "prompt_suffix": (
            "angry expression, intensely furrowed brows, narrowed eyes with sharp glare, "
            "clenched jaw, flared nostrils, tightened lips"
        ),
    },
    {
        "key": "surprised",
        "label": "惊讶",
        "prompt_suffix": (
            "surprised expression, wide-open eyes with raised eyebrows, slightly open mouth, "
            "pupils dilated, head tilted slightly back"
        ),
    },
    {
        "key": "thinking",
        "label": "思考",
        "prompt_suffix": (
            "thinking expression, one eyebrow slightly raised, eyes looking up and to the side, "
            "lips slightly pursed, chin tilted, contemplative gaze"
        ),
    },
    {
        "key": "shy",
        "label": "害羞",
        "prompt_suffix": (
            "shy expression, slight blush on cheeks, eyes averted downward, chin tucked, "
            "subtle nervous smile, shoulders slightly raised"
        ),
    },
    {
        "key": "confident",
        "label": "自信",
        "prompt_suffix": (
            "confident expression, steady direct gaze, slight knowing smile, "
            "chin slightly raised, relaxed but assured posture"
        ),
    },
    {
        "key": "nervous",
        "label": "紧张",
        "prompt_suffix": (
            "nervous expression, wide eyes darting to the side, biting lower lip, "
            "tense shoulders, slightly furrowed brows, uneasy smile"
        ),
    },
    {
        "key": "neutral",
        "label": "平静",
        "prompt_suffix": (
            "neutral calm expression, relaxed face muscles, steady gaze, "
            "lips gently closed, serene and composed demeanor"
        ),
    },
]

GRID_25_EXPRESSIONS: list[dict[str, str]] = GRID_9_EXPRESSIONS + [
    {
        "key": "laughing",
        "label": "大笑",
        "prompt_suffix": (
            "laughing expression, mouth wide open, eyes squinting with joy, "
            "visible teeth, head tilted back slightly, genuine hearty laughter"
        ),
    },
    {
        "key": "crying",
        "label": "哭泣",
        "prompt_suffix": (
            "crying expression, tears streaming down cheeks, red watery eyes, "
            "trembling lips, scrunched eyebrows, visible emotional distress"
        ),
    },
    {
        "key": "scared",
        "label": "恐惧",
        "prompt_suffix": (
            "scared fearful expression, wide terrified eyes, raised eyebrows, "
            "mouth slightly open, pale complexion, shrinking posture"
        ),
    },
    {
        "key": "disgusted",
        "label": "厌恶",
        "prompt_suffix": (
            "disgusted expression, wrinkled nose, upper lip raised, "
            "eyes narrowed, head turned slightly away, visible repulsion"
        ),
    },
    {
        "key": "sleepy",
        "label": "困倦",
        "prompt_suffix": (
            "sleepy drowsy expression, half-closed heavy eyelids, "
            "yawning or about to yawn, relaxed face muscles, droopy eyes"
        ),
    },
    {
        "key": "excited",
        "label": "兴奋",
        "prompt_suffix": (
            "excited expression, sparkling wide eyes, broad enthusiastic grin, "
            "raised eyebrows, energetic and vibrant demeanor"
        ),
    },
    {
        "key": "confused",
        "label": "困惑",
        "prompt_suffix": (
            "confused puzzled expression, tilted head, furrowed brows, "
            "one eyebrow raised higher, lips slightly parted, questioning gaze"
        ),
    },
    {
        "key": "determined",
        "label": "坚定",
        "prompt_suffix": (
            "determined resolute expression, firm set jaw, focused intense eyes, "
            "slightly furrowed brows, lips pressed together, unwavering gaze"
        ),
    },
    {
        "key": "embarrassed",
        "label": "尴尬",
        "prompt_suffix": (
            "embarrassed expression, deep blush on cheeks and ears, "
            "awkward forced smile, eyes looking away, hand near face"
        ),
    },
    {
        "key": "mischievous",
        "label": "调皮",
        "prompt_suffix": (
            "mischievous playful expression, sly smirk, one eyebrow raised, "
            "twinkling eyes, slightly tilted head, impish grin"
        ),
    },
    {
        "key": "proud",
        "label": "骄傲",
        "prompt_suffix": (
            "proud expression, chin raised high, chest out, "
            "satisfied smile, eyes gleaming with accomplishment"
        ),
    },
    {
        "key": "worried",
        "label": "担忧",
        "prompt_suffix": (
            "worried anxious expression, furrowed brows drawn together, "
            "biting lip, eyes showing concern, tense forehead"
        ),
    },
    {
        "key": "bored",
        "label": "无聊",
        "prompt_suffix": (
            "bored expression, half-lidded eyes, resting chin on hand, "
            "flat disinterested gaze, slightly pouting lips"
        ),
    },
    {
        "key": "lovestruck",
        "label": "心动",
        "prompt_suffix": (
            "lovestruck expression, dreamy eyes with heart-shaped pupils, "
            "gentle warm smile, slight blush, adoring soft gaze"
        ),
    },
    {
        "key": "serious",
        "label": "严肃",
        "prompt_suffix": (
            "serious solemn expression, firm straight lips, intense focused eyes, "
            "level brows, no smile, commanding presence"
        ),
    },
    {
        "key": "shocked",
        "label": "震惊",
        "prompt_suffix": (
            "deeply shocked expression, jaw dropped wide open, eyes bulging, "
            "eyebrows raised to maximum, frozen in disbelief"
        ),
    },
]

EXPRESSION_PRESETS: dict[int, list[dict[str, str]]] = {
    9: GRID_9_EXPRESSIONS,
    25: GRID_25_EXPRESSIONS,
}

# ---------------------------------------------------------------------------
# Expression + Body Language Presets
# ---------------------------------------------------------------------------

BODY_9_EXPRESSIONS: list[dict[str, str]] = [
    {
        "key": "wave_hello",
        "label": "挥手打招呼",
        "prompt_suffix": (
            "full body, standing upright, one hand raised waving hello with a friendly smile, "
            "relaxed posture, weight on one leg, warm welcoming gesture"
        ),
    },
    {
        "key": "arms_crossed",
        "label": "双臂交叉",
        "prompt_suffix": (
            "full body, standing with arms crossed over chest, confident stance, "
            "slight smirk, weight evenly distributed, assertive body language"
        ),
    },
    {
        "key": "thinking_pose",
        "label": "思考姿态",
        "prompt_suffix": (
            "full body, one hand on chin in thinking pose, head slightly tilted, "
            "eyes looking upward, contemplative expression, weight shifted to one side"
        ),
    },
    {
        "key": "jumping_joy",
        "label": "开心跳跃",
        "prompt_suffix": (
            "full body, jumping in the air with both arms raised high, "
            "joyful expression, legs bent, dynamic energetic pose, pure happiness"
        ),
    },
    {
        "key": "sitting_relaxed",
        "label": "放松坐姿",
        "prompt_suffix": (
            "full body, sitting on a chair in relaxed pose, one leg crossed over the other, "
            "leaning back slightly, calm content expression, hands resting naturally"
        ),
    },
    {
        "key": "pointing_forward",
        "label": "指向前方",
        "prompt_suffix": (
            "full body, standing with one arm extended pointing forward, "
            "determined confident expression, strong stance, the other hand on hip"
        ),
    },
    {
        "key": "shy_hiding",
        "label": "害羞躲藏",
        "prompt_suffix": (
            "full body, shy posture with shoulders hunched, hands clasped together near chest, "
            "head slightly lowered, blushing cheeks, one foot turned inward"
        ),
    },
    {
        "key": "angry_stomp",
        "label": "生气跺脚",
        "prompt_suffix": (
            "full body, angry stomping pose, fists clenched at sides, one foot raised, "
            "furious expression, leaning forward aggressively, tense body"
        ),
    },
    {
        "key": "victory_pose",
        "label": "胜利姿势",
        "prompt_suffix": (
            "full body, victory pose with one fist pumped in the air, "
            "triumphant expression, wide stance, the other hand on hip, proud posture"
        ),
    },
]

BODY_25_EXPRESSIONS: list[dict[str, str]] = BODY_9_EXPRESSIONS + [
    {
        "key": "running",
        "label": "奔跑",
        "prompt_suffix": (
            "full body, dynamic running pose mid-stride, arms swinging, "
            "determined focused expression, one foot off the ground, forward lean"
        ),
    },
    {
        "key": "dancing",
        "label": "跳舞",
        "prompt_suffix": (
            "full body, graceful dancing pose with one arm extended upward, "
            "joyful expression, one leg extended, fluid elegant movement"
        ),
    },
    {
        "key": "bowing",
        "label": "鞠躬",
        "prompt_suffix": (
            "full body, formal bow with upper body bent forward at waist, "
            "respectful expression, hands at sides, dignified polite gesture"
        ),
    },
    {
        "key": "stretching",
        "label": "伸懒腰",
        "prompt_suffix": (
            "full body, stretching with both arms raised above head, "
            "eyes half-closed, yawning, arching back slightly, relaxed morning pose"
        ),
    },
    {
        "key": "facepalm",
        "label": "捂脸",
        "prompt_suffix": (
            "full body, one hand covering face in facepalm gesture, "
            "embarrassed or exasperated expression, slouching shoulders"
        ),
    },
    {
        "key": "peace_sign",
        "label": "比耶",
        "prompt_suffix": (
            "full body, making peace sign with one hand near face, "
            "cheerful winking expression, playful cute pose, slight head tilt"
        ),
    },
    {
        "key": "hugging_self",
        "label": "拥抱自己",
        "prompt_suffix": (
            "full body, arms wrapped around own shoulders in self-hug, "
            "warm content smile, cozy comfortable posture, eyes gently closed"
        ),
    },
    {
        "key": "fighting_stance",
        "label": "战斗姿态",
        "prompt_suffix": (
            "full body, martial arts fighting stance, fists raised guard position, "
            "intense focused eyes, one foot forward, ready to strike"
        ),
    },
    {
        "key": "crying_crouch",
        "label": "蹲下哭泣",
        "prompt_suffix": (
            "full body, crouching down with knees pulled to chest, "
            "hands covering face, crying, shoulders shaking, vulnerable sad pose"
        ),
    },
    {
        "key": "thumbs_up",
        "label": "竖大拇指",
        "prompt_suffix": (
            "full body, standing with one arm extended giving thumbs up, "
            "confident encouraging smile, relaxed friendly posture"
        ),
    },
    {
        "key": "leaning_wall",
        "label": "靠墙站立",
        "prompt_suffix": (
            "full body, leaning back against a wall with one foot propped up, "
            "cool relaxed expression, arms crossed, casual confident pose"
        ),
    },
    {
        "key": "scared_back",
        "label": "惊恐后退",
        "prompt_suffix": (
            "full body, stumbling backward in fear, arms raised defensively, "
            "wide terrified eyes, body leaning away, one foot stepping back"
        ),
    },
    {
        "key": "walking_casual",
        "label": "悠闲散步",
        "prompt_suffix": (
            "full body, casual walking pose mid-step, hands in pockets, "
            "relaxed content expression, natural stride, easygoing demeanor"
        ),
    },
    {
        "key": "praying",
        "label": "双手合十",
        "prompt_suffix": (
            "full body, hands pressed together in prayer or pleading gesture, "
            "hopeful earnest expression, slight forward lean, sincere pose"
        ),
    },
    {
        "key": "shrugging",
        "label": "耸肩",
        "prompt_suffix": (
            "full body, shoulders raised in exaggerated shrug, palms facing up, "
            "confused uncertain expression, head tilted slightly"
        ),
    },
    {
        "key": "blowing_kiss",
        "label": "飞吻",
        "prompt_suffix": (
            "full body, one hand near lips blowing a kiss, winking, "
            "playful flirtatious expression, slight hip tilt, charming pose"
        ),
    },
]

BODY_PRESETS: dict[int, list[dict[str, str]]] = {
    9: BODY_9_EXPRESSIONS,
    25: BODY_25_EXPRESSIONS,
}

# ---------------------------------------------------------------------------
# Scene Presets
# ---------------------------------------------------------------------------

SCENE_9_VARIANTS: list[dict[str, str]] = [
    {
        "key": "morning",
        "label": "清晨",
        "prompt_suffix": (
            "early morning golden hour, soft warm sunlight, long shadows, "
            "dew drops, misty atmosphere, dawn sky with pink and orange hues"
        ),
    },
    {
        "key": "noon",
        "label": "正午",
        "prompt_suffix": (
            "bright midday sunlight, harsh overhead lighting, vivid saturated colors, "
            "strong contrast, clear blue sky, sharp defined shadows"
        ),
    },
    {
        "key": "sunset",
        "label": "黄昏",
        "prompt_suffix": (
            "golden sunset, warm amber and orange tones, dramatic long shadows, "
            "silhouette elements, sky gradient from gold to purple"
        ),
    },
    {
        "key": "night",
        "label": "夜晚",
        "prompt_suffix": (
            "nighttime scene, moonlight illumination, deep blue and indigo tones, "
            "stars visible, ambient artificial lighting, cool color temperature"
        ),
    },
    {
        "key": "rain",
        "label": "雨天",
        "prompt_suffix": (
            "rainy weather, wet reflective surfaces, overcast grey sky, "
            "visible rain drops, puddles, moody atmospheric lighting"
        ),
    },
    {
        "key": "snow",
        "label": "雪景",
        "prompt_suffix": (
            "snowy winter scene, white snow covering, soft diffused light, "
            "cold blue tones, snowflakes falling, frosted surfaces"
        ),
    },
    {
        "key": "foggy",
        "label": "雾天",
        "prompt_suffix": (
            "thick fog, limited visibility, mysterious atmosphere, "
            "muted desaturated colors, soft edges, ethereal mood"
        ),
    },
    {
        "key": "spring",
        "label": "春天",
        "prompt_suffix": (
            "springtime, cherry blossoms, fresh green leaves, flower petals, "
            "soft pastel colors, gentle breeze, bright cheerful atmosphere"
        ),
    },
    {
        "key": "autumn",
        "label": "秋天",
        "prompt_suffix": (
            "autumn scene, orange and red foliage, falling leaves, "
            "warm earth tones, golden light filtering through trees"
        ),
    },
]

SCENE_25_VARIANTS: list[dict[str, str]] = SCENE_9_VARIANTS + [
    {
        "key": "storm",
        "label": "暴风雨",
        "prompt_suffix": (
            "dramatic thunderstorm, dark ominous clouds, lightning flash, "
            "heavy rain, wind-swept elements, intense dramatic lighting"
        ),
    },
    {
        "key": "starry",
        "label": "星空",
        "prompt_suffix": (
            "starry night sky, milky way visible, countless stars, "
            "deep space colors, cosmic atmosphere, gentle moonlight"
        ),
    },
    {
        "key": "underwater",
        "label": "水下",
        "prompt_suffix": (
            "underwater scene, light rays filtering through water surface, "
            "blue-green tones, bubbles, aquatic atmosphere, caustic light patterns"
        ),
    },
    {
        "key": "cyberpunk",
        "label": "赛博朋克",
        "prompt_suffix": (
            "cyberpunk neon city, vibrant neon lights in pink and cyan, "
            "dark urban environment, holographic signs, wet reflective streets"
        ),
    },
    {
        "key": "fantasy",
        "label": "奇幻",
        "prompt_suffix": (
            "fantasy magical setting, glowing particles, ethereal light, "
            "enchanted atmosphere, mystical fog, magical creatures silhouettes"
        ),
    },
    {
        "key": "postapoc",
        "label": "末日废墟",
        "prompt_suffix": (
            "post-apocalyptic ruins, overgrown vegetation reclaiming buildings, "
            "dusty atmosphere, broken structures, dramatic sky"
        ),
    },
    {
        "key": "indoor_cozy",
        "label": "温馨室内",
        "prompt_suffix": (
            "cozy indoor scene, warm lamplight, comfortable furniture, "
            "warm color palette, soft shadows, inviting homey atmosphere"
        ),
    },
    {
        "key": "indoor_modern",
        "label": "现代室内",
        "prompt_suffix": (
            "modern minimalist interior, clean lines, neutral tones, "
            "large windows with natural light, sleek furniture"
        ),
    },
    {
        "key": "forest",
        "label": "森林",
        "prompt_suffix": (
            "dense forest, dappled sunlight through canopy, moss-covered trees, "
            "lush green vegetation, forest floor details, natural atmosphere"
        ),
    },
    {
        "key": "desert",
        "label": "沙漠",
        "prompt_suffix": (
            "vast desert landscape, sand dunes, intense sunlight, "
            "heat haze, warm golden tones, clear sky, dramatic shadows"
        ),
    },
    {
        "key": "ocean",
        "label": "海边",
        "prompt_suffix": (
            "ocean coastline, waves crashing on shore, sea spray, "
            "horizon line, salty atmosphere, dynamic water reflections"
        ),
    },
    {
        "key": "mountain",
        "label": "山景",
        "prompt_suffix": (
            "mountain landscape, snow-capped peaks, dramatic elevation, "
            "alpine atmosphere, clouds below summit, majestic scale"
        ),
    },
    {
        "key": "cityscape",
        "label": "城市",
        "prompt_suffix": (
            "urban cityscape, skyscrapers, bustling street level, "
            "architectural details, city lights, metropolitan atmosphere"
        ),
    },
    {
        "key": "ancient",
        "label": "古风",
        "prompt_suffix": (
            "ancient Chinese architecture, traditional buildings, ink wash style, "
            "bamboo, stone bridges, lanterns, classical eastern atmosphere"
        ),
    },
    {
        "key": "space",
        "label": "太空",
        "prompt_suffix": (
            "outer space scene, planets visible, nebula colors, "
            "zero gravity environment, spacecraft elements, cosmic scale"
        ),
    },
    {
        "key": "carnival",
        "label": "节日",
        "prompt_suffix": (
            "festive carnival atmosphere, colorful decorations, fireworks, "
            "bright lights, confetti, joyful celebratory mood"
        ),
    },
]

SCENE_PRESETS: dict[int, list[dict[str, str]]] = {
    9: SCENE_9_VARIANTS,
    25: SCENE_25_VARIANTS,
}

# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------

GRID_STORAGE_DIR = Path("storage/grid-jobs")

# In-memory job registry
_jobs: dict[str, dict[str, Any]] = {}
_jobs_lock = threading.Lock()

MAX_IMAGE_CONCURRENCY = 3


# ---------------------------------------------------------------------------
# Grid Generator Job
# ---------------------------------------------------------------------------

def create_grid_job(
    reference_image_b64: str,
    mime_type: str,
    grid_size: int,
    generate_image_fn: Any,
    mode: str = "expression",
) -> str:
    """Create and start a grid generation job. Returns job_id.
    mode: "expression" for character expressions, "scene" for scene variants.
    """
    presets_map = {"expression": EXPRESSION_PRESETS, "scene": SCENE_PRESETS, "body": BODY_PRESETS}
    presets = presets_map.get(mode, EXPRESSION_PRESETS)
    if grid_size not in presets:
        raise ValueError(f"grid_size must be 9 or 25, got {grid_size}")

    job_id = str(uuid.uuid4())
    expressions = presets[grid_size]

    job_dir = GRID_STORAGE_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    results = [
        {
            "key": expr["key"],
            "label": expr["label"],
            "status": "pending",
            "image_url": None,
        }
        for expr in expressions
    ]

    job: dict[str, Any] = {
        "job_id": job_id,
        "status": "pending",
        "grid_size": grid_size,
        "completed": 0,
        "total": len(expressions),
        "results": results,
        "created_at": time.time(),
        "_ref_b64": reference_image_b64,
        "_ref_mime": mime_type,
        "_mode": mode,
    }

    with _jobs_lock:
        _jobs[job_id] = job

    thread = threading.Thread(
        target=_grid_worker,
        args=(job_id, reference_image_b64, mime_type, expressions, generate_image_fn),
        name=f"grid_gen_{job_id}",
        daemon=True,
    )
    thread.start()

    return job_id


def regenerate_single(
    job_id: str,
    expression_key: str,
    generate_image_fn: Any,
) -> bool:
    """Regenerate a single expression image in an existing job. Returns True if started."""
    with _jobs_lock:
        job = _jobs.get(job_id)
        if job is None:
            return False

        # Find the expression index and config
        target_index = None
        for i, r in enumerate(job["results"]):
            if r["key"] == expression_key:
                target_index = i
                break
        if target_index is None:
            return False

        # Get stored reference image from disk (first result's sibling)
        ref_b64 = job.get("_ref_b64")
        mime_type = job.get("_ref_mime", "image/png")
        if not ref_b64:
            return False

        # Mark as regenerating
        job["results"][target_index]["status"] = "generating"
        job["results"][target_index]["image_url"] = None
        job["status"] = "generating"
        # Recalculate completed count
        job["completed"] = sum(
            1 for r in job["results"] if r["status"] in ("done", "failed")
        )

    # Find the expression config
    job_mode = job.get("_mode", "expression")
    presets_map = {"expression": EXPRESSION_PRESETS, "scene": SCENE_PRESETS, "body": BODY_PRESETS}
    presets = presets_map.get(job_mode, EXPRESSION_PRESETS)
    expressions = presets.get(job["grid_size"], GRID_9_EXPRESSIONS)
    expr_config = next((e for e in expressions if e["key"] == expression_key), None)
    if not expr_config:
        return False

    def _regen_worker() -> None:
        job_dir = GRID_STORAGE_DIR / job_id
        prompt = _build_prompt(expr_config, job_mode)
        reference_images = [{"data": ref_b64, "mimeType": mime_type}]

        try:
            predictions = generate_image_fn(
                prompt, aspect_ratio="1:1", reference_images=reference_images
            )
            if not predictions:
                raise RuntimeError("API 未返回图片")

            pred = predictions[0]
            img_b64 = pred.get("bytesBase64Encoded", "")
            img_mime = pred.get("mimeType", "image/png")
            if not img_b64:
                raise RuntimeError("API 返回空图片数据")

            ext = ".png" if "png" in img_mime else ".jpg"
            filename = f"{expression_key}{ext}"
            filepath = job_dir / filename
            filepath.write_bytes(base64.b64decode(img_b64))
            image_url = f"/api/grid/assets/{job_id}/{filename}?t={int(time.time())}"

            with _jobs_lock:
                j = _jobs[job_id]
                j["results"][target_index]["status"] = "done"
                j["results"][target_index]["image_url"] = image_url
        except Exception as exc:
            with _jobs_lock:
                j = _jobs[job_id]
                j["results"][target_index]["status"] = "failed"
                j["results"][target_index]["error"] = str(exc)

        # Recalculate job status
        with _jobs_lock:
            j = _jobs[job_id]
            j["completed"] = sum(1 for r in j["results"] if r["status"] in ("done", "failed"))
            failed_count = sum(1 for r in j["results"] if r["status"] == "failed")
            if failed_count == j["total"]:
                j["status"] = "failed"
            elif failed_count > 0:
                j["status"] = "partial"
            elif j["completed"] == j["total"]:
                j["status"] = "done"

    thread = threading.Thread(target=_regen_worker, name=f"grid_regen_{job_id}_{expression_key}", daemon=True)
    thread.start()
    return True


def get_grid_job_status(job_id: str) -> dict[str, Any] | None:
    """Return current status of a grid job, or None if not found."""
    with _jobs_lock:
        job = _jobs.get(job_id)
    if job is None:
        return None
    # Return a snapshot (immutable copy)
    return {
        "job_id": job["job_id"],
        "status": job["status"],
        "grid_size": job["grid_size"],
        "completed": job["completed"],
        "total": job["total"],
        "results": [dict(r) for r in job["results"]],
    }


def _build_prompt(expr: dict[str, str], mode: str) -> str:
    """Build prompt based on mode (expression or scene)."""
    if mode == "scene":
        return (
            "Same scene and location as the reference image. "
            "Maintain EXACTLY the same architectural structures, environment layout, "
            "art style, color palette, and spatial composition. "
            f"Wide shot, {expr['prompt_suffix']}, "
            "sharp high-quality illustration, "
            "consistent scene structure with reference image"
        )
    return (
        "Same character as the reference image. "
        "Maintain EXACTLY the same face, hairstyle, hair color, eye color, skin tone, "
        "clothing, art style, and proportions. "
        f"Head and shoulders portrait, {expr['prompt_suffix']}, "
        "clean white background, sharp high-quality illustration, "
        "consistent face structure with reference image"
    )


def _grid_worker(
    job_id: str,
    ref_b64: str,
    mime_type: str,
    expressions: list[dict[str, str]],
    generate_image_fn: Any,
) -> None:
    """Background worker: generate all expression images concurrently."""
    with _jobs_lock:
        _jobs[job_id]["status"] = "generating"
        mode = _jobs[job_id].get("_mode", "expression")

    job_dir = GRID_STORAGE_DIR / job_id

    def _generate_single(index: int, expr: dict[str, str]) -> tuple[int, str | None, str | None]:
        """Generate a single expression image. Returns (index, image_url, error)."""
        prompt = _build_prompt(expr, mode)
        reference_images = [{"data": ref_b64, "mimeType": mime_type}]

        try:
            predictions = generate_image_fn(
                prompt, aspect_ratio="1:1", reference_images=reference_images
            )
            if not predictions:
                return index, None, "API 未返回图片"

            pred = predictions[0]
            img_b64 = pred.get("bytesBase64Encoded", "")
            img_mime = pred.get("mimeType", "image/png")
            if not img_b64:
                return index, None, "API 返回空图片数据"

            # Save to disk
            ext = ".png" if "png" in img_mime else ".jpg"
            filename = f"{expr['key']}{ext}"
            filepath = job_dir / filename
            filepath.write_bytes(base64.b64decode(img_b64))

            image_url = f"/api/grid/assets/{job_id}/{filename}"
            return index, image_url, None

        except Exception as exc:
            return index, None, str(exc)

    with ThreadPoolExecutor(max_workers=MAX_IMAGE_CONCURRENCY) as executor:
        futures = {}
        for i, expr in enumerate(expressions):
            future = executor.submit(_generate_single, i, expr)
            futures[future] = i

        for future in as_completed(futures):
            index, image_url, error = future.result()
            with _jobs_lock:
                job = _jobs[job_id]
                if image_url:
                    job["results"][index]["status"] = "done"
                    job["results"][index]["image_url"] = image_url
                else:
                    job["results"][index]["status"] = "failed"
                    job["results"][index]["error"] = error
                job["completed"] = sum(
                    1 for r in job["results"] if r["status"] in ("done", "failed")
                )

    # Final status
    with _jobs_lock:
        job = _jobs[job_id]
        failed_count = sum(1 for r in job["results"] if r["status"] == "failed")
        if failed_count == job["total"]:
            job["status"] = "failed"
        elif failed_count > 0:
            job["status"] = "partial"
        else:
            job["status"] = "done"
