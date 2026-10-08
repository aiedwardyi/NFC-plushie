import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const read = (path) => readFileSync(new URL(`../public/${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("farm XP floats upward and fades without querying the days pill", async () => {
  const source = read("game/farm.js").match(/async function xpFlight\(r\) \{[\s\S]*?\n  \}/)[0];
  const el = { style: {}, remove() {} };
  let frames;
  let text;
  await runInNewContext(`(${source})({ xpGain: 40 })`, {
    win: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    fitted: { x: 0, y: 0, s: 1 }, W: 300, H: 400, calm: false,
    document: { body: {}, querySelector() { assert.fail("XP must not query a destination"); } },
    domAdd: (_, value) => { text = value; return el; },
    domAnim: (_, value) => { frames = value; }, hold: async () => {},
    game() {}, flushRound() {}, api: { levelPop() {} },
  });
  assert.equal(text, "+40 XP");
  assert.equal(frames.at(-1).opacity, 0);
  assert.match(frames.at(-1).transform, /translate\(-50%, -\d+px\)/);
});

test("level pop animates only the level badge", () => {
  const source = read("app.js").match(/    levelPop\(\) \{[\s\S]*?\n    \}/)[0];
  let selector;
  runInNewContext(`({${source}}).levelPop()`, {
    prefersReducedMotion: () => false,
    document: { querySelectorAll: (value) => { selector = value; return []; } },
  });
  assert.equal(selector, ".level-badge");
});

test("coach controls hide only while a step is visible without moving the topbar", () => {
  const css = read("style.css");
  const rule = css.match(/html\.has-coach \.topbar :is\(\.theme-btn, \.level-pin\) \{([^}]+)\}/);
  assert.ok(rule);
  assert.match(rule[1], /visibility: hidden/);
  assert.match(rule[1], /opacity: 0/);
  assert.match(rule[1], /pointer-events: none/);
  assert.doesNotMatch(rule[1], /display:|position:|height:|width:/);
  const source = read("app.js").match(/const coach = \(function coachLayer\(\) \{[\s\S]*?\n\}\)\(\);/)[0];
  const listOf = (classes) => ({
    add: (...names) => names.forEach((name) => classes.add(name)),
    remove: (...names) => names.forEach((name) => classes.delete(name)),
    contains: (name) => classes.has(name),
    toggle: (name, on) => on ? classes.add(name) : classes.delete(name),
  });
  const classes = new Set();
  const coach = runInNewContext(`${source}; coach`, {
    document: {
      documentElement: { dataset: {}, classList: listOf(classes) },
      createElement: () => ({ classList: listOf(new Set()), setAttribute() {}, addEventListener() {}, append() {} }),
      body: { append() {} },
    },
    window: { requestAnimationFrame: () => 1, cancelAnimationFrame() {} },
    performance: { now: () => 0 },
  });
  for (const soft of [false, true]) {
    coach.show(() => null, { soft });
    assert.equal(classes.has("has-coach"), true);
    coach.hide();
    assert.equal(classes.has("has-coach"), false);
    assert.equal(classes.has("coach-soft"), false);
  }
});
