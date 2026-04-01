# AI漫剧生成工作流 — 设计文档

> 版本: v1.1 | 日期: 2026-03-28
>
> **统一API接入**: 所有模块通过项目已有的 API Key 调用中联 MAAS 代理层
>
> **API Base**: `https://zlhub.xiaowaiyou.cn/zhonglian/api/v1/proxy/`
>
> **模型分工总览**:
> | 阶段 | 指定模型 | 用途 |
> |------|----------|------|
> | 剧本引擎 | **Claude Opus 4.6** | 剧本分析、结构化拆解、提示词生成 |
> | 角色工厂 | **Nano Banana 2 (Gemini)** | 角色三视图、场景六视图生成 |
> | 分镜生成 | **Nano Banana 2 (Gemini)** | 分镜图生成、一致性校验 |
> | 视频合成 + 音频合成 | **Seedance 2.0** | 图生视频、音画同步 |

---

## 一、项目背景与目标

### 1.1 市场背景

2025年被业界称为"AI漫剧元年"。抖音月度Top5000短剧中AI漫剧从1月的4部增长到11月的217部，累计播放量超7570亿次。2025年市场规模约1900-2000亿元，2026年预计突破3500亿元。

核心驱动力：
- 视频生成模型（Seedance 2.0、Kling 3.0、Hailuo）实现5-10秒稳定生成，可用率90%+
- 角色一致性技术突破（FLUX Kontext、参考图绑定），换脸率从20%降至5%以下
- 单分钟制作成本从真人短剧的5-10万元降至500-2500元

### 1.2 项目目标

基于现有Seedance Studio工作台，构建一条端到端的AI漫剧生产流水线：

| 目标 | 指标 |
|------|------|
| 单集制作时间 | ≤ 30分钟（1-3分钟成片） |
| 角色一致性 | 同角色跨场景相似度 ≥ 90% |
| 素材可用率 | 生图可用率 ≥ 80%，生视频可用率 ≥ 70% |
| 支持发布平台 | 抖音、快手、B站、红果短剧 |
| 输出规格 | 9:16竖屏, 1080P+, 带字幕+配音+口型同步 |

---

## 二、整体架构

```
┌──────────────────────────────────────────────────────────────────────┐
│                         AI漫剧生成工作流                              │
├──────────┬───────────┬───────────┬───────────┬───────────┬───────────┤
│ 剧本引擎  │  角色工厂   │  分镜生成   │  视频合成   │  音频合成   │  后期输出  │
│ Opus 4.6 │NanoBanana2│NanoBanana2│Seedance2.0│Seedance2.0│  FFmpeg   │
│  (分析)   │  (生图)    │  (生图)    │ (生视频)   │  (音频)    │  (合成)   │
├──────────┴───────────┴───────────┴───────────┴───────────┴───────────┤
│                    编排引擎 (Orchestrator) + Opus 4.6 (校验)          │
├──────────────────────────────────────────────────────────────────────┤
│               统一API Key → 中联MAAS代理层 → 各模型端点               │
├──────────────────────────────────────────────────────────────────────┤
│                         存储层 / 资产管理                             │
└──────────────────────────────────────────────────────────────────────┘
```

### 2.1 六大核心模块与模型对应

```
剧本创作 → 角色设定  → 分镜拆分   → 视频生成     → 音频合成     → 后期合成
 Opus4.6   NanoBanana2  NanoBanana2  Seedance2.0   Seedance2.0    FFmpeg
  (1)        (2)          (3)          (4)            (5)           (6)
  分析       三视图        分镜图        图生视频        音画同步       拼接
  提示词     六视图        一致性校验    首尾帧过渡      TTS+口型      字幕
  镜头语言   表情包        防跑偏        运镜控制        混音          调色
```

---

## 三、模块详细设计

### 3.1 模块一：剧本引擎（Script Engine）

**指定模型**：`Claude Opus 4.6` (claude-opus-4-6)
**调用方式**：通过项目API Key → 中联代理层 → Anthropic API

**职责**：对用户输入的故事大纲进行深度分析，输出包含人物、场景、脚本、视觉提示词、镜头语言在内的完整结构化剧本。

#### 输入
- 题材类型（仙侠/重生/逆袭/总裁/宫斗/搞笑）
- 故事大纲 / 关键情节点
- 集数规划（单集 / 连续剧）
- 风格参考（画风、色调、参考作品）
- 目标平台（抖音/快手/B站/红果）

#### Opus 4.6 剧本分析输出（完整结构化JSON）

Opus 4.6 需要一次性分析并输出以下**全部维度**:

```json
{
  "title": "斩仙台下",
  "genre": "仙侠",
  "style": "暗黑仙侠，赛博水墨风",
  "target_platform": "douyin",
  "color_palette": ["#1a1a2e", "#e94560", "#0f3460", "#ffd700"],

  "characters": [
    {
      "char_id": "char_001",
      "name": "叶无殇",
      "role": "主角",
      "age_range": "20-25",
      "personality": "隐忍、坚毅、内心善良但被仇恨驱动",
      "appearance": {
        "face": "剑眉星目，轮廓分明，左眼下有一道细长伤疤",
        "hair": "及腰黑发，高马尾，发尾渐变银白",
        "body": "身高185cm，体型修长但肌肉线条明显",
        "skin_tone": "冷白皮，微带病态苍白"
      },
      "costume": {
        "main_outfit": "破损的黑色仙袍，金色纹路，左肩护甲",
        "accessories": "腰间佩玄铁长剑，手腕缠绕红色灵丝",
        "color_scheme": "黑+金+暗红"
      },
      "three_view_prompts": {
        "front": "character design sheet, front view, full body, young man, sword eyebrows, star-like eyes, scar under left eye, waist-length black hair in high ponytail with silver-white gradient tips, torn black immortal robe with golden patterns, left shoulder armor, black iron sword at waist, red spirit thread on wrist, cold pale skin, 185cm tall, lean muscular build, dark fantasy xianxia style, white background, character reference sheet",
        "side": "character design sheet, side view, full body, same young man, profile view showing high ponytail flowing behind, broken black robe details visible, sword handle protruding from waist, left shoulder armor profile, lean muscular silhouette, dark fantasy xianxia style, white background, character reference sheet",
        "back": "character design sheet, back view, full body, same young man, waist-length black hair with silver-white tips flowing down, torn black robe showing golden pattern on back - a sealed magic circle, sword strapped across back, red spirit thread visible on right wrist, dark fantasy xianxia style, white background, character reference sheet"
      },
      "expression_prompts": {
        "neutral": "portrait, young man with scar under left eye, calm emotionless expression, sharp gaze, black hair, xianxia style",
        "anger": "portrait, same young man, furious expression, golden light erupting from eyes, veins visible on temples, teeth clenched, wind blowing hair, xianxia style",
        "sorrow": "portrait, same young man, sorrowful expression, tears in eyes but refusing to fall, lips pressed tight, rain on face, xianxia style",
        "smirk": "portrait, same young man, cold confident smirk, one corner of mouth raised, dangerous aura, eyes half-lidded, xianxia style",
        "power_awakening": "portrait, same young man, both eyes glowing intense gold, hair floating upward turning silver, ancient runes appearing on skin, divine pressure aura, xianxia style",
        "shock": "portrait, same young man, widened eyes, slightly parted lips, frozen posture, dramatic lighting, xianxia style"
      },
      "voice_profile": {
        "type": "低沉磁性男声",
        "tone": "冷静内敛，愤怒时嘶哑爆发",
        "reference_description": "类似《斗破苍穹》萧炎配音风格"
      }
    }
  ],

  "scenes": [
    {
      "scene_id": "scene_001",
      "name": "斩仙台",
      "description": "悬浮于万丈深渊之上的古老祭坛，由黑色陨铁铸成，表面刻满远古封印符文",
      "environment": {
        "time_of_day": "黄昏，乌云蔽日",
        "weather": "雷暴，紫色闪电",
        "atmosphere": "压抑、肃杀、神圣而残忍"
      },
      "six_view_prompts": {
        "front": "environment concept art, front view, ancient execution altar floating above endless abyss, black meteorite iron construction, glowing purple seal runes carved on surface, dark stormy sky with purple lightning, heavy rain, ominous atmosphere, dark fantasy xianxia style, cinematic wide shot",
        "back": "environment concept art, rear view, same floating altar seen from behind, massive chains connecting to distant mountain peaks, abyss below with swirling dark mist, lightning illuminating ancient stone pillars, dark fantasy xianxia style",
        "left": "environment concept art, left side view, floating altar profile, visible suspension mechanism - giant chains and gravity runes, spectator platforms carved into cliff face on left, filled with silhouetted immortal figures, dark fantasy xianxia style",
        "right": "environment concept art, right side view, floating altar from right angle, stairway of light descending from storm clouds, sword formation floating in mid-air pointing at altar center, dark fantasy xianxia style",
        "top": "environment concept art, bird's eye view, looking down at octagonal altar with concentric seal circles, eight chains extending to surrounding peaks, the abyss spiral visible below, purple lightning pattern from above, dark fantasy xianxia style",
        "detail": "environment concept art, close-up detail, altar surface texture, ancient runes glowing with purple-red light, blood stains on meteorite iron, cracks revealing molten energy beneath, rain droplets on surface, dark fantasy xianxia style, macro detail shot"
      },
      "lighting": {
        "key_light": "顶部雷电提供间歇性强光（冷紫色）",
        "fill_light": "符文自发光（暗红色）",
        "ambient": "阴暗，低对比度，仅符文和雷电提供照明",
        "mood": "压抑、不祥"
      },
      "color_grading": "冷色调为主(蓝紫)，高光处带暖色(金红)，暗部深沉"
    }
  ],

  "episodes": [
    {
      "episode_id": 1,
      "title": "万剑穿心",
      "duration_target": "60s",
      "emotion_curve": ["压抑", "蓄力", "爆发", "悬念"],
      "hook_opening": {
        "type": "冲突型",
        "description": "主角被锁链束缚跪在斩仙台上，万柄飞剑悬于头顶",
        "visual_impact": "极端俯拍+慢推，万剑如暴雨倾落"
      },
      "cliffhanger": {
        "description": "主角双眸突然金光大放，所有飞剑在距身体一寸处凝固",
        "suspense_question": "他体内封印的究竟是什么力量？"
      },
      "scenes": [
        {
          "scene_id": "s01",
          "scene_ref": "scene_001",
          "description": "主角被押上斩仙台，周围仙人冷眼旁观",
          "emotion": "压抑",
          "dialogues": [
            {
              "character": "char_001",
              "text": "三千年修行，竟换来这般下场？",
              "emotion": "愤怒隐忍",
              "duration_hint": "3s",
              "delivery_note": "声音低沉，微微颤抖，最后一个字咬牙"
            }
          ],
          "shots": [
            {
              "shot_type": "ELS",
              "subject": "斩仙台全景",
              "action": "镜头从云层穿透而下，逐渐显露斩仙台",
              "camera_movement": "vertical_descend_slow",
              "camera_speed": "2s匀速下降",
              "aperture": "f/2.8",
              "focal_length": "16mm广角",
              "depth_of_field": "全景深",
              "duration": "2s",
              "lighting_note": "雷电闪烁提供间歇照明"
            },
            {
              "shot_type": "ECU",
              "subject": "主角面部",
              "action": "缓缓抬头，眼中带泪光但眼神坚毅",
              "camera_movement": "slow_push_in",
              "camera_speed": "3s缓推",
              "aperture": "f/1.4",
              "focal_length": "85mm",
              "depth_of_field": "浅景深，背景虚化",
              "duration": "3s",
              "lighting_note": "侧面雷电光照亮半张脸，另一半在阴影中"
            }
          ],
          "bgm_instruction": {
            "mood": "tension_building",
            "instrument": "低沉大提琴+远处战鼓",
            "tempo": "60BPM，逐渐加速"
          },
          "sfx": ["雷鸣", "铁链碰撞", "风声呼啸", "远处人群低语"]
        }
      ]
    }
  ],

  "visual_style_guide": {
    "art_style": "暗黑仙侠，半写实半漫画，赛博水墨融合",
    "rendering": "高对比度，强调光影，边缘光明显",
    "line_work": "粗细变化明显的线条，速度线用于动作场景",
    "texture": "略带颗粒感，模拟胶片质感",
    "reference_works": ["斗破苍穹", "完美世界", "吞噬星空"]
  },

  "camera_language_guide": {
    "dialogue_scenes": {
      "default_pattern": "正反打 (CU/MS 交替)",
      "emphasis": "关键台词切ECU，停留2-3秒",
      "transition": "切换用跳切或溶解"
    },
    "action_scenes": {
      "default_pattern": "FS/MS快切 + ECU插入",
      "emphasis": "蓄力用慢推ECU → 爆发用快拉LS",
      "speed_lines": "动作帧添加径向模糊/速度线",
      "aperture": "动作场景用f/4-f/5.6保证清晰度"
    },
    "emotion_scenes": {
      "default_pattern": "从LS逐步推进到ECU",
      "emphasis": "在ECU上停留3-5秒，允许静默",
      "aperture": "情感场景用f/1.4-f/2.0，极浅景深突出人物",
      "lighting": "单侧光源，强调明暗对比"
    },
    "transition_library": {
      "scene_change": "黑场过渡 / 墨水晕染过渡",
      "time_skip": "溶解 + 日月交替",
      "flashback": "色彩饱和度降低 + 胶片划痕",
      "power_up": "白闪 + 径向模糊扩散"
    }
  }
}
```

