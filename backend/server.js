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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";

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
await fastify.register(fastifyCors, { origin: true });

await fastify.register(fastifyStatic, {
  root: join(__dirname, "..", "web"),
  prefix: "/",
  index: ["index.html"],
  decorateReply: false,
});

// ──────────────────────────────────────────────────────────────
// API routes
// ──────────────────────────────────────────────────────────────
await fastify.register(generateRoutes, { prefix: "/api" });
await fastify.register(statusRoutes, { prefix: "/api" });
await fastify.register(downloadRoutes, { prefix: "/api" });

// Health check
fastify.get("/health", async () => ({
  status: "ok",
  version: "0.1.0",
  phase: "M1+ — workflow live",
  uptime: process.uptime(),
}));

// Root: serve index.html (already handled by fastifyStatic)

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
