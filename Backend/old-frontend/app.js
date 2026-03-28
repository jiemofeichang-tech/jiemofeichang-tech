let API_BASE = (localStorage.getItem("apiBase") || "").replace(/\/+$/, "");

const state = {
  config: null,
  currentTask: null,
  currentResponse: {},
  history: [],
  library: [],
  pollTimer: null,
  uploads: {
    sourceImage: null,
    firstFrame: null,
    lastFrame: null,
    imageRefs: [],
  },
};

const MODES = [
  {
    id: "text",
    label: "纯文生",
    desc: "只写提示词，直接生成一段完整视频。",
  },
  {
    id: "first_frame",
    label: "首帧控制",
    desc: "指定开场画面，用首帧锁住起始视觉。",
  },
  {
    id: "first_last_frame",
    label: "首尾帧",
    desc: "同时约束开头与结尾，让镜头收束更稳定。",
  },
  {
    id: "image_to_video",
    label: "图生视频",
    desc: "给一张主参考图，直接围绕这张图生成动态镜头。",
  },
  {
    id: "video_reference",
    label: "视频参考",
    desc: "基于已有视频节奏、动作和镜头语言生成。",
  },
  {
    id: "extend_video",
    label: "延长视频",
    desc: "基于已有任务继续往后延长镜头和动作。",
  },
];

const CAMERA_PRESETS = [
  { value: "auto", label: "自动", helper: "不额外加运镜限制，让模型自行决策。" },
  { value: "push_in", label: "缓慢推近", helper: "镜头要求：整体为缓慢推近镜头，动作自然，避免大幅抖动。" },
  { value: "pull_back", label: "缓慢拉远", helper: "镜头要求：整体为缓慢拉远镜头，强调空间层次。" },
  { value: "pan", label: "平移跟随", helper: "镜头要求：以横向平移和主体跟拍为主，动线流畅。" },
  { value: "orbit", label: "环绕展示", helper: "镜头要求：围绕主体轻微环绕，强调空间感和质感。" },
  { value: "handheld", label: "手持纪实", helper: "镜头要求：保留轻微手持纪实感，但画面不能晃得过头。" },
];

const MOTION_SPEEDS = [
  { value: "steady", label: "稳定", helper: "镜头节奏稳定，不要突然加速。" },
  { value: "slow", label: "偏慢", helper: "镜头节奏偏慢，动作舒展，转场自然。" },
  { value: "dynamic", label: "偏快", helper: "镜头节奏偏快，画面更有广告片冲击力。" },
];

const dom = {
  modeGrid: document.getElementById("mode-grid"),
  mode: document.getElementById("mode"),
  model: document.getElementById("model"),
  prompt: document.getElementById("prompt"),
  sourceImage: document.getElementById("source-image"),
  sourceImageField: document.getElementById("source-image-field"),
  sourceImageFile: document.getElementById("source-image-file"),
  sourceImageDropzone: document.getElementById("source-image-dropzone"),
  sourceImageSelect: document.getElementById("source-image-select"),
  sourceImageClear: document.getElementById("source-image-clear"),
  sourceImageUploadMeta: document.getElementById("source-image-upload-meta"),
  sourceImageUploadPanel: document.getElementById("source-image-upload-panel"),
  firstFrame: document.getElementById("first-frame"),
  lastFrame: document.getElementById("last-frame"),
  firstFrameFile: document.getElementById("first-frame-file"),
  firstFrameDropzone: document.getElementById("first-frame-dropzone"),
  firstFrameSelect: document.getElementById("first-frame-select"),
  firstFrameClear: document.getElementById("first-frame-clear"),
  firstFrameUploadMeta: document.getElementById("first-frame-upload-meta"),
  firstFrameUploadPanel: document.getElementById("first-frame-upload-panel"),
  lastFrameFile: document.getElementById("last-frame-file"),
  lastFrameDropzone: document.getElementById("last-frame-dropzone"),
  lastFrameSelect: document.getElementById("last-frame-select"),
  lastFrameClear: document.getElementById("last-frame-clear"),
  lastFrameUploadMeta: document.getElementById("last-frame-upload-meta"),
  lastFrameUploadPanel: document.getElementById("last-frame-upload-panel"),
  firstFrameField: document.getElementById("first-frame-field"),
  lastFrameField: document.getElementById("last-frame-field"),
  imageRefs: document.getElementById("image-refs"),
  imageRefsFile: document.getElementById("image-refs-file"),
  imageRefsDropzone: document.getElementById("image-refs-dropzone"),
  imageRefsSelect: document.getElementById("image-refs-select"),
  imageRefsClear: document.getElementById("image-refs-clear"),
  imageRefsUploadMeta: document.getElementById("image-refs-upload-meta"),
  imageRefsUploadPanel: document.getElementById("image-refs-upload-panel"),
  imageRefsField: document.getElementById("image-refs-field"),
  videoRefs: document.getElementById("video-refs"),
  videoRefsField: document.getElementById("video-refs-field"),
  audioRefs: document.getElementById("audio-refs"),
  audioRefsField: document.getElementById("audio-refs-field"),
  assetAudioId: document.getElementById("asset-audio-id"),
  assetAudioIdField: document.getElementById("asset-audio-id-field"),
  taskReference: document.getElementById("task-reference"),
  taskReferenceField: document.getElementById("task-reference-field"),
  resolution: document.getElementById("resolution"),
  ratio: document.getElementById("ratio"),
  duration: document.getElementById("duration"),
  generateAudio: document.getElementById("generate-audio"),
  searchMode: document.getElementById("search-mode"),
  cameraPreset: document.getElementById("camera-preset"),
  motionSpeed: document.getElementById("motion-speed"),
  promptHelper: document.getElementById("prompt-helper"),
  studioForm: document.getElementById("studio-form"),
  settingsForm: document.getElementById("settings-form"),
  previewPayload: document.getElementById("preview-payload"),
  resetForm: document.getElementById("reset-form"),
  refreshAll: document.getElementById("refresh-all"),
  refreshHistory: document.getElementById("refresh-history"),
  refreshLibrary: document.getElementById("refresh-library"),
  queryCurrent: document.getElementById("query-current"),
  saveCurrent: document.getElementById("save-current"),
  openCurrentRemote: document.getElementById("open-current-remote"),
  downloadCurrent: document.getElementById("download-current"),
  previewStage: document.getElementById("preview-stage"),
  taskStatus: document.getElementById("task-status"),
  autosaveStatus: document.getElementById("autosave-status"),
  currentTaskId: document.getElementById("current-task-id"),
  currentLocalState: document.getElementById("current-local-state"),
  currentCost: document.getElementById("current-cost"),
  progressPercent: document.getElementById("progress-percent"),
  progressMeta: document.getElementById("progress-meta"),
  progressFill: document.getElementById("progress-fill"),
  progressStages: document.getElementById("progress-stages"),
  messageBox: document.getElementById("message-box"),
  rawResponse: document.getElementById("raw-response"),
  taskList: document.getElementById("task-list"),
  assetGrid: document.getElementById("asset-grid"),
  userId: document.getElementById("user-id"),
  defaultModel: document.getElementById("default-model"),
  autoSaveSetting: document.getElementById("auto-save-setting"),
  apiKey: document.getElementById("api-key"),
  sidebarUserId: document.getElementById("sidebar-user-id"),
  sidebarDefaultModel: document.getElementById("sidebar-default-model"),
  keyStatusChip: document.getElementById("key-status-chip"),
  apiBase: document.getElementById("api-base"),
  openStorage: document.getElementById("open-storage"),
  openStorageSecondary: document.getElementById("open-storage-secondary"),
  navItems: Array.from(document.querySelectorAll(".nav-item")),
  referencePreviewGrid: document.getElementById("reference-preview-grid"),
  referencePreviewBoard: document.getElementById("reference-preview-board"),
};

