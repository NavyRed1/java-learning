# JavaPath: interactive Java learning platform

Curriculum authority: roadmap.sh/java (80 nodes, frozen in `data/curriculum/roadmap-sh-nodes.json`). Baseline: the Sagar roadmap (traceability in `data/baseline`). See `docs/` for specs, architecture, ADRs and the design system.

## Commands
| Command | What it does | Needs |
|---|---|---|
| `npm run validate:curriculum` | structure + authored-content gate | Node >= 22.18 |
| `npm test` | 100+ unit tests (progress engine, geometry, tokenizer, nav, contrast) | Node >= 22.18 |
| `npm run typecheck` | full strict check including TSX | `npm install` (@types/react) |
| `npm run typecheck:logic` | strict check of non-React code | @types/node |
| `npm run preview` | esbuild bundle + static server (no Next needed) | esbuild |
| `npm run test:e2e` | 19 browser tests in Chromium | playwright + esbuild |
| `npm run dev` / `build` | Next.js app (`src/app`) | `npm install` (not verified in this environment) |
| `npm run check:fonts` | lists which of the six font files are missing from `public/fonts` | Node |
| `npm run gen:content` | regenerate the lazy content registry after adding `data/content/<topic>.json` | Node |
