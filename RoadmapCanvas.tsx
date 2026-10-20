import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { CurriculumIndex } from "../../lib/curriculum/index.ts";
import type { ProgressState } from "../../lib/progress/model.ts";
import { isReady, masteryOf, milestoneProgress, phaseProgress, topicEffort, topicStatus } from "../../lib/progress/selectors.ts";
import { connect, type Rect } from "../../lib/ui/geometry.ts";
import { motionBus } from "../../lib/motion/bus.ts";
import { useReducedMotion } from "../../lib/ui/ui-context.tsx";
import { AnimatedNumber } from "../ui/AnimatedNumber.tsx";
import { ProgressRing } from "../ui/Progress.tsx";
import { Icon } from "../ui/Icon.tsx";
import { RoadmapNode } from "./RoadmapNode.tsx";

type EdgeKind = "prereq" | "dependent" | "trail" | "lit";
interface EdgeSpec { key: string; kind: EdgeKind; from: string; to: string; out: [number, number]; inn: [number, number] }
interface Edge { key: string; kind: EdgeKind; d: string; len: number }
interface Fx { just?: string; burst?: string | null; pathFor?: string; pulse?: string | null; mastery?: string }

export interface RoadmapCanvasProps {
  ix: CurriculumIndex; progress: ProgressState; selectedId: string | null; onSelect: (id: string) => void;
  currentId: string | null; currentKind: "resume" | "next" | null; locateNonce: number;
  /** the learning path toward the recommended topic: from the last completed topic */
  trail: { from: string; to: string } | null;
}

const approxLen = (d: string) => { const n = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number); const [x1, y1, , , , , x2, y2] = n; return Math.hypot((x2 ?? 0) - (x1 ?? 0), (y2 ?? 0) - (y1 ?? 0)) || 80; };

