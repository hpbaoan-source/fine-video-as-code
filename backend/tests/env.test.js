// Env setup smoke test — guards the new `.env.example` pattern
// against accidental deletion and against `node --env-file=.env`
// breaking (e.g. by upgrading to a Node version that doesn't
// support the flag).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const execFileP = promisify(execFile);
const root = path.join(import.meta.dirname, "..", "..");

test(".env.example exists and is committed (not gitignored)", () => {
  const envExample = path.join(root, ".env.example");
  assert.ok(existsSync(envExample), `.env.example missing at ${envExample} — copy from history or recreate`);
  const content = readFileSync(envExample, "utf8");
  // Must document the three LLM keys
  for (const key of ["LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL"]) {
    assert.ok(content.includes(key), `.env.example does not document ${key}`);
  }
  // Must mention each alternative provider we documented
  assert.ok(content.includes("OpenAI"), ".env.example should mention OpenAI");
  assert.ok(content.includes("Ollama"), ".env.example should mention local Ollama");
});

test(".gitignore blocks .env (but allows .env.example)", () => {
  const gi = readFileSync(path.join(root, ".gitignore"), "utf8");
  // Match `.env` as a standalone line, not `.env.example`
  const lines = gi.split(/\r?\n/);
  const envLine = lines.find((l) => l.trim() === ".env");
  const envLocalLine = lines.find((l) => l.trim() === ".env.local");
  assert.ok(envLine, ".gitignore must block `.env`");
  assert.ok(envLocalLine, ".gitignore must block `.env.local`");
  // .env.example must NOT be blocked
  const envExampleBlocked = lines.find((l) => l.trim() === ".env.example");
  assert.equal(envExampleBlocked, undefined, ".gitignore must NOT block .env.example");
});

test("node --env-file= flag works on this Node version (>=20.6.0)", async () => {
  // If this ever fails on a CI Node version, you'll know immediately.
  try {
    await execFileP("node", [
      "--env-file=.env.example",
      "-e",
      "if (typeof process.loadEnvFile !== 'function') process.exit(2); console.log('ok');",
    ], { cwd: root, shell: false, windowsHide: true });
  } catch (err) {
    assert.fail(`node --env-file failed: ${err.message}. Node >= 20.6.0 required.`);
  }
});

test("node --env-file-if-exists flag works on this Node version (>=22.9.0)", async () => {
  // The npm scripts load .env with --env-file-if-exists, so the
  // server also starts when there is no .env file. If this ever
  // fails on a CI Node version, you'll know immediately.
  try {
    await execFileP("node", [
      "--env-file-if-exists=.env.does-not-exist",
      "-e",
      "console.log('ok');",
    ], { cwd: root, shell: false, windowsHide: true });
  } catch (err) {
    assert.fail(`node --env-file-if-exists failed: ${err.message}. Node >= 22.9.0 required.`);
  }
});

test("package.json scripts load .env when it exists", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  // Both spellings are accepted: --env-file-if-exists=.env (the
  // current one, server starts without a .env) and --env-file=.env.
  const loadsEnv = (script) => /--env-file(?:-if-exists)?=\.env\b/.test(script);
  assert.ok(loadsEnv(pkg.scripts.start),
    `npm start should load .env: got "${pkg.scripts.start}"`);
  assert.ok(loadsEnv(pkg.scripts.dev),
    `npm run dev should load .env: got "${pkg.scripts.dev}"`);
  assert.ok(loadsEnv(pkg.scripts["render-sample"]),
    `npm run render-sample should load .env: got "${pkg.scripts["render-sample"]}"`);
});
