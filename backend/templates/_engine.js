// Shared template engine for fine-video-as-code.
//
// Each template imports this and calls `engine.run(data, mount)`.
// It handles:
//   - Reading brand color / accent / font from data.brand and
//     applying them as CSS variables on :root.
//   - Rendering each scene with its voiceover, heading, on-screen
//     text, and any visual_cues (icon / image / chart / code).
//   - Exposing `window.__seek(t_ms)` so the renderer can pause
//     the animation at any time and screenshot — that's what
//     makes the output deterministic.
//   - Setting `window.__renderDone = true` when the seek
//     reaches the end of the timeline (used by the realtime
//     fallback render path).
//
// `mount(els, scene, engine)` is a per-template hook that
// decides how a scene's DOM looks. The engine drives timing;
// the template decides visuals. Templates can use
// `engine.renderIcon(name)`, `engine.renderImage(name)`,
// `engine.renderChart(data)`, and `engine.applyDecoration(el, opts)`
// to compose rich visuals without writing raw SVG each time.

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

  // ── Icon / image / chart cue helpers ───────────────────────
  //
  // Look up a Phosphor icon by name. Returns an SVG element.
  // `window.fineVideoIcons` is loaded from
  // `illustrations/icons.js` (vendored, MIT) before the engine
  // is called. If the icon name is not found, returns a
  // placeholder with the first 2 letters.
  function renderIcon(name, opts = {}) {
    const size = opts.size || 96;
    const color = opts.color || "var(--brand)";
    const wrap = document.createElement("span");
    wrap.className = "icon icon-" + name;
    wrap.style.cssText = `display:inline-flex;align-items:center;justify-content:center;color:${color};width:${size}px;height:${size}px;flex-shrink:0;`;
    const svg = (window.fineVideoIcons || {})[name];
    if (svg) {
      const s = document.createElement("span");
      s.innerHTML = svg;
      const el = s.firstElementChild;
      el.setAttribute("width", String(size));
      el.setAttribute("height", String(size));
      el.style.cssText = `width:${size}px;height:${size}px;fill:currentColor;`;
      wrap.appendChild(el);
    } else {
      wrap.textContent = String(name).slice(0, 2).toUpperCase();
      wrap.style.fontSize = (size * 0.45) + "px";
      wrap.style.fontWeight = "800";
    }
    return wrap;
  }

  // Look up a custom SVG illustration by name. Same registry
  // pattern as icons but for the larger scene-filling
  // illustrations (e.g. "handshake-flow", "encryption-grid").
  // Falls back to a dimmed placeholder box.
  function renderImage(name, opts = {}) {
    const width = opts.width || 600;
    const height = opts.height || 400;
    const svg = (window.fineVideoImages || {})[name];
    const wrap = document.createElement("div");
    wrap.className = "image image-" + name;
    wrap.style.cssText = `display:flex;align-items:center;justify-content:center;width:${width}px;height:${height}px;`;
    if (svg) {
      wrap.innerHTML = svg;
      const el = wrap.firstElementChild;
      el.setAttribute("width", String(width));
      el.setAttribute("height", String(height));
      el.style.cssText = `width:${width}px;height:${height}px;`;
    } else {
      wrap.style.cssText += `border:2px dashed var(--dim);color:var(--dim);font-family:monospace;font-size:24px;`;
      wrap.textContent = `[${name}]`;
    }
    return wrap;
  }

  // Render a horizontal bar chart from {label: value} object.
  // Returns a DOM element. Values are normalised to the max
  // value in the dataset so the longest bar fills the width.
  function renderChart(data, opts = {}) {
    const labels = Object.keys(data);
    if (labels.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "(empty chart)";
      return empty;
    }
    const values = labels.map((k) => Number(data[k]) || 0);
    const max = Math.max(...values, 1);
    const wrap = document.createElement("div");
    wrap.className = "chart";
    wrap.style.cssText = "display:flex;flex-direction:column;gap:14px;width:100%;";
    labels.forEach((label, i) => {
      const v = values[i];
      const pct = (v / max) * 100;
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:18px;";
      const lbl = document.createElement("div");
      lbl.textContent = label;
      lbl.style.cssText = "width:220px;color:var(--dim);font-size:22px;text-align:right;";
      const barBg = document.createElement("div");
      barBg.style.cssText = "flex:1;height:24px;background:#1f2937;border-radius:6px;overflow:hidden;";
      const bar = document.createElement("div");
      bar.style.cssText = `width:${pct}%;height:100%;background:linear-gradient(90deg,var(--brand),var(--accent));transition:width 0.4s;`;
      barBg.appendChild(bar);
      const val = document.createElement("div");
      val.textContent = String(v);
      val.style.cssText = "width:120px;color:var(--accent);font-size:22px;font-weight:700;";
      row.appendChild(lbl);
      row.appendChild(barBg);
      row.appendChild(val);
      wrap.appendChild(row);
    });
    return wrap;
  }

  // Apply a decorative layer to an element. Pure DOM/CSS.
  // opts: { particles: true|{count,colors}, gradient: '...' }
  //
  // Particle positions are derived from the index using a tiny
  // deterministic LCG (linear congruential generator) so two
  // renders of the same scene produce the same pixel layout.
  // Math.random() would make the output non-deterministic.
  function applyDecoration(el, opts = {}) {
    if (opts.gradient) {
      el.style.background = opts.gradient;
    }
    if (opts.particles) {
      const cfg = typeof opts.particles === "object" ? opts.particles : { count: 18 };
      const colors = cfg.colors || ["var(--brand)", "var(--accent)", "#fff"];
      // Seeded PRNG (Numerical Recipes constants).
      let state = 0x12345678;
      const rand = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
      };
      const layer = document.createElement("div");
      layer.className = "particles";
      layer.style.cssText = "position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0;";
      for (let i = 0; i < cfg.count; i++) {
        const dot = document.createElement("div");
        const size = 2 + rand() * 5;
        const color = colors[i % colors.length];
        const x = rand() * 100;
        const y = rand() * 100;
        const dur = 6 + rand() * 8;
        const delay = -rand() * dur;
        const opacity = 0.1 + rand() * 0.4;
        dot.style.cssText = `position:absolute;left:${x}%;top:${y}%;width:${size}px;height:${size}px;border-radius:50%;background:${color};opacity:${opacity};animation:particle-float ${dur}s ${delay}s linear infinite;`;
        layer.appendChild(dot);
      }
      el.appendChild(layer);
    }
    return el;
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
      const name = visualCue.name || c;
      const size = visualCue.size || 240;
      const color = visualCue.color || "var(--brand)";
      const wrap = document.createElement("div");
      wrap.style.cssText = `position:absolute;top:200px;right:200px;`;
      wrap.appendChild(renderIcon(name, { size, color }));
      return wrap.outerHTML;
    }
    if (visualCue.type === "image") {
      const name = visualCue.name || c;
      const width = visualCue.width || 600;
      const height = visualCue.height || 400;
      return renderImage(name, { width, height }).outerHTML;
    }
    if (visualCue.type === "chart" || visualCue.type === "graph") {
      // Two accepted shapes:
      //   chart: { type: "chart", data: { Plan: 1, Pro: 4, Team: 12 } }
      //   chart: { type: "chart", content: "Plan:1;Pro:4;Team:12" }
      let data = visualCue.data;
      if (!data && c) {
        data = Object.fromEntries(
          c.split(/[;\n]/).map((s) => s.trim()).filter(Boolean)
              .map((line) => line.split(/[:=]/).map((x) => x?.trim()))
              .filter((p) => p[0] && p[1] !== undefined)
        );
      }
      if (data && typeof data === "object") {
        const wrap = document.createElement("div");
        wrap.style.cssText = `${wrapperStyle}max-width:1300px;`;
        wrap.appendChild(renderChart(data));
        return wrap.outerHTML;
      }
      return `<div style="${wrapperStyle}">${c}</div>`;
    }
    if (visualCue.type === "code") {
      return `<pre style="${wrapperStyle}white-space:pre-wrap;word-break:break-word;">${c}</pre>`;
    }
    return `<div style="${wrapperStyle}">${c}</div>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  // Inject the @keyframes and shared enrichment CSS used by every
  // template. Idempotent (re-call safe). Called once from init().
  function injectKeyframes() {
    if (document.getElementById("__fv_keyframes")) return;
    const style = document.createElement("style");
    style.id = "__fv_keyframes";
    style.textContent = `
      @keyframes particle-float {
        0%   { transform: translate(0, 0); }
        25%  { transform: translate(20px, -40px); }
        50%  { transform: translate(-10px, -80px); }
        75%  { transform: translate(30px, -40px); }
        100% { transform: translate(0, 0); }
      }
      @keyframes pulse-ring {
        0%   { transform: scale(0.8); opacity: 0.6; }
        100% { transform: scale(1.4); opacity: 0; }
      }
      @keyframes glow {
        0%, 100% { filter: drop-shadow(0 0 8px var(--brand)); }
        50%      { filter: drop-shadow(0 0 24px var(--brand)); }
      }

      /* ─── Enrichment layer ────────────────────────────────────
       * Shared across all 3 templates. Templates call the
       * helpers in _engine.js and the styles below apply.
       * Element opacity / transform is driven by tickEqualizer
       * so deterministic renders (CSS transitions killed) still
       * show motion. */

      /* Top-of-frame HUD */
      .fv-hud {
        position: absolute; top: 0; left: 0; right: 0;
        display: flex; align-items: center; justify-content: space-between;
        padding: 24px 56px; pointer-events: none; z-index: 5;
      }
      .fv-hud-left { display: flex; align-items: center; gap: 10px; }
      .fv-hud-dot {
        width: 10px; height: 10px; border-radius: 50%;
        background: var(--brand);
        box-shadow: 0 0 12px var(--brand);
      }
      .fv-hud-topic {
        font-size: 14px; font-weight: 700; letter-spacing: 0.18em;
        text-transform: uppercase; color: rgba(255,255,255,0.85);
      }
      .fv-hud-right { display: flex; align-items: center; }
      .fv-hud-step {
        font-size: 13px; font-weight: 600; letter-spacing: 0.12em;
        padding: 6px 14px; border-radius: 999px;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.16);
        color: rgba(255,255,255,0.78);
        backdrop-filter: blur(8px);
      }

      /* Bottom-of-frame subtitle bar */
      .fv-subbar {
        position: absolute; bottom: 0; left: 0; right: 0;
        padding: 18px 56px 28px;
        background: linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0));
        z-index: 5;
      }
      .fv-eq {
        display: flex; align-items: flex-end; gap: 4px;
        height: 24px; margin-bottom: 10px;
      }
      .fv-eq-bar {
        display: inline-block; width: 4px;
        background: var(--brand); border-radius: 2px;
        box-shadow: 0 0 8px var(--brand);
      }
      .fv-subbar-text {
        position: relative; font-size: 22px; line-height: 1.4;
        font-weight: 500; color: rgba(255,255,255,0.92);
        max-width: 80%;         /* was 1500px; now % so centre stays clean on any viewport */
        margin: 0 auto;         /* centre horizontally inside full-width subbar */
        text-align: center;     /* wrap-drop text inside the centred block */
      }
      .fv-subbar-progress {
        position: absolute; left: 0; bottom: -8px;
        height: 3px; width: 0%;
        background: var(--brand);
        box-shadow: 0 0 8px var(--brand);
        border-radius: 2px;
      }

      /* Badge + subheading */
      .fv-badge {
        display: inline-block;
        font-size: 13px; font-weight: 700; letter-spacing: 0.22em;
        text-transform: uppercase;
        color: var(--brand);
        padding: 6px 14px;
        border: 1px solid var(--brand);
        border-radius: 999px;
        margin-bottom: 18px;
      }
      .fv-subheading {
        font-size: 24px; line-height: 1.4;
        color: rgba(255,255,255,0.7);
        margin-bottom: 14px;
        max-width: 1200px;
      }

      /* Bullets — anchored at the bottom of the scene so the flex
       column layout above doesn't push them off-canvas. */
      .fv-bullets {
        list-style: none; padding: 0; margin: 0;
        display: flex; flex-direction: column; gap: 8px;
        max-width: 1300px;
        position: absolute;
        bottom: 130px;        /* above the subtitle bar */
        left: 56px; right: 56px;
        max-height: 260px;
        overflow: hidden;
      }
      .fv-bullet {
        display: flex; align-items: center; gap: 12px;
        padding: 8px 14px;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 10px;
        font-size: 18px; font-weight: 500;
        color: rgba(255,255,255,0.92);
        will-change: transform, opacity;
        flex-shrink: 0;
      }
      .fv-bullet-marker {
        width: 8px; height: 8px; border-radius: 50%;
        background: var(--brand);
        flex-shrink: 0;
        box-shadow: 0 0 8px var(--brand);
      }

      /* Metrics row — bottom-centred, above the subtitle bar. */
      .fv-metrics {
        display: grid;
        margin: 0;
        max-width: 1400px;
        gap: 18px;
        position: absolute;
        bottom: 140px;
        left: 50%;
        transform: translateX(-50%);
        width: max-content;
      }
      .fv-metrics-count-1 { grid-template-columns: 1fr; max-width: 480px; }
      .fv-metrics-count-2 { grid-template-columns: 1fr 1fr; max-width: 960px; }
      .fv-metrics-count-3 { grid-template-columns: repeat(3, 1fr); max-width: 1440px; }
      .fv-metrics-count-4 { grid-template-columns: repeat(4, 1fr); max-width: 1500px; }
      .fv-metric {
        padding: 16px 22px;
        background: linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 14px;
        will-change: transform, opacity;
      }
      .fv-metric-value {
        font-size: 40px; font-weight: 800; line-height: 1;
        color: var(--brand);
        letter-spacing: -0.02em;
      }
      .fv-metric-label {
        margin-top: 6px;
        font-size: 12px; font-weight: 600; letter-spacing: 0.14em;
        text-transform: uppercase;
        color: rgba(255,255,255,0.6);
      }

      /* Code snippet — anchored at the bottom of the scene, above
       the subtitle bar. Sized to fit the canvas. */
      .fv-snippet {
        margin: 0;
        background: rgba(0,0,0,0.55);
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 12px;
        overflow: hidden;
        max-width: 1100px;
        font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
        position: absolute;
        bottom: 130px;
        left: 56px;
      }
      .fv-snippet-bar {
        display: flex; align-items: center; gap: 8px;
        padding: 10px 14px;
        background: rgba(255,255,255,0.05);
        border-bottom: 1px solid rgba(255,255,255,0.08);
      }
      .fv-snippet-dot {
        width: 12px; height: 12px; border-radius: 50%;
      }
      .fv-dot-r { background: #ff5f57; }
      .fv-dot-y { background: #febc2e; }
      .fv-dot-g { background: #28c840; }
      .fv-snippet-body {
        margin: 0; padding: 14px 18px;
        font-size: 14px; line-height: 1.5;
        color: rgba(255,255,255,0.92);
        white-space: pre-wrap; word-break: break-word;
        max-height: 240px;
        overflow-y: auto;
      }
      .fv-code-cmd    { color: #82aaff; }
      .fv-code-comment { color: #6b7280; font-style: italic; }
      .fv-code-ok     { color: #4ade80; }
      .fv-code-warn   { color: #fbbf24; }

      /* Diagram — anchored at the bottom of the scene. */
      .fv-diagram {
        margin: 0; max-width: 1400px;
        position: absolute;
        bottom: 140px;
        left: 56px; right: 56px;
      }
      .fv-diag-nodes {
        display: flex; align-items: center; flex-wrap: wrap;
        gap: 4px;
        padding: 14px;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 14px;
      }
      .fv-diag-pill {
        padding: 8px 18px;
        background: var(--brand);
        color: #fff;
        border-radius: 999px;
        font-size: 16px; font-weight: 700;
        will-change: transform, opacity;
      }
      .fv-diag-arrow {
        width: 32px; height: 16px; color: var(--brand); flex-shrink: 0;
      }
      .fv-diag-steps {
        list-style: none; padding: 0; margin: 14px 0 0;
        display: flex; flex-direction: column; gap: 8px;
      }
      .fv-diag-step {
        display: flex; align-items: center; gap: 14px;
        padding: 10px 14px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 10px;
        font-size: 17px;
        will-change: transform, opacity;
      }
      .fv-diag-step-num {
        width: 30px; height: 30px;
        display: inline-flex; align-items: center; justify-content: center;
        background: var(--brand); color: #fff;
        border-radius: 50%;
        font-size: 13px; font-weight: 800;
        flex-shrink: 0;
      }
      .fv-diag-step-text { color: rgba(255,255,255,0.92); }
    `;
    document.head.appendChild(style);
  }

  // Build the per-scene DOM. `mountScene(scene, index, total)` is a
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
  // at 0, scene N starts after scenes 0..N-1 finish.
  function buildTimeline(scenes) {
    let cumulative = 0;
    const intro = 500;
    const outro = 500;
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
      // Drive the per-frame animations that depend on time:
      // equaliser bars + karaoke highlight. Same t_ms → same
      // heights → bit-for-bit deterministic output.
      const activeScene = scenes[activeIdx];
      if (activeScene) {
        tickEqualizer(
          tMs,
          timeline.start[activeIdx],
          activeScene.duration_ms
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

  // For deterministic render: kill every CSS transition AND
  // animation. Transitions are killed so a `__seek(t)` snap
  // takes effect on the very next paint. Animations are killed
  // because they advance on the wall clock (not on `t`), and
  // any frame captured between two wall-clock reads would have
  // a different animation phase on each run. Templates that want
  // visible motion in deterministic renders should bake the
  // motion into the static layout (e.g. decorative arrows),
  // not into @keyframes.
  function freezeTransitions() {
    const style = document.createElement("style");
    style.textContent = "*, *::before, *::after { transition: none !important; animation: none !important; }";
    document.head.appendChild(style);
  }

  // One-time init: inject the keyframes and load icon/image
  // registries (icons.js + images.js) if not already present.
  function init() {
    injectKeyframes();
  }

  // ── Enrichment helpers ────────────────────────────────────
  //
  // All return HTML strings (or DOM nodes) that templates can
  // drop into the scene with stagger via . They are designed to
  // be silent no-ops when their input is empty / undefined, so
  // templates can call them unconditionally — `engine.renderBullets(scene.bullets)`
  // renders nothing when bullets is missing.

  // Top-of-frame HUD: small accent dot + topic title on the left,
  // step counter on the right. Hidden when no topic is provided.
  function renderHUD(meta, sceneIdx, totalScenes) {
    const topic = (meta && (meta.topic || (meta.meta && meta.meta.topic))) || "";
    if (!topic) return "";
    const safe = escapeHtml(topic);
    const idx = (sceneIdx || 0) + 1;
    const tot = totalScenes || 1;
    return `
      <div class="fv-hud">
        <div class="fv-hud-left">
          <span class="fv-hud-dot"></span>
          <span class="fv-hud-topic">${safe}</span>
        </div>
        <div class="fv-hud-right">
          <span class="fv-hud-step">${idx} / ${tot}</span>
        </div>
      </div>
    `;
  }

  // Bottom-of-frame subtitle bar. Voiceover text gets a karaoke
  // highlight that advances left→right through the sentence as
  // tMs progresses. Five equaliser bars animate via
  // tickEqualizer(tMs) — same input → same heights, so the
  // render stays bit-for-bit deterministic.
  function renderSubtitleBar(voiceover, sceneDurationMs) {
    const text = escapeHtml(voiceover || "");
    const bars = [0, 1, 2, 3, 4]
      .map((i) => `<span class="fv-eq-bar" data-eq-i="${i}" style="height:6px"></span>`)
      .join("");
    return `
      <div class="fv-subbar">
        <div class="fv-eq">${bars}</div>
        <div class="fv-subbar-text" data-fv-voiceover="${escapeHtml(voiceover || "")}">
          ${text}
        </div>
        <div class="fv-subbar-progress" data-fv-progress></div>
      </div>
    `;
  }

  // Update the equaliser bars and the karaoke highlight for
  // time tMs inside the active scene (sceneStartMs is the
  // scene's t=0 in the global timeline). Also drives the
  // entrance animation for bullets, metrics and diagram steps.
  // State is set via inline styles so the deterministic render
  // path (which disables all CSS transitions/animations) still
  // produces visible motion.
  function tickEqualizer(tMs, sceneStartMs, sceneDurationMs) {
    const localMs = Math.max(0, Math.min(tMs - sceneStartMs, sceneDurationMs));
    // Equaliser bars
    document.querySelectorAll(".fv-eq-bar").forEach((bar) => {
      const i = Number(bar.dataset.eqI) || 0;
      const phase = (tMs * 0.005 + i * 1.7) % (Math.PI * 2);
      const h = 6 + 16 * Math.abs(Math.sin(phase));
      bar.style.height = `${h.toFixed(1)}px`;
    });
    // Karaoke progress
    const frac = sceneDurationMs > 0 ? Math.min(1, localMs / sceneDurationMs) : 0;
    document.querySelectorAll("[data-fv-progress]").forEach((el) => {
      el.style.width = `${(frac * 100).toFixed(2)}%`;
    });
    // Bullets entrance (180ms stagger, 280ms duration)
    document.querySelectorAll("[data-bullet-i]").forEach((el) => {
      const i = Number(el.dataset.bulletI) || 0;
      const t = localMs - i * 180;
      const k = t <= 0 ? 0 : t >= 280 ? 1 : t / 280;
      const eased = k * (2 - k); // ease-out quad
      el.style.opacity = String(eased.toFixed(3));
      el.style.transform = `translateX(${((1 - eased) * -30).toFixed(1)}px)`;
    });
    // Metrics entrance (140ms stagger, 260ms duration)
    document.querySelectorAll("[data-metric-i]").forEach((el) => {
      const i = Number(el.dataset.metricI) || 0;
      const t = localMs - i * 140;
      const k = t <= 0 ? 0 : t >= 260 ? 1 : t / 260;
      const eased = 1 - Math.pow(1 - k, 3); // ease-out cubic
      el.style.opacity = String(eased.toFixed(3));
      el.style.transform = `translateY(${((1 - eased) * 20).toFixed(1)}px) scale(${(0.85 + 0.15 * eased).toFixed(3)})`;
    });
    // Diagram step entrance (120ms stagger, 240ms duration)
    document.querySelectorAll("[data-diag-step-i]").forEach((el) => {
      const i = Number(el.dataset.diagStepI) || 0;
      const t = localMs - i * 120;
      const k = t <= 0 ? 0 : t >= 240 ? 1 : t / 240;
      el.style.opacity = String(k.toFixed(3));
      el.style.transform = `translateX(${((1 - k) * -20).toFixed(1)}px)`;
    });
    // Diagram pills entrance
    document.querySelectorAll("[data-diag-i]").forEach((el) => {
      const i = Number(el.dataset.diagI) || 0;
      const t = localMs - i * 110;
      const k = t <= 0 ? 0 : t >= 260 ? 1 : t / 260;
      el.style.opacity = String(k.toFixed(3));
      el.style.transform = `scale(${(0.85 + 0.15 * k).toFixed(3)})`;
    });
  }

  // Bullets: ordered list, slide-in from left with 180ms stagger.
  // Visible only when bullets array is non-empty.
  function renderBullets(bullets) {
    if (!bullets || !bullets.length) return "";
    const items = bullets
      .map(
        (b, i) =>
          `<li class="fv-bullet" data-bullet-i="${i}"><span class="fv-bullet-marker"></span><span class="fv-bullet-text">${escapeHtml(
            b
          )}</span></li>`
      )
      .join("");
    return `<ul class="fv-bullets">${items}</ul>`;
  }

  // Metrics: 1–4 stat cards. Each has a value (large) and an
  // optional label (small caps). Falls back to a single card
  // when only one metric is given.
  function renderMetrics(metrics) {
    if (!metrics || !metrics.length) return "";
    const cards = metrics
      .map((m, i) => {
        const v = escapeHtml(m.value || "");
        const l = escapeHtml(m.label || "");
        return `
          <div class="fv-metric" data-metric-i="${i}">
            <div class="fv-metric-value">${v}</div>
            ${l ? `<div class="fv-metric-label">${l}</div>` : ""}
          </div>
        `;
      })
      .join("");
    return `<div class="fv-metrics fv-metrics-count-${Math.min(4, metrics.length)}">${cards}</div>`;
  }

  // Pill rendered just above the heading when scene.badge is set.
  function renderBadge(text) {
    if (!text) return "";
    return `<div class="fv-badge">${escapeHtml(text)}</div>`;
  }

  // Accent subheading rendered just below the heading when
  // scene.subheading is set.
  function renderSubheading(text) {
    if (!text) return "";
    return `<div class="fv-subheading">${escapeHtml(text)}</div>`;
  }

  // Code snippet: terminal-card with red/yellow/green dots
  // header. Highlights simple patterns:
  //   - lines starting with "$ "        → blue
  //   - lines starting with "# "        → grey italic
  //   - lines starting with "✓ " or "OK " → green
  //   - lines starting with "⚠ "        → amber
  // Other lines render plain. No external syntax highlighter.
  function renderCodeSnippet(snippet) {
    if (!snippet) return "";
    const lines = String(snippet)
      .split(/\r?\n/)
      .map((raw) => {
        const safe = escapeHtml(raw);
        if (/^\s*\$\s/.test(raw)) return `<span class="fv-code-cmd">${safe}</span>`;
        if (/^\s*#\s/.test(raw)) return `<span class="fv-code-comment">${safe}</span>`;
        if (/^\s*(✓|OK)\s/.test(raw)) return `<span class="fv-code-ok">${safe}</span>`;
        if (/^\s*⚠\s/.test(raw)) return `<span class="fv-code-warn">${safe}</span>`;
        return `<span>${safe}</span>`;
      })
      .join("\n");
    return `
      <div class="fv-snippet">
        <div class="fv-snippet-bar">
          <span class="fv-snippet-dot fv-dot-r"></span>
          <span class="fv-snippet-dot fv-dot-y"></span>
          <span class="fv-snippet-dot fv-dot-g"></span>
        </div>
        <pre class="fv-snippet-body">${lines}</pre>
      </div>
    `;
  }

  // Diagram: nodes (drawn as pills with SVG arrows between)
  // plus an optional steps list rendered below. Used by
  // tutorial.html when scene.diagram is set.
  function renderDiagram(diagram) {
    if (!diagram) return "";
    const nodes = diagram.nodes || [];
    const steps = diagram.steps || [];
    if (!nodes.length && !steps.length) return "";
    let nodesHtml = "";
    if (nodes.length) {
      const pills = nodes
        .map((n, i) => `<div class="fv-diag-pill" data-diag-i="${i}">${escapeHtml(n)}</div>`)
        .join('<svg class="fv-diag-arrow" viewBox="0 0 32 16" aria-hidden="true"><path d="M2 8 H26 M22 4 L26 8 L22 12" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>');
      nodesHtml = `<div class="fv-diag-nodes">${pills}</div>`;
    }
    let stepsHtml = "";
    if (steps.length) {
      const items = steps
        .map(
          (s, i) =>
            `<li class="fv-diag-step" data-diag-step-i="${i}"><span class="fv-diag-step-num">${String(
              i + 1
            ).padStart(2, "0")}</span><span class="fv-diag-step-text">${escapeHtml(s)}</span></li>`
        )
        .join("");
      stepsHtml = `<ol class="fv-diag-steps">${items}</ol>`;
    }
    return `<div class="fv-diagram">${nodesHtml}${stepsHtml}</div>`;
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
    init,
    // Rich-visual API
    renderIcon,
    renderImage,
    renderChart,
    applyDecoration,
    // Enrichment API (Phase 4 — integrated by templates when fields present)
    renderHUD,
    renderSubtitleBar,
    tickEqualizer,
    renderBullets,
    renderMetrics,
    renderBadge,
    renderSubheading,
    renderCodeSnippet,
    renderDiagram,
  };
})();
