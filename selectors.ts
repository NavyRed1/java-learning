// Pure derived data. Nothing here is stored; everything comes from (state, curriculum index).
import type { Id, Phase, Milestone, Topic, TopicStatus } from "../curriculum/types.ts";
import type { CurriculumIndex } from "../curriculum/index.ts";
import { MASTERY, WEEKS_IN_PLAN, type ProgressState } from "./model.ts";

const ts = (iso: string | undefined) => { const n = iso ? Date.parse(iso) : NaN; return Number.isFinite(n) ? n : 0; };

export const topicStatus = (s: ProgressState, id: Id): TopicStatus => s.topics[id]?.status ?? "not-started";
const done = (s: ProgressState, id: Id) => topicStatus(s, id) === "completed";

export interface Progress {
  total: number; completed: number; inProgress: number; notStarted: number;
  percent: number;              // 0-100 by topic count; 100 only when everything is complete
  totalMinutes: number; remainingMinutes: number; complete: boolean;
}
export function summarize(s: ProgressState, topics: readonly Topic[]): Progress {
  let completed = 0, inProgress = 0, totalMinutes = 0, remainingMinutes = 0;
  for (const t of topics) {
    const st = topicStatus(s, t.id);
    totalMinutes += t.estimatedMinutes;
    if (st === "completed") completed++; else { remainingMinutes += t.estimatedMinutes; if (st === "in-progress") inProgress++; }
  }
  const total = topics.length;
  const raw = total ? Math.round((completed / total) * 100) : 0;
  const percent = completed === total && total > 0 ? 100 : Math.min(99, completed > 0 ? Math.max(1, raw) : raw);
  return { total, completed, inProgress, notStarted: total - completed - inProgress, percent, totalMinutes, remainingMinutes, complete: total > 0 && completed === total };
}

export const overallProgress = (s: ProgressState, ix: CurriculumIndex) => summarize(s, ix.topics);
export const phaseProgress = (s: ProgressState, ix: CurriculumIndex, phaseId: Id) => summarize(s, ix.topicsByPhase.get(phaseId) ?? []);
export const milestoneProgress = (s: ProgressState, ix: CurriculumIndex, msId: Id) => summarize(s, ix.topicsByMilestone.get(msId) ?? []);
export const allPhaseProgress = (s: ProgressState, ix: CurriculumIndex): (Progress & { phase: Phase })[] => ix.phases.map(phase => ({ phase, ...phaseProgress(s, ix, phase.id) }));
export const allMilestoneProgress = (s: ProgressState, ix: CurriculumIndex): (Progress & { milestone: Milestone })[] => ix.milestones.map(milestone => ({ milestone, ...milestoneProgress(s, ix, milestone.id) }));

// ---- prerequisites, readiness
export const unmetPrerequisites = (s: ProgressState, ix: CurriculumIndex, id: Id): Topic[] =>
  (ix.topicById.get(id)?.prerequisites ?? []).filter(p => !done(s, p)).map(p => ix.topicById.get(p)!);
/** Ready = not completed and every hard prerequisite completed. */
export const isReady = (s: ProgressState, ix: CurriculumIndex, id: Id) => ix.topicById.has(id) && !done(s, id) && unmetPrerequisites(s, ix, id).length === 0;
export const readyTopics = (s: ProgressState, ix: CurriculumIndex): Topic[] => ix.topics.filter(t => isReady(s, ix, t.id));

// ---- mastery (recommended, never required)
export type MasteryStatus = "not-attempted" | "attempted" | "mastered";
export interface Mastery { status: MasteryStatus; attempts: number; bestRatio: number | null }
export function masteryOf(s: ProgressState, id: Id): Mastery {
  const tries = s.quizAttempts.filter(a => a.scope === "topic" && a.ref === id);
  if (!tries.length) return { status: "not-attempted", attempts: 0, bestRatio: null };
  const best = Math.max(...tries.map(a => a.score / a.total));
  const mastered = tries.some(a => a.total >= MASTERY.minQuestions && a.score / a.total >= MASTERY.minRatio);
  return { status: mastered ? "mastered" : "attempted", attempts: tries.length, bestRatio: best };
}
export interface TopicView {
  topic: Topic; status: TopicStatus; mastery: Mastery; unmet: Topic[]; ready: boolean;
  completedWithoutMastery: boolean; // UI should strongly encourage the mastery check
  subtopicsDone: string[]; exercisesDone: string[]; updatedAt?: string; completedAt?: string;
}
export function topicView(s: ProgressState, ix: CurriculumIndex, id: Id): TopicView | null {
  const topic = ix.topicById.get(id); if (!topic) return null;
  const e = s.topics[id]; const status = topicStatus(s, id); const mastery = masteryOf(s, id);
  return { topic, status, mastery, unmet: unmetPrerequisites(s, ix, id), ready: isReady(s, ix, id),
    completedWithoutMastery: status === "completed" && mastery.status !== "mastered",
    subtopicsDone: e?.subtopicsDone ?? [], exercisesDone: e?.exercisesDone ?? [], updatedAt: e?.updatedAt, completedAt: e?.completedAt };
}

