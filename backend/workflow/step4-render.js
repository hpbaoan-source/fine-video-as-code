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
import { isPathInside, isPathInsideResolved } from "../lib/path-guard.js";
import { resolveViewport, sizeArg } from "../lib/video-size.js";
import { normalizeScript } from "../lib/design-system.js";

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

// Hard cap on the number of PNG frames a single render may write.
// At 1080p a PNG is ~1–3 MB, so an unbounded frame count fills the
// disk within minutes. 1800 frames = 60 s of video at 30 fps.
const MAX_FRAMES = 3000;
// Never drop below this frame rate when the frame budget forces a
// downgrade — below ~20fps the motion starts to look broken.
const MIN_FPS = 20;

// Upper bound for the audio offset taken from the page. The
// templates are supposed to report the delay between the start of
// the recording and the *first* animation frame, but some of them
// report the whole render duration instead. Clamping keeps a
// broken value from delaying the audio past the end of the video.
const MAX_T0_OFFSET_MS = 2000;

// Browsers launched by this module — the server uses this list to
// close them on shutdown.
const activeBrowsers = new Set();

/**
 * Close every browser this module still has open (shutdown hook).
 */
export async function closeAllActiveBrowsers() {
  for (const browser of [...activeBrowsers]) {
    try {
      await browser.close();
    } catch {}
  }
  activeBrowsers.clear();
}

/**
 * Sanitize the audio offset reported by the template.
 * Non-numeric, negative or absurd values collapse to 0.
 */
export function clampT0Offset(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MAX_T0_OFFSET_MS, Math.round(n));
}

