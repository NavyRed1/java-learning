import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Example, QuizQuestion, Topic } from "../../lib/curriculum/types.ts";
import type { CurriculumIndex } from "../../lib/curriculum/index.ts";
import { exampleById, GROUP_LABEL, quizById, resourceById } from "../../lib/data.ts";
import { masteryOf, recommendNext, topicStatus, topicView, type TopicView } from "../../lib/progress/selectors.ts";
import { useProgressSnapshot, useProgressStore } from "../../lib/progress/react.tsx";
import { useCompletion, useMotionEvent } from "../../lib/motion/react.tsx";
import { useSfx } from "../../lib/ui/ui-context.tsx";
import { DIFFICULTY_LABEL, MASTERY_RULE, minutesText } from "../../lib/ui/copy.ts";
import { Badge } from "../ui/Badge.tsx";
import { Button } from "../ui/Button.tsx";
import { CodeBlock, parseRange } from "../ui/CodeBlock.tsx";
import { Callout, EmptyState, Skeleton } from "../ui/Feedback.tsx";
import { Icon, type IconName } from "../ui/Icon.tsx";
import { Hourglass, NotFoundArt, SuccessBadge } from "../ui/Media.tsx";
import { Inline, Prose } from "../ui/Prose.tsx";
import { ProgressBar } from "../ui/Progress.tsx";
import { StatusGlyph, statusLabel } from "../ui/StatusGlyph.tsx";
import { TabList, type TabDef } from "../ui/Tabs.tsx";
import { QuizRunner } from "./QuizRunner.tsx";
import { useTopicContent } from "./useTopicContent.ts";

type Tab = "learn" | "code" | "practice" | "check" | "explore";
const TABS: TabDef<Tab>[] = [{ id: "learn", label: "Learn", icon: "book" }, { id: "code", label: "Code", icon: "code" }, { id: "practice", label: "Practice", icon: "pencil" }, { id: "check", label: "Check", icon: "target" }, { id: "explore", label: "Explore", icon: "map" }];

export function TopicPanel({ ix, topicId, onSelect }: { ix: CurriculumIndex; topicId: string; onSelect: (id: string) => void }) {
  const prev = useRef<number | null>(null); const order = ix.topicById.get(topicId)?.order ?? 0;
  const dir = prev.current === null ? "up" : order > prev.current ? "next" : order < prev.current ? "prev" : "up"; prev.current = order;
  return <TopicPanelBody key={topicId} ix={ix} topicId={topicId} onSelect={onSelect} dir={dir} />;
}

