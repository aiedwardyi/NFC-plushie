import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const settled = () => new Promise((resolve) => setImmediate(resolve));
const BUSY = "canvas.celebrate-layer, .is-evolving, .is-still-celebrate, .is-reunion-jump, .talk-bar.is-open";
const LOST = { card: { id: "Abc123_-xyz0", name: "Pippo", kind: "dog", edition: "rare", level: 3, city: "seoul" }, held: false, at: 1 };
const HELD = { ...LOST, held: true };

// The 우리 동네 소식 room of app.js on a stub home: the page's flags, a held fetch, the sheet it opens.
function newsPage({ reply = { ok: true, news: [LOST, HELD], line: "자리 비운 사이에 2번 도전받았어요! 1번 이겼어요", tickets: 3, tapped: true }, home = true } = {}) {
  const block = app.match(/\nconst news = \(function townNews\(\) \{[\s\S]*?\n\}\)\(\);\n/)?.[0];
  assert.ok(block, "the news room is in app.js");
  const page = { opened: [], closed: 0, fetched: 0, rematch: [], timers: [], answer: null, busy: false, dialog: new Set(), dots: false };
  const classes = new Set();
  const root = { classList: { contains: (c) => classes.has(c) }, dataset: {} };
  const box = { innerHTML: "", addEventListener: (type, fn) => { page.click = fn; }, querySelectorAll: () => [] };
  const sheet = { querySelector: (s) => (s === "[data-news]" ? box : null) };
  const els = { ".dock[data-care-uid]": home ? { dataset: { careUid: "04AAAAAAAAAAA1" } } : null, '[data-sheet="news"]': home ? sheet : null, "[data-nameplate]": { textContent: " 콩이 " } };
  const sandbox = {
    document: { hidden: false, documentElement: root, querySelector: (s) => (s === BUSY ? (page.busy ? {} : null) : els[s] ?? null) },
    window: { setTimeout: (fn) => page.timers.push(fn) },
    sheetOpen: null,
    waking: false,
    careHold: { asleep: false, busy: false },
    demoSheet: { hidden: true },
    dialogBox: { querySelector: () => (page.dots ? {} : null), classList: { contains: (c) => page.dialog.has(c) } },
    openSheet: (id) => page.opened.push(id),
    closeSheet: () => { page.closed += 1; },
    racing: { rematch: (card) => page.rematch.push(card.name) },
    ticketLine: (tapped) => (tapped ? "다 썼어요" : "톡 해 주세요"),
    fetch: () => {
      page.fetched += 1;
      return new Promise((resolve) => { page.answer = () => resolve({ ok: true, json: async () => reply }); });
    },
    load: async () => ({ cardHtml: (card, o) => `[${card.name} ${o.tag}${o.still ? " still" : ""}]`, sayHtml: (name, line) => `(${name}: ${line})` }),
  };
  runInNewContext(`${block.replace(/\bimport\(/g, "load(")}\nglobalThis.room = news;`, sandbox);
  const tick = async () => {
    for (const fn of page.timers.splice(0)) fn();
    await settled();
  };
  const answer = async () => {
    page.answer?.();
    for (let i = 0; i < 5; i++) await settled();
  };
  return { page, sandbox, classes, root, box, room: sandbox.room, tick, answer };
}

test("the news waits out every busy moment, then is asked for and shown once", async () => {
  const p = newsPage();
  const busy = [
    () => { p.sandbox.document.hidden = true; },
    () => { p.sandbox.waking = true; },
    () => { p.sandbox.careHold.asleep = true; },
    () => { p.sandbox.careHold.busy = true; },
    () => { p.sandbox.sheetOpen = {}; },
    () => { p.sandbox.demoSheet.hidden = false; },
    ...["has-coach", "has-reveal", "is-edition-lit", "g-on", "f-on"].map((c) => () => p.classes.add(c)),
    () => { p.root.dataset.editionReveal = "legendary"; },
    () => { p.page.dots = true; },
    () => { p.page.dialog.add("is-seq"); },
    () => { p.page.busy = true; },
  ];
  const calm = () => {
    Object.assign(p.sandbox, { waking: false, sheetOpen: null });
    p.sandbox.document.hidden = false;
    Object.assign(p.sandbox.careHold, { asleep: false, busy: false });
    p.sandbox.demoSheet.hidden = true;
    p.classes.clear();
    delete p.root.dataset.editionReveal;
    Object.assign(p.page, { dots: false, busy: false });
    p.page.dialog.clear();
  };
  for (const [i, make] of busy.entries()) {
    calm();
    make();
    if (i === 0) p.room.show();
    else await p.tick();
    assert.deepEqual([p.page.fetched, p.page.opened.length, p.page.timers.length], [0, 0, 1], `busy ${i}`);
  }
  calm();
  p.page.dialog.add("is-seq");
  p.page.dialog.add("is-end");
  await p.tick();
  assert.equal(p.page.fetched, 1);
  await p.answer();
  assert.deepEqual(p.page.opened, ["news"]);
  p.room.show();
  await p.tick();
  assert.deepEqual([p.page.fetched, p.page.opened], [1, ["news"]]);
});

