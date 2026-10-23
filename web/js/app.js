// ──────────────────────────────────────────────────────────────
// fine-video-as-code — frontend client
// ──────────────────────────────────────────────────────────────
// 1. Health check on load
// 2. Populate voice dropdown based on language
// 3. Form submit → POST /api/generate → get jobId
// 4. EventSource to /api/status/:jobId for SSE
// 5. Render progress, log, result, error
// ──────────────────────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ─── Health & LLM Status check ──────────────────────────
async function checkHealth() {
  try {
    const r = await fetch("/health");
    const data = await r.json();
    $("#health-dot").className = "inline-block w-2 h-2 rounded-full bg-green-500";
    $("#health-text").textContent = `v${data.version} · ${data.phase}`;
  } catch (e) {
    $("#health-dot").className = "inline-block w-2 h-2 rounded-full bg-red-500";
    $("#health-text").textContent = "server offline";
  }
}

let lastLlmStatus = null;

function renderLlmStatusUI(data) {
  lastLlmStatus = data;
  const badge = $("#llm-badge");
  const dot = $("#llm-dot");
  const text = $("#llm-text");
  const bTitle = $("#llm-banner-title");
  const bDesc = $("#llm-banner-desc");
  const banner = $("#llm-banner");
  if (!badge || !dot || !text) return;

  const srcBadge = data.source === "memory" ? "RAM" : ".env";
  if (data.valid && data.status === "ready") {
    badge.className =
      "flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 cursor-pointer hover:border-emerald-400 transition";
    dot.className = "inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]";
    text.textContent = `AI LLM Active (${data.model} · ${srcBadge})`;
    if (banner && bTitle && bDesc) {
      banner.className =
        "px-4 py-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-400/60 cursor-pointer transition text-xs max-w-sm";
      bTitle.className = "font-semibold text-emerald-300";
      bTitle.textContent = `🟢 Key/Token LLM hợp lệ (${data.model} · ${srcBadge})`;
      bDesc.textContent = `AI tự động lọc nội dung & chia scene (${data.provider}). Nhấn vào đây để đổi Key tạm thời.`;
    }
  } else if (data.configured && data.status === "invalid") {
    badge.className =
      "flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/40 text-red-300 cursor-pointer hover:border-red-400 transition";
    dot.className = "inline-block w-2.5 h-2.5 rounded-full bg-red-400";
    text.textContent = `LLM Key Error (${srcBadge}) · Nhấn để sửa`;
    if (banner && bTitle && bDesc) {
      banner.className =
        "px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/5 hover:border-red-400/60 cursor-pointer transition text-xs max-w-sm";
      bTitle.className = "font-semibold text-red-300";
      bTitle.textContent = `🔴 Key/Token LLM lỗi hoặc mất kết nối (${srcBadge})`;
      bDesc.textContent = `${data.message || "Lỗi kết nối"}. Nhấn vào đây để nhập lại Key/URL tạm thời.`;
    }
  } else {
    badge.className =
      "flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/40 text-amber-300 cursor-pointer hover:border-amber-400 transition";
    dot.className = "inline-block w-2.5 h-2.5 rounded-full bg-amber-400";
    text.textContent = "Template Mode · Nhấn để thêm Key LLM";
    if (banner && bTitle && bDesc) {
      banner.className =
        "px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/5 hover:border-amber-400/60 cursor-pointer transition text-xs max-w-sm";
      bTitle.className = "font-semibold text-amber-300";
      bTitle.textContent = "🟡 Chế độ Template (Chưa có Key LLM)";
      bDesc.textContent = "Nhấn vào đây để nhập Key & URL LLM dùng tạm thời (chỉ lưu RAM, không lưu .env).";
    }
  }
}

async function checkLlmStatus(force = false) {
  const text = $("#llm-text");
  if (text) text.textContent = "Checking LLM…";
  try {
    const r = await fetch(force ? "/api/llm-status?force=1" : "/api/llm-status");
    const data = await r.json();
    renderLlmStatusUI(data);
  } catch (e) {
    const dot = $("#llm-dot");
    if (dot) dot.className = "inline-block w-2 h-2 rounded-full bg-gray-500";
    if (text) text.textContent = "LLM status unknown";
  }
}

