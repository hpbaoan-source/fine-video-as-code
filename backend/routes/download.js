// ──────────────────────────────────────────────────────────────
// GET /api/download/:jobId — stream the final MP4
// ──────────────────────────────────────────────────────────────

import fs from "node:fs";
import fsp from "node:fs/promises";
import { jobStore } from "../lib/job-store.js";

/**
 * Build a Content-Disposition header that survives non-ASCII file
 * names (Vietnamese topics are allowed) and header injection
 * (CR/LF). RFC 6266: `filename` for legacy clients, `filename*`
 * with the percent-encoded UTF-8 value for modern ones.
 */
export function contentDisposition(filename) {
  const raw = String(filename || "video.mp4")
    .replace(/[\r\n]+/g, "")   // no header injection
    .replace(/["\\]/g, "_");
  const ascii = raw.replace(/[^\x20-\x7E]/g, "_") || "video.mp4";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(raw)}`;
}

export default async function downloadRoutes(fastify) {
  fastify.get("/download/:jobId", async (req, reply) => {
    const { jobId } = req.params;
    const job = jobStore.get(jobId);
    if (!job) return reply.code(404).send({ error: "Job not found" });
    if (job.status === "expired") return reply.code(410).send({ error: "Job expired" });
    if (job.status !== "completed") {
      return reply.code(409).send({ error: `Job not ready (status: ${job.status})` });
    }
    const filePath = job.outputPath;
    if (!filePath) {
      return reply.code(410).send({ error: "Output file no longer available" });
    }

    // existsSync + statSync was a TOCTOU race — and statSync threw
    // an unhandled error when the file vanished in between.
    let stat;
    try {
      stat = await fsp.stat(filePath);
    } catch {
      return reply.code(410).send({ error: "Output file no longer available" });
    }
    if (!stat.isFile()) {
      return reply.code(410).send({ error: "Output file no longer available" });
    }

    reply.header("Content-Type", "video/mp4");
    reply.header("Content-Length", stat.size);
    reply.header("Content-Disposition", contentDisposition(job.outputFilename));
    const stream = fs.createReadStream(filePath);
    stream.on("error", () => {
      try {
        reply.raw.destroy();
      } catch {}
    });
    return reply.send(stream);
  });

  // Also expose /api/jobs (debug/admin). Disabled unless an admin
  // token is configured — the endpoint is reachable cross-origin
  // and leaks the job counts of every user.
  fastify.get("/jobs", async (req, reply) => {
    const token = process.env.ADMIN_TOKEN;
    if (!token) {
      return reply.code(404).send({
        error: "Job statistics are disabled. Set ADMIN_TOKEN to enable them.",
      });
    }
    const provided = req.headers["x-admin-token"] || req.query?.token;
    if (provided !== token) {
      return reply.code(401).send({ error: "Admin token required" });
    }
    return jobStore.stats();
  });
}