function TopicPanelBody({ ix, topicId, onSelect, dir }: { ix: CurriculumIndex; topicId: string; onSelect: (id: string) => void; dir: string }) {
  const { progress } = useProgressSnapshot(); const sfx = useSfx();
  const [tab, setTab] = useState<Tab>("learn"); const tabDir = useRef("up"); const [retry, setRetry] = useState(0);
  const [attempts, setAttempts] = useState<Record<string, string>>({});
  const [nextCard, setNextCard] = useState<{ nextId: string | null } | null>(null);
  const view = useMemo(() => topicView(progress, ix, topicId), [progress, ix, topicId]);
  const authored = view?.topic.contentStatus !== "outline";
  const content = useTopicContent(topicId, authored, retry);
  useMotionEvent(e => { if (e.type === "completion:panel" && e.topicId === topicId) setNextCard({ nextId: e.nextId }); });
  useEffect(() => { if (view && view.status !== "completed") setNextCard(null); }, [view?.status]);
  useEffect(() => { if (content.status === "error") sfx("error"); }, [content.status, sfx]);
  if (!view) return <div className="panel"><div className="panel__scroll"><div className="notfound"><NotFoundArt /><h1 className="display">Topic not found</h1><p className="muted">This topic isn't part of the roadmap. Pick one from the map or the list.</p></div></div></div>;
  const t = view.topic; const phase = ix.phaseById.get(t.phase)!; const ms = ix.milestoneById.get(t.milestone)!;
  const prev = ix.topics[t.order - 2], next = ix.topics[t.order];
  const questions = t.quizIds.map(id => quizById.get(id)!).filter(Boolean); const hasMastery = questions.length > 0; const idp = `tp-${topicId}`;
  const changeTab = (n: Tab) => { tabDir.current = TABS.findIndex(x => x.id === n) > TABS.findIndex(x => x.id === tab) ? "next" : "prev"; setTab(n); };

  return (
    <article className="panel" aria-labelledby={`${idp}-title`} data-topic={topicId} data-dir={dir}>
      <div className="panel__scroll">
        <header className="panel__head panel__enter">
          <p className="eyebrow panel__crumb">Phase {ix.phases.indexOf(phase) + 1} · {ms.title}</p>
          <h1 className="panel__title display" id={`${idp}-title`}>{t.title}</h1>
          <div className="panel__badges">
            <Badge tone="outline">{DIFFICULTY_LABEL[t.difficulty]}</Badge>
            <Badge tone="outline" icon="clock">{minutesText(t.estimatedMinutes)}</Badge>
            {t.depth === "survey" ? <Badge tone="outline" title="A short survey of this tool or framework">Overview depth</Badge> : null}
            <Badge tone={authored ? "ok" : "warn"}>{authored ? "Lesson ready" : "Outline only"}</Badge>
          </div>
          <StatusRow view={view} hasMastery={hasMastery} onCheck={() => changeTab("check")} quiet={!!nextCard} />
          {nextCard && view.status === "completed" ? <NextRecommended ix={ix} view={view} nextId={nextCard.nextId} onSelect={onSelect} hasMastery={hasMastery} onCheck={() => changeTab("check")} /> : null}
          <PrereqStrip view={view} ix={ix} onSelect={onSelect} />
        </header>
        <div className="panel__tabs"><TabList tabs={TABS} value={tab} onChange={changeTab} label="Topic sections" idPrefix={idp} /></div>
        <div className="panel__body" role="tabpanel" id={`${idp}-panel-${tab}`} aria-labelledby={`${idp}-tab-${tab}`} tabIndex={0} key={tab} data-tabdir={tabDir.current}>
          {tab === "learn" ? <LearnTab view={view} content={content} onRetry={() => setRetry(n => n + 1)} /> : null}
          {tab === "code" ? <CodeTab topic={t} content={content} onSelect={onSelect} /> : null}
          {tab === "practice" ? <PracticeTab view={view} attempts={attempts} setAttempt={(id, v) => setAttempts(a => ({ ...a, [id]: v }))} /> : null}
          {tab === "check" ? <CheckTab view={view} questions={questions} /> : null}
          {tab === "explore" ? <ExploreTab view={view} ix={ix} onSelect={onSelect} /> : null}
        </div>
      </div>
      <footer className="panel__foot">
        <Button variant="ghost" icon="arrow-left" disabled={!prev} onClick={() => prev && onSelect(prev.id)} aria-label={prev ? `Previous topic: ${prev.title}` : "No previous topic"} className="panel__nav"><span className="panel__navlabel">{prev?.title ?? "Start"}</span></Button>
        <PrimaryAction view={view} />
        <Button variant="ghost" iconEnd="arrow-right" cue="click" disabled={!next} onClick={() => next && onSelect(next.id)} aria-label={next ? `Next topic: ${next.title}` : "No next topic"} className="panel__nav panel__nav--next"><span className="panel__navlabel">{next?.title ?? "End"}</span></Button>
      </footer>
    </article>
  );
}

/** Start -> Mark complete -> (press, check draws, sequence) -> Completed -> Reopen. */
function PrimaryAction({ view }: { view: TopicView }) {
  const store = useProgressStore(); const { complete, active } = useCompletion(); const id = view.topic.id; const celebrating = active === id;
  if (celebrating) return <Button variant="primary" className="btn--celebrate" data-celebrate aria-live="polite"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 8.4l3 3L12.5 5" className="draw-tick" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>Completed</Button>;
  if (view.status === "completed") return <Button variant="secondary" icon="reset" cue="toggle" onClick={() => store.toggleComplete(id)}>Reopen topic</Button>;
  if (view.status === "in-progress") return <Button variant="primary" iconEnd="check" magnetic onClick={() => complete(id)}>Mark complete</Button>;
  return <Button variant="primary" iconEnd="arrow-right" cue="click" magnetic onClick={() => store.startTopic(id)}>Start topic</Button>;
}

