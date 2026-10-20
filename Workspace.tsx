"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { curriculum as ix } from "../../lib/data.ts";
import { ProgressProvider, useProgressReady, useProgressSnapshot, useProgressStore } from "../../lib/progress/react.tsx";
import { topicStatus } from "../../lib/progress/selectors.ts";
import { useLayoutMode, useTopicHash } from "../../lib/ui/hooks.ts";
import { RoadmapCanvas, MapLegend } from "../roadmap/RoadmapCanvas.tsx";
import { RoadmapNav } from "../roadmap/RoadmapNav.tsx";
import { TopicPanel } from "../panel/TopicPanel.tsx";
import { Button } from "../ui/Button.tsx";
import { Drawer } from "../ui/Drawer.tsx";
import { Icon, type IconName } from "../ui/Icon.tsx";
import { Skeleton } from "../ui/Feedback.tsx";
import { ContinueCard, ProgressOverview, useRecommendation } from "./ProgressViews.tsx";
import { CompletionProvider, useCompletion } from "../../lib/motion/react.tsx";
import { UiProvider, useUi } from "../../lib/ui/ui-context.tsx";
import { Ambient, Hourglass } from "../ui/Media.tsx";
import { StorageNotice } from "./StorageNotice.tsx";
import { TopBar, LogoMark } from "./TopBar.tsx";
import { APP_NAME } from "../../lib/ui/copy.ts";

type MobileTab = "map" | "topics" | "progress";
const MOBILE_TABS: { id: MobileTab; label: string; icon: IconName }[] = [{ id: "map", label: "Roadmap", icon: "map" }, { id: "topics", label: "Topics", icon: "list" }, { id: "progress", label: "Progress", icon: "chart" }];

export function Workspace() { return <UiProvider><ProgressProvider index={ix}><WorkspaceInner /></ProgressProvider></UiProvider>; }

function WorkspaceInner() {
  const ready = useProgressReady(); const mode = useLayoutMode();
  if (!ready) return <div className="app" data-ready="false" data-mode={mode}><Ambient /><header className="topbar glass"><span className="brand"><LogoMark /><span className="brand__name display">{APP_NAME}</span></span></header><main className="boot" aria-busy="true"><Hourglass size={64} label="Loading your progress" /><Skeleton lines={4} /></main></div>;
  return <CompletionProvider ix={ix}><Ready mode={mode} /></CompletionProvider>;
}

function Ready({ mode }: { mode: ReturnType<typeof useLayoutMode> }) {
  const { progress, persistence } = useProgressSnapshot(); const store = useProgressStore();
  const { rec, topic: recTopic } = useRecommendation(ix, progress); const { active } = useCompletion(); const { audio } = useUi();
  const lastMode = useRef(persistence.mode);
  useEffect(() => { if (persistence.mode === "error" && lastMode.current !== "error") audio.play("error"); lastMode.current = persistence.mode; }, [persistence.mode, audio]);
  const valid = useCallback((id: string) => ix.topicById.has(id), []);
  const [hashId, setHash] = useTopicHash(valid);
  const selectedId = hashId ?? recTopic?.id ?? ix.topics[0].id;
  const [locate, setLocate] = useState(0); const [tab, setTab] = useState<MobileTab>("map");
  const [sheet, setSheet] = useState(false); const [navOpen, setNavOpen] = useState(false);

  const select = useCallback((id: string, opts?: { open?: boolean }) => {
    setHash(id); if (topicStatus(progress, id) === "in-progress") store.startTopic(id);
    if (mode === "mobile" && opts?.open !== false) setSheet(true);
    setNavOpen(false);
  }, [setHash, store, progress, mode]);
  const selectInPanel = useCallback((id: string) => select(id, { open: false }), [select]);
  const goContinue = useCallback(() => { if (recTopic) { select(recTopic.id); setLocate(n => n + 1); } }, [recTopic, select]);
  const currentKind = rec.kind === "resume" ? "resume" : rec.kind === "next" ? "next" : null;
  const trail = rec.kind === "next" && rec.anchor ? { from: rec.anchor.id, to: rec.topic.id } : null;
  const retry = useCallback(() => store.retryPersistence(), [store]);
  const nav = <RoadmapNav ix={ix} progress={progress} selectedId={selectedId} onSelect={select} currentId={recTopic?.id ?? null} />;
  const map = <RoadmapCanvas ix={ix} progress={progress} selectedId={selectedId} onSelect={select} currentId={recTopic?.id ?? null} currentKind={currentKind} locateNonce={locate} trail={trail} />;
  const toolbar = (
    <div className="maptools"><h2 className="maptools__title">Roadmap</h2><MapLegend />
      {recTopic ? <Button size="sm" variant="secondary" icon="target" cue="click" onClick={() => setLocate(n => n + 1)}>Show recommended</Button> : null}</div>
  );
  const panel = <TopicPanel ix={ix} topicId={selectedId} onSelect={selectInPanel} />;
  const notice = <StorageNotice status={persistence} onDismiss={() => store.dismissIssues()} onRetry={retry} />;

  return (
    <div className="app" data-ready="true" data-mode={mode} data-motion={active ? "running" : "idle"}>
      <Ambient />
      <TopBar ix={ix} progress={progress} mode={mode} onMenu={() => setNavOpen(true)} onContinue={goContinue} continueLabel={recTopic?.title ?? null} />
      <div className="notice-slot">{notice}</div>
      {mode === "desktop" ? (
        <main className="ws ws--desktop">
          <aside className="ws__nav glass"><div className="ws__navtop"><ContinueCard compact ix={ix} progress={progress} onOpen={id => { select(id); setLocate(n => n + 1); }} /></div>{nav}</aside>
          <section className="ws__map" aria-label="Roadmap map">{toolbar}<div className="ws__mapscroll">{map}</div></section>
          <aside className="ws__panel glass" aria-label="Topic details">{panel}</aside>
        </main>
      ) : null}
      {mode === "tablet" ? (
        <>
          <main className="ws ws--tablet">
            <section className="ws__map" aria-label="Roadmap map">{toolbar}<div className="ws__mapscroll">{map}</div></section>
            <aside className="ws__panel glass" aria-label="Topic details">{panel}</aside>
          </main>
          <Drawer open={navOpen} onClose={() => setNavOpen(false)} title="Topics" side="left"><div className="drawer__navwrap">{nav}</div></Drawer>
        </>
      ) : null}
      {mode === "mobile" ? (
        <>
          <main className="ws ws--mobile">
            {tab === "map" ? <section className="ws__map" aria-label="Roadmap map">{toolbar}<div className="ws__mapscroll">{map}</div></section> : null}
            {tab === "topics" ? <section className="ws__list" aria-label="All topics">{nav}</section> : null}
            {tab === "progress" ? <section className="ws__prog" aria-label="Your progress"><ProgressOverview ix={ix} progress={progress} onOpen={id => select(id)} /></section> : null}
          </main>
          <nav className="bottomnav" aria-label="Sections">
            {MOBILE_TABS.map(t => <button key={t.id} type="button" className="bottomnav__item" aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}><Icon name={t.icon} size={20} /><span>{t.label}</span></button>)}
          </nav>
          <Drawer open={sheet} onClose={() => setSheet(false)} title={ix.topicById.get(selectedId)?.title ?? "Topic"} side="sheet"><div className="drawer__panelwrap">{panel}</div></Drawer>
        </>
      ) : null}
    </div>
  );
}