function setMessage(text, tone = "info") {
  dom.messageBox.textContent = text;
  dom.messageBox.style.color = tone === "error" ? "var(--danger)" : "var(--text-soft)";
}

function splitLines(value) {
  return value
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatBytes(bytes) {
  if (!bytes || Number.isNaN(bytes)) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function mediaUrl(path) {
  return path && path.startsWith("/media/") ? API_BASE + path : path;
}

async function api(path, options = {}) {
  const response = await fetch(API_BASE + path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `请求失败：${response.status}`);
  }
  return data;
}

function populateSelect(select, values, fallbackFormatter = (value) => value) {
  select.innerHTML = values
    .map((value) => `<option value="${value}">${fallbackFormatter(value)}</option>`)
    .join("");
}

function renderModes() {
  dom.mode.innerHTML = MODES.map((mode) => `<option value="${mode.id}">${mode.label}</option>`).join("");
  dom.modeGrid.innerHTML = MODES.map((mode) => {
    return `
      <button class="mode-card${mode.id === "text" ? " is-active" : ""}" type="button" data-mode="${mode.id}">
        <div class="mode-card-title">${mode.label}</div>
        <div class="mode-card-desc">${mode.desc}</div>
      </button>
    `;
  }).join("");
}

function renderPromptHelpers() {
  const camera = CAMERA_PRESETS.find((item) => item.value === dom.cameraPreset.value);
  const speed = MOTION_SPEEDS.find((item) => item.value === dom.motionSpeed.value);
  const mode = MODES.find((item) => item.id === dom.mode.value);
  const searchLabel = dom.searchMode.value === "on" ? "联网搜索会作为工具参数传递。" : "联网搜索关闭。";
  const modeHelper =
    dom.mode.value === "image_to_video"
      ? "图生视频会把主参考图作为核心视觉锚点，尽量保持主体、构图和色调连续。"
      : mode?.desc;
  const items = [modeHelper, camera?.helper, speed?.helper, searchLabel].filter(Boolean);
  dom.promptHelper.innerHTML = items.map((item) => `<div class="helper-pill">${escapeHtml(item)}</div>`).join("");
}

function applyModeVisibility() {
  const mode = dom.mode.value;
  const visibility = {
    sourceImageField: mode === "image_to_video",
    sourceImageUploadPanel: mode === "image_to_video",
    firstFrameField: ["first_frame", "first_last_frame"].includes(mode),
    firstFrameUploadPanel: ["first_frame", "first_last_frame"].includes(mode),
    lastFrameField: mode === "first_last_frame",
    lastFrameUploadPanel: mode === "first_last_frame",
    imageRefsField: ["image_to_video", "first_frame", "first_last_frame"].includes(mode),
    imageRefsUploadPanel: ["image_to_video", "first_frame", "first_last_frame"].includes(mode),
    videoRefsField: mode === "video_reference",
    taskReferenceField: mode === "extend_video",
    audioRefsField: true,
    assetAudioIdField: true,
  };

  Object.entries(visibility).forEach(([key, visible]) => {
    dom[key]?.classList.toggle("is-hidden", !visible);
  });

  dom.referencePreviewBoard.classList.toggle(
    "is-hidden",
    !["image_to_video", "first_frame", "first_last_frame"].includes(mode),
  );
}

function renderUploadMeta() {
  const source = state.uploads.sourceImage;
  const first = state.uploads.firstFrame;
  const last = state.uploads.lastFrame;
  const refs = state.uploads.imageRefs;

  dom.sourceImageUploadMeta.textContent = source
    ? `已选择主参考图：${source.name} · ${formatBytes(source.size)} · ${source.type || "image/*"}。`
    : "当前还没有选择本地图片。";
  dom.firstFrameUploadMeta.textContent = first
    ? `已选择首帧：${first.name} · ${formatBytes(first.size)}。`
    : "当前还没有选择首帧图片。";
  dom.lastFrameUploadMeta.textContent = last
    ? `已选择尾帧：${last.name} · ${formatBytes(last.size)}。`
    : "当前还没有选择尾帧图片。";
  dom.imageRefsUploadMeta.textContent = refs.length
    ? `已选择 ${refs.length} 张补充参考图：${refs.map((item) => item.name).join("、")}`
    : "当前还没有选择补充参考图。";
  renderReferencePreview();
  renderPromptHelpers();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        name: file.name,
        size: file.size,
        type: file.type,
        dataUrl: String(reader.result || ""),
      });
    };
    reader.onerror = () => reject(new Error("本地图片读取失败。"));
    reader.readAsDataURL(file);
  });
}

