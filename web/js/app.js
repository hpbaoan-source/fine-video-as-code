// ──────────────────────────────────────────────────────────────
// fine-video-as-code — frontend (Phase 0 scaffold)
// ──────────────────────────────────────────────────────────────
// Real form logic + SSE progress wired up in Phase 4 (M4).
// This file just renders a small "system is alive" indicator.
// ──────────────────────────────────────────────────────────────

const start = Date.now();

// Hit the /health endpoint to confirm the backend is reachable.
fetch("/health")
  .then((r) => r.json())
  .then((data) => {
    console.log("[health]", data);
    document.title = `fine-video-as-code · ${data.version}`;
  })
  .catch((err) => {
    console.warn("[health] backend unreachable:", err);
  });

console.info(`🌧️ fine-video-as-code UI loaded in ${Date.now() - start}ms`);
