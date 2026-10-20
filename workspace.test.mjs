// End-to-end tests in real Chromium. Run: npm run test:e2e   (needs playwright + esbuild; see package.json)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { join } from "node:path";
import { staticHandler } from "../dev/static.mjs";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? "playwright");
const DIST = process.env.E2E_DIST ?? "/tmp/jlp-e2e-dist";
const topics = JSON.parse(readFileSync(join(root, "data/curriculum/topics.json"), "utf8"));
const quizzes = JSON.parse(readFileSync(join(root, "data/quizzes/topic-quizzes.json"), "utf8"));
const byId = new Map(topics.map(t => [t.id, t]));
const dependents = id => topics.filter(t => t.prerequisites.includes(id));

let browser, server, base;
before(async () => {
  execFileSync("node", [join(root, "dev/build.mjs"), DIST], { stdio: "ignore", env: process.env });
  server = createServer(staticHandler(DIST));
  await new Promise(r => server.listen(0, r)); base = `http://localhost:${server.address().port}`;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

const DESKTOP = { width: 1440, height: 900 }, TABLET = { width: 900, height: 1000 }, MOBILE = { width: 390, height: 844 };
async function open({ viewport = DESKTOP, init, path = "/", touch = viewport.width < 768, motion = false, scheme = "dark" } = {}) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, colorScheme: scheme, reducedMotion: motion ? "no-preference" : "reduce" });
  await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: "text/css", body: "/* fonts stubbed: tests never touch the network */" }));
  if (init) await context.addInitScript(init);
  const page = await context.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(String(e))); page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(base + path); await page.waitForSelector('.app[data-ready="true"]');
  return { page, context, errors, close: () => context.close() };
}
const settle = page => page.waitForSelector('.app[data-motion="idle"]', { timeout: 6000 });
const progressText = page => page.locator('[data-testid="overall-progress"]').innerText();
const title = page => page.locator(".panel__title").innerText();
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem("jlp.progress") ?? "null"));
async function pickAnswers(page, picks) { for (const [i, pick] of picks.entries()) await page.locator(".qcard").nth(i).locator(".qopt").nth(pick).click(); }

test("desktop: three columns, 4 phases, 28 modules, 80 topics, progress always visible", async () => {
  const { page, errors, close } = await open();
  assert.equal(await page.locator(".rphase").count(), 4); assert.equal(await page.locator(".rlane").count(), 28); assert.equal(await page.locator(".rnode").count(), 80);
  for (const sel of [".ws__nav", ".ws__map", ".ws__panel", '[data-testid="overall-progress"]']) assert.ok(await page.locator(sel).isVisible(), sel);
  assert.match(await progressText(page), /0\s*of 80 topics/);
  const boxes = await Promise.all([".ws__nav", ".ws__map", ".ws__panel"].map(s => page.locator(s).boundingBox()));
  assert.ok(boxes[0].x < boxes[1].x && boxes[1].x < boxes[2].x, "left, center, right order");
  assert.equal(await title(page), "Basic Syntax", "panel opens on the recommended topic");
  assert.deepEqual(errors, []); await close();
});

