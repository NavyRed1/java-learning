import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { emptyProgress } from "../model.ts";
import * as A from "../actions.ts";
import * as S from "../selectors.ts";
import { clock, realIndex, tinyIndex } from "./fixtures.ts";

const T = tinyIndex();
const R = realIndex();
const at = (n: number) => new Date(Date.parse("2026-10-02T09:00:00.000Z") + n * 60_000).toISOString();

describe("topic state transitions", () => {
  test("new state: everything not started, nothing recorded", () => {
    const s = emptyProgress();
    assert.equal(S.topicStatus(s, "t1"), "not-started");
    assert.deepEqual(S.overallProgress(s, T), { total: 6, completed: 0, inProgress: 0, notStarted: 6, percent: 0, totalMinutes: 210, remainingMinutes: 210, complete: false });
  });
  test("start -> in-progress, records timestamp and last topic", () => {
    const s = A.startTopic(emptyProgress(), T, "t1", at(0));
    assert.equal(S.topicStatus(s, "t1"), "in-progress");
    assert.equal(s.topics.t1.updatedAt, at(0)); assert.equal(s.lastTopicId, "t1");
  });
  test("complete sets completedAt; completing again is a no-op with the same object", () => {
    const s1 = A.completeTopic(emptyProgress(), T, "t1", at(1));
    assert.equal(s1.topics.t1.completedAt, at(1));
    assert.equal(A.completeTopic(s1, T, "t1", at(9)), s1);
    assert.equal(s1.topics.t1.completedAt, at(1));
  });
  test("completion toggling: completed <-> in-progress, completedAt cleared, work kept", () => {
    let s = A.toggleSubtopic(emptyProgress(), T, "t1", "x", at(0));
    s = A.toggleComplete(s, T, "t1", at(1)); assert.equal(S.topicStatus(s, "t1"), "completed");
    s = A.toggleComplete(s, T, "t1", at(2));
    assert.equal(S.topicStatus(s, "t1"), "in-progress"); assert.equal(s.topics.t1.completedAt, undefined);
    assert.deepEqual(s.topics.t1.subtopicsDone, ["x"]);
    s = A.toggleComplete(s, T, "t1", at(3)); assert.equal(s.topics.t1.completedAt, at(3));
  });
  test("manual completion is allowed without prerequisites and without mastery", () => {
    const s = A.completeTopic(emptyProgress(), T, "t6", at(0));
    const v = S.topicView(s, T, "t6")!;
    assert.equal(v.status, "completed"); assert.deepEqual(v.unmet.map(t => t.id), ["t5"]);
    assert.equal(v.mastery.status, "not-attempted"); assert.equal(v.completedWithoutMastery, true);
  });
  test("starting a completed topic changes nothing; reset removes the entry and last-topic pointer", () => {
    const done = A.completeTopic(emptyProgress(), T, "t1", at(0));
    assert.equal(A.startTopic(done, T, "t1", at(5)), done);
    const r = A.resetTopic(done, T, "t1");
    assert.equal(S.topicStatus(r, "t1"), "not-started"); assert.equal("t1" in r.topics, false); assert.equal(r.lastTopicId, undefined);
  });
  test("unknown ids and invalid input are ignored (same object returned)", () => {
    const s = emptyProgress();
    assert.equal(A.completeTopic(s, T, "nope", at(0)), s);
    assert.equal(A.startTopic(s, T, "nope", at(0)), s);
    assert.equal(A.toggleSubtopic(s, T, "t1", "", at(0)), s);
    assert.equal(A.setLastTopic(s, T, "nope"), s);
  });
  test("ticking an exercise auto-starts the topic and never un-completes it", () => {
    let s = A.toggleExercise(emptyProgress(), T, "t2", "e1", at(0)); assert.equal(S.topicStatus(s, "t2"), "in-progress");
    s = A.completeTopic(s, T, "t2", at(1)); s = A.toggleExercise(s, T, "t2", "e1", at(2));
    assert.equal(S.topicStatus(s, "t2"), "completed"); assert.equal(s.topics.t2.exercisesDone, undefined);
  });
  test("does not mutate its input", () => {
    const s = A.startTopic(emptyProgress(), T, "t1", at(0)); const frozen = JSON.stringify(s);
    A.completeTopic(s, T, "t1", at(1)); A.toggleSubtopic(s, T, "t1", "a", at(2)); A.resetTopic(s, T, "t1");
    assert.equal(JSON.stringify(s), frozen);
  });
});

