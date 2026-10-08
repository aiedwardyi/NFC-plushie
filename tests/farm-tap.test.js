import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
import { fakeUids } from "../src/pages.js";

const [A] = fakeUids;
const T0 = Date.parse("2026-05-01T10:00:00+09:00");
const MIN = 60 * 1000;
const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const css = readFileSync(new URL("../public/style.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");

function updateJar(jar, setCookies) {
  for (const sc of setCookies || []) {
    const m = /^([^=]+)=([^;]*)/.exec(sc);
    if (!m) continue;
    const k = m[1].trim();
    const v = m[2].trim();
    if (v === "" || /Expires=Thu, 01 Jan 1970/i.test(sc)) delete jar[k];
    else jar[k] = v;
  }
}

async function setup(t) {
  const dir = mkdtempSync(join(process.cwd(), ".test-data-"));
  const db = openDatabase(dir);
  let time = T0;
  const server = createApp({ db, now: () => time, rng: () => 0, demoUids: [] }).listen(0, "localhost");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    assert.equal(dirname(dir), process.cwd());
    rmSync(dir, { recursive: true, force: true });
  });
  async function request(path, { jar, body } = {}) {
    const headers = {};
    if (jar) {
      const pair = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
      if (pair) headers.Cookie = pair;
    }
    if (body) headers["Content-Type"] = "application/json";
    const res = await fetch(`http://localhost:${server.address().port}${path}`, {
      method: body ? "POST" : "GET",
      redirect: "manual",
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    return { status: res.status, html: await res.text(), setCookies };
  }
  const set = (sql, ...args) => db.prepare(`UPDATE plushies SET ${sql} WHERE uid = ?`).run(...args, A);
  return { request, set, advance: (ms) => { time += ms; } };
}

async function meet(ctx) {
  const jar = {};
  updateJar(jar, (await ctx.request(`/t?uid=${A}`, { jar })).setCookies);
  updateJar(jar, (await ctx.request("/name", { jar, body: { uid: A, name: "Mochi" } })).setCookies);
  updateJar(jar, (await ctx.request(`/t?uid=${A}`, { jar })).setCookies);
  assert.equal((await ctx.request("/farm", { jar, body: { uid: A, act: "open" } })).status, 200);
  return jar;
}

const later = () => {
  let settle;
  const promise = new Promise((resolve, reject) => { settle = { resolve, reject }; });
  return Object.assign(promise, settle);
};
const settled = () => new Promise((resolve) => setImmediate(resolve));

function source(text, pieces) {
  return pieces.map((re) => {
    if (typeof re === "string") return re;
    const m = text.match(re.re || re);
    assert.ok(m || re.optional, `has ${re.re || re}`);
    return m ? m[0] : "";
  }).join("\n");
}

// The page's own reader code (identify, heard and the desk key) run against a stub window and clock.
function reader(spot) {
  const listeners = [];
  const taps = [];
  const sent = [];
  const sandbox = {
    TAP_SPOT: spot,
    uid: A,
    URL,
    TextDecoder,
    clock: 0,
    performance: { now: () => sandbox.clock },
    window: { addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }), location: { replace: (url) => sent.push(url) } },
    // Only heard's branch without a sink reaches these; a key never may.
    talkHook: null, ready: true, away: false, secretOn: false, waking: false, demo: null, handoff: 0,
    root: { classList: { contains: () => false } },
    document: { querySelector: () => null },
    careHold: { asleep: false },
    closeSheet() {},
    sending: { catch: () => ({ then: (fn) => fn() }) },
    send: (raw) => sent.push(raw),
  };
  runInNewContext(source(app, [
    /const SAME_TAP_MS = \d+;/,
    /const SINK_SAME_MS = \d+;/,
    /const TAP_UID = \/.+\/;/,
    "let sinkFn = null;",
    "let lastRead = -Infinity;",
    /\n  function identify\(event\) \{[\s\S]*?\n  \}\n/,
    /\n  function heard\(event\) \{[\s\S]*?\n  \}\n/,
    { re: /\n  if \(TAP_SPOT === "desk"\) \{\n    window\.addEventListener\("keydown"[\s\S]*?\n  \}\n/, optional: true },
    "globalThis.sink = (fn) => { sinkFn = fn; };",
    "globalThis.heard = heard;",
  ]), sandbox);
  return {
    listeners,
    sent,
    taps,
    take() { sandbox.sink(() => taps.push(sandbox.clock)); },
    drop() { sandbox.sink(null); },
    read(ms) {
      sandbox.clock = ms;
      sandbox.heard({ serialNumber: "04:AA:AA:AA:AA:AA:A1", message: { records: [] } });
    },
    key(ms, init = {}) {
      sandbox.clock = ms;
      const event = { key: "F5", ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, repeat: false, ...init, prevented: false };
      event.preventDefault = () => { event.prevented = true; };
      for (const l of listeners) if (l.type === "keydown") l.fn(event);
      return event.prevented;
    },
  };
}