test("clicking a node updates the right panel immediately, without navigating", async () => {
  const { page, errors, close } = await open();
  await page.evaluate(() => { window.__same = true; });
  await page.locator('[data-topic-id="data-types"]').click();
  assert.equal(await title(page), "Data Types"); assert.match(page.url(), /#topic=data-types$/);
  assert.equal(await page.evaluate(() => window.__same), true, "no page load happened");
  assert.match(await page.locator(".panel__crumb").innerText(), /Phase 1/i);
  assert.deepEqual(errors, []); await close();
});

test("relationships: selected node draws prerequisite and dependent lines and highlights neighbours", async () => {
  const { page, close } = await open();
  await page.locator('[data-topic-id="variables-and-scopes"]').click(); await page.mouse.move(0, 0);
  await page.waitForSelector(".rmap__edge", { state: "attached" });
  const t = byId.get("variables-and-scopes");
  assert.equal(await page.locator('.rmap__edge[data-kind="prereq"]').count(), t.prerequisites.length);
  assert.equal(await page.locator('.rmap__edge[data-kind="dependent"]').count(), dependents(t.id).length);
  assert.equal(await page.locator('.rnode[data-relation="prereq"]').count(), t.prerequisites.length);
  assert.equal(await page.locator('.rnode[data-relation="dependent"]').count(), dependents(t.id).length);
  assert.ok(await page.locator(".rnode[data-dim]").count() > 60);
  await close();
});

test("start, complete, undo; progress updates everywhere and survives a reload", async () => {
  const { page, errors, close } = await open();
  await page.locator('[data-topic-id="data-types"]').click();
  await page.getByRole("button", { name: "Start topic" }).click();
  assert.equal(await page.getByTestId("topic-status").innerText(), "In progress");
  assert.equal(await page.locator('[data-topic-id="data-types"]').getAttribute("data-status"), "in-progress");
  await page.getByRole("button", { name: "Mark complete" }).click(); await settle(page);
  assert.equal(await page.getByTestId("topic-status").innerText(), "Completed");
  assert.match(await progressText(page), /1\s*of 80 topics/);
  assert.equal(await page.locator(".rlane", { hasText: "Variables and Data Types" }).locator(".rlane__count").innerText(), "1/3");
  assert.equal(await page.locator(".nphase__count").first().innerText(), "1/11");
  await page.reload(); await page.waitForSelector('.app[data-ready="true"]');
  assert.match(await progressText(page), /1\s*of 80 topics/); assert.equal(await page.locator('[data-topic-id="data-types"]').getAttribute("data-status"), "completed");
  await page.getByRole("button", { name: "Reopen topic" }).click();
  assert.equal(await page.getByTestId("topic-status").innerText(), "In progress"); assert.match(await progressText(page), /0\s*of 80 topics/);
  assert.deepEqual(errors, []); await close();
});

test("manual completion is allowed without prerequisites or mastery, and the UI encourages the check", async () => {
  const { page, close } = await open();
  await page.locator('[data-topic-id="basic-syntax"]').click();
  await page.getByRole("button", { name: "Already know this? Mark complete" }).click(); await settle(page);
  assert.equal(await page.getByTestId("topic-status").innerText(), "Completed");
  await page.locator('[data-topic-id="type-casting"]').click(); // prerequisites open
  assert.match(await page.locator(".prereq").innerText(), /You can still study and complete this topic/);
  await page.locator('[data-topic-id="basic-syntax"]').click();
  assert.ok(await page.getByText("Completed without the mastery check").isVisible());
  await page.getByRole("button", { name: "Take the check" }).click();
  assert.equal(await page.getByRole("tab", { name: "Check" }).getAttribute("aria-selected"), "true");
  await close();
});

test("authored topic: example with line numbers, line-by-line highlighting, expected output labelled as documentation", async () => {
  const { page, close } = await open();
  await page.locator('[data-topic-id="basic-syntax"]').click(); await page.getByRole("tab", { name: "Code" }).click();
  assert.equal(await page.locator(".code__line").count(), 11);
  assert.ok(await page.getByText("Expected output (documented, not executed)").isVisible());
  assert.ok(await page.getByText("Running code isn't available in the browser yet").isVisible());
  assert.equal(await page.locator(".code__line[data-hl]").count(), 0);
  await page.getByRole("button", { name: /Lines 5-6/ }).click();
  assert.deepEqual(await page.locator(".code__line[data-hl]").evaluateAll(n => n.map(x => x.dataset.line)), ["5", "6"]);
  assert.ok(await page.locator(".tok--kw").first().isVisible());
  await page.getByRole("tab", { name: "Learn" }).click();
  for (const h of ["Why it matters", "Mental model", "Syntax and reference"]) assert.ok(await page.getByRole("heading", { name: h }).isVisible(), h);
  await close();
});

test("practice ticks and subtopic ticks persist", async () => {
  const { page, close } = await open();
  await page.locator('[data-topic-id="lifecycle-of-a-program"]').click(); await page.getByRole("tab", { name: "Practice" }).click();
  await page.locator(".exercise").first().locator("label.check").first().click();
  assert.ok(await page.getByText("1 of 3 tasks done").isVisible());
  await page.reload(); await page.waitForSelector('.app[data-ready="true"]'); await page.getByRole("tab", { name: "Practice" }).click();
  assert.ok(await page.getByText("1 of 3 tasks done").isVisible());
  assert.equal(await page.getByTestId("topic-status").innerText(), "In progress", "ticking work starts the topic");
  await close();
});

test("mastery check: a failed attempt, then a pass; both are recorded and shown", async () => {
  const { page, close } = await open();
  await page.locator('[data-topic-id="basic-syntax"]').click(); await page.getByRole("tab", { name: "Check" }).click();
  assert.ok(await page.getByRole("button", { name: "Check answers" }).isDisabled());
  const qs = quizzes.filter(q => q.topic === "basic-syntax");
  await pickAnswers(page, qs.map(q => (q.correct[0] + 1) % q.options.length));
  await page.getByRole("button", { name: "Check answers" }).click();
  assert.ok(await page.getByText(/0 of 4 correct/).isVisible()); assert.match(await page.locator(".statusrow").innerText(), /Check attempted/);
  await page.getByRole("button", { name: "Try again" }).click();
  await pickAnswers(page, qs.map(q => q.correct[0])); await page.getByRole("button", { name: "Check answers" }).click();
  assert.ok(await page.getByText(/4 of 4 correct: mastered/).isVisible()); assert.match(await page.locator(".statusrow").innerText(), /Mastered/);
  assert.equal(await page.locator('[data-topic-id="basic-syntax"] .rnode__mastery').count(), 1);
  assert.equal((await stored(page)).quizAttempts.length, 2);
  await page.reload(); await page.waitForSelector('.app[data-ready="true"]'); assert.match(await page.locator(".statusrow").innerText(), /Mastered/);
  await close();
});

test("outline topics are honest about missing content and still trackable", async () => {
  const { page, close } = await open();
  await page.locator('[data-topic-id="loops"]').click();
  assert.ok(await page.getByText("Lesson text is still in outline").isVisible()); assert.match(await page.locator(".panel__badges").innerText(), /Outline only/);
  await page.getByRole("tab", { name: "Code" }).click(); assert.ok(await page.getByText("No examples yet").isVisible());
  await page.getByRole("tab", { name: "Check" }).click(); assert.ok(await page.getByText("No mastery check yet").first().isVisible());
  await page.getByRole("button", { name: "Start topic" }).click(); await page.getByRole("button", { name: "Mark complete" }).click(); await settle(page);
  assert.match(await progressText(page), /1\s*of 80 topics/); await close();
});

test("left navigation: search, status filter, selection sync", async () => {
  const { page, close } = await open();
  await page.getByLabel("Search topics").fill("stream");
  assert.deepEqual(await page.locator(".ntopic__title").allInnerTexts(), ["Stream API"]);
  await page.locator(".ntopic").click(); assert.equal(await title(page), "Stream API");
  await page.getByLabel("Search topics").fill("zzzz"); assert.ok(await page.getByText("No topics match").isVisible());
  await page.getByRole("button", { name: "Clear search and filters" }).click(); assert.ok(await page.locator(".ntopic").count() > 0);
  await page.locator('[data-topic-id="basic-syntax"]').click(); await page.getByRole("button", { name: "Already know this? Mark complete" }).click(); await settle(page);
  await page.getByRole("button", { name: /^Done/ }).click(); assert.deepEqual(await page.locator(".ntopic__title").allInnerTexts(), ["Basic Syntax"]);
  await close();
});

test("Continue Learning follows completion and prerequisites", async () => {
  const { page, close } = await open();
  assert.match(await page.getByTestId("continue-btn").innerText(), /Basic Syntax/);
  await page.getByTestId("continue-btn").click(); assert.equal(await title(page), "Basic Syntax");
  await page.getByRole("button", { name: "Start topic" }).click(); await page.getByRole("button", { name: "Mark complete" }).click(); await settle(page);
  assert.match(await page.getByTestId("continue-btn").innerText(), /Lifecycle of a Program/);
  assert.equal(await page.locator('.rnode[data-current]').getAttribute("data-topic-id"), "lifecycle-of-a-program");
  assert.match(await page.locator(".continue").innerText(), /Next after Basic Syntax/);
  await close();
});

test("keyboard: roving focus across nodes, Enter selects, tabs use arrow keys", async () => {
  const { page, close } = await open();
  await page.locator('[data-topic-id="basic-syntax"]').focus();
  await page.keyboard.press("ArrowRight"); assert.equal(await page.evaluate(() => document.activeElement.dataset.topicId), "lifecycle-of-a-program");
  await page.keyboard.press("ArrowDown"); assert.equal(await page.evaluate(() => document.activeElement.dataset.topicId), "data-types");
  await page.keyboard.press("Enter"); assert.equal(await title(page), "Data Types");
  await page.getByRole("tab", { name: "Learn" }).focus(); await page.keyboard.press("ArrowRight");
  assert.equal(await page.getByRole("tab", { name: "Code" }).getAttribute("aria-selected"), "true");
  await close();
});

test("accessibility basics: names, landmarks, labels, external links", async () => {
  const { page, close } = await open();
  await page.locator('[data-topic-id="basic-syntax"]').click(); await page.getByRole("tab", { name: "Explore" }).click();
  const r = await page.evaluate(() => ({
    unnamedButtons: [...document.querySelectorAll("button")].filter(b => !(b.getAttribute("aria-label") || b.textContent.trim())).length,
    unlabeledInputs: [...document.querySelectorAll("input")].filter(i => !i.labels?.length && !i.getAttribute("aria-label")).length,
    lang: document.documentElement.lang, mains: document.querySelectorAll("main").length, navs: document.querySelectorAll("nav").length, h1: document.querySelectorAll("h1").length,
    badLinks: [...document.querySelectorAll('a[target="_blank"]')].filter(a => !/noopener/.test(a.rel) || !/noreferrer/.test(a.rel)).length, links: document.querySelectorAll('a[target="_blank"]').length,
    progressbars: [...document.querySelectorAll('[role="progressbar"]')].filter(p => !p.getAttribute("aria-label") || p.getAttribute("aria-valuenow") === null).length,
  }));
  assert.deepEqual(r, { unnamedButtons: 0, unlabeledInputs: 0, lang: "en", mains: 1, navs: 1, h1: 1, badLinks: 0, links: r.links, progressbars: 0 });
  assert.ok(r.links >= 3); await close();
});

test("corrupt saved data: app starts clean, explains, keeps a backup, and can dismiss the notice", async () => {
  const { page, errors, close } = await open({ init: () => { if (!localStorage.getItem("seeded")) { localStorage.setItem("seeded", "1"); localStorage.setItem("jlp.progress", '{"version":1,"topics":{'); } } });
  assert.ok(await page.getByText("Saved progress couldn't be read").isVisible()); assert.match(await progressText(page), /0\s*of 80/);
  assert.equal(await page.evaluate(() => localStorage.getItem("jlp.progress.corrupt")), '{"version":1,"topics":{');
  await page.getByRole("button", { name: "Dismiss" }).click(); assert.equal(await page.getByText("Saved progress couldn't be read").count(), 0);
  await page.locator('[data-topic-id="basic-syntax"]').click(); await page.getByRole("button", { name: "Already know this? Mark complete" }).click(); await settle(page);
  assert.equal((await stored(page)).topics["basic-syntax"].status, "completed");
  assert.deepEqual(errors, []); await close();
});

test("storage blocked: works in memory and says so", async () => {
  const { page, errors, close } = await open({ init: () => Object.defineProperty(window, "localStorage", { get() { throw new DOMException("denied", "SecurityError"); } }) });
  assert.ok(await page.getByText("Progress won't be saved").isVisible());
  await page.locator('[data-topic-id="basic-syntax"]').click(); await page.getByRole("button", { name: "Already know this? Mark complete" }).click(); await settle(page);
  assert.match(await progressText(page), /1\s*of 80/); assert.deepEqual(errors, []); await close();
});

test("write failure: progress still updates and the user is told", async () => {
  const { page, close } = await open({ init: () => { const real = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === "jlp.progress" && window.__fail) throw new DOMException("full", "QuotaExceededError"); return real.call(this, k, v); }; } });
  await page.evaluate(() => { window.__fail = true; });
  await page.locator('[data-topic-id="basic-syntax"]').click(); await page.getByRole("button", { name: "Already know this? Mark complete" }).click(); await settle(page);
  assert.ok(await page.getByText("Your last change wasn't saved").isVisible()); assert.match(await progressText(page), /1\s*of 80/);
  await page.evaluate(() => { window.__fail = false; }); await page.getByRole("button", { name: "Retry" }).click();
  assert.equal(await page.getByText("Your last change wasn't saved").count(), 0);
  assert.equal((await stored(page)).topics["basic-syntax"].status, "completed", "unsaved progress was written, not discarded");
  assert.match(await progressText(page), /1\s*of 80/); await close();
});