#### Opus 4.6 分析任务清单

Opus 4.6 在剧本分析阶段需要完成以下**所有任务**:

```
1. 人物深度分析
   ├── 角色档案卡（外貌/性格/背景/动机/声音特征）
   ├── 人物三视图提示词（正面/侧面/背面，含完整服装+配饰+体型描述）
   ├── 表情包提示词（6种核心表情：平静/愤怒/悲伤/得意/觉醒/惊讶）
   ├── 人物关系图谱（角色间的关系和冲突线）
   └── 角色弧线（每集的情感/能力变化轨迹）

2. 场景深度分析
   ├── 场景设定卡（环境/天气/氛围/时间）
   ├── 场景六视图提示词（正面/背面/左侧/右侧/俯视/细节特写）
   ├── 光影方案（主光/补光/环境光/氛围色调）
   ├── 调色方案（色温/对比度/饱和度/LUT风格）
   └── 场景间过渡方案（场景A→B的视觉衔接方式）

3. 脚本结构分析
   ├── 逐场景对白（含情绪标记、语气提示、时长估算）
   ├── 旁白/内心独白标注
   ├── 情绪曲线图（压抑→蓄力→爆发→悬念）
   ├── 节奏校验（3秒钩子/10秒爽点/悬念结尾）
   └── 每集剧情摘要和下集预告钩子

4. 镜头语言设计
   ├── 景别选择（ECU/CU/MS/FS/LS/ELS + 理由）
   ├── 运镜方式（推/拉/摇/移/跟/升降/环绕/手持）
   ├── 运镜速度（慢速/匀速/加速/急停）
   ├── 光圈参数（f/1.4~f/16，控制景深和虚化）
   ├── 焦距选择（16mm广角~200mm长焦，控制空间压缩感）
   ├── 景深控制（浅景深突出人物 / 全景深展示环境）
   ├── 画面构图（三分法/对称/引导线/框架构图）
   └── 转场设计（硬切/溶解/黑场/特效过渡）

5. 音频规划
   ├── BGM情绪指令（节奏/乐器/BPM）
   ├── 音效列表（按时间轴标注）
   ├── 混音比例建议（对话段/动作段/情绪段）
   └── 声音空间设计（混响/距离感/空间定位）

6. 视觉风格统一
   ├── 全局画风定义（art style prompt前缀）
   ├── 色彩方案（主色/辅色/强调色 + hex值）
   ├── 渲染风格（线条/纹理/光影/特效）
   └── 参考作品风格锚点
```

#### 爆款剧本公式
```
情绪曲线模型（每集必须遵循）:

    │  爆发点          爆发点
    │   ╱╲              ╱╲
情感 │  ╱  ╲   蓄力    ╱  ╲   悬念钩子
强度 │ ╱    ╲  ╱╲    ╱    ╲    ↗
    │╱      ╲╱  ╲  ╱      ╲  ╱
    │ 压抑        ╲╱        ╲╱
    └────────────────────────────→ 时间

关键节奏要求:
- 前3秒: 必须出现视觉冲击或核心冲突（完播率+18%）
- 每10秒: 至少一个"爽点"或反转
- 结尾: 致命悬念，驱动下集播放
```

#### 指定模型
| 优先级 | 模型 | 用途 |
|--------|------|------|
| **唯一** | **Claude Opus 4.6** | 剧本分析全流程（人物/场景/脚本/提示词/镜头语言） |

> **为什么选 Opus 4.6**：
> - 超长上下文（1M tokens）可以一次性分析完整多集剧本
> - 结构化输出能力最强，JSON schema遵循度极高
> - 创意写作+技术提示词生成的平衡性最优
> - 镜头语言和摄影参数的专业知识储备充足

---

### 3.2 模块二：角色工厂（Character Factory）

**指定模型**：`Nano Banana 2` (Gemini NanoBanana2 / Nano Banana Pro)
**调用方式**：通过项目API Key → 中联代理层 → Gemini图片生成API

**职责**：基于Opus 4.6输出的角色描述和提示词，使用Nano Banana 2生成角色三视图、场景六视图，建立完整角色和场景资产库，确保跨场景视觉一致性。

#### 3.2.1 角色三视图生成

```
Opus 4.6 输出的三视图提示词
         ↓
   [Nano Banana 2 生图]
         ↓
   ┌─────────────────────────────────────────┐
   │  角色三视图 (Character Turnaround)       │
   │                                         │
   │  ┌────────┐ ┌────────┐ ┌────────┐      │
   │  │ 正面图 │ │ 侧面图 │ │ 背面图 │      │
   │  │ Front  │ │  Side  │ │  Back  │      │
   │  └────────┘ └────────┘ └────────┘      │
   │                                         │
   │  统一白底，统一比例，统一光照             │
   └─────────────────────────────────────────┘
```

**三视图生成规范**:
```
每个角色必须产出:
├── 正面全身图 (Front View)
│   ├── 白色背景，均匀打光
│   ├── 完整展示面部特征、服装正面细节、配饰
│   ├── T-pose或自然站立
│   └── 分辨率: 1024x1536 (2:3竖版)
│
├── 侧面全身图 (Side View)
│   ├── 90度纯侧面，同一白色背景
│   ├── 展示发型侧面轮廓、服装层次、武器佩戴位置
│   ├── 与正面图保持完全一致的服装/配饰/体型
│   └── 分辨率: 1024x1536
│
├── 背面全身图 (Back View)
│   ├── 180度背面，同一白色背景
│   ├── 展示发型背面、服装背部图案/纹理、武器背负方式
│   ├── 与正面图保持完全一致的比例和细节
│   └── 分辨率: 1024x1536
│
├── 表情合集图 (Expression Sheet)
│   ├── 6格表情：平静/愤怒/悲伤/得意/觉醒/惊讶
│   ├── 统一半身构图，统一光照
│   └── 分辨率: 2048x1536 (6格拼图)
│
└── 角色一致性锚点 (Identity Anchor)
    ├── 生成后提取角色特征向量作为后续生成的参考基准
    ├── 记录角色的核心视觉特征哈希
    └── 后续所有涉及该角色的生成都携带三视图作为参考
```

#### 3.2.2 场景六视图生成

```
Opus 4.6 输出的六视图提示词
         ↓
   [Nano Banana 2 生图]
         ↓
   ┌───────────────────────────────────────────────┐
   │  场景六视图 (Environment Turnaround)           │
   │                                               │
   │  ┌────────┐ ┌────────┐ ┌────────┐            │
   │  │ 正面图 │ │ 背面图 │ │ 左侧图 │            │
   │  │ Front  │ │  Back  │ │  Left  │            │
   │  └────────┘ └────────┘ └────────┘            │
   │  ┌────────┐ ┌────────┐ ┌────────┐            │
   │  │ 右侧图 │ │ 俯视图 │ │ 细节图 │            │
   │  │ Right  │ │  Top   │ │ Detail │            │
   │  └────────┘ └────────┘ └────────┘            │
   │                                               │
   │  统一光照方向，统一色调，统一时间设定           │
   └───────────────────────────────────────────────┘
```

