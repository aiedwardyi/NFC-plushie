import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const settled = () => new Promise((resolve) => setImmediate(resolve));

// The care block on a stub page that has lost every finished animation to the collector: each still shows its last frame, but getAnimations() no longer lists it.
function carePage() {
  const block = app.match(/\nconst care = \(function careLoop\(\) \{[\s\S]*?\n\}\)\(\);\n/)?.[0];
  assert.ok(block, "the care block is in app.js");
  const animations = [];
  const element = (over = {}) => {
    const el = {
      dataset: {},
      style: { setProperty() {} },
      innerHTML: "",
      textContent: "",
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      setAttribute() {},
      addEventListener(type, fn) { el.listener = fn; },
      append() {},
      appendChild() {},
      insertBefore() {},
      replaceChildren() {},
      remove() {},
      querySelector: () => null,
      querySelectorAll: () => [],
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 120, height: 120 }),
      animate(frames, options) {
        const a = { target: el, frames, options, playState: "running", finished: Promise.resolve(), cancel() { a.playState = "idle"; } };
        animations.push(a);
        return a;
      },
      getAnimations: () => [],
      ...over,
    };
    return el;
  };
  const motion = element();
  const pet = element({ querySelector: (sel) => (sel === ".pet-motion" ? motion : null) });
  const dock = element({ dataset: { want: "", meals: "0", plays: "0" }, querySelector: () => element() });
  const win = element();
  const intro = element();
  const careHold = { busy: false, asleep: false, touch: null };
  const deps = {
    TAP_SPOT: "top",
    careHold,
    cry() {},
    dialogBox: element({ querySelector: () => intro }),
    document: { documentElement: element(), querySelector: (sel) => ({ ".dock[data-want]": dock, "[data-window]": win })[sel] || null, createElement: () => element() },
    facePet() {},
    floatHearts() {},
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    lineReady: false,
    lineTimer: 0,
    navigator: {},
    performance: { now: () => 0 },
    pet,
    playSfx() {},
    prefersReducedMotion: () => false,
    revealEdition() {},
    sayToken: 0,
    talkHook: null,
    tryVibrate() {},
    waking: false,
    window: { setTimeout: (fn) => setImmediate(fn), clearTimeout() {}, setInterval: () => 0, clearInterval() {}, addEventListener() {} },
  };
  const care = new Function(...Object.keys(deps), `${block}\nreturn care;`)(...Object.values(deps));
  return {
    care,
    motion,
    press: (id) => dock.listener({ target: { closest: () => ({ dataset: { care: id } }) } }),
    idle: async () => {
      for (let i = 0; careHold.busy && i < 10000; i += 1) await settled();
    },
    posed: () => animations.filter((a) => a.target === pet || a.target === motion).length,
    // The poses still drawn on the pet or its motion wrapper, by their last frame.
    held: () => animations.filter((a) => (a.target === pet || a.target === motion) && a.playState !== "idle" && a.options.fill === "forwards").map((a) => a.frames.at(-1)),
  };
}

test("a care pose is cancelled by hand when the pet is handed back, though the page no longer lists it", async () => {
  const { care, motion, held } = carePage();
  care.hold();
  await care.fx.move(motion, [{ transform: "scale(1)" }, { transform: "scale(1.1)" }], { duration: 100 });
  assert.equal(held().length, 1);
  care.release();
  assert.deepEqual(held(), []);
});

test("밥, 놀이 and the talk dance leave no pose drawn on the pet once they end", async () => {
  const { care, press, idle, posed, held } = carePage();
  for (const id of ["feed", "play"]) {
    const before = posed();
    press(id);
    await idle();
    assert.ok(posed() > before + 3, `${id} posed`);
    assert.deepEqual(held(), [], id);
  }
  const before = posed();
  await care.dance();
  assert.ok(posed() > before + 10, "dance posed");
  assert.deepEqual(held(), [], "dance");
});
