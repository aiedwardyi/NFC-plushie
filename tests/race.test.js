import assert from "node:assert/strict";
import test from "node:test";
import { applyRace, raceState } from "../src/arcade.js";
import { newRace, raceTap, stepRace } from "../public/game/race-model.js";
import { KIND_IDS } from "../public/kinds.js";

const T0 = Date.parse("2026-05-01T10:00:00+09:00");
const state = { arcadeDay: null, arcadePlays: 0, giBest: 5000 };

test("race state survives missing and malformed old rows", () => {
  const fresh = Object.fromEntries(KIND_IDS.map((k) => [k, { level: 1, best: 0 }]));
  for (const text of [null, "", "bad", "null", "[]", "{}"] ) assert.deepEqual(raceState(text), fresh);
  assert.deepEqual(raceState('{"horse":{"best":50},"sheep":{"best":-2},"tiger":{"best":3},"unicorn":{"best":4}}'), { ...fresh, horse: { level: 20, best: 20 }, tiger: { level: 4, best: 3 } });
});

test("wins advance only that rival, losses keep the record, level 20 caps", () => {
  let race = raceState(null);
  const loss = applyRace(state, race, "sheep", false, T0);
  assert.deepEqual(loss.race, race);
  for (let i = 1; i <= 24; i++) {
    const out = applyRace(state, race, "sheep", true, T0);
    race = out.race;
    assert.deepEqual(race.sheep, { level: Math.min(20, i + 1), best: Math.min(20, i) });
    assert.equal(out.best, 5000);
  }
  assert.deepEqual(race.horse, { level: 1, best: 0 });
});

test("a zero step mid-race leaves the race running", () => {
  const race = newRace(1);
  for (let i = 0; i < 240; i++) stepRace(race, 1 / 240);
  const at = [...race.distance];
  assert.equal(stepRace(race, 0), false);
  assert.deepEqual(race.distance, at);
  while (race.finish.some((t) => t === null) && race.time < 40) stepRace(race, 1 / 60);
  assert.ok(race.finish.every(Number.isFinite));
});

function simulate(rate, level, dashes = [], agi = 0) {
  const race = newRace(level, agi);
  let tap = 0;
  let dash = 0;
  while (race.time < 40 && race.finish.some((t) => t === null)) {
    if (rate && race.time + 1e-8 >= tap / rate) { raceTap(race, "screen"); tap++; }
    if (dash < dashes.length && race.time >= dashes[dash]) { raceTap(race, "nfc"); dash++; }
    stepRace(race, 1 / 240);
  }
  return race;
}

test("casual screen taps beat level 1 and every level is screen-beatable", () => {
  const casual = simulate(4, 1);
  assert.ok(casual.finish[0] < casual.finish[1]);
  assert.ok(casual.finish[0] >= 12 && casual.finish[0] <= 16);
  for (let level = 1; level <= 20; level++) {
    const fast = simulate(11, level);
    assert.ok(fast.finish[0] < fast.finish[1], `Lv.${level}`);
  }
  const fast = simulate(8, 20);
  const boosted = simulate(8, 20, [1, 2.5, 4, 5.5]);
  assert.ok(fast.finish[0] > fast.finish[1]);
  assert.ok(boosted.finish[0] < boosted.finish[1]);
});

test("level 1 still asks for some tapping and level 20 wants dashes or very fast thumbs", () => {
  assert.ok(simulate(3, 1).finish[0] > simulate(3, 1).finish[1]);
  const dashes = [1.5, 3.5, 5.5, 7.5];
  assert.ok(simulate(7, 20).finish[0] > simulate(7, 20).finish[1]);
  assert.ok(simulate(7, 20, dashes).finish[0] < simulate(7, 20, dashes).finish[1]);
  assert.ok(simulate(10, 20).finish[0] < simulate(10, 20).finish[1]);
});

test("the first crossing decides both times and later taps change nothing", () => {
  const r = newRace(1);
  while (!stepRace(r, 1 / 60)) raceTap(r, "screen");
  const done = [...r.finish];
  assert.ok(done.every((t) => t > 0));
  assert.equal(raceTap(r, "screen"), false);
  assert.equal(raceTap(r, "nfc"), false);
  stepRace(r, 1);
  assert.deepEqual(r.finish, done);
});

test("slowed-down taps pay the same per second of race", () => {
  const run = (scale) => {
    const r = newRace(1);
    let next = 0;
    for (let real = 0; r.time < 3; real += 1 / 240) {
      if (real >= next) { raceTap(r, "screen", scale); next += 1 / 6; }
      stepRace(r, scale / 240);
    }
    return r.distance[0];
  };
  assert.ok(Math.abs(run(1) - run(0.2)) < 0.5);
});

test("민첩 lifts only the pet's top speed, and slow motion still pays the same", () => {
  const plain = simulate(6, 5);
  const quick = simulate(6, 5, [], 8.3);
  assert.ok(quick.finish[0] < plain.finish[0]);
  assert.deepEqual([quick.goal, quick.rival], [plain.goal, plain.rival]);
  const [a, b] = [newRace(1), newRace(1, 15)];
  for (const r of [a, b]) {
    raceTap(r, "screen");
    stepRace(r, 0.5);
  }
  assert.ok(Math.abs(b.speed[0] / a.speed[0] - 1.15) < 1e-9);
  assert.equal(newRace(1).agi, 0);
  const run = (scale) => {
    const r = newRace(1, 10);
    let next = 0;
    for (let real = 0; r.time < 3; real += 1 / 240) {
      if (real >= next) { raceTap(r, "screen", scale); next += 1 / 6; }
      stepRace(r, scale / 240);
    }
    return r.distance[0];
  };
  assert.ok(Math.abs(run(1) - run(0.2)) < 0.5);
});

test("NFC guard rejects duplicate reads and later reads extend a dash", () => {
  const r = newRace(1);
  assert.equal(raceTap(r, "nfc"), true);
  const end = r.boost;
  assert.equal(raceTap(r, "nfc"), false);
  stepRace(r, 0.26);
  assert.equal(raceTap(r, "nfc"), true);
  assert.equal(r.boost, end + 1.2);
});

test("idle players finish a loss and frame rates do not change rival time", () => {
  const idle = simulate(0, 1);
  assert.ok(idle.finish[0] > idle.finish[1]);
  const r = newRace(1);
  while (!stepRace(r, 1 / 30)) {}
  assert.ok(Math.abs(r.finish[1] - idle.finish[1]) < 1e-9);
});
