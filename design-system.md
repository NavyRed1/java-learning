# Design System

Living reference: run the preview and open `/design`. Source: `src/styles/*.css`, `src/components/ui/*`.

## Principles
Two themes (dark and light) from the brief palette: primary #2196F3, secondary #4647AE, text #112E81 on light surfaces, a deep navy ramp in dark. Restrained glass communicates hierarchy (panels, cards, popovers); surfaces never go pure black. Type: DM Serif Display for display, DM Sans for UI, JetBrains Mono for code (see `typography.md`; font files still need to be added). Motion rules and the completion sequence are in `motion-and-audio.md`. Density is high but not cramped: this is a study tool, not a marketing page.

## Tokens (`tokens.css`)
| Group | Tokens |
|---|---|
| Surfaces | `--c-bg`, `--c-bg-raised`, `--c-surface`, `--c-surface-2`, `--c-surface-3`, `--c-line`, `--c-line-strong`; glass: `--glass-bg`, `--glass-bg-strong`, `--glass-border`, `--glass-blur` |
| Text | `--c-text`, `--c-text-2`, `--c-text-3` (all >= 4.5:1 on every surface; enforced by `tokens.test.ts`) |
| Brand and accent | brand constants `--c-primary`, `--c-secondary`, `--c-success`, `--c-warning`, `--c-error`; legible text variants `--c-accent`, `--c-secondary-text`, `--c-ok`, `--c-warn`, `--c-danger` |
| Phase identity | `--c-phase-1..4`: low-chroma tints for numerals and strips only |
| Code | `--c-code-*` (legibility tested) |
| Type | `--font-display`, `--font-body`, `--font-mono`, `--fw-regular/medium/semi`, `--fs-2xs .. --fs-display`, `--lh-*`, `--track-*` |
| Space / shape | `--s-1..12` (4px base), `--r-xs..xl`, `--bw` |
| Motion / layout | `--ease`, `--ease-spring`, `--dur-1..4`, `--lift`, `--topbar-h`, `--nav-w`, `--panel-w`, `--tap` (44px) |

## Components
| Component | Notes |
|---|---|
| `Button`, `IconButton` | variants primary / secondary / ghost / quiet; sizes sm / md / lg; pressed state moves 1px; icon-only buttons require a `label`; 44px minimum on touch |
| `Badge`, `Chip` | badge tones neutral / outline / accent / ok / warn / danger; chip is a toggle with `aria-pressed` and optional count |
| `ProgressBar`, `ProgressRing`, `StatusGlyph`, `DifficultyPips` | all expose `role="progressbar"` or a text label; status is never colour-only (ring, half, check) |
| `Callout`, `EmptyState`, `Skeleton` | empty states say what it is, why it is empty, what to do |
| `SearchField`, `TabList` | tablist implements arrow / Home / End; panels are rendered by the parent |
| `Drawer` | left drawer (tablet) or bottom sheet (mobile); focus trap, Esc, scrim click, scroll lock, focus restore |
| `CodeBlock` | Java / shell / text tokenizer (data, not HTML), line numbers, line highlighting, copy |
| `Prose` / `Inline` | paragraphs and `code` spans only, so authored content cannot inject markup |

## Roadmap-specific components
| Component | Communicates |
|---|---|
| `PhaseHeader` (in `RoadmapCanvas`) | phase number, name, weeks, progress |
| Module lane | module (milestone) title, count, rail marker: hollow / filled check / ember ring for "you are here" |
| `RoadmapNode` | status glyph, title, minutes, difficulty, mastery, "overview" depth; dashed = prerequisites still open; solid = ready; accent fill = selected; ember flag = Resume / Next |
| Relationship lines | hover or select a node: prerequisites in ember (arrow into the node), topics that build on it dashed grey (arrow out); everything else dims. Direct edges only, drawn on demand to avoid a 110-line tangle |
| Navigation tree | phase > module > topic with counts, search, status filter, arrow-key movement |

## Layout
Desktop >= 1180px: navigation | map | topic panel, each scrolling independently, progress in the top bar. Tablet 768-1179px: map | panel, navigation in a drawer. Mobile < 768px: Roadmap / Topics / Progress bottom tabs; topic detail opens as a bottom sheet.

## Screenshots
`docs/screenshots/01..07`. Regenerate by running the preview and the capture steps in `e2e/`.

## Added in the visual-language pass
Tab sliding indicator; purpose-coloured section cards (learning, code, warning, practice, mastery, prerequisite, resource); progress ring on nodes with a micro bar; journey bar (four phase segments) with counting numbers; theme toggle (approved clip) and sound popover; success badge, hourglass and 404 art (approved clips); editable practice attempt with progressive hints and a self-check; code blocks with file/language chips, expand/collapse, an honestly disabled "Run" and documented output/error regions.
