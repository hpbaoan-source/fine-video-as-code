// ──────────────────────────────────────────────────────────────
// Step 1 — Scripting (template + AI hybrid)
// ──────────────────────────────────────────────────────────────
// Output: ScriptSchema (see backend/lib/schema.js)
//   { template, language, total_duration_ms,
//     scenes: [{ id, voiceover, duration_ms (initial estimate),
//                visual_cues: [{type, content, position, animation}],
//                on_screen_text? }] }
//
// Strategy: pick a template's structure (3 built-in), then
// optionally rewrite the voiceover text with the configured LLM
// for naturalness. If no LLM is configured, fall back to
// template-only.
// ──────────────────────────────────────────────────────────────

import path from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { ScriptSchema } from "../lib/schema.js";
import { normalizeTemplate } from "../lib/design-system.js";
import { resolveInside } from "../lib/path-guard.js";
import { complete } from "../lib/llm-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Preset scripts are user-supplied paths. Only files that live
// inside the repository's `samples/` directory may be read —
// anything else (absolute paths, `../../etc/passwd`) is rejected.
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PRESET_ROOT = path.join(REPO_ROOT, "samples");

// Scene duration bounds — mirrors SceneSchema in lib/schema.js.
export const MIN_SCENE_DURATION_MS = 500;
export const MAX_SCENE_DURATION_MS = 30000;

// Hard ceiling on the number of scenes a script may contain
// (mirrors ScriptSchema.scenes.max).
export const MAX_SCENES = 20;

// Estimate TTS duration. Vietnamese TTS runs ~900-1000 characters
// per minute at natural pace; English is ~150-160 words per minute.
// These are estimates only — step 2 measures the actual MP3 length
// with ffmpeg and overwrites scene.duration_ms to match.
const CHARS_PER_MINUTE_VI = 950;  // Vietnamese TTS chars/min
const WPM_EN = 155;                // English TTS words/min

function estimateDurationMs(text, language) {
  if (language === "vi") {
    return Math.round((text.length / CHARS_PER_MINUTE_VI) * 60 * 1000);
  }
  // very rough word counter
  const words = text.split(/\s+/).length;
  return Math.round((words / WPM_EN) * 60 * 1000);
}

// ─── Built-in templates ────────────────────────────────────
const TEMPLATES = {
  "tech-explainer": {
    pattern: [
      { role: "hook",  intent: "Ask a question that creates curiosity" },
      { role: "problem", intent: "Describe the pain point the audience feels" },
      { role: "concept", intent: "Introduce the core idea in plain language" },
      { role: "deep-dive", intent: "Explain the mechanism with 2-3 specific details" },
      { role: "example", intent: "Concrete example showing the idea in action" },
      { role: "outro", intent: "Recap + a clear next step the viewer can take" },
    ],
    visualMix: ["text", "icon", "chart", "code"],
  },
  "promo": {
    pattern: [
      { role: "hook",     intent: "Bold claim or striking question (3s max)" },
      { role: "pain",     intent: "Show the frustration the product solves" },
      { role: "solution", intent: "Reveal the product as the answer" },
      { role: "features", intent: "3 quick benefits with one word each" },
      { role: "cta",      intent: "Strong call to action with offer" },
    ],
    visualMix: ["text", "shape", "icon"],
  },
  "tutorial": {
    pattern: [
      { role: "intro",     intent: "What we'll cover + why it matters" },
      { role: "step-1",    intent: "First concrete action with screen context" },
      { role: "step-2",    intent: "Second action building on step 1" },
      { role: "step-3",    intent: "Third action with tip/trick" },
      { role: "step-4",    intent: "Fourth action if needed" },
      { role: "verify",    intent: "How to know it worked" },
      { role: "outro",     intent: "Recap + pointer to docs or next tutorial" },
    ],
    visualMix: ["text", "code", "icon"],
  },
};

// Trim a template pattern down to `max` scenes. The last role
// (outro / cta / recap) is always kept — dropping it would leave
// the video without a closing beat.
export function capPattern(pattern, max) {
  const n = Array.isArray(pattern) ? pattern.length : 0;
  if (!max || max >= n || max < 2) return pattern;
  return [...pattern.slice(0, max - 1), pattern[n - 1]];
}

