# Architecture and Data Model

## 1. Layers

```
data/                 JSON, language-neutral (readable by TS, Python, Java tooling)
  curriculum/         phases, milestones, topics, roadmap-sh-nodes (lock), week-baseline
  baseline/           sagar-baseline (traceability only)
  content/            per-topic teaching content (Prompt 5+)   [not yet created]
  quizzes|examples|resources|projects|habits/                 [created when authored]
src/lib/curriculum/   types.ts (model), loaders and selectors (Slice 2+); no UI imports
src/lib/progress/     single Zustand store + persistence (Slice 2)
src/lib/execution/    ExecutionProvider + "unavailable" provider (Slice 5)
src/app, src/components  Next.js UI; reads data only through lib selectors
scripts/              validate-curriculum.ts (CI gate), generators
```

Rule: UI never contains curriculum text and never stores progress outside `lib/progress`.

## 2. Models (see `src/lib/curriculum/types.ts`)

| Model | Key points |
|---|---|
| Roadmap | `Phase` (4, Sagar names/weeks) → `Milestone` (28, editorial) → `Topic` (80, roadmap.sh nodes) |
| Topic | roadmap.sh label (`title == sourceLabel`), `group`, `cluster`, `phase`, `milestone`, `order`, objectives, difficulty, minutes, `depth` (core/survey), `contentStatus`, references to examples/exercises/quizzes/resources |
| Dependency | `prerequisites` (hard) and `relatedTopics` (soft) on the topic; a prerequisite must have lower `order`, so the graph is a DAG by construction |
| Content | `TopicContent`: why it matters, mental model, syntax, line-by-line, common mistakes, comparisons, labelled `supporting` sections |
| Example | code, file, takeaways, `runnable`, Java version; many-to-many with topics |
| Quiz | `QuizQuestion` with 4 formats and scope global/phase/topic; question belongs to a topic |
| Resource | kind (docs, book, course, practice, framework, database, testing, tool), free flag, topics |
| Project | level, topics, prerequisites, milestones |
| WeekPlan / Habit | week plan is generated from milestones and minutes; habits are data, ticks live in progress |
| Progress | `ProgressStateV1`: topic status, subtopic/exercise ticks, quiz attempts with wrong answers, habit ticks, project milestones, last topic |

## 3. Progress engine (`src/lib/progress`)

| File | Role |
|---|---|
| `model.ts` | constants (`jlp.progress`, version, mastery rule), `emptyProgress()` |
| `actions.ts` | pure transitions: start, complete, toggle, reset, subtopic/exercise ticks, quiz attempts; unknown ids ignored; unchanged input returns the same object |
| `selectors.ts` | overall / phase / milestone progress, topic status and view, readiness, mastery, current topic and phase, `recommendNext`, `recentlyCompleted`, `estimateRemaining` |
| `storage.ts` | `loadProgress` (never throws), `sanitize`, migrations, `saveProgress` with typed failures |
| `store.ts` | `createProgressStore`, `attachStorageSync` (cross-tab) |

Rules:
- Topic states: `not-started` (no entry stored), `in-progress`, `completed`. Manual completion is always allowed (D2).
- Percentages are counts: 100 only when everything is done, never 0 once something is done, 99 cap before completion.
- Remaining time = sum of `estimatedMinutes` of non-completed topics; weeks use pace = total minutes / 12 unless a pace is given.
- **Continue Learning:** resume the in-progress topic (last opened wins, else most recently updated). Otherwise take the lowest-order *ready* topic after the most recently completed one (ready = all prerequisites completed); if none is ahead, wrap around to the lowest ready. Result includes the anchor, up to 2-3 alternatives and `skippedEarlier` (open earlier topics). Prerequisites always have lower order, so a ready topic exists whenever anything is incomplete.
- **Current topic** = the recommendation's topic; **current phase** = its phase; both null when finished.
- Persistence: versioned JSON; unknown topic ids are kept but never counted; invalid entries dropped or repaired; newer-version data is left untouched (memory-only); storage unavailable falls back to memory with a visible status.

## 4. Execution

`ExecutionProvider.run()` returns `unavailable` in v1. A real provider (isolated JDK sandbox service, not inside Next.js) can be registered later without UI changes.

## 5. Validation (CI gate)

`node scripts/validate-curriculum.ts` checks: counts (4/28/80), id format and uniqueness, phase weeks cover 1-12, milestone and topic ordering, phase/milestone consistency, no empty milestone, no broken/self/duplicate prerequisite or related refs, prerequisite earlier than dependent, exact match with the roadmap.sh lock (labels, groups, boxes), Sagar baseline coverage (28 topics resolve), objectives present. `--release` additionally requires no `outline` topics and non-empty examples, exercises, quizzes, resources.
