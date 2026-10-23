// LLM client — OpenAI-compatible chat completions.
//
// Configuration is read from environment variables only:
//   LLM_BASE_URL   e.g. https://api.openai.com/v1
//   LLM_API_KEY    the provider's secret
//   LLM_MODEL      e.g. gpt-4o-mini, claude-haiku-4-5, etc.
//   LLM_TIMEOUT_MS optional, default 30000
//
// Any provider that speaks the /chat/completions shape works:
// OpenAI, Anthropic (via gateway), Ollama, vLLM, lm-studio, etc.
//
// Example (.env or shell):
//   LLM_BASE_URL=https://api.openai.com/v1
//   LLM_API_KEY=sk-...
//   LLM_MODEL=gpt-4o-mini
//
// No filesystem access, no host config, no provider-specific hardcoding.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_PATH = path.resolve(__dirname, "..", "..", ".env");

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

// Ephemeral in-memory override set via Web UI popup (never written to disk).
let runtimeOverride = null;

/**
 * Parse LLM_* variables directly from the project `.env` file on disk
 * as a fallback in case the server was started without `--env-file-if-exists=.env`
 * or `.env` was edited while the server was already running.
 */
function readDotEnvLlmFallback() {
  try {
    if (!fs.existsSync(ENV_PATH)) return {};
    const raw = fs.readFileSync(ENV_PATH, "utf8");
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx <= 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key.startsWith("LLM_")) out[key] = val;
    }
    return out;
  } catch {
    return {};
  }
}

export function resolveActiveLlmConfig() {
  if (runtimeOverride && runtimeOverride.apiKey) {
    return {
      baseUrl: (runtimeOverride.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, ""),
      apiKey: runtimeOverride.apiKey.trim(),
      model: (runtimeOverride.model || DEFAULT_MODEL).trim(),
      timeoutMs: DEFAULT_TIMEOUT_MS,
      source: "memory",
    };
  }
  const diskEnv = readDotEnvLlmFallback();
  const apiKey = (process.env.LLM_API_KEY || diskEnv.LLM_API_KEY || "").trim();
  const baseUrl = (process.env.LLM_BASE_URL || diskEnv.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const model = (process.env.LLM_MODEL || diskEnv.LLM_MODEL || DEFAULT_MODEL).trim();
  const timeoutMs =
    Number.parseInt(process.env.LLM_TIMEOUT_MS || diskEnv.LLM_TIMEOUT_MS || "", 10) || DEFAULT_TIMEOUT_MS;
  return {
    baseUrl,
    apiKey,
    model,
    timeoutMs,
    source: apiKey ? "env" : "none",
  };
}

export function setRuntimeLlmConfig({ baseUrl, apiKey, model } = {}) {
  const cleanKey = String(apiKey || "").trim();
  if (!cleanKey) {
    runtimeOverride = null;
  } else {
    runtimeOverride = {
      baseUrl: String(baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, ""),
      apiKey: cleanKey,
      model: String(model || DEFAULT_MODEL).trim(),
    };
  }
  probeCache = { ts: 0, keyHash: "", result: null };
}

export function clearRuntimeLlmConfig() {
  runtimeOverride = null;
  probeCache = { ts: 0, keyHash: "", result: null };
}

export function getLlmStatusSummary() {
  const cfg = resolveActiveLlmConfig();
  const configured = cfg.apiKey.length > 0;
  let providerHost = "";
  try {
    providerHost = new URL(cfg.baseUrl).host;
  } catch {
    providerHost = cfg.baseUrl;
  }
  return {
    configured,
    source: cfg.source, // "memory" | "env" | "none"
    mode: configured ? "llm" : "template-only",
    model: configured ? cfg.model : null,
    baseUrl: configured ? cfg.baseUrl : DEFAULT_BASE_URL,
    provider: configured ? providerHost : null,
  };
}

let probeCache = { ts: 0, keyHash: "", result: null };

export async function probeLlmStatus({ force = false } = {}) {
  const cfg = resolveActiveLlmConfig();
  const summary = getLlmStatusSummary();
  if (!summary.configured) {
    return {
      ...summary,
      valid: false,
      status: "template-only",
      message: "Chưa có Key LLM — Nhấn vào đây để nhập Key tạm thời hoặc cấu hình .env",
    };
  }
  const apiKey = cfg.apiKey;
  const keySig = `${summary.source}:${summary.provider}:${summary.model}:${apiKey.slice(0, 4)}:${apiKey.length}`;
  const now = Date.now();
  if (!force && probeCache.result && probeCache.keyHash === keySig && now - probeCache.ts < 60_000) {
    return probeCache.result;
  }
  const baseUrl = cfg.baseUrl;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error("timeout")), 8000);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: summary.model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
        temperature: 0,
      }),
      signal: ctrl.signal,
    });
    if (res.ok) {
      const srcLabel = summary.source === "memory" ? "RAM (Tạm thời)" : ".env";
      const result = {
        ...summary,
        valid: true,
        status: "ready",
        message: `AI LLM sẵn sàng (${summary.model} · ${summary.provider} · Nguồn: ${srcLabel})`,
      };
      probeCache = { ts: now, keyHash: keySig, result };
      return result;
    }
    const errText = await res.text().catch(() => "");
    const result = {
      ...summary,
      valid: false,
      status: "invalid",
      message: `LLM Key/Endpoint lỗi (HTTP ${res.status}) — Nhấn để cấu hình lại`,
      detail: errText.slice(0, 120),
    };
    probeCache = { ts: now, keyHash: keySig, result };
    return result;
  } catch (err) {
    const result = {
      ...summary,
      valid: false,
      status: "invalid",
      message: `Không kết nối được LLM (${err.message || "network error"}) — Nhấn để sửa cấu hình`,
    };
    probeCache = { ts: now, keyHash: keySig, result };
    return result;
  } finally {
    clearTimeout(timer);
  }
}

