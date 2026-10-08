import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as guideModel from "../public/guide-model.js";

const UID = "04AAAAAAAAAAA1";
const MET = "2026-05-01T01:00:00.000Z";
const KEY = guideModel.guideKey(UID, MET);
const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const tour = app.match(/\n\(function guideTour\(\) \{[\s\S]*?\n\}\)\(\);\n/)?.[0];
const settled = () => new Promise((resolve) => setImmediate(resolve));

function classes(...names) {
  const set = new Set(names);
  return { add: (n) => set.add(n), remove: (n) => set.delete(n), contains: (n) => set.has(n), toggle: (n, on) => (on ? set.add(n) : set.delete(n)) };
}

function el(extra = {}) {
  const self = {
    isConnected: true,
    hidden: false,
    dataset: {},
    classList: classes(),
    getClientRects: () => [{}],
    getBoundingClientRect: () => ({ left: 10, top: 10, width: 40, height: 40 }),
    scrollIntoView() {},
    contains: (other) => other === self,
    querySelector: () => null,
    ...extra,
  };
  return self;
}

// The guide's own tour run against a stub page and a hand-turned clock: the test sets the page, the farm and the dialog.
async function page({ named = false, done = null, store = new Map() } = {}) {
  assert.ok(tour, "the guide is in app.js");
  if (done) store.set(KEY, JSON.stringify({ done, skipped: false }));
  const s = { now: 0, calm: true, rect: null, grow: null, coming: false, tapped: 0, basket: "", typing: false, shop: false };
  const timers = [];
  const said = [];
  const replay = [];
  const shown = [];
  const skips = [];
  const keys = [];
  const root = { dataset: {}, classList: classes() };
  const btn = (name) => el({ name });
  const dock = el({
    dataset: { careUid: UID, want: "" },
    querySelector: (sel) => ({ '[data-care="feed"]': btn("feed"), "[data-farm]": btn("farm"), '[data-open="arcade"]': btn("arcade") })[sel] || null,
  });
  const arcade = el({ querySelector: (sel) => (sel === '[data-game="race"]' ? btn("race") : null) });
  const dialog = el({ classList: classes() });
  dialog.querySelector = (sel) => (sel.includes(".dialog-cursor") && s.typing ? {} : null);
  const basket = (sel) => {
    if (sel === ".f-basket .fb-crop") return s.basket === "crops" ? btn("crop") : null;
    if (sel.startsWith(".f-basket .fb-act")) return s.basket === "crops" ? btn("send") : null;
    if (sel === ".f-basket .fb-empty") return s.basket === "empty" ? btn("empty") : null;
    if (sel === ".f-basket .fb-coins.is-shop") return s.shop ? btn("coins") : null;
    if (sel === ".f-basket .fb-coins") return btn("coins");
    return null;
  };
  const sandbox = {
    document: {
      documentElement: root,
      body: { dataset: { met: MET, ...(named ? { celebrate: "named" } : {}) } },
      activeElement: null,
      querySelector: (sel) => (sel === ".dock[data-care-uid]" ? dock : sel === "[data-window]" ? el() : sel === '[data-sheet="arcade"]' ? arcade : sel === "[data-guide-replay]" ? el({ addEventListener: (type, fn) => replay.push(fn) }) : basket(sel)),
    },
    window: {
      setTimeout: (fn, ms) => timers.push({ at: s.now + ms, fn }) && timers.length,
      clearTimeout() {},
      addEventListener: (type, fn) => type === "keydown" && keys.push(fn),
    },
    performance: { now: () => s.now },
    localStorage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      key: (i) => [...store.keys()][i] ?? null,
      get length() { return store.size; },
    },
    care: { fx: { say: (line) => said.push(line) } },
    pet: el({ querySelector: () => btn("pet") }),
    dialogBox: dialog,
    careHold: { asleep: false, busy: false },
    waking: false,
    sheetOpen: null,
    demoSheet: null,
    talkHook: null,
    farm: { calm: () => s.calm, cropRect: () => s.rect, growRect: () => s.grow, coming: () => s.coming, tapped: () => s.tapped },
    coach: { show: () => shown.push(root.dataset.coach), hide() {}, pulse() {}, owns: () => false, skipped: (fn) => skips.push(fn) },
    prefersReducedMotion: () => false,
    closeSheet() {},
    model: () => Promise.resolve(guideModel),
  };
  runInNewContext(tour.replace('import("/guide-model.js")', "model()"), sandbox);
  await settled();
  return {
    s,
    root,
    dialog,
    said,
    shown,
    on: () => root.dataset.coach || null,
    replay: () => replay.forEach((fn) => fn()),
    skip: () => skips.forEach((fn) => fn()),
    sheet: (open) => (sandbox.sheetOpen = open ? arcade : null),
    key(name) {
      const event = { key: name, stopped: false, preventDefault() {}, stopPropagation() { this.stopped = true; } };
      keys.forEach((fn) => fn(event));
      return event;
    },
    done: () => JSON.parse(store.get(KEY) || "null")?.done || [],
    skipped: () => JSON.parse(store.get(KEY) || "null")?.skipped === true,
    run(ms) {
      const end = s.now + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        if (!timers.length || timers[0].at > end) break;
        const t = timers.shift();
        s.now = t.at;
        t.fn();
      }
      s.now = end;
    },
  };
}