export function RoadmapCanvas({ ix, progress, selectedId, onSelect, currentId, currentKind, locateNonce, trail }: RoadmapCanvasProps) {
  const content = useRef<HTMLDivElement>(null); const nodes = useRef(new Map<string, HTMLElement>());
  const reduced = useReducedMotion();
  const [hover, setHover] = useState<string | null>(null); const [tabStop, setTabStop] = useState<string | null>(null);
  const [edges, setEdges] = useState<Edge[]>([]); const [size, setSize] = useState(0); const [fx, setFx] = useState<Fx>({});

  const focusId = hover ?? selectedId;
  const rel = useMemo(() => {
    const t = focusId ? ix.topicById.get(focusId) : undefined;
    return { prereq: new Set(t?.prerequisites ?? []), dependent: new Set((focusId ? ix.dependentsById.get(focusId) : undefined)?.map(d => d.id) ?? []) };
  }, [ix, focusId]);
  const register = useCallback((id: string, el: HTMLElement | null) => { if (el) nodes.current.set(id, el); else nodes.current.delete(id); }, []);

  useEffect(() => { // the completion choreography and mastery events reach the map through the motion bus
    let clear: ReturnType<typeof setTimeout> | undefined;
    const off = motionBus.subscribe(e => {
      if (e.type === "completion:commit") setFx(f => ({ ...f, just: e.topicId, burst: e.milestoneId }));
      else if (e.type === "completion:path") setFx(f => ({ ...f, pathFor: e.topicId }));
      else if (e.type === "completion:next") { setFx(f => ({ ...f, pulse: e.nextId })); if (e.nextId) nodes.current.get(e.nextId)?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" }); }
      else if (e.type === "completion:end") setFx(f => ({ ...f, just: undefined, burst: null, pathFor: undefined, pulse: undefined }));
      else if (e.type === "mastery") { setFx(f => ({ ...f, mastery: e.topicId })); clearTimeout(clear); clear = setTimeout(() => setFx(f => ({ ...f, mastery: undefined })), 1400); }
    });
    return () => { off(); clearTimeout(clear); };
  }, [reduced]);

  useEffect(() => {
    const el = content.current; if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(entries => setSize(Math.round(entries[0].contentRect.width))); ro.observe(el); return () => ro.disconnect();
  }, []);

  const specs = useMemo<EdgeSpec[]>(() => {
    const out: EdgeSpec[] = [];
    if (focusId) {
      const t = ix.topicById.get(focusId); const pre = t?.prerequisites ?? []; const dep = [...rel.dependent];
      pre.forEach((id, i) => out.push({ key: `prereq-${id}-${focusId}`, kind: "prereq", from: id, to: focusId, out: [0, 1], inn: [i, pre.length] }));
      dep.forEach((id, i) => out.push({ key: `dependent-${focusId}-${id}`, kind: "dependent", from: focusId, to: id, out: [i, dep.length], inn: [0, 1] }));
    }
    if (fx.pathFor) { const pre = ix.topicById.get(fx.pathFor)?.prerequisites ?? []; pre.forEach((id, i) => out.push({ key: `lit-${id}-${fx.pathFor}`, kind: "lit", from: id, to: fx.pathFor!, out: [0, 1], inn: [i, pre.length] })); }
    if (trail && trail.from !== trail.to) out.push({ key: `trail-${trail.from}-${trail.to}`, kind: "trail", from: trail.from, to: trail.to, out: [0, 1], inn: [0, 1] });
    return out;
  }, [ix, focusId, rel, fx.pathFor, trail]);

  useLayoutEffect(() => {
    const host = content.current; if (!host || !specs.length) { setEdges(e => (e.length ? [] : e)); return; }
    const origin = host.getBoundingClientRect();
    const rectOf = (id: string): Rect | null => { const el = nodes.current.get(id); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height }; };
    const out: Edge[] = [];
    for (const s of specs) { const a = rectOf(s.from), b = rectOf(s.to); if (!a || !b) continue; const c = connect(a, b, { index: s.out[0], count: s.out[1] }, { index: s.inn[0], count: s.inn[1] }); out.push({ key: s.key, kind: s.kind, d: c.d, len: approxLen(c.d) }); }
    setEdges(out);
  }, [specs, size, ix]);

  useEffect(() => { // "Show recommended"
    if (!locateNonce || !currentId) return;
    nodes.current.get(currentId)?.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  }, [locateNonce, currentId, reduced]);
  const didInitialScroll = useRef(false);
  useEffect(() => { if (didInitialScroll.current || !selectedId) return; const el = nodes.current.get(selectedId); if (el) { didInitialScroll.current = true; el.scrollIntoView({ block: "center" }); } }, [selectedId]);

  const onKeyDown = (e: KeyboardEvent) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>("[data-topic-id]")?.dataset.topicId; if (!id) return;
    const i = ix.topics.findIndex(t => t.id === id); let j = i;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") j = Math.min(ix.topics.length - 1, i + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = Math.max(0, i - 1);
    else if (e.key === "Home") j = 0; else if (e.key === "End") j = ix.topics.length - 1; else return;
    e.preventDefault(); const next = ix.topics[j].id; setTabStop(next); const el = nodes.current.get(next); el?.focus(); el?.scrollIntoView({ block: "nearest" });
  };

  const stop = tabStop ?? selectedId ?? ix.topics[0].id; const anyFocus = !!focusId;
  const phaseNo = (id: string) => ix.phases.findIndex(p => p.id === id) + 1;

  return (
    <div className="rmap" ref={content} onKeyDown={onKeyDown} role="group" aria-label="Java roadmap: 4 phases, 28 modules, 80 topics. Arrow keys move between topics.">
      <svg className="rmap__edges" width="100%" height="100%" aria-hidden="true">
        <defs>
          {(["prereq", "dependent", "trail", "lit"] as const).map(k => <marker key={k} id={`arrow-${k}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M1 1l6 3-6 3z" className={`rmap__arrow rmap__arrow--${k}`} /></marker>)}
        </defs>
        {edges.map(e => (
          <g key={e.key} className="rmap__edgeg" data-kind={e.kind} style={e.kind === "prereq" || e.kind === "dependent" ? { opacity: Math.max(0.45, Math.min(1, 1 - (e.len - 300) / 900)) } : undefined}>
            <path d={e.d} className="rmap__edge" data-kind={e.kind} pathLength={e.kind === "trail" ? undefined : 1} markerEnd={`url(#arrow-${e.kind})`} />
            {!reduced && e.kind !== "lit" ? [0, 1].map(n => <circle key={n} r={e.kind === "trail" ? 2.4 : 2.8} className="rmap__particle" data-kind={e.kind}><animateMotion dur={`${Math.max(1.6, Math.min(3.6, e.len / 110))}s`} begin={`${n * 0.9}s`} repeatCount="indefinite" path={e.d} /></circle>) : null}
          </g>))}
      </svg>

      {ix.phases.map(phase => {
        const pp = phaseProgress(progress, ix, phase.id); const n = phaseNo(phase.id);
        return (
          <section key={phase.id} className="rphase" data-phase={n} data-complete={pp.complete || undefined} aria-labelledby={`ph-${phase.id}`}>
            <header className="rphase__head">
              <span className="rphase__no display" aria-hidden="true">{String(n).padStart(2, "0")}</span>
              <div className="rphase__text">
                <p className="eyebrow">Phase {n} · Weeks {phase.weeks.start}–{phase.weeks.end}</p>
                <h2 className="rphase__title display" id={`ph-${phase.id}`}>{phase.title}</h2>
                <p className="rphase__sum">{phase.summary}</p>
              </div>
              <div className="rphase__prog">
                <ProgressRing value={pp.percent} size={46} stroke={4} label={`${phase.title} progress`} tone={pp.complete ? "ok" : "accent"}><span className="tnum rphase__pct">{pp.percent}</span></ProgressRing>
                <span className="tnum rphase__count"><strong><AnimatedNumber value={pp.completed} delay={fx.just ? 260 : 0} /></strong> / {pp.total}<span className="sr-only"> topics complete</span></span>
              </div>
            </header>
            <ol className="rphase__lanes">
              {(ix.milestonesByPhase.get(phase.id) ?? []).map(ms => {
                const mp = milestoneProgress(progress, ix, ms.id); const topics = ix.topicsByMilestone.get(ms.id) ?? [];
                const hasCurrent = !!currentId && topics.some(t => t.id === currentId);
                return (
                  <li key={ms.id} className="rlane" data-complete={mp.complete || undefined} data-here={hasCurrent || undefined} data-burst={fx.burst === ms.id || undefined} style={{ ["--fill" as string]: mp.total ? mp.completed / mp.total : 0 }}>
                    <span className="rlane__marker" aria-hidden="true">{mp.complete ? <Icon name="check" size={12} /> : null}</span>
                    <div className="rlane__body">
                      <div className="rlane__head">
                        <h3 className="rlane__title">{ms.title}</h3>
                        <span className="rlane__count tnum" aria-label={`${mp.completed} of ${mp.total} topics complete`}>{mp.completed}/{mp.total}</span>
                      </div>
                      <div className="rlane__nodes">
                        {topics.map(t => {
                          const st = topicStatus(progress, t.id);
                          const relation = rel.prereq.has(t.id) ? "prereq" : rel.dependent.has(t.id) ? "dependent" : null;
                          return <RoadmapNode key={t.id} topic={t} status={st} mastered={masteryOf(progress, t.id).status === "mastered"} ready={st === "not-started" && isReady(progress, ix, t.id)}
                            effort={topicEffort(progress, ix, t.id)} needs={t.prerequisites.length} unlocks={ix.dependentsById.get(t.id)?.length ?? 0}
                            selected={t.id === selectedId} current={t.id === currentId ? currentKind : null} relation={relation} just={fx.just === t.id} pulse={fx.pulse === t.id} masteryPulse={fx.mastery === t.id}
                            dim={anyFocus && t.id !== focusId && !relation} tabStop={t.id === stop} onSelect={onSelect} onHover={setHover} register={register} />;
                        })}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

export function MapLegend() {
  return (
    <ul className="legend" aria-label="Map legend">
      <li><i className="legend__line" data-kind="prereq" />Prerequisite</li>
      <li><i className="legend__line" data-kind="dependent" />Builds on this</li>
      <li><i className="legend__line" data-kind="trail" />Your path</li>
    </ul>
  );
}
