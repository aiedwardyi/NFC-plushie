import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
import { fakeUids } from "../src/pages.js";

/* The three scenes and their app.js rooms run here against stub pages: a hand-turned clock for timers and frames,
   plain elements, and a Pixi where every object is a stub except the app, whose render() a test can make throw. */

const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const settled = () => new Promise((resolve) => setImmediate(resolve));

// A new pet's first farm open as the server sends it, fetched before any test swaps the timers for its own clock.
const OPENED = await (async () => {
  const [uid] = fakeUids;
  const dir = mkdtempSync(join(process.cwd(), ".test-data-"));
  const db = openDatabase(dir);
  const server = createApp({ db, now: () => Date.parse("2026-05-01T10:00:00+09:00"), rng: () => 0, demoUids: [] }).listen(0, "localhost");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const jar = {};
    // Plain http without a pool: nothing of it may still be running once a test's clock takes the timers.
    const go = (path, body) => new Promise((resolve, reject) => {
      const headers = { Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; "), ...(body ? { "Content-Type": "application/json" } : {}) };
      const req = request({ host: "localhost", port: server.address().port, path, method: body ? "POST" : "GET", agent: false, headers }, (res) => {
        for (const sc of res.headers["set-cookie"] || []) {
          const [, k, v] = /^([^=]+)=([^;]*)/.exec(sc);
          jar[k.trim()] = v.trim();
        }
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { text += chunk; });
        res.on("end", () => resolve(text));
      });
      req.on("error", reject);
      req.end(body ? JSON.stringify(body) : undefined);
    });
    await go(`/t?uid=${uid}`);
    await go("/name", { uid, name: "Mochi" });
    await go(`/t?uid=${uid}`);
    return JSON.parse(await go("/farm", { uid, act: "open" }));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
})();

// Timers and animation frames on a clock the test turns; frames also drive any started Pixi ticker, as Pixi does.
function makeClock(env) {
  let now = 1000;
  let seq = 0;
  const timers = new Map();
  const frames = new Map();
  return {
    now: () => now,
    setTimeout(fn, ms = 0) {
      seq += 1;
      timers.set(seq, { at: now + Math.max(0, ms || 0), fn });
      return seq;
    },
    clearTimeout: (id) => timers.delete(id),
    requestAnimationFrame(fn) {
      seq += 1;
      frames.set(seq, fn);
      return seq;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    async run(ms, step = 16) {
      const end = now + ms;
      while (now < end) {
        now = Math.min(end, now + step);
        for (const [id, t] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
          if (t.at > now || !timers.has(id)) continue;
          timers.delete(id);
          env.guard(() => t.fn());
        }
        const due = [...frames];
        frames.clear();
        for (const [, fn] of due) env.guard(() => fn(now));
        for (const a of env.apps) {
          if (!a.ticker.started) continue;
          // A listener that throws stops Pixi's ticker for good.
          env.guard(() => {
            for (const fn of a.ticker.listeners) fn({ deltaMS: step });
            a.renderer.render(a.stage);
          }, () => { a.ticker.started = false; });
        }
        await settled();
      }
    },
  };
}

// Anything at all: every property is another stub, every call and `new` returns one, and it reads as 0.
function anything(over = {}) {
  const store = { ...over };
  return new Proxy(function stub() {}, {
    get(_, k) {
      if (k in store) return store[k];
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === Symbol.iterator) return function* none() {};
      if (k === "then" || typeof k === "symbol") return undefined;
      store[k] = anything();
      return store[k];
    },
    set(_, k, v) {
      store[k] = v;
      return true;
    },
    apply: () => anything(),
    construct: () => anything(),
  });
}

function classes() {
  const set = new Set();
  return { add: (...n) => n.forEach((x) => set.add(x)), remove: (...n) => n.forEach((x) => set.delete(x)), contains: (n) => set.has(n), toggle: (n, on = !set.has(n)) => (on ? set.add(n) : set.delete(n)), has: (n) => set.has(n) };
}

