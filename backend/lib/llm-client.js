// ──────────────────────────────────────────────────────────────
// LLM client — provider-agnostic wrapper
// ──────────────────────────────────────────────────────────────
// Reads the nanobot config's MiniMax key (or any future provider
// we add) and exposes a small `complete({system, user, json})` API.
//
// If no key is found, returns null and the workflow falls back
// to template-only scripting.
// ──────────────────────────────────────────────────────────────

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let cached = null;
let configLoaded = false;

function loadConfig() {
  if (configLoaded) return;
  configLoaded = true;
  const candidates = [
    path.join(os.homedir(), ".nanobot", "config.json"),
    path.join(process.cwd(), ".nanobot", "config.json"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        cached = JSON.parse(fs.readFileSync(p, "utf8"));
        return;
      } catch (e) {
        cached = null;
      }
    }
  }
}

function getProvider() {
  loadConfig();
  if (!cached?.providers) return null;
  // Prefer MiniMax (the one we have a key for)
  const p = cached.providers.minimax;
  if (p?.apiKey) {
    return {
      name: "minimax",
      apiKey: p.apiKey,
      base: p.apiBase || "https://api.minimax.io/v1",
    };
  }
  return null;
}

export function getLLMClient() {
  const provider = getProvider();
  if (!provider) return null;
  return {
    name: provider.name,
    async complete({ system, user, json = false, maxTokens = 1500, model }) {
      const m = model || (provider.name === "minimax" ? "MiniMax-M2.7" : "gpt-4o-mini");
      const body = {
        model: m,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: maxTokens,
        temperature: 0.7,
      };
      if (json) body.response_format = { type: "json_object" };

      const res = await fetch(`${provider.base}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`LLM ${res.status}: ${txt.slice(0, 300)}`);
      }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("LLM returned empty content");
      if (json) {
        // Strip <think>...</think> blocks, ```json fences, and surrounding whitespace
        let stripped = content
          .replace(/<think>[\s\S]*?<\/think>/gi, "")
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/```$/i, "")
          .trim();
        // Find the first { or [ to skip any leading prose
        const firstBrace = stripped.search(/[\[{]/);
        if (firstBrace > 0) {
          stripped = stripped.slice(firstBrace);
        }
        return JSON.parse(stripped);
      }
      return content;
    },
  };
}
