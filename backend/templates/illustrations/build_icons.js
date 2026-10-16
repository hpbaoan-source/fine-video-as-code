// Build /backend/templates/illustrations/icons.js from the
// vendored SVGs in D:/rainy_works/cache/phosphor-icons/. Run
// once after adding new icons.
import fs from "node:fs";
import path from "node:path";

const srcDir = "D:/rainy_works/cache/phosphor-icons";
if (!fs.existsSync(srcDir)) {
  console.error(`vendored icons dir not found: ${srcDir}`);
  console.error("run scripts/download_phosphor.ps1 to fetch them.");
  process.exit(1);
}
const outPath = path.join("backend", "templates", "illustrations", "icons.js");
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const files = fs.readdirSync(srcDir).filter(f => f.endsWith(".svg")).sort();
const entries = files.map(f => {
  const name = path.basename(f, ".svg");
  const svg = fs.readFileSync(path.join(srcDir, f), "utf8").trim().replace(/\s+/g, " ");
  // Quote the key — names like `git-branch` and `arrow-right` are
  // not valid JS identifiers and would cause a parse error.
  return `  "${name}": ${JSON.stringify(svg)},`;
});

const body = `// Phosphor Icons — vendored locally (MIT license).
// Source: https://github.com/phosphor-icons/core
// Each icon is a 256x256 SVG with fill="currentColor" so CSS
// controls the colour via \`color: var(--brand)\` etc.
//
// Used by the engine: window.fineVideoIcons.lock → SVG markup.
// To add a new icon, drop the SVG into this directory and run
// \`node backend/templates/illustrations/build_icons.js\`.
'use strict';

window.fineVideoIcons = {
${entries.join("\n")}
};
`;
fs.writeFileSync(outPath, body, "utf8");
console.log(`Wrote ${files.length} icons (${body.length} bytes) to ${outPath}`);
