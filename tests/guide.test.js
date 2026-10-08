import assert from "node:assert/strict";
import test from "node:test";
import { FARM_STEPS, HOME_STEPS, careVerb, cropPhase, finishStep, guideKey, nextStep, readGuide, skipGuide, startGuide } from "../public/guide-model.js";

const A = "04AAAAAAAAAAA1";

function walk(guide, steps, opts) {
  const seen = [];
  for (let step = nextStep(guide, steps, opts); step; step = nextStep(guide, steps, opts)) {
    seen.push(step);
    guide = finishStep(guide, step);
  }
  return seen;
}

test("the home tour runs care, pet, talk, farm, 오락실, the race and the goodbye; the farm tour ends at 집으로", () => {
  assert.deepEqual(HOME_STEPS, ["care", "pet", "talk", "farm", "arcade", "race", "sleep", "bye"]);
  assert.deepEqual(FARM_STEPS, ["crop", "send", "shop", "farm-bye", "farm-home"]);
  const fresh = startGuide(null, { named: true });
  assert.deepEqual(walk(fresh, HOME_STEPS), ["care", "pet", "talk", "farm", "arcade", "race", "bye"]);
  assert.deepEqual(walk(fresh, FARM_STEPS), FARM_STEPS);
});

test("at night the tour feeds the pet first and puts it to bed before the goodbye", () => {
  assert.equal(careVerb("sleep"), "feed");
  const fresh = startGuide(null, { named: true });
  assert.deepEqual(walk(fresh, HOME_STEPS, { night: true }), ["care", "pet", "talk", "farm", "arcade", "race", "sleep", "bye"]);
  const late = ["care", "pet", "talk", "farm", "arcade", "race"].reduce(finishStep, fresh);
  assert.equal(nextStep(late, HOME_STEPS, { night: true }), "sleep");
  assert.equal(nextStep(late, HOME_STEPS), "bye");
  assert.equal(nextStep(finishStep(late, "bye"), HOME_STEPS, { night: true }), null);
});

test("the first pick waits out a short grow with the pet, skips past a long one or a full basket", () => {
  const MIN = 60 * 1000;
  assert.equal(cropPhase({ ripe: true, basket: false, wait: Infinity }), "pick");
  assert.equal(cropPhase({ ripe: true, basket: true, wait: 0 }), "pick");
  assert.equal(cropPhase({ ripe: false, basket: false, wait: 45 * 1000 }), "wait");
  assert.equal(cropPhase({ ripe: false, basket: false, wait: 3 * MIN }), "wait");
  assert.equal(cropPhase({ ripe: false, basket: true, wait: 45 * 1000 }), "skip");
  assert.equal(cropPhase({ ripe: false, basket: false, wait: 30 * MIN }), "skip");
  assert.equal(cropPhase({ ripe: false, basket: false, wait: Infinity }), "skip");
});

test("a pet without the mic skips the talk step", () => {
  const guide = ["care", "pet"].reduce(finishStep, startGuide(null, { named: true }));
  assert.equal(nextStep(guide, HOME_STEPS, { talk: false }), "farm");
  assert.equal(nextStep(guide, HOME_STEPS), "talk");
  assert.deepEqual(walk(startGuide(null, { named: true }), HOME_STEPS, { talk: false }), ["care", "pet", "farm", "arcade", "race", "bye"]);
});

test("leaving mid-guide resumes each tour until the home's goodbye", () => {
  let guide = ["care", "pet", "crop"].reduce(finishStep, startGuide(null, { named: true }));
  const raw = JSON.stringify(guide);
  guide = startGuide(raw);
  assert.equal(nextStep(guide, HOME_STEPS), "talk");
  assert.equal(nextStep(guide, FARM_STEPS), "send");
  assert.equal(finishStep(guide, "care"), guide);
  guide = ["talk", "farm", "arcade", "race", "bye"].reduce(finishStep, guide);
  assert.equal(nextStep(guide, HOME_STEPS), null);
  assert.equal(nextStep(guide, FARM_STEPS), null);
});

test("the home goodbye ends leftover farm steps on later visits and reloads", () => {
  const home = HOME_STEPS.filter((step) => step !== "bye");
  for (let n = 0; n <= FARM_STEPS.length; n++) {
    const guide = [...home, ...FARM_STEPS.slice(0, n)].reduce(finishStep, startGuide(null, { named: true }));
    const done = finishStep(guide, "bye");
    for (const saved of [done, startGuide(JSON.stringify(done))]) {
      assert.equal(nextStep(saved, HOME_STEPS), null, `home after ${n} farm steps`);
      assert.equal(nextStep(saved, FARM_STEPS), null, `farm after ${n} farm steps`);
    }
  }
});

test("only the named page starts a guide; any other page only resumes one", () => {
  assert.equal(startGuide(null), null);
  assert.equal(startGuide("", { named: false }), null);
  assert.deepEqual(startGuide(null, { named: true }), { done: [], skipped: false });
  const saved = JSON.stringify(finishStep(startGuide(null, { named: true }), "care"));
  assert.deepEqual(startGuide(saved, { named: true }), { done: ["care"], skipped: false });
});

test("skip ends both tours for good", () => {
  const guide = startGuide(JSON.stringify(skipGuide(finishStep(startGuide(null, { named: true }), "care"))), { named: true });
  assert.equal(guide.skipped, true);
  assert.equal(nextStep(guide, HOME_STEPS), null);
  assert.equal(nextStep(guide, FARM_STEPS), null);
});

test("a damaged record reads as none or as its known steps, never as finished", () => {
  for (const raw of ["{bad", "null", "[]", "7", '"care"']) assert.equal(readGuide(raw), null, raw);
  assert.deepEqual(readGuide('{"done":["care","bogus","care",3],"skipped":"yes"}'), { done: ["care"], skipped: false });
  assert.deepEqual(readGuide('{"done":"care"}'), { done: [], skipped: false });
  assert.equal(nextStep(readGuide('{"done":"care"}'), HOME_STEPS), "care");
});

test("the record is kept per pet and per meet", () => {
  const one = guideKey(A, "2026-05-01T01:00:00.000Z");
  assert.notEqual(one, guideKey(A, "2026-05-01T01:05:00.000Z"));
  assert.notEqual(one, guideKey("04BBBBBBBBBBB2", "2026-05-01T01:00:00.000Z"));
  assert.equal(one, guideKey(A, "2026-05-01T01:00:00.000Z"));
});

test("the care step points at the verb the pet wants, else 밥", () => {
  assert.deepEqual(["feed", "play", "sleep", "", undefined, null, "dance"].map(careVerb), ["feed", "play", "feed", "feed", "feed", "feed", "feed"]);
});
