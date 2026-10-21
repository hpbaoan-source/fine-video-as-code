// ──────────────────────────────────────────────────────────────
// POST /api/generate — start a new video job
// ──────────────────────────────────────────────────────────────

import { GenerateInputSchema } from "../lib/schema.js";
import { jobStore } from "../lib/job-store.js";
import { jobQueue } from "../lib/job-queue.js";
import { validateVoice, VOICE_PRESETS } from "../lib/voice.js";
import { listPresets } from "../lib/presets.js";
import {
  templateSceneCount,
  MAX_SCENE_DURATION_MS,
  MAX_SCENES,
} from "../workflow/step1-script.js";

export default async function generateRoutes(fastify) {
  fastify.post("/generate", async (req, reply) => {
    // Validate
    const parse = GenerateInputSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({
        error: "Validation failed",
        issues: parse.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
          code: i.code,
        })),
      });
    }
    const input = parse.data;

    // Sanity check: voice must match language. Reject unknown voice
    // with 400 rather than letting the workflow start and then fail
    // halfway through. Uses the same helper as step 2 (lib/voice.js).
    const voiceCheck = validateVoice(input.language, input.voice);
    if (!voiceCheck.ok) {
      return reply.code(400).send({
        error: voiceCheck.error,
        language: voiceCheck.language,
        allowed: voiceCheck.allowed,
        received: voiceCheck.received,
      });
    }

    // Sanity check: the total duration must fit into the scene
    // budget. A scene can never be longer than 30 s (SceneSchema),
    // so a 5-scene template tops out at 150 s — asking for more
    // used to fail deep inside step 1 with a Zod error.
    const sceneCount = input.presetScript
      ? MAX_SCENES
      : templateSceneCount(input.template, input.maxScenes);
    const maxTotalMs = sceneCount * MAX_SCENE_DURATION_MS;
    const requestedMs = input.duration * 1000;
    if (sceneCount > 0 && requestedMs > maxTotalMs) {
      return reply.code(400).send({
        error: `Duration too long: ${input.duration}s exceeds the maximum of ${
          maxTotalMs / 1000
        }s for ${sceneCount} scenes (max ${MAX_SCENE_DURATION_MS / 1000}s per scene)`,
        duration: input.duration,
        maxDuration: maxTotalMs / 1000,
        sceneCount,
      });
    }

    // Create job. The record is created first (the workflow needs
    // the id), but if the queue refuses the job the orphaned
    // record is removed again — otherwise it stays in the map as
    // "queued" forever.
    let job = null;
    try {
      job = jobStore.create(input);
      jobQueue.enqueue(job);
    } catch (err) {
      if (job) jobStore.remove(job.id);
      return reply.code(503).send({ error: err.message });
    }

    return reply.code(202).send({
      jobId: job.id,
      status: job.status,
      statusUrl: `/api/status/${job.id}`,
      downloadUrl: `/api/download/${job.id}`,
    });
  });

  // Helpful: list voices per language
  fastify.get("/voices", async (req) => {
    const lang = req.query.language;
    if (lang && VOICE_PRESETS[lang]) {
      return { language: lang, voices: VOICE_PRESETS[lang] };
    }
    return { voices: VOICE_PRESETS };
  });

  // The curated sample scripts — the portal offers them in a
  // dropdown instead of asking the user to type a path.
  fastify.get("/presets", async () => {
    return { presets: await listPresets() };
  });
}