describe("aggregates", () => {
  const s = [["t1", 0], ["t2", 1], ["t4", 2]].reduce((st, [id, n]) => A.completeTopic(st, T, id as string, at(n as number)), emptyProgress());
  const withActive = A.startTopic(s, T, "t3", at(5));
  test("overall: counts, percent, minutes", () => {
    const o = S.overallProgress(withActive, T);
    assert.deepEqual([o.completed, o.inProgress, o.notStarted, o.percent, o.remainingMinutes], [3, 1, 2, 50, 140]);
  });
  test("phase progress", () => {
    const [a, b] = S.allPhaseProgress(withActive, T);
    assert.deepEqual([a.phase.id, a.completed, a.total, a.percent, a.complete], ["pA", 3, 4, 75, false]);
    assert.deepEqual([b.phase.id, b.completed, b.total, b.percent], ["pB", 0, 2, 0]);
  });
  test("milestone progress and completion flag", () => {
    const m = S.allMilestoneProgress(withActive, T);
    assert.deepEqual(m.map(x => [x.milestone.id, x.completed, x.total, x.complete]), [["mA1", 2, 2, true], ["mA2", 1, 2, false], ["mB1", 0, 2, false]]);
    assert.equal(m[1].remainingMinutes, 30);
  });
  test("percent never shows 0 once started nor 100 before finishing", () => {
    const big = realIndex();
    let st = emptyProgress(); st = A.completeTopic(st, big, big.topics[0].id, at(0));
    assert.equal(S.overallProgress(st, big).percent, 1);
    for (const t of big.topics.slice(0, 79)) st = A.completeTopic(st, big, t.id, at(1));
    const o = S.overallProgress(st, big); assert.equal(o.completed, 79); assert.equal(o.percent, 99); assert.equal(o.complete, false);
  });
  test("rounding edge cases: 1 of 300 shows 1%, 299 of 300 shows 99%, only a full set shows 100%", () => {
    const topics = Array.from({ length: 300 }, (_, i) => ({ ...T.topics[0], id: `x${i}`, order: i + 1 }));
    const mkState = (n: number) => { let st = emptyProgress(); for (let i = 0; i < n; i++) st = A.completeTopic(st, { topicById: new Map(topics.map(t => [t.id, t])) } as any, `x${i}`, at(0)); return st; };
    assert.deepEqual([1, 299, 300].map(n => S.summarize(mkState(n), topics).percent), [1, 99, 100]);
    assert.equal(S.summarize(emptyProgress(), []).percent, 0);
  });
  test("entries for unknown topic ids never count", () => {
    const st = { ...emptyProgress(), topics: { ghost: { status: "completed" as const, updatedAt: at(0), completedAt: at(0) } } };
    assert.equal(S.overallProgress(st, T).completed, 0);
  });
  test("real curriculum: phase and milestone totals are consistent", () => {
    const s0 = emptyProgress();
    assert.deepEqual(S.allPhaseProgress(s0, R).map(p => p.total), [11, 19, 21, 29]);
    assert.equal(S.allMilestoneProgress(s0, R).length, 28);
    assert.equal(S.allMilestoneProgress(s0, R).reduce((a, m) => a + m.total, 0), 80);
    assert.equal(S.overallProgress(s0, R).totalMinutes, R.totalMinutes);
  });
  test("real curriculum: finishing m01 completes that milestone and 2/11 of phase 1", () => {
    let st = emptyProgress();
    for (const t of R.topicsByMilestone.get("m01")!) st = A.completeTopic(st, R, t.id, at(0));
    assert.equal(S.milestoneProgress(st, R, "m01").complete, true);
    const p1 = S.phaseProgress(st, R, "p1"); assert.deepEqual([p1.completed, p1.total, p1.percent], [2, 11, 18]);
  });
});