**六视图生成规范**:
```
每个场景必须产出:
├── 正面全景 (Front View)
│   ├── 场景的"标准视角"，通常为人物进入场景时的第一视角
│   ├── 完整展示场景核心元素（建筑/地形/天空/光源）
│   └── 分辨率: 1920x1080 (16:9横版，用于场景参考)
│
├── 背面全景 (Back/Rear View)
│   ├── 从场景内部向入口方向看
│   ├── 展示场景纵深和退出路径
│   └── 与正面图保持完全一致的光照、天气、色调
│
├── 左侧全景 (Left View)
│   ├── 场景左侧90度视角
│   ├── 展示侧面元素（观众席/悬崖/建筑侧面）
│   └── 一致的环境氛围
│
├── 右侧全景 (Right View)
│   ├── 场景右侧90度视角
│   ├── 与左侧视角形成完整空间理解
│   └── 一致的环境氛围
│
├── 俯视全景 (Top/Bird's Eye View)
│   ├── 45-90度俯视角
│   ├── 展示场景的空间布局和平面关系
│   ├── 标注人物站位区域（可选）
│   └── 有助于理解场景的空间逻辑
│
└── 细节特写 (Detail Close-up)
    ├── 场景中最具特色的视觉元素特写
    ├── 材质、纹理、光影细节
    ├── 用于后续分镜中的特写镜头参考
    └── 分辨率: 1024x1024
```

#### 3.2.3 一致性保障机制

```
┌─────────────────────────────────────────────────────────────┐
│                    一致性保障体系                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  人物一致性 (Character Consistency)                          │
│  ├── Prompt锁定: 每次生成都携带完整的角色描述prompt前缀        │
│  ├── 参考图绑定: 三视图作为所有后续生成的reference image       │
│  ├── 特征校验: 生成后自动比对面部特征/服装/配饰是否一致        │
│  │   ├── 面部相似度阈值: ≥ 0.85 (CLIP-based)               │
│  │   ├── 服装颜色偏差: ΔE ≤ 5 (CIE Lab色差)                │
│  │   ├── 配饰完整性: 必须包含所有定义的配饰                   │
│  │   └── 体型比例: 与三视图偏差 ≤ 5%                         │
│  ├── 自动重试: 不一致时用更强的prompt约束重新生成（最多3次）    │
│  └── 人工审核: 3次仍不通过则标记人工干预                       │
│                                                             │
│  场景一致性 (Scene Consistency)                              │
│  ├── 光照锁定: 同一场景所有镜头保持相同光源方向和色温          │
│  ├── 色调统一: 使用Opus 4.6定义的color_grading参数            │
│  ├── 天气一致: 同一场景内天气状态不变（除剧情需要）            │
│  ├── 空间逻辑: 镜头切换时建筑/地形相对位置保持正确             │
│  ├── 时间连续: 光影变化符合剧情时间流逝                       │
│  └── 六视图校验: 每个分镜画面与六视图空间关系对齐              │
│                                                             │
│  风格一致性 (Style Consistency)                              │
│  ├── 全局style prompt前缀（画风/渲染/线条/纹理）             │
│  ├── 色彩方案锁定（hex色值约束）                              │
│  ├── 渲染品质参数统一（分辨率/采样步数/CFG）                  │
│  └── 跨集风格漂移检测和自动修正                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 3.2.4 角色资产完整清单

```
每个角色的完整资产:
├── 三视图原图 (3张, 1024x1536)
├── 表情合集 (1张, 2048x1536, 6格)
├── 角色描述卡 (JSON, 来自Opus 4.6)
├── 三视图prompt (3条, 来自Opus 4.6)
├── 表情prompt (6条, 来自Opus 4.6)
├── 角色一致性锚点 (特征向量/图片hash)
├── 声纹样本 (3-10秒参考音频, 可选)
└── LoRA模型 (可选, 专业模式)

每个场景的完整资产:
├── 六视图原图 (6张, 1920x1080)
├── 场景设定卡 (JSON, 来自Opus 4.6)
├── 六视图prompt (6条, 来自Opus 4.6)
├── 光影方案 (JSON, 来自Opus 4.6)
├── 调色方案 (JSON, 来自Opus 4.6)
└── 场景一致性锚点 (色调/光照/空间参考)
```

#### 指定模型
| 优先级 | 模型 | 用途 |
|--------|------|------|
| **唯一** | **Nano Banana 2** | 角色三视图 + 场景六视图 + 表情包生成 |

> **为什么选 Nano Banana 2**：
> - 角色一致性生成能力业界领先
> - 多视角生成prompt理解度高，三视图/六视图质量稳定
> - 通过现有API Key直接调用，无需额外接入
> - 风格化能力强，适合漫剧的二次元/半写实风格

---

### 3.3 模块三：分镜生成器（Storyboard Generator）

**指定模型**：`Nano Banana 2` (图片生成) + `Claude Opus 4.6` (分镜编排逻辑)
**调用方式**：通过项目API Key → 中联代理层

**职责**：基于Opus 4.6的分镜编排方案，使用Nano Banana 2逐帧生成分镜图片，同时进行人物一致性、场景一致性、剧情合理性的多维校验，防止视觉和叙事跑偏。

#### 3.3.1 分镜生成流水线

```
Opus 4.6 剧本分析结果 (含shots定义)
         ↓
   [Opus 4.6: 分镜prompt精炼]
   ├── 将每个shot的描述转化为精确的图片生成prompt
   ├── 自动注入角色外貌prompt前缀（确保人物一致）
   ├── 自动注入场景风格prompt前缀（确保场景一致）
   ├── 注入镜头参数（景别/光圈/焦距/景深）
   └── 注入画风统一前缀（确保风格一致）
         ↓
   [Nano Banana 2: 逐帧生图]
   ├── 携带角色三视图作为参考图
   ├── 携带场景六视图作为环境参考
   └── 输出每帧分镜图 (1080x1920, 9:16竖版)
         ↓
   [多维一致性校验] ← 详见3.3.3
   ├── 通过 → 标记为approved，进入视频生成队列
   └── 不通过 → 自动诊断问题 → 调整prompt → 重试（最多3次）
              └── 仍不通过 → 标记人工审核 + 问题报告
```

#### 3.3.2 分镜表完整结构

```json
{
  "episode_id": 1,
  "total_shots": 8,
  "estimated_duration": "58s",
  "shots": [
    {
      "shot_id": "ep01_shot_001",
      "scene_ref": "scene_001",
      "sequence_position": 1,

      "visual": {
        "shot_type": "ELS",
        "subject": "斩仙台全景",
        "action": "镜头从云层穿透而下，逐渐显露斩仙台",
        "composition": "中心构图，斩仙台居中，四周深渊环绕",
        "image_prompt": "[STYLE_PREFIX] extreme long shot, ancient floating execution altar above endless abyss, dark meteorite iron platform, glowing purple seal runes, massive chains connecting to distant peaks, dark stormy sky, purple lightning, heavy rain, bird's eye descending angle, cinematic wide shot, 9:16 vertical, [SCENE_PREFIX_scene_001]",
        "negative_prompt": "modern elements, bright colors, cartoon style, low quality, blurry"
      },

      "camera": {
        "movement": "vertical_descend_slow",
        "speed": "2秒匀速下降",
        "aperture": "f/2.8",
        "focal_length": "16mm",
        "depth_of_field": "deep_focus",
        "start_frame_composition": "俯视90度，云层中",
        "end_frame_composition": "俯视45度，斩仙台居中"
      },

      "timing": {
        "duration": "2s",
        "transition_in": "fade_from_black",
        "transition_out": "hard_cut"
      },

      "character_refs": [],
      "scene_refs": ["scene_001"],

      "dialogue": null,
      "sfx": ["雷鸣滚动", "风声呼啸", "铁链沉重摇晃"],
      "bgm_mood": "ominous_intro",

      "consistency_anchors": {
        "characters_in_frame": [],
        "scene_lighting_ref": "scene_001_front",
        "color_temperature": "cold_blue_purple",
        "weather_state": "thunderstorm"
      },

      "narrative_context": {
        "story_beat": "场景建立",
        "emotion_phase": "压抑",
        "plot_function": "交代环境，营造不祥氛围",
        "connects_to_previous": null,
        "connects_to_next": "ep01_shot_002 - 揭示主角处境"
      },

      "generation_status": "pending",
      "generated_image_path": null,
      "consistency_score": null,
      "retry_count": 0
    }
  ]
}
```

#### 3.3.3 多维一致性校验系统

```
┌─────────────────────────────────────────────────────────────────┐
│                分镜一致性校验 (由Opus 4.6驱动判断)                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ① 人物一致性校验 (Character Consistency Check)                  │
│  ├── 面部特征比对: 生成图 vs 三视图正面参考                       │
│  │   └── 相似度阈值: ≥ 0.85                                     │
│  ├── 服装校验: 颜色/款式/配饰是否与角色设定一致                    │
│  │   └── 色差阈值: ΔE ≤ 5                                      │
│  ├── 体型比例: 身高/体型是否与设定吻合                             │
│  ├── 伤疤/纹身/特殊标记: 是否遗漏或位置错误                       │
│  ├── 多角色场景: 每个出场角色都需要独立校验                        │
│  └── 跨镜头连续性: 相邻镜头中同一角色的外观无突变                  │
│                                                                 │
│  ② 场景一致性校验 (Scene Consistency Check)                      │
│  ├── 空间关系: 建筑/地形/道具位置与六视图空间逻辑一致              │
│  ├── 光照方向: 光源方向在同一场景内不跳变                          │
│  ├── 色调统一: 整体色温和调色与场景设定一致                        │
│  ├── 天气状态: 雨/雪/晴/阴与设定一致                              │
│  ├── 时间逻辑: 光影变化符合时间流逝（如日落渐暗）                  │
│  └── 细节连贯: 被破坏的物品在后续镜头中保持破损状态                │
│                                                                 │
│  ③ 剧情合理性校验 (Plot Coherence Check)                         │
│  ├── 叙事连贯: 每帧画面是否服务于当前故事节拍                      │
│  ├── 情绪匹配: 角色表情是否与对白情绪一致                          │
│  ├── 动作连续: 上一帧挥剑→下一帧不能突然静坐                      │
│  ├── 道具逻辑: 剑在手→下一帧不能凭空消失                          │
│  ├── 因果连贯: 打斗后应有破损/伤痕的视觉体现                      │
│  └── 节奏校验: 镜头时长和景别是否符合情绪曲线节奏要求              │
│                                                                 │
│  ④ 防跑偏机制 (Anti-Drift Guard)                                 │
│  ├── Prompt漂移检测: 监测生成图是否偏离原始设定                    │
│  │   ├── 画风突变 → 重新注入style_prefix                          │
│  │   ├── 角色变脸 → 增强参考图权重，减少文本自由度                 │
│  │   └── 场景穿帮 → 对照六视图修正空间关系                        │
│  ├── 累积偏移检测: 追踪多帧间的渐进式偏移                          │
│  │   └── 每5帧做一次全局一致性回溯检查                             │
│  ├── 关键帧锚定: 每集设定2-3个关键帧作为视觉锚点                  │
│  │   └── 后续帧必须与最近的关键帧保持视觉连贯                     │
│  └── 偏移修复策略                                                │
│      ├── 轻度偏移: 调整prompt权重，重新生成                        │
│      ├── 中度偏移: 使用img2img从上一帧修正                         │
│      └── 重度偏移: 回退到最近的合格帧，重新生成后续                │
│                                                                 │
│  ⑤ 镜头语言校验 (Cinematic Check)                                │
│  ├── 景别是否与情绪节拍匹配                                       │
│  ├── 运镜方向连续性（不突然跳轴）                                  │
│  ├── 构图是否遵循三分法/对称等设定                                 │
│  ├── 光圈/景深设定是否在画面中有体现                               │
│  └── 首帧是否在1.5秒内出现视觉钩子                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 3.3.4 分镜prompt自动组装规则

