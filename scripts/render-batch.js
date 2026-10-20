// Renders a list of samples sequentially in the background.
// Usage: node scripts/render-batch.js 01-how-https-works 02-a-day-in-code
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

for (const name of process.argv.slice(2)) {
  console.log(`\n=== ${name} ===`);
  await new Promise((resolve) => {
    const p = spawn(process.execPath, ["--env-file=.env", "scripts/render-sample.js", name], {
      cwd: projectRoot,
      stdio: "inherit",
    });
    p.on("exit", (code) => {
      console.log(`=== ${name} exit ${code} ===`);
      resolve();
    });
  });
}
console.log("BATCH DONE");