function buildTemplateScript(input) {
  const tmpl = TEMPLATES[input.template];
  const pattern = capPattern(tmpl.pattern, input.maxScenes);

  // Per-scene text length, then estimated duration. Don't divide
  // the target total evenly — short hook lines and longer deep-dives
  // have very different TTS runtimes.
  const scenes = pattern.map((p, i) => {
    const voiceover = generateVoiceoverForRole(input, p);
    const illustration = generateIllustrationForRole(input, p);
    return {
      id: `scene-${i + 1}`,
      voiceover,
      duration_ms: estimateDurationMs(voiceover, input.language),
      visual_cues: generateVisualCuesForRole(input, p, i, pattern.length, tmpl.visualMix),
      on_screen_text: deriveOnScreenText(voiceover, input.language),
      ...illustration,
      // The scene's structural role ("hook", "deep-dive", …).
      // Used as the LLM hint; stripped by ScriptSchema.parse.
      role_hint: p.role,
    };
  });

  return {
    template: input.template,
    language: input.language,
    total_duration_ms: scenes.reduce((s, x) => s + x.duration_ms, 0),
    scenes,
    meta: {
      generated_by: "template",
      generated_at: new Date().toISOString(),
      topic: input.topic,
    },
  };
}

function generateVoiceoverForRole(input, p) {
  const { topic, language } = input;

  if (language === "vi") {
    if (p.role === "hook") return `${topic}? Bạn đã bao giờ tự hỏi điều này thực sự hoạt động như thế nào chưa?`;
    if (p.role === "problem") return `Hầu hết chúng ta đều gặp khó khăn khi tìm hiểu ${topic} một cách bài bản.`;
    if (p.role === "concept") return `Về bản chất, ${topic} là một hệ thống gồm 3 thành phần chính hoạt động cùng nhau.`;
    if (p.role === "deep-dive") return `Thành phần đầu tiên xử lý dữ liệu đầu vào, thành phần thứ hai chuyển đổi, và thành phần cuối trả về kết quả.`;
    if (p.role === "example") return `Một ví dụ thực tế: khi bạn gửi một yêu cầu, hệ thống sẽ xử lý và phản hồi trong vòng vài giây.`;
    if (p.role === "outro") return `Tóm lại, hiểu được ${topic} sẽ giúp bạn làm việc hiệu quả hơn rất nhiều. Hãy bắt đầu ngay hôm nay.`;
    if (p.role === "pain") return `Bạn đang chán ngán với việc phải chuyển qua lại giữa hàng chục công cụ khác nhau mỗi ngày?`;
    if (p.role === "solution") return `Đã có một giải pháp giúp bạn tập trung — một không gian làm việc thống nhất.`;
    if (p.role === "features") return `Cộng tác thời gian thực, tích hợp đa nền tảng, và di động mọi lúc mọi nơi.`;
    if (p.role === "cta") return `Dùng thử miễn phí 14 ngày — không cần thẻ tín dụng.`;
    if (p.role === "intro") return `Hôm nay mình sẽ hướng dẫn bạn cách sử dụng ${topic} từ A đến Z, chỉ trong vài phút.`;
    if (p.role === "step-1") return `Bước đầu tiên, mở ứng dụng lên và đăng nhập vào tài khoản của bạn.`;
    if (p.role === "step-2") return `Tiếp theo, tìm mục cài đặt ở góc trên bên phải và nhấn vào đó.`;
    if (p.role === "step-3") return `Trong phần cài đặt, bạn sẽ thấy tùy chọn thông báo — hãy bật nó lên để không bỏ lỡ cập nhật.`;
    if (p.role === "step-4") return `Cuối cùng, lưu lại thay đổi và đăng xuất một lần để áp dụng.`;
    if (p.role === "verify") return `Để kiểm tra, bạn sẽ thấy biểu tượng thông báo xuất hiện ở thanh trên cùng.`;
    return `Đó là tất cả những gì bạn cần biết về ${topic}.`;
  } else {
    if (p.role === "hook") return `What is ${topic}, and how does it actually work?`;
    if (p.role === "problem") return `Most of us struggle to understand ${topic} in a structured way.`;
    if (p.role === "concept") return `At its core, ${topic} is a system of three main parts working together.`;
    if (p.role === "deep-dive") return `The first part handles the input, the second transforms it, and the third returns the result.`;
    if (p.role === "example") return `A real example: when you send a request, the system processes and responds in seconds.`;
    if (p.role === "outro") return `In short, understanding ${topic} will make you far more effective. Start today.`;
    if (p.role === "pain") return `Tired of jumping between ten different tools every single day?`;
    if (p.role === "solution") return `There's a better way — one unified workspace that brings everything together.`;
    if (p.role === "features") return `Real-time collaboration, deep integrations, and full mobile support.`;
    if (p.role === "cta") return `Try it free for 14 days — no credit card required.`;
    if (p.role === "intro") return `Today I'll walk you through ${topic} from A to Z, in just a few minutes.`;
    if (p.role === "step-1") return `First, open the app and sign in to your account.`;
    if (p.role === "step-2") return `Next, find Settings in the top-right corner and click it.`;
    if (p.role === "step-3") return `Inside Settings, you'll see Notifications — turn that on so you never miss an update.`;
    if (p.role === "step-4") return `Finally, save your changes and log out once to apply them.`;
    if (p.role === "verify") return `To verify, you'll see a bell icon appear in the top bar.`;
    return `That's everything you need to know about ${topic}.`;
  }
}

