"use client";

import { useState, useRef, useCallback, useEffect, type DragEvent, type ChangeEvent } from "react";

/* ── 快速模板 ─────────────────────────────────────── */
const TEMPLATES = [
  {
    name: "霸总甜宠",
    type: "都市言情",
    text: `【故事背景】现代都市，某顶级集团总部大厦
【主要角色】
陆景琛 — 冷峻俊朗、西装革履的集团总裁，外冷内热
苏念念 — 清秀可人的新入职设计师，性格倔强不服输

【剧情梗概】
苏念念入职第一天就因迟到撞翻了总裁的咖啡。陆景琛冷脸罚她做一周私人助理。相处中，陆景琛发现她设计才华出众，暗中帮她争取到重要项目。苏念念在加班赶稿时晕倒，陆景琛抱她去医务室，第一次露出心疼的表情。公司晚宴上，陆景琛当众牵起她的手："以后，你只准对我一个人笑。"

【对白片段】
苏念念："陆总，我的设计方案改好了。"
陆景琛（头也不抬）："放桌上，还有你的咖啡钱，三百二。"
苏念念："一杯咖啡三百二？！"
陆景琛（嘴角微扬）："精神损失费。"`,
  },
  {
    name: "修仙逆袭",
    type: "古风玄幻",
    text: `【故事背景】苍穹大陆，灵气充沛的修仙世界。宗门林立，强者为尊。
【主要角色】
叶凡 — 天赋废柴少年，一头乱发，眼神却异常坚定，体内封印着上古神魔之力
白灵儿 — 天才女修，白衣如雪、灵气出尘，宗门首席弟子

【剧情梗概】
叶凡在宗门试炼中被高阶弟子欺辱，坠入深渊。在绝境中，体内封印的上古神魔苏醒，传授他一套逆天功法。三天后叶凡从深渊走出，气息大变。挑战擂台赛上，叶凡一掌击飞昔日欺辱他的高阶弟子，全场震惊。白灵儿注意到他："你的眼神，和三天前不一样了。"

【对白片段】
叶凡："从今天起，没有人能再让我低头。"
白灵儿："你这三天经历了什么？"
叶凡（握拳，气息翻涌）："地狱。"`,
  },
  {
    name: "校园暗恋",
    type: "青春校园",
    text: `【故事背景】某城市重点高中，樱花树下的教学楼
【主要角色】
林小橙 — 文静内敛的女生，成绩优秀，戴着圆框眼镜，暗恋着邻座男生
江淮 — 阳光开朗的男生，篮球队队长，笑容灿烂

【剧情梗概】
林小橙每天最期待的就是早自习，因为可以偷偷看江淮的侧脸。一次大雨，江淮把外套披在她身上跑开，她心跳加速。期末考试后，林小橙鼓起勇气在江淮课桌里放了一封信。放学后，江淮在樱花树下等她，手里拿着那封信，微笑着说："你的字很好看，再多写几封给我吧。"

【对白片段】
林小橙（心里）：他在笑……又在笑了，好好看。
江淮："这道题借我看看？"
林小橙（紧张到声音发抖）："给、给你。"`,
  },
  {
    name: "末世求生",
    type: "科幻冒险",
    text: `【故事背景】2089年，一场神秘辐射让全球70%的人变成丧尸。幸存者在废墟中求生。
【主要角色】
赵铁柱 — 退伍军人，满脸伤疤，沉默寡言但意志坚如铁
小七 — 12岁小女孩，在废墟中被铁柱救下，聪明机灵

【剧情梗概】
赵铁柱在一栋废弃超市搜寻物资时发现了躲在柜子里的小七。起初他想独自上路，但看到小七瘦弱的身影改变了主意。两人结伴穿越丧尸遍布的城市，目标是北方据说还安全的避难所。途中遭遇一群掠夺者的伏击，铁柱以一敌五保护小七。最后，两人站在城市边缘的山丘上，远方传来直升机的声音——希望近在眼前。

【对白片段】
小七："叔叔，你为什么要带上我？"
赵铁柱（沉默片刻）："因为这个世界已经够残忍了，总得有人守护点什么。"`,
  },
];

/* ── 常量 ──────────────────────────────────────────── */
const MAX_IMAGES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

