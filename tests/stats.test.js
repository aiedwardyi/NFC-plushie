import assert from "node:assert/strict";
import test from "node:test";
import { ANIMALS, EDITIONS, STAT_KEYS, STAT_NAMES, STAT_RULES, editionOf, parseStats, setBoost, statBonus, statSheet, train, useBoost } from "../src/stats.js";

const seoul = (s) => Date.parse(`${s}+09:00`);
const T0 = seoul("2026-05-01T10:00:00");
const totals = (sheet) => STAT_KEYS.map((k) => sheet[k].total);
const zeros = { str: 0, int: 0, agi: 0, cha: 0 };

test("stat keys keep 힘 지능 민첩 매력 order", () => {
  assert.deepEqual(STAT_KEYS, ["str", "int", "agi", "cha"]);
  assert.deepEqual(STAT_KEYS.map((k) => STAT_NAMES[k]), ["힘", "지능", "민첩", "매력"]);
  assert.deepEqual(STAT_RULES, { trainCap: 30, bonusCap: 15 });
});

test("every animal's stats sum to 14; 말 and 양 match the landing site", () => {
  assert.equal(Object.keys(ANIMALS).length, 12);
  for (const [kind, s] of Object.entries(ANIMALS)) assert.equal(s.reduce((a, b) => a + b, 0), 14, kind);
  const fresh = parseStats("");
  assert.deepEqual(totals(statSheet(fresh, "horse", "classic")), [50, 40, 70, 60]);
  assert.deepEqual(totals(statSheet(fresh, "sheep", "classic")), [50, 60, 40, 70]);
});

test("unknown animals read as 말, unknown editions as 클래식", () => {
  const fresh = parseStats("");
  assert.deepEqual(statSheet(fresh, "unicorn", "classic"), statSheet(fresh, "horse", "classic"));
  assert.deepEqual(statSheet(fresh, null, "shiny"), statSheet(fresh, "horse", "classic"));
  assert.deepEqual(statSheet(fresh, "__proto__", "__proto__"), statSheet(fresh, "horse", "classic"));
});

test("editions add to every stat; 레전더리 wins over 레어", () => {
  const lists = { rare: ["04AAAAAAAAAAA1", "04CCCCCCCCCCC3"], legendary: ["04BBBBBBBBBBB2", "04CCCCCCCCCCC3"] };
  assert.equal(editionOf("04BBBBBBBBBBB2", lists), "legendary");
  assert.equal(editionOf("04AAAAAAAAAAA1", lists), "rare");
  assert.equal(editionOf("04CCCCCCCCCCC3", lists), "legendary");
  assert.equal(editionOf("04DDDDDDDDDDD4", lists), "classic");
  assert.equal(editionOf("04AAAAAAAAAAA1"), "classic");
  assert.deepEqual(Object.values(EDITIONS).map((e) => [e.name, e.plus]), [["포근 클래식", 0], ["금실 레어", 10], ["별밤 레전더리", 20]]);
  assert.deepEqual(totals(statSheet(parseStats(""), "horse", "rare")), [60, 50, 80, 70]);
});

test("a legendary 말's 민첩 is 90 with a bonus of 8.3", () => {
  assert.deepEqual(statSheet(parseStats(""), "horse", "legendary").agi, { base: 70, plus: 20, trained: 0, boost: 0, total: 90, bonus: 8.3 });
});

test("the bonus starts above 40 and stops at 15", () => {
  assert.deepEqual([34, 40, 70, 130, 200].map(statBonus), [0, 0, 5, 15, 15]);
  assert.equal(statBonus(41), 0.2);
});

test("the sheet adds trained and boost to the total", () => {
  const stats = { ...parseStats(""), trained: { ...zeros, cha: 7 }, boost: { ...zeros, cha: 10 } };
  assert.deepEqual(statSheet(stats, "sheep", "rare").cha, { base: 70, plus: 10, trained: 7, boost: 10, total: 97, bonus: 9.5 });
});

