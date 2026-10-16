// ──────────────────────────────────────────────────────────────
// fine-video-as-code — backend entry
// ──────────────────────────────────────────────────────────────
// MVP scaffold (Phase 0). Real workflow wired up in Phase 1+.
//
//   • Fastify server on port 3000
//   • Serves /web as static
//   • Health check at /health
//   • TODO Phase 1: POST /api/generate, GET /api/status/:id, GET /api/download/:id
// ──────────────────────────────────────────────────────────────

import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
    transport: {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "HH:MM:ss" },
    },
  },
});

// ──────────────────────────────────────────────────────────────
// Plugins
// ──────────────────────────────────────────────────────────────
await fastify.register(fastifyCors, {
  origin: true, // dev only — tighten for production
});

await fastify.register(fastifyStatic, {
  root: join(__dirname, "..", "web"),
  prefix: "/",
  index: ["index.html"],
});

// ──────────────────────────────────────────────────────────────
// Routes — health
// ──────────────────────────────────────────────────────────────
fastify.get("/health", async () => ({
  status: "ok",
  version: "0.1.0",
  phase: "M0 — scaffold",
  uptime: process.uptime(),
}));

// TODO Phase 1:
//   fastify.register(generateRoute, { prefix: "/api" });
//   fastify.register(statusRoute,   { prefix: "/api" });
//   fastify.register(downloadRoute, { prefix: "/api" });

// ──────────────────────────────────────────────────────────────
// Boot
// ──────────────────────────────────────────────────────────────
try {
  await fastify.listen({ port: PORT, host: HOST });
  fastify.log.info(`📺 fine-video-as-code listening on http://${HOST}:${PORT}`);
  fastify.log.info(`   web UI:    http://${HOST}:${PORT}/`);
  fastify.log.info(`   health:    http://${HOST}:${PORT}/health`);
  fastify.log.info(`   phase:     M0 (scaffold) — workflow coming in Phase 1`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