```
每帧的最终prompt由以下部分自动拼接:

[STYLE_PREFIX]          ← 全局画风前缀（来自visual_style_guide）
+ [CHARACTER_PREFIX]    ← 角色外貌关键词（来自角色描述卡）
+ [SCENE_PREFIX]        ← 场景环境关键词（来自场景设定卡）
+ [SHOT_BODY]           ← 当前镜头的具体内容/动作/情绪
+ [CAMERA_SUFFIX]       ← 景别+光圈+焦距+构图
+ [QUALITY_SUFFIX]      ← 质量/分辨率后缀

示例（自动组装后）:
"dark fantasy xianxia style, semi-realistic manga, high contrast,
 young man named Ye Wushang with sword eyebrows star-like eyes scar
 under left eye waist-length black hair silver-white gradient tips
 torn black immortal robe golden patterns left shoulder armor,
 floating altar above abyss dark stormy sky purple lightning,
 extreme close-up slowly raises head tears in eyes but determined gaze,
 f/1.4 85mm shallow depth of field dramatic side lighting,
 masterpiece, best quality, highly detailed, 9:16 vertical, 1080x1920"
```

#### 指定模型
| 用途 | 模型 | 职责 |
|------|------|------|
| 分镜编排 + prompt组装 + 一致性判断 | **Claude Opus 4.6** | 逻辑/文本层面 |
| 分镜图片生成 | **Nano Banana 2** | 视觉生成层面 |

> **为什么分镜阶段仍用 Nano Banana 2**：
> - 与角色工厂使用同一模型，确保画风从角色设计到分镜的无缝衔接
> - 支持reference image绑定，直接使用角色三视图作为一致性参考
> - 避免跨模型导致的风格不一致问题

---

### 3.4 模块四：视频合成引擎（Video Synthesis Engine）

**指定模型**：`Seedance 2.0` (doubao-seedance-2.0)
**调用方式**：通过项目API Key → 中联代理层 → Seedance视频生成API（已在server.py中集成）

**职责**：将分镜图片通过Seedance 2.0转化为视频片段，并进行全流程一致性校验和防跑偏控制。

#### 4.1 视频生成流水线

```
分镜图片 (来自Nano Banana 2, 已通过一致性校验)
         ↓
   [视频生成参数组装]
   ├── 注入运镜指令 (camera_movement → Seedance运镜预设)
   ├── 注入运动速度 (motion_speed: steady/slow/dynamic)
   ├── 注入音频同步指令 (如有对白)
   └── 设定时长 (3-10秒)
         ↓
   [Seedance 2.0: 图生视频]
   ├── 模式A: 单帧驱动 (默认)
   │   └── 分镜图 → 5s视频片段
   ├── 模式B: 首尾帧驱动 (场景过渡)
   │   └── 当前帧 + 下一帧 → 平滑过渡视频
   └── 模式C: 文本辅助 (补充运动指令)
       └── 分镜图 + 动作描述prompt → 视频
         ↓
   [视频质量校验] ← 详见4.3
   ├── 通过 → 进入音频合成队列
   └── 不通过 → 调整参数 → 重试（最多3次）
              └── 仍不通过 → 标记人工审核
```

#### 4.2 Seedance 2.0 参数映射

```
分镜参数 → Seedance API 参数映射:

镜头运动映射:
┌────────────────────┬───────────────────────────┐
│ 分镜camera_movement │ Seedance camera_preset    │
├────────────────────┼───────────────────────────┤
│ push_in_slow       │ "push_in" + speed:slow    │
│ pull_back          │ "pull_back" + speed:slow   │
│ pan_left/right     │ "pan" + direction          │
│ orbit              │ "orbit"                    │
│ vertical_descend   │ "auto" + motion_hint      │
│ handheld           │ "handheld"                 │
│ static             │ "auto" + speed:steady      │
│ dolly_zoom         │ "push_in" + speed:dynamic  │
└────────────────────┴───────────────────────────┘

运动速度映射:
┌────────────────┬──────────────────┐
│ 分镜速度描述    │ Seedance speed   │
├────────────────┼──────────────────┤
│ 缓慢/渐进      │ "steady"         │
│ 中速/匀速      │ "slow"           │
│ 快速/急推      │ "dynamic"        │
└────────────────┴──────────────────┘
```

#### 4.3 视频生成一致性校验

```
┌─────────────────────────────────────────────────────────────────┐
│              视频一致性校验 (Video Consistency Check)             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ① 人物一致性 (Character Consistency in Video)                   │
│  ├── 首帧校验: 视频首帧的人物与分镜图是否一致                      │
│  ├── 运动中保持: 运动过程中人物面部/服装是否产生畸变               │
│  │   ├── 面部畸变检测 (异形眼/多余手指/面部融化)                   │
│  │   ├── 服装颜色漂移检测                                        │
│  │   └── 发型/配饰消失检测                                       │
│  ├── 尾帧校验: 视频尾帧人物是否仍与角色设定一致                    │
│  └── 多角色场景: 每个角色独立校验，防止角色融合/互换               │
│                                                                 │
│  ② 场景一致性 (Scene Consistency in Video)                       │
│  ├── 背景稳定性: 静态背景元素是否产生不自然的变化                  │
│  ├── 光照连续性: 光源方向在视频中是否保持一致                      │
│  ├── 物理合理性: 运动轨迹是否符合物理规律（重力/惯性）            │
│  ├── 空间穿模: 人物是否穿过本应实心的物体                         │
│  └── 天气一致: 雨/雪/烟雾效果在视频中是否连贯                     │
│                                                                 │
│  ③ 剧情合理性 (Plot Coherence in Video)                          │
│  ├── 动作完成度: 分镜要求"挥剑"，视频是否完成了完整动作            │
│  ├── 情绪表达: 要求"愤怒"时人物是否展现了愤怒表情                  │
│  ├── 交互逻辑: 两人对话时是否有合理的互动动作                      │
│  ├── 视线方向: 对话角色的视线是否指向对方                          │
│  └── 动作承接: 视频B的开头是否与视频A的结尾动作连贯               │
│                                                                 │
│  ④ 防跑偏机制 (Video Anti-Drift)                                 │
│  ├── 运动幅度控制: 防止Seedance过度"脑补"导致画面大幅偏移          │
│  │   └── 策略: motion_speed设为steady，限制运动自由度              │
│  ├── 内容忠实度: 视频内容是否忠于分镜描述                          │
│  │   └── 策略: 比较视频中间帧与分镜图的语义相似度                  │
│  ├── 风格锁定: 视频渲染风格是否与整体画风一致                      │
│  │   └── 策略: 抽帧比对色调/对比度/渲染风格                       │
│  └── 时长控制: 生成时长与设定时长偏差≤0.5s                        │
│                                                                 │
│  ⑤ 跨片段连续性 (Cross-Clip Continuity)                          │
│  ├── 首尾帧衔接: 视频A尾帧 ↔ 视频B首帧 的视觉连贯度             │
│  ├── 动作连贯: 运动状态在片段间无跳变                              │
│  ├── 色调过渡: 相邻片段色温一致或平滑过渡                          │
│  └── 修复方案: 不连贯时使用首尾帧模式重新生成过渡片段             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 4.4 智能生成策略

```python
# Seedance 2.0 生成策略
def generate_video_for_shot(shot, prev_shot=None, next_shot=None):
    """
    根据镜头特征智能选择生成模式和参数
    """
    params = {
        "model": "doubao-seedance-2.0",
        "image": shot.generated_image_path,
        "duration": shot.duration,
    }

    # 场景过渡镜头 → 使用首尾帧模式
    if shot.transition_in == "cross_dissolve" and prev_shot:
        params["mode"] = "first_last_frame"
        params["first_frame"] = prev_shot.generated_image_path
        params["last_frame"] = shot.generated_image_path

    # 对话镜头 → 低运动幅度，保证人脸稳定
    elif shot.has_dialogue:
        params["motion_speed"] = "steady"
        params["camera_preset"] = "auto"
        params["prompt_hint"] = f"subtle {shot.action}, talking, minimal movement"

    # 动作镜头 → 较高运动幅度
    elif shot.is_action_scene:
        params["motion_speed"] = "dynamic"
        params["camera_preset"] = map_camera(shot.camera_movement)
        params["prompt_hint"] = shot.action

    # 情绪镜头 → 缓慢推进
    elif shot.emotion_phase in ["压抑", "蓄力"]:
        params["motion_speed"] = "slow"
        params["camera_preset"] = "push_in"

    # 默认
    else:
        params["motion_speed"] = "steady"
        params["camera_preset"] = map_camera(shot.camera_movement)

    return create_seedance_task(params)