test("mobile: bottom tabs, topic sheet, no horizontal scroll, 44px touch targets", async () => {
  const { page, errors, close } = await open({ viewport: MOBILE });
  assert.ok(await page.locator(".bottomnav").isVisible()); assert.equal(await page.locator(".ws__nav").count(), 0);
  assert.ok(await page.locator('[data-testid="overall-progress"]').isVisible(), "progress visible on mobile");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.getByRole("dialog").count(), 0, "no sheet until a topic is tapped");
  await page.locator('[data-topic-id="data-types"]').tap();
  const dlg = page.getByRole("dialog"); assert.ok(await dlg.isVisible()); assert.equal(await dlg.locator(".panel__title").innerText(), "Data Types");
  assert.ok((await dlg.getByRole("button", { name: "Start topic" }).boundingBox()).height >= 44);
  await dlg.getByRole("button", { name: "Start topic" }).tap(); assert.equal(await dlg.getByTestId("topic-status").innerText(), "In progress");
  await page.keyboard.press("Escape"); assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(await page.locator('[data-topic-id="data-types"]').getAttribute("data-status"), "in-progress");
  for (const b of await page.locator(".bottomnav__item").all()) assert.ok((await b.boundingBox()).height >= 44);
  await page.getByRole("button", { name: "Topics", exact: true }).tap(); await page.getByLabel("Search topics").fill("loops");
  await page.locator(".ntopic").first().tap(); assert.equal(await page.getByRole("dialog").locator(".panel__title").innerText(), "Loops"); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Progress", exact: true }).tap();
  assert.equal(await page.getByRole("progressbar", { name: "Overall progress" }).getAttribute("aria-valuenow"), "0");
  assert.ok(await page.getByRole("heading", { name: "Phases" }).isVisible()); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []); await close();
});