function generateVisualCuesForRole(input, p, idx, total, visualMix) {
  // Pick 1-2 visual cues per scene, varying the type
  const cues = [];
  const primary = visualMix[idx % visualMix.length];
  cues.push({
    type: primary,
    content: p.intent,
    position: "center",
    animation: idx === 0 ? "fade" : (idx % 2 === 0 ? "slide-up" : "zoom"),
  });
  // The topic banner belongs to the first and the last scene.
  // `total` is the *number of scenes* — comparing the scene index
  // with the length of the intent string only ever tagged scene 1.
  if (idx === 0 || idx === total - 1) {
    cues.push({
      type: "text",
      content: input.topic,
      position: "top",
      animation: "fade",
    });
  }
  return cues;
}

function generateIllustrationForRole(input, p) {
  const isVi = input.language === "vi";
  if (p.role === "concept" || p.role === "solution") {
    return {
      flowArchitecture: {
        title: isVi ? `Kiến trúc ${input.topic}` : `${input.topic} Architecture`,
        badge: "LIVE DATA FLOW",
        sources: [
          { icon: "📱", label: "Client", sub: "Input" },
          { icon: "🖥️", label: "Service", sub: "Producer" },
        ],
        center: {
          icon: "⚡",
          title: input.topic.slice(0, 28),
          partitions: ["P0", "P1", "P2"],
          cells: 10,
          sub: isVi ? "Xử lý luồng dữ liệu thời gian thực" : "Real-time stream processing",
        },
        targets: [
          { icon: "⚙️", label: "Worker", sub: "Consumer" },
          { icon: "📊", label: "Output", sub: "Result" },
        ],
      },
    };
  }
  if (p.role === "deep-dive" || p.role === "step-2") {
    return {
      sequenceFlow: {
        title: isVi ? "Luồng tương tác chi tiết" : "Protocol Sequence Flow",
        actors: [
          { icon: "💻", label: "Client", sub: "Sender" },
          { icon: "🛡️", label: "Core Engine", sub: "Processor" },
        ],
        messages: [
          { from: 0, to: 1, tag: "REQ", label: isVi ? "Gửi yêu cầu khởi tạo" : "Send initial request", color: "brand" },
          { from: 1, to: 0, tag: "ACK", label: isVi ? "Xác thực & cấp phiên" : "Verify & grant session", color: "accent" },
          { from: 0, to: 1, tag: "DATA", label: isVi ? "Truyền dữ liệu đồng bộ" : "Stream synchronized payload", color: "ok" },
        ],
      },
    };
  }
  if (p.role === "example" || p.role === "step-3") {
    return {
      hierarchyTree: {
        title: isVi ? "Cấu trúc phân cấp" : "System Hierarchy",
        nodes: [
          { level: 0, icon: "📂", label: "root", badge: "master" },
          { level: 1, icon: "🌿", label: "core-pipeline", highlight: true, badge: "active" },
          { level: 2, icon: "⚡", label: "worker-pool", badge: "running" },
          { level: 1, icon: "✅", label: "output-verified", badge: "100% OK" },
        ],
      },
    };
  }
  return {};
}

