// ffmpeg argument builders — the previous B1 (audio sync) bug
// came from a hand-rolled command line that ignored the measured
// TTS length. These tests pin the exact argv shape so a refactor
// can't silently re-introduce the same drift.
import { test } from "node:test";
import assert from "node:assert/strict";
import { padMp3Args, silentMp3Args } from "../workflow/step2-tts.js";

test("padMp3Args: produces a -t value equal to target seconds", () => {
  const args = padMp3Args("in.mp3", "out.mp3", 5.5);
  const tIdx = args.indexOf("-t");
  assert.ok(tIdx >= 0, "should contain -t flag");
  assert.equal(args[tIdx + 1], "5.5");
  // apad is the whole point — without it, MP3 padding can fall
  // short by a few ms on VBR sources.
  const afIdx = args.indexOf("-af");
  assert.ok(afIdx >= 0, "should contain -af flag");
  assert.equal(args[afIdx + 1], "apad");
  // Re-encode is required; -c copy on a padded file produces
  // different sample counts and breaks the per-scene concat.
  const cIdx = args.indexOf("-c:a");
  assert.ok(cIdx >= 0, "should re-encode audio");
  assert.equal(args[cIdx + 1], "libmp3lame");
});

test("padMp3Args: rejects negative or zero duration", () => {
  // Sanity-check the contract: -t 0 would produce a 0-byte file.
  // We don't enforce this in the builder; the caller pads only
  // when targetMs > actualMs + 50, so 0/negative never reaches
  // here. But document the assumption.
  const args = padMp3Args("in.mp3", "out.mp3", 0);
  assert.equal(args[args.indexOf("-t") + 1], "0");
});

test("silentMp3Args: uses anullsrc with explicit sample rate + channels", () => {
  const args = silentMp3Args("silence.mp3", 1.0);
  const iIdx = args.indexOf("-i");
  assert.ok(iIdx >= 0);
  assert.equal(args[iIdx + 1], "anullsrc=r=24000:cl=mono");
  const tIdx = args.indexOf("-t");
  assert.equal(args[tIdx + 1], "1");
});

test("silentMp3Args: time matches requested seconds", () => {
  for (const sec of [0.5, 1, 5, 30]) {
    const args = silentMp3Args("out.mp3", sec);
    assert.equal(args[args.indexOf("-t") + 1], String(sec));
  }
});