export async function step4Render({ script, input, workDir, onLog, onProgress }) {
  const templateFile = TEMPLATE_FILES[input.template];
  if (!templateFile) throw new Error(`Unknown template: ${input.template}`);

  const deterministic =
    input.deterministic !== undefined ? input.deterministic : DEFAULT_DETERMINISTIC;
  const fps = Number.isInteger(input.fps) ? input.fps : DEFAULT_FPS;
  // Viewport / output size derived from the requested resolution
  // and aspect ratio (the renderer used to hardcode 1920×1080).
  const viewport = resolveViewport(input.resolution, input.aspectRatio);

  onLog?.(
    `Loading HTML template: ${templateFile} (${deterministic ? "deterministic" : "realtime"})`
  );
  onLog?.(`Output size: ${viewport.width}×${viewport.height}`);
  onProgress?.(5);

  // 1. Write data.json. Source of truth for per-scene timing is
  //    script.scenes[i].duration_ms, which step 2 already
  //    overwrote with the actual measured TTS length (plus any
  //    padding to match the estimate). This is the same number we
  //    will use for both video and audio, so they cannot drift.
  // Normalise the script before it reaches the frame: the design
  // system trims every block to a budget the 1080p layout can hold
  // and picks the layout variant per scene. Without this a long
  // Vietnamese sentence silently runs off the canvas.
  const normalized = normalizeScript(script, {
    template: input.template,
    language: input.language,
  });
  if (normalized.report.length) {
    onLog?.(
      `Design system trimmed ${normalized.report.length} scene(s): ` +
        normalized.report
          .map((r) => `${r.scene} [${r.changes.join("; ")}]`)
          .join(" | ")
    );
  }
  const sceneData = {
    topic: input.topic || script.scenes?.[0]?.heading || "Video",
    scenes: normalized.script.scenes.map((s) => ({
      id: s.id,
      heading: s.heading || deriveHeading(s.voiceover, input.language),
      voiceover: s.voiceover,
      on_screen_text: s.on_screen_text,
      visual_cues: s.visual_cues || [],
      duration_ms: s.duration_ms || 3000,
      // Enrichment fields — passed through if the script defines
      // them; the templates will hide any element that has no value.
      badge: s.badge,
      subheading: s.subheading,
      // Caption under the heading: what the viewer is looking at.
      visual_cue: s.visual_cue,
      // Layout variant chosen by the design system (title | split | stack).
      layout: s.layout,
      bullets: s.bullets || [],
      metrics: s.metrics || [],
      codeSnippet: s.codeSnippet,
      diagram: s.diagram,
      flowArchitecture: s.flowArchitecture,
      sequenceFlow: s.sequenceFlow,
      hierarchyTree: s.hierarchyTree,
      compareMatrix: s.compareMatrix,
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
      const totalSec = totalMs / 1000;
      // Frame budget: the PNG frames are heavy, so the renderer
      // never writes more than MAX_FRAMES of them. A video that is
      // too long for the requested frame rate is rendered at a
      // slightly lower rate instead of failing outright.
      let effectiveFps = fps;
      let frameCount = Math.ceil(totalSec * effectiveFps);
      if (frameCount > MAX_FRAMES) {
        const downgraded = Math.floor(MAX_FRAMES / totalSec);
        if (downgraded < MIN_FPS) {
          throw new Error(
            `Render would need ${frameCount} frames (limit ${MAX_FRAMES}). ` +
              `Shorten the video (max ${Math.floor((MAX_FRAMES / MIN_FPS) * 10) / 10}s at ${MIN_FPS}fps) ` +
              `or lower the frame rate.`
          );
        }
        effectiveFps = downgraded;
        frameCount = Math.ceil(totalSec * effectiveFps);
        onLog?.(
          `Frame budget: lowering ${fps}fps to ${effectiveFps}fps to stay under ${MAX_FRAMES} frames`
        );
      }
      onLog?.(
        `Deterministic: ${frameCount} frames @ ${effectiveFps}fps (${totalSec.toFixed(1)}s)`
      );
      await renderDeterministic(
        templateFile, sceneData, port, framesDir, frameCount, viewport, onLog
      );
      t0OffsetMs = 0; // frames are already aligned to t=0
      onProgress?.(40);
      try {
        await encodePngsToMp4(framesDir, videoRawPath, effectiveFps, viewport, onLog);
      } finally {
        // The PNG frames are hundreds of MB — drop them as soon as
        // they are encoded.
        await fs.rm(framesDir, { recursive: true, force: true }).catch(() => {});
      }
    } else {
      const webmPath = path.join(workDir, "video.webm");
      t0OffsetMs = await renderInPlaywrightRealtime(
        templateFile, sceneData, port, webmPath, viewport, onLog
      );
      onProgress?.(40);
      onLog?.(`Realtime render complete (t0_offset=${t0OffsetMs}ms), converting to MP4...`);
      await execFileP(
        FFMPEG_BIN,
        [
          "-y", "-hide_banner", "-loglevel", "error", "-nostats",
          "-i", webmPath,
          "-c:v", "libx264", "-preset", "fast", "-crf", "23",
          "-pix_fmt", "yuv420p",
          "-s", sizeArg(viewport),
          "-movflags", "+faststart",
          videoRawPath,
        ],
        FFMPEG_OPTS
      );
    }
  } finally {
    // closeAllConnections() drops Chromium's keep-alive sockets —
    // without it the local server keeps the port alive.
    try {
      server.closeAllConnections?.();
    } catch {}
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

// Fallback title when a script has no explicit heading. A flat
// 6-word slice cut sentences in half ("Bạn dùng Git mỗi ngày nhưng"),
// which reads as broken copy on the card. Prefer the first complete
// sentence, capped at 8 words (Vietnamese is capped by characters —
// Vietnamese words are much longer than English ones).
function deriveHeading(voiceover, language) {
  if (!voiceover) return "";
  const firstSentence = voiceover.split(/(?<=[.!?])\s+/)[0] || voiceover;
  const cleaned = firstSentence.replace(/[?.,!]+$/g, "").trim();
  const words = cleaned.split(/\s+/);
  if (language === "vi") {
    if (cleaned.length <= 60) return cleaned;
    // Cut on a word boundary so the title never ends mid-word.
    const cut = cleaned.slice(0, 60);
    const lastSpace = cut.lastIndexOf(" ");
    return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).replace(/[,;:]$/, "");
  }
  if (words.length <= 8) return words.join(" ");
  return words.slice(0, 8).join(" ").replace(/[,;:]$/, "");
}

// Content types that are text and may carry a charset parameter.
// Binary assets (video, images, fonts) must not get one.
const TEXT_CONTENT_TYPES = new Set([
  "application/json",
  "application/javascript",
  "image/svg+xml",
]);

function contentTypeHeader(ct) {
  if (ct.startsWith("text/") || TEXT_CONTENT_TYPES.has(ct)) {
    return `${ct}; charset=utf-8`;
  }
  return ct;
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
          // Symlink check: a link inside the root that points
          // outside of it must not be served.
          if (!(await isPathInsideResolved(m.root, candidate))) {
            return tryServe(i + 1);
          }
          const ext = path.extname(candidate).toLowerCase();
          const ct =
                    {
                      ".html": "text/html",
                      ".json": "application/json",
                      ".js": "application/javascript",
                      ".css": "text/css",
                      ".svg": "image/svg+xml",
                      ".png": "image/png",
                      ".jpg": "image/jpeg",
                      ".jpeg": "image/jpeg",
                      ".gif": "image/gif",
                      ".webp": "image/webp",
                      ".mp3": "audio/mpeg",
                      ".wav": "audio/wav",
                      ".ogg": "audio/ogg",
                      ".mp4": "video/mp4",
                      ".webm": "video/webm",
                      ".ico": "image/x-icon",
                      ".woff2": "font/woff2",
                    }[ext] ||
                    "application/octet-stream";
          res.writeHead(200, { "Content-Type": contentTypeHeader(ct) });
          const stream = fsSync.createReadStream(candidate);
          // Without an error handler a mid-stream read failure
          // raises an unhandled 'error' event and kills the process.
          stream.on("error", () => {
            try {
              res.destroy();
            } catch {}
          });
          res.on("close", () => {
            if (!res.writableEnded) stream.destroy();
          });
          stream.pipe(res);
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
async function renderDeterministic(
  templateFile, sceneData, port, framesDir, frameCount, viewport, onLog
) {
  let browser = null;
  let context = null;
  const pages = [];
  try {
    browser = await chromium.launch({ headless: true, args: PLAYWRIGHT_ARGS });
    activeBrowsers.add(browser);
    context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      // No recordVideo — we screenshot per frame.
    });
    const url = `http://127.0.0.1:${port}/${templateFile}?render=1&deterministic=1&data=_data/data.json`;

    const initPage = async () => {
      const p = await context.newPage();
      p.on("pageerror", (err) => onLog?.(`[page error] ${err.message}`));
      p.on("console", (msg) => {
        if (msg.type() === "error") onLog?.(`[console] ${msg.text()}`);
      });
      await p.goto(url, { waitUntil: "domcontentloaded" });
      await p.waitForFunction(() => typeof window.__seek === "function", null, { timeout: 10000 });
      pages.push(p);
      return p;
    };

    onLog?.(`Loading ${templateFile}...`);
    const firstPage = await initPage();
    const totalMs = await firstPage.evaluate(() => window.__duration());
    const workerCount = frameCount >= 120 ? 4 : 1;
    onLog?.(`Engine ready, totalMs=${totalMs}, ${frameCount} frames (${workerCount} parallel worker(s))`);

    for (let w = 1; w < workerCount; w++) {
      await initPage();
    }

    const msPerFrame = totalMs / frameCount;
    const chunkSize = Math.ceil(frameCount / workerCount);
    await Promise.all(
      pages.map(async (p, idx) => {
        const start = idx * chunkSize;
        const end = Math.min(frameCount, start + chunkSize);
        for (let i = start; i < end; i++) {
          const tMs = Math.round(i * msPerFrame);
          await p.evaluate((t) => window.__seek(t), tMs);
          const framePath = path.join(framesDir, `frame-${String(i).padStart(5, "0")}.png`);
          await p.screenshot({ path: framePath, type: "png" });
        }
      })
    );
    return { totalMs, frameCount };
  } finally {
    for (const p of pages) {
      try { await p.close(); } catch {}
    }
    if (context) {
      try { await context.close(); } catch {}
    }
    if (browser) {
      try { await browser.close(); } catch {}
      activeBrowsers.delete(browser);
    }
  }
}

async function encodePngsToMp4(framesDir, outPath, fps, viewport, onLog) {
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
      "-s", sizeArg(viewport),
      "-movflags", "+faststart",
      outPath,
    ],
    FFMPEG_OPTS
  );
}

