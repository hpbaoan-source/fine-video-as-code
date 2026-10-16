// ──────────────────────────────────────────────────────────────
// Remotion entry point — single root, multiple compositions
// ──────────────────────────────────────────────────────────────
// This is the file passed to `bundle()`. It imports all
// composition components and registers a Root that returns
// each one with the right `<Composition id="...">` wrapper.
//
// At render time, `selectComposition()` picks the one matching
// the user's template choice.
// ──────────────────────────────────────────────────────────────

import React from "react";
import { Composition, registerRoot } from "remotion";

import { TechExplainer } from "./tech-explainer.jsx";
import { Promo } from "./promo.jsx";
import { Tutorial } from "./tutorial.jsx";

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

// Composition IDs are camelCase of template names
//   tech-explainer → TechExplainer
//   promo         → Promo
//   tutorial      → Tutorial

// We expose a generic composition size based on the user input.
// (Remotion requires a fixed Composition; we set a generous
// max and the actual durationInFrames is computed at render
// time from the script.)
const DEFAULT_DURATION_SEC = 60;

const Root = () => (
  <>
    <Composition
      id="TechExplainer"
      component={TechExplainer}
      durationInFrames={DEFAULT_DURATION_SEC * FPS}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{ script: { scenes: [] }, durations: { scenes: [] }, brand: {} }}
    />
    <Composition
      id="Promo"
      component={Promo}
      durationInFrames={DEFAULT_DURATION_SEC * FPS}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{ script: { scenes: [] }, durations: { scenes: [] }, brand: {} }}
    />
    <Composition
      id="Tutorial"
      component={Tutorial}
      durationInFrames={DEFAULT_DURATION_SEC * FPS}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{ script: { scenes: [] }, durations: { scenes: [] }, brand: {} }}
    />
  </>
);

registerRoot(Root);