// A plain element: real state for what the code reads back, stubs for the rest; querySelector hands out one child per selector.
function element(env, tag = "div") {
  const listeners = {};
  const el = {
    tagName: tag.toUpperCase(),
    style: {},
    dataset: {},
    hidden: false,
    className: "",
    textContent: "",
    innerHTML: "",
    disabled: false,
    width: 300,
    height: 150,
    clientWidth: 384,
    clientHeight: 600,
    offsetWidth: 120,
    offsetHeight: 40,
    offsetTop: 400,
    naturalWidth: 512,
    naturalHeight: 512,
    isConnected: true,
    classList: classes(),
    children: [],
    kids: {},
    ups: {},
    attrs: {},
    listeners,
    setAttribute(k, v) { el.attrs[k] = String(v); },
    getAttribute: (k) => el.attrs[k] ?? null,
    removeAttribute(k) { delete el.attrs[k]; },
    hasAttribute: (k) => k in el.attrs,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
    // Calls the listeners as the browser would, and returns whatever the last one threw.
    fire(type, event = {}) {
      let thrown = null;
      for (const fn of [...(listeners[type] || [])]) {
        try {
          fn({ type, target: el, currentTarget: el, preventDefault() {}, stopPropagation() {}, ...event });
        } catch (error) {
          thrown = error;
        }
      }
      return thrown;
    },
    appendChild(c) { env.parents.set(c, el); return c; },
    append(...cs) { cs.forEach((c) => el.appendChild(c)); },
    insertBefore(c) { return el.appendChild(c); },
    after() {},
    remove() { el.removed = true; },
    replaceChildren() {},
    querySelector(sel) { el.kids[sel] ||= element(env); return el.kids[sel]; },
    querySelectorAll: () => [],
    closest(sel) { el.ups[sel] ||= element(env); return el.ups[sel]; },
    contains: () => false,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 384, bottom: 600, width: 384, height: 600, x: 0, y: 0 }),
    getClientRects: () => [{}],
    focus() {},
    blur() {},
    setPointerCapture() {},
    getContext: () => anything({ getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(0, (w | 0) * (h | 0) * 4)) }), measureText: () => ({ width: 10 }) }),
    animate(frames, options = {}) {
      const a = { target: el, frames, options, playState: "running", finished: Promise.resolve(), cancel() { a.playState = "idle"; }, pause() { a.playState = "paused"; }, play() { a.playState = "running"; } };
      env.animations.push(a);
      return a;
    },
    // A page that lost its finished animations to the collector still shows their last frame, but no longer lists them.
    getAnimations: () => (env.forget ? [] : env.animations.filter((a) => a.target === el && a.playState !== "idle")),
  };
  return el;
}

// Pixi's app as the scenes use it, with a render() that throws once env.broken is set.
function makeApp(env) {
  const a = {
    canvas: element(env, "canvas"),
    stage: anything(),
    ticker: { listeners: [], started: false, add(fn) { a.ticker.listeners.push(fn); }, remove() {}, start() { a.ticker.started = true; }, stop() { a.ticker.started = false; } },
    renderer: {
      gl: anything({ isContextLost: () => false }),
      events: anything(),
      context: anything(),
      background: anything(),
      resolution: 1,
      render() {
        if (env.broken) throw new Error("render fails");
      },
      resize() {},
    },
    async init() {},
    destroy() { a.destroyed = true; },
  };
  return a;
}