function StatusRow({ view, hasMastery, onCheck, quiet }: { view: TopicView; hasMastery: boolean; onCheck: () => void; quiet?: boolean }) {
  const { complete } = useCompletion(); const m = view.mastery;
  return (
    <div className="statusrow">
      <p className="statusrow__line">
        <StatusGlyph status={view.status} size={18} progress={null} />
        <span className="statusrow__label" data-testid="topic-status">{statusLabel(view.status)}</span>
        {hasMastery ? <Badge tone={m.status === "mastered" ? "ok" : m.status === "attempted" ? "warn" : "neutral"} icon="target" className="masterybadge" >
          {m.status === "mastered" ? "Mastered" : m.status === "attempted" ? `Check attempted · best ${Math.round((m.bestRatio ?? 0) * 100)}%` : "Mastery check not taken"}</Badge>
          : <Badge tone="neutral" icon="target">No mastery check yet</Badge>}
      </p>
      {view.status === "not-started" ? <button type="button" className="linkbtn" onClick={() => complete(view.topic.id)}>Already know this? Mark complete</button> : null}
      {view.completedWithoutMastery && hasMastery && !quiet ? (
        <Callout tone="warn" icon="target" title="Completed without the mastery check" action={<Button size="sm" variant="secondary" cue="click" onClick={onCheck}>Take the check</Button>}>
          Mastery is recommended, not required. A short check locks in what you learned.
        </Callout>) : null}
    </div>
  );
}

/** Appears when the completion sequence reaches its last step: the panel hands the learner to the next useful action. */
function NextRecommended({ ix, view, nextId, onSelect, hasMastery, onCheck }: { ix: CurriculumIndex; view: TopicView; nextId: string | null; onSelect: (id: string) => void; hasMastery: boolean; onCheck: () => void }) {
  const next = nextId ? ix.topicById.get(nextId) : null; const { progress } = useProgressSnapshot();
  const rec = recommendNext(progress, ix); const done = rec.kind === "done";
  return (
    <section className="nextcard glass" aria-label="Topic complete" data-testid="next-recommended">
      <SuccessBadge size={64} />
      <div className="nextcard__text">
        <p className="eyebrow">{done ? "Roadmap complete" : "Next recommended"}</p>
        <p className="nextcard__title display">{done ? "You finished every topic." : next?.title ?? "Pick your next topic"}</p>
        <p className="nextcard__sub">{done ? "Revisit anything from the map, or retake a mastery check." : `${view.topic.title} is complete. Keep the momentum: this one is ready.`}</p>
        <div className="nextcard__actions">
          {next && !done ? <Button variant="primary" iconEnd="arrow-right" cue="click" magnetic onClick={() => onSelect(next.id)}>Open {next.title}</Button> : null}
          {hasMastery && view.mastery.status !== "mastered" ? <Button variant="secondary" icon="target" cue="click" onClick={onCheck}>Take the mastery check</Button> : null}
        </div>
      </div>
    </section>
  );
}

function PrereqStrip({ view, ix, onSelect }: { view: TopicView; ix: CurriculumIndex; onSelect: (id: string) => void }) {
  const pre = view.topic.prerequisites.map(id => ix.topicById.get(id)!);
  if (!pre.length) return <p className="prereq prereq--none" data-tone="prereq">No prerequisites. A good place to start.</p>;
  return (
    <div className="prereq" data-tone="prereq" data-open={view.unmet.length > 0 || undefined}>
      <p className="prereq__label">Builds on <span className="tnum">({pre.length - view.unmet.length} of {pre.length} done)</span></p>
      <ul className="prereq__list">{pre.map(p => <li key={p.id}><button type="button" className="pchip" onClick={() => onSelect(p.id)}><PrereqGlyph id={p.id} />{p.title}</button></li>)}</ul>
      {view.unmet.length ? <p className="prereq__note">You can still study and complete this topic.</p> : null}
    </div>
  );
}
function PrereqGlyph({ id }: { id: string }) { const { progress } = useProgressSnapshot(); return <StatusGlyph status={topicStatus(progress, id)} size={14} label />; }

/* ---------------- tabs ---------------- */
type Tone = "learn" | "code" | "warn" | "practice" | "mastery" | "prereq" | "resource" | "success";
function Section({ title, children, id, tone = "learn", icon }: { title: string; children: ReactNode; id?: string; tone?: Tone; icon?: IconName }) {
  return <section className="sec glass-card" data-tone={tone} aria-labelledby={id}><h2 className="sec__title" id={id}>{icon ? <span className="sec__icon"><Icon name={icon} size={13} /></span> : null}{title}</h2>{children}</section>;
}