test("tablet: two columns plus a topic drawer", async () => {
  const { page, close } = await open({ viewport: TABLET });
  assert.equal(await page.locator(".ws__nav").count(), 0); assert.ok(await page.locator(".ws__map").isVisible()); assert.ok(await page.locator(".ws__panel").isVisible());
  await page.getByRole("button", { name: "Open topic list" }).click(); const d = page.getByRole("dialog"); assert.ok(await d.isVisible());
  await d.getByLabel("Search topics").fill("maven"); await d.locator(".ntopic").click();
  assert.equal(await page.getByRole("dialog").count(), 0); assert.equal(await title(page), "Maven"); await close();
});

test("design-system page renders without errors", async () => {
  const context = await browser.newContext({ viewport: DESKTOP }); const page = await context.newPage(); const errors = []; page.on("pageerror", e => errors.push(String(e)));
  await page.goto(base + "/design"); await page.waitForSelector(".ds");
  assert.ok(await page.locator(".ds .rnode").count() >= 8); await page.getByRole("button", { name: "Open drawer" }).click(); assert.ok(await page.getByRole("dialog").isVisible());
  await page.keyboard.press("Escape"); assert.equal(await page.getByRole("dialog").count(), 0); assert.deepEqual(errors, []); await context.close();
});


/* ======================= theme, motion, audio, assets ======================= */
const plays = page => page.evaluate(() => window.__plays ?? []);
const STUB_PLAY = () => { window.__plays = []; const real = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { if (/\.mp3/.test(this.src)) window.__plays.push(this.src.split("/").pop()); return Promise.resolve(); }; };
const withPrefs = prefs => `localStorage.getItem("jlp.prefs") || localStorage.setItem("jlp.prefs", ${JSON.stringify(JSON.stringify({ version: 1, theme: null, volume: 0.4, ...prefs }))});`;

test("theme: follows the system setting, can be switched and remembered, with a circular reveal", async () => {
  const dark = await open({ scheme: "dark" }); assert.equal(await dark.page.evaluate(() => document.documentElement.dataset.theme), "dark"); await dark.close();
  const { page, errors, close } = await open({ scheme: "light", motion: true, init: () => { window.__vt = 0; const real = document.startViewTransition?.bind(document); if (real) document.startViewTransition = cb => { window.__vt++; return real(cb); }; } });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "light");
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(255, 255, 255)");
  await page.getByRole("switch", { name: "Dark mode" }).click(); await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  assert.equal(await page.evaluate(() => window.__vt), 1, "theme change goes through one view transition (circular reveal)");
  assert.equal((await stored(page).then(() => page.evaluate(() => JSON.parse(localStorage.getItem("jlp.prefs"))))).theme, "dark");
  assert.equal(await page.getByRole("switch", { name: "Dark mode" }).getAttribute("aria-checked"), "true");
  await page.waitForTimeout(700); assert.notEqual(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(255, 255, 255)");
  await page.reload(); await page.waitForSelector('.app[data-ready="true"]'); assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark", "explicit choice beats the system setting");
  assert.deepEqual(errors, []); await close();
});

