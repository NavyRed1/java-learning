# Feature Matrix (v2, Sagar verified from source)

**B** = Sagar baseline (preserve at minimum). **E** = our enhancement. Status of every B row is now *Verified*.

## 1. Sagar baseline

| # | Baseline feature (verified) | Our requirement | Fix / improvement |
|---|---|---|---|
| B1 | Hero: value proposition, CTAs to roadmap and quiz | Original hero plus Continue Learning | |
| B2 | Stats: 4 phases, 28 topics, 12 weeks, 10+ examples | Same four figures computed from data (4 / 28 milestones / 12 / 10+) | Claim must be true |
| B3 | Progress card: overall %, topics done, current phase, est. time left | Same, from the central store | Time left from minutes, not linear |
| B4 | Roadmap: 4 expandable phases, progress pill, week range | Phase names and weeks kept | |
| B5 | 28 topic rows with name, description, difficulty tag | 28 milestones covering all 28 Sagar topics (traceability in curriculum-spec s4) | Original copy |
| B6 | Click row toggles completion | Explicit complete control | No accidental toggles |
| B7 | Per-phase resource links | Resources per phase and per topic | `rel="noopener noreferrer"` |
| B8 | localStorage persistence (per-topic boolean, separate checklist key) | One versioned store for everything | Failure handling and migration |
| B9 | Code examples: tabbed, copy button, takeaways | 10+ examples, line-by-line explanations, loadable in editor | Sagar ships 6 |
| B10 | Link to external code editor | Built-in editor with execution abstraction | Honest "execution unavailable" |
| B11 | Quiz: 10 MCQ, instant feedback + explanation, score tiers, retry | Same baseline in the global quiz | Persist results; add formats, phase/topic quizzes, mistake review |
| B12 | Resources grid: 8 items, free/paid tags | Categorized, topic-linked | |
| B13 | Habit groups: daily (4), weekly goals (4), project ideas (6), before-moving-on (4) | Trackable habits per week, project ideas become Projects | Weekly reset/streak |
| B14 | Sticky nav with anchors, mobile hamburger | Real routes, mobile tab flow | |
| B15 | Scroll reveal animation | Subtle, respects reduced motion | |
| B16 | "Build a Project" as a final topic | Projects feature tied to topics | |

## 2. roadmap.sh features respected

Java-specific scope, all 80 nodes with original labels, hub/box grouping, per-node detail, Projects tab concept (ours is original), progress marking.

## 3. Enhancements

| # | Enhancement | Slice |
|---|---|---|
| E1 | Three-column workspace with live detail panel | 3 |
| E2 | Prerequisite graph and recommended-next | 1-2 |
| E3 | Complete topic pages (12 required sections) | 4 |
| E4 | in-progress state, subtopic and milestone progress | 2 |
| E5 | Quiz formats: true/false, output prediction, find-the-error; topic, phase, review | 5 |
| E6 | Editor: highlighting, line numbers, format, copy, reset, output/error panels | 5 |
| E7 | Generated 12-week plan | 6 |
| E8 | Beginner/intermediate/advanced projects with milestones | 6 |
| E9 | Global search | 7 |
| E10 | Mobile-first learning flow, WCAG 2.2 AA, perf budgets | 3, 8 |
| E11 | Curriculum validator in CI (counts, refs, cycles, lock, baseline) | 1 (done) |

## 4. Traceability rule

Every B row must map to a shipped, working feature at the Prompt 10 audit; `data/baseline/sagar-baseline.json` and the validator keep topic coverage honest.
