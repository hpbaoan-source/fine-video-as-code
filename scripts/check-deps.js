// ──────────────────────────────────────────────────────────────
// check-deps.js — verify Node, npm, FFmpeg versions
// ──────────────────────────────────────────────────────────────
// Run: `npm run setup`  or  `node scripts/check-deps.js`
// ──────────────────────────────────────────────────────────────

import { execFileSync } from "node:child_process";

const checks = [
  {
    name: "Node.js",
    min: "20.0.0",
    cmd: ["node", ["-v"]],
    parse: (out) => out.trim().replace(/^v/, ""),
  },
  {
    name: "npm",
    min: "10.0.0",
    cmd: ["npm", ["-v"]],
    parse: (out) => out.trim(),
  },
  {
    name: "FFmpeg",
    min: "4.0",
    cmd: ["ffmpeg", ["-version"]],
    parse: (out) => {
      const m = out.match(/ffmpeg version (\S+)/);
      return m ? m[1] : "?";
    },
  },
];

function parseVersion(v) {
  return v.split(/[.\-]/).map((p) => parseInt(p, 10) || 0);
}

function gte(a, b) {
  const [av, bv] = [parseVersion(a), parseVersion(b)];
  for (let i = 0; i < Math.max(av.length, bv.length); i++) {
    const x = av[i] || 0, y = bv[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return true;
}

let allOk = true;
for (const c of checks) {
  try {
    const [bin, args] = c.cmd;
    const out = execFileSync(bin, args, { encoding: "utf8" });
    const v = c.parse(out);
    const ok = gte(v, c.min);
    console.log(
      `${ok ? "✓" : "✗"} ${c.name.padEnd(10)} ${v.padEnd(15)} (min ${c.min})`
    );
    if (!ok) allOk = false;
  } catch (e) {
    console.log(`✗ ${c.name.padEnd(10)} NOT FOUND        (min ${c.min})`);
    if (c.name === "FFmpeg") {
      console.log("  → Install: https://ffmpeg.org/download.html");
    }
    allOk = false;
  }
}

console.log("");
if (allOk) {
  console.log("🎉 All dependencies OK. Run `npm start` to launch the server.");
  process.exit(0);
} else {
  console.log("⚠️  Some dependencies are missing. See above.");
  process.exit(1);
}