async function setSingleUpload(key, file, label) {
  if (!file) return;
  const payload = await readFileAsDataUrl(file);
  state.uploads[key] = payload;
  renderUploadMeta();
  setMessage(`已载入${label} ${file.name}`);
}

async function appendMultiUploads(key, files, label) {
  const imageFiles = files.filter((file) => file.type.startsWith("image/"));
  if (!imageFiles.length) throw new Error("没有检测到可用图片。");
  const uploads = await Promise.all(imageFiles.map((file) => readFileAsDataUrl(file)));
  state.uploads[key] = [...state.uploads[key], ...uploads];
  renderUploadMeta();
  setMessage(`已载入${uploads.length}张${label}`);
}

function clearUpload(key, fileInput) {
  if (Array.isArray(state.uploads[key])) {
    state.uploads[key] = [];
  } else {
    state.uploads[key] = null;
  }
  if (fileInput) {
    fileInput.value = "";
  }
  renderUploadMeta();
}

function renderReferencePreview() {
  const cards = [];
  const mode = dom.mode.value;
  const uploadedPrimary = state.uploads.sourceImage;
  const primary = dom.sourceImage.value.trim();
  const first = dom.firstFrame.value.trim();
  const last = dom.lastFrame.value.trim();

  if (mode === "image_to_video" && uploadedPrimary?.dataUrl) {
    cards.push({
      title: "主参考图",
      url: uploadedPrimary.dataUrl,
      meta: `本地上传 · ${uploadedPrimary.name} · ${formatBytes(uploadedPrimary.size)}`,
    });
  } else if (mode === "image_to_video" && primary) {
    cards.push({
      title: "主参考图",
      url: primary,
      meta: "图生视频模式会优先围绕这张图生成镜头。",
    });
  }
  if (["first_frame", "first_last_frame"].includes(mode) && state.uploads.firstFrame?.dataUrl) {
    cards.push({
      title: "首帧",
      url: state.uploads.firstFrame.dataUrl,
      meta: `本地上传 · ${state.uploads.firstFrame.name} · ${formatBytes(state.uploads.firstFrame.size)}`,
    });
  } else if (["first_frame", "first_last_frame"].includes(mode) && first) {
    cards.push({
      title: "首帧",
      url: first,
      meta: "生成镜头会尽量从这张开场画面起步。",
    });
  }
  if (mode === "first_last_frame" && state.uploads.lastFrame?.dataUrl) {
    cards.push({
      title: "尾帧",
      url: state.uploads.lastFrame.dataUrl,
      meta: `本地上传 · ${state.uploads.lastFrame.name} · ${formatBytes(state.uploads.lastFrame.size)}`,
    });
  } else if (mode === "first_last_frame" && last) {
    cards.push({
      title: "尾帧",
      url: last,
      meta: "生成镜头会尽量收束到这个结束画面。",
    });
  }
  if (["image_to_video", "first_frame", "first_last_frame"].includes(mode)) {
    state.uploads.imageRefs.forEach((item, index) => {
      cards.push({
        title: `参考图 ${index + 1}`,
        url: item.dataUrl,
        meta: `本地上传 · ${item.name} · ${formatBytes(item.size)}`,
      });
    });
    splitLines(dom.imageRefs.value).forEach((url, index) => {
      cards.push({
        title: `参考图 URL ${index + 1}`,
        url,
        meta: "来自高级 URL 输入。",
      });
    });
  }

  if (!cards.length) {
    dom.referencePreviewGrid.innerHTML = `
      <div class="empty-state">当前模式支持图像参考。填入主参考图、首帧或尾帧后，这里会直接显示预览。</div>
    `;
    return;
  }

  dom.referencePreviewGrid.innerHTML = cards
    .map(
      (card) => `
        <article class="reference-preview-card">
          <img class="reference-preview-media" src="${escapeHtml(card.url)}" alt="${escapeHtml(card.title)}" />
          <div class="reference-preview-body">
            <div class="reference-preview-title">${escapeHtml(card.title)}</div>
            <div class="reference-preview-meta">${escapeHtml(card.meta)}</div>
          </div>
        </article>
      `,
    )
    .join("");
}