function LearnTab({ view, content, onRetry }: { view: TopicView; content: ReturnType<typeof useTopicContent>; onRetry: () => void }) {
  const store = useProgressStore(); const sfx = useSfx(); const t = view.topic; const done = view.subtopicsDone;
  return (
    <>
      <Section title="Overview" icon="book"><p className="lede"><Inline text={t.description} /></p></Section>
      <Section title="By the end you can" icon="flag"><ul className="objectives">{t.objectives.map(o => <li key={o}><Icon name="check" size={14} /><span>{o}</span></li>)}</ul></Section>
      {t.subtopics.length ? (
        <Section title="What this covers" icon="list">
          <div className="subprog"><span className="tnum">{done.length} of {t.subtopics.length} covered</span><ProgressBar value={(done.length / t.subtopics.length) * 100} label="Subtopics covered" size="sm" /></div>
          <ul className="subtopics">{t.subtopics.map(s => (
            <li key={s.id}><label className="check"><input type="checkbox" checked={done.includes(s.id)} onChange={() => { sfx("toggle"); store.toggleSubtopic(t.id, s.id); }} /><span className="check__box" aria-hidden="true"><Icon name="check" size={12} /></span>
              <span><strong>{s.title}</strong><span className="check__sub">{s.summary}</span></span></label></li>))}</ul>
        </Section>) : null}
      {content.status === "loading" ? <div className="loading"><Hourglass size={44} label="Loading lesson" /><Skeleton lines={5} /></div> : null}
      {content.status === "error" ? <Callout tone="danger" role="alert" title="This lesson didn't load" action={<Button size="sm" variant="secondary" cue="click" onClick={onRetry}>Try again</Button>}>Check your connection and try again.</Callout> : null}
      {content.status === "none" ? (
        <EmptyState icon="pencil" title="Lesson text is still in outline">
          The objectives, difficulty, time estimate and prerequisites above are final. The explanation, examples, practice and mastery check for this topic aren't written yet. You can still track it and mark it complete.
        </EmptyState>) : null}
      {content.status === "ready" ? (
        <>
          <Section title="Why it matters" icon="sparkle"><Prose text={content.content.whyItMatters} /></Section>
          <Section title="Mental model" icon="map"><Prose text={content.content.mentalModel} /></Section>
          <Section title="Syntax and reference" icon="code"><CodeBlock code={content.content.syntaxReference} language={content.content.syntaxLanguage ?? "java"} file="Reference" lineNumbers={false} /></Section>
          {content.content.supporting?.map(s => (<Section key={s.title} title={s.title} icon="info"><Badge tone="neutral">Supporting material, not a roadmap topic</Badge><Prose text={s.body} /></Section>))}
        </>) : null}
    </>
  );
}

function ExampleView({ ex, notes }: { ex: Example; notes: { lines: string; text: string }[] }) {
  const [active, setActive] = useState<string | null>(null); const range = active ? parseRange(active) : null; const isErr = ex.outputKind === "error";
  return (
    <div className="example" data-example={ex.id}>
      <h3 className="example__title">{ex.title}</h3>
      <CodeBlock code={ex.code} language={ex.language ?? "java"} file={ex.file} highlight={range} executable={ex.runnable} />
      {ex.expectedOutput ? <div className="output" data-kind={isErr ? "error" : "stdout"}><p className="eyebrow"><Icon name={isErr ? "info" : "play"} size={11} />{isErr ? "Expected error output (documented, not executed)" : "Expected output (documented, not executed)"}</p><pre className="output__pre mono">{ex.expectedOutput}</pre></div> : null}
      {notes.length ? (
        <ol className="notes" aria-label="Line by line">
          {notes.map(n => (<li key={n.lines}><button type="button" className="note" aria-pressed={active === n.lines} onClick={() => setActive(a => (a === n.lines ? null : n.lines))}>
            <span className="note__lines mono">{n.lines.includes("-") ? `Lines ${n.lines}` : `Line ${n.lines}`}</span><span className="note__text"><Inline text={n.text} /></span></button></li>))}
        </ol>) : null}
      <ul className="takeaways">{ex.takeaways.map(k => <li key={k}><Inline text={k} /></li>)}</ul>
    </div>
  );
}