// ---- current topic / phase
const inProgressTopics = (s: ProgressState, ix: CurriculumIndex) => ix.topics.filter(t => topicStatus(s, t.id) === "in-progress");

/** Most recently touched in-progress topic (last opened wins ties); otherwise the recommended next topic; null when finished. */
export function currentTopic(s: ProgressState, ix: CurriculumIndex): Topic | null {
  const rec = recommendNext(s, ix);
  return rec.kind === "done" ? null : rec.topic;
}
/** Phase of the current topic; null when everything is complete. */
export function currentPhase(s: ProgressState, ix: CurriculumIndex): Phase | null {
  const t = currentTopic(s, ix); return t ? ix.phaseById.get(t.phase) ?? null : null;
}

// ---- Continue Learning
export type Recommendation =
  | { kind: "resume"; reasonCode: "in-progress"; topic: Topic; alternatives: Topic[] }
  | { kind: "next"; reasonCode: "start" | "after-completed" | "wrap-around"; topic: Topic; anchor?: Topic; alternatives: Topic[]; skippedEarlier: number }
  | { kind: "done" };

/**
 * 1. Resume the in-progress topic (last opened, else most recently updated).
 * 2. Otherwise the lowest-order READY topic after the most recently completed one;
 *    if none lies ahead, wrap around to the lowest-order ready topic.
 * Because prerequisites always have lower order, a ready topic exists whenever anything is incomplete.
 */
export function recommendNext(s: ProgressState, ix: CurriculumIndex): Recommendation {
  const ready = readyTopics(s, ix).filter(t => topicStatus(s, t.id) === "not-started");
  const active = inProgressTopics(s, ix);
  if (active.length) {
    const last = s.lastTopicId ? active.find(t => t.id === s.lastTopicId) : undefined;
    const sorted = [...active].sort((a, b) => ts(s.topics[b.id]?.updatedAt) - ts(s.topics[a.id]?.updatedAt) || a.order - b.order);
    const topic = last ?? sorted[0];
    return { kind: "resume", reasonCode: "in-progress", topic, alternatives: [...sorted.filter(t => t !== topic), ...ready].slice(0, 3) };
  }
  if (!ready.length) return { kind: "done" };
  const completed = ix.topics.filter(t => done(s, t.id));
  const anchor = completed.length ? completed.reduce((a, b) => (ts(s.topics[b.id]?.completedAt) > ts(s.topics[a.id]?.completedAt) || (ts(s.topics[b.id]?.completedAt) === ts(s.topics[a.id]?.completedAt) && b.order > a.order) ? b : a)) : undefined;
  const ahead = anchor ? ready.filter(t => t.order > anchor.order) : ready;
  const topic = ahead[0] ?? ready[0];
  const reasonCode = !anchor ? "start" : ahead.length ? "after-completed" : "wrap-around";
  const skippedEarlier = ix.topics.filter(t => t.order < topic.order && !done(s, t.id)).length;
  return { kind: "next", reasonCode, topic, ...(anchor ? { anchor } : {}), alternatives: ready.filter(t => t !== topic).slice(0, 2), skippedEarlier };
}

// ---- history and time
export function recentlyCompleted(s: ProgressState, ix: CurriculumIndex, limit = 5): { topic: Topic; completedAt: string }[] {
  return ix.topics.filter(t => done(s, t.id) && s.topics[t.id]?.completedAt)
    .map(topic => ({ topic, completedAt: s.topics[topic.id]!.completedAt! }))
    .sort((a, b) => ts(b.completedAt) - ts(a.completedAt) || b.topic.order - a.topic.order).slice(0, Math.max(0, limit));
}

/** Remaining study time. Default pace = the whole curriculum spread over the 12-week plan. */
export function estimateRemaining(s: ProgressState, ix: CurriculumIndex, minutesPerWeek = ix.totalMinutes / WEEKS_IN_PLAN) {
  if (!(minutesPerWeek > 0)) throw new RangeError("minutesPerWeek must be positive");
  const minutes = overallProgress(s, ix).remainingMinutes;
  return { minutes, hours: Math.round((minutes / 60) * 10) / 10, weeks: Math.round((minutes / minutesPerWeek) * 10) / 10 };
}
