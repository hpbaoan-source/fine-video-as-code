// Upload one or more videos to Moon Dropbox and print short info.
// Usage: node scripts/upload-moon.mjs <file1> [file2...] [--pub]
import fs from "node:fs";
import path from "node:path";

const API = "https://moon.id.vn";

async function login() {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passcode: "0000" }),
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
  const token = await login();
  for (const f of files) {
    const absPath = path.resolve(f);
    if (!fs.existsSync(absPath)) {
      console.error(`missing: ${absPath}`);
      continue;
    }
    const r = await upload(token, absPath);
    console.log(`${path.basename(absPath)} -> id=${r.id} size=${r.size} ttl=${r.remaining_seconds}s`);
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
