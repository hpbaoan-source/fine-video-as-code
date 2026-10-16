// ──────────────────────────────────────────────────────────────
// POST /api/generate — start a new video job
// ──────────────────────────────────────────────────────────────

import { GenerateInputSchema, VoicePresets } from "../lib/schema.js";
import { jobStore } from "../lib/job-store.js";
import { jobQueue } from "../lib/job-queue.js";

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
    // halfway through.
    const allowed = VoicePresets[input.language] || [];
    if (allowed.length && !allowed.includes(input.voice)) {
      return reply.code(400).send({
        error: "Invalid voice for selected language",
        language: input.language,
        allowed,
        received: input.voice,
      });
    }

    // Create job
    let job;
    try {
      job = jobStore.create(input);
      jobQueue.enqueue(job);
    } catch (err) {
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
  fastify.get("/voices", async (req, reply) => {
    const lang = req.query.language;
    if (lang && VoicePresets[lang]) {
      return { language: lang, voices: VoicePresets[lang] };
    }
    return { voices: VoicePresets };
  });
}
