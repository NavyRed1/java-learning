// Run: node scripts/validate-curriculum.ts [--release]
// Zero dependencies. Node >= 22.18 strips types natively.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Phase, Milestone, Topic, Example, QuizQuestion, Resource, TopicContent } from "../src/lib/curriculum/types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = <T>(p: string): T => JSON.parse(readFileSync(join(root, p), "utf8"));
const errors: string[] = [], warnings: string[] = [];
const err = (m: string) => errors.push(m);
const release = process.argv.includes("--release");

const phases = load<Phase[]>("data/curriculum/phases.json");
const milestones = load<Milestone[]>("data/curriculum/milestones.json");
const topics = load<Topic[]>("data/curriculum/topics.json");
const lock = load<{ nodes: { label: string; group: string; cluster: string | null }[] }>("data/curriculum/roadmap-sh-nodes.json");
const baseline = load<any>("data/baseline/sagar-baseline.json");

const GROUPS = new Set(["basics","oop","collections","concurrency","advanced","functional","build-tools","web-frameworks","database-access","documentation","logging","testing"]);
const EXPECT = { phases: 4, milestones: 28, topics: 80 };

// counts
if (phases.length !== EXPECT.phases) err(`phases: expected ${EXPECT.phases}, got ${phases.length}`);
if (milestones.length !== EXPECT.milestones) err(`milestones: expected ${EXPECT.milestones}, got ${milestones.length}`);
if (topics.length !== EXPECT.topics) err(`topics: expected ${EXPECT.topics}, got ${topics.length}`);

// unique ids
const uniq = (label: string, ids: string[]) => { const s = new Set<string>(); for (const i of ids) { if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(i)) err(`${label} id not kebab-case: ${i}`); if (s.has(i)) err(`${label} duplicate id: ${i}`); s.add(i); } return s; };
const phaseIds = uniq("phase", phases.map(p => p.id));
const msIds = uniq("milestone", milestones.map(m => m.id));
const topicIds = uniq("topic", topics.map(t => t.id));
const order = new Map(topics.map(t => [t.id, t.order]));

// phases: contiguous weeks 1..12
let wk = 1;
for (const p of [...phases].sort((a, b) => a.order - b.order)) { if (p.weeks.start !== wk) err(`phase ${p.id} weeks not contiguous (starts ${p.weeks.start}, expected ${wk})`); wk = p.weeks.end + 1; }
if (wk !== 13) err(`phases must cover weeks 1-12, end at ${wk - 1}`);

// milestones
const msPhase = new Map(milestones.map(m => [m.id, m.phase]));
for (const m of milestones) if (!phaseIds.has(m.phase)) err(`milestone ${m.id} unknown phase ${m.phase}`);
milestones.forEach((m, i) => { if (m.order !== i + 1) err(`milestone ${m.id} order ${m.order} != ${i + 1}`); if (i && phases.findIndex(p => p.id === m.phase) < phases.findIndex(p => p.id === milestones[i - 1].phase)) err(`milestone ${m.id} phase out of order`); });
const perMs = new Map<string, number>();

// topics
topics.forEach((t, i) => {
  if (t.order !== i + 1) err(`${t.id}: order ${t.order} != array position ${i + 1}`);
  if (!GROUPS.has(t.group)) err(`${t.id}: unknown group ${t.group}`);
  if (!msIds.has(t.milestone)) err(`${t.id}: unknown milestone ${t.milestone}`);
  else if (msPhase.get(t.milestone) !== t.phase) err(`${t.id}: phase ${t.phase} != milestone's phase ${msPhase.get(t.milestone)}`);
  perMs.set(t.milestone, (perMs.get(t.milestone) ?? 0) + 1);
  if (i && milestones.findIndex(m => m.id === t.milestone) < milestones.findIndex(m => m.id === topics[i - 1].milestone)) err(`${t.id}: milestone order goes backwards`);
  if (t.title !== t.sourceLabel) err(`${t.id}: title must equal sourceLabel`);
  if (!t.description || t.description.length < 40) err(`${t.id}: description missing/too short`);
  if (!Array.isArray(t.objectives) || t.objectives.length < 3 || t.objectives.some(o => !o.trim())) err(`${t.id}: needs >= 3 non-empty objectives`);
  if (!(t.estimatedMinutes >= 20 && t.estimatedMinutes <= 180)) err(`${t.id}: estimatedMinutes out of range`);
  for (const [k, list] of [["prerequisites", t.prerequisites], ["relatedTopics", t.relatedTopics]] as const) {
    if (new Set(list).size !== list.length) err(`${t.id}: duplicate in ${k}`);
    for (const r of list) { if (r === t.id) err(`${t.id}: self reference in ${k}`); else if (!topicIds.has(r)) err(`${t.id}: broken ${k} ref ${r}`); }
  }
  for (const p of t.prerequisites) if (topicIds.has(p) && order.get(p)! >= t.order) err(`${t.id}: prerequisite ${p} is not earlier in learning order (cycle risk)`);
  for (const r of t.relatedTopics) if (t.prerequisites.includes(r)) warnings.push(`${t.id}: ${r} is both prerequisite and related`);
});
for (const m of milestones) if (!perMs.get(m.id)) err(`milestone ${m.id} has no topics`);

