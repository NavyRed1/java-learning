// Versioned persistence with defensive loading. Never throws.
import type { CurriculumIndex } from "../curriculum/index.ts";
import { CORRUPT_BACKUP_KEY, CURRENT_VERSION, MAX_QUIZ_ATTEMPTS, STORAGE_KEY, emptyProgress, type ProgressState } from "./model.ts";

export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
export type Migration = (old: Record<string, unknown>) => Record<string, unknown>;
export type LoadSource = "empty" | "storage" | "migrated" | "recovered" | "unavailable" | "future-version";
export type LoadIssueCode = "storage-unavailable" | "invalid-json" | "invalid-shape" | "future-version" | "migration-failed"
  | "dropped-topic-entries" | "dropped-attempts" | "repaired-dates" | "unknown-topic-ids";
export interface LoadIssue { code: LoadIssueCode; count?: number }
export interface LoadResult { state: ProgressState; source: LoadSource; issues: LoadIssue[]; writable: boolean }

/** Migrations keyed by the version they upgrade FROM (n -> n+1). Empty: v1 is the first schema. */
export const MIGRATIONS: Record<number, Migration> = {};

const EPOCH = "1970-01-01T00:00:00.000Z";
const ID = /^[a-z0-9][a-z0-9-]{0,99}$/;       // also rejects __proto__ / constructor
const STATUS = new Set(["not-started", "in-progress", "completed"]);
const SCOPES = new Set(["global", "phase", "topic"]);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isDate = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
const strings = (v: unknown, cap = 500): string[] => Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 100))].slice(0, cap) : [];

export function sanitize(raw: Record<string, unknown>, index?: CurriculumIndex): { state: ProgressState; issues: LoadIssue[] } {
  const state = emptyProgress(); const issues: LoadIssue[] = [];
  let dropped = 0, repaired = 0, unknown = 0;

  if (isObj(raw.topics)) for (const [id, e] of Object.entries(raw.topics)) {
    if (!ID.test(id) || !isObj(e) || !STATUS.has(e.status as string)) { dropped++; continue; }
    if (e.status === "not-started") continue;
    let updatedAt = e.updatedAt; if (!isDate(updatedAt)) { updatedAt = EPOCH; repaired++; }
    const entry: ProgressState["topics"][string] = { status: e.status as "in-progress" | "completed", updatedAt: updatedAt as string };
    if (e.status === "completed") { if (isDate(e.completedAt)) entry.completedAt = e.completedAt; else { entry.completedAt = entry.updatedAt; repaired++; } }
    const sub = strings(e.subtopicsDone), ex = strings(e.exercisesDone);
    if (sub.length) entry.subtopicsDone = sub; if (ex.length) entry.exercisesDone = ex;
    state.topics[id] = entry;
    if (index && !index.topicById.has(id)) unknown++;
  }

  if (Array.isArray(raw.quizAttempts)) {
    const seen = new Set<string>(); let bad = 0;
    for (const a of raw.quizAttempts) {
      const ok = isObj(a) && typeof a.id === "string" && a.id && !seen.has(a.id) && SCOPES.has(a.scope as string) && isDate(a.at)
        && Number.isInteger(a.score) && Number.isInteger(a.total) && (a.total as number) >= 1 && (a.score as number) >= 0 && (a.score as number) <= (a.total as number);
      if (!ok) { bad++; continue; }
      const q = a as Record<string, unknown>; seen.add(q.id as string);
      state.quizAttempts.push({ id: q.id as string, scope: q.scope as "global", at: q.at as string, score: q.score as number, total: q.total as number, wrong: strings(q.wrong, 200),
        ...(typeof q.ref === "string" && ID.test(q.ref) ? { ref: q.ref } : {}) });
    }
    state.quizAttempts = state.quizAttempts.slice(-MAX_QUIZ_ATTEMPTS);
    if (bad) issues.push({ code: "dropped-attempts", count: bad });
  }

  if (isObj(raw.habits)) for (const [id, v] of Object.entries(raw.habits)) if (ID.test(id)) state.habits[id] = strings(v, 2000).filter(isDate);
  if (isObj(raw.projects)) for (const [id, v] of Object.entries(raw.projects)) if (ID.test(id) && isObj(v)) {
    state.projects[id] = { milestonesDone: strings(v.milestonesDone), ...(isDate(v.completedAt) ? { completedAt: v.completedAt } : {}) };
  }
  if (typeof raw.lastTopicId === "string" && ID.test(raw.lastTopicId)) state.lastTopicId = raw.lastTopicId;

  if (dropped) issues.push({ code: "dropped-topic-entries", count: dropped });
  if (repaired) issues.push({ code: "repaired-dates", count: repaired });
  if (unknown) issues.push({ code: "unknown-topic-ids", count: unknown });
  return { state, issues };
}

function backup(storage: StorageLike, raw: string) { try { storage.setItem(CORRUPT_BACKUP_KEY, raw.slice(0, 200_000)); } catch { /* best effort */ } }

export function loadProgress(storage: StorageLike | null, opts: { index?: CurriculumIndex; migrations?: Record<number, Migration>; currentVersion?: number } = {}): LoadResult {
  const fresh = (source: LoadSource, issues: LoadIssue[], writable: boolean): LoadResult => ({ state: emptyProgress(), source, issues, writable });
  if (!storage) return fresh("unavailable", [{ code: "storage-unavailable" }], false);
  let raw: string | null;
  try { raw = storage.getItem(STORAGE_KEY); } catch { return fresh("unavailable", [{ code: "storage-unavailable" }], false); }
  if (raw === null) return fresh("empty", [], true);

  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { backup(storage, raw); return fresh("recovered", [{ code: "invalid-json" }], true); }
  if (!isObj(parsed) || !Number.isInteger(parsed.version) || (parsed.version as number) < 1) { backup(storage, raw); return fresh("recovered", [{ code: "invalid-shape" }], true); }

  const target = opts.currentVersion ?? CURRENT_VERSION;   // override exists for migration tests
  let version = parsed.version as number;
  if (version > target) return fresh("future-version", [{ code: "future-version" }], false); // never overwrite newer data
  const migrations = opts.migrations ?? MIGRATIONS;
  let doc: Record<string, unknown> = parsed; let migrated = false;
  try {
    while (version < target) {
      const m = migrations[version]; if (!m) throw new Error(`no migration from v${version}`);
      doc = { ...m(doc), version: version + 1 }; version++; migrated = true;
    }
  } catch { backup(storage, raw); return fresh("recovered", [{ code: "migration-failed" }], true); }

  const { state, issues } = sanitize(doc, opts.index);
  return { state, source: migrated ? "migrated" : "storage", issues, writable: true };
}

export type SaveResult = { ok: true } | { ok: false; kind: "quota" | "unavailable" | "unknown"; message: string };
export function saveProgress(storage: StorageLike | null, state: ProgressState): SaveResult {
  if (!storage) return { ok: false, kind: "unavailable", message: "storage unavailable" };
  try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); return { ok: true }; }
  catch (e) {
    const err = e as { name?: string; code?: number; message?: string };
    const quota = err?.name === "QuotaExceededError" || err?.code === 22 || err?.code === 1014;
    return { ok: false, kind: quota ? "quota" : err?.name === "SecurityError" ? "unavailable" : "unknown", message: String(err?.message ?? e) };
  }
}