function buildPrompt() {
  const basePrompt = dom.prompt.value.trim();
  const extras = [];
  const mode = dom.mode.value;
  const camera = CAMERA_PRESETS.find((item) => item.value === dom.cameraPreset.value);
  const speed = MOTION_SPEEDS.find((item) => item.value === dom.motionSpeed.value);
  if (mode === "image_to_video" && (state.uploads.sourceImage?.dataUrl || dom.sourceImage.value.trim())) {
    extras.push("请严格参考主参考图中的主体、构图、服装和场景质感，在此基础上生成连贯自然的动态镜头。");
  }
  if (camera && camera.value !== "auto") extras.push(camera.helper);
  if (speed) extras.push(speed.helper);
  if (["first_frame", "first_last_frame"].includes(mode) && (state.uploads.firstFrame?.dataUrl || dom.firstFrame.value.trim())) extras.push("首帧请严格参考图片1。");
  if (mode === "first_last_frame" && (state.uploads.lastFrame?.dataUrl || dom.lastFrame.value.trim())) extras.push("尾帧请严格定格为尾帧参考图。");
  if (mode === "extend_video" && dom.taskReference.value.trim()) {
    extras.push("请在已有视频风格和动作基础上自然延长，不要突兀跳剪。");
  }
  return [basePrompt, ...extras].filter(Boolean).join("\n");
}

function buildContent() {
  const content = [];
  const mode = dom.mode.value;
  const prompt = buildPrompt();
  if (prompt) {
    content.push({ type: "text", text: prompt });
  }

  const sourceImage = state.uploads.sourceImage?.dataUrl || dom.sourceImage.value.trim();
  if (mode === "image_to_video" && sourceImage) {
    content.push({
      type: "image_url",
      image_url: { url: sourceImage },
      role: "reference_image",
    });
  }

  const firstFrame = state.uploads.firstFrame?.dataUrl || dom.firstFrame.value.trim();
  if (["first_frame", "first_last_frame"].includes(mode) && firstFrame) {
    content.push({
      type: "image_url",
      image_url: { url: firstFrame },
      role: "reference_image",
    });
  }

  if (["image_to_video", "first_frame", "first_last_frame"].includes(mode)) {
    [...state.uploads.imageRefs.map((item) => item.dataUrl), ...splitLines(dom.imageRefs.value)].forEach((url) => {
      content.push({
        type: "image_url",
        image_url: { url },
        role: "reference_image",
      });
    });
  }

  const lastFrame = state.uploads.lastFrame?.dataUrl || dom.lastFrame.value.trim();
  if (mode === "first_last_frame" && lastFrame) {
    content.push({
      type: "image_url",
      image_url: { url: lastFrame },
      role: "reference_image",
    });
  }

  splitLines(dom.videoRefs.value).forEach((url) => {
    content.push({
      type: "video_url",
      video_url: { url },
      role: "reference_video",
    });
  });

  splitLines(dom.audioRefs.value).forEach((url) => {
    content.push({
      type: "audio_url",
      audio_url: { url },
      role: "reference_audio",
    });
  });

  const assetAudioId = dom.assetAudioId.value.trim();
  if (assetAudioId) {
    const normalized = assetAudioId.startsWith("asset://") ? assetAudioId : `asset://${assetAudioId}`;
    content.push({
      type: "audio_url",
      audio_url: { url: normalized },
      role: "reference_audio",
    });
  }

  const taskReference = dom.taskReference.value.trim();
  if (taskReference) {
    content.push({
      type: "task_id",
      task_id: taskReference,
    });
  }

  return content;
}

function buildPayload() {
  const payload = {
    model: dom.model.value.trim(),
    content: buildContent(),
    resolution: dom.resolution.value,
    ratio: dom.ratio.value,
    duration: Number(dom.duration.value),
    generate_audio: dom.generateAudio.value === "true",
  };

  if (dom.searchMode.value === "on") {
    payload.tools = [{ type: "web_search" }];
  }

  return payload;
}

function taskCostText(record) {
  const cost = record?.proxy_meta?.cost?.total_cost || record?.proxy_meta?.costs?.CNY?.total_cost;
  return cost ? `${cost} CNY` : "-";
}

function extractActualProgress(record) {
  const candidates = [
    record?.progress,
    record?.progress_percent,
    record?.completed_percentage,
    record?.percentage,
    record?.proxy_meta?.progress,
    record?.proxy_meta?.progress_percent,
  ];
  for (const value of candidates) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 100) {
      return Math.round(numeric);
    }
  }
  return null;
}

