// The video templates and the web portal must speak the same
// design language. The portal reads shared/design-tokens.css
// directly; the video engine carries its own copy of the same
// values because it runs in the browser. This test fails when the
// two copies drift apart.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..");

const tokensCss = fs.readFileSync(path.join(repoRoot, "shared", "design-tokens.css"), "utf8");
const engineJs = fs.readFileSync(path.join(repoRoot, "backend", "templates", "_engine.js"), "utf8");

// Parse the `:root { … }` block of the stylesheet.
function parseRootTokens(css) {
  const start = css.indexOf(":root");
  assert.ok(start >= 0, "shared/design-tokens.css must define a :root block");
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const body = css.slice(open + 1, close);
  const out = new Map();
  for (const line of body.split("\n")) {
    const m = line.match(/^\s*(--[a-z0-9-]+)\s*:\s*(.+?);/);
    if (m) out.set(m[1], m[2].trim());
  }
  return out;
}

// Parse the TOKENS object of the engine.
function parseEngineTokens(js) {
  const start = js.indexOf("const TOKENS = {");
  assert.ok(start >= 0, "_engine.js must define a TOKENS object");
  const open = js.indexOf("{", start);
  const close = js.indexOf("\n  };", open);
  const body = js.slice(open + 1, close);
  const out = new Map();
  const re = /"(--[a-z0-9-]+)":\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(body)) !== null) out.set(m[1], m[2].trim());
  return out;
}

const cssTokens = parseRootTokens(tokensCss);
const engineTokens = parseEngineTokens(engineJs);

test("the stylesheet defines the base tokens", () => {
  for (const key of ["--fv-bg", "--fv-text", "--fv-brand", "--fv-accent", "--fv-safe-x", "--fv-subbar-min"]) {
    assert.ok(cssTokens.has(key), `missing ${key} in shared/design-tokens.css`);
  }
});

test("the engine carries a meaningful subset of the tokens", () => {
  assert.ok(engineTokens.size >= 30, `engine only defines ${engineTokens.size} tokens`);
});

test("every engine token exists in the stylesheet with the same value", () => {
  const mismatches = [];
  for (const [key, value] of engineTokens) {
    if (!cssTokens.has(key)) {
      mismatches.push(`${key}: missing in shared/design-tokens.css`);
      continue;
    }
    if (cssTokens.get(key) !== value) {
      mismatches.push(`${key}: engine="${value}" css="${cssTokens.get(key)}"`);
    }
  }
  assert.deepEqual(mismatches, [], `token drift:\n${mismatches.join("\n")}`);
});

test("the stylesheet carries no vendor palette", () => {
  // Brand-neutral by contract: no hard-coded vendor hex values.
  const forbidden = ["vnpt", "mobiFone", "viettel", "olx", "grab"];
  for (const word of forbidden) {
    assert.ok(!tokensCss.toLowerCase().includes(word.toLowerCase()), `design tokens must stay brand-neutral (${word})`);
  }
});