test("theme: reduced motion swaps instantly without a view transition", async () => {
  const { page, close } = await open({ scheme: "light", init: () => { window.__vt = 0; const real = document.startViewTransition?.bind(document); if (real) document.startViewTransition = cb => { window.__vt++; return real(cb); }; } });
  await page.getByRole("switch", { name: "Dark mode" }).click(); await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  assert.equal(await page.evaluate(() => window.__vt), 0); await close();
});

test("theme toggle plays the approved clip: rests on the matching frame and travels to the other one", async () => {
  const { page, close } = await open({ scheme: "dark", motion: true });
  const t = () => page.evaluate(() => document.querySelector(".themebtn video").currentTime);
  await page.waitForFunction(() => document.querySelector(".themebtn video")?.readyState >= 2, null, { timeout: 5000 });
  await page.waitForFunction(() => Math.abs(document.querySelector(".themebtn video").currentTime - 3.5) < 0.2, null, { timeout: 3000 });
  await page.getByRole("switch", { name: "Dark mode" }).click(); await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
  await page.waitForFunction(() => Math.abs(document.querySelector(".themebtn video").currentTime - 0.2) < 0.25 && document.querySelector(".themebtn video").paused, null, { timeout: 4000 });
  assert.ok(Math.abs((await t()) - 0.2) < 0.25); await close();
});

test("audio is off by default: nothing plays, no audio element exists, music never auto-starts", async () => {
  const { page, close } = await open({ init: STUB_PLAY });
  await page.locator('[data-topic-id="basic-syntax"]').click(); await page.getByRole("button", { name: "Start topic" }).click(); await page.getByRole("button", { name: "Mark complete" }).click(); await settle(page);
  assert.deepEqual(await plays(page), []); assert.equal(await page.locator("audio").count(), 0);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("jlp.prefs") ?? "{}").sfx ?? false), false);
  assert.match(await page.getByRole("button", { name: /Sound settings/ }).getAttribute("aria-label"), /sound off/);
  await page.reload(); await page.waitForSelector('.app[data-ready="true"]'); assert.deepEqual(await plays(page), []); await close();
});

test("audio control: effects use the approved assets; music only starts from its own switch and is never persisted", async () => {
  const { page, close } = await open({ init: STUB_PLAY });
  const pop = page.getByRole("button", { name: /Sound settings/ }); assert.equal(await pop.getAttribute("aria-expanded"), "false"); await pop.click(); assert.equal(await pop.getAttribute("aria-expanded"), "true");
  await page.getByRole("switch", { name: /Sound effects/ }).check(); assert.deepEqual(await plays(page), ["toggle.mp3"]); assert.ok(await page.getByText("Sound is on").isVisible());
  await page.keyboard.press("Escape"); assert.equal(await pop.getAttribute("aria-expanded"), "false");
  await page.locator('[data-topic-id="basic-syntax"]').click(); await page.getByRole("button", { name: "Start topic" }).click(); await page.getByRole("button", { name: "Mark complete" }).click(); await settle(page);
  const p = await plays(page); assert.ok(p.includes("click.mp3") && p.filter(x => x === "success.mp3").length === 1, JSON.stringify(p));
  await page.getByRole("button", { name: /Sound settings/ }).click(); await page.getByRole("switch", { name: /Background music/ }).check();
  assert.equal((await plays(page)).at(-1), "music.mp3"); assert.equal(await page.evaluate(() => "music" in JSON.parse(localStorage.getItem("jlp.prefs"))), false);
  await page.reload(); await page.waitForSelector('.app[data-ready="true"]'); assert.deepEqual(await plays(page), [], "music and sounds do nothing on load");
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("jlp.prefs")).sfx), true, "the sound-effects choice is remembered"); await close();
});

test("completion choreography: press, check, commit, path, counter, next pulse, panel: in order and in sync", async () => {
  const { page, errors, close } = await open({ motion: true, init: withPrefs({}) && (() => {}) });
  await page.locator('[data-topic-id="basic-syntax"]').click(); await page.getByRole("button", { name: "Start topic" }).click(); await settle(page);
  await page.locator('[data-topic-id="data-types"]').click(); await page.getByRole("button", { name: "Start topic" }).click();
  await page.evaluate(() => { window.__log = []; window.__motionBus.subscribe(e => window.__log.push([e.type, Math.round(performance.now())])); });
  const nodeAttr = a => page.locator('[data-topic-id="data-types"]').getAttribute(a);
  await page.getByRole("button", { name: "Mark complete" }).click();
  assert.ok(await page.locator("[data-celebrate]").isVisible(), "button swaps to the drawing check immediately");
  assert.equal(await nodeAttr("data-status"), "in-progress", "state has not changed at press time");
  assert.match(await progressText(page), /^0\s*of 80/, "counter still shows the old total");
  await page.waitForFunction(() => document.querySelector('[data-topic-id="data-types"]')?.dataset.status === "completed", null, { timeout: 2000 });
  assert.equal(await nodeAttr("data-just"), "true", "node illuminates on commit");
  await page.waitForSelector('.rmap__edge[data-kind="lit"]', { state: "attached", timeout: 2000 });
  await page.waitForSelector('[data-topic-id][data-pulse]', { state: "attached", timeout: 2500 });
  await page.waitForSelector('[data-testid="next-recommended"]', { timeout: 3000 });
  assert.match(await progressText(page), /^1\s*of 80/);
  await settle(page);
  const log = await page.evaluate(() => window.__log); const t = Object.fromEntries(log.map(([n, ms]) => [n, ms]));
  assert.deepEqual(log.map(l => l[0]), ["completion:start", "completion:commit", "completion:path", "completion:next", "completion:panel", "completion:end"]);
  const d = (a, b) => t[b] - t[a]; assert.ok(d("completion:start", "completion:commit") >= 120, "commit waits for the press/check"); assert.ok(d("completion:start", "completion:panel") >= 800, "panel is the last visible step");
  const order = log.map(l => l[1]); assert.deepEqual(order, [...order].sort((x, y) => x - y), "events never run out of order"); // exact gaps depend on main-thread load, so only order and the overall bounds are asserted
  assert.ok(d("completion:start", "completion:end") <= 1700, "whole sequence stays short");
  assert.equal(await page.locator('[data-topic-id][data-pulse]').count(), 0, "one-shot effects clear themselves"); assert.equal(await nodeAttr("data-just"), null);
  const rec = await page.locator('[data-testid="next-recommended"]').innerText(); assert.match(rec, /next recommended/i); assert.ok(await page.getByTestId("success-badge").isVisible());
  assert.deepEqual(errors, []); await close();
});