function deriveProgress(record) {
  const status = record?.status || "idle";
  const actualPercent = extractActualProgress(record);
  const actual = actualPercent !== null;
  const percentMap = {
    idle: 0,
    queued: 12,
    pending: 24,
    running: 68,
    processing: 68,
    succeeded: 100,
    failed: 100,
    cancelled: 100,
  };
  const percent = actual ? actualPercent : (percentMap[status] ?? 0);
  const stages = [
    { id: "created", title: "任务创建", note: "请求已提交到代理层。"},
    { id: "queued", title: "排队校验", note: "上游正在接单和校验素材。"},
    { id: "running", title: "视频生成", note: "模型正在渲染镜头与音频。"},
    { id: "done", title: "完成入库", note: "任务完成后可预览并下载。"},
  ];
  const stageStates = {
    idle: [],
    queued: ["created", "queued"],
    pending: ["created", "queued"],
    running: ["created", "queued", "running"],
    processing: ["created", "queued", "running"],
    succeeded: ["created", "queued", "running", "done"],
    failed: ["created", "queued", "running", "done"],
    cancelled: ["created", "queued", "done"],
  };
  const completed = stageStates[status] || [];
  const activeStage =
    status === "queued" || status === "pending"
      ? "queued"
      : status === "running" || status === "processing"
        ? "running"
        : status === "succeeded" || status === "failed" || status === "cancelled"
          ? "done"
          : "created";
  let meta = actual ? "来自上游返回的真实进度。" : "当前上游未返回百分比，先按任务阶段估算进度。";
  if (record?.error?.message) {
    meta = `失败原因：${record.error.message}`;
  }

  return {
    percent,
    actual,
    meta,
    stages: stages.map((stage) => ({
      ...stage,
      complete: completed.includes(stage.id),
      active: activeStage === stage.id,
      error: stage.id === "done" && ["failed", "cancelled"].includes(status),
    })),
  };
}

function renderProgress(record) {
  const progress = deriveProgress(record);
  dom.progressPercent.textContent = `${progress.percent}%`;
  dom.progressMeta.textContent = progress.meta;
  dom.progressFill.style.width = `${progress.percent}%`;
  dom.progressStages.innerHTML = progress.stages
    .map((stage) => {
      const classes = ["progress-stage"];
      if (stage.complete) classes.push("is-complete");
      if (stage.active) classes.push("is-active");
      if (stage.error) classes.push("is-error");
      return `
        <div class="${classes.join(" ")}">
          <div class="progress-stage-title">${escapeHtml(stage.title)}</div>
          <div class="progress-stage-note">${escapeHtml(stage.note)}</div>
        </div>
      `;
    })
    .join("");
}

function renderPreview(record) {
  state.currentResponse = record || {};
  dom.rawResponse.textContent = JSON.stringify(record || {}, null, 2);

  if (!record || !record.id) {
    dom.currentTaskId.textContent = "-";
    dom.currentCost.textContent = "-";
    dom.currentLocalState.textContent = "未保存";
    dom.taskStatus.textContent = "未开始";
    dom.taskStatus.dataset.status = "idle";
    renderProgress({ status: "idle" });
    dom.previewStage.innerHTML = `
      <div class="preview-empty">
        <strong>还没有可播放视频</strong>
        <span>先创建任务，或者从任务列表里点开一个已完成任务。</span>
      </div>
    `;
    return;
  }

  state.currentTask = record;
  dom.currentTaskId.textContent = record.id;
  dom.currentCost.textContent = taskCostText(record);
  dom.currentLocalState.textContent = record.local_asset ? "已保存到本地" : "未保存";
  dom.taskStatus.textContent = record.status || "未知";
  dom.taskStatus.dataset.status = record.status || "unknown";
  renderProgress(record);

  const localUrl = mediaUrl(record.local_asset?.local_url);
  const remoteUrl = record.content?.video_url || record._proxy?.videoUrls?.[0];
  const playableUrl = localUrl || remoteUrl;
  if (playableUrl) {
    dom.previewStage.innerHTML = `<video controls playsinline src="${playableUrl}"></video>`;
  } else if (record?.error?.message) {
    dom.previewStage.innerHTML = `
      <div class="preview-empty">
        <strong>任务执行失败</strong>
        <span>${escapeHtml(record.error.message)}</span>
      </div>
    `;
  } else {
    dom.previewStage.innerHTML = `
      <div class="preview-empty">
        <strong>任务已创建，但还没有视频链接</strong>
        <span>当前状态：${escapeHtml(record.status || "未知")}。如果是 running，继续查询即可。</span>
      </div>
    `;
  }
}

function taskPromptLabel(record) {
  if (record?.meta?.title) return record.meta.title;
  if (record?.title) return record.title;
  const textItem = record?.request_payload?.content?.find((item) => item.type === "text");
  if (!textItem?.text) return record?.id || "未命名任务";
  return textItem.text.slice(0, 48);
}