describe("mastery (recommended, not required)", () => {
  const q = (id: string, score: number, total: number, ref = "t1", scope: "topic" | "global" = "topic") => ({ id, scope, ref, at: at(0), score, total, wrong: [] as string[] });
  test("attempted below threshold, mastered at 80% of >= 3 questions", () => {
    let s = A.recordQuizAttempt(emptyProgress(), T, q("a", 2, 5)); assert.equal(S.masteryOf(s, "t1").status, "attempted");
    s = A.recordQuizAttempt(s, T, q("b", 4, 5)); const m = S.masteryOf(s, "t1");
    assert.deepEqual([m.status, m.attempts, m.bestRatio], ["mastered", 2, 0.8]);
  });
  test("too-short quizzes and other scopes do not grant mastery", () => {
    let s = A.recordQuizAttempt(emptyProgress(), T, q("a", 2, 2)); assert.equal(S.masteryOf(s, "t1").status, "attempted");
    s = A.recordQuizAttempt(s, T, q("g", 10, 10, "t1", "global")); assert.equal(S.masteryOf(s, "t1").attempts, 1);
  });
  test("completedWithoutMastery clears once mastered", () => {
    let s = A.completeTopic(emptyProgress(), T, "t1", at(0)); assert.equal(S.topicView(s, T, "t1")!.completedWithoutMastery, true);
    s = A.recordQuizAttempt(s, T, q("a", 5, 5)); assert.equal(S.topicView(s, T, "t1")!.completedWithoutMastery, false);
  });
  test("invalid or duplicate attempts are rejected", () => {
    const s = emptyProgress();
    for (const bad of [q("x", 6, 5), q("x", -1, 5), q("x", 1, 0), q("x", 1, 2, "ghost"), { ...q("x", 1, 2), at: "nope" }, { ...q("", 1, 2) }]) assert.equal(A.recordQuizAttempt(s, T, bad), s);
    const once = A.recordQuizAttempt(s, T, q("dup", 1, 3)); assert.equal(A.recordQuizAttempt(once, T, q("dup", 3, 3)), once);
  });
  test("attempt history is capped", () => {
    let s = emptyProgress(); for (let i = 0; i < 230; i++) s = A.recordQuizAttempt(s, T, q(`a${i}`, 1, 3));
    assert.equal(s.quizAttempts.length, 200); assert.equal(s.quizAttempts.at(-1)!.id, "a229");
  });
});