test("news that turns up on a busy page waits for the next calm one without asking again", async () => {
  const p = newsPage();
  p.room.show();
  assert.equal(p.page.fetched, 1);
  p.sandbox.sheetOpen = {};
  await p.answer();
  assert.deepEqual([p.page.opened, p.page.timers.length], [[], 1]);
  await p.tick();
  assert.deepEqual(p.page.opened, []);
  p.sandbox.sheetOpen = null;
  await p.tick();
  assert.deepEqual([p.page.fetched, p.page.opened], [1, ["news"]]);
});

test("a 복수전 on offer pairs with 다음에 할래요, no ticket gives the pet's line, all wins one 잘했어요!", async () => {
  const offer = newsPage();
  offer.room.show();
  await offer.answer();
  assert.match(offer.box.innerHTML, /^\(콩이: 자리 비운 사이에 2번 도전받았어요! 1번 이겼어요\)/);
  assert.match(offer.box.innerHTML, /\[Pippo 졌어요\]\[Pippo 이겼어요 still\]/);
  assert.match(offer.box.innerHTML, /data-news-go>복수전 · 티켓 1장<\/button><button type="button" class="copy" data-news-done>다음에 할래요</);
  offer.page.click({ target: { closest: (s) => (s === "[data-news-go]" ? {} : null) } });
  assert.deepEqual(offer.page.rematch, ["Pippo"]);
  for (const [tapped, line] of [[true, "다 썼어요"], [false, "톡 해 주세요"]]) {
    const none = newsPage({ reply: { ok: true, news: [LOST], line: "자리 비운 사이에 도전받았어요! 아깝게 졌어요", tickets: 0, tapped } });
    none.room.show();
    await none.answer();
    assert.match(none.box.innerHTML, new RegExp(`\\(콩이: ${line}\\)`));
    assert.match(none.box.innerHTML, /\[Pippo 졌어요 still\]/);
    assert.doesNotMatch(none.box.innerHTML, /data-news-go/);
    assert.match(none.box.innerHTML, /<div class="news-acts"><button type="button" class="copy" data-news-done>다음에 할래요<\/button><\/div>/);
  }
  const wins = newsPage({ reply: { ok: true, news: [HELD, HELD], line: "자리 비운 사이에 2번 도전받았어요! 다 이겼어요", tickets: 3, tapped: true } });
  wins.room.show();
  await wins.answer();
  assert.match(wins.box.innerHTML, /<div class="news-acts"><button type="button" class="copy is-go" data-news-done>잘했어요!<\/button><\/div>/);
  wins.page.click({ target: { closest: (s) => (s === "[data-news-done]" ? {} : null) } });
  assert.equal(wins.page.closed, 1);
});

test("a 복수전 is offered only on a loss whose challenger can still be raced", async () => {
  const GONE = { card: { ...LOST.card, id: "Gone12_-xyz0", name: "Dodo" }, held: false, at: 2, gone: true };
  const some = newsPage({ reply: { ok: true, news: [GONE, LOST], line: "자리 비운 사이에 2번 도전받았어요! 다 졌어요", tickets: 3, tapped: true } });
  some.room.show();
  await some.answer();
  assert.match(some.box.innerHTML, /\[Dodo 졌어요 still\]\[Pippo 졌어요\]/);
  some.page.click({ target: { closest: (s) => (s === "[data-news-go]" ? {} : null) } });
  assert.deepEqual(some.page.rematch, ["Pippo"]);
  const none = newsPage({ reply: { ok: true, news: [GONE, HELD], line: "자리 비운 사이에 2번 도전받았어요! 1번 이겼어요", tickets: 3, tapped: true } });
  none.room.show();
  await none.answer();
  assert.doesNotMatch(none.box.innerHTML, /data-news-go|data-news-card|다 썼어요|톡 해 주세요/);
  assert.match(none.box.innerHTML, /<div class="news-acts"><button type="button" class="copy" data-news-done>다음에 할래요<\/button><\/div>/);
});

test("an empty inbox shows nothing, and a page without the owner's dock has no news at all", async () => {
  const empty = newsPage({ reply: { ok: true, news: [], line: "", tickets: 0, tapped: false } });
  empty.room.show();
  await empty.answer();
  await empty.tick();
  assert.deepEqual([empty.page.fetched, empty.page.opened], [1, []]);
  assert.equal(newsPage({ home: false }).room, null);
});
