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

  // Inject the @keyframes used by decoration (particles).
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
    // New rich-visual API
    renderIcon,
    renderImage,
    renderChart,
    applyDecoration,
  };
})();
