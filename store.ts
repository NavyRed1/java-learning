// Framework-agnostic store: getState / subscribe (same contract React's useSyncExternalStore expects).
// The React hook binding is added with the UI in Slice 3. No runtime dependencies.
import type { Id } from "../curriculum/types.ts";
import type { CurriculumIndex } from "../curriculum/index.ts";
import * as A from "./actions.ts";
import { STORAGE_KEY, type ProgressState } from "./model.ts";
import { loadProgress, saveProgress, type LoadIssue, type LoadSource, type StorageLike } from "./storage.ts";

export interface PersistenceStatus {
  mode: "ok" | "memory-only" | "error";  // memory-only: storage unavailable or written by a newer app version
  source: LoadSource; issues: LoadIssue[]; lastError?: string;
}
export interface ProgressStoreState { progress: ProgressState; persistence: PersistenceStatus }
export type ProgressStore = ReturnType<typeof createProgressStore>;

export function createProgressStore(opts: { index: CurriculumIndex; storage: StorageLike | null; now?: () => string }) {
  const { index, storage } = opts;
  const now = opts.now ?? (() => new Date().toISOString());
  const listeners = new Set<() => void>();
  let writable = true;

  const fromLoad = (): ProgressStoreState => {
    const r = loadProgress(storage, { index }); writable = r.writable;
    return { progress: r.state, persistence: { mode: r.writable ? "ok" : "memory-only", source: r.source, issues: r.issues } };
  };
  let state = fromLoad();
  const emit = () => listeners.forEach(l => l());

  function commit(next: ProgressState) {
    if (next === state.progress) return;          // no-op: no write, no notification
    let persistence = state.persistence;
    if (writable) {
      const r = saveProgress(storage, next);
      if (r.ok) { if (persistence.mode === "error") persistence = { ...persistence, mode: "ok", lastError: undefined }; }
      else persistence = { ...persistence, mode: "error", lastError: r.message };
    }
    state = { progress: next, persistence };
    emit();
  }
  const p = () => state.progress;

  return {
    getState: () => state,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    index,
    startTopic: (id: Id) => commit(A.startTopic(p(), index, id, now())),
    completeTopic: (id: Id) => commit(A.completeTopic(p(), index, id, now())),
    toggleComplete: (id: Id) => commit(A.toggleComplete(p(), index, id, now())),
    setTopicStatus: (id: Id, s: Parameters<typeof A.setTopicStatus>[3]) => commit(A.setTopicStatus(p(), index, id, s, now())),
    resetTopic: (id: Id) => commit(A.resetTopic(p(), index, id)),
    toggleSubtopic: (id: Id, sub: string) => commit(A.toggleSubtopic(p(), index, id, sub, now())),
    toggleExercise: (id: Id, ex: string) => commit(A.toggleExercise(p(), index, id, ex, now())),
    setLastTopic: (id: Id) => commit(A.setLastTopic(p(), index, id)),
    recordQuizAttempt: (a: A.QuizAttempt) => commit(A.recordQuizAttempt(p(), index, a)),
    resetAll: () => { const c = p(); const blank = !Object.keys(c.topics).length && !c.quizAttempts.length && !Object.keys(c.habits).length && !Object.keys(c.projects).length && !c.lastTopicId; commit(blank ? c : A.resetAll()); },
    /** Re-read storage (another tab changed it, or the user wants to retry after an error). */
    reload() { state = fromLoad(); emit(); },
    /** Hide the one-time notice about recovered/dropped data. */
    dismissIssues() { if (state.persistence.issues.length) { state = { ...state, persistence: { ...state.persistence, issues: [] } }; emit(); } },
  };
}

/** Keep several tabs in sync. `target` is `window` in the browser. Returns a detach function. */
export function attachStorageSync(store: Pick<ProgressStore, "reload">, target: { addEventListener(t: "storage", f: (e: { key: string | null }) => void): void; removeEventListener(t: "storage", f: (e: { key: string | null }) => void): void }) {
  const h = (e: { key: string | null }) => { if (e.key === null || e.key === STORAGE_KEY) store.reload(); };
  target.addEventListener("storage", h);
  return () => target.removeEventListener("storage", h);
}