test("F5 is the plushie only on a desk while a game or the farm takes taps; phones never change from a key", () => {
  const desk = reader("desk");
  assert.deepEqual(desk.listeners.map((l) => [l.type, l.capture]), [["keydown", true]]);
  // The home: nothing takes taps, so F5 reloads as a full tap visit.
  assert.equal(desk.key(1000), false);
  desk.take();
  assert.equal(desk.key(2000), true);
  assert.deepEqual(desk.taps, [2000]);
  // Ctrl+R never reaches the key, and F5 with a modifier is the browser's hard reload.
  for (const init of [{ key: "r", ctrlKey: true }, { key: "R", metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { metaKey: true }]) {
    assert.equal(desk.key(5000, init), false, JSON.stringify(init));
  }
  // A held key repeats: no reload, and still one tap.
  assert.equal(desk.key(6000, { repeat: true }), true);
  assert.deepEqual(desk.taps, [2000]);
  // The game or farm that leaves hands F5 back to the browser.
  desk.drop();
  assert.equal(desk.key(9000), false);
  assert.deepEqual([desk.taps, desk.sent], [[2000], []]);
  for (const spot of ["top", "back"]) {
    const phone = reader(spot);
    phone.take();
    assert.deepEqual([phone.listeners.length, phone.key(1000), phone.taps], [0, false, []], spot);
  }
});

test("F5 takes the in-page reader's own path: reads and keys share its same-tap gap", () => {
  const desk = reader("desk");
  desk.take();
  desk.key(1000);
  desk.key(1100);
  desk.read(1200);
  desk.key(1300);
  desk.read(1600);
  desk.key(1700);
  desk.key(2000);
  assert.deepEqual([desk.taps, desk.sent], [[1000, 1600, 2000], []]);
});

// The farm room's visit start run against a stub engine: the test settles the engine load and the farm's enter by hand.
function visitStart({ celebrate = false } = {}) {
  const room = app.match(/\nconst farm = \(function farmRoom\(\) \{[\s\S]*?\n\}\)\(\);\n/)?.[0] || "";
  const log = [];
  const timers = [];
  const s = { busy: celebrate, engine: later(), entered: later() };
  const sandbox = {
    s,
    log,
    body: {
      dataset: { farmVisit: JSON.stringify({ ok: true, act: "harvest", picked: [], trained: null }) },
      hasAttribute: (name) => celebrate && name === "data-celebrate",
    },
    window: { setTimeout: (fn) => timers.push(fn) },
    document: { querySelector: () => null },
    careHold: { asleep: false },
    scheduleDot() {},
    preload() {},
    trainedPop() {},
    flush: () => log.push("flush"),
    broken: () => log.push("broken"),
    openFailed: () => log.push("failed"),
    petBusy: () => s.busy,
  };
  runInNewContext(source(room, [
    /const CALM_MS = \d+;/,
    "let visit = null;",
    "let isOpen = false;",
    "let opening = false;",
    "let ready = null;",
    // The start deadline has its own test; here a wait is as long as the test makes it.
    "const START_MS = 10000;",
    "function within(promise) { return promise; }",
    "function prepare() { s.engine.then((g) => { ready = g; }, () => {}); log.push('prepare'); return s.engine; }",
    "function enter(st, r, how) { isOpen = true; log.push(`enter ${how}`); return s.entered; }",
    { re: /\n  const uncover = [^\n]+\n/, optional: true },
    /\n  function openVisit\(r\) \{[\s\S]*?\n  \}\n/,
    /\n  function whenCalm\(fn\) \{[\s\S]*?\n  \}\n/,
    { re: /\n  const celebrating = [^\n]+\n/, optional: true },
    /\n  function start\(\) \{[\s\S]*?\n  \}\n/,
    "globalThis.start = start;",
  ]), sandbox);
  return {
    log,
    start: () => sandbox.start(),
    covered: () => "farmVisit" in sandbox.body.dataset,
    calmWaits: () => timers.length,
    calm() { s.busy = false; },
    async tick() {
      for (const fn of timers.splice(0)) fn();
      await settled();
    },
    async load() { s.engine.resolve({ promptTouch: later, open: async () => {}, exit() {} }); await settled(); },
    async loadFails() { s.engine.reject(new Error("no engine")); await settled(); },
    async enterDone() { s.entered.resolve(); await settled(); },
    async enterFails() { s.entered.reject(new Error("stage")); await settled(); },
  };
}

test("a farm visit goes straight into the farm under its cover, which lifts once the farm is in; a celebrating one waits its show out", async () => {
  const visit = visitStart();
  visit.start();
  assert.deepEqual([visit.covered(), visit.calmWaits()], [true, 0]);
  await visit.load();
  assert.deepEqual(visit.log, ["prepare", "prepare", "enter visit"]);
  assert.equal(visit.covered(), true);
  await visit.enterDone();
  assert.deepEqual([visit.covered(), visit.calmWaits()], [false, 0]);
  const party = visitStart({ celebrate: true });
  party.start();
  assert.equal(party.covered(), false);
  await party.load();
  for (let i = 0; i < 6; i++) await party.tick();
  assert.equal(party.log.includes("enter visit"), false);
  party.calm();
  for (let i = 0; i < 4; i++) await party.tick();
  assert.equal(party.log.at(-1), "enter visit");
});

test("a visit whose farm can't load or breaks lifts its cover, so the home shows", async () => {
  const lost = visitStart();
  lost.start();
  assert.equal(lost.covered(), true);
  await lost.loadFails();
  assert.equal(lost.covered(), false);
  assert.deepEqual(lost.log.slice(-2), ["failed", "flush"]);
  const broke = visitStart();
  broke.start();
  await broke.load();
  assert.equal(broke.covered(), true);
  await broke.enterFails();
  assert.equal(broke.covered(), false);
  assert.equal(broke.log.at(-1), "broken");
});

const COVERED = 'body[data-farm-visit]:not([data-celebrate])';

test("a farm visit page carries the mark its farm cover needs from the first paint; a celebrating visit keeps the home", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx);
  ctx.advance(MIN);
  const bodyOf = async (cookies) => (await ctx.request(`/t?uid=${A}`, { jar: cookies })).html.match(/<body[^>]*>/)[0];
  const visit = await bodyOf({ ...jar, farm_at: A });
  assert.match(visit, / data-farm-visit="\{&quot;ok&quot;:true,&quot;act&quot;:&quot;harvest&quot;/);
  assert.doesNotMatch(visit, /data-celebrate/);
  assert.doesNotMatch(await bodyOf(jar), /data-farm-visit/);
  // The cover keys on that mark, only while app.js runs: it hides the home and wears the open farm's layout.
  const rules = css.split("\n").filter((line) => line.includes("[data-farm-visit]"));
  const has = (re) => assert.ok(rules.some((rule) => re.test(rule)), `cover rule ${re}`);
  has(/ :is\(\.sky > \*, \.pet, \.want\) \{ visibility: hidden; \}$/);
  has(/ \.sky::after \{ display: none; \}$/);
  has(/ \.sky \{ animation: none; background: linear-gradient\(180deg, #bfe1f4/);
  has(/ :is\(\.plate, \.pet-stats, main > footer\) \{ display: none; \}$/);
  const layout = (sel) => css.match(new RegExp(`^html\\.f-layout ${sel} \\{ ([^}]+) \\}$`, "m"))[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  has(new RegExp(` main \\{ ${layout("main")} \\}$`));
  has(new RegExp(` \\.window \\{ ${layout("\\.window")} touch-action: none; \\}$`));
  has(/ :is\(\.dock-btn:not\(\[data-farm\]\), \.topbar-end, \.mascot-toggle\) \{ opacity: \.22; filter: saturate\(\.5\); pointer-events: none; \}$/);
  has(/^\.has-app:not\(\.f-layout\) body\[data-farm-visit\]:not\(\[data-celebrate\]\) main::after \{ content: ""; order: -2; min-height: 52px; margin-top: -2px; \}$/);
  for (const rule of rules) assert.ok(rule.startsWith(".has-app") && rule.includes(COVERED), rule);
  // A tap that levels up celebrates on the home first, so its visit page wears no cover.
  ctx.set("xp = 90, last_rewarded_at = NULL");
  ctx.advance(MIN);
  const party = await bodyOf({ ...jar, farm_at: A });
  assert.match(party, / data-farm-visit="/);
  assert.match(party, / data-celebrate="levelup"/);
});