const PLACEHOLDER_TEXT = `提示：你可以自由输入故事，也可以按以下格式提供更详细的信息：

【故事背景】时代、地点、世界观设定
【主要角色】角色名 — 外貌特征 — 性格特点
【剧情梗概】故事的起承转合
【对白片段】（可选）关键对话内容

支持输入 200~50000 字。越详细，AI 生成的效果越好。`;

/* ── Props ─────────────────────────────────────────── */
interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (title: string, rawInput: string, referenceImages: string[]) => Promise<void>;
}

/* ── 组件 ──────────────────────────────────────────── */
export default function CreateProjectDialog({ open, onClose, onCreate }: CreateProjectDialogProps) {
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [images, setImages] = useState<{ id: string; data: string; name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const idCounter = useRef(0);

  /* ── 每次打开时重置状态 ── */
  useEffect(() => {
    if (open) {
      setTitle("");
      setScript("");
      setImages([]);
      setSubmitting(false);
      setErrorMsg("");
    }
  }, [open]);

  /* ── Escape 键关闭 ── */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !submitting) handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ── 校验 ── */
  const scriptLen = script.trim().length;
  const isEmpty = scriptLen === 0;
  const isTooShort = scriptLen > 0 && scriptLen < 200;
  const isTooLong = scriptLen > 50000;
  const canSubmit = !isEmpty && !isTooShort && !isTooLong && !submitting;

  /* ── 图片处理（无闭包陈旧值问题） ── */
  const addFiles = useCallback((files: FileList | File[]) => {
    const fileArr = Array.from(files);
    for (const file of fileArr) {
      if (!ACCEPTED_TYPES.includes(file.type)) continue;
      if (file.size > MAX_FILE_SIZE) continue;

      const reader = new FileReader();
      reader.onload = () => {
        setImages((prev) => {
          if (prev.length >= MAX_IMAGES) return prev;
          return [...prev, { id: `img_${++idCounter.current}`, data: reader.result as string, name: file.name }];
        });
      };
      reader.onerror = () => { /* 跳过读取失败的文件 */ };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addFiles(e.target.files);
    e.target.value = ""; // reset so same file can be re-selected
  };

  const removeImage = (id: string) => setImages((prev) => prev.filter((img) => img.id !== id));

  /* ── 模板 ── */
  const applyTemplate = (tpl: typeof TEMPLATES[number]) => {
    setScript(tpl.text);
    if (!title) setTitle(tpl.name + " — 漫剧");
  };

  /* ── 提交 ── */
  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setErrorMsg("");
    try {
      await onCreate(title.trim() || "", script.trim(), images.map((img) => img.data));
    } catch (err) {
      setErrorMsg((err as Error).message || "创建失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── 关闭 ── */
  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  if (!open) return null;

  return (
    <div style={backdrop} onClick={handleClose} role="dialog" aria-modal="true" aria-labelledby="create-project-title">
      <div style={dialog} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 id="create-project-title" style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary, #eff0f0)" }}>
            新建漫剧项目
          </h2>
          <button onClick={handleClose} style={closeBtn} aria-label="关闭">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Body — scrollable */}
        <div style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
          {/* 项目名称 */}
          <label style={labelStyle}>项目名称 <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>（可选）</span></label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={50}
            placeholder="留空则从剧本自动生成"
            style={inputStyle}
          />

          {/* 剧本文本 */}
          <label style={{ ...labelStyle, marginTop: 20 }}>
            剧本文本 <span style={{ color: "#FF8C00" }}>*</span>
          </label>
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder={PLACEHOLDER_TEXT}
            style={{ ...inputStyle, minHeight: 200, resize: "vertical", lineHeight: 1.6 }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 12 }}>
            <span style={{ color: isTooShort ? "#ef4444" : isTooLong ? "#ef4444" : "rgba(255,255,255,0.25)" }}>
              {isEmpty ? "" : isTooShort ? "剧本至少需要 200 字" : isTooLong ? "超出 50000 字上限" : ""}
            </span>
            <span style={{ color: isTooLong ? "#ef4444" : "rgba(255,255,255,0.25)" }}>
              {scriptLen.toLocaleString()} 字
            </span>
          </div>

          {/* 快速模板 */}
          <label style={{ ...labelStyle, marginTop: 16 }}>快速模板</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {TEMPLATES.map((tpl) => (
              <button key={tpl.name} onClick={() => applyTemplate(tpl)} style={templateBtn}>
                {tpl.name}
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginLeft: 4 }}>{tpl.type}</span>
              </button>
            ))}
          </div>

          {/* 参考图片 */}
          <label style={{ ...labelStyle, marginTop: 20 }}>
            参考图片 <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>（可选，最多 {MAX_IMAGES} 张）</span>
          </label>

          {/* 已上传预览 */}
          {images.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              {images.map((img) => (
                <div key={img.id} style={thumbWrap}>
                  <img src={img.data} alt={img.name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }} />
                  <button onClick={() => removeImage(img.id)} style={thumbRemove} aria-label="删除">×</button>
                </div>
              ))}
            </div>
          )}

          {/* 拖拽上传区 */}
          {images.length < MAX_IMAGES && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                ...dropZone,
                borderColor: dragOver ? "var(--accent-pink, #FF8C00)" : "rgba(255,255,255,0.1)",
                backgroundColor: dragOver ? "rgba(255,140,0,0.05)" : "rgba(255,255,255,0.02)",
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
              </svg>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
                拖拽图片到此处，或点击选择文件
              </span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>
                PNG / JPG / WebP，单张 ≤ 5MB
              </span>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={handleFileChange} />
        </div>

        {/* Footer */}
        {errorMsg && (
          <div style={{ marginTop: 12, padding: "8px 14px", borderRadius: 8, background: "rgba(239,68,68,0.12)", color: "#f87171", fontSize: 13 }}>
            {errorMsg}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button onClick={handleClose} style={cancelBtn} disabled={submitting}>取消</button>
          <button onClick={handleSubmit} disabled={!canSubmit} style={{ ...submitBtn, opacity: canSubmit ? 1 : 0.4, cursor: canSubmit ? "pointer" : "not-allowed" }}>
            {submitting ? "创建中..." : "创建项目"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── 样式 ──────────────────────────────────────────── */
const backdrop: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 9999,
  background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)",
  display: "flex", alignItems: "center", justifyContent: "center",
};

const dialog: React.CSSProperties = {
  width: 640, maxWidth: "90vw", maxHeight: "85vh",
  display: "flex", flexDirection: "column",
  background: "var(--bg-panel, #111113)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 16, padding: "28px 32px",
  boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
};

const closeBtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "transparent", border: "none",
  color: "rgba(255,255,255,0.4)", cursor: "pointer",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 600,
  color: "rgba(255,255,255,0.7)", marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.04)",
  color: "var(--text-primary, #eff0f0)", fontSize: 14,
  outline: "none", fontFamily: "inherit",
};