```

#### 指定模型
| 用途 | 模型 | 说明 |
|------|------|------|
| **唯一视频生成模型** | **Seedance 2.0** | 图生视频、首尾帧过渡、音画同步 |

> **为什么选 Seedance 2.0**：
> - 项目已有完整的Seedance API集成（server.py + app.js）
> - 可用率90%+，业界最高
> - 支持多种运镜预设和音画同步
> - 通过现有API Key直接调用，零额外对接成本

---

### 3.5 模块五：音频合成引擎（Audio Synthesis Engine）

**指定模型**：`Seedance 2.0` (音频生成) + 本地TTS模型 (配音)
**调用方式**：通过项目API Key → 中联代理层

**职责**：生成配音、BGM、音效，实现音画同步和口型匹配，同时维护人物声音一致性和剧情连贯性。

#### 5.1 语音合成 (TTS)

```
Opus 4.6 剧本中的对白文本 + 情绪标记
         ↓
   [角色声纹匹配]
   ├── 角色A → 声纹样本A → TTS模型 → 角色A配音
   ├── 角色B → 声纹样本B → TTS模型 → 角色B配音
   └── 旁白 → 通用旁白声纹 → TTS模型 → 旁白配音
         ↓
   [情感后处理]
   ├── 语速调整: 根据delivery_note中的指令
   ├── 情感注入: 根据emotion标签强化情绪
   ├── 停顿控制: 戏剧性停顿、呼吸声
   └── 音量包络: 轻声→爆发的动态范围
         ↓
   [配音一致性校验]
   ├── 同角色跨集音色一致性
   ├── 情绪表达是否匹配画面
   └── 时长是否与分镜时长匹配
```

**TTS模型选择**:

| 模型 | 特点 | 部署方式 | 推荐场景 |
|------|------|----------|----------|
| **GPT-SoVITS** | 2秒音频即可克隆声音 | 本地 (4GB+ VRAM) | 角色定制配音（首选） |
| **ChatTTS** | 情感丰富，自然停顿 | 本地 (4GB+ VRAM) | 旁白/叙述 |
| **CosyVoice** | 中文质量最高 | API / 本地 | 中文角色 |
| **Fish Speech** | 多语言支持 | API / 本地 | 多语言需求 |
| **剪映AI配音** | 零门槛，即开即用 | 在线 | 快速原型 |

#### 5.2 Seedance 2.0 音频生成

```
Seedance 2.0 原生音频能力:
├── 音画同步: 视频生成时可同时生成匹配的音效
├── 环境音: 根据画面内容自动生成环境声
└── 动作音效: 与视频动作同步的音效

使用策略:
├── 优先使用Seedance 2.0原生音频（一致性最佳）
├── 对白部分使用TTS模型覆盖（音质更可控）
└── BGM单独生成/匹配（Seedance原生音频不含BGM）
```

#### 5.3 口型同步 (Lip Sync)

```
Seedance 2.0 生成的角色视频 + TTS配音音频
         ↓
   [口型同步模型]
         ↓
   口型匹配视频
         ↓
   [口型校验]
   ├── 音画同步延迟: ≤ 50ms
   ├── 口型自然度: 无明显畸变
   ├── 面部保持: 口型修改不影响面部其他特征
   └── 人物一致性: 口型同步后角色仍与三视图一致

推荐方案:
├── MuseTalk (腾讯): 画质最清晰，30+ FPS，牙齿/边缘处理最好
├── Wav2Lip: 同步精度最高，零样本，任何说话人
├── SadTalker: 单图驱动，头部自然运动（适合无视频仅有图片的场景）
└── LatentSync: 速度最快，适合批量处理
```

#### 5.4 BGM与音效

```
Opus 4.6 剧本中的bgm_instruction + sfx列表
         ↓
   [BGM匹配/生成]
   ├── Suno AI: 根据mood/instrument/tempo生成定制BGM
   ├── 版权音乐库: Epidemic Sound, Artlist
   └── 本地音效库: 按场景分类预置
         ↓
   [音效匹配]
   ├── 从sfx列表逐项匹配音效素材
   └── Seedance 2.0原生音效可作为补充
         ↓
   [自动混音]
   ├── 对话段: BGM降至 -20dB，人声为主
   ├── 动作段: 音效+BGM, -10dB
   ├── 情绪爆发: BGM渐强至 -5dB
   ├── 静默段: 环境音为主，-15dB
   └── 响度归一化: -14 LUFS (抖音/B站标准)

音频一致性校验:
├── 同场景BGM不中断（除非剧情需要）
├── 音效空间定位与画面匹配（左侧爆炸→左声道）
├── 环境音与场景设定一致（室内不出现风声/鸟鸣）
├── 音频过渡与视频转场同步
└── 跨集BGM主题一致（使用相同音乐主题的变奏）
```

---

### 3.6 模块六：后期合成引擎（Post-Production Engine）

**职责**：将视频片段、音频、字幕合成为成品。

#### 合成流水线

```
视频片段[] + 配音[] + BGM + 音效[] + 字幕[]
         ↓
   [时间轴对齐] → 按分镜表时间码排列
         ↓
   [转场处理] → 添加转场效果 (dissolve/cut/fade)
         ↓
   [字幕渲染] → 根据对话时间戳烧入字幕
         ↓
   [调色滤镜] → 统一全片色调
         ↓
   [音量均衡] → 响度归一化 (-14 LUFS)
         ↓
   [输出编码]
   ├── 抖音/快手: 1080x1920, H.264, 9:16, ≤60s
   ├── B站: 1080x1920, H.264, 9:16, ≤5min
   └── YouTube Shorts: 1080x1920, H.264, 9:16, ≤60s
```

#### 字幕规范
```
样式:
├── 字体: 思源黑体/汉仪菱心体（漫画感）
├── 大小: 屏幕宽度的 1/15
├── 位置: 画面下方 15% 处
├── 描边: 2px 黑色描边，增强可读性
├── 动画: 逐字出现（可选）
└── 对话标识: 不同角色不同颜色

自动化:
├── Whisper: 语音→字幕时间轴
└── LLM: 对白文本→SRT格式
```

#### 推荐工具
| 工具 | 定位 | 集成方式 |
|------|------|----------|
| **FFmpeg** | 核心编码引擎 | CLI 调用 |
| **剪映/CapCut** | 人工微调 | 手动（最终审核） |
| **MoviePy** | Python视频处理 | SDK集成 |
| **Remotion** | React视频渲染 | 前端集成（可选） |

---

## 四、交互式编排引擎设计（Interactive Orchestrator）

> **核心理念**：采用 **左侧对话框 + 右侧无限画布** 的交互架构（参考 OiiOii.ai 平台）。
> 用户通过左侧对话框与AI（艺术总监）交互，AI的分析和生成结果展示在右侧无限画布上。
> 画布上的每个内容块都可以点击修改——点击后左侧对话框自动加载该内容的编辑上下文。
> 每个阶段的结果累积在同一个无限画布中，形成完整的项目资产全景。
>
> **入口**：我的项目 → 新建项目 → 进入「左侧对话框 + 右侧无限画布」工作界面

### 4.1 整体界面架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│  顶栏: [项目名称]          [分享]  [...]     [余额: ■ -422] [BASE] [👤] │
├────┬────────────────────┬───────────────────────────────────────────────┤
│    │                    │                                               │
│ 侧 │   左侧: 对话面板    │          右侧: 无限画布                       │
│ 边 │   (Chat Panel)     │          (Infinite Canvas)                    │
│ 栏 │                    │                                               │
│    │  ┌──────────────┐  │   画布上展示所有阶段产出的资产:                │
│ 🏠 │  │  AI对话历史   │  │                                               │
│    │  │              │  │   ┌─────────┐  ┌─────────┐  ┌─────────┐     │
│ 🔮 │  │  🔥艺术总监: │  │   │ 剧本摘要 │  │ 角色列表 │  │ 分镜描述 │     │
│    │  │  分析结果...  │  │   │         │  │         │  │         │     │
│ ── │  │              │  │   └─────────┘  └─────────┘  └─────────┘     │
│    │  │  用户:       │  │                                               │
│ ⊕  │  │  修改需求... │  │   ┌─────────────────┐  ┌───────────────┐    │
│New │  │              │  │   │ 🔲 角色设计师     │  │ 🔲 角色设计师  │    │
│    │  │  🔥艺术总监: │  │   │  ┌───┐┌───┐┌───┐│  │  ┌───┐┌───┐ │    │
│    │  │  已更新...   │  │   │  │正面││侧面││背面││  │  │正面││侧面│ │    │
│    │  │              │  │   │  └───┘└───┘└───┘│  │  └───┘└───┘ │    │
│    │  └──────────────┘  │   │ [修改][重新生成] │  │ [修改][重生] │    │
│    │                    │   │ [+加到资产库]    │  │ [+加到资产库]│    │
│    │  ┌──────────────┐  │   └─────────────────┘  └───────────────┘    │
│    │  │ 输入框       │  │                                               │
│ 🗑 │  │ 拖拽/粘贴图片│  │   ┌─────────────────────────────────────┐    │
│    │  │              │  │   │  分镜描述                            │    │
│    │  │[+][📎脚本][😊]│ │   │  镜头1  镜头2  镜头3  ...  镜头12   │    │
│    │  └──────────────┘  │   └─────────────────────────────────────┘    │
│    │                    │                                               │
├────┴────────────────────┴───────────────────────────────────────────────┤
│  (画布支持无限滚动、缩放、拖拽平移)                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 对话框 ↔ 无限画布 联动机制

```
核心交互模式: 对话驱动 + 画布呈现 + 画布反编辑

