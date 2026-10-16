// ──────────────────────────────────────────────────────────────
// Template: promo
// ──────────────────────────────────────────────────────────────
// Fast cuts, big text, dramatic color use. Each scene has a
// full-screen colored background, big headline, and 1-2
// supporting text lines.
// ──────────────────────────────────────────────────────────────

import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";

const FONT = "Inter, system-ui, -apple-system, sans-serif";

export const Promo = ({ script, durations, brand }) => {
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
            <PromoScene scene={scene} index={i} brand={brand} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const PromoScene = ({ scene, index, brand }) => {
  const frame = useCurrentFrame();
  // Big pop-in animation: 0 → 0.3s
  const scale = interpolate(frame, [0, 9], [0.92, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.back(1.4)) });
  const opacity = interpolate(frame, [0, 6], [0, 1], { extrapolateRight: "clamp" });

  // Alternate between dark and brand color for dramatic contrast
  const bg = index % 2 === 0 ? (brand?.brandColor || "#3B82F6") : "#0f1115";
  const fg = index % 2 === 0 ? "#ffffff" : (brand?.accentColor || "#F59E0B");

  return (
    <AbsoluteFill style={{
      background: bg, display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        opacity, transform: `scale(${scale})`,
        textAlign: "center", maxWidth: "85%",
      }}>
        <div style={{
          color: fg, fontSize: 96, fontWeight: 800, lineHeight: 1.1,
          letterSpacing: "-0.03em", textTransform: "uppercase",
          textShadow: index % 2 === 0 ? "0 4px 20px rgba(0,0,0,0.3)" : "none",
        }}>
          {scene.on_screen_text || scene.voiceover.split(" ").slice(0, 3).join(" ")}
        </div>
        {scene.visual_cues[0] && (
          <div style={{
            marginTop: 32, color: index % 2 === 0 ? "rgba(255,255,255,0.8)" : "#9aa0a8",
            fontSize: 32, fontWeight: 500,
          }}>
            {scene.visual_cues[0].content}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

export default Promo;