// The page a scene module sees: window, document, Image and friends, all on globalThis for the module's sake.
function installPage({ theme = "classic", mascot = "horse", stall = () => false } = {}) {
  const env = { apps: [], animations: [], parents: new Map(), created: [], errors: [], broken: false, forget: false };
  env.guard = (fn, onThrow) => {
    try {
      fn();
    } catch (error) {
      env.errors.push(error);
      onThrow?.(error);
    }
  };
  const clock = makeClock(env);
  env.clock = clock;
  const root = element(env, "html");
  root.dataset.theme = theme;
  root.dataset.mascot = mascot;
  const body = element(env, "body");
  const docListeners = {};
  env.document = {
    documentElement: root,
    body,
    hidden: false,
    activeElement: null,
    createElement(tag) {
      const el = element(env, tag);
      env.created.push(el);
      return el;
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener(type, fn) { (docListeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { docListeners[type] = (docListeners[type] || []).filter((f) => f !== fn); },
    key(code) { for (const fn of [...(docListeners.keydown || [])]) fn({ code, key: code, preventDefault() {}, repeat: false, shiftKey: false }); },
  };
  class Img {
    constructor() {
      this.naturalWidth = 512;
      this.naturalHeight = 512;
      env.images = (env.images || 0) + 1;
    }
    set src(url) {
      this._src = url;
      // A stalled image never loads and never decodes.
      if (!stall(String(url))) clock.setTimeout(() => this.onload?.(), 5);
    }
    get src() { return this._src; }
    decode() { return stall(String(this._src)) ? new Promise(() => {}) : Promise.resolve(); }
  }
  const P = anything({
    Application: function Application() {
      const a = makeApp(env);
      env.apps.push(a);
      return a;
    },
    getMaxFragmentPrecision: () => "highp",
    getTestContext: () => null,
  });
  Object.assign(globalThis, {
    window: globalThis,
    document: env.document,
    PIXI: P,
    Image: Img,
    Path2D: class {},
    ImageData: class { constructor(w, h) { this.data = new Uint8ClampedArray(Math.max(0, w * h * 4)); } },
    ResizeObserver: class { observe() {} disconnect() {} },
    matchMedia: () => ({ matches: false }),
    getComputedStyle: () => ({ content: "none" }),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    devicePixelRatio: 1,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    requestAnimationFrame: clock.requestAnimationFrame,
    cancelAnimationFrame: clock.cancelAnimationFrame,
  });
  Object.defineProperty(globalThis, "performance", { value: { now: clock.now }, configurable: true, writable: true });
  env.shell = () => env.created.find((el) => /^r-game/.test(el.className));
  return env;
}

// Turns the clock until `promise` settles: images and timers a scene waits on only move when the clock does.
async function settle(env, promise, ms = 30000) {
  let done = false;
  promise.then(() => { done = true; }, () => { done = true; });
  for (let t = 0; t < ms && !done; t += 50) await env.clock.run(50, 50);
  assert.ok(done, "settled while the clock ran");
  return promise;
}

// Pieces of app.js: regexes are cut from it, strings go in as they are.
function source(text, pieces) {
  return pieces.map((re) => {
    if (typeof re === "string") return re;
    const m = text.match(re.re || re);
    assert.ok(m || re.optional, `has ${re.re || re}`);
    return m ? m[0] : "";
  }).join("\n");
}
const roomOf = (name) => app.match(new RegExp(`\\nconst \\w+ = \\(function ${name}\\(\\) \\{[\\s\\S]*?\\n\\}\\)\\(\\);\\n`))?.[0] || "";
// The start deadline and its wait, where app.js has them.
const deadline = () => source(app, [{ re: /\nconst START_MS = \d+;\n/, optional: true }, { re: /\nfunction within\(promise, ms\) \{[\s\S]*?\n\}\n/, optional: true }]);
const never = () => new Promise(() => {});

// A click on `el` whose target matches `selector`, the way a tap on that child of it lands.
const clickOn = (el, selector) => el.fire("click", { target: { closest: (s) => (s === selector ? {} : null), dataset: {} } });

test("the race leaves at once from its finish: × and Escape settle play() and hide the race while its save still lands", async () => {
  for (const how of ["close", "escape"]) {
    const env = installPage();
    const saves = [];
    const { createRace } = await import("../public/game/race.js");
    const race = await settle(env, createRace({ still: () => true, sfx() {}, buzz() {}, bonus: () => 0, finish: (rival, won) => new Promise((resolve) => saves.push({ rival, won, resolve })) }));
    if (race.open) await settle(env, race.open({}, "horse", null));
    let out = null;
    race.play("screen", {}, "horse", null).then((value) => { out = value; });
    await env.clock.run(1200, 50);
    const shell = env.shell();
    clickOn(shell.querySelector(".r-pick"), ".r-go");
    for (let i = 0; i < 600 && race.phase !== "finish"; i++) await env.clock.run(50, 50);
    assert.equal(race.phase, "finish", how);
    assert.equal(saves.length, 1, "the finish posts its save");
    if (how === "close") shell.querySelector(".r-close").fire("click");
    else env.document.key("Escape");
    await env.clock.run(400, 50);
    assert.equal(out, "quit", `${how} leaves the finish`);
    assert.equal(shell.hidden, true, how);
    // Left early, the save the finish sent still settles without the race in the way.
    saves[0].resolve({ ok: true, race: {}, xpGain: 10, xpLeft: 2 });
    await env.clock.run(100, 50);
    assert.deepEqual(env.errors, [], how);
  }
});

test("기 모으기 ends on its own when a frame throws at its result: play() settles once and the pet is back", async () => {
  const env = installPage();
  const win = element(env);
  const pet = element(env);
  for (const face of ["canon", "blink", "react"]) pet.querySelector(`[data-frame="${face}"]`).src = `/mascot-horse-${face}.png`;
  const logged = [];
  const error = console.error;
  console.error = (...args) => logged.push(args);
  try {
    const { createGimo } = await import("../public/game/gimo.js");
    const g = await settle(env, createGimo({ win, pet, say() {}, sfx() {}, buzz() {}, still: () => true, bonus: () => 0, drone: { start() {}, stop() {}, set() {} }, onLaunch: async () => ({ ok: true, best: 1, xpGain: 0, xpLeft: 0 }) }));
    if (g.open) await settle(env, g.open());
    const outs = [];
    g.play("screen", 0).then((value) => outs.push(value));
    for (let i = 0; i < 2000 && g.phase !== "result"; i++) await env.clock.run(50, 50);
    assert.equal(g.phase, "result");
    assert.equal(pet.style.visibility, "hidden", "the stage holds the pet while it plays");
    env.broken = true;
    await env.clock.run(2000, 50);
    assert.deepEqual(outs, ["aborted"]);
    assert.equal(pet.style.visibility, "", "the pet is back");
    assert.equal(logged.length, 1, "one console.error");
    assert.deepEqual(env.errors, []);
  } finally {
    console.error = error;
  }
});

// The farm room's open and 집으로 against a stub engine; `load` stands in for the engine's import.
function farmRoom(load) {
  const env = { apps: [], guard: (fn) => fn() };
  const clock = makeClock(env);
  const page = { said: [], held: false, log: [] };
  const root = { classList: classes(), dataset: {} };
  const button = element(env);
  const sandbox = {
    root, button, load,
    window: { setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, setInterval: () => 0, clearInterval() {} },
    document: { hidden: false, querySelector: () => null },
    care: { hold() { page.held = true; }, release() { page.held = false; }, fx: { say: (text) => page.said.push(text) } },
    combo: { end() {}, sink() {}, listen() {} },
    careHold: { asleep: false },
    petBusy: () => false,
    sheetOpen: null,
    talkHook: null,
    win: { addEventListener() {}, removeEventListener() {} },
    kit: () => "soft",
    playSfx() {}, buzz() {}, preload() {}, after() {}, flush() {}, setCookie() {}, paintDot() {}, restyle() {}, onScreen() {}, onMove() {}, onUp() {}, onPlushie() {},
    paintButton: (on) => page.log.push(`button ${on}`),
    broken: (error) => page.log.push(`broken ${error?.message}`),
    post: async () => ({ status: 200, reply: { ok: true, farm: {}, hearts: 0 } }),
  };
  runInNewContext(deadline() + source(roomOf("farmRoom"), [
    /const FAILED = "[^"]+";/,
    "const ASLEEP = 'asleep';",
    "const COOKIE_MS = 60000;",
    "let isOpen = false; let opening = false; let visit = null; let first = null; let game = null; let ready = null;",
    "let stale = false; let drag = null; let cookieTimer = 0; let dotTimer = 0;",
    "function prepare() { if (!game) { game = load(); game.then((g) => { ready = g; }, () => { game = null; }); } return game; }",
    /\n  function enter\(st, reply, how\) \{[\s\S]*?\n  \}\n/,
    /\n  function close\(\) \{[\s\S]*?\n  \}\n/,
    /\n  function openFailed\(\) \{[\s\S]*?\n  \}\n/,
    /\n  function open\(\) \{[\s\S]*?\n  \}\n/,
    "globalThis.open = open;",
    "globalThis.close = close;",
  ]), sandbox);
  return { page, root, button, clock, open: () => sandbox.open(), close: () => sandbox.close() };
}

test("집으로 gives the home back at once, even when the farm's slide-out never finishes", async () => {
  const farm = farmRoom(async () => ({ open: async () => {}, play: async () => {}, enter: async () => {}, exit: never, leave: never }));
  farm.open();
  await farm.clock.run(200, 50);
  assert.deepEqual([farm.root.classList.has("f-on"), farm.root.classList.has("f-layout"), farm.page.held], [true, true, true], "the farm is open");
  farm.close();
  await farm.clock.run(200, 50);
  assert.deepEqual([farm.root.classList.has("f-on"), farm.root.classList.has("f-layout"), farm.page.held], [false, false, false]);
});

test("a farm whose engine or art never loads gives 텃밭 back without ever taking the home", async () => {
  const cases = {
    engine: never,
    art: async () => ({ open: never, play: never, enter: never, exit() {}, leave: async () => {} }),
  };
  for (const [what, load] of Object.entries(cases)) {
    const farm = farmRoom(load);
    farm.open();
    assert.equal(farm.button.classList.has("is-loading"), true, what);
    for (let t = 0; t < 12000; t += 500) {
      await farm.clock.run(500, 100);
      assert.equal(farm.root.classList.has("f-on") || farm.page.held, false, `${what}: the home is never taken`);
    }
    assert.equal(farm.button.classList.has("is-loading"), false, `${what}: 텃밭 is back`);
    assert.equal(farm.page.said.length, 1, `${what}: and says why`);
  }
});

// A game room of app.js run whole on a stub page; `load` stands in for its engine's import.
function gameRoom(name, load) {
  const env = { apps: [], guard: (fn) => fn() };
  const clock = makeClock(env);
  const page = { said: [], held: false };
  const els = {};
  const document = {
    documentElement: element(env, "html"),
    hidden: false,
    querySelector: (sel) => (els[sel] ||= element(env)),
    querySelectorAll: () => [],
    addEventListener() {},
  };
  const dock = document.querySelector(".dock[data-care-uid]");
  const sheet = document.querySelector('[data-sheet="arcade"]');
  const start = sheet.querySelector(name === "raceRoom" ? '[data-game="race"]' : '[data-game="gi"]');
  const blurb = start.closest(".g-card").querySelector("small");
  blurb.textContent = "blurb";
  const sandbox = {
    document,
    window: { setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, addEventListener() {} },
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    navigator: {},
    care: { hold() { page.held = true; }, release() { page.held = false; }, fx: { say: (text) => page.said.push(text) } },
    combo: { end() {}, sink() {}, listen() {} },
    careHold: { asleep: false },
    petBusy: () => false,
    sheetOpen: sheet,
    closeSheet() { sandbox.sheetOpen = null; },
    openSheet() {},
    pet: element(env),
    NFC_WAIT_MS: 1500,
    audio: null,
    sfxOut() {},
    prefersReducedMotion: () => false,
    playSfx() {}, loadSfx() {}, tryVibrate() {}, paintLevel() {}, paintStats() {}, trainedPop() {},
    statBonus: () => 0,
    loadPixi: async () => {},
    load,
    fetch: never,
  };
  runInNewContext(deadline() + roomOf(name).replace(/\bimport\(/g, "load("), sandbox);
  const root = document.documentElement;
  return {
    page,
    root,
    start,
    blurb,
    clock,
    dimmed: () => ["g-on", "r-on"].some((c) => root.classList.has(c)) || page.held,
    open: () => dock.querySelector('[data-open="arcade"]').fire("click"),
    tap: () => start.fire("click"),
  };
}

test("시작 whose game never gets ready gives the button back with a retry line, and the home is never dimmed", async () => {
  for (const [name, make] of [["raceRoom", "createRace"], ["arcadeRoom", "createGimo"]]) {
    let opens = 0;
    let exits = 0;
    const stuck = { open: () => { opens += 1; return never(); }, play: never, exit() { exits += 1; }, tap() {}, pause() {}, dispose() {}, phase: "idle" };
    const cases = { engine: never, faces: async () => ({ [make]: async () => stuck }) };
    for (const [what, load] of Object.entries(cases)) {
      const room = gameRoom(name, load);
      const at = `${name}, ${what}`;
      room.open();
      await room.clock.run(100, 50);
      room.tap();
      assert.equal(room.start.disabled, true, at);
      for (let t = 0; t < 12000; t += 500) {
        await room.clock.run(500, 100);
        assert.equal(room.dimmed(), false, `${at}: the home is never taken`);
      }
      assert.deepEqual([room.start.disabled, room.start.textContent], [false, "시작"], `${at}: 시작 is back`);
      assert.notEqual(room.blurb.textContent, "blurb", `${at}: with a line to try again`);
      if (what === "faces") {
        assert.ok(exits >= 1, `${at}: the stage it was making goes`);
        room.tap();
        await room.clock.run(100, 50);
        assert.equal(opens, 2, `${at}: and a new tap tries again`);
      }
    }
  }
});

// How a scene's wait ends: "ready", "gave up", or a failed assert if it is still waiting after `ms` of its clock.
const outcome = (env, promise, ms = 20000) => settle(env, promise.then(() => "ready", () => "gave up"), ms);

test("a race whose own faces never arrive gives up within its deadline and takes its shell with it", async () => {
  const env = installPage({ stall: (url) => url.includes("mascot-horse-") });
  const { createRace } = await import("../public/game/race.js");
  assert.equal(await outcome(env, createRace({ still: () => true, sfx() {}, buzz() {}, bonus: () => 0, finish: never })), "gave up");
  assert.equal(env.shell().removed, true);
});

test("기 모으기 whose faces never arrive gives up within its deadline and leaves the pet where it was", async () => {
  const env = installPage({ stall: (url) => url.startsWith("/late-") });
  const win = element(env);
  const pet = element(env);
  for (const face of ["canon", "blink", "react"]) pet.querySelector(`[data-frame="${face}"]`).src = `/late-${face}.png`;
  const { createGimo } = await import("../public/game/gimo.js");
  const api = { win, pet, say() {}, sfx() {}, buzz() {}, still: () => true, bonus: () => 0, drone: { start() {}, stop() {}, set() {} }, onLaunch: never };
  const started = (async () => {
    const g = await createGimo(api);
    if (g.open) await g.open();
  })();
  assert.equal(await outcome(env, started), "gave up");
  assert.equal(pet.style.visibility || "", "");
  assert.ok(env.apps.every((a) => a.destroyed), "no stage is left");
});

test("a farm whose art never arrives gives up within its deadline", async () => {
  const env = installPage({ stall: (url) => url.includes("/game/art/farm/") });
  const pet = element(env);
  for (const face of ["canon", "blink", "react"]) pet.querySelector(`[data-frame="${face}"]`).src = `/mascot-horse-${face}.png`;
  const { createFarm } = await import("../public/game/farm.js");
  const api = { win: element(env), pet, size: () => ({ W: 384, H: 600 }), say() {}, sfx() {}, buzz() {}, still: () => true };
  assert.equal(await outcome(env, createFarm(api)), "gave up");
  assert.ok(env.apps.every((a) => a.destroyed), "no stage is left");
});

test("a race whose rival's art is late races an animal whose art is here", async () => {
  const env = installPage({ stall: (url) => url.includes("mascot-tiger-") });
  const saves = [];
  const { createRace } = await import("../public/game/race.js");
  const race = await settle(env, createRace({ still: () => true, sfx() {}, buzz() {}, bonus: () => 0, finish: (rival, won) => { saves.push(rival); return never(); } }));
  // The rival raced last was the tiger, whose faces never come.
  if (race.open) await settle(env, race.open({}, "horse", "tiger"));
  race.play("screen", {}, "horse", "tiger");
  await env.clock.run(1200, 50);
  clickOn(env.shell().querySelector(".r-pick"), ".r-go");
  for (let i = 0; i < 600 && !saves.length; i++) await env.clock.run(50, 50);
  assert.deepEqual(saves, ["sheep"]);
});

test("집으로 gives the pet back by hand: a page that has forgotten the farm's finished slide still shows the pet", async () => {
  const env = installPage();
  const pet = element(env);
  for (const face of ["canon", "blink", "react"]) pet.querySelector(`[data-frame="${face}"]`).src = `/mascot-horse-${face}.png`;
  const api = {
    win: element(env), pet, basket: element(env), uid: fakeUids[0],
    size: () => ({ W: 384, H: 600 }), coinBox: () => element(env), picking: () => false, still: () => false,
    say() {}, sfx() {}, buzz() {}, level() {}, hearts() {}, levelPop() {}, coins() {}, acted() {}, act: never,
    fail(error) { throw error; },
  };
  const { createFarm } = await import("../public/game/farm.js");
  const farm = await settle(env, createFarm(api));
  if (farm.open) await settle(env, farm.open());
  const r = { ...OPENED, created: false };
  await settle(env, farm.play ? farm.play(r, "open") : farm.enter(r, "open"));
  await env.clock.run(1000, 50);
  assert.ok(env.animations.some((a) => a.target === pet && a.options.fill === "forwards"), "the farm slid the pet away");
  // The collector has been: finished animations still show their last frame but are no longer listed.
  env.forget = true;
  if (farm.exit) farm.exit();
  else farm.leave();
  await env.clock.run(3000, 50);
  const holding = env.animations.filter((a) => a.target === pet && a.playState !== "idle" && a.options.fill === "forwards");
  assert.deepEqual(holding.map((a) => a.frames.at(-1)), []);
  assert.equal(pet.style.visibility, "");
});