┌──────────────┐                    ┌──────────────────────┐
│  左侧对话框   │ ──── 生成结果 ───▶ │   右侧无限画布        │
│  (Chat)      │                    │   (Canvas)           │
│              │ ◀── 点击[修改] ─── │                      │
│  显示编辑上下文│                    │   内容块被选中高亮    │
│  用户输入修改  │ ──── 更新结果 ───▶ │   内容块就地替换更新  │
└──────────────┘                    └──────────────────────┘

联动规则:
1. AI在对话框中回复 → 结果同步渲染到画布对应位置
2. 用户点击画布上的[修改]按钮 → 对话框底部自动出现该内容的编辑上下文
3. 用户在对话框中输入修改意见 → AI重新生成 → 画布上的内容块就地替换
4. 画布上的[重新生成]按钮 → 后台重新调用AI，结果替换画布上的旧内容
5. 画布上的[+加到资产库]按钮 → 标记为已确认的正式资产，用于后续阶段
6. 画布上的[下载]按钮 → 下载该资产到本地
```

### 4.3 各阶段在画布上的交互流程

#### 阶段1: 剧本分析 (对话驱动 → 画布展示)

```
对话框:                                    画布:
用户: "帮我做一个奥特曼的漫剧"              (空白画布)
       │
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  阶段1: 剧本引擎 (Opus 4.6)                                        │
│  ┌─────────┐    ┌──────────────┐    ┌──────────────┐               │
│  │ AI分析   │───▶│ 展示分析结果  │───▶│ 用户选择/修改 │               │
│  │ 剧本拆解  │    │ 多方案供选   │    │ 确认 or 重来  │               │
│  └─────────┘    └──────────────┘    └──────┬───────┘               │
│                                            │ ✅ 确认               │
└────────────────────────────────────────────┼────────────────────────┘
                                             │
       ┌─────────────────────────────────────┘
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  阶段2: 角色工厂 (Nano Banana 2)                                    │
│  ┌─────────┐    ┌──────────────┐    ┌──────────────┐               │
│  │ AI生成   │───▶│ 展示角色方案  │───▶│ 用户选择/修改 │               │
│  │ 三视图等  │    │ 多风格供选   │    │ 确认 or 重来  │               │
│  └─────────┘    └──────────────┘    └──────┬───────┘               │
│                                            │ ✅ 确认               │
└────────────────────────────────────────────┼────────────────────────┘
                                             │
       ┌─────────────────────────────────────┘
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  阶段3: 分镜生成 (Nano Banana 2)                                    │
│  ┌─────────┐    ┌──────────────┐    ┌──────────────┐               │
│  │ AI生成   │───▶│ 展示分镜预览  │───▶│ 用户逐帧审核  │               │
│  │ 分镜图   │    │ 时间轴预览   │    │ 替换/调整/确认│               │
│  └─────────┘    └──────────────┘    └──────┬───────┘               │
│                                            │ ✅ 确认               │
└────────────────────────────────────────────┼────────────────────────┘
                                             │
       ┌─────────────────────────────────────┘
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  阶段4: 视频+音频合成 (Seedance 2.0)                                │
│  ┌─────────┐    ┌──────────────┐    ┌──────────────┐               │
│  │ AI合成   │───▶│ 展示视频预览  │───▶│ 用户逐段审核  │               │
│  │ 视频+音频 │    │ 可播放预览   │    │ 替换/调整/确认│               │
│  └─────────┘    └──────────────┘    └──────┬───────┘               │
│                                            │ ✅ 确认               │
└────────────────────────────────────────────┼────────────────────────┘
                                             │
       ┌─────────────────────────────────────┘
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  阶段5: 后期输出                                                    │
│  ┌─────────┐    ┌──────────────┐    ┌──────────────┐               │
│  │ 自动合成  │───▶│ 展示成品预览  │───▶│ 用户最终审核  │               │
│  │ 拼接+字幕 │    │ 全片播放     │    │ 微调/导出/发布│               │
│  └─────────┘    └──────────────┘    └──────┬───────┘               │
│                                            │ ✅ 导出               │
└────────────────────────────────────────────┼────────────────────────┘
                                             │
                                             ▼
                                      最终成品视频
```

#### 阶段2: 角色设计 (画布触发修改)

```
对话框:                                    画布:
(AI自动进入角色设计阶段)                    ┌────────────────────────┐
                                           │ 🔲 角色设计师            │
🔥 艺术总监:                               │                        │
正在为角色生成三视图...                     │ 奥特曼·禅              │
                                           │ 一名融合了死神风格...   │
✅ 角色三视图生成完成                       │          [✏️编辑][📋]  │
                                           │                        │
用户点击画布上[修改]按钮                    │ ┌────┐┌────┐┌────┐┌────┐
         ↓                                 │ │正面││三视││效果││剪影│
对话框底部自动出现:                        │ │    ││ 图 ││ 图 ││ 图 │
┌──────────────────────┐                   │ └────┘└────┘└────┘└────┘
│ 奥特曼·禅       [×]  │                   │        [+加到资产库]    │
└──────────────────────┘                   │                        │
                                           │ [修改][重新生成][下载]  │
用户: "把铠甲改成蓝色,                     └────────────────────────┘
 增加翅膀"
         ↓
🔥 艺术总监:
已更新, 正在重新生成...    →               画布上图片就地替换更新
```

#### 阶段3: 分镜生成 (画布单帧修改)

```
对话框:                                    画布:
🔥 艺术总监:                               ┌────────────────────────┐
分镜图已全部生成完成                       │ 分镜描述                │
共12个镜头,请在画布上审核                  │                        │
                                           │ 镜头1    镜头2    镜头3│
用户点击画布上"镜头3"的[修改]              │ ┌────┐  ┌────┐  ┌────┐│
         ↓                                 │ │背景│  │瓦砾│  │门口││
对话框自动加载:                            │ │    │  │    │  │🟡  ││
┌──────────────────────┐                   │ └────┘  └────┘  └────┘│
│ 镜头3            [×]  │                   │                        │
│ 当前: [门口] 油画     │                   │ 镜头4 ... 镜头12       │
│ 景别: CU  运镜: 缓推  │                   └────────────────────────┘
│ 对白: "我会成为光.."  │
└──────────────────────┘                   (镜头3被选中高亮🟡)

用户: "镜头3改成远景,
 展示门口全貌, 增加光柱"
         ↓
🔥 艺术总监:
已调整为远景(LS),重新生成...  →            画布上镜头3图片就地替换
```

#### 阶段4: 视频+音频合成 (画布播放+修改)

```
对话框:                                    画布:
🔥 艺术总监:                               ┌────────────────────────┐
正在生成视频片段...                        │ 视频生成区              │
进度: 4/12 完成                            │                        │
                                           │ ┌──────┐ ┌──────┐    │
用户点击画布上视频2的[修改]                │ │[▶]   │ │[▶]   │    │
         ↓                                 │ │视频1  │ │视频2  │... │
对话框加载:                                │ │2.3s ✅│ │3.1s ⚠️│    │
┌──────────────────────┐                   │ └──────┘ └──────┘    │
│ 视频2           [×]  │                   │ [修改]    [修改]      │
│ ⚠️ 人物一致性: 0.78  │                   │ [重生]    [重生]      │
│ 问题: 发型轻微畸变    │                   └────────────────────────┘
└──────────────────────┘

用户: "降低运动幅度,
 保持面部稳定"
         ↓
🔥 艺术总监:
已调整motion_speed为steady   →             画布上视频2就地替换
人物一致性: 0.91 ✅

────────────────────
配音阶段同理:
用户点击画布上配音区[修改]                 画布上出现配音设置块
→ 对话框加载声纹选择                       角色声纹 [▶试听]
→ 用户: "换一个更低沉的声音"              BGM [▶试听]
→ AI重新生成配音                           [更换][下载]
```

#### 阶段5: 后期输出 (画布预览+导出)

```
对话框:                                    画布:
🔥 艺术总监:                               ┌────────────────────────┐
全部视频已合成完毕                         │ 成品输出                │
请在画布上预览                             │                        │
                                           │ ┌──────────────────┐  │
用户: "BGM音量太大了"                       │ │                  │  │
         ↓                                 │ │  [▶ 视频播放器]   │  │
🔥 艺术总监:                               │ │   9:16 竖屏       │  │
已从-10dB调整为-15dB                       │ │  00:00 / 00:58   │  │
正在重新混音...                            │ └──────────────────┘  │
✅ 混音已更新                              │                        │
                                           │ 字幕:[字体▼][大小▼]   │
用户: "导出抖音和B站版本"                   │ BGM: ████░░░ -15dB    │
         ↓                                 │ 配音: ████████ -3dB   │
🔥 艺术总监:                               │                        │
正在导出:                                  │ 导出: ☑抖音 ☑B站      │
● 抖音版 ✅                                │       ☐快手 ☐红果      │
● B站版  ⏳                                │                        │
                                           │ [📤 导出]              │
✅ 全部导出完成                            └────────────────────────┘
```

### 4.4 画布内容块类型

```
画布上的内容块(Canvas Block)按阶段和类型自动排列:

画布Y轴 ↓
│
│  ═══════ 剧本分析结果区 ═══════
│  [剧本摘要块]  [角色列表块]  [分镜描述块]
│
│  ═══════ 角色设计区 ═══════
│  [角色1三视图卡片]  [角色2三视图卡片]
│  [场景1六视图卡片]  [场景2六视图卡片]
│
│  ═══════ 分镜图区 ═══════
│  [镜头1] [镜头2] [镜头3] ... [镜头12]
│
│  ═══════ 视频生成区 ═══════
│  [视频1▶] [视频2▶] [视频3▶] ...
│  [配音设置块]
│
│  ═══════ 成品输出区 ═══════
│  [最终视频播放器 + 导出面板]
│
▼ (画布无限向下延伸)

