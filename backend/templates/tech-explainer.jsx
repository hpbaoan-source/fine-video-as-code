// ──────────────────────────────────────────────────────────────
// Template: tech-explainer
// ──────────────────────────────────────────────────────────────
// Dynamic Remotion composition. Reads `script` + `durations`
// from props and renders each scene as a <Sequence>.
//
// Visual style: dark background, big on-screen text, simple
// animated visual cues, scene counter bottom-right.
// ──────────────────────────────────────────────────────────────

import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, Audio, interpolate, Easing } from "remotion";

const FONT = "Inter, system-ui, -apple-system, sans-serif";

export const TechExplainer = ({ script, durations, brand }) => {
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
            <Scene
              scene={scene}
              index={i}
              total={script.scenes.length}
              brand={brand}
            />
            {dur?.audio_path ? <SceneAudio path={dur.audio_path} durations={durations} workDir={durations._workDir} /> : null}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const Scene = ({ scene, index, total, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const duration = scene.duration_ms * fps / 1000;
  const t = frame / fps;

  // Fade in: 0 → 0.4s
  const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  // Slide up: 0 → 0.4s
  const ty = interpolate(frame, [0, 12], [40, 0], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });

  return (
    <AbsoluteFill style={{ background: "#0f1115" }}>
      {/* Brand color bar at top */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 8,
        background: brand?.brandColor || "#3B82F6",
      }} />
      {/* Accent bar at bottom */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 4,
        background: brand?.accentColor || "#F59E0B", opacity: 0.6,
      }} />
      {/* On-screen text */}
      <div style={{
        position: "absolute", top: 80, left: 80, right: 80,
        opacity, transform: `translateY(${ty}px)`,
        color: "#e6e6e6", fontSize: 72, fontWeight: 600,
        letterSpacing: "-0.02em", lineHeight: 1.15,
      }}>
        {scene.on_screen_text || scene.voiceover.slice(0, 80)}
      </div>
      {/* Visual cue badges */}
      <div style={{
        position: "absolute", bottom: 80, left: 80, right: 80,
        display: "flex", gap: 12, flexWrap: "wrap",
      }}>
        {scene.visual_cues.map((cue, i) => (
          <div key={i} style={{
            padding: "10px 18px", borderRadius: 6,
            background: "rgba(255,255,255,0.05)",
            border: `1px solid ${brand?.accentColor || "#F59E0B"}`,
            color: "#e6e6e6", fontSize: 22, fontWeight: 500,
          }}>
            {cue.type}: {cue.content}
          </div>
        ))}
      </div>
      {/* Scene counter */}
      <div style={{
        position: "absolute", bottom: 24, right: 24,
        color: "#6b7280", fontSize: 18, fontFamily: "monospace",
      }}>
        {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </div>
    </AbsoluteFill>
  );
};

const SceneAudio = ({ path }) => {
  // Note: Remotion's <Audio> needs a URL it can fetch. In
  // production we'd serve audio via a static mount. For the
  // smoke test this is left as a no-op.
  if (!path) return null;
  // The full path will be passed via staticUrl at render time.
  return null;
};

export default TechExplainer;