const templateBtn: React.CSSProperties = {
  padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 500,
  color: "rgba(255,255,255,0.6)",
  backgroundColor: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.08)",
  cursor: "pointer", transition: "all 0.15s",
};

const dropZone: React.CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  gap: 6, padding: "20px 16px", borderRadius: 12,
  border: "1px dashed rgba(255,255,255,0.1)",
  cursor: "pointer", transition: "all 0.2s",
};

const thumbWrap: React.CSSProperties = {
  position: "relative", width: 72, height: 72, borderRadius: 10, overflow: "hidden",
  border: "1px solid rgba(255,255,255,0.1)",
};

const thumbRemove: React.CSSProperties = {
  position: "absolute", top: 2, right: 2,
  width: 20, height: 20, borderRadius: "50%",
  background: "rgba(0,0,0,0.7)", color: "#fff",
  border: "none", fontSize: 13, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
};

const cancelBtn: React.CSSProperties = {
  padding: "8px 20px", borderRadius: 10, fontSize: 14, fontWeight: 500,
  color: "rgba(255,255,255,0.6)", background: "transparent",
  border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer",
};

const submitBtn: React.CSSProperties = {
  padding: "8px 28px", borderRadius: 10, fontSize: 14, fontWeight: 600,
  color: "#fff", border: "none",
  background: "linear-gradient(135deg, #FF8C00, #FFA500)",
  transition: "opacity 0.2s",
};