function CodeTab({ topic, content, onSelect }: { topic: Topic; content: ReturnType<typeof useTopicContent>; onSelect: (id: string) => void }) {
  const exs = topic.examples.map(id => exampleById.get(id)!).filter(Boolean); const [i, setI] = useState(0);
  if (content.status === "loading") return <div className="loading"><Hourglass size={44} label="Loading examples" /><Skeleton lines={8} /></div>;
  if (!exs.length || content.status !== "ready") return <EmptyState icon="code" title="No examples yet">Code examples, line-by-line explanations and common mistakes arrive with this topic's lesson text.</EmptyState>;
  const c = content.content; const ex = exs[Math.min(i, exs.length - 1)]; const notes = c.lineByLine.find(l => l.exampleId === ex.id)?.notes ?? [];
  return (
    <>
      <Callout tone="info" icon="info" title="Running code isn't available in the browser yet">Copy an example and run it with your own JDK. Expected output is documented, never simulated.</Callout>
      <Section title="Real Java example" tone="code" icon="code">
        {exs.length > 1 ? <div className="exswitch" role="group" aria-label="Examples">{exs.map((e, k) => <button key={e.id} type="button" className="chip" aria-pressed={k === i} onClick={() => setI(k)}>{e.title}</button>)}</div> : null}
        <ExampleView key={ex.id} ex={ex} notes={notes} />
      </Section>
      <Section title="Common mistakes" tone="warn" icon="info">
        <ul className="mistakes">{c.commonMistakes.map(m => <li key={m.mistake} className="mistake"><p className="mistake__bad"><Icon name="close" size={14} /><span><Inline text={m.mistake} /></span></p><p className="mistake__fix"><Icon name="check" size={14} /><span><Inline text={m.fix} /></span></p></li>)}</ul>
      </Section>
      {c.comparisons?.length ? (
        <Section title="Compare with" icon="link"><ul className="compare">{c.comparisons.map(cmp => <li key={cmp.with}><button type="button" className="linkbtn" onClick={() => onSelect(cmp.with)}>{cmp.with.replace(/-/g, " ")}</button><p><Inline text={cmp.summary} /></p></li>)}</ul></Section>) : null}
    </>
  );
}

function PracticeTab({ view, attempts, setAttempt }: { view: TopicView; attempts: Record<string, string>; setAttempt: (id: string, v: string) => void }) {
  const store = useProgressStore(); const sfx = useSfx(); const t = view.topic; const done = view.exercisesDone;
  const [ticks, setTicks] = useState<Record<string, number[]>>({}); const [hints, setHints] = useState<Record<string, number>>({});
  if (!t.exercises.length) return <EmptyState icon="pencil" title="No practice tasks yet">Practice tasks are written together with the lesson. Until then, try the topic's objectives on your own machine.</EmptyState>;
  return (
    <>
      <div className="subprog"><span className="tnum">{done.length} of {t.exercises.length} tasks done</span><ProgressBar value={(done.length / t.exercises.length) * 100} label="Practice tasks done" size="sm" /></div>
      <ol className="exercises">
        {t.exercises.map((e, n) => {
          const checks = e.checks ?? []; const got = ticks[e.id] ?? []; const all = checks.length > 0 && got.length === checks.length; const isDone = done.includes(e.id); const shown = hints[e.id] ?? 0;
          return (
            <li key={e.id} className="exercise glass-card" data-tone="practice" data-done={isDone || undefined} data-ready={(all && !isDone) || undefined}>
              <label className="check">
                <input type="checkbox" checked={isDone} onChange={() => { sfx("toggle"); store.toggleExercise(t.id, e.id); }} /><span className="check__box" aria-hidden="true"><Icon name="check" size={12} /></span>
                <span className="exercise__t"><span className="eyebrow">Task {n + 1}</span><strong>{e.title}</strong></span>
              </label>
              <Prose text={e.prompt} />
              <label className="attempt"><span className="attempt__label">Your attempt <small>(kept in this tab only; nothing is run)</small></span>
                <textarea className="attempt__input mono" spellCheck={false} rows={e.starterCode ? Math.min(10, e.starterCode.split("\n").length + 1) : 4} value={attempts[e.id] ?? e.starterCode ?? ""} placeholder="Write your solution or notes here" onChange={ev => setAttempt(e.id, ev.target.value)} /></label>
              <div className="attempt__bar">
                <button type="button" className="linkbtn" onClick={() => setAttempt(e.id, e.starterCode ?? "")}>Reset</button>
                <button type="button" className="linkbtn" onClick={() => void navigator.clipboard?.writeText(attempts[e.id] ?? e.starterCode ?? "").catch(() => {})}>Copy</button>
              </div>
              {checks.length ? (
                <fieldset className="selfcheck"><legend className="eyebrow">Check yourself</legend>
                  {checks.map((c, ci) => (<label key={c} className="check"><input type="checkbox" checked={got.includes(ci)} onChange={() => { sfx("toggle"); setTicks(x => ({ ...x, [e.id]: got.includes(ci) ? got.filter(g => g !== ci) : [...got, ci] })); }} /><span className="check__box" aria-hidden="true"><Icon name="check" size={12} /></span><span>{c}</span></label>))}
                  {all && !isDone ? <div className="selfcheck__win" role="status"><Icon name="check" size={14} />Looks complete. <button type="button" className="linkbtn" onClick={() => { sfx("toggle"); store.toggleExercise(t.id, e.id); }}>Mark task done</button></div> : null}
                </fieldset>) : null}
              {e.hints?.length ? (
                <div className="hints"><p className="hints__head eyebrow">Hints · {shown} of {e.hints.length} shown</p>
                  {e.hints.slice(0, shown).map(h => <p key={h} className="hint"><Icon name="info" size={13} /><span><Inline text={h} /></span></p>)}
                  {shown < e.hints.length ? <button type="button" className="linkbtn" onClick={() => setHints(x => ({ ...x, [e.id]: shown + 1 }))}>{shown ? "Show another hint" : "Show a hint"}</button> : null}
                </div>) : null}
            </li>);
        })}
      </ol>
    </>
  );
}

