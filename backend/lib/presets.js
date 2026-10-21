// ──────────────────────────────────────────────────────────────
// Curated sample scripts — read-only catalogue.
//
// The samples in `samples/` are hand-written scripts that the
// pipeline can render as-is (see `presetScript` in the input
// schema). This module lists them so the portal can offer them in a
// dropdown instead of asking the user to type a path.
//
// Only JSON files that live inside `samples/` are ever read — the
// same rule the render step enforces (see lib/path-guard.js).
// ──────────────────────────────────────────────────────────────

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const REPO_ROOT = path.resolve(__dirname, "..", "..");
export const SAMPLES_ROOT = path.join(REPO_ROOT, "samples");

/**
 * List every curated script in `samples/`.
 *
 * Returns one entry per sample folder:
 *   { id, path, template, language, voice, scenes, duration_ms, topic, description }
 *
 * A folder whose `script.json` cannot be read or parsed is skipped
 * — one broken sample must not take the whole catalogue down.
 */
export async function listPresets() {
  let entries;
  try {
    entries = await fs.readdir(SAMPLES_ROOT, { withFileTypes: true });
  } catch {
    return [];
  }

  const presets = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = path.join(SAMPLES_ROOT, entry.name, "script.json");
    try {
      const raw = JSON.parse(await fs.readFile(file, "utf8"));
      const scenes = Array.isArray(raw.scenes) ? raw.scenes : [];
      presets.push({
        id: entry.name,
        // Relative path — the render step resolves it against the
        // repository root and rejects anything outside samples/.
        path: `samples/${entry.name}/script.json`,
        template: raw.template ?? null,
        language: raw.language ?? null,
        voice: raw.voice ?? null,
        scenes: scenes.length,
        duration_ms: scenes.reduce((acc, s) => acc + (Number(s.duration_ms) || 0), 0),
        topic: raw.meta?.topic ?? null,
        description: raw.meta?.description ?? null,
      });
    } catch {
      // Not a preset (or unreadable) — skip it.
    }
  }
  return presets;
}