function deriveOnScreenText(voiceover, language) {
  if (language === "vi") {
    // Take first 4-6 words, capitalize first letter
    const words = voiceover.replace(/[?.,!]/g, "").split(/\s+/).slice(0, 5);
    return words.join(" ");
  }
  const words = voiceover.replace(/[?.,!]/g, "").split(/\s+/).slice(0, 5);
  return words.map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
}

// ─── Optional LLM rewrite (Step 1 enhancement) ────────────
async function maybeRewriteWithLLM(script, input) {
  // If no LLM is configured (LLM_API_KEY missing), skip silently.
  // Otherwise we use the configured OpenAI-compatible provider.
  if (!process.env.LLM_API_KEY) {
    script.meta.llm_skipped = "LLM_API_KEY not set";
    return script;
  }

  const systemPrompt = `You are a concise video script writer for short explainer videos.
Given a script structure, rewrite each scene's voiceover to be punchy and natural in ${input.language === "vi" ? "Vietnamese" : "English"}.
Keep the same number of scenes. Keep the meaning of each scene. Return valid JSON only.`;

  const userPrompt = `Topic: ${input.topic}
Template: ${input.template}
Total duration: ${input.duration}s

Script to rewrite:
${JSON.stringify(script.scenes.map((s) => ({ id: s.id, role_hint: s.role_hint || s.heading || s.visual_cues?.[0]?.content || "", voiceover: s.voiceover })), null, 2)}

Return JSON: { "scenes": [{ "id": "scene-1", "voiceover": "..." }] }`;

  try {
    const result = await complete({
      system: systemPrompt,
      user: userPrompt,
      json: true,
      maxTokens: 2000,
    });
    const parsed = result.parsed;
    if (parsed?.scenes && Array.isArray(parsed.scenes)) {
      for (const rewritten of parsed.scenes) {
        const target = script.scenes.find((s) => s.id === rewritten.id);
        if (target && typeof rewritten.voiceover === "string") {
          target.voiceover = rewritten.voiceover;
          target.duration_ms = estimateDurationMs(rewritten.voiceover, input.language);
          target.on_screen_text = deriveOnScreenText(rewritten.voiceover, input.language);
        }
      }
      script.meta.generated_by = "template+llm";
      script.meta.llm_model = result.model;
    }
  } catch (err) {
    // LLM failure is non-fatal — keep template output
    script.meta.llm_error = String(err.message || err).slice(0, 200);
  }
  return script;
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Number of scenes the built-in template structures produce.
 * Used by the API layer to validate the requested duration:
 * a scene can never be longer than MAX_SCENE_DURATION_MS.
 */
export function templateSceneCount(template, maxScenes) {
  const key = normalizeTemplate(template) ?? template;
  const n = TEMPLATES[key]?.pattern.length ?? 0;
  if (!n || !maxScenes || maxScenes >= n) return n;
  return maxScenes;
}

/**
 * Spread `targetMs` over the scenes proportionally to their
 * current duration and clamp every scene into the schema range
 * [MIN_SCENE_DURATION_MS, MAX_SCENE_DURATION_MS].
 *
 * Returns the total that was actually allocated (it can differ
 * from `targetMs` when a scene had to be clamped).
 */
export function distributeDurations(scenes, targetMs) {
  const n = scenes.length;
  if (n === 0) return 0;
  const raw = scenes.map((s) => Math.max(0, Number(s.duration_ms) || 0));
  const sum = raw.reduce((a, b) => a + b, 0);
  const scale = sum > 0 ? targetMs / sum : targetMs / n;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    // The last scene absorbs the rounding remainder.
    let ms = i === n - 1 ? targetMs - acc : Math.round(raw[i] * scale);
    ms = Math.min(MAX_SCENE_DURATION_MS, Math.max(MIN_SCENE_DURATION_MS, ms));
    scenes[i].duration_ms = ms;
    acc += ms;
  }
  return acc;
}

/**
 * Resolve a user-supplied `presetScript` path.
 * Only JSON files inside the repository's `samples/` directory are
 * allowed — the field is user input and used to be joined onto
 * the cwd, which allowed reading arbitrary local files.
 */
export function resolvePresetScript(presetScript) {
  // Relative paths are resolved against the repository root — the
  // historic usage is "samples/<name>/script.json".
  const candidate = path.isAbsolute(presetScript)
    ? presetScript
    : path.join(REPO_ROOT, presetScript);
  const fp = resolveInside(PRESET_ROOT, candidate);
  if (!fp) {
    throw new Error(
      `presetScript must point to a JSON file inside the repository's samples/ directory (got: "${presetScript}")`
    );
  }
  if (path.extname(fp).toLowerCase() !== ".json") {
    throw new Error(`presetScript must be a .json file (got: "${presetScript}")`);
  }
  return fp;
}

