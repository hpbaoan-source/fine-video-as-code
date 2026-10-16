# Backend routes

Fastify route modules, each exported as a default async function `(fastify) => { ... }`.

| File | Prefix | Endpoints |
|---|---|---|
| `generate.js`  | `/api` | `POST /api/generate`, `GET /api/voices` |
| `status.js`    | `/api` | `GET /api/status/:jobId` (SSE), `GET /api/status/:jobId/snapshot` |
| `download.js`  | `/api` | `GET /api/download/:jobId`, `GET /api/jobs` |

All routes are registered in `server.js` with the `/api` prefix.
