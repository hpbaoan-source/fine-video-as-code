# Remotion templates

> **Status:** 🚧 Placeholder — sẽ implement ở Phase 3.

Mỗi template là một Remotion composition. Khi user chọn template ở form, backend sẽ bundle + render composition tương ứng.

| Template | Folder | Status |
|----------|--------|--------|
| Tech Explainer | `tech-explainer/` | M3 |
| Promo / Ad | `promo-ad/` | M3 |
| Tutorial | `tutorial/` | M3 |

Mỗi folder chứa:

- `Composition.tsx` — Remotion component chính
- `index.ts` — re-export
- `assets/` — hình ảnh / icon template-specific
- `schema.ts` — Zod schema cho input của composition
