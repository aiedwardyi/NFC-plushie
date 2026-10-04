import assert from "node:assert/strict";
import test from "node:test";
import { applyCare, careWant, mealsNow, playsNow, seoulHour } from "../src/care.js";

const HOUR = 3600000;
const T0 = Date.parse("2026-05-01T10:00:00+09:00");
const care = (over = {}) => ({ moodValue: 50, moodUpdatedAt: T0, fedAt: null, meals: 0, playedAt: null, plays: 0, sleptAt: null, ...over });

test("want: feed, then play, then nothing until the window ends", () => {
  assert.equal(careWant(care(), T0), "feed");
  assert.equal(careWant(care({ fedAt: T0 }), T0 + HOUR), "play");
  assert.equal(careWant(care({ fedAt: T0, playedAt: T0 }), T0 + HOUR), null);
  assert.equal(careWant(care({ fedAt: T0, playedAt: T0 + HOUR }), T0 + 4 * HOUR), "feed");
});

test("want: sleep at night in Seoul, nothing while asleep", () => {
  const night = Date.parse("2026-05-01T22:00:00+09:00");
  assert.equal(careWant(care({ fedAt: night, playedAt: night }), night), "sleep");
  assert.equal(careWant(care(), Date.parse("2026-05-02T04:59:00+09:00")), "sleep");
  assert.equal(careWant(care(), Date.parse("2026-05-02T05:00:00+09:00")), "feed");
  assert.equal(careWant(care(), Date.parse("2026-05-01T21:59:00+09:00")), "feed");
  assert.equal(careWant(care({ sleptAt: night }), night + HOUR), null);
});

test("feed: full, nibble, then a stash that writes nothing", () => {
  const one = applyCare(care(), "feed", T0);
  assert.deepEqual([one.beat, one.gain, one.moodAfter, one.care.meals, one.care.fedAt], ["full", 20, 70, 1, T0]);
  const two = applyCare(care({ ...one.care, moodValue: 70 }), "feed", T0);
  assert.deepEqual([two.beat, two.gain, two.moodAfter, two.care.meals], ["nibble", 10, 80, 2]);
  const three = applyCare(care({ ...two.care, moodValue: 80 }), "feed", T0);
  assert.deepEqual([three.beat, three.gain, three.moodAfter], ["stash", 0, 80]);
  assert.deepEqual(three.care, two.care);
});

test("feed: the meal count resets once the window passes", () => {
  const s = care({ fedAt: T0, meals: 2 });
  assert.equal(mealsNow(s, T0 + 4 * HOUR - 1), 2);
  assert.equal(applyCare(s, "feed", T0 + 4 * HOUR - 1).beat, "stash");
  assert.equal(applyCare(s, "feed", T0 + 4 * HOUR).beat, "full");
});

test("play: always the full play, hearts 20 then 10 then 0", () => {
  let s = care();
  const gains = [];
  for (let i = 0; i < 3; i++) {
    const out = applyCare(s, "play", T0 + i * 60000);
    assert.equal(out.beat, "play");
    gains.push(out.gain);
    s = { ...s, ...out.care };
  }
  assert.deepEqual(gains, [20, 10, 0]);
  assert.equal(applyCare(s, "play", T0 + 2 * 60000 + 4 * HOUR).gain, 20);
});

test("play: the play count resets once the window passes", () => {
  const s = care({ playedAt: T0, plays: 3 });
  assert.equal(playsNow(s, T0 + 4 * HOUR - 1), 3);
  assert.equal(playsNow(s, T0 + 4 * HOUR), 0);
  assert.equal(playsNow(care(), T0), 0);
});

test("mood caps at 100 and decays before the gain", () => {
  assert.equal(applyCare(care({ moodValue: 95 }), "feed", T0).moodAfter, 100);
  assert.equal(applyCare(care({ moodValue: 50 }), "feed", T0 + 8 * HOUR).moodAfter, 60);
});

test("sleep: lights out once, then every press mumbles and writes nothing", () => {
  const out = applyCare(care(), "sleep", T0);
  assert.deepEqual([out.beat, out.gain, out.care.sleptAt], ["sleep", 10, T0]);
  for (const act of ["feed", "play", "sleep"]) {
    const m = applyCare(care({ sleptAt: T0 }), act, T0 + 1000);
    assert.deepEqual([m.beat, m.gain], ["mumble", 0]);
    assert.deepEqual(m.care, { fedAt: null, meals: 0, playedAt: null, plays: 0, sleptAt: T0 });
  }
});

test("seoulHour reads Seoul wall time", () => {
  assert.equal(seoulHour(Date.parse("2026-05-01T13:30:00Z")), 22);
});
