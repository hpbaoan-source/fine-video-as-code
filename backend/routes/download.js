// ──────────────────────────────────────────────────────────────
// GET /api/download/:jobId — stream the final MP4
// ──────────────────────────────────────────────────────────────

import fs from "node:fs";
import path from "node:path";
import { jobStore } from "../lib/job-store.js";

export default async function downloadRoutes(fastify) {
  fastify.get("/download/:jobId", (req, reply) => {
    const { jobId } = req.params;
    const job = jobStore.get(jobId);
    if (!job) return reply.code(404).send({ error: "Job not found" });
    if (job.status === "expired") return reply.code(410).send({ error: "Job expired" });
    if (job.status !== "completed") {
      return reply.code(409).send({ error: `Job not ready (status: ${job.status})` });
    }
    const filePath = job.outputPath;
    if (!fs.existsSync(filePath)) {
      return reply.code(410).send({ error: "Output file no longer available" });
    }

    const stat = fs.statSync(filePath);
    reply.header("Content-Type", "video/mp4");
    reply.header("Content-Length", stat.size);
    reply.header("Content-Disposition", `attachment; filename="${job.outputFilename}"`);
    const stream = fs.createReadStream(filePath);
    return reply.send(stream);
  });

  // Also expose /api/jobs (debug/admin)
  fastify.get("/jobs", async () => {
    return jobStore.stats();
  });
}