每个内容块都带有:
├── [✏️修改] → 点击后对话框加载该内容的编辑上下文
├── [🔄重新生成] → 后台重新调用AI,结果就地替换
├── [⬇️下载] → 下载该资产到本地
└── [+加到资产库] → 标记为已确认的正式资产(部分块)

画布操作:
├── 鼠标滚轮: 上下滚动
├── Ctrl + 滚轮: 缩放
├── 空格 + 拖拽: 平移画布
├── 点击内容块的[修改]: 对话框加载该内容
└── 新内容生成时: 画布自动滚动到最新区域
```

### 4.5 全局交互规则

```
1. 对话框 ↔ 画布 双向联动
   ├── 对话框产出 → 自动渲染到画布对应位置
   ├── 画布[修改]被点击 → 对话框加载编辑上下文
   ├── 对话框修改结果 → 画布内容就地替换更新
   └── 所有操作按钮([修改]/[重生]/[删除])通过对话框执行

2. 画布内容生命周期
   ├── 🔄 生成中: loading状态 + 进度提示
   ├── ✅ 已生成: 可预览, 带[修改][重新生成][下载]按钮
   ├── 📌 已加到资产库: 正式资产, 用于后续阶段输入
   └── ⚠️ 需审核: 一致性检查未通过, 高亮提示

3. 渐进式画布 (不分页, 流式累积)
   ├── 每阶段的产出按顺序从上到下排列在同一画布
   ├── 新内容生成时画布自动滚动到最新区域
   ├── 可随时滚动回查看/修改之前阶段的内容
   └── 修改上游内容 → 受影响的下游标记为"需更新"

4. 阶段间无硬性门控
   ├── 不使用"确认→锁定→下一步"的硬性流程
   ├── 用户可随时通过对话指令跳到任意阶段
   ├── AI智能判断前置资产是否就绪, 不足时提醒补充
   └── 例: 用户说"开始生成视频" → AI检查角色/分镜是否就绪
       ├── 就绪 → 直接开始
       └── 未就绪 → "您还没有确认角色设计, 是否先完成？"

5. 项目持久化
   ├── 对话历史 + 画布状态 实时保存到 storage/projects/{id}/
   ├── 刷新/关闭后重新打开 → 恢复对话历史 + 画布全部内容
   ├── "我的项目"列表页显示所有项目缩略图和当前状态
   └── 项目可复制为模板

6. 快捷操作
   ├── 对话框底部快捷标签:
   │   [✨快速生图/视频] [✨剧情故事短片] [✨音乐概念短片]
   │   [✨漫画转视频] [✨衍生品设计] [✨场景设计] [✨角色设计]
   ├── 输入框支持: [+附件] [📎脚本] [🖼图片拖拽/粘贴] [😊表情]
   └── 图片可直接拖拽到输入框作为[角色]或[风格]参考

7. 侧边栏导航
   ├── 🏠 首页 → 回到"我的项目"列表
   ├── 🔮 当前项目 → 回到当前项目画布
   ├── ⊕ New → 新建项目
   └── 🗑 回收站
```

### 4.6 关键设计原则

1. **对话驱动, 画布呈现** — AI通过对话框交互, 所有产出在画布上可视化展示, 点击画布修改回到对话框
2. **所有内容可修改** — 画布上的每个内容块(文本/图片/视频)都可以通过[修改]按钮触发编辑
3. **就地替换, 不丢上下文** — 修改后的内容在画布上原位替换, 不会打乱整体布局
4. **生成即可见** — 每个资产生成完成立即展示在画布上, 不等批量完成
5. **断线不丢进度** — 全部状态持久化, 刷新/关闭后恢复对话+画布
6. **成本实时显示** — 顶栏显示余额, 每次生成操作消耗在对话框中提示

---

## 五、技术栈选型

### 5.1 推荐技术栈

```
前端:
├── Next.js + React (现有 oii前端)
├── Tailwind CSS (现有)
├── 状态管理: Zustand / Context
└── 视频预览: Video.js

后端:
├── Python (现有 server.py) → 升级为 FastAPI
├── 任务队列: Celery + Redis
├── 数据库: SQLite (单用户) / PostgreSQL (多用户)
└── 文件存储: 本地 storage/ 目录

AI模型集成 (统一通过项目API Key调用):
├── 剧本分析: Claude Opus 4.6 (claude-opus-4-6) ← 中联代理层
├── 图片生成: Nano Banana 2 (Gemini NanoBanana2) ← 中联代理层
├── 视频生成: Seedance 2.0 (doubao-seedance-2.0) ← 中联代理层 (已集成)
├── TTS配音: GPT-SoVITS本地 / ChatTTS本地 (补充)
├── 口型同步: MuseTalk本地 / Wav2Lip本地 (补充)
└── BGM生成: Suno AI / 本地音效库 (补充)

视频处理:
├── FFmpeg: 编码/转码/合成
├── MoviePy: Python层视频处理
└── Whisper: 语音识别→字幕
```

### 5.2 硬件要求

```
最低配置（入门级，主要使用云API）:
├── CPU: 8核
├── RAM: 16GB
├── GPU: 无（依赖云端模型）
└── 存储: 100GB SSD

推荐配置（本地TTS + 口型同步）:
├── CPU: 12核+
├── RAM: 32GB
├── GPU: RTX 4060 8GB+ VRAM
└── 存储: 500GB SSD

专业配置（全本地部署）:
├── CPU: 16核+
├── RAM: 64GB
├── GPU: RTX 4090 24GB VRAM
└── 存储: 2TB NVMe SSD
```

---

## 六、数据模型

### 6.1 核心实体

```
Project (项目)
├── id, title, genre, status, created_at
├── config: { target_platform, aspect_ratio, style }
│
├── Characters[] (角色)
│   ├── id, name, description_prompt
│   ├── reference_images[]
│   ├── voice_sample_path
│   └── lora_model_path (可选)
│
├── Episodes[] (集)
│   ├── id, episode_number, script_text
│   ├── status: draft | approved | generating | completed
│   │
│   ├── Shots[] (分镜)
│   │   ├── id, shot_number, shot_type, duration
│   │   ├── image_prompt, camera_movement
│   │   ├── character_refs[], dialogue
│   │   ├── generated_image_path
│   │   ├── generated_video_path
│   │   └── status: pending | generating | review | approved | failed
│   │
│   ├── AudioTracks[] (音轨)
│   │   ├── dialogue_audio_path
│   │   ├── bgm_path
│   │   ├── sfx_paths[]
│   │   └── mixed_audio_path
│   │
│   └── Output (成品)
│       ├── video_path
│       ├── subtitle_path (SRT)
│       ├── thumbnail_path
│       └── platform_versions: { douyin, bilibili, kuaishou }
│
└── CostTracker (成本)
    ├── total_cost
    └── breakdown: { llm, image_gen, video_gen, tts, lip_sync }
```

---

## 七、爆款方法论集成

### 7.1 内容策略引擎

工作流中内置爆款方法论规则，在剧本生成和分镜阶段自动校验：

```
爆款检查清单 (自动化):

□ 前3秒检查
  ├── 是否有视觉冲击？(动作/特效/冲突画面)
  ├── 是否有情绪冲击？(惊讶/愤怒/恐惧)
  └── 钩子类型是否明确？(冲突型/悬念型/反差型)

□ 节奏检查
  ├── 每10秒是否有"爽点"或反转？
  ├── 每分钟镜头数是否在5-8之间？
  └── 情绪曲线是否符合"压抑-爆发-悬念"？

□ 结尾检查
  ├── 是否有致命悬念钩子？
  ├── 悬念是否足以驱动下集点击？
  └── 是否在情绪最高点戛然而止？

□ 角色检查
  ├── 主角是否有明确的困境/目标？
  ├── 反派是否足够可恨/强大？
  └── 配角是否有记忆点？

□ 封面/首帧检查
  ├── 是否在1.5秒内出现钩子画面？
  ├── 封面是否有强烈的视觉冲突？
  └── 标题是否制造好奇心？
```

### 7.2 爆款题材数据库

```
S级（验证过的高回报题材）:
├── 仙侠/修仙: 收入占比最高，视觉冲击力强
├── 重生/穿越: 天然具备反差和爽感
├── 逆袭/打脸: 60%爆款来自成熟网文IP
└── 甜宠/霸总: 女性向流量稳定

A级:
├── 宫斗/宅斗: 情节复杂，留存率高
├── 悬疑/推理: 完播率高
└── 搞笑/沙雕: 传播性强

选题建议:
- 优先改编已有播放数据的网文IP（红果/番茄可授权60000+ IP）
- 原创题材需先做3集测试，看完播率和互动率
```

---

## 八、发布与分发

### 8.1 多平台适配

```
平台参数矩阵:

