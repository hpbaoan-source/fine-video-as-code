// ──────────────────────────────────────────────────────────────
// upload-moon.mjs — upload one or more videos to a file-drop
// service and print short info.
//
// Usage: node scripts/upload-moon.mjs <file1> [file2...] [--pub]
//
// Configuration comes from the environment — nothing is hardcoded:
//   MOON_API_URL    base URL of the service  (required)
//   MOON_PASSCODE   login passcode            (required)
// Both are documented in .env.example.
// ──────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";

const API = process.env.MOON_API_URL;
const PASSCODE = process.env.MOON_PASSCODE;

function requireConfig() {
  const missing = [];
  if (!API) missing.push("MOON_API_URL");
  if (!PASSCODE) missing.push("MOON_PASSCODE");
  if (missing.length) {
    console.error(
      `✗ Missing environment variable(s): ${missing.join(", ")}\n` +
        `  Set them in your shell or in a local .env file, e.g.\n` +
        `    MOON_API_URL=https://your-upload-host.example\n` +
        `    MOON_PASSCODE=<your passcode>`
    );
    process.exit(2);
  }
}

async function login() {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passcode: PASSCODE }),
  });
  if (!res.ok) throw new Error(`login HTTP ${res.status}`);
  const j = await res.json();
  if (!j.token) throw new Error(`login no token: ${JSON.stringify(j)}`);
  return j.token;
}

async function upload(token, filepath) {
  const buf = fs.readFileSync(filepath);
  const fd = new FormData();
  fd.append("file", new Blob([buf]), path.basename(filepath));
  const res = await fetch(`${API}/api/dropbox/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  if (!res.ok) throw new Error(`upload HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

(async () => {
  const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (files.length === 0) {
    console.error("usage: node scripts/upload-moon.mjs <file1> [file2...]");
    process.exit(2);
  }
  requireConfig();
  const token = await login();
  for (const f of files) {
    const absPath = path.resolve(f);
    if (!fs.existsSync(absPath)) {
      console.error(`missing: ${absPath}`);
      continue;
    }
    const r = await upload(token, absPath);
    console.log(
      `${path.basename(absPath)} -> id=${r.id} size=${r.size} ttl=${r.remaining_seconds}s`
    );
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