test("training gives +1 once per Seoul day per stat", () => {
  const late = seoul("2026-05-01T23:59:00");
  const early = seoul("2026-05-02T00:01:00");
  assert.equal(new Date(late).getUTCDate(), new Date(early).getUTCDate());
  const one = train(parseStats(""), "agi", late);
  assert.deepEqual([one.gained, one.stats.trained.agi, one.stats.trainedDay.agi], [1, 1, "2026-05-01"]);
  const again = train(one.stats, "agi", late + 30 * 1000);
  assert.deepEqual([again.gained, again.stats.trained.agi], [0, 1]);
  const other = train(one.stats, "str", late);
  assert.deepEqual([other.gained, other.stats.trained.str, other.stats.trained.agi], [1, 1, 1]);
  const next = train(again.stats, "agi", early);
  assert.deepEqual([next.gained, next.stats.trained.agi, next.stats.trainedDay.agi], [1, 2, "2026-05-02"]);
});

test("training stops at 30", () => {
  let stats = parseStats("");
  for (let day = 0; day < 35; day++) stats = train(stats, "int", T0 + day * 24 * 3600000).stats;
  assert.equal(stats.trained.int, 30);
  const capped = train({ ...stats, trainedDay: { ...stats.trainedDay, int: null } }, "int", T0 + 40 * 24 * 3600000);
  assert.deepEqual([capped.gained, capped.stats.trained.int], [0, 30]);
});

test("one pending boost per stat, used once, never stacked", () => {
  const first = setBoost(parseStats(""), "agi", 10);
  assert.deepEqual([first.set, first.stats.boost.agi], [true, 10]);
  const second = setBoost(first.stats, "agi", 20);
  assert.deepEqual([second.set, second.stats.boost.agi], [false, 10]);
  const big = setBoost(first.stats, "str", 20);
  assert.deepEqual([big.set, big.stats.boost], [true, { ...zeros, str: 20, agi: 10 }]);
  const used = useBoost(second.stats, "agi");
  assert.deepEqual([used.used, used.stats.boost.agi], [10, 0]);
  assert.equal(useBoost(used.stats, "agi").used, 0);
  assert.equal(setBoost(parseStats(""), "int", 15).set, false);
});

test("stat helpers never change what they were given", () => {
  const stats = parseStats(JSON.stringify({ v: 1, trained: { str: 3 }, boost: { cha: 10 } }));
  const copy = structuredClone(stats);
  train(stats, "str", T0);
  setBoost(stats, "agi", 10);
  useBoost(stats, "cha");
  statSheet(stats, "horse", "rare");
  assert.deepEqual(stats, copy);
  assert.notEqual(train(stats, "str", T0).stats, stats);
  assert.notEqual(useBoost(stats, "agi").stats, stats);
});

test("bad or old stats read as zero", () => {
  const blank = { v: 1, trained: zeros, trainedDay: { str: null, int: null, agi: null, cha: null }, boost: zeros };
  for (const text of [null, undefined, "", "nope", "null", "42", "[]", '"x"', "{"]) assert.deepEqual(parseStats(text), blank, String(text));
  assert.equal(parseStats('{"v":1,"trained":{"str":99}}').trained.str, 30);
  const messy = parseStats(JSON.stringify({ v: 1, trained: { str: -4, int: "7", agi: 2.5, cha: 12 }, trainedDay: { str: "2026-05-01", int: 9, agi: "soon" }, boost: { str: 10, int: 20, agi: 15, cha: -10 } }));
  assert.deepEqual(messy, {
    v: 1,
    trained: { str: 0, int: 0, agi: 2, cha: 12 },
    trainedDay: { str: "2026-05-01", int: null, agi: null, cha: null },
    boost: { str: 10, int: 20, agi: 0, cha: 0 },
  });
  const round = parseStats(JSON.stringify(messy));
  assert.deepEqual(round, messy);
});