function renderHistory() {
  if (!state.history.length) {
    dom.taskList.innerHTML = `<div class="empty-state">还没有任务历史。创建过的任务会自动出现在这里。</div>`;
    return;
  }

  dom.taskList.innerHTML = state.history.map((record) => {
    return `
      <article class="task-card">
        <div class="task-top">
          <div>
            <div class="task-title">${escapeHtml(taskPromptLabel(record))}</div>
            <div class="task-meta">任务 ${escapeHtml(record.id)} · ${escapeHtml(record.model || "-")}</div>
            <div class="task-meta">比例 ${escapeHtml(record.ratio || "-")} · ${escapeHtml(String(record.duration || "-"))} 秒 · 成本 ${escapeHtml(taskCostText(record))}</div>
          </div>
          <span class="status-badge" data-status="${escapeHtml(record.status || "unknown")}">${escapeHtml(record.status || "unknown")}</span>
        </div>
        <div class="task-actions">
          <button class="mini-button" data-task-open="${record.id}">打开</button>
          <button class="mini-button" data-task-query="${record.id}">查询</button>
          <button class="mini-button" data-task-save="${record.id}">保存</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderLibrary() {
  if (!state.library.length) {
    dom.assetGrid.innerHTML = `<div class="empty-state">本地作品库还是空的。生成成功后视频会自动下载到本地并出现在这里。</div>`;
    return;
  }

  dom.assetGrid.innerHTML = state.library.map((asset) => {
    return `
      <article class="asset-card">
        <video class="asset-preview" controls preload="metadata" src="${mediaUrl(asset.local_url)}"></video>
        <div class="asset-body">
          <div class="asset-top">
            <div>
              <div class="asset-title">${escapeHtml(asset.title || asset.task_id)}</div>
              <div class="asset-meta">任务 ${escapeHtml(asset.task_id)} · 保存于 ${escapeHtml(asset.saved_at || "-")}</div>
              <div class="asset-meta">分辨率 ${escapeHtml(asset.resolution || "-")} · 比例 ${escapeHtml(asset.ratio || "-")} · ${escapeHtml(String(asset.duration || "-"))} 秒</div>
            </div>
            <span class="status-badge subtle">${escapeHtml(asset.source || "local")}</span>
          </div>
          <div class="asset-actions-row">
            <a class="mini-button" href="${mediaUrl(asset.local_url)}" target="_blank" rel="noreferrer">打开本地预览</a>
            <a class="mini-button" href="${mediaUrl(asset.download_url)}" download>下载</a>
            ${asset.remote_url ? `<a class="mini-button" href="${asset.remote_url}" target="_blank" rel="noreferrer">远程链接</a>` : ""}
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function bindImageUpload({ key, input, dropzone, selectButton, clearButton, multiple = false, label }) {
  const openPicker = () => input.click();
  selectButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openPicker();
  });
  dropzone.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    openPicker();
  });
  dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPicker();
    }
  });
  input.addEventListener("change", async () => {
    const files = Array.from(input.files || []);
    if (!files.length) return;
    try {
      if (multiple) {
        await appendMultiUploads(key, files, label);
      } else {
        await setSingleUpload(key, files[0], label);
      }
    } catch (error) {
      setMessage(error.message, "error");
    }
  });
  clearButton.addEventListener("click", () => {
    clearUpload(key, input);
    setMessage(`已清除${label}`);
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add("is-dragover");
    });
  });
  ["dragleave", "dragend", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove("is-dragover");
    });
  });
  dropzone.addEventListener("drop", async (event) => {
    const files = Array.from(event.dataTransfer?.files || []);
    if (!files.length) {
      setMessage("拖拽内容里没有文件。", "error");
      return;
    }
    try {
      if (multiple) {
        await appendMultiUploads(key, files, label);
      } else {
        const file = files.find((item) => item.type.startsWith("image/"));
        if (!file) throw new Error("拖拽的文件里没有可用图片。");
        await setSingleUpload(key, file, label);
      }
    } catch (error) {
      setMessage(error.message, "error");
    }
  });
}

function bindImageUploads() {
  bindImageUpload({
    key: "sourceImage",
    input: dom.sourceImageFile,
    dropzone: dom.sourceImageDropzone,
    selectButton: dom.sourceImageSelect,
    clearButton: dom.sourceImageClear,
    label: "主参考图",
  });
  bindImageUpload({
    key: "firstFrame",
    input: dom.firstFrameFile,
    dropzone: dom.firstFrameDropzone,
    selectButton: dom.firstFrameSelect,
    clearButton: dom.firstFrameClear,
    label: "首帧图片",
  });
  bindImageUpload({
    key: "lastFrame",
    input: dom.lastFrameFile,
    dropzone: dom.lastFrameDropzone,
    selectButton: dom.lastFrameSelect,
    clearButton: dom.lastFrameClear,
    label: "尾帧图片",
  });
  bindImageUpload({
    key: "imageRefs",
    input: dom.imageRefsFile,
    dropzone: dom.imageRefsDropzone,
    selectButton: dom.imageRefsSelect,
    clearButton: dom.imageRefsClear,
    multiple: true,
    label: "补充参考图",
  });
}