test("a rare or legendary naming lights its edition before the guide's first step; a 포근 클래식 one starts it as before", async () => {
  for (const edition of ["rare", "legendary", "classic"]) {
    const p = await page({ named: true });
    if (edition !== "classic") p.root.dataset.editionReveal = edition;
    p.dialog.classList.add("is-seq");
    p.s.typing = true;
    p.run(1000);
    // The first line is typed; the edition line follows on its own.
    p.s.typing = false;
    p.run(2200);
    p.s.typing = true;
    if (edition !== "classic") {
      delete p.root.dataset.editionReveal;
      p.root.classList.add("is-edition-lit");
    }
    p.run(820);
    p.s.typing = false;
    p.dialog.classList.add("is-end");
    if (edition === "classic") {
      p.run(800);
      assert.deepEqual(p.shown, ["care"], edition);
      continue;
    }
    // The frame still lights after the line is typed, so the guide waits it out.
    p.run(950);
    assert.deepEqual(p.shown, [], edition);
    p.root.classList.remove("is-edition-lit");
    p.run(600);
    assert.deepEqual(p.shown, [], edition);
    p.run(200);
    assert.deepEqual([p.shown, p.said], [["care"], ["배고파요! 밥을 눌러줘요"]], edition);
  }
});

test("a desk F5 or a Web NFC read that harvests in place counts as the farm tour's pick and takes its spotlight away", async () => {
  for (const busy of [true, false]) {
    const p = await page({ done: ["care", "pet", "farm"] });
    p.root.classList.add("f-on");
    p.s.rect = { left: 40, top: 200, width: 60, height: 60 };
    p.run(800);
    assert.equal(p.on(), "crop");
    // The harvest knocks and plays its show; a plot still pending at the knock stays ripe after it.
    if (busy) {
      p.s.calm = false;
      p.run(1500);
      p.s.calm = true;
    }
    p.s.tapped = 1;
    p.s.basket = "crops";
    p.run(800);
    assert.ok(p.done().includes("crop"), `busy ${busy}`);
    assert.equal(p.on(), null, `busy ${busy}`);
    p.run(3800);
    assert.equal(p.on(), "send", `busy ${busy}`);
  }
});

test("the farm tour's grow line fits both the first sprout and a replay's next crop", async () => {
  for (const ms of [45000, 110000]) {
    const p = await page({ done: ["care", "pet", "farm"] });
    p.root.classList.add("f-on");
    p.s.grow = { left: 40, top: 200, width: 60, height: 40, ms, words: "2분 남았어요" };
    p.run(800);
    assert.equal(p.on(), "grow");
    assert.equal(p.said.at(-1), "쑥쑥 자라는 중! 다 자라면 알려 줄게요", `wait ${ms}`);
  }
});

test("a plushie harvest during the soft wait that picks nothing keeps the wait; one that picks after the sprout ripens is the pick", async () => {
  const p = await page({ done: ["care", "pet", "farm"] });
  p.root.classList.add("f-on");
  p.s.grow = { left: 40, top: 200, width: 60, height: 40, ms: 45000, words: "" };
  p.run(800);
  assert.equal(p.on(), "grow");
  p.s.calm = false;
  p.run(1500);
  p.s.calm = true;
  p.run(800);
  assert.deepEqual([p.on(), p.done().includes("crop")], ["grow", false]);
  p.s.grow = null;
  p.s.rect = { left: 40, top: 200, width: 60, height: 60 };
  p.run(800);
  assert.equal(p.on(), "crop");
  p.s.tapped = 1;
  p.s.basket = "crops";
  p.run(200);
  assert.deepEqual([p.on(), p.done().includes("crop")], [null, true]);
});

