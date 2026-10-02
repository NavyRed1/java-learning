// Pure state transitions. Every function returns the SAME object when nothing changes
// (stable identity for React) and ignores unknown topic ids rather than throwing.
import type { Id, TopicStatus } from "../curriculum/types.ts";
import type { CurriculumIndex } from "../curriculum/index.ts";
import { MAX_QUIZ_ATTEMPTS, emptyProgress, type ProgressState } from "./model.ts";

type Entry = ProgressState["topics"][Id];
export type QuizAttempt = ProgressState["quizAttempts"][number];

const withLast = (s: ProgressState, id: Id): ProgressState => (s.lastTopicId === id ? s : { ...s, lastTopicId: id });

export function setTopicStatus(s: ProgressState, ix: CurriculumIndex, id: Id, status: TopicStatus, now: string): ProgressState {
  if (!ix.topicById.has(id)) return s;
  const prev = s.topics[id];
  if ((prev?.status ?? "not-started") === status) return s;
  const topics = { ...s.topics };
  if (status === "not-started") {
    delete topics[id];
    if (s.lastTopicId !== id) return { ...s, topics };
    const { lastTopicId: _drop, ...rest } = s;
    return { ...rest, topics };
  }
  const { completedAt: _c, ...base } = prev ?? ({} as Partial<Entry>);
  const entry = { ...base, status, updatedAt: now } as Entry;
  if (status === "completed") entry.completedAt = now;
  topics[id] = entry;
  return withLast({ ...s, topics }, id);
}

/** Opening a topic for study: not-started -> in-progress; in-progress is refreshed; completed is left alone. */
export function startTopic(s: ProgressState, ix: CurriculumIndex, id: Id, now: string): ProgressState {
  if (!ix.topicById.has(id)) return s;
  const prev = s.topics[id];
  if (prev?.status === "completed") return s;
  if (!prev) return setTopicStatus(s, ix, id, "in-progress", now);
  if (prev.updatedAt === now && s.lastTopicId === id) return s;
  return withLast({ ...s, topics: { ...s.topics, [id]: { ...prev, updatedAt: now } } }, id);
}

export const completeTopic = (s: ProgressState, ix: CurriculumIndex, id: Id, now: string) => setTopicStatus(s, ix, id, "completed", now);

/** completed -> in-progress (un-complete keeps the work), anything else -> completed. */
export function toggleComplete(s: ProgressState, ix: CurriculumIndex, id: Id, now: string): ProgressState {
  return setTopicStatus(s, ix, id, s.topics[id]?.status === "completed" ? "in-progress" : "completed", now);
}

export const resetTopic = (s: ProgressState, ix: CurriculumIndex, id: Id) => setTopicStatus(s, ix, id, "not-started", "");
export const resetAll = (): ProgressState => emptyProgress();

function toggleTick(s: ProgressState, ix: CurriculumIndex, id: Id, field: "subtopicsDone" | "exercisesDone", item: string, now: string): ProgressState {
  const t = ix.topicById.get(id);
  if (!t || !item || item.length > 100) return s;
  const known = field === "subtopicsDone" ? t.subtopics.map(x => x.id) : t.exercises.map(x => x.id);
  if (known.length && !known.includes(item)) return s; // validated once content defines the list
  const prev = s.topics[id];
  const list = prev?.[field] ?? [];
  const next = list.includes(item) ? list.filter(x => x !== item) : [...list, item];
  const status = prev?.status ?? "not-started";
  const entry = { ...prev, status: status === "not-started" ? "in-progress" : status, updatedAt: now, [field]: next } as Entry;
  if (!next.length) delete entry[field];
  return withLast({ ...s, topics: { ...s.topics, [id]: entry } }, id);
}
export const toggleSubtopic = (s: ProgressState, ix: CurriculumIndex, id: Id, sub: string, now: string) => toggleTick(s, ix, id, "subtopicsDone", sub, now);
export const toggleExercise = (s: ProgressState, ix: CurriculumIndex, id: Id, ex: string, now: string) => toggleTick(s, ix, id, "exercisesDone", ex, now);

export function setLastTopic(s: ProgressState, ix: CurriculumIndex, id: Id): ProgressState {
  return ix.topicById.has(id) ? withLast(s, id) : s;
}

/** Records a quiz result (needed for mastery status). Invalid attempts are ignored. */
export function recordQuizAttempt(s: ProgressState, ix: CurriculumIndex, a: QuizAttempt): ProgressState {
  const ok = a && typeof a.id === "string" && a.id && ["global", "phase", "topic"].includes(a.scope)
    && Number.isInteger(a.score) && Number.isInteger(a.total) && a.total >= 1 && a.score >= 0 && a.score <= a.total
    && Number.isFinite(Date.parse(a.at)) && Array.isArray(a.wrong)
    && (a.scope !== "topic" || (typeof a.ref === "string" && ix.topicById.has(a.ref)));
  if (!ok || s.quizAttempts.some(x => x.id === a.id)) return s;
  return { ...s, quizAttempts: [...s.quizAttempts, a].slice(-MAX_QUIZ_ATTEMPTS) };
}