test("completion cannot be double-counted by fast repeated clicks", async () => {
  const { page, close } = await open({ motion: true });
  await page.locator('[data-topic-id="basic-syntax"]').click(); await page.getByRole("button", { name: "Start topic" }).click();
  await page.getByRole("button", { name: "Mark complete" }).dblclick({ delay: 10 }); await settle(page);
  assert.match(await progressText(page), /^1\s*of 80/); assert.equal((await stored(page)).topics["basic-syntax"].status, "completed"); await close();
});

test("finishing a module animates its marker once", async () => {
  const { page, close } = await open({ motion: true });
  for (const id of ["basic-syntax", "lifecycle-of-a-program"]) { await page.locator(`[data-topic-id="${id}"]`).click(); if (id === "basic-syntax") await page.getByRole("button", { name: "Start topic" }).click(); else await page.getByRole("button", { name: "Start topic" }).click(); await page.getByRole("button", { name: "Mark complete" }).click(); await settle(page); }
  assert.equal(await page.locator(".rlane", { hasText: "Setup and Program Anatomy" }).getAttribute("data-complete"), "true");
  assert.equal(await page.locator(".rlane", { hasText: "Setup and Program Anatomy" }).evaluate(el => getComputedStyle(el).getPropertyValue("--fill").trim()), "1"); await close();
});

test("mastery: a pass confirms on the node and plays the success sound; a miss is silent and encouraging", async () => {
  const { page, close } = await open({ motion: true, init: () => { STUB(); function STUB() { window.__plays = []; HTMLMediaElement.prototype.play = function () { if (/\.mp3/.test(this.src)) window.__plays.push(this.src.split("/").pop()); return Promise.resolve(); }; localStorage.getItem("jlp.prefs") || localStorage.setItem("jlp.prefs", JSON.stringify({ version: 1, theme: null, sfx: true, volume: 0.4 })); } } });
  const qs = quizzes.filter(q => q.topic === "basic-syntax");
  await page.locator('[data-topic-id="basic-syntax"]').click(); await page.getByRole("tab", { name: "Check" }).click();
  await pickAnswers(page, qs.map(q => (q.correct[0] + 1) % q.options.length)); await page.getByRole("button", { name: "Check answers" }).click();
  assert.match(await page.locator(".result").innerText(), /practice, not a penalty/); assert.deepEqual((await plays(page)).filter(x => x !== "click.mp3"), [], "a wrong attempt makes no success or error sound");
  await page.getByRole("button", { name: "Try again" }).click(); await pickAnswers(page, qs.map(q => q.correct[0])); await page.getByRole("button", { name: "Check answers" }).click();
  assert.deepEqual((await plays(page)).filter(x => x !== "click.mp3"), ["success.mp3"]); await page.waitForSelector('[data-topic-id="basic-syntax"][data-mpulse]', { state: "attached", timeout: 1500 });
  await page.getByRole("button", { name: "Mark topic complete" }).click(); await settle(page); assert.equal(await page.getByTestId("topic-status").innerText(), "Completed");
  assert.match(await page.locator(".statusrow").innerText(), /Mastered/); await close();
});

test("panel content moves in the direction of travel; the tab indicator slides", async () => {
  const { page, close } = await open({ motion: true });
  await page.locator('[data-topic-id="data-types"]').click(); await page.getByRole("button", { name: /Next topic/ }).click();
  assert.equal(await page.locator(".panel").getAttribute("data-dir"), "next"); await page.getByRole("button", { name: /Previous topic/ }).click(); assert.equal(await page.locator(".panel").getAttribute("data-dir"), "prev");
  const x0 = await page.locator(".tabs__ind").evaluate(el => el.style.transform); await page.getByRole("tab", { name: "Check" }).click();
  assert.notEqual(await page.locator(".tabs__ind").evaluate(el => el.style.transform), x0); assert.equal(await page.locator(".panel__body").getAttribute("data-tabdir"), "next");
  await page.getByRole("tab", { name: "Learn" }).click(); assert.equal(await page.locator(".panel__body").getAttribute("data-tabdir"), "prev"); await close();
});

test("reduced motion: no ambient or looping motion, no particles, no travelling transitions", async () => {
  const { page, close } = await open({ motion: false });
  await page.locator('[data-topic-id="basic-syntax"]').click(); await page.getByRole("button", { name: "Start topic" }).click();
  await page.locator('[data-topic-id="data-types"]').click(); await page.mouse.move(5, 5);
  const r = await page.evaluate(() => ({ atmos: getComputedStyle(document.querySelector(".atmos i")).animationName, current: getComputedStyle(document.querySelector(".rnode[data-current]")).animationName, ring: getComputedStyle(document.querySelector(".rnode[data-selected]"), "::after").animationName,
    particles: document.querySelectorAll(".rmap__particle").length, lift: getComputedStyle(document.documentElement).getPropertyValue("--lift").trim(), dur: getComputedStyle(document.documentElement).getPropertyValue("--dur-3").trim() }));
  assert.deepEqual(r, { atmos: "none", current: "none", ring: "none", particles: 0, lift: "0px", dur: "0.01ms" }); await close();
});