test("가이드 다시 보기 after a plushie harvest on the same page still teaches the pick; a harvest after the replay is the pick", async () => {
  const p = await page({ done: ["care", "pet", "farm", "arcade", "race", "bye", "crop", "send", "shop", "farm-bye", "farm-home"] });
  p.s.tapped = 1;
  p.s.basket = "crops";
  p.replay();
  p.root.classList.add("f-on");
  p.s.rect = { left: 40, top: 200, width: 60, height: 60 };
  p.run(800);
  assert.deepEqual([p.on(), p.done().includes("crop")], ["crop", false]);
  p.s.tapped = 2;
  p.run(200);
  assert.deepEqual([p.on(), p.done().includes("crop")], [null, true]);
});

test("a plushie tap during the farm tour reloads into the farm cover: no step shows until the farm is in, then the tour goes on", async () => {
  for (const before of [["care", "pet", "farm"], ["care", "pet", "farm", "crop"]]) {
    const p = await page({ done: before });
    p.s.coming = true;
    p.run(3000);
    assert.deepEqual([p.shown, p.said], [[], []], `cover after ${before.at(-1)}`);
    // The farm enters under its cover; the cover lifts once the farm is in.
    p.root.classList.add("f-on");
    p.s.calm = false;
    p.run(600);
    assert.deepEqual(p.shown, [], `entering after ${before.at(-1)}`);
    p.s.coming = false;
    p.s.calm = true;
    p.s.tapped = 1;
    p.s.basket = "crops";
    p.run(800);
    assert.ok(p.done().includes("crop"), `after ${before.at(-1)}`);
    p.run(3800);
    assert.deepEqual(p.shown, ["send"], `after ${before.at(-1)}`);
  }
  // A desk F5 on the home reloads; the home tour goes on from its next step.
  const home = await page({ done: ["care"] });
  home.run(800);
  assert.deepEqual(home.shown, ["pet"]);
});

test("a skip before the farm tour's first pick hands the farm's own hint back, on a resumed page too; a hint the farm already gave stays done", async () => {
  const store = new Map();
  await page({ named: true, store });
  // A reload resumes the tour, and the owner skips before the pick.
  (await page({ store })).skip();
  assert.equal(store.get(`farm-guide:${UID}`), undefined);
  const seen = new Map([[`farm-guide:${UID}`, "1"]]);
  (await page({ named: true, store: seen })).skip();
  assert.equal(seen.get(`farm-guide:${UID}`), "1");
});

test("before Lv 3 the farm tour's shop step says when the shop opens; from Lv 3 it points at buying seeds", async () => {
  for (const open of [false, true]) {
    const p = await page({ done: ["care", "pet", "farm", "crop", "send"] });
    p.s.shop = open;
    p.root.classList.add("f-on");
    p.run(800);
    assert.deepEqual([p.on(), p.said.at(-1)], ["shop", open ? "코인으로 새 씨앗을 사요" : "코인을 모아 둬요! Lv 3부터 새 씨앗을 살 수 있어요"], `open ${open}`);
  }
});

test("Esc on the 오락실 sheet in the race step shuts it like its × and the tour goes on; Esc on any other step skips the tour", async () => {
  const p = await page({ done: ["care", "pet", "farm", "arcade"] });
  p.sheet(true);
  p.run(800);
  assert.equal(p.on(), "race");
  // Left unstopped, so the sheet's own Esc shuts it.
  assert.deepEqual([p.key("Escape").stopped, p.done().includes("race"), p.skipped()], [false, true, false]);
  p.sheet(false);
  p.run(1000);
  assert.equal(p.said.at(-1), "언제든 인형을 폰에 톡 대면 내가 깨어나요!");
  const q = await page({ done: ["care"] });
  q.run(800);
  assert.equal(q.on(), "pet");
  assert.deepEqual([q.key("Escape").stopped, q.skipped()], [true, true]);
});