// ─── LLM Config Popup Modal (RAM-only) ──────────────────
function openLlmModal() {
  const modal = $("#llm-modal");
  if (!modal) return;
  $("#llm-input-url").value = lastLlmStatus?.baseUrl || "https://api.minimax.io/v1";
  $("#llm-input-model").value = lastLlmStatus?.model || "MiniMax-M3";
  $("#llm-input-key").value = "";
  const fb = $("#llm-modal-feedback");
  if (fb) fb.className = "hidden";
  modal.classList.remove("hidden");
  $("#llm-input-key").focus();
}

function closeLlmModal() {
  const modal = $("#llm-modal");
  if (modal) modal.classList.add("hidden");
}

function showModalFeedback(msg, type = "info") {
  const fb = $("#llm-modal-feedback");
  if (!fb) return;
  if (type === "ok") {
    fb.className = "px-3 py-2 rounded-lg text-xs bg-emerald-500/15 border border-emerald-500/40 text-emerald-300";
  } else if (type === "err") {
    fb.className = "px-3 py-2 rounded-lg text-xs bg-red-500/15 border border-red-500/40 text-red-300";
  } else {
    fb.className = "px-3 py-2 rounded-lg text-xs bg-blue-500/15 border border-blue-500/40 text-blue-300";
  }
  fb.textContent = msg;
}

const recheckBtn = $("#llm-recheck-btn");
if (recheckBtn) {
  recheckBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    checkLlmStatus(true);
  });
}
$("#llm-badge")?.addEventListener("click", openLlmModal);
$("#llm-banner")?.addEventListener("click", openLlmModal);
$("#llm-modal-close")?.addEventListener("click", closeLlmModal);
$("#llm-cancel-btn")?.addEventListener("click", closeLlmModal);
$("#llm-modal")?.addEventListener("click", (e) => {
  if (e.target.id === "llm-modal") closeLlmModal();
});
$("#llm-preset-provider")?.addEventListener("change", (e) => {
  if (!e.target.value) return;
  const [url, model] = e.target.value.split("|");
  if (url) $("#llm-input-url").value = url;
  if (model) $("#llm-input-model").value = model;
});

$("#llm-save-btn")?.addEventListener("click", async () => {
  const baseUrl = $("#llm-input-url").value.trim();
  const model = $("#llm-input-model").value.trim();
  const apiKey = $("#llm-input-key").value.trim();
  if (!apiKey) {
    showModalFeedback("⚠️ Vui lòng nhập API Key / Token.", "err");
    return;
  }
  const btn = $("#llm-save-btn");
  btn.disabled = true;
  btn.textContent = "Đang kiểm tra…";
  showModalFeedback("⏳ Đang kiểm tra kết nối tới LLM endpoint…", "info");
  try {
    const r = await fetch("/api/llm-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseUrl, model, apiKey }),
    });
    const data = await r.json();
    renderLlmStatusUI(data);
    if (data.valid) {
      showModalFeedback(`✅ Kết nối thành công (${data.model} · chỉ lưu trên RAM)!`, "ok");
      setTimeout(closeLlmModal, 900);
    } else {
      showModalFeedback(`❌ ${data.message || "Key hoặc URL không hợp lệ"}`, "err");
    }
  } catch (err) {
    showModalFeedback(`❌ Lỗi kết nối: ${err.message}`, "err");
  } finally {
    btn.disabled = false;
    btn.textContent = "Lưu tạm & Kiểm tra";
  }
});

$("#llm-clear-btn")?.addEventListener("click", async () => {
  try {
    const r = await fetch("/api/llm-config", { method: "DELETE" });
    const data = await r.json();
    renderLlmStatusUI(data);
    showModalFeedback("Đã xóa Key tạm trên RAM (chuyển về cấu hình .env hoặc Template).", "info");
    setTimeout(closeLlmModal, 800);
  } catch (err) {
    showModalFeedback(`Lỗi: ${err.message}`, "err");
  }
});

checkHealth();
checkLlmStatus();

// ─── Voice dropdown ─────────────────────────────────────
//
// The list comes from the server (`GET /api/voices`) so the form can
// never offer a voice the backend rejects. The labels below are only
// cosmetics — an unknown id falls back to the raw id.
const VOICE_LABELS = {
  "vi-VN-HoaiMyNeural": "Hoài My (female)",
  "vi-VN-NamMinhNeural": "Nam Minh (male)",
  "en-US-AriaNeural": "Aria (female, US)",
  "en-US-GuyNeural": "Guy (male, US)",
  "en-US-JennyNeural": "Jenny (female, US)",
  "en-US-DavisNeural": "Davis (male, US)",
};
let VOICES = { vi: [], en: [] };

