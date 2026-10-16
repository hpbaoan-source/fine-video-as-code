/**
 * Step 4 — Render MP4 using Playwright + HTML templates + ffmpeg-static.
 *
 * Pipeline:
 *  1. Write data.json to a per-job render dir
 *  2. Start a tiny local HTTP server serving templates + render dir
 *  3. Playwright opens the template in headless Chromium (1920x1080)
 *  4. Template animates through scenes; we record page.video()
 *  5. Save webm, then convert to mp4 (no audio)
 *  6. Concatenate per-scene TTS audio files into a single track
 *  7. ffmpeg-static muxes video + audio → final .mp4
 *
 * Returns { path, filename, size } as expected by workflow/index.js
 */
import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { chromium } from "playwright";
import ffmpegStatic from "ffmpeg-static";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const execFileP = promisify(execFile);
const FFMPEG_BIN = ffmpegStatic;

const TEMPLATE_DIR = path.join(__dirname, "..", "templates");
const TEMPLATE_FILES = {
  "tech-explainer": "tech-explainer.html",
  promo: "promo.html",
  tutorial: "tutorial.html",
};

export async function step4Render({ script, durations, input, workDir, onLog, onProgress }) {
  const templateFile = TEMPLATE_FILES[input.template];
  if (!templateFile) throw new Error(`Unknown template: ${input.template}`);

  onLog?.(`Loading HTML template: ${templateFile}`);
  onProgress?.(5);

  // 1. Write data.json
  const sceneData = {
    topic: input.topic || script.scenes?.[0]?.heading || "Video",
    scenes: script.scenes.map((s) => ({
      heading: s.heading || deriveHeading(s.voiceover, input.language),
      voiceover: s.voiceover,
      duration_ms: durations[s.id]?.ms || s.duration_ms || 3000,
    })),
    brand: {
      brandColor: input.brandColor || "#3B82F6",
      accentColor: input.accentColor || "#F59E0B",
      fontFamily: input.fontFamily || "Inter",
    },
  };
  const dataJsonPath = path.join(workDir, "data.json");
  await fs.writeFile(dataJsonPath, JSON.stringify(sceneData, null, 2), "utf8");
  onProgress?.(15);

  // 2. Start local HTTP server
  const port = 7400 + Math.floor(Math.random() * 200);
  const server = await startServer([
    { root: TEMPLATE_DIR, prefix: "" },
    { root: workDir, prefix: "_data/" },
  ], port);
  onLog?.(`Local server on port ${port}`);
  onProgress?.(20);

  // 3-5. Playwright render
  const webmPath = path.join(workDir, "video.webm");
  try {
    await renderInPlaywright(templateFile, sceneData, port, webmPath, onLog);
  } finally {
    server.close();
  }
  onProgress?.(50);
  onLog?.("Playwright render complete, converting to MP4...");

  // Convert webm → mp4 (no audio)
  const videoRawPath = path.join(workDir, "video-no-audio.mp4");
  await execFileP(FFMPEG_BIN, [
    "-y", "-i", webmPath,
    "-c:v", "libx264", "-preset", "fast", "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    videoRawPath,
  ], { stdio: "ignore" });
  onProgress?.(70);
  onLog?.("MP4 (no audio) ready");

  // 6. Concat audio — TTS step writes audio/{scene.id}.mp3
  const audioDir = path.join(workDir, "audio");
  const audioList = script.scenes.map((s) => path.join(audioDir, `${s.id}.mp3`));
  const audioConcatPath = path.join(workDir, "audio-concat.mp3");
  await concatAudio(audioList, audioConcatPath);
  onProgress?.(80);

  // 7. Mux
  const filename = (input.outputFilename || input.template) + ".mp4";
  const finalPath = path.join(workDir, filename);
  await execFileP(FFMPEG_BIN, [
    "-y",
    "-i", videoRawPath,
    "-i", audioConcatPath,
    "-c:v", "copy",
    "-c:a", "aac", "-b:a", "128k",
    "-shortest",
    "-movflags", "+faststart",
    finalPath,
  ], { stdio: "ignore" });
  onProgress?.(95);

  const stat = await fs.stat(finalPath);
  onProgress?.(100);
  onLog?.(`✓ Final MP4: ${filename} (${(stat.size / 1024).toFixed(1)} KB)`);

  return { path: finalPath, filename, size: stat.size };
}

function deriveHeading(voiceover, language) {
  if (!voiceover) return "";
  const cleaned = voiceover.replace(/[?.,!]/g, "").trim();
  const words = cleaned.split(/\s+/).slice(0, 6);
  return words.join(" ");
}

function startServer(mounts, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = req.url.split("?")[0];
      const tryServe = async (i) => {
        if (i >= mounts.length) {
          res.writeHead(404); res.end("Not found"); return;
        }
        const m = mounts[i];
        const prefix = "/" + m.prefix.replace(/^\/|\/$/g, "");
        const urlPath = prefix === "/" ? url : (url.startsWith(prefix) ? url.slice(prefix.length) : null);
        if (urlPath === null) return tryServe(i + 1);
        const filePath = path.join(m.root, urlPath === "/" ? "/index.html" : urlPath);
        if (!filePath.startsWith(m.root)) return tryServe(i + 1);
        try {
          await fs.access(filePath);
          const ext = path.extname(filePath).toLowerCase();
          const ct = { ".html": "text/html", ".json": "application/json" }[ext] || "application/octet-stream";
          res.writeHead(200, { "Content-Type": `${ct}; charset=utf-8` });
          fsSync.createReadStream(filePath).pipe(res);
        } catch {
          tryServe(i + 1);
        }
      };
      tryServe(0);
    });
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

async function renderInPlaywright(templateFile, sceneData, port, outWebm, onLog) {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: path.dirname(outWebm), size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();
  const totalSec = sceneData.scenes.reduce((a, s) => a + s.duration_ms, 0) / 1000;
  const maxWaitMs = (totalSec + 2.0) * 1000;

  page.on("pageerror", (err) => onLog?.(`[page error] ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") onLog?.(`[console] ${msg.text()}`);
  });

  const url = `http://127.0.0.1:${port}/${templateFile}?render=1&data=_data/data.json`;
  onLog?.(`Loading ${templateFile}...`);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__renderDone === true, null, { timeout: maxWaitMs });
  onLog?.(`All ${sceneData.scenes.length} scenes rendered (~${totalSec.toFixed(1)}s)`);
  await page.waitForTimeout(300);

  await context.close();
  await browser.close();

  // Find and rename the recorded webm
  const dir = path.dirname(outWebm);
  const webms = (await fs.readdir(dir)).filter((f) => f.endsWith(".webm"));
  if (webms.length === 0) throw new Error("Playwright did not produce a webm video");
  const src = path.join(dir, webms.sort().pop());
  await fs.rename(src, outWebm);
}

async function concatAudio(audioFiles, outPath) {
  const listPath = outPath + ".list.txt";
  const list = audioFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n");
  await fs.writeFile(listPath, list, "utf8");
  await execFileP(FFMPEG_BIN, [
    "-y", "-f", "concat", "-safe", "0",
    "-i", listPath,
    "-c", "copy",
    outPath,
  ], { stdio: "ignore" });
  await fs.unlink(listPath).catch(() => {});
}