// roadmap.sh lock: exact bijection of labels, groups, clusters
const lockByLabel = new Map(lock.nodes.map(n => [n.label, n]));
if (lock.nodes.length !== lockByLabel.size) err("lock file has duplicate labels");
for (const t of topics) { const n = lockByLabel.get(t.sourceLabel); if (!n) err(`${t.id}: label "${t.sourceLabel}" not in roadmap.sh lock (invented/renamed node)`); else if (n.group !== t.group || n.cluster !== t.cluster) err(`${t.id}: group/cluster differs from lock`); }
const have = new Set(topics.map(t => t.sourceLabel));
for (const n of lock.nodes) if (!have.has(n.label)) err(`roadmap.sh node missing from topics: ${n.label}`);

// Sagar baseline traceability
if (baseline.topics.length !== 28) err(`baseline must list 28 Sagar topics, got ${baseline.topics.length}`);
for (const s of baseline.topics) {
  const c = s.covers ?? {};
  if (c.deliveredBy === "projects") continue;
  if (!msIds.has(c.milestone)) err(`baseline #${s.n} ${s.name}: unknown milestone ${c.milestone}`);
  if (!c.topics?.length) err(`baseline #${s.n} ${s.name}: no covering topics`);
  for (const id of c.topics ?? []) if (!topicIds.has(id)) err(`baseline #${s.n}: unknown topic ${id}`);
}