async function loadVoices() {
  try {
    const r = await fetch("/api/voices");
    if (!r.ok) return;
    const data = await r.json();
    const list = data.voices || data;
    if (list && list.vi && list.en) {
      VOICES = { vi: list.vi, en: list.en };
      updateVoices();
    }
  } catch (e) {
    // Offline / old server — the dropdown simply stays empty and the
    // user picks nothing; the request then fails with a clear 400.
  }
}

function updateVoices() {
  const lang = $("#language").value;
  const voiceSel = $("#voice");
  voiceSel.innerHTML = "";
  for (const id of VOICES[lang] || []) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = VOICE_LABELS[id] || id;
    voiceSel.appendChild(opt);
  }
}
$("#language").addEventListener("change", updateVoices);
updateVoices();
loadVoices();

// ─── Duration & Topic char counter ──────────────────────
$("#duration").addEventListener("input", (e) => {
  $("#duration-val").textContent = e.target.value;
});
const topicEl = $("#topic");
const topicCountEl = $("#topic-count");
if (topicEl && topicCountEl) {
  topicEl.addEventListener("input", () => {
    topicCountEl.textContent = `${topicEl.value.length} / 15000`;
  });
}

// ─── Preset scripts ─────────────────────────────────────
//
// The curated scripts in `samples/` come with their own template,
// language and voice. Picking one overrides those fields — a
// Vietnamese script narrated by an English voice is a bug waiting
// to happen.
let PRESETS = [];

async function loadPresets() {
  const sel = $("#preset-script");
  if (!sel) return;
  try {
    const r = await fetch("/api/presets");
    if (!r.ok) return;
    const data = await r.json();
    PRESETS = data.presets || [];
    for (const p of PRESETS) {
      const opt = document.createElement("option");
      opt.value = p.path;
      opt.textContent = `${p.id} · ${p.template || "?"} · ${p.scenes} scenes · ${Math.round((p.duration_ms || 0) / 1000)}s`;
      sel.appendChild(opt);
    }
  } catch (e) {
    // No catalogue — the form still works with a topic.
  }
}

function applyPreset(path) {
  const topic = $("#topic");
  const preset = PRESETS.find((p) => p.path === path);
  if (!preset) {
    topic.required = true;
    return;
  }
  topic.required = false;
  topic.placeholder = "Using the preset script — the topic is ignored";
  if (preset.template) $("[name=template]").value = preset.template;
  if (preset.language) {
    $("#language").value = preset.language;
    updateVoices();
  }
  if (preset.voice) $("#voice").value = preset.voice;
  const secs = Math.round((preset.duration_ms || 0) / 1000);
  if (secs >= 15) {
    const slider = $("#duration");
    slider.value = String(Math.min(180, secs));
    $("#duration-val").textContent = slider.value;
  }
}

const presetSel = $("#preset-script");
if (presetSel) {
  presetSel.addEventListener("change", (e) => applyPreset(e.target.value));
}
loadPresets();

// ─── State management ───────────────────────────────────
function showView(name) {
  for (const v of ["form-view", "progress-view", "result-view", "error-view"]) {
    $("#" + v).classList.toggle("hidden", v !== name + "-view");
  }
}

function resetSteps() {
  const steps = $$(".step");
  steps.forEach((step, i) => {
    step.querySelector(".step-icon").textContent = String(i + 1);
    step.querySelector(".step-icon").className = "step-icon w-6 h-6 rounded-full border-2 border-gray-700 flex items-center justify-center text-xs";
    step.querySelector(".step-bar").style.width = "0%";
    step.querySelector(".step-log").textContent = "";
    step.querySelector(".step-pct").textContent = "";
  });
  $("#log-panel").innerHTML = "";
}

function appendLog(msg) {
  const el = document.createElement("div");
  const t = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  el.textContent = `[${t}] ${msg}`;
  $("#log-panel").appendChild(el);
  $("#log-panel").scrollTop = $("#log-panel").scrollHeight;
}