async function loadConfig() {
  if (dom.apiBase) dom.apiBase.value = API_BASE;
  state.config = await api("/api/config");
  dom.model.value = state.config.defaultModel || "doubao-seedance-2.0";
  dom.defaultModel.value = state.config.defaultModel || "doubao-seedance-2.0";
  dom.userId.value = state.config.userId || "";
  dom.sidebarUserId.textContent = state.config.userId || "未配置";
  dom.sidebarDefaultModel.textContent = state.config.defaultModel || "未配置";
  dom.keyStatusChip.textContent = state.config.hasApiKey ? "Key 已加载" : "Key 未配置";
  dom.autoSaveSetting.value = String(state.config.autoSave ?? true);
  dom.autosaveStatus.textContent = (state.config.autoSave ?? true) ? "自动入库开启" : "自动入库关闭";

  populateSelect(dom.resolution, state.config.modelHints.resolution, (item) => item);
  dom.resolution.value = "720p";
  populateSelect(dom.ratio, state.config.modelHints.ratio, (item) => item);
  dom.ratio.value = "adaptive";
  populateSelect(dom.duration, state.config.modelHints.duration, (item) => (Number(item) === -1 ? "自动（-1）" : `${item} 秒`));
  dom.duration.value = "5";

  populateSelect(dom.cameraPreset, CAMERA_PRESETS.map((item) => item.value), (value) => CAMERA_PRESETS.find((item) => item.value === value)?.label || value);
  populateSelect(dom.motionSpeed, MOTION_SPEEDS.map((item) => item.value), (value) => MOTION_SPEEDS.find((item) => item.value === value)?.label || value);

  renderPromptHelpers();
  applyModeVisibility();
  renderReferencePreview();
}

async function loadHistory() {
  const data = await api("/api/history");
  state.history = data.tasks || [];
  renderHistory();
}

async function loadLibrary() {
  const data = await api("/api/library");
  state.library = data.assets || [];
  renderLibrary();
}

async function queryTask(taskId, { silent = false } = {}) {
  const record = await api(`/api/tasks/${encodeURIComponent(taskId)}`);
  renderPreview(record);
  await loadHistory();
  await loadLibrary();

  if (!silent) {
    const progress = deriveProgress(record);
    const suffix = record?.error?.message ? ` · ${record.error.message}` : "";
    setMessage(`任务 ${taskId} 当前状态：${record.status || "未知"} · ${progress.percent}%${suffix}`);
  }

  stopPolling();
  if (record.status && ["running", "pending", "queued"].includes(record.status)) {
    state.pollTimer = window.setTimeout(() => {
      queryTask(taskId, { silent: true }).catch((error) => setMessage(error.message, "error"));
    }, 6000);
  }
}

function stopPolling() {
  if (state.pollTimer) {
    window.clearTimeout(state.pollTimer);
    state.pollTimer = null;
  }
}

async function saveCurrentTask() {
  if (!state.currentTask?.id) {
    setMessage("当前没有可保存的任务。", "error");
    return;
  }
  const data = await api("/api/library/save", {
    method: "POST",
    body: JSON.stringify({ taskId: state.currentTask.id }),
  });
  setMessage(data.message || "已保存到本地。");
  await loadHistory();
  await loadLibrary();
  await queryTask(state.currentTask.id, { silent: true });
}

