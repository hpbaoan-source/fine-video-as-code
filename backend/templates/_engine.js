// Shared template engine for fine-video-as-code.
//
// Each template imports this and calls `engine.run(data, mount)`.
// It handles:
//   - Reading brand color / accent / font from data.brand and
//     applying them as CSS variables on :root.
//   - Rendering each scene with its voiceover, heading, on-screen
//     text, and any visual_cues (icon / code / chart placeholder).
//   - Exposing `window.__seek(t_ms)` so the renderer can pause
//     the animation at any time and screenshot — that's what
//     makes the output deterministic.
//   - Setting `window.__renderDone = true` when the seek
//     reaches the end of the timeline (used by the realtime
//     fallback render path).
//
// `mount(els, scene)` is a per-template hook that decides how a
// scene's DOM looks. The engine drives the timing; the template
// decides the visual.

window.fineVideoEngine = (() => {
  function applyBrand(brand) {
    if (!brand) return;
    const root = document.documentElement.style;
    if (brand.brandColor) root.setProperty("--brand", brand.brandColor);
    if (brand.accentColor) root.setProperty("--accent", brand.accentColor);
    if (brand.fontFamily) {
      document.body.style.fontFamily = `${brand.fontFamily}, 'Inter', 'Segoe UI', system-ui, sans-serif`;
    }
  }

  // Default per-template visual cue renderer. Templates can
  // override by passing a `cueRenderer(visualCue)` to engine.run.
  function defaultCueRenderer(visualCue) {
    if (!visualCue || !visualCue.type) return "";
    const c = escapeHtml(visualCue.content || "");
    const wrapperStyle = `
      position: absolute;
      bottom: 60px;
      left: 50%;
      transform: translateX(-50%);
      max-width: 1500px;
      background: var(--card, rgba(15,17,21,0.95));
      border: 2px solid var(--brand);
      border-radius: 12px;
      padding: 24px 40px;
      color: var(--text);
      font-size: 32px;
      font-family: 'JetBrains Mono', 'Consolas', monospace;
      line-height: 1.4;
    `;
    if (visualCue.type === "icon") {
      // Render as a single big emoji or first letter, centered.
      return `<div style="position:absolute;top:200px;right:200px;width:240px;height:240px;
        background:var(--brand);border-radius:50%;display:flex;align-items:center;
        justify-content:center;font-size:140px;color:#fff;font-weight:800;">
        ${c.slice(0, 2).toUpperCase()}
      </div>`;
    }
    if (visualCue.type === "code") {
      return `<pre style="${wrapperStyle}white-space:pre-wrap;word-break:break-word;">${c}</pre>`;
    }
    if (visualCue.type === "chart" || visualCue.type === "graph") {
      // Minimalist inline bar chart from a key:value;k:v string.
      const lines = c.split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
      const bars = lines.map((line) => {
        const [label, val] = line.split(/[:=]/).map((s) => s?.trim());
        if (!label || !val) return "";
        return `<div style="display:flex;align-items:center;gap:24px;margin:12px 0;">
          <div style="width:300px;color:var(--dim);font-family:inherit;">${escapeHtml(label)}</div>
          <div style="flex:1;height:30px;background:#374151;border-radius:6px;overflow:hidden;">
            <div style="width:${Math.min(100, parseFloat(val) || 0)}%;height:100%;background:var(--brand);"></div>
          </div>
          <div style="width:120px;color:var(--accent);font-family:inherit;text-align:right;">${escapeHtml(val)}</div>
        </div>`;
      }).join("");
      return `<div style="${wrapperStyle}">${bars || escapeHtml(c)}</div>`;
    }
    // generic text
    return `<div style="${wrapperStyle}">${c}</div>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  // Build the per-scene DOM. `mountScene(scene, index)` is a
  // template-supplied function that returns the inner HTML.
  function buildStage(stageEl, scenes, mountScene) {
    stageEl.innerHTML = "";
    return scenes.map((s, i) => {
      const el = document.createElement("div");
      el.className = "scene scene-" + (i + 1);
      el.dataset.sceneIndex = String(i);
      el.innerHTML = mountScene(s, i, scenes.length);
      stageEl.appendChild(el);
      return el;
    });
  }

  // Compute the time at which each scene starts. Scene 0 starts
  // at 0, scene N starts after scenes 0..N-1 finish. The CSS
  // transition window is 0.5s and overlaps the boundary.
  function buildTimeline(scenes) {
    let cumulative = 0;
    const intro = 500;   // ms — overlap with previous scene
    const outro = 500;   // ms — overlap with next scene
    const start = [];
    for (let i = 0; i < scenes.length; i++) {
      start.push(cumulative);
      cumulative += scenes[i].duration_ms;
    }
    return { start, totalMs: cumulative, intro, outro };
  }

  // Apply the visual state for time `tMs`. Public via
  // window.__seek so the renderer can pause-and-screenshot.
  function makeSeeker(sceneEls, timeline, scenes) {
    return function seek(tMs) {
      // Find the scene whose [start, start+duration] contains t.
      // Adjacent scenes overlap during intro/outro — at t = start[i] + outro
      // both scene[i] and scene[i+1] should be visible. We mark
      // the primary scene as 'active' and the next as 'entering'.
      let activeIdx = 0;
      for (let i = 0; i < timeline.start.length; i++) {
        if (tMs >= timeline.start[i]) activeIdx = i;
        else break;
      }
      for (let i = 0; i < sceneEls.length; i++) {
        const el = sceneEls[i];
        el.classList.toggle("active", i === activeIdx);
        el.classList.toggle(
          "exiting",
          i < activeIdx ||
            (i > activeIdx && i === activeIdx + 1 &&
              tMs < timeline.start[i] + timeline.intro)
        );
        el.classList.toggle(
          "entering",
          i === activeIdx + 1 &&
            tMs < timeline.start[i] + timeline.intro
        );
      }
      return { activeIdx, tMs, totalMs: timeline.totalMs };
    };
  }

  // Realtime fallback: drive the same `seek` from a setInterval.
  function runRealtime(seek, totalMs, onDone) {
    const t0 = performance.now();
    const id = setInterval(() => {
      const t = performance.now() - t0;
      seek(t);
      if (t >= totalMs) {
        clearInterval(id);
        onDone?.();
      }
    }, 30);
    return id;
  }

  // For deterministic render: kill every CSS transition so that
  // a `__seek(t)` snap takes effect immediately and the very next
  // paint frame already shows the post-seek state. Without this,
  // the browser is still mid-transition when the screenshot fires
  // and the captured pixel depends on its animation clock — which
  // varies by a few ms between runs, breaking bit-for-bit
  // reproducibility.
  function freezeTransitions() {
    const style = document.createElement("style");
    style.textContent = "*, *::before, *::after { transition: none !important; animation: none !important; }";
    document.head.appendChild(style);
  }

  return {
    applyBrand,
    buildStage,
    buildTimeline,
    makeSeeker,
    runRealtime,
    defaultCueRenderer,
    escapeHtml,
    freezeTransitions,
  };
})();