| 平台   | 比例  | 时长    | 分辨率    | 码率      | 特殊要求          |
|--------|-------|---------|-----------|-----------|-------------------|
| 抖音   | 9:16  | ≤5min   | 1080x1920 | 6-8 Mbps  | 首帧1.5s内出钩子  |
| 快手   | 9:16  | ≤5min   | 1080x1920 | 6-8 Mbps  | 支持系列合集      |
| B站    | 9:16  | ≤10min  | 1080x1920 | 8-10 Mbps | 可挂充电+投币     |
| 红果   | 9:16  | ≤5min   | 1080x1920 | 6-8 Mbps  | 付费点设计        |
| YouTube| 9:16  | ≤60s    | 1080x1920 | 8 Mbps    | Shorts竖屏        |
```

### 8.2 发布自动化（可选扩展）

```
n8n / Coze 自动化工作流:
├── 自动提取关键帧作为封面
├── 自动生成平台描述文案 + 话题标签
├── 定时发布（按平台最佳时段）
├── 数据回收（播放量/完播率/互动率）
└── A/B封面测试
```

---

## 九、实施路线图

### Phase 1: MVP（4周）
- [ ] 剧本引擎：集成LLM API，输出结构化剧本JSON
- [ ] 角色工厂：即梦API生成角色参考图，本地存储
- [ ] 分镜生成：LLM自动拆分分镜，输出分镜表
- [ ] 视频生成：集成Seedance API，单帧→视频
- [ ] 基础合成：FFmpeg拼接视频片段 + 字幕
- [ ] 前端：在现有Seedance Studio上增加工作流页面

### Phase 2: 质量提升（4周）
- [ ] 角色一致性：FLUX Kontext集成 / 参考图绑定
- [ ] TTS集成：GPT-SoVITS本地部署
- [ ] 口型同步：MuseTalk / Wav2Lip 集成
- [ ] 多模型路由：根据镜头类型智能选择视频模型
- [ ] 爆款检查器：自动校验剧本/分镜的爆款指标
- [ ] 成本追踪面板

### Phase 3: 规模化（4周）
- [ ] 批量生产：并行生成多集
- [ ] 首尾帧过渡：跨镜头平滑衔接
- [ ] BGM/音效自动匹配
- [ ] 多平台一键导出（抖音/快手/B站/红果）
- [ ] 项目模板（仙侠/甜宠/悬疑预设）
- [ ] 数据看板：发布后数据回收

### Phase 4: 高级功能（持续迭代）
- [ ] ComfyUI本地集成（工作室模式）
- [ ] LoRA训练管道
- [ ] A/B封面测试
- [ ] 多语言版本（配音+字幕）
- [ ] n8n自动发布工作流

---

## 十、风险与应对

| 风险 | 影响 | 应对策略 |
|------|------|----------|
| 角色跨场景不一致 | 观众出戏，专业度下降 | 三级一致性策略 + 人工审核关卡 |
| API成本失控 | 单集成本超预算 | 实时成本面板 + 预算上限 + 本地模型降级 |
| 视频生成质量不稳定 | 大量废弃素材 | 多模型路由 + 自动质检 + 重试机制 |
| 平台审核不通过 | 无法发布 | 内置敏感词/画面检查 |
| 市场ROI下降 | 投入产出不达预期 | 聚焦S级题材 + 快速测试 + 数据驱动选题 |
| 口型同步效果差 | 观感降低 | MuseTalk + Wav2Lip双模型择优 |

---

## 附录A：目录结构规划

```
E:\AI工作流\
├── docs/                          # 设计文档
│   └── AI漫剧生成工作流设计文档.md
├── server.py                      # 后端服务 (→ 升级为FastAPI)
├── app.js                         # 前端主应用
├── index.html                     # 入口页面
├── oii前端/                       # Next.js前端
├── storage/                       # 资产存储
│   ├── projects/                  # 项目目录
│   │   └── {project_id}/
│   │       ├── characters/        # 角色资产
│   │       ├── episodes/          # 分集数据
│   │       │   └── {ep_id}/
│   │       │       ├── shots/     # 分镜图片+视频
│   │       │       ├── audio/     # 配音+BGM+音效
│   │       │       └── output/    # 成品视频
│   │       └── project.json       # 项目元数据
│   └── manifest.json
├── models/                        # 本地模型 (可选)
│   ├── gpt-sovits/
│   ├── chattts/
│   └── musetalk/
└── workflows/                     # ComfyUI工作流 (可选)
    └── character_gen.json
```

---

## 附录B：API接口清单（规划）

```
工作流 API:

POST   /api/workflow/projects              # 创建项目
GET    /api/workflow/projects/:id           # 获取项目详情
PUT    /api/workflow/projects/:id           # 更新项目

POST   /api/workflow/script/generate        # 生成剧本
PUT    /api/workflow/script/:id/approve     # 确认剧本

POST   /api/workflow/characters/generate    # 生成角色
PUT    /api/workflow/characters/:id         # 更新角色

POST   /api/workflow/storyboard/generate    # 生成分镜
PUT    /api/workflow/storyboard/:id/approve # 确认分镜

POST   /api/workflow/shots/batch-generate   # 批量生图
POST   /api/workflow/videos/batch-generate  # 批量生视频
GET    /api/workflow/tasks/:id/status       # 查询任务状态

POST   /api/workflow/audio/tts              # 语音合成
POST   /api/workflow/audio/lip-sync         # 口型同步
POST   /api/workflow/audio/bgm-match        # BGM匹配

POST   /api/workflow/compose                # 最终合成
POST   /api/workflow/export/:platform       # 平台导出
```

---

*本设计文档基于2025-2026年AI漫剧行业最佳实践编写，将随技术和市场变化持续更新。*

---

## 十一、Harness 实现架构

> **核心理念**：使用 [HarnessEngineeringMaster](../HarnessEngineeringMaster/) 多 Agent 框架自动生成 Phase 1 MVP 所有代码。
> Harness 的 Planner→Builder→Evaluator 三 Agent 循环承担了原本需要人工逐模块编写的全部工作。

### 11.1 架构映射：六大模块 → 6 个 Harness 任务

```
Phase 1 六大模块               Harness 任务
─────────────────────────────────────────────────────────
① 后端 API 骨架              → task1_backend
② 前端工作流页面              → task2_frontend
③ 剧本引擎（Opus 4.6）        → task3_script
④ 角色工厂（图片生成）         → task4_character
⑤ 分镜生成器                  → task5_storyboard
⑥ 视频合成（Seedance 2.0）    → task6_video
```

### 11.2 Harness 三 Agent 工作方式

```
用户提供一段描述需求的 prompt
         ↓
  ┌──────────────┐
  │   Planner    │ → 将需求扩展为详细的产品规格 spec.md
  └──────┬───────┘
         ↓
  ┌──────────────┐   contract.md   ┌──────────────┐
  │   Builder    │◄───────────────►│  Evaluator   │
  │  (写代码)    │   feedback.md   │ (测试+评分)  │
  └──────────────┘                 └──────────────┘
         ↑                                │
         └──────── 循环直到评分 ≥ 7.0 ────┘
                   (最多 5 轮)

Builder 可用工具：read_file, write_file, run_bash, list_files, delegate_task
Evaluator 可用工具：browser_test (Playwright), read_file, run_bash
```

### 11.3 任务依赖关系

```
阶段 A（并行）
  task1_backend ──────────────────────────────────────┐
  task2_frontend ─────────────────────────────────────┤
                                                       │
阶段 B（等 task1 完成，并行）                           │
  task3_script ──────────────────────────────────────┐│
  task4_character ────────────────────────────────────┤│
                                                       ││
阶段 C（等 B 完成）                                    ││
  task5_storyboard ─────────────────────────────────┐ ││
                                                     │ ││
阶段 D（等 C 完成）                                  │ ││
  task6_video ──────────────────────────────────────┤ ││
                                                     │ ││
步骤三：合并 workspace → 主项目 ◄────────────────────┘ ┘┘
```

### 11.4 每个任务的 Harness Prompt 设计原则

每个 harness.py 调用的 prompt 遵循以下结构：

```
1. 项目路径声明（现有代码位置）
2. 工作区输出路径（workspace/taskN_*/）
3. 现有代码参考（要求 Builder 先 read_file 理解现有结构）
4. 需要实现的具体功能列表
5. 与现有代码的兼容约束
6. 输出文件路径列表
```

### 11.5 执行命令

```bash
# 进入 Harness 目录
cd D:/AiProject/AiComedyDrama/HarnessEngineeringMaster

# 阶段 A：并行（开两个终端）
# 终端1
python harness.py "[task1 prompt]"
# 终端2
python harness.py "[task2 prompt]"

# 阶段 B：等 task1 完成，并行
python harness.py "[task3 prompt]"  &
python harness.py "[task4 prompt]"  &

# 阶段 C
python harness.py "[task5 prompt]"

# 阶段 D
python harness.py "[task6 prompt]"

# 合并到主项目
bash merge_workspace.sh
```

### 11.6 workspace 输出目录结构

```
HarnessEngineeringMaster/workspace/
├── {timestamp}_task1_backend/
│   ├── server.py              ← 替换主项目 server.py
│   └── init_dirs.sh           ← 初始化 data/ 目录
│
├── {timestamp}_task2_frontend/
│   └── src/                   ← rsync 合并到主项目 src/
│       ├── app/workflow/[projectId]/page.tsx
│       ├── components/workflow/WorkflowSidebar.tsx
│       ├── components/workflow/InfiniteCanvas.tsx
│       └── types/workflow.ts
│
├── {timestamp}_task3_script/
│   └── script_engine.py       ← 复制到主项目根目录
│
├── {timestamp}_task4_character/
│   ├── character_factory.py
│   └── src/components/workflow/CharacterFactory.tsx
│
├── {timestamp}_task5_storyboard/
│   ├── storyboard_generator.py
│   └── src/components/workflow/StoryboardViewer.tsx
│
└── {timestamp}_task6_video/
    ├── video_composer.py
    └── src/components/workflow/VideoComposer.tsx
```

### 11.7 合并脚本 merge_workspace.sh

合并脚本位于：`D:/AiProject/AiComedyDrama/merge_workspace.sh`

执行流程：
1. 备份现有 `server.py`（带时间戳）
2. 将 task1 输出的 `server.py` 复制到主项目
3. 将 task3-6 的 Python 模块复制到主项目根目录
4. 将 task2-6 的前端文件 rsync/robocopy 合并到 `src/`
5. 验证：启动 server.py，测试关键 API 端点

### 11.8 Harness 配置（.env）

```bash
# D:/AiProject/AiComedyDrama/HarnessEngineeringMaster/.env
OPENAI_API_KEY=sk-firstapi-...        # 项目统一 API Key
OPENAI_BASE_URL=http://peiqian.icu/v1 # 中联 MAAS 代理层
HARNESS_MODEL=claude-sonnet-4-5       # Builder/Evaluator 使用的模型
HARNESS_WORKSPACE=./workspace
MAX_HARNESS_ROUNDS=5
PASS_THRESHOLD=7.0
```

> **说明**：Harness 的 Builder 使用 `claude-sonnet-4-5` 生成代码；
> 生成的代码中剧本引擎调用 `claude-opus-4-5` 做高质量剧本分析（两个不同的模型分工）。