describe("Continue Learning", () => {
  test("fresh start recommends the first topic", () => {
    const r = S.recommendNext(emptyProgress(), T);
    assert.deepEqual([r.kind, (r as any).topic.id, (r as any).reasonCode], ["next", "t1", "start"]);
    assert.equal(S.recommendNext(emptyProgress(), R).kind === "next" && (S.recommendNext(emptyProgress(), R) as any).topic.id, "basic-syntax");
  });
  test("resumes the in-progress topic, last opened wins", () => {
    let s = A.startTopic(emptyProgress(), T, "t1", at(0)); s = A.startTopic(s, T, "t2", at(1));
    assert.equal((S.recommendNext(s, T) as any).topic.id, "t2");
    s = A.startTopic(s, T, "t1", at(2));  // reopen t1
    const r = S.recommendNext(s, T) as any; assert.deepEqual([r.kind, r.topic.id, r.alternatives[0].id], ["resume", "t1", "t2"]);
  });
  test("after completing, suggests the next READY topic ahead (prerequisites respected)", () => {
    const s = A.completeTopic(emptyProgress(), T, "t1", at(0));
    const r = S.recommendNext(s, T) as any; assert.deepEqual([r.topic.id, r.reasonCode, r.anchor.id, r.skippedEarlier], ["t2", "after-completed", "t1", 0]);
    assert.deepEqual(r.alternatives.map((t: any) => t.id), ["t4"]);
  });
  test("a topic with unmet prerequisites is never recommended", () => {
    let s = emptyProgress(); s = A.completeTopic(s, T, "t1", at(0)); s = A.completeTopic(s, T, "t2", at(1));
    assert.equal((S.recommendNext(s, T) as any).topic.id, "t3");          // t5 needs t3 and t4
    assert.equal(S.isReady(s, T, "t5"), false);
  });
  test("wraps around to earlier open topics when nothing is ahead", () => {
    let s = emptyProgress(); for (const [i, id] of ["t1", "t2", "t3"].entries()) s = A.completeTopic(s, T, id, at(i));
    s = A.completeTopic(s, T, "t6", at(10));                                  // jumped ahead manually
    const r = S.recommendNext(s, T) as any;
    assert.deepEqual([r.topic.id, r.reasonCode], ["t4", "wrap-around"]);
  });
  test("skipped-earlier counts open earlier topics and they stay as alternatives", () => {
    let s = A.completeTopic(emptyProgress(), T, "t1", at(0)); s = A.completeTopic(s, T, "t2", at(1)); s = A.completeTopic(s, T, "t3", at(2));
    s = A.completeTopic(s, T, "t5", at(3));                                   // t4 still open, t5 done early
    const r = S.recommendNext(s, T) as any;
    assert.deepEqual([r.topic.id, r.reasonCode, r.skippedEarlier], ["t6", "after-completed", 1]);
    assert.deepEqual(r.alternatives.map((t: any) => t.id), ["t4"]);
  });
  test("done when everything is completed; current topic/phase become null", () => {
    let s = emptyProgress(); for (const [i, t] of T.topics.entries()) s = A.completeTopic(s, T, t.id, at(i));
    assert.equal(S.recommendNext(s, T).kind, "done"); assert.equal(S.currentTopic(s, T), null); assert.equal(S.currentPhase(s, T), null);
    assert.equal(S.overallProgress(s, T).percent, 100);
  });
  test("current topic/phase follow the learner", () => {
    let s = emptyProgress(); assert.equal(S.currentTopic(s, T)!.id, "t1"); assert.equal(S.currentPhase(s, T)!.id, "pA");
    for (const [i, id] of ["t1", "t2", "t3", "t4"].entries()) s = A.completeTopic(s, T, id, at(i));
    assert.equal(S.currentPhase(s, T)!.id, "pB");
  });
  test("real curriculum: walking the recommendations completes all 80 topics, always valid", () => {
    const clk = clock(); let s = emptyProgress(); let steps = 0;
    for (;;) {
      const r = S.recommendNext(s, R); if (r.kind === "done") break;
      assert.equal(S.isReady(s, R, r.topic.id), true, `${r.topic.id} must be ready`);
      assert.equal(S.unmetPrerequisites(s, R, r.topic.id).length, 0);
      s = A.completeTopic(s, R, r.topic.id, clk()); steps++; assert.ok(steps <= 80);
    }
    assert.equal(steps, 80); assert.equal(S.overallProgress(s, R).complete, true);
    assert.ok(S.allMilestoneProgress(s, R).every(m => m.complete)); assert.ok(S.allPhaseProgress(s, R).every(p => p.complete));
  });
  test("real curriculum: completing in curriculum order recommends the next topic in order", () => {
    const clk = clock(); let s = emptyProgress();
    for (const [i, t] of R.topics.slice(0, 79).entries()) { s = A.completeTopic(s, R, t.id, clk()); assert.equal((S.recommendNext(s, R) as any).topic.id, R.topics[i + 1].id); }
  });
});

describe("recently completed and time estimates", () => {
  test("most recent first, limited, ties broken by order", () => {
    let s = emptyProgress(); s = A.completeTopic(s, T, "t2", at(1)); s = A.completeTopic(s, T, "t1", at(3)); s = A.completeTopic(s, T, "t4", at(3));
    assert.deepEqual(S.recentlyCompleted(s, T).map(x => x.topic.id), ["t4", "t1", "t2"]);
    assert.deepEqual(S.recentlyCompleted(s, T, 2).map(x => x.topic.id), ["t4", "t1"]); assert.deepEqual(S.recentlyCompleted(s, T, 0), []);
  });
  test("un-completed topics drop out of the list", () => {
    let s = A.completeTopic(emptyProgress(), T, "t1", at(0)); s = A.toggleComplete(s, T, "t1", at(1));
    assert.deepEqual(S.recentlyCompleted(s, T), []);
  });
  test("remaining time in minutes, hours and weeks", () => {
    const s = A.completeTopic(emptyProgress(), T, "t1", at(0));   // 200 minutes left
    assert.deepEqual(S.estimateRemaining(s, T, 100), { minutes: 200, hours: 3.3, weeks: 2 });
    assert.equal(S.estimateRemaining(emptyProgress(), T).weeks, 12);   // default pace = total / 12 weeks
    assert.throws(() => S.estimateRemaining(s, T, 0), RangeError);
  });
  test("estimate reaches zero at completion", () => {
    let s = emptyProgress(); for (const t of T.topics) s = A.completeTopic(s, T, t.id, at(0));
    assert.deepEqual(S.estimateRemaining(s, T), { minutes: 0, hours: 0, weeks: 0 });
  });
});