// authored content: examples, quizzes, resources, per-topic prose
const opt = <T>(p: string): T[] => (existsSync(join(root, p)) ? load<T[]>(p) : []);
const examples = opt<Example>("data/examples/examples.json");
const quizzes = opt<QuizQuestion>("data/quizzes/topic-quizzes.json");
const resources = opt<Resource>("data/resources/resources.json");
const exampleById = new Map(examples.map(e => [e.id, e])), quizById = new Map(quizzes.map(q => [q.id, q])), resById = new Map(resources.map(r => [r.id, r]));
uniq("example", examples.map(e => e.id)); uniq("quiz question", quizzes.map(q => q.id)); uniq("resource", resources.map(r => r.id));
const lineCount = (c: string) => c.split("\n").length;
for (const e of examples) {
  for (const t of e.topics) if (!topicIds.has(t)) err(`example ${e.id}: unknown topic ${t}`);
  if (!e.code.trim() || !e.takeaways.length) err(`example ${e.id}: empty code or takeaways`);
  if (e.runnable && e.language === "shell") err(`example ${e.id}: shell transcripts are not runnable`);
}
for (const q of quizzes) {
  if (!topicIds.has(q.topic)) err(`quiz ${q.id}: unknown topic ${q.topic}`);
  if (!["multiple-choice", "true-false", "output-prediction", "find-the-error"].includes(q.format)) err(`quiz ${q.id}: bad format ${q.format}`);
  if (q.options.length < 2 || q.correct.length !== 1 || q.correct.some(i => !Number.isInteger(i) || i < 0 || i >= q.options.length)) err(`quiz ${q.id}: options/correct invalid`);
  if (new Set(q.options).size !== q.options.length) err(`quiz ${q.id}: duplicate options`);
  if (!q.explanation.trim()) err(`quiz ${q.id}: missing explanation`);
  if ((q.format === "output-prediction" || q.format === "find-the-error") && !q.code) err(`quiz ${q.id}: ${q.format} needs code`);
}
for (const r of resources) {
  if (!/^https:\/\/[^\s]+$/.test(r.url)) err(`resource ${r.id}: url must be https`);
  for (const t of r.topics) if (!topicIds.has(t)) err(`resource ${r.id}: unknown topic ${t}`);
}
for (const t of topics) {
  if (t.contentStatus === "outline") continue;
  const f = `data/content/${t.id}.json`;
  if (!existsSync(join(root, f))) { err(`${t.id}: status ${t.contentStatus} but ${f} is missing`); continue; }
  const c = load<TopicContent>(f);
  if (c.topicId !== t.id) err(`${f}: topicId mismatch`);
  for (const k of ["whyItMatters", "mentalModel", "syntaxReference"] as const) if (!c[k]?.trim()) err(`${t.id}: content.${k} empty`);
  if ((c.commonMistakes?.length ?? 0) < 2) err(`${t.id}: needs >= 2 common mistakes`);
  if (t.subtopics.length < 3) err(`${t.id}: needs >= 3 subtopics`);
  if (new Set(t.subtopics.map(x => x.id)).size !== t.subtopics.length) err(`${t.id}: duplicate subtopic ids`);
  if (t.exercises.length < 2 || new Set(t.exercises.map(x => x.id)).size !== t.exercises.length) err(`${t.id}: needs >= 2 unique exercises`);
  if (!t.examples.length) err(`${t.id}: needs an example`);
  for (const id of t.examples) { const e = exampleById.get(id); if (!e) err(`${t.id}: unknown example ${id}`); else if (!e.topics.includes(t.id)) err(`${t.id}: example ${id} does not list this topic`); }
  if (t.quizIds.length < 3) err(`${t.id}: needs >= 3 quiz questions`);
  for (const id of t.quizIds) { const q = quizById.get(id); if (!q) err(`${t.id}: unknown quiz ${id}`); else if (q.topic !== t.id) err(`${t.id}: quiz ${id} belongs to ${q.topic}`); }
  if (t.resources.length < 2) err(`${t.id}: needs >= 2 resources`);
  for (const id of t.resources) { const r = resById.get(id); if (!r) err(`${t.id}: unknown resource ${id}`); else if (!r.topics.includes(t.id)) err(`${t.id}: resource ${id} does not list this topic`); }
  for (const w of c.lineByLine ?? []) {
    const e = exampleById.get(w.exampleId); if (!e || !t.examples.includes(w.exampleId)) { err(`${t.id}: lineByLine references ${w.exampleId}`); continue; }
    const n = lineCount(e.code);
    for (const note of w.notes) { const m = /^(\d+)(?:-(\d+))?$/.exec(note.lines); if (!m || +m[1] < 1 || +(m[2] ?? m[1]) > n || +(m[2] ?? m[1]) < +m[1]) err(`${t.id}: bad line range "${note.lines}" for ${w.exampleId} (${n} lines)`); }
  }
  for (const cmp of c.comparisons ?? []) if (!topicIds.has(cmp.with)) err(`${t.id}: comparison with unknown topic ${cmp.with}`);
}
for (const f of readdirSync(join(root, "data/content"))) if (f.endsWith(".json") && !topicIds.has(f.slice(0, -5))) err(`data/content/${f}: no such topic`);

// content completeness (release gate)
const status = topics.reduce<Record<string, number>>((a, t) => (a[t.contentStatus] = (a[t.contentStatus] ?? 0) + 1, a), {});
if (release) for (const t of topics) { if (t.contentStatus === "outline") err(`${t.id}: contentStatus "outline" blocks release`); if (!t.examples.length || !t.exercises.length || !t.quizIds.length || !t.resources.length) err(`${t.id}: missing examples/exercises/quizIds/resources`); }

// report
const weeks: Record<string, string[]> = JSON.parse(readFileSync(join(root, "data/curriculum/week-baseline.json"), "utf8"));
const byMs = new Map<string, Topic[]>(); topics.forEach(t => (byMs.get(t.milestone) ?? byMs.set(t.milestone, []).get(t.milestone)!).push(t));
console.log(`phases ${phases.length} | milestones ${milestones.length} | topics ${topics.length} | content ${JSON.stringify(status)}`);
console.log("week  topics  minutes  milestones");
for (const [w, ms] of Object.entries(weeks)) { const ts = ms.flatMap(m => byMs.get(m) ?? []); console.log(`${w.padStart(4)}  ${String(ts.length).padStart(6)}  ${String(ts.reduce((a, t) => a + t.estimatedMinutes, 0)).padStart(7)}  ${ms.join(",")}`); }
warnings.forEach(w => console.log("warn:", w));
if (errors.length) { console.error(`\n${errors.length} error(s):`); errors.forEach(e => console.error(" -", e)); process.exit(1); }
console.log(release ? "\nOK (release gate)" : "\nOK (structure gate; content authoring pending)");
