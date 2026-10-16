// ──────────────────────────────────────────────────────────────
// Step 4 — Render: Playwright → webm/png → mp4, then TTS mux
// ──────────────────────────────────────────────────────────────
// Pipeline:
//   1. Write data.json (scene list + brand) into workDir.
//   2. Spin up a per-job local HTTP server on 127.0.0.1 (port
//      chosen by the OS via listen(0) to avoid collisions).
//   3. Launch Playwright (Chromium), load the template HTML.
//   4. Either:
//        a) DETERMINISTIC: drive the animation via
//           window.__seek(t_ms) and take a screenshot for every
//           frame. Output is identical for identical input — same
//           ffmpeg PNG stream, same hashes. (default)
//        b) REALTIME:      let the page's setInterval animate
//           and record the navigation as webm via Playwright's
//           recordVideo. Slightly faster on slow machines but
//           the output varies between runs.
//   5. Convert PNG stream (or webm) to mp4 (h264, faststart).
//   6. Concat the per-scene MP3s (each is pre-padded to its
//      duration_ms in step 2, so -c copy is safe).
//   7. Mux the audio into the mp4. In deterministic mode, audio
//      starts at 0 (frames are perfectly aligned). In realtime
//      mode, audio is delayed by -itsoffset <t0_offset_ms> so
//      the first syllable lines up with the first animation
//      frame.
// ──────────────────────────────────────────────────────────────

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
import { isPathInside } from "../lib/path-guard.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const execFileP = promisify(execFile);
const FFMPEG_BIN = ffmpegStatic;
const FFMPEG_OPTS = { maxBuffer: 5 * 1024 * 1024, windowsHide: true };

const TEMPLATE_DIR = path.join(__dirname, "..", "templates");
const TEMPLATE_FILES = {
  "tech-explainer": "tech-explainer.html",
  promo: "promo.html",
  tutorial: "tutorial.html",
};

const PLAYWRIGHT_ARGS = process.env.PLAYWRIGHT_NO_SANDBOX === "1" ? ["--no-sandbox"] : [];
// Default to deterministic rendering. The realtime fallback is
// available via `input.deterministic: false` or DETERMINISTIC_RENDER=0.
const DEFAULT_DETERMINISTIC = process.env.DETERMINISTIC_RENDER !== "0";
// Frame rate for the deterministic path. 30 fps matches the CSS
// transition timings in the templates; 60 fps gives smoother
// motion at higher cost.
const DEFAULT_FPS = Number.parseInt(process.env.RENDER_FPS || "30", 10);