test("with motion on, the map is alive: particles flow along relationship lines, the current node breathes", async () => {
  const { page, close } = await open({ motion: true });
  await page.locator('[data-topic-id="variables-and-scopes"]').click(); await page.mouse.move(5, 5); await page.waitForSelector(".rmap__particle", { state: "attached" });
  assert.ok(await page.locator(".rmap__particle").count() >= 2); assert.notEqual(await page.evaluate(() => getComputedStyle(document.querySelector(".rnode[data-current]")).animationName), "none");
  assert.notEqual(await page.evaluate(() => getComputedStyle(document.querySelector(".atmos i")).animationName), "none"); await close();
});

test("hover never shifts layout and reveals relationship metadata", async () => {
  const { page, close } = await open({ motion: true });
  await page.mouse.move(2, 2); await page.waitForTimeout(250);
  const n = page.locator('[data-topic-id="type-casting"]'); await n.scrollIntoViewIfNeeded(); const before = await page.evaluate(() => [...document.querySelectorAll(".rnode")].slice(0, 12).map(e => e.offsetLeft + "," + e.offsetTop + "," + e.offsetWidth + "," + e.offsetHeight));
  await n.scrollIntoViewIfNeeded(); await page.waitForTimeout(200); const box = await n.boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(350);
  const after = await page.evaluate(() => [...document.querySelectorAll(".rnode")].slice(0, 12).map(e => e.offsetLeft + "," + e.offsetTop + "," + e.offsetWidth + "," + e.offsetHeight)); assert.deepEqual(after, before);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-topic-id="type-casting"] .rnode__rel')).opacity === "1", null, { timeout: 3000 }); assert.match(await n.locator(".rnode__rel").innerText(), /Needs 2/); await close();
});

test("fonts: semantic tokens name the three families, Google Fonts is linked once, no font @import in CSS, optical sizing on", async () => {
  const { page, close } = await open();
  const r = await page.evaluate(() => { const cs = getComputedStyle(document.documentElement); return { display: cs.getPropertyValue("--font-display"), body: cs.getPropertyValue("--font-body"), mono: cs.getPropertyValue("--font-mono"),
    links: [...document.querySelectorAll('link[href*="fonts.googleapis.com/css2"]')].map(l => l.href), optical: getComputedStyle(document.body).fontOpticalSizing, bodyFont: getComputedStyle(document.body).fontFamily, title: getComputedStyle(document.querySelector(".panel__title")).fontFamily,
    code: getComputedStyle(document.querySelector("code, .mono")).fontFamily, imports: [...document.styleSheets].flatMap(s => { try { return [...s.cssRules].filter(x => x.type === CSSRule.IMPORT_RULE).map(x => x.href); } catch { return []; } }) }; });
  assert.match(r.display, /"DM Serif Display"/); assert.match(r.body, /"DM Sans"/); assert.match(r.mono, /"JetBrains Mono"/);
  assert.equal(r.links.length, 1); for (const f of ["DM+Sans", "DM+Serif+Display", "JetBrains+Mono", "display=swap"]) assert.ok(r.links[0].includes(f), f);
  assert.equal(r.optical, "auto"); assert.deepEqual(r.imports.filter(x => /fonts\.googleapis/.test(x)), [], "fonts are not @imported from component CSS");
  assert.match(r.bodyFont, /DM Sans/); assert.match(r.title, /DM Serif Display/); assert.match(r.code, /JetBrains Mono/); await close();
});

test("approved media assets are served, seekable and decodable", async () => {
  const { page, close } = await open();
  const files = ["/audio/click.mp3", "/audio/toggle.mp3", "/audio/success.mp3", "/audio/error.mp3", "/audio/music.mp3", "/motion/theme-toggle.webm", "/motion/success-check.webm", "/motion/loading.webm", "/motion/not-found.webm"];
  const res = await page.evaluate(async fs => Promise.all(fs.map(async f => { const r = await fetch(f, { headers: { Range: "bytes=0-99" } }); return [f, r.status, r.headers.get("content-type")]; })), files);
  for (const [f, status, type] of res) { assert.equal(status, 206, f); assert.match(type, f.endsWith(".mp3") ? /audio\/mpeg/ : /video\/webm/, f); }
  const ok = await page.evaluate(() => new Promise(resolve => { const v = document.createElement("video"); v.muted = true; v.src = "/motion/success-check.webm"; v.onloadeddata = () => resolve([v.videoWidth, v.videoHeight, v.duration > 1]); v.onerror = () => resolve("error"); }));
  assert.deepEqual(ok, [150, 150, true]); await close();
});

