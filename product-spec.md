# Product Specification: Interactive Java Learning Platform

## 1. Objective

A Java-only learning platform taking a learner from beginner to advanced through a structured, interactive roadmap. Core loop:

ROADMAP → TOPIC → UNDERSTAND → SEE CODE → PRACTICE → MASTER → COMPLETE → CONTINUE

Users: self-directed learners (beginner to intermediate), using desktop and mobile. v1 has no accounts; progress lives in the browser.

Success: a learner can open the app, see where they are, study a topic fully, practice it, prove mastery, and be told what to do next, with progress persisting across reloads.

## 2. Scope and assumptions

Assumptions (correct me before Prompt 3):
1. Next.js App Router + TypeScript + Tailwind, Vercel-hosted; static content data under `/data`.
2. v1 persistence is localStorage only; no auth, analytics, or backend.
3. Java execution is **not** available in v1 unless a real backend is built; the UI states this honestly behind an execution abstraction.
4. Original branding, copy, code, and visuals; nothing copied from either reference.
5. Curriculum is Java-specific (see `curriculum-spec.md`).

Non-goals (v1): accounts, cross-device sync, social features, non-Java tracks, fake code execution.

## 3. Information architecture

Routes: `/` (home + continue learning), `/roadmap` (three-column workspace), `/topic/[id]` (full page), `/examples`, `/editor`, `/quiz` (+ phase/topic/review), `/resources`, `/checklist`, `/plan` (12 weeks + habits), `/projects`, global search (command palette).

## 4. Core UX

**Desktop three-column workspace**
- Left: phases → milestones → topics tree, search/filter, progress.
- Center: interactive roadmap graph with topic nodes, dependency edges, completion state, current position.
- Right: selected-topic panel (§5). Selecting a node updates it immediately, no navigation. "Open full page" expands to `/topic/[id]`.
- Overall progress always visible (header bar).

**Mobile:** not a squeezed desktop. Bottom tab navigation (Roadmap, Topic, Learn, Progress); roadmap as a vertical path list with phase sections; topic details as a full-screen sheet; editor and quiz designed for touch.

## 5. Required topic-detail content

Every topic ships (no stub topics; a topic missing any item fails the content validator):

1. Concept and why it matters
2. Mental model
3. Syntax/reference
4. Real Java example + line-by-line explanation
5. Common mistakes
6. Comparison with related concepts (where relevant)
7. Practice task(s)
8. Mastery check (quiz questions linked via `quizIds`)
9. Prerequisites, related topics
10. Previous/next topic
11. Resources
12. Completion control

## 6. Progress requirements

- Single store (Zustand) is the only progress source; roadmap, home, checklist, plan, quizzes, recommendations read from it.
- Topic states: `not-started`, `in-progress`, `completed`.
- Derived (Sagar baseline: overall %, topics done, current phase, estimated time left; we add per-phase, per-milestone and per-subtopic progress): overall %, phase %, milestone %, topics done (x / 80), milestones done (x / 28), current phase, current topic, estimated remaining time (sum of `estimatedMinutes` of non-completed topics, converted to weeks at the plan's pace; Sagar's linear `12 x (1 - pct)` ignores topic size and is not reused), recently completed, phase completion.
- Completion rule: user marks complete; mastery check pass is recommended and shown, not silently required (decided: ADR-0007).
- Persistence: versioned localStorage schema with migration; graceful behavior if storage is unavailable or corrupt (in-memory fallback + visible notice).
- "Continue Learning": next topic whose prerequisites are complete, ordered by milestone sequence; falls back to in-progress topics first.

- Completing a topic is an explicit control (Sagar toggles completion on any row click, which causes accidental changes).
- Quiz attempts, wrong answers and habit ticks persist in the same store (Sagar persists neither quiz results nor weekly habit resets).

## 7. Quiz requirements

- Scopes: global (10 questions minimum, Sagar-style), phase, topic, mistake review.
- Formats: multiple choice, true/false, code-output prediction, find-the-error.
- Score, per-question explanation, retry, results history; wrong answers feed mistake review.
- Questions are data (`quizzes`), each linked to a topic; no hardcoded questions in components.