export async function step4Render({ script, input, workDir, onLog, onProgress }) {
  const templateFile = TEMPLATE_FILES[input.template];
  if (!templateFile) throw new Error(`Unknown template: ${input.template}`);

  const deterministic =
    input.deterministic !== undefined ? input.deterministic : DEFAULT_DETERMINISTIC;
  const fps = Number.isInteger(input.fps) ? input.fps : DEFAULT_FPS;

  onLog?.(`Loading HTML template: ${templateFile} (${deterministic ? "deterministic" : "realtime"})`);
  onProgress?.(5);

  // 1. Write data.json. Source of truth for per-scene timing is
  //    script.scenes[i].duration_ms, which step 2 already
  //    overwrote with the actual measured TTS length (plus any
  //    padding to match the estimate). This is the same number we
  //    will use for both video and audio, so they cannot drift.
  const sceneData = {
    topic: input.topic || script.scenes?.[0]?.heading || "Video",
    scenes: script.scenes.map((s) => ({
      id: s.id,
      heading: s.heading || deriveHeading(s.voiceover, input.language),
      voiceover: s.voiceover,
      on_screen_text: s.on_screen_text,
      visual_cues: s.visual_cues,
      duration_ms: s.duration_ms || 3000,
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

  // 2. Start a per-job local HTTP server. listen(0) lets the OS
  //    pick a free port; we read it from server.address() so two
  //    concurrent jobs cannot collide.
  const server = await startServer([
    { root: TEMPLATE_DIR, prefix: "" },
    { root: workDir, prefix: "_data/" },
  ]);
  const port = server.address().port;
  onLog?.(`Local server on 127.0.0.1:${port}`);
  onProgress?.(20);

  // 3-5. Playwright render. In deterministic mode, we save a
  // sequence of PNGs and ffmpeg-encodes them straight to mp4.
  // In realtime mode, recordVideo produces a webm which we then
  // transcode to mp4.
  const videoRawPath = path.join(workDir, "video-no-audio.mp4");
  let t0OffsetMs = 0;
  try {
    if (deterministic) {
      const totalMs = sceneData.scenes.reduce((a, s) => a + s.duration_ms, 0);
      const framesDir = path.join(workDir, "frames");
      await fs.mkdir(framesDir, { recursive: true });
      const frameCount = Math.ceil((totalMs / 1000) * fps);
      onLog?.(`Deterministic: ${frameCount} frames @ ${fps}fps (${(totalMs / 1000).toFixed(1)}s)`);
      const result = await renderDeterministic(templateFile, sceneData, port, framesDir, frameCount, onLog);
      t0OffsetMs = 0; // frames are already aligned to t=0
      onProgress?.(40);
      await encodePngsToMp4(framesDir, videoRawPath, fps, onLog);
    } else {
      const webmPath = path.join(workDir, "video.webm");
      t0OffsetMs = await renderInPlaywrightRealtime(templateFile, sceneData, port, webmPath, onLog);
      onProgress?.(40);
      onLog?.(`Realtime render complete (t0_offset=${t0OffsetMs}ms), converting to MP4...`);
      await execFileP(
        FFMPEG_BIN,
        [
          "-y", "-hide_banner", "-loglevel", "error", "-nostats",
          "-i", webmPath,
          "-c:v", "libx264", "-preset", "fast", "-crf", "23",
          "-pix_fmt", "yuv420p",
          "-movflags", "+faststart",
          videoRawPath,
        ],
        FFMPEG_OPTS
      );
    }
  } finally {
    server.close();
  }
  onProgress?.(70);
  onLog?.("MP4 (no audio) ready");

  // 6. Concat audio. Each per-scene MP3 has been padded to its
  //    duration_ms in step 2, so all clips are now exactly as
  //    long as the video expects. -c copy is safe.
  const audioDir = path.join(workDir, "audio");
  const audioList = script.scenes.map((s) => path.join(audioDir, `${s.id}.mp3`));
  const audioConcatPath = path.join(workDir, "audio-concat.mp3");
  await concatAudio(audioList, audioConcatPath);
  onProgress?.(80);

  // 7. Mux. In deterministic mode, the audio starts at 0 (frames
  //    are taken at exact t_ms, so the first frame at t=0
  //    corresponds to the empty intro state — we accept that
  //    ~50ms of empty start). In realtime mode, audio is
  //    delayed by t0OffsetMs so the first syllable lines up.
  const filename = (input.outputFilename || input.template) + ".mp4";
  const finalPath = path.join(workDir, filename);
  const itsoffsetArgs =
    !deterministic && t0OffsetMs > 50 ? ["-itsoffset", (t0OffsetMs / 1000).toFixed(3)] : [];
  await execFileP(
    FFMPEG_BIN,
    [
      "-y", "-hide_banner", "-loglevel", "error", "-nostats",
      "-i", videoRawPath,
      ...itsoffsetArgs,
      "-i", audioConcatPath,
      "-map", "0:v:0", "-map", "1:a:0",
      "-c:v", "copy",
      "-c:a", "aac", "-b:a", "128k",
      "-shortest",
      "-movflags", "+faststart",
      finalPath,
    ],
    FFMPEG_OPTS
  );
  onProgress?.(95);

  const stat = await fs.stat(finalPath);
  onProgress?.(100);
  onLog?.(`✓ Final MP4: ${filename} (${(stat.size / 1024).toFixed(1)} KB)`);

  return { path: finalPath, filename, size: stat.size, t0OffsetMs, deterministic };
}

function deriveHeading(voiceover, language) {
  if (!voiceover) return "";
  const cleaned = voiceover.replace(/[?.,!]/g, "").trim();
  const words = cleaned.split(/\s+/).slice(0, 6);
  return words.join(" ");
}

// Minimal static file server for the render job. Serves files from
// `mounts` (each with a URL prefix). listen(0) lets the OS pick a
// port; the caller reads it via server.address().port.
function startServer(mounts) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = req.url.split("?")[0];
      const tryServe = async (i) => {
        if (i >= mounts.length) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const m = mounts[i];
        const prefix = "/" + m.prefix.replace(/^\/|\/$/g, "");
        const urlPath =
          prefix === "/" ? url : url.startsWith(prefix) ? url.slice(prefix.length) : null;
        if (urlPath === null) return tryServe(i + 1);
        const candidate = path.join(m.root, urlPath === "/" ? "/index.html" : urlPath);
        if (!isPathInside(m.root, candidate)) return tryServe(i + 1);
        try {
          await fs.access(candidate);
          const ext = path.extname(candidate).toLowerCase();
          const ct =
            { ".html": "text/html", ".json": "application/json", ".js": "application/javascript" }[ext] ||
            "application/octet-stream";
          res.writeHead(200, { "Content-Type": `${ct}; charset=utf-8` });
          fsSync.createReadStream(candidate).pipe(res);
        } catch {
          tryServe(i + 1);
        }
      };
      tryServe(0);
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

// Deterministic render: for each frame, advance the page's
// internal clock via window.__seek and screenshot. The page is
// already populated with scene DOM by the time __seek is called.
// Output: a sequence of PNGs in `framesDir`, one per frame.
async function renderDeterministic(templateFile, sceneData, port, framesDir, frameCount, onLog) {
  let browser = null;
  let context = null;
  let page = null;
  try {
    browser = await chromium.launch({ headless: true, args: PLAYWRIGHT_ARGS });
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      // No recordVideo — we screenshot per frame.
    });
    page = await context.newPage();
    page.on("pageerror", (err) => onLog?.(`[page error] ${err.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") onLog?.(`[console] ${msg.text()}`);
    });

    const url = `http://127.0.0.1:${port}/${templateFile}?render=1&data=_data/data.json`;
    onLog?.(`Loading ${templateFile}...`);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    // Wait for the engine to be ready and DOM to be built.
    await page.waitForFunction(() => typeof window.__seek === "function", null, { timeout: 10000 });
    const totalMs = await page.evaluate(() => window.__duration());
    onLog?.(`Engine ready, totalMs=${totalMs}, ${frameCount} frames`);

    const msPerFrame = totalMs / frameCount;
    for (let i = 0; i < frameCount; i++) {
      const tMs = Math.round(i * msPerFrame);
      await page.evaluate((t) => window.__seek(t), tMs);
      // No animation waits needed: __seek sets state directly.
      const framePath = path.join(framesDir, `frame-${String(i).padStart(5, "0")}.png`);
      await page.screenshot({ path: framePath, type: "png" });
    }
    return { totalMs, frameCount };
  } finally {
    if (page) {
      try { await page.close(); } catch {}
    }
    if (context) {
      try { await context.close(); } catch {}
    }
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
}

async function encodePngsToMp4(framesDir, outPath, fps, onLog) {
  // ffmpeg -framerate FPS -i frame-%05d.png -c:v libx264 ...
  // -framerate on the input side tells ffmpeg to interpret the
  // PNG sequence as fps frames per second. The output is
  // implicitly the same rate, but we set -r to be explicit.
  onLog?.(`Encoding ${(await fs.readdir(framesDir)).length} PNGs to MP4 @ ${fps}fps...`);
  await execFileP(
    FFMPEG_BIN,
    [
      "-y", "-hide_banner", "-loglevel", "error", "-nostats",
      "-framerate", String(fps),
      "-i", path.join(framesDir, "frame-%05d.png"),
      "-c:v", "libx264", "-preset", "fast", "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-r", String(fps),
      "-movflags", "+faststart",
      outPath,
    ],
    FFMPEG_OPTS
  );
}

// Realtime fallback: record the page navigation as webm and let
// the page's setInterval animate. Faster on slow machines but
// not bit-for-bit reproducible.
async function renderInPlaywrightRealtime(templateFile, sceneData, port, outWebm, onLog) {
  let browser = null;
  let context = null;
  try {
    browser = await chromium.launch({ headless: true, args: PLAYWRIGHT_ARGS });
    context = await browser.newContext({
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

    const t0OffsetMs = await page.evaluate(() => window.__t0_offset_ms || 0);
    await context.close();
    context = null;
    await browser.close();
    browser = null;

    const dir = path.dirname(outWebm);
    const webms = (await fs.readdir(dir)).filter((f) => f.endsWith(".webm"));
    if (webms.length === 0) throw new Error("Playwright did not produce a webm video");
    const src = path.join(dir, webms.sort().pop());
    await fs.rename(src, outWebm);
    return t0OffsetMs;
  } finally {
    if (context) {
      try { await context.close(); } catch {}
    }
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
}

async function concatAudio(audioFiles, outPath) {
  const listPath = outPath + ".list.txt";
  const list = audioFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n");
  await fs.writeFile(listPath, list, "utf8");
  await execFileP(
    FFMPEG_BIN,
    [
      "-y", "-hide_banner", "-loglevel", "error", "-nostats",
      "-f", "concat", "-safe", "0",
      "-i", listPath,
      "-c", "copy",
      outPath,
    ],
    FFMPEG_OPTS
  );
  await fs.unlink(listPath).catch(() => {});
}