export function readConfig() {
  const cfg = resolveActiveLlmConfig();
  if (!cfg.apiKey) {
    throw new Error(
      "LLM_API_KEY is not set. Set LLM_BASE_URL, LLM_API_KEY, LLM_MODEL env vars " +
        "before calling complete(). See llm-client.js header comment for an example."
    );
  }
  return {
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey,
    model: cfg.model,
    timeoutMs: cfg.timeoutMs,
  };
}

/**
 * Call an OpenAI-compatible chat completions endpoint.
 * @param {object} args
 * @param {string} args.system         System prompt.
 * @param {string} args.user           User prompt.
 * @param {boolean} [args.json]        When true, request JSON mode and parse the response.
 * @param {number} [args.maxTokens]    Defaults to 1024.
 * @param {number} [args.temperature]  Defaults to 0.4.
 * @returns {Promise<{text: string, parsed?: any, model: string, usage: object}>}
 */
export async function complete({ system, user, json = false, maxTokens = 1024, temperature = 0.4 }) {
  if (typeof system !== "string" || typeof user !== "string") {
    throw new TypeError("complete() requires { system: string, user: string }");
  }
  const cfg = readConfig();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error(`llm timeout after ${cfg.timeoutMs}ms`)), cfg.timeoutMs);
  const body = {
    model: cfg.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    max_tokens: maxTokens,
    temperature
  };
  if (json) body.response_format = { type: "json_object" };
  let res;
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${cfg.apiKey}`
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => "<unreadable>");
    throw new Error(`LLM ${res.status} ${res.statusText}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  const out = { text, model: data?.model || cfg.model, usage: data?.usage || {} };
  if (json) {
    try {
      out.parsed = JSON.parse(text);
    } catch (e) {
      throw new Error(`LLM returned non-JSON despite json=true: ${text.slice(0, 200)}`);
    }
  }
  return out;
}