// Realtime fallback: record the page navigation as webm and let
// the page's setInterval animate. Faster on slow machines but
// not bit-for-bit reproducible.
async function renderInPlaywrightRealtime(
  templateFile, sceneData, port, outWebm, viewport, onLog
) {
  let browser = null;
  let context = null;
  try {
    browser = await chromium.launch({ headless: true, args: PLAYWRIGHT_ARGS });
    activeBrowsers.add(browser);
    context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      recordVideo: {
        dir: path.dirname(outWebm),
        size: { width: viewport.width, height: viewport.height },
      },
    });
    const page = await context.newPage();
    const totalSec = sceneData.scenes.reduce((a, s) => a + s.duration_ms, 0) / 1000;
    const maxWaitMs = (totalSec + 2.0) * 1000;

    page.on("pageerror", (err) => onLog?.(`[page error] ${err.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") onLog?.(`[console] ${msg.text()}`);
    });

    // Ask Playwright where the recording will be written. The path
    // is known up-front; the file itself is only finalized when the
    // context closes. Scanning the directory for "*.webm" could pick
    // up a stale recording from an earlier attempt.
    const video = page.video();
    const recordedPath = video ? await video.path() : null;

    const url = `http://127.0.0.1:${port}/${templateFile}?render=1&data=_data/data.json`;
    onLog?.(`Loading ${templateFile}...`);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__renderDone === true, null, { timeout: maxWaitMs });
    onLog?.(`All ${sceneData.scenes.length} scenes rendered (~${totalSec.toFixed(1)}s)`);
    await page.waitForTimeout(300);

    // Read the audio offset safely: the value is provided by the
    // template and may be missing, NaN or (with the current
    // templates) far too large. clampT0Offset() bounds it to
    // [0, 2000] ms so the audio can never drift past the video.
    const rawOffset = await page.evaluate(() => window.__t0_offset_ms);
    const t0OffsetMs = clampT0Offset(rawOffset);

    await context.close();
    context = null;
    const closedBrowser = browser;
    await browser.close();
    browser = null;
    activeBrowsers.delete(closedBrowser);

    const src = recordedPath
      ? await resolveRecordedVideo(recordedPath, path.dirname(outWebm))
      : null;
    if (!src) throw new Error("Playwright did not produce a webm video");
    await fs.rename(src, outWebm);
    return t0OffsetMs;
  } finally {
    if (context) {
      try { await context.close(); } catch {}
    }
    if (browser) {
      try { await browser.close(); } catch {}
      activeBrowsers.delete(browser);
    }
  }
}

/**
 * Make sure the recorded webm really exists. Falls back to the
 * newest *.webm in the directory when Playwright did not hand out a
 * path (older versions).
 */
async function resolveRecordedVideo(recordedPath, dir) {
  try {
    const stat = await fs.stat(recordedPath);
    if (stat.isFile() && stat.size > 0) return recordedPath;
  } catch {}
  const webms = (await fs.readdir(dir).catch(() => []))
    .filter((f) => f.endsWith(".webm"))
    .map((f) => path.join(dir, f));
  if (webms.length === 0) return null;
  // Pick the newest file, not the lexicographically last one.
  const stats = await Promise.all(
    webms.map(async (f) => ({ f, mtime: (await fs.stat(f).catch(() => ({ mtimeMs: 0 }))).mtimeMs }))
  );
  stats.sort((a, b) => b.mtime - a.mtime);
  return stats[0].f;
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