// ─── Public API ────────────────────────────────────────────
export async function step1Script(input, { onProgress, onLog } = {}) {
  onLog?.("Building template structure...");
  onProgress?.(10);

  // ─── Preset script shortcut (used by demos and curated samples) ──
  if (input.presetScript) {
    const { readFileSync } = await import("node:fs");
    const fp = resolvePresetScript(input.presetScript);
    let preset;
    try {
      preset = JSON.parse(readFileSync(fp, "utf8"));
    } catch (err) {
      throw new Error(`Could not read preset script "${fp}": ${err.message}`);
    }
    if (!Array.isArray(preset.scenes) || preset.scenes.length === 0) {
      throw new Error(`Preset script "${fp}" has no scenes`);
    }
    onLog?.(`Using preset script: ${fp} (${preset.scenes.length} scenes)`);
    onProgress?.(60);
    // Normalize scene shape to match the schema (id, voiceover, duration_ms required)
    const target = input.duration * 1000;
    const scenes = preset.scenes.map((s, i) => ({
      id: s.id || `scene-${i + 1}`,
      voiceover: s.voiceover,
      duration_ms: s.duration_ms || 0,
      visual_cues: s.visual_cues || [{ type: "text", content: s.heading, position: "center", animation: "fade" }],
      // Preset scripts define the card title in `heading`; only
      // pass on_screen_text through when the preset sets it
      // explicitly, otherwise the accent line would just repeat
      // the heading.
      ...(s.on_screen_text ? { on_screen_text: s.on_screen_text } : {}),
      heading: s.heading,  // used by step 4 for big card
      // Caption of what the viewer is looking at.
      ...(s.visual_cue ? { visual_cue: s.visual_cue } : {}),
      // Explicit layout variant, if the preset pins one.
      ...(s.layout ? { layout: s.layout } : {}),
      // Enrichment fields — passed through if the preset script
      // defines them. Schema will reject extras; so only copy
      // the keys the preset actually has.
      ...(s.badge ? { badge: s.badge } : {}),
      ...(s.subheading ? { subheading: s.subheading } : {}),
      ...(s.bullets ? { bullets: s.bullets } : {}),
      ...(s.metrics ? { metrics: s.metrics } : {}),
      ...(s.codeSnippet ? { codeSnippet: s.codeSnippet } : {}),
      ...(s.diagram ? { diagram: s.diagram } : {}),
      ...(s.flowArchitecture ? { flowArchitecture: s.flowArchitecture } : {}),
      ...(s.sequenceFlow ? { sequenceFlow: s.sequenceFlow } : {}),
      ...(s.hierarchyTree ? { hierarchyTree: s.hierarchyTree } : {}),
      ...(s.compareMatrix ? { compareMatrix: s.compareMatrix } : {}),
    }));
    // Spread the requested duration over the preset scenes and
    // clamp every scene into the schema range.
    const allocated = distributeDurations(scenes, target);
    onProgress?.(100);
    return ScriptSchema.parse({
      template: preset.template || input.template,
      language: preset.language || input.language,
      total_duration_ms: allocated,
      scenes,
      meta: {
        generated_by: "preset",
        generated_at: new Date().toISOString(),
        topic: preset.meta?.topic || input.topic,
        description: preset.meta?.description,
      },
    });
  }

  const draft = buildTemplateScript(input);
  onProgress?.(40);
  onLog?.(`Generated ${draft.scenes.length} scenes (${draft.total_duration_ms}ms total)`);

  onLog?.("Enhancing with AI (if available)...");
  const enriched = await maybeRewriteWithLLM(draft, input);
  onProgress?.(80);

  // Normalize durations: spread them over the requested total and
  // clamp each scene into [500ms, 30000ms] — the SceneSchema
  // range. A scene outside that range made Zod reject the whole
  // script (every duration > 180s used to fail).
  const target = input.duration * 1000;
  const allocated = distributeDurations(enriched.scenes, target);
  enriched.total_duration_ms = allocated;
  onProgress?.(100);

  // Validate
  return ScriptSchema.parse(enriched);
}