## 8. Code examples and editor requirements

- 10+ meaningful examples at launch, each linked to topics; loader in editor.
- Editor: Java syntax highlighting, line numbers, copy, reset, formatting, run UI, output panel, error panel, example loader, mobile support.
- Execution is behind an `ExecutionProvider` interface. v1 provider reports "execution unavailable" truthfully; a real service (isolated sandbox, own runtime, not inside Next.js) can be added later.
- No simulated output presented as real output.

## 9. Resources, checklist, habits, projects

- Resources: official docs, books, learning sites, practice platforms, framework docs, database resources, testing resources, developer tools; each tied to topics; external links use `rel="noopener noreferrer"`.
- Checklist: all 80 topics, complete/incomplete filters, search, phase progress, direct navigation.
- Weekly habits: defined habits per week, daily/weekly tick-off, streak or completion count (persisted).
- Projects (beginner/intermediate/advanced): prerequisites (topic ids), milestones, completion state; each connects to roadmap topics.

## 10. Responsive/mobile requirements

Breakpoints: mobile < 768, tablet 768–1199, desktop ≥ 1200. Touch targets ≥ 44px. No horizontal page scroll. Roadmap usable by tap and scroll; code blocks scroll inside their own container.

## 11. Accessibility requirements

WCAG 2.2 AA target. Full keyboard operation (roadmap nodes focusable, arrow-key traversal, Enter to select), visible focus, semantic landmarks, ARIA for tree/tabs/dialogs, contrast ≥ 4.5:1 text, progress and state conveyed by more than color, reduced-motion support, screen-reader text for progress and node state, accessible editor (Esc to leave focus trap).

## 12. Performance requirements

LCP < 2.5s, INP < 200ms, CLS < 0.1 on mid-range mobile over 4G. Per-topic content loaded on demand (code-split); roadmap graph renders 80 nodes without jank; editor loaded lazily; initial JS budget set in Prompt 3 and enforced in CI.

## 13. Success criteria

- All 80 roadmap topics present and each passes the content validator.
- All Sagar baseline features present (`feature-matrix.md`).
- Zero broken prerequisite/related/quiz/resource references (validated in CI).
- Progress identical across roadmap, home, checklist, plan.
- Reload preserves progress; storage failure handled.
- Production build succeeds; Lighthouse and axe checks pass thresholds.

## 14. Boundaries

- Always: validate curriculum data, keep progress centralized, keep content in `/data`, be honest about execution.
- Ask first: new dependencies, new roadmap nodes, backend services, changing persistence schema.
- Never: copy reference content, add placeholder topics, fake execution, put curriculum text in components.

## 14a. Baseline notes (validated Sagar mechanics we must match or beat)

- Roadmap: 4 expandable phases with progress pills, 28 topic rows with difficulty tags and per-phase resource links.
- Quiz: 10 multiple-choice questions, immediate per-question feedback with explanation, final score with message tiers, retry. Ours adds persistence, more formats, review.
- Examples: Sagar claims 10+ but ships 6 (Hello World, OOP, Collections, Streams, Exceptions, Inheritance). **Ours must ship at least 10 real examples.**
- Checklist section = four habit groups (daily habits, weekly goals, project ideas, before-moving-on). Ours: separate roadmap Checklist (all topics) and Habits tracking.
- External code editor link: ours is built in, with honest execution status.
- Fix known baseline defects: `target=_blank` without `rel="noopener noreferrer"`, hand-written highlight spans, copy implying execution.

## 15. Decisions and open questions

Decided:
1. Concurrency moves to phase 3; phase 3 = Core Java + Concurrency, phase 4 = ecosystem and professional practice (ADR-0006).
2. Mastery checks are recommended, not required; completion is always manual-capable (ADR-0007).
3. Real Java execution is deferred; the editor stays on the execution interface and never fakes output (ADR-0007).
4. Dark mode is required at launch; light mode was optional but now ships too because the design brief supplies a light palette and a theme reveal (ADR-0009).

Open: confirm the editorial milestone grouping and prerequisite edges in `data/curriculum`.
