// Shared template engine for fine-video-as-code.
//
// One engine, three templates (tech-explainer / promo / tutorial).
// The engine owns layout, timing and motion; a template only
// supplies colours and typography. That split is what keeps the
// three templates from drifting apart.
//
// What the engine guarantees:
//   • Nothing overlaps. Every block lives in a CSS grid; the
//     subtitle bar reserves its own band at the bottom of the frame.
//   • Nothing overflows. After mount, each scene is measured and
//     scaled down (auto-fit) if its content does not fit the frame.
//   • Motion is a pure function of time. `seek(t)` always produces
//     the same pixels for the same `t`, so a deterministic render is
//     reproducible.
//   • The karaoke caption highlights word by word, timed against
//     the scene's own duration.
//
// The public API (applyBrand, buildStage, buildTimeline, makeSeeker,
// runRealtime, renderHUD, renderSubtitleBar, renderBullets, …) is kept
// stable so the templates keep working.

window.fineVideoEngine = (() => {
  // ── Timing constants ───────────────────────────────────────
  const INTRO_MS = 500; // fade-in of a scene
  const OUTRO_MS = 500; // cross-fade window between two scenes

  // ── Font whitelist ─────────────────────────────────────────
  //
  // `fontFamily` used to be interpolated straight into
  // `document.body.style.fontFamily`, which is a CSS injection
  // hole (`Inter; background-image:url(…)`). Only known families
  // are accepted; anything else is ignored.
  const FONT_WHITELIST = new Set([
    "inter",
    "georgia",
    "roboto",
    "roboto slab",
    "system-ui",
    "arial",
    "helvetica",
    "verdana",
    "times new roman",
    "segoe ui",
    "jetbrains mono",
    "fira code",
    "consolas",
    "menlo",
    "monospace",
    "serif",
    "sans-serif",
  ]);

  // ── Small helpers ──────────────────────────────────────────
  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function easeOutQuad(k) {
    return k * (2 - k);
  }

  function easeOutCubic(k) {
    return 1 - Math.pow(1 - k, 3);
  }

  function easeOutBack(k, s = 1.70158) {
    const t = k - 1;
    return 1 + (s + 1) * Math.pow(t, 3) + s * Math.pow(t, 2);
  }

  // ── Design tokens ──────────────────────────────────────────
  //
  // Mirrors shared/design-tokens.css (the portal reads that file
  // directly). Keep both in sync — backend/tests/tokens.test.js
  // fails the build when they drift.
  const TOKENS = {
    "--fv-bg": "#0a0c10",
    "--fv-bg-elevated": "#11141b",
    "--fv-surface": "rgba(255, 255, 255, 0.04)",
    "--fv-surface-strong": "rgba(255, 255, 255, 0.07)",
    "--fv-border": "rgba(255, 255, 255, 0.10)",
    "--fv-border-strong": "rgba(255, 255, 255, 0.18)",
    "--fv-text": "#ffffff",
    "--fv-text-muted": "rgba(255, 255, 255, 0.70)",
    "--fv-text-faint": "rgba(255, 255, 255, 0.48)",
    "--fv-brand": "#3b82f6",
    "--fv-accent": "#f59e0b",
    "--fv-brand-soft": "rgba(59, 130, 246, 0.16)",
    "--fv-accent-soft": "rgba(245, 158, 11, 0.14)",
    "--fv-ok": "#4ade80",
    "--fv-warn": "#fbbf24",
    "--fv-code-cmd": "#82aaff",
    "--fv-code-comment": "#8b93a7",
    "--fv-space-3": "12px",
    "--fv-space-4": "16px",
    "--fv-space-5": "24px",
    "--fv-space-6": "32px",
    "--fv-space-7": "48px",
    "--fv-safe-x": "64px",
    "--fv-safe-y": "48px",
    "--fv-radius-sm": "6px",
    "--fv-radius-md": "10px",
    "--fv-radius-lg": "14px",
    "--fv-radius-pill": "999px",
    "--fv-font-sans": '"Inter", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif',
    "--fv-font-mono": '"JetBrains Mono", "Fira Code", "DejaVu Sans Mono", Consolas, monospace',
    "--fv-text-xs": "14px",
    "--fv-text-sm": "16px",
    "--fv-text-md": "20px",
    "--fv-text-lg": "26px",
    "--fv-text-xl": "34px",
    "--fv-text-2xl": "44px",
    "--fv-text-3xl": "60px",
    "--fv-text-4xl": "80px",
    "--fv-text-5xl": "96px",
    "--fv-leading-tight": "1.05",
    "--fv-subbar-min": "132px",
  };

  function tokenCss() {
    return Object.entries(TOKENS)
      .map(([k, v]) => `  ${k}: ${v};`)
      .join("\n");
  }

  // ── Layout stylesheet ──────────────────────────────────────
  //
  // Every rule here is layout-critical: the grid keeps the content
  // and the visual side by side, the subbar band is reserved, and
  // the auto-fit transform has a well defined origin.
  const LAYOUT_CSS = `
    :root {
${tokenCss()}
      --brand: var(--fv-brand);
      --accent: var(--fv-accent);
      --text: var(--fv-text);
      --dim: var(--fv-text-muted);
      --bg: var(--fv-bg);
      --card: var(--fv-bg-elevated);
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%; height: 100%;
      background: var(--fv-bg); color: var(--fv-text);
      overflow: hidden;
      font-family: var(--fv-font-sans);
    }
    body { position: relative; }

    .fv-stage { position: absolute; inset: 0; }

    /* One scene fills the frame. The bottom band is reserved for
       the subtitle bar so no content can ever slide under it. */
    .fv-scene {
      position: absolute; inset: 0;
      display: flex; flex-direction: column;
      padding: var(--fv-safe-y) var(--fv-safe-x) calc(var(--fv-subbar-min) + 16px);
      opacity: 0; visibility: hidden; pointer-events: none;
    }
    .fv-scene-grid {
      flex: 1; min-height: 0;
      display: grid; gap: var(--fv-space-7);
      grid-template-columns: 1fr;
      align-content: center; justify-items: center;
    }
    .fv-scene[data-layout="split"] .fv-scene-grid {
      grid-template-columns: 7fr 5fr; align-items: center;
    }
    .fv-scene[data-layout="split"] .fv-col-content { justify-self: start; }
    .fv-scene[data-layout="split"] .fv-col-visual { justify-self: center; }
    .fv-scene[data-layout="stack"] .fv-scene-grid {
      grid-template-rows: auto auto; align-content: center;
    }
    .fv-scene[data-layout="title"] .fv-scene-grid { align-content: center; }

    .fv-col { min-width: 0; max-width: 100%; }
    .fv-col-content {
      display: flex; flex-direction: column; gap: var(--fv-space-4);
      max-width: 1020px;
    }
    .fv-scene[data-layout="title"] .fv-col-content {
      align-items: center; text-align: center; margin: 0 auto;
    }

    .fv-heading {
      font-size: var(--fv-text-5xl); font-weight: 800;
      line-height: var(--fv-leading-tight); letter-spacing: -0.02em;
    }
    .fv-scene[data-layout="title"] .fv-heading { font-size: var(--fv-text-4xl); }
    .fv-subheading {
      font-size: var(--fv-text-lg); color: var(--fv-text-muted);
      line-height: 1.4; max-width: 46ch;
    }
    .fv-scene[data-layout="title"] .fv-subheading { text-align: center; }
    .fv-cue {
      align-self: flex-start;
      display: inline-flex; align-items: center; gap: 8px;
      padding: 6px 14px; border-radius: var(--fv-radius-pill);
      background: var(--fv-brand-soft); border: 1px solid var(--fv-border-strong);
      color: var(--fv-text-muted); font-size: var(--fv-text-sm);
      letter-spacing: 0.02em;
    }
    .fv-scene[data-layout="title"] .fv-cue { align-self: center; }
    .fv-on-screen {
      font-size: var(--fv-text-xl); font-weight: 700; color: var(--fv-brand);
    }
    .fv-scene[data-layout="title"] .fv-on-screen { text-align: center; }

    .fv-bullets { list-style: none; display: flex; flex-direction: column; gap: var(--fv-space-3); }
    .fv-bullet { display: flex; gap: 14px; align-items: flex-start; font-size: var(--fv-text-lg); line-height: 1.35; }
    .fv-bullet-marker {
      width: 10px; height: 10px; margin-top: 13px; flex: none;
      border-radius: 50%; background: var(--fv-brand);
      box-shadow: 0 0 12px var(--fv-brand-soft);
    }
    .fv-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: var(--fv-space-4); }
    .fv-metric {
      background: var(--fv-surface); border: 1px solid var(--fv-border);
      border-radius: var(--fv-radius-md); padding: var(--fv-space-4) var(--fv-space-5);
    }
    .fv-metric-value { font-size: var(--fv-text-3xl); font-weight: 800; color: var(--fv-brand); line-height: 1.05; }
    .fv-metric-label {
      margin-top: 6px; font-size: var(--fv-text-xs); text-transform: uppercase;
      letter-spacing: 0.12em; color: var(--fv-text-faint);
    }

    .fv-snippet {
      background: #0d1117; border: 1px solid var(--fv-border);
      border-radius: var(--fv-radius-md); overflow: hidden; max-width: 100%;
    }
    .fv-snippet-bar { display: flex; gap: 8px; padding: 10px 14px; background: rgba(255,255,255,0.04); }
    .fv-snippet-dot { width: 11px; height: 11px; border-radius: 50%; }
    .fv-dot-r { background: #ff5f57; } .fv-dot-y { background: #febc2e; } .fv-dot-g { background: #28c840; }
    .fv-snippet-body {
      font-family: var(--fv-font-mono); font-size: var(--fv-text-sm); line-height: 1.6;
      padding: 16px 20px; white-space: pre; overflow: hidden; color: var(--fv-text-muted);
    }
    .fv-code-cmd { color: var(--fv-code-cmd); }
    .fv-code-comment { color: var(--fv-code-comment); font-style: italic; }
    .fv-code-ok { color: var(--fv-code-ok); }
    .fv-code-warn { color: var(--fv-warn); }

    .fv-diagram { display: flex; flex-direction: column; gap: var(--fv-space-4); max-width: 100%; }
    .fv-diag-nodes { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .fv-diag-pill {
      padding: 10px 18px; border-radius: var(--fv-radius-pill);
      background: var(--fv-brand-soft); border: 1px solid var(--fv-border-strong);
      font-size: var(--fv-text-md); white-space: nowrap;
    }
    .fv-diag-arrow { width: 32px; height: 16px; color: var(--fv-text-faint); flex: none; }
    .fv-diag-steps { list-style: none; display: flex; flex-direction: column; gap: 10px; }
    .fv-diag-step { display: flex; gap: 14px; align-items: flex-start; font-size: var(--fv-text-md); line-height: 1.35; }
    .fv-diag-step-num { font-family: var(--fv-font-mono); color: var(--fv-accent); font-size: var(--fv-text-sm); padding-top: 3px; }
    .fv-diag-step-text { color: var(--fv-text-muted); }

    .fv-hero { display: flex; align-items: center; justify-content: center; }
    .fv-hero-icon {
      display: flex; align-items: center; justify-content: center;
      border-radius: 50%;
      background: radial-gradient(circle, var(--fv-brand-soft) 0%, transparent 70%);
    }
    .fv-cue-slot { max-width: 100%; }

    .fv-hud {
      position: absolute; top: var(--fv-safe-y); left: var(--fv-safe-x); right: var(--fv-safe-x);
      display: flex; justify-content: space-between; align-items: center;
      font-size: var(--fv-text-xs); letter-spacing: 0.18em; text-transform: uppercase;
      color: var(--fv-text-faint);
    }
    .fv-hud-left { display: flex; align-items: center; gap: 10px; }
    .fv-hud-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--fv-accent); }
    .fv-hud-step { font-family: var(--fv-font-mono); color: var(--fv-text-muted); }

    .fv-subbar {
      position: absolute; left: 0; right: 0; bottom: 0;
      min-height: var(--fv-subbar-min);
      display: flex; align-items: center; gap: 20px;
      padding: 20px var(--fv-safe-x) 28px;
      background: linear-gradient(180deg, rgba(10,12,16,0) 0%, rgba(10,12,16,0.92) 42%);
    }
    .fv-eq { display: flex; align-items: flex-end; gap: 4px; height: 26px; flex: none; }
    .fv-eq-bar { width: 4px; border-radius: 2px; background: var(--fv-brand); }
    .fv-subbar-text { flex: 1; font-size: var(--fv-text-md); line-height: 1.45; color: var(--fv-text-muted); }
    .fv-kw { color: var(--fv-text-faint); transition: color 120ms linear; }
    .fv-kw-done { color: var(--fv-text-muted); }
    .fv-kw-now { color: var(--fv-brand); font-weight: 700; }
    .fv-subbar-progress {
      position: absolute; left: 0; bottom: 0; height: 3px; width: 0;
      background: linear-gradient(90deg, var(--fv-brand), var(--fv-accent));
    }

    .particles { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 0; }
    .icon { display: inline-flex; align-items: center; justify-content: center; }
    .chart { display: flex; flex-direction: column; gap: 14px; width: 100%; }

    @media (orientation: portrait) {
      :root {
        --fv-safe-x: 48px;
        --fv-safe-y: 80px;
        --fv-subbar-min: 240px;
        --fv-text-5xl: 72px;
        --fv-text-4xl: 56px;
        --fv-text-3xl: 44px;
        --fv-text-2xl: 36px;
        --fv-text-xl: 30px;
        --fv-text-lg: 24px;
      }
      .fv-scene {
        perspective: 1200px;
      }
      .fv-scene-grid {
        gap: var(--fv-space-6);
        transform-style: preserve-3d;
      }
      .fv-scene[data-layout="split"] .fv-scene-grid {
        grid-template-columns: 1fr;
        grid-template-rows: auto auto;
        gap: var(--fv-space-6);
      }
      .fv-scene[data-layout="split"] .fv-col-visual {
        order: -1;
        justify-self: center;
      }
      .fv-scene[data-layout="split"] .fv-col-content {
        justify-self: center;
        align-items: center;
        text-align: center;
      }
      .fv-scene[data-layout="split"] .fv-cue {
        align-self: center;
      }
      .fv-scene[data-layout="split"] .fv-subheading {
        text-align: center;
      }
      .fv-col-content {
        max-width: 960px;
      }
      .fv-subbar {
        min-height: var(--fv-subbar-min);
        padding: 24px var(--fv-safe-x) 120px;
        background: linear-gradient(180deg, rgba(10,12,16,0) 0%, rgba(10,12,16,0.92) 28%, rgba(10,12,16,0.98) 100%);
        backdrop-filter: blur(12px);
      }
      .fv-subbar-text {
        font-size: var(--fv-text-lg);
        line-height: 1.45;
        text-align: center;
      }
      .fv-subbar-progress {
        bottom: 96px;
      }
      .fv-bullets {
        gap: var(--fv-space-4);
      }
      .fv-bullet {
        font-size: var(--fv-text-lg);
      }
      .fv-metrics {
        grid-template-columns: 1fr;
        width: 100%;
        max-width: 600px;
      }
      .fv-metric {
        text-align: center;
      }
    }
  `;

  // ── Brand ──────────────────────────────────────────────────
  //
  // Brand colour and accent are applied as CSS custom properties
  // so a template can restyle itself without touching the DOM.
  function applyBrand(brand) {
    if (!brand) return;
    const root = document.documentElement.style;
    if (brand.brandColor && /^#[0-9a-f]{3,8}$/i.test(brand.brandColor)) {
      root.setProperty("--fv-brand", brand.brandColor);
      root.setProperty("--brand", brand.brandColor);
    }
    if (brand.accentColor && /^#[0-9a-f]{3,8}$/i.test(brand.accentColor)) {
      root.setProperty("--fv-accent", brand.accentColor);
      root.setProperty("--accent", brand.accentColor);
    }
    if (brand.fontFamily) {
      const wanted = String(brand.fontFamily).replace(/['"]/g, "").trim().toLowerCase();
      if (FONT_WHITELIST.has(wanted)) {
        document.body.style.fontFamily = `${brand.fontFamily}, var(--fv-font-sans)`;
      }
    }
  }

  // ── Icon / image / chart helpers ───────────────────────────
  //
  // Icons come from the vendored Phosphor registry
  // (illustrations/icons.js, MIT) which the template loads before
  // the engine runs. Unknown names fall back to a text badge so a
  // missing icon never breaks a render.
  function renderIcon(name, opts = {}) {
    const size = opts.size || 96;
    const color = opts.color || "var(--fv-brand)";
    const wrap = document.createElement("span");
    wrap.className = "icon icon-" + name;
    wrap.setAttribute("aria-hidden", "true");
    wrap.style.cssText = `display:inline-flex;align-items:center;justify-content:center;color:${color};width:${size}px;height:${size}px;flex-shrink:0;`;
    const svg = (window.fineVideoIcons || {})[name];
    if (svg) {
      const holder = document.createElement("span");
      holder.innerHTML = svg;
      const el = holder.firstElementChild;
      el.setAttribute("width", String(size));
      el.setAttribute("height", String(size));
      el.style.cssText = `width:${size}px;height:${size}px;fill:currentColor;`;
      wrap.appendChild(el);
    } else {
      wrap.textContent = String(name).slice(0, 2).toUpperCase();
      wrap.style.fontSize = Math.round(size * 0.45) + "px";
      wrap.style.fontWeight = "800";
    }
    return wrap;
  }

  // Large scene illustrations. Same registry pattern as the icons
  // but for full-panel artwork.
  function renderImage(name, opts = {}) {
    const width = opts.width || 600;
    const height = opts.height || 400;
    const svg = (window.fineVideoImages || {})[name];
    const wrap = document.createElement("div");
    wrap.className = "image image-" + name;
    if (svg) {
      wrap.innerHTML = svg;
      const el = wrap.firstElementChild;
      el.setAttribute("width", String(width));
      el.setAttribute("height", String(height));
      el.style.cssText = `width:${width}px;height:${height}px;`;
    } else {
      wrap.style.cssText = `display:flex;align-items:center;justify-content:center;width:${width}px;height:${height}px;border:2px dashed var(--fv-border-strong);color:var(--fv-text-faint);font-family:var(--fv-font-mono);font-size:24px;`;
      wrap.textContent = `[${name}]`;
    }
    return wrap;
  }

  // Horizontal bar chart from a { label: value } object. Values are
  // normalised against the largest one.
  //
  // opts.max     — fixed scale maximum (use when several charts
  //                must be comparable, e.g. a benchmark series)
  // opts.unit    — suffix printed after every value ("%", " ms")
  // opts.labelWidth — width of the label column in px
  function renderChart(data, opts = {}) {
    const labels = Object.keys(data || {});
    if (!labels.length) return document.createElement("div");
    const values = labels.map((k) => Number(data[k]) || 0);
    const fixedMax = Number(opts.max);
    const max = fixedMax > 0 ? fixedMax : Math.max(...values, 1);
    const unit = opts.unit ? String(opts.unit) : "";
    const labelWidth = Number(opts.labelWidth) > 0 ? Number(opts.labelWidth) : 200;
    const wrap = document.createElement("div");
    wrap.className = "chart";
    wrap.style.cssText = "display:flex;flex-direction:column;gap:14px;width:100%;";
    labels.forEach((label, i) => {
      const pct = Math.max(0, Math.min(100, (values[i] / max) * 100));
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:18px;";
      const lbl = document.createElement("div");
      lbl.textContent = label;
      lbl.style.cssText = `width:${labelWidth}px;color:var(--fv-text-muted);font-size:20px;text-align:right;`;
      const bg = document.createElement("div");
      bg.style.cssText = "flex:1;height:22px;background:rgba(255,255,255,0.06);border-radius:6px;overflow:hidden;";
      const bar = document.createElement("div");
      bar.style.cssText = `width:${pct.toFixed(1)}%;height:100%;background:linear-gradient(90deg,var(--fv-brand),var(--fv-accent));`;
      bg.appendChild(bar);
      const val = document.createElement("div");
      val.textContent = `${values[i]}${unit}`;
      val.style.cssText = "width:110px;color:var(--fv-accent);font-size:20px;font-weight:700;";
      row.appendChild(lbl);
      row.appendChild(bg);
      row.appendChild(val);
      wrap.appendChild(row);
    });
    return wrap;
  }

  // Decorative particles. Positions come from a seeded LCG, never
  // Math.random(), so two renders of the same scene are identical.
  function applyDecoration(el, opts = {}) {
    if (opts.gradient) el.style.background = opts.gradient;
    if (opts.particles) {
      const cfg = typeof opts.particles === "object" ? opts.particles : { count: 18 };
      const colors = cfg.colors || ["var(--fv-brand)", "var(--fv-accent)", "#fff"];
      let state = 0x12345678;
      const rand = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
      };
      const layer = document.createElement("div");
      layer.className = "particles";
      for (let i = 0; i < cfg.count; i++) {
        const dot = document.createElement("div");
        const size = 2 + rand() * 5;
        const x = rand() * 100;
        const y = rand() * 100;
        const opacity = 0.1 + rand() * 0.35;
        dot.style.cssText = `position:absolute;left:${x}%;top:${y}%;width:${size}px;height:${size}px;border-radius:50%;background:${colors[i % colors.length]};opacity:${opacity};`;
        layer.appendChild(dot);
      }
      el.appendChild(layer);
    }
    return el;
  }

  // Non-icon visual cues (chart / image / text) rendered into the
  // visual column of a scene.
  function renderCueSlot(scene) {
    const cues = (scene && scene.visual_cues) || [];
    const cue = cues.find((c) => c && c.type && c.type !== "icon");
    if (!cue) return "";
    if (cue.type === "chart" || cue.type === "graph") {
      let data = cue.data;
      if (!data && cue.content) {
        data = Object.fromEntries(
          String(cue.content)
            .split(/[;\n]/)
            .map((s) => s.trim())
            .filter(Boolean)
            .map((line) => line.split(/[:=]/).map((x) => (x || "").trim()))
            .filter((p) => p[0] && p[1] !== undefined)
        );
      }
      if (!data || typeof data !== "object") return "";
      const host = document.createElement("div");
      host.className = "fv-cue-slot";
      host.appendChild(renderChart(data, { max: cue.max, unit: cue.unit }));
      return host.outerHTML;
    }
    if (cue.type === "image") {
      const host = document.createElement("div");
      host.className = "fv-cue-slot";
      host.appendChild(renderImage(cue.name || cue.content || "image", { width: 620, height: 420 }));
      return host.outerHTML;
    }
    return "";
  }

  // ── Layout decision ────────────────────────────────────────
  //
  // The server normally fills scene.layout (see
  // backend/lib/design-system.js). This fallback keeps hand-made
  // templates working when the field is missing.
  function deriveLayout(scene) {
    const cues = (scene && scene.visual_cues) || [];
    const hasHero = cues.some((c) => c && (c.type === "icon" || c.type === "image"));
    const hasBody = Boolean(
      (scene.bullets && scene.bullets.length) ||
        (scene.metrics && scene.metrics.length) ||
        scene.codeSnippet ||
        (scene.diagram && ((scene.diagram.nodes || []).length || (scene.diagram.steps || []).length))
    );
    if (hasBody && hasHero) return "split";
    if (hasBody) return "stack";
    return "title";
  }

  // ── Enrichment renderers ───────────────────────────────────
  //
  // Every one of them is a no-op when its input is empty, so a
  // template can call them unconditionally.

  // Small pill above the heading.
  function renderBadge(text) {
    if (!text) return "";
    return `<div class="fv-badge">${escapeHtml(text)}</div>`;
  }

  // Caption under the heading: "what you are looking at".
  function renderCue(text) {
    if (!text) return "";
    return `<div class="fv-cue"><span class="fv-cue-dot"></span>${escapeHtml(text)}</div>`;
  }

  function renderSubheading(text) {
    if (!text) return "";
    return `<p class="fv-subheading">${escapeHtml(text)}</p>`;
  }

  // Bullets: one line each, marker dot on the left.
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

  // Metric cards: big value, small label.
  function renderMetrics(metrics) {
    if (!metrics || !metrics.length) return "";
    const cards = metrics
      .map((m, i) => {
        const v = escapeHtml(m.value || "");
        const l = escapeHtml(m.label || "");
        return `<div class="fv-metric" data-metric-i="${i}">
            <div class="fv-metric-value">${v}</div>
            ${l ? `<div class="fv-metric-label">${l}</div>` : ""}
          </div>`;
      })
      .join("");
    return `<div class="fv-metrics fv-metrics-count-${Math.min(4, metrics.length)}">${cards}</div>`;
  }

  // Terminal card. A tiny hand-rolled highlighter: shell prompts,
  // comments, OK markers and warnings get their own colour.
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
    return `<div class="fv-snippet">
        <div class="fv-snippet-bar">
          <span class="fv-snippet-dot fv-dot-r"></span>
          <span class="fv-snippet-dot fv-dot-y"></span>
          <span class="fv-snippet-dot fv-dot-g"></span>
        </div>
        <pre class="fv-snippet-body">${lines}</pre>
      </div>`;
  }

  // Diagram: a row of pills joined by arrows, plus optional steps.
  function renderDiagram(diagram) {
    if (!diagram) return "";
    const nodes = diagram.nodes || [];
    const steps = diagram.steps || [];
    if (!nodes.length && !steps.length) return "";
    let nodesHtml = "";
    if (nodes.length) {
      const pills = nodes
        .map((n, i) => `<div class="fv-diag-pill" data-diag-i="${i}">${escapeHtml(n)}</div>`)
        .join(
          '<svg class="fv-diag-arrow" viewBox="0 0 32 16" aria-hidden="true"><path d="M2 8 H26 M22 4 L26 8 L22 12" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        );
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

  // ── Subtitle bar with karaoke caption ──────────────────────
  //
  // Every word gets its own time window, derived from the scene
  // duration and the relative length of the words. The highlight
  // therefore advances in step with the voiceover instead of
  // sliding a progress bar under the text.
  function renderSubtitleBar(voiceover, sceneDurationMs) {
    const raw = String(voiceover || "").trim();
    const duration = Math.max(1, Number(sceneDurationMs) || 1);
    const words = raw ? raw.split(/\s+/).filter(Boolean) : [];
    const totalWeight = words.reduce((a, w) => a + w.length + 1, 0) || 1;
    let acc = 0;
    const spans = words
      .map((w) => {
        const start = (acc / totalWeight) * duration;
        acc += w.length + 1;
        const end = (acc / totalWeight) * duration;
        return `<span class="fv-kw" data-kw-start="${start.toFixed(1)}" data-kw-end="${end.toFixed(1)}">${escapeHtml(
          w
        )}</span>`;
      })
      .join(" ");
    const bars = [0, 1, 2, 3, 4]
      .map((i) => `<span class="fv-eq-bar" data-eq-i="${i}" style="height:6px"></span>`)
      .join("");
    return `<div class="fv-subbar" aria-live="polite">
        <div class="fv-eq">${bars}</div>
        <div class="fv-subbar-text">${spans}</div>
        <div class="fv-subbar-progress" data-fv-progress></div>
      </div>`;
  }

  // Top-of-frame HUD: topic on the left, scene counter on the right.
  function renderHUD(meta, sceneIdx, totalScenes) {
    const topic = (meta && (meta.topic || (meta.meta && meta.meta.topic))) || "";
    if (!topic) return "";
    const idx = (sceneIdx || 0) + 1;
    const tot = totalScenes || 1;
    return `<div class="fv-hud">
        <div class="fv-hud-left"><span class="fv-hud-dot"></span><span class="fv-hud-topic">${escapeHtml(topic)}</span></div>
        <div class="fv-hud-right"><span class="fv-hud-step">${String(idx).padStart(2, "0")} / ${String(tot).padStart(
        2,
        "0"
      )}</span></div>
      </div>`;
  }

  // ── Scene composition ──────────────────────────────────────
  //
  // Builds the grid: content on the left, visual on the right
  // (layout "split"), everything stacked for "stack", one centred
  // column for "title".
  function renderScene(scene, index, total, opts = {}) {
    const s = scene || {};
    const layout = ["title", "split", "stack"].includes(s.layout) ? s.layout : deriveLayout(s);
    const cues = s.visual_cues || [];
    const iconCue = cues.find((c) => c && c.type === "icon");
    const heroSize = opts.heroSize || (layout === "title" ? 200 : 168);
    const visual = [];

    if (opts.visualHtml !== undefined) {
      if (opts.visualHtml) visual.push(opts.visualHtml);
    } else if (iconCue) {
      const holder = document.createElement("div");
      holder.appendChild(renderIcon(iconCue.name || "lightbulb", { size: heroSize }));
      visual.push(`<div class="fv-hero"><div class="fv-hero-icon">${holder.innerHTML}</div></div>`);
    }
    const cueSlot = renderCueSlot(s);
    if (cueSlot) visual.push(cueSlot);

    const content = [
      renderBadge(s.badge),
      `<h2 class="fv-heading">${escapeHtml(s.heading || "")}</h2>`,
      renderSubheading(s.subheading),
      renderCue(s.visual_cue),
      s.on_screen_text ? `<p class="fv-on-screen">${escapeHtml(s.on_screen_text)}</p>` : "",
      renderBullets(s.bullets),
      renderMetrics(s.metrics),
      renderCodeSnippet(s.codeSnippet),
      renderDiagram(s.diagram),
    ]
      .filter(Boolean)
      .join("\n        ");

    const visualHtml = visual.length
      ? `\n        <div class="fv-col fv-col-visual" data-fit>${visual.join("\n        ")}</div>`
      : "";

    return `${opts.meta ? renderHUD(opts.meta, index, total) : ""}
      <div class="fv-scene-grid" data-layout="${layout}">
        <div class="fv-col fv-col-content" data-fit>
        ${content}
        </div>${visualHtml}
      </div>
      ${renderSubtitleBar(s.voiceover, s.duration_ms)}`;
  }

  // ── Stage construction ─────────────────────────────────────
  //
  // Creates one .fv-scene element per scene, measures it and
  // caches the animated nodes so the per-frame tick never has to
  // query the whole document.
  function buildStage(stageEl, scenes, mountScene) {
    stageEl.innerHTML = "";
    const els = scenes.map((s, i) => {
      const el = document.createElement("div");
      el.className = "fv-scene";
      el.dataset.sceneIndex = String(i);
      el.dataset.layout = ["title", "split", "stack"].includes(s.layout) ? s.layout : deriveLayout(s);
      el.innerHTML = mountScene(s, i, scenes.length);
      stageEl.appendChild(el);
      return el;
    });
    fitScenes(els);
    cacheSceneNodes(els);
    return els;
  }

  // Auto-fit: when a scene carries more content than the frame can
  // hold, scale the whole grid down instead of letting the text run
  // off the canvas. The scale is a measurement, so it is stable
  // across renders.
  function fitScenes(sceneEls) {
    for (const el of sceneEls) {
      const grid = el.querySelector(".fv-scene-grid");
      if (!grid) continue;
      grid.style.transform = "";
      const columns = Array.from(el.querySelectorAll("[data-fit]"));
      let needH = 0;
      let needW = 0;
      for (const col of columns) {
        needH = Math.max(needH, col.scrollHeight);
        needW = Math.max(needW, col.scrollWidth);
      }
      const availH = grid.clientHeight;
      const availW = grid.clientWidth;
      if (!availH || !availW || !needH) continue;
      const scale = Math.min(1, availH / needH, availW / needW);
      el.__fv_baseScale = scale < 0.995 ? scale : 1;
      if (scale < 0.995) {
        grid.style.transform = `scale(${scale.toFixed(4)})`;
        grid.style.transformOrigin = "center center";
      }
    }
  }

  // Cache the nodes that move, per scene. Without this the tick
  // would run four document-wide queries per frame.
  function cacheSceneNodes(sceneEls) {
    for (const el of sceneEls) {
      const metricNodes = Array.from(el.querySelectorAll("[data-metric-i]"));
      el.__fv = {
        grid: el.querySelector(".fv-scene-grid"),
        eq: Array.from(el.querySelectorAll(".fv-eq-bar")),
        progress: Array.from(el.querySelectorAll("[data-fv-progress]")),
        words: Array.from(el.querySelectorAll("[data-kw-start]")),
        bullets: Array.from(el.querySelectorAll("[data-bullet-i]")),
        metrics: metricNodes,
        metricValues: metricNodes.map((m) => {
          const valEl = m.querySelector(".fv-metric-value");
          const raw = valEl ? valEl.textContent.trim() : "";
          const match = raw.match(/^([0-9.,]+)(.*)$/);
          if (match && !raw.includes("/")) {
            const num = Number.parseInt(match[1].replace(/[.,]/g, ""), 10);
            return Number.isFinite(num) && num > 100
              ? { el: valEl, original: raw, num, suffix: match[2] }
              : null;
          }
          return null;
        }),
        diagSteps: Array.from(el.querySelectorAll("[data-diag-step-i]")),
        diagPills: Array.from(el.querySelectorAll("[data-diag-i]")),
        subbar: el.querySelector(".fv-subbar"),
      };
    }
  }

  // ── Timeline ───────────────────────────────────────────────
  //
  // Scene 0 starts at 0, scene N starts when scene N-1 ends. The
  // intro/outro windows describe the cross-fade between two
  // scenes; they do not change the total duration.
  function buildTimeline(scenes) {
    let cumulative = 0;
    const start = [];
    for (let i = 0; i < scenes.length; i++) {
      start.push(cumulative);
      cumulative += scenes[i].duration_ms || 0;
    }
    return { start, totalMs: cumulative, intro: INTRO_MS, outro: OUTRO_MS };
  }

  // ── Per-frame animation ────────────────────────────────────
  //
  // Pure function of (localMs, durationMs): the same timestamp
  // always produces the same pixels.
  function tickScene(el, localMs, durationMs) {
    const cache = el.__fv;
    if (!cache) return;
    const local = clamp(localMs, 0, durationMs || 0);
    const frac = durationMs > 0 ? clamp(local / durationMs, 0, 1) : 0;

    // Continuous 2.5D Camera subtle push-in & entrance 3D tilt
    if (cache.grid) {
      const base = el.__fv_baseScale || 1;
      const zoom = base * (1 + 0.03 * frac);
      const enterK = clamp(local / 500, 0, 1);
      const tilt = (1 - easeOutCubic(enterK)) * 3.5;
      cache.grid.style.transform = `scale(${zoom.toFixed(4)}) rotateX(${tilt.toFixed(2)}deg)`;
      cache.grid.style.transformOrigin = "center center";
    }

    // Equaliser bars
    for (const bar of cache.eq) {
      const i = Number(bar.dataset.eqI) || 0;
      const phase = (local * 0.005 + i * 1.7) % (Math.PI * 2);
      const h = 6 + 16 * Math.abs(Math.sin(phase));
      bar.style.height = `${h.toFixed(1)}px`;
    }

    // Karaoke: light up the word being spoken.
    for (const w of cache.words) {
      const start = Number(w.dataset.kwStart) || 0;
      const end = Number(w.dataset.kwEnd) || 0;
      w.classList.toggle("fv-kw-now", local >= start && local < end);
      w.classList.toggle("fv-kw-done", local >= end);
    }

    // Progress line under the caption
    for (const p of cache.progress) p.style.width = `${(frac * 100).toFixed(2)}%`;

    // Bullets: 180ms stagger, 300ms duration, ease-out back spring
    for (const b of cache.bullets) {
      const i = Number(b.dataset.bulletI) || 0;
      const t = local - i * 180;
      const k = t <= 0 ? 0 : t >= 300 ? 1 : t / 300;
      const eased = easeOutBack(k);
      b.style.opacity = clamp(k * 1.4, 0, 1).toFixed(3);
      b.style.transform = `translateX(${((1 - eased) * -28).toFixed(1)}px) scale(${(0.92 + 0.08 * eased).toFixed(3)})`;
    }

    // Metrics: 140ms stagger, 280ms duration, ease-out back spring + counter roll
    for (let mi = 0; mi < cache.metrics.length; mi++) {
      const m = cache.metrics[mi];
      const i = Number(m.dataset.metricI) || mi;
      const t = local - i * 140;
      const k = t <= 0 ? 0 : t >= 280 ? 1 : t / 280;
      const eased = easeOutBack(k);
      m.style.opacity = clamp(k * 1.4, 0, 1).toFixed(3);
      m.style.transform = `translateY(${((1 - eased) * 22).toFixed(1)}px) scale(${(0.88 + 0.12 * eased).toFixed(3)})`;

      const mv = cache.metricValues ? cache.metricValues[mi] : null;
      if (mv && mv.el) {
        const countK = easeOutCubic(clamp(local / 900, 0, 1));
        const cur = Math.round(mv.num * countK);
        mv.el.textContent = `${cur.toLocaleString("vi-VN")}${mv.suffix}`;
      }
    }

    // Diagram steps: 120ms stagger, 240ms duration.
    for (const s of cache.diagSteps) {
      const i = Number(s.dataset.diagStepI) || 0;
      const t = local - i * 120;
      const k = t <= 0 ? 0 : t >= 240 ? 1 : t / 240;
      s.style.opacity = k.toFixed(3);
      s.style.transform = `translateX(${((1 - k) * -20).toFixed(1)}px)`;
    }

    // Diagram pills: 110ms stagger, 260ms duration.
    for (const p of cache.diagPills) {
      const i = Number(p.dataset.diagI) || 0;
      const t = local - i * 110;
      const k = t <= 0 ? 0 : t >= 260 ? 1 : t / 260;
      p.style.opacity = k.toFixed(3);
      p.style.transform = `scale(${(0.85 + 0.15 * k).toFixed(3)})`;
    }
  }

  // ── Seeker ─────────────────────────────────────────────────
  //
  // `seek(t)` sets the whole frame state for time t: which scene is
  // on screen, how opaque it is, and how far its animations have
  // progressed.
  function makeSeeker(sceneEls, timeline, scenes) {
    return function seek(tMs) {
      let activeIdx = 0;
      for (let i = 0; i < timeline.start.length; i++) {
        if (tMs >= timeline.start[i]) activeIdx = i;
        else break;
      }
      for (let i = 0; i < sceneEls.length; i++) {
        const el = sceneEls[i];
        const local = tMs - timeline.start[i];
        const dur = scenes[i].duration_ms || 0;
        let opacity = 0;
        let state = "";
        if (local < 0) {
          // Pre-roll: the next scene fades in over the last
          // OUTRO_MS of the previous one.
          if (i > 0 && local > -OUTRO_MS) {
            opacity = (local + OUTRO_MS) / OUTRO_MS;
            state = "entering";
          }
        } else if (local < dur) {
          if (local < INTRO_MS) {
            opacity = local / INTRO_MS;
            state = "entering";
          } else if (local > dur - OUTRO_MS) {
            opacity = 1 - (local - (dur - OUTRO_MS)) / OUTRO_MS;
            state = "exiting";
          } else {
            opacity = 1;
            state = "active";
          }
        }
        el.style.opacity = opacity.toFixed(3);
        el.style.visibility = opacity > 0.002 ? "visible" : "hidden";
        el.classList.toggle("active", state === "active" || state === "entering");
        el.classList.toggle("entering", state === "entering");
        el.classList.toggle("exiting", state === "exiting");
        // The caption belongs to the scene being spoken: only one
        // subtitle bar is ever readable.
        if (el.__fv && el.__fv.subbar) {
          el.__fv.subbar.style.opacity = i === activeIdx ? "1" : "0";
        }
      }
      const active = scenes[activeIdx];
      if (active && sceneEls[activeIdx]) {
        tickScene(sceneEls[activeIdx], tMs - timeline.start[activeIdx], active.duration_ms || 0);
      }
      return { activeIdx, tMs, totalMs: timeline.totalMs };
    };
  }

  // ── Realtime playback ──────────────────────────────────────
  //
  // The renderer records the wall-clock offset of the first frame
  // in window.__t0_offset_ms. It used to be written when the video
  // ended, which pushed the audio past the end of the picture.
  function runRealtime(seek, totalMs, onDone) {
    const t0 = performance.now();
    let firstFrame = true;
    const id = setInterval(() => {
      const t = performance.now() - t0;
      if (firstFrame) {
        firstFrame = false;
        window.__t0_offset_ms = t;
      }
      seek(t);
      if (t >= totalMs) {
        clearInterval(id);
        onDone?.();
      }
    }, 30);
    return id;
  }

  // For deterministic renders: kill every CSS transition and
  // animation so a `seek(t)` lands exactly on the frame we want.
  function freezeTransitions() {
    const style = document.createElement("style");
    style.textContent = "*, *::before, *::after { transition: none !important; animation: none !important; }";
    document.head.appendChild(style);
  }

  // ── Init ───────────────────────────────────────────────────
  const EXTRA_CSS = `
    .fv-badge {
      align-self: flex-start; display: inline-flex; align-items: center;
      padding: 6px 14px; border-radius: var(--fv-radius-pill);
      background: var(--fv-accent-soft); border: 1px solid var(--fv-border-strong);
      color: var(--fv-text-muted); font-size: var(--fv-text-xs);
      font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase;
    }
    .fv-scene[data-layout="title"] .fv-badge { align-self: center; }
    .fv-cue-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--fv-brand); }
    .fv-image { display: flex; align-items: center; justify-content: center; }
  `;

  function init() {
    if (document.getElementById("fv-engine-styles")) return;
    const style = document.createElement("style");
    style.id = "fv-engine-styles";
    style.textContent = LAYOUT_CSS + EXTRA_CSS;
    document.head.appendChild(style);
  }

  // ── Public API ─────────────────────────────────────────────
  return {
    applyBrand,
    buildStage,
    buildTimeline,
    makeSeeker,
    runRealtime,
    freezeTransitions,
    init,
    fitScenes,
    deriveLayout,
    renderScene,
    renderIcon,
    renderImage,
    renderChart,
    applyDecoration,
    renderCueSlot,
    escapeHtml,
    // Enrichment API
    renderHUD,
    renderSubtitleBar,
    renderBadge,
    renderCue,
    renderSubheading,
    renderBullets,
    renderMetrics,
    renderCodeSnippet,
    renderDiagram,
  };
})();
