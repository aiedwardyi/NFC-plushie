import assert from "node:assert/strict";
import test from "node:test";
import { ARCADE, applyPlay, arcadeToday, xpPlaysLeft } from "../src/arcade.js";

const T0 = Date.parse("2026-05-01T10:00:00+09:00");
const fresh = () => ({ arcadeDay: null, arcadePlays: 0, giBest: 0 });
const after = (s, out) => ({ ...s, arcadeDay: out.arcadeDay, arcadePlays: out.arcadePlays, giBest: out.best });

test("the first 3 plays of a Seoul day give XP, the rest are for fun", () => {
  let s = fresh();
  const gains = [];
  for (let i = 0; i < 5; i++) {
    const out = applyPlay(s, 1000, T0 + i * 60000);
    gains.push(out.xpGain);
    s = after(s, out);
  }
  assert.deepEqual(gains, [5, 5, 5, 0, 0]);
  assert.equal(xpPlaysLeft(s, T0), 0);
});

test("plays reset at Seoul midnight, not at UTC midnight", () => {
  const night = Date.parse("2026-05-01T23:59:00+09:00");
  let s = fresh();
  for (let i = 0; i < 3; i++) s = after(s, applyPlay(s, 100, night));
  assert.equal(xpPlaysLeft(s, night), 0);
  assert.equal(xpPlaysLeft(s, night + 2 * 60000), ARCADE.xpPlays);
  assert.equal(applyPlay(s, 100, night + 2 * 60000).xpGain, ARCADE.xpPerPlay);
  const morning = Date.parse("2026-05-02T08:58:00+09:00");
  s = fresh();
  for (let i = 0; i < 3; i++) s = after(s, applyPlay(s, 100, morning));
  assert.equal(xpPlaysLeft(s, morning + 4 * 60000), 0);
});

test("the best height only moves up", () => {
  const s = { ...fresh(), giBest: 7420 };
  assert.deepEqual([applyPlay(s, 9000, T0).best, applyPlay(s, 9000, T0).isBest], [9000, true]);
  assert.deepEqual([applyPlay(s, 7420, T0).best, applyPlay(s, 7420, T0).isBest], [7420, false]);
  assert.deepEqual([applyPlay(s, 0, T0).best, applyPlay(s, 0, T0).isBest], [7420, false]);
});

test("a day with no plays reads as 0", () => {
  assert.equal(arcadeToday(fresh(), T0), 0);
  assert.equal(arcadeToday({ arcadeDay: "2026-04-30", arcadePlays: 3, giBest: 0 }, T0), 0);
  assert.equal(xpPlaysLeft({ arcadeDay: "2026-05-01", arcadePlays: 2, giBest: 0 }, T0), 1);
});
