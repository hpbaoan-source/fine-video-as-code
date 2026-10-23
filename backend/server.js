// ──────────────────────────────────────────────────────────────
// fine-video-as-code — backend entry
// ──────────────────────────────────────────────────────────────
//   • Fastify server on port 3000
//   • Serves /web as static
//   • REST API: /api/generate, /api/status/:id (SSE), /api/download/:id
// ──────────────────────────────────────────────────────────────

import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import generateRoutes from "./routes/generate.js";
import statusRoutes from "./routes/status.js";
import downloadRoutes from "./routes/download.js";
import { jobQueue } from "./lib/job-queue.js";
import { cleanupAllExpiredJobs } from "./lib/cleanup.js";
import { closeAllActiveBrowsers } from "./workflow/step4-render.js";
import { RateLimiter } from "./lib/rate-limit.js";
import { getLlmStatusSummary, probeLlmStatus } from "./lib/llm-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const VERSION = "0.1.0";

// Max number of render jobs a single client may start per minute.
// The queue renders one video at a time, so an open endpoint is a
// denial-of-service vector.
const RATE_LIMIT = Number(process.env.RATE_LIMIT_JOBS) || 3;
const RATE_WINDOW_MS = 60_000;

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
    ...(process.env.NODE_ENV === "production"
      ? {}
      : {
          transport: {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "HH:MM:ss" },
          },
        }),
  },
  bodyLimit: 1024 * 1024, // 1 MB
});

// ──────────────────────────────────────────────────────────────
// Plugins
// ──────────────────────────────────────────────────────────────
// CORS_ORIGIN pins the allowed origin (comma separated). Without
// it the server reflects the request origin (the historic
// behaviour) — the rate limit below is what keeps the render
// queue from being flooded.
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean)
  : true;
await fastify.register(fastifyCors, { origin: corsOrigin });

await fastify.register(fastifyStatic, {
  root: join(__dirname, "..", "web"),
  prefix: "/",
  index: ["index.html"],
  decorateReply: false,
});

// Shared design tokens — the same primitives the video templates
// use, so the portal and the rendered frames stay in sync.
await fastify.register(fastifyStatic, {
  root: join(__dirname, "..", "shared"),
  prefix: "/shared/",
  decorateReply: false,
});

// ──────────────────────────────────────────────────────────────
// API routes
// ──────────────────────────────────────────────────────────────
await fastify.register(generateRoutes, { prefix: "/api" });
await fastify.register(statusRoutes, { prefix: "/api" });
await fastify.register(downloadRoutes, { prefix: "/api" });

// ──────────────────────────────────────────────────────────────
// Rate limit — POST /api/generate only
// ──────────────────────────────────────────────────────────────
const generateLimiter = new RateLimiter(RATE_LIMIT, RATE_WINDOW_MS);
fastify.addHook("onRequest", async (req, reply) => {
  if (req.method !== "POST") return;
  if (!req.url.startsWith("/api/generate")) return;
  const { allowed, remaining, retryAfterMs } = generateLimiter.hit(req.ip);
  reply.header("X-RateLimit-Limit", String(generateLimiter.limit));
  reply.header("X-RateLimit-Remaining", String(remaining));
  if (!allowed) {
    reply.header("Retry-After", String(Math.ceil(retryAfterMs / 1000) || 1));
    return reply.code(429).send({
      error: `Too many render jobs — at most ${generateLimiter.limit} per minute. Please retry shortly.`,
    });
  }
});
const limiterTimer = setInterval(() => generateLimiter.prune(), RATE_WINDOW_MS);
limiterTimer.unref?.();

// Health check
fastify.get("/health", async () => ({
  status: "ok",
  phase: jobQueue.status().active ? "rendering" : "idle",
  version: VERSION,
  uptime: process.uptime(),
  llm: getLlmStatusSummary(),
}));

// Live LLM key/token verification for Web UI indicator
fastify.get("/api/llm-status", async (req) => {
  const force = req.query?.force === "1" || req.query?.force === "true";
  return probeLlmStatus({ force });
});

// Root: serve index.html (already handled by fastifyStatic)

// ──────────────────────────────────────────────────────────────
// Shutdown
// ──────────────────────────────────────────────────────────────
let shuttingDown = false;

fastify.addHook("onClose", async () => {
  // Close the Chromium instances the renderer left open, stop the
  // queue and reclaim the per-job temp directories.
  await closeAllActiveBrowsers();
  await jobQueue.stop(10_000);
  const removed = await cleanupAllExpiredJobs().catch(() => 0);
  fastify.log.info(`Cleanup done (${removed} work dir(s) removed)`);
});

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  fastify.log.info(`${signal} received — shutting down...`);
  try {
    await fastify.close();
  } catch (err) {
    fastify.log.error(err);
  }
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ──────────────────────────────────────────────────────────────
// Boot
// ──────────────────────────────────────────────────────────────
try {
  await fastify.listen({ port: PORT, host: HOST });
  fastify.log.info(`📺 fine-video-as-code listening on http://${HOST}:${PORT}`);
  fastify.log.info(`   web UI:    http://${HOST}:${PORT}/`);
  fastify.log.info(`   health:    http://${HOST}:${PORT}/health`);
  fastify.log.info(`   generate:  POST http://${HOST}:${PORT}/api/generate`);
  fastify.log.info(`   status:    GET  http://${HOST}:${PORT}/api/status/:jobId  (SSE)`);
  fastify.log.info(`   download:  GET  http://${HOST}:${PORT}/api/download/:jobId`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