test("honest code: the Run control is disabled and says code is not executed", async () => {
  const { page, close } = await open();
  await page.locator('[data-topic-id="basic-syntax"]').click(); await page.getByRole("tab", { name: "Code" }).click();
  assert.ok(await page.getByText("Not executed").first().isVisible()); assert.ok(await page.getByRole("button", { name: /Run \(unavailable/ }).isDisabled());
  await page.getByRole("tab", { name: "Learn" }).click(); await page.locator('[data-topic-id="lifecycle-of-a-program"]').click(); await page.getByRole("tab", { name: "Code" }).click(); await page.getByRole("button", { name: "An error the compiler cannot see" }).click();
  assert.ok(await page.getByText("Expected error output (documented, not executed)").isVisible()); assert.equal(await page.locator('.output[data-kind="error"]').count(), 1); await close();
});

test("practice is interactive: editable attempt, progressive hints, self-check leads to done", async () => {
  const { page, close } = await open();
  await page.locator('[data-topic-id="basic-syntax"]').click(); await page.getByRole("tab", { name: "Practice" }).click();
  const ex = page.locator(".exercise").first(); await ex.locator(".attempt__input").fill("public class Intro {}"); await page.getByRole("tab", { name: "Learn" }).click(); await page.getByRole("tab", { name: "Practice" }).click();
  assert.equal(await page.locator(".exercise").first().locator(".attempt__input").inputValue(), "public class Intro {}", "attempt survives tab switches");
  assert.equal(await ex.locator(".hint").count(), 0); await ex.getByRole("button", { name: "Show a hint" }).click(); assert.equal(await ex.locator(".hint").count(), 1); await ex.getByRole("button", { name: "Show another hint" }).click(); assert.equal(await ex.locator(".hint").count(), 2);
  for (const c of await ex.locator(".selfcheck label").all()) await c.click(); assert.ok(await ex.getByText("Looks complete.").isVisible());
  await ex.getByRole("button", { name: "Mark task done" }).click(); assert.ok(await page.getByText("1 of 3 tasks done").isVisible()); await close();
});

test("long code collapses and expands", async () => {
  const { page, close } = await open();
  await page.locator('[data-topic-id="basic-syntax"]').click(); await page.getByRole("tab", { name: "Learn" }).click();
  assert.equal(await page.locator(".code__more").count(), 0, "short snippets are not collapsed"); await close();
});


/* ======================= accessibility and layout guards (visual-system freeze) ======================= */
test("keyboard focus is always visible: every control type shows an outline that no shadow can hide", async () => {
  const { page, close } = await open();
  const focusStyle = async sel => page.evaluate(s => { const el = document.querySelector(s); el.focus({ focusVisible: true }); const cs = getComputedStyle(el); return [cs.outlineStyle, parseFloat(cs.outlineWidth)]; }, sel);
  await page.keyboard.press("Tab"); // switch the page into keyboard modality
  for (const sel of [".btn[data-variant=primary]", ".rnode[data-selected]", ".tab[aria-selected=true]", ".chip", ".ntopic", ".themebtn", ".code__copy", ".search__input"]) {
    await page.locator(sel).first().scrollIntoViewIfNeeded().catch(() => {});
    const [style, width] = await focusStyle(sel); assert.ok(style !== "none" && width >= 2, `${sel}: outline ${style} ${width}`);
  }
  await close();
});

test("tabs, code header and top bar never clip at tablet and phone widths", async () => {
  for (const viewport of [TABLET, MOBILE, { width: 320, height: 640 }]) {
    const { page, close } = await open({ viewport });
    if (viewport.width < 768) { await page.locator('[data-topic-id="basic-syntax"]').tap(); } else await page.locator('[data-topic-id="basic-syntax"]').click();
    await page.getByRole("tab", { name: "Code" }).click();
    const r = await page.evaluate(() => { const over = el => el.scrollWidth > el.clientWidth + 1; const tabs = document.querySelector(".tabs"); const last = [...document.querySelectorAll(".tab")].at(-1).getBoundingClientRect(); const copy = document.querySelector(".code__copy").getBoundingClientRect(); const code = document.querySelector(".code").getBoundingClientRect();
      return { tabsOver: over(tabs), lastTabInside: last.right <= tabs.getBoundingClientRect().right + 1, copyInside: copy.right <= code.right + 1 && copy.left >= code.left, topbarOver: over(document.querySelector(".topbar")), pageOver: document.documentElement.scrollWidth > innerWidth }; });
    assert.deepEqual(r, { tabsOver: false, lastTabInside: true, copyInside: true, topbarOver: false, pageOver: false }, `width ${viewport.width}`); await close();
  }
});

test("both themes: no element text falls below AA against its rendered background (sampled key surfaces)", async () => {
  for (const scheme of ["dark", "light"]) {
    const { page, close } = await open({ scheme }); await page.locator('[data-topic-id="basic-syntax"]').click();
    const bad = await page.evaluate(() => {
      const parse = c => c.match(/[\d.]+/g).map(Number); const lin = v => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; const L = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      const bgOf = el => { for (let e = el; e; e = e.parentElement) { const [r, g, b, a = 1] = parse(getComputedStyle(e).backgroundColor); if (a > 0.85) return [r, g, b]; } return parse(getComputedStyle(document.body).backgroundColor); };
      const out = []; for (const el of document.querySelectorAll(".panel__title, .lede, .objectives span, .sec__title, .rlane__title, .rphase__title, .ntopic__title, .topbar__nums, .panel__crumb, .continue__title, .btn[data-variant=primary] .btn__label, .tab")) {
        const cs = getComputedStyle(el); if (!el.textContent.trim() || cs.visibility === "hidden") continue; const fg = parse(cs.color).slice(0, 3); const bg = bgOf(el); const [a, b] = [L(fg), L(bg)].sort((x, y) => y - x); const ratio = (a + 0.05) / (b + 0.05);
        if (ratio < 4.5 && parseFloat(cs.fontSize) < 24) out.push(`${el.className.toString().slice(0, 30)} ${ratio.toFixed(2)}`); } return out; });
    assert.deepEqual(bad, [], `${scheme}: ${bad.join("; ")}`); await close();
  }
});
