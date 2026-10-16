// ──────────────────────────────────────────────────────────────
// Template: tutorial
// ──────────────────────────────────────────────────────────────
// Step-by-step UI mock with progress indicator, "Step N of M"
// counter, and code/UI visual blocks.
// ──────────────────────────────────────────────────────────────

import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";

const FONT = "Inter, system-ui, -apple-system, sans-serif";

export const Tutorial = ({ script, durations, brand }) => {
  const { fps } = useVideoConfig();
  let acc = 0;
  return (
    <AbsoluteFill style={{ background: "#0f1115", fontFamily: brand?.fontFamily || FONT }}>
      {script.scenes.map((scene, i) => {
        const dur = durations.scenes.find((d) => d.id === scene.id);
        const from = acc;
        const length = dur?.durationInFrames || scene.duration_ms * fps / 1000;
        acc += length;
        return (
          <Sequence key={scene.id} from={from} durationInFrames={length}>
            <TutorialScene scene={scene} index={i} total={script.scenes.length} brand={brand} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const TutorialScene = ({ scene, index, total, brand }) => {
  const frame = useCurrentFrame();
  const slide = interpolate(frame, [0, 15], [60, 0], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });

  // Progress bar: filled proportional to scene position
  const progress = (index + 1) / total;

  return (
    <AbsoluteFill style={{ background: "#0f1115" }}>
      {/* Top progress bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: "#2a2e36" }}>
        <div style={{ height: "100%", width: `${progress * 100}%`, background: brand?.brandColor || "#3B82F6" }} />
      </div>

      <div style={{
        position: "absolute", top: 80, left: 80, right: 80,
        opacity, transform: `translateX(${slide}px)`,
      }}>
        {/* Step counter */}
        <div style={{
          display: "inline-block", padding: "8px 16px",
          background: brand?.accentColor || "#F59E0B", color: "#0f1115",
          fontSize: 24, fontWeight: 700, borderRadius: 4, marginBottom: 24,
        }}>
          STEP {index + 1} / {total}
        </div>
        {/* Headline */}
        <div style={{
          color: "#e6e6e6", fontSize: 80, fontWeight: 700, lineHeight: 1.1,
          letterSpacing: "-0.02em", marginBottom: 24,
        }}>
          {scene.on_screen_text || scene.voiceover.split(/[.,]/)[0]}
        </div>
        {/* Subtext */}
        <div style={{ color: "#9aa0a8", fontSize: 36, lineHeight: 1.4, maxWidth: 1400 }}>
          {scene.voiceover}
        </div>
      </div>

      {/* Visual cue area (bottom) */}
      <div style={{
        position: "absolute", bottom: 80, left: 80, right: 80,
        display: "flex", gap: 16,
      }}>
        {scene.visual_cues.slice(0, 3).map((cue, i) => (
          <div key={i} style={{
            flex: 1, padding: 20, borderRadius: 8,
            background: "#1a1d23", border: "1px solid #2a2e36",
            color: "#e6e6e6", fontSize: 20, fontFamily: cue.type === "code" ? "monospace" : "inherit",
          }}>
            <div style={{ color: brand?.accentColor || "#F59E0B", fontSize: 14, fontWeight: 600, marginBottom: 8, textTransform: "uppercase" }}>
              {cue.type}
            </div>
            {cue.content}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

export default Tutorial;
