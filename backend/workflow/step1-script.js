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

import { ScriptSchema } from "../lib/schema.js";
import { complete } from "../lib/llm-client.js";

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

function buildTemplateScript(input) {
  const tmpl = TEMPLATES[input.template];
  const pattern = tmpl.pattern;

  // Per-scene text length, then estimated duration. Don't divide
  // the target total evenly — short hook lines and longer deep-dives
  // have very different TTS runtimes.
  const scenes = pattern.map((p, i) => {
    const voiceover = generateVoiceoverForRole(input, p, i, pattern.length);
    return {
      id: `scene-${i + 1}`,
      voiceover,
      duration_ms: estimateDurationMs(voiceover, input.language),
      visual_cues: generateVisualCuesForRole(input, p, i, tmpl.visualMix),
      on_screen_text: deriveOnScreenText(voiceover, input.language),
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

function generateVoiceoverForRole(input, p, idx, total) {
  const isLast = idx === total - 1;
  const isFirst = idx === 0;
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

function generateVisualCuesForRole(input, p, idx, visualMix) {
  // Pick 1-2 visual cues per scene, varying the type
  const cues = [];
  const primary = visualMix[idx % visualMix.length];
  cues.push({
    type: primary,
    content: p.intent,
    position: "center",
    animation: idx === 0 ? "fade" : (idx % 2 === 0 ? "slide-up" : "zoom"),
  });
  if (idx === 0 || idx === p.intent.length - 1) {
    cues.push({
      type: "text",
      content: input.topic,
      position: "top",
      animation: "fade",
    });
  }
  return cues;
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
${JSON.stringify(script.scenes.map((s) => ({ id: s.id, role_hint: s.visual_cues[0]?.content, voiceover: s.voiceover })), null, 2)}

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

// ─── Public API ────────────────────────────────────────────
export async function step1Script(input, { onProgress, onLog } = {}) {
  onLog?.("Building template structure...");
  onProgress?.(10);

  // ─── Preset script shortcut (used by demos and curated samples) ──
  if (input.presetScript) {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const fp = path.isAbsolute(input.presetScript)
      ? input.presetScript
      : path.join(process.cwd(), input.presetScript);
    const preset = JSON.parse(readFileSync(fp, "utf8"));
    onLog?.(`Using preset script: ${fp} (${preset.scenes.length} scenes)`);
    onProgress?.(60);
    // Normalize scene shape to match the schema (id, voiceover, duration_ms required)
    const target = input.duration * 1000;
    const sum = preset.scenes.reduce((s, sc) => s + (sc.duration_ms || 0), 0);
    const ratio = sum > 0 && Math.abs(sum - target) > 100 ? target / sum : 1;
    let acc = 0;
    const scenes = preset.scenes.map((s, i) => {
      let ms = Math.round((s.duration_ms || 0) * ratio);
      if (i === preset.scenes.length - 1) ms = target - acc;
      acc += ms;
      return {
        id: s.id || `scene-${i + 1}`,
        voiceover: s.voiceover,
        duration_ms: ms,
        visual_cues: s.visual_cues || [{ type: "text", content: s.heading, position: "center", animation: "fade" }],
        on_screen_text: s.heading || s.voiceover?.slice(0, 40),
        heading: s.heading,  // used by step 4 for big card
        // Enrichment fields — passed through if the preset script
        // defines them. Schema will reject extras; so only copy
        // the keys the preset actually has.
        ...(s.badge ? { badge: s.badge } : {}),
        ...(s.subheading ? { subheading: s.subheading } : {}),
        ...(s.bullets ? { bullets: s.bullets } : {}),
        ...(s.metrics ? { metrics: s.metrics } : {}),
        ...(s.codeSnippet ? { codeSnippet: s.codeSnippet } : {}),
        ...(s.diagram ? { diagram: s.diagram } : {}),
      };
    });
    onProgress?.(100);
    return ScriptSchema.parse({
      template: preset.template || input.template,
      language: preset.language || input.language,
      total_duration_ms: target,
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

  // Normalize durations to sum exactly to target total
  const target = input.duration * 1000;
  const sum = enriched.scenes.reduce((s, x) => s + x.duration_ms, 0);
  if (sum !== target && sum > 0) {
    const ratio = target / sum;
    let acc = 0;
    for (let i = 0; i < enriched.scenes.length; i++) {
      if (i === enriched.scenes.length - 1) {
        enriched.scenes[i].duration_ms = target - acc;
      } else {
        enriched.scenes[i].duration_ms = Math.round(enriched.scenes[i].duration_ms * ratio);
        acc += enriched.scenes[i].duration_ms;
      }
    }
    enriched.total_duration_ms = target;
  }
  onProgress?.(100);

  // Validate
  return ScriptSchema.parse(enriched);
}
