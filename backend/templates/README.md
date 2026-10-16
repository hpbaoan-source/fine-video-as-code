# Backend templates

Remotion composition entry points, one per built-in template.

| File | Template | Visual style |
|---|---|---|
| `tech-explainer.jsx` | tech-explainer | Dark editorial, big text, brand-color bar |
| `promo.jsx` | promo | Fast cuts, alternating brand color, big pop-in |
| `tutorial.jsx` | tutorial | Step counter, progress bar, UI mock blocks |

All templates are React components that read `script`, `durations`, and `brand` from props (passed at render time). They don't hardcode content — every video is generated dynamically.
