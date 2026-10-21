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

// ─── Health check ───────────────────────────────────────
async function checkHealth() {
  try {
    const r = await fetch("/health");
    const data = await r.json();
    $("#health-dot").classList.replace("bg-gray-600", "bg-green-500");
    $("#health-text").textContent = `v${data.version} · ${data.phase}`;
  } catch (e) {
    $("#health-dot").classList.replace("bg-gray-600", "bg-red-500");
    $("#health-text").textContent = "server offline";
  }
}
checkHealth();

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

// ─── Duration label ─────────────────────────────────────
$("#duration").addEventListener("input", (e) => {
  $("#duration-val").textContent = e.target.value;
});

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
