// ──────────────────────────────────────────────────────────────
// GET /api/status/:jobId — Server-Sent Events stream
// ──────────────────────────────────────────────────────────────

import { jobStore } from "../lib/job-store.js";

export default async function statusRoutes(fastify) {
  // SSE stream
  fastify.get("/status/:jobId", (req, reply) => {
    const { jobId } = req.params;
    const job = jobStore.get(jobId);
    if (!job) return reply.code(404).send({ error: "Job not found" });

    // SSE headers
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",  // disable nginx buffering
    });

    // Replay all past events
    for (const e of job.events) {
      writeEvent(reply, e);
    }
    // If already done, close after replay
    if (job.status === "completed" || job.status === "failed" || job.status === "expired") {
      writeEvent(reply, { type: "close" });
      reply.raw.end();
      return;
    }

    // Subscribe to future events
    const unsubscribe = jobStore.subscribe(jobId, (event) => {
      writeEvent(reply, event);
      if (event.type === "complete" || event.type === "error" || event.type === "expired") {
        writeEvent(reply, { type: "close" });
        setTimeout(() => reply.raw.end(), 50);
      }
    });

    // Heartbeat (keeps the connection open through proxies)
    const heartbeat = setInterval(() => {
      try { reply.raw.write(":heartbeat\n\n"); } catch (e) {}
    }, 15000);

    // Cleanup on client disconnect
    req.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  // JSON snapshot (no streaming) — useful for polling
  fastify.get("/status/:jobId/snapshot", (req, reply) => {
    const { jobId } = req.params;
    const job = jobStore.get(jobId);
    if (!job) return reply.code(404).send({ error: "Job not found" });
    return {
      jobId: job.id,
      status: job.status,
      currentStep: job.currentStep,
      input: job.input,
      events: job.events,
      output: job.outputFilename
        ? {
            filename: job.outputFilename,
            size: job.outputSize,
            downloadUrl: `/api/download/${job.id}`,
          }
        : null,
      error: job.error,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    };
  });
}

function writeEvent(reply, event) {
  try {
    const data = JSON.stringify(event);
    reply.raw.write(`data: ${data}\n\n`);
  } catch (e) {}
}