function setStepStatus(stepId, status, log, pct) {
  const el = document.querySelector(`.step[data-step="${stepId}"]`);
  if (!el) return;
  const icon = el.querySelector(".step-icon");
  if (status === "running") {
    icon.className = "step-icon w-6 h-6 rounded-full border-2 border-blue-500 bg-blue-500/20 flex items-center justify-center text-xs text-blue-300";
  } else if (status === "done") {
    icon.textContent = "✓";
    icon.className = "step-icon w-6 h-6 rounded-full border-2 border-green-500 bg-green-500/20 flex items-center justify-center text-xs text-green-300";
  } else if (status === "error") {
    icon.textContent = "✕";
    icon.className = "step-icon w-6 h-6 rounded-full border-2 border-red-500 bg-red-500/20 flex items-center justify-center text-xs text-red-300";
  }
  if (log) el.querySelector(".step-log").textContent = log;
  if (typeof pct === "number" && !isNaN(pct)) {
    el.querySelector(".step-bar").style.width = pct + "%";
    el.querySelector(".step-pct").textContent = Math.round(pct) + "%";
  }
}

// ─── Form submit ────────────────────────────────────────
$("#gen-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  // Convert types
  data.duration = Number(data.duration);
  data.fps = Number(data.fps);
  data.maxScenes = Number(data.maxScenes);
  // Remove empty filename
  if (!data.outputFilename) delete data.outputFilename;
  // An empty preset means "no preset" — the schema rejects "".
  if (!data.presetScript) delete data.presetScript;

  $("#submit-btn").disabled = true;
  $("#submit-btn").textContent = "Submitting…";
  resetSteps();
  showView("progress");
  $("#job-id").textContent = "submitting…";

  let res;
  try {
    res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch (err) {
    return showError(`Network error: ${err.message}`);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return showError(err.error || `HTTP ${res.status}`);
  }
  const job = await res.json();
  $("#job-id").textContent = job.jobId;
  streamJob(job.jobId);
});

function showError(msg) {
  $("#submit-btn").disabled = false;
  $("#submit-btn").textContent = "Generate video";
  $("#error-msg").textContent = msg;
  showView("error");
}

// ─── SSE stream ──────────────────────────────────────────
function streamJob(jobId) {
  const es = new EventSource(`/api/status/${jobId}`);
  let currentStep = null;

  es.onmessage = (e) => {
    let ev;
    try { ev = JSON.parse(e.data); } catch (err) { return; }
    handleEvent(ev);
  };
  es.onerror = () => {
    appendLog("⚠️ connection lost");
  };

  function handleEvent(ev) {
    switch (ev.type) {
      case "step-start":
        currentStep = ev.step;
        setStepStatus(ev.step, "running", ev.name);
        appendLog(`▶ ${ev.name}`);
        break;
      case "step-progress":
        if (ev.percent != null && currentStep) {
          setStepStatus(currentStep, "running", null, ev.percent);
        }
        break;
      case "step-done":
        if (ev.step) setStepStatus(ev.step, "done", `done (${ev.meta?.sceneCount || ev.meta?.totalMs || ev.meta?.count || ev.meta?.size || "ok"})`, 100);
        break;
      case "log":
        appendLog(ev.message);
        if (currentStep) {
          const el = document.querySelector(`.step[data-step="${currentStep}"] .step-log`);
          if (el && ev.message) el.textContent = ev.message.slice(0, 80);
        }
        break;
      case "complete":
        for (const step of $$(".step")) {
          setStepStatus(step.dataset.step, "done", null, 100);
        }
        appendLog(`✅ complete: ${ev.filename} (${(ev.size / 1024).toFixed(1)} KB)`);
        $("#result-meta").textContent = `${ev.filename} · ${(ev.size / 1024 / 1024).toFixed(2)} MB · ${(ev.duration_ms / 1000).toFixed(0)}s`;
        $("#download-link").href = ev.downloadUrl;
        $("#download-link").download = ev.filename;
        showView("result");
        es.close();
        break;
      case "error":
        showError(ev.message || "Unknown error");
        es.close();
        break;
    }
  }
}

// ─── Result actions ─────────────────────────────────────
$("#new-btn").addEventListener("click", () => {
  $("#submit-btn").disabled = false;
  $("#submit-btn").textContent = "Generate video";
  showView("form");
});
$("#retry-btn").addEventListener("click", () => {
  $("#submit-btn").disabled = false;
  $("#submit-btn").textContent = "Generate video";
  showView("form");
});
$("#cancel-btn").addEventListener("click", () => {
  $("#submit-btn").disabled = false;
  $("#submit-btn").textContent = "Generate video";
  showView("form");
});