function CheckTab({ view, questions }: { view: TopicView; questions: QuizQuestion[] }) {
  const store = useProgressStore(); const { progress } = useProgressSnapshot(); const { complete } = useCompletion(); const m = masteryOf(progress, view.topic.id);
  if (!questions.length) return <EmptyState icon="target" title="No mastery check yet">The check is written with the lesson. Mastery stays optional: you can mark this topic complete without it.</EmptyState>;
  return (
    <>
      <Callout tone="info" icon="target" title="Mastery check (recommended, not required)">
        {MASTERY_RULE} {m.attempts ? `You have ${m.attempts} attempt${m.attempts === 1 ? "" : "s"}; best score ${Math.round((m.bestRatio ?? 0) * 100)}%.` : "You haven't tried it yet."}
      </Callout>
      <QuizRunner topicId={view.topic.id} questions={questions} completed={view.status === "completed"} onSubmit={a => store.recordQuizAttempt(a)} onComplete={() => complete(view.topic.id)} />
    </>
  );
}

function ExploreTab({ view, ix, onSelect }: { view: TopicView; ix: CurriculumIndex; onSelect: (id: string) => void }) {
  const t = view.topic; const { progress } = useProgressSnapshot();
  const row = (id: string) => { const x = ix.topicById.get(id)!; return <li key={id}><button type="button" className="trow" onClick={() => onSelect(id)}><StatusGlyph status={topicStatus(progress, id)} label /><span>{x.title}</span><Icon name="chevron-right" size={14} /></button></li>; };
  const unlocks = ix.dependentsById.get(t.id) ?? []; const res = t.resources.map(id => resourceById.get(id)!).filter(Boolean);
  return (
    <>
      <Section title="Where this sits" icon="map"><p className="muted">{GROUP_LABEL[t.group]}{t.cluster ? ` › ${t.cluster}` : ""} on roadmap.sh · Module {ix.milestoneById.get(t.milestone)!.order}: {ix.milestoneById.get(t.milestone)!.title}</p></Section>
      <Section title="Prerequisites" tone="prereq" icon="link">{t.prerequisites.length ? <ul className="trows">{t.prerequisites.map(row)}</ul> : <p className="muted">None. You can start here.</p>}</Section>
      <Section title="Unlocks" tone="prereq" icon="arrow-right">{unlocks.length ? <ul className="trows">{unlocks.map(u => row(u.id))}</ul> : <p className="muted">No other topic lists this as a prerequisite.</p>}</Section>
      <Section title="Related topics" icon="link">{t.relatedTopics.length ? <ul className="trows">{t.relatedTopics.map(row)}</ul> : <p className="muted">None listed.</p>}</Section>
      <Section title="Recommended resources" tone="resource" icon="book">
        {res.length ? <ul className="resources">{res.map(r => (
          <li key={r.id}><a href={r.url} target="_blank" rel="noopener noreferrer" className="resource"><span className="resource__t">{r.title}<Icon name="external" size={13} /></span><span className="resource__s">{r.summary}</span><span className="resource__k"><Badge tone="outline">{r.kind.replace("-", " ")}</Badge>{r.free ? <Badge tone="ok">Free</Badge> : null}</span></a></li>))}</ul>
          : <p className="muted">Resources are added when the lesson is written.</p>}
      </Section>
    </>
  );
}