function bindNav() {
  dom.navItems.forEach((item) => {
    item.addEventListener("click", () => {
      dom.navItems.forEach((button) => button.classList.remove("is-active"));
      item.classList.add("is-active");
      document.getElementById(item.dataset.section)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function bindTaskActions() {
  dom.taskList.addEventListener("click", async (event) => {
    const target = event.target.closest("button");
    if (!target) return;
    const openId = target.dataset.taskOpen;
    const queryId = target.dataset.taskQuery;
    const saveId = target.dataset.taskSave;

    try {
      if (openId) {
        const record = state.history.find((item) => item.id === openId);
        renderPreview(record);
        setMessage(`已打开任务 ${openId}`);
      }
      if (queryId) {
        await queryTask(queryId);
      }
      if (saveId) {
        renderPreview(state.history.find((item) => item.id === saveId));
        await saveCurrentTask();
      }
    } catch (error) {
      setMessage(error.message, "error");
    }
  });
}

function openStorageDirectory() {
  fetch(API_BASE + "/api/open-storage", { method: "POST" }).catch(() => {});
  setMessage("已尝试打开本地作品目录。");
}

async function refreshAll() {
  await loadConfig();
  await loadHistory();
  await loadLibrary();
  if (state.currentTask?.id) {
    await queryTask(state.currentTask.id, { silent: true });
  }
}

function resetForm() {
  dom.studioForm.reset();
  state.uploads.sourceImage = null;
  state.uploads.firstFrame = null;
  state.uploads.lastFrame = null;
  state.uploads.imageRefs = [];
  dom.model.value = state.config?.defaultModel || "doubao-seedance-2.0";
  dom.resolution.value = "720p";
  dom.ratio.value = "adaptive";
  dom.duration.value = "5";
  dom.mode.value = "text";
  dom.generateAudio.value = "true";
  dom.searchMode.value = "off";
  dom.cameraPreset.value = "auto";
  dom.motionSpeed.value = "steady";
  dom.modeGrid.querySelectorAll(".mode-card").forEach((card) => card.classList.toggle("is-active", card.dataset.mode === "text"));
  dom.sourceImageFile.value = "";
  dom.firstFrameFile.value = "";
  dom.lastFrameFile.value = "";
  dom.imageRefsFile.value = "";
  renderUploadMeta();
  applyModeVisibility();
}

function initModeBinding() {
  dom.mode.addEventListener("change", () => {
    dom.modeGrid.querySelectorAll(".mode-card").forEach((card) => card.classList.toggle("is-active", card.dataset.mode === dom.mode.value));
    renderPromptHelpers();
    applyModeVisibility();
    renderReferencePreview();
  });
  dom.modeGrid.addEventListener("click", (event) => {
    const card = event.target.closest(".mode-card");
    if (!card) return;
    dom.mode.value = card.dataset.mode;
    dom.mode.dispatchEvent(new Event("change"));
  });
}

async function bootstrap() {
  renderModes();
  bindNav();
  initModeBinding();
  bindTaskActions();
  bindImageUploads();

  // Bind all event listeners synchronously first, so they work even if
  // the initial API calls fail (e.g. backend not yet configured).
  dom.cameraPreset.addEventListener("change", renderPromptHelpers);
  dom.motionSpeed.addEventListener("change", renderPromptHelpers);
  dom.searchMode.addEventListener("change", renderPromptHelpers);
  dom.sourceImage.addEventListener("input", renderReferencePreview);
  dom.firstFrame.addEventListener("input", renderReferencePreview);
  dom.lastFrame.addEventListener("input", renderReferencePreview);
  dom.imageRefs.addEventListener("input", renderReferencePreview);

  dom.studioForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const payload = buildPayload();
      if (!payload.model) throw new Error("模型 ID 不能为空。");
      if (!payload.content.length) throw new Error("至少需要提示词或参考素材。");

      setMessage("正在创建任务...");
      const response = await api("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          payload,
          meta: {
            mode: dom.mode.value,
            title: dom.prompt.value.trim().slice(0, 48),
          },
        }),
      });
      renderPreview(response);
      await loadHistory();
      if (response.id) {
        setMessage(`任务 ${response.id} 已创建，开始自动轮询。`);
        await queryTask(response.id, { silent: true });
      }
    } catch (error) {
      setMessage(error.message, "error");
    }
  });

  dom.previewPayload.addEventListener("click", () => {
    try {
      const payload = buildPayload();
      dom.rawResponse.textContent = JSON.stringify(payload, null, 2);
      setMessage("这是即将发送的请求 JSON。");
    } catch (error) {
      setMessage(error.message, "error");
    }
  });

  dom.resetForm.addEventListener("click", resetForm);
  dom.refreshAll.addEventListener("click", () => refreshAll().then(() => setMessage("已刷新。")).catch((error) => setMessage(error.message, "error")));
  dom.refreshHistory.addEventListener("click", () => loadHistory().then(() => setMessage("任务列表已刷新。")).catch((error) => setMessage(error.message, "error")));
  dom.refreshLibrary.addEventListener("click", () => loadLibrary().then(() => setMessage("作品库已刷新。")).catch((error) => setMessage(error.message, "error")));
  dom.queryCurrent.addEventListener("click", () => {
    if (!state.currentTask?.id) {
      setMessage("当前没有任务。", "error");
      return;
    }
    queryTask(state.currentTask.id).catch((error) => setMessage(error.message, "error"));
  });
  dom.saveCurrent.addEventListener("click", () => saveCurrentTask().catch((error) => setMessage(error.message, "error")));
  dom.openCurrentRemote.addEventListener("click", () => {
    const url = state.currentTask?.content?.video_url || state.currentTask?._proxy?.videoUrls?.[0];
    if (!url) {
      setMessage("当前任务还没有远程视频链接。", "error");
      return;
    }
    window.open(url, "_blank", "noreferrer");
  });
  dom.downloadCurrent.addEventListener("click", () => {
    const url = mediaUrl(state.currentTask?.local_asset?.download_url) || state.currentTask?.content?.video_url;
    if (!url) {
      setMessage("当前任务还没有可下载的视频。", "error");
      return;
    }
    window.open(url, "_blank", "noreferrer");
  });

  dom.settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const newBase = (dom.apiBase?.value || "").trim().replace(/\/+$/, "");
      if (newBase !== API_BASE) {
        API_BASE = newBase;
        localStorage.setItem("apiBase", API_BASE);
      }
      const data = await api("/api/session/key", {
        method: "POST",
        body: JSON.stringify({
          apiKey: dom.apiKey.value,
          userId: dom.userId.value.trim(),
          defaultModel: dom.defaultModel.value.trim(),
          autoSave: dom.autoSaveSetting.value === "true",
        }),
      });
      setMessage(data.message || "配置已保存。");
      dom.apiKey.value = "";
      await loadConfig();
    } catch (error) {
      setMessage(error.message, "error");
    }
  });

  dom.openStorage.addEventListener("click", openStorageDirectory);
  dom.openStorageSecondary.addEventListener("click", openStorageDirectory);

  window.addEventListener("beforeunload", stopPolling);

  // Load remote data — errors are non-fatal so the UI stays usable
  // (user can configure backend URL in settings and retry).
  try {
    await loadConfig();
    await loadHistory();
    await loadLibrary();
  } catch (error) {
    setMessage("无法连接后端服务。请在「设置」中填写后端地址后重试。", "error");
    return;
  }
  renderUploadMeta();

  setMessage("控制台已就绪。生成成功的视频会自动进入本地作品库。");
}

bootstrap().catch((error) => setMessage(error.message, "error"));
