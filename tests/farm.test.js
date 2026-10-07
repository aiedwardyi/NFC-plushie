import assert from "node:assert/strict";
import test from "node:test";
import { FARM, addGiftSeeds, addSeeds, createFarm, etaWords, farmDot, farmView, giftSeeds, harvestFarm, isRipe, nextRipeAt, openFarm, parseFarm, pickPlot, plotsFor, ripeAt, ripenFarm } from "../src/farm.js";
import { xpForLevel } from "../src/pet.js";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const seoul = (s) => Date.parse(`${s}+09:00`);
const T0 = seoul("2026-05-01T10:00:00");
const plant = (crop, at, quick = false) => ({ crop, at, quick });
const crops = (farm) => farm.plots.map((p) => p && p.crop);
const blank = (over = {}) => ({ v: 2, plots: Array(6).fill(null), bag: [], tasted: Object.keys(FARM.crops), unlockedTo: 1, arrived: [], harvested: 0, golden: 0, pantry: [], coins: 0, day: { key: null, feeds: 0, sent: 0 }, ...over });
const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };

test("plots open 4, then 5, then 6 by level", () => {
  assert.deepEqual([1, 2, 3, 4, 20].map(plotsFor), [4, 5, 6, 6, 6]);
});

test("a night ends at Seoul midnight", () => {
  const late = plant("potato", seoul("2026-05-01T23:59:00"));
  assert.equal(ripeAt(late), seoul("2026-05-02T00:00:00"));
  assert.equal(isRipe(late, seoul("2026-05-01T23:59:59.999")), false);
  assert.equal(isRipe(late, seoul("2026-05-02T00:00:00")), true);
  const early = plant("potato", seoul("2026-05-02T00:00:01"));
  assert.equal(ripeAt(early), seoul("2026-05-03T00:00:00"));
  assert.equal(isRipe(early, seoul("2026-05-02T23:59:59")), false);
  assert.equal(ripeAt(plant("sweet", T0)), seoul("2026-05-04T00:00:00"));
  assert.equal(ripeAt(plant("gold", T0)), seoul("2026-05-08T00:00:00"));
  assert.equal(ripeAt(plant("potato", Date.parse("2026-05-01T15:30:00Z"))), seoul("2026-05-03T00:00:00"));
});

test("timed waits are exact milliseconds from planting", () => {
  assert.equal(ripeAt(plant("lettuce", T0)), T0 + 6 * HOUR);
  assert.equal(ripeAt(plant("sprout", T0, true)), T0 + MIN);
  assert.equal(ripeAt(plant("lettuce", T0, true)), T0 + 5 * MIN);
  assert.equal(ripeAt(plant("potato", T0, true)), T0 + 30 * MIN);
  assert.equal(ripeAt(plant("melon", T0, true)), T0 + HOUR);
  const night = plant("lettuce", seoul("2026-05-01T22:00:00"));
  assert.equal(ripeAt(night), seoul("2026-05-02T04:00:00"));
  assert.equal(isRipe(night, seoul("2026-05-02T00:00:00")), false);
});

test("night crops count nights and timed crops count the clock", () => {
  const late = plant("potato", seoul("2026-05-01T23:50:00"));
  assert.deepEqual(etaWords(late, seoul("2026-05-01T23:55:00")), { clock: "night", eta: "내일", left: "내일 익어요" });
  const sweet = plant("sweet", T0);
  assert.deepEqual(etaWords(sweet, T0), { clock: "night", eta: "3밤 뒤", left: "3밤 남았어요" });
  assert.deepEqual(etaWords(sweet, seoul("2026-05-02T00:00:00")), { clock: "night", eta: "2밤 뒤", left: "2밤 남았어요" });
  assert.deepEqual(etaWords(sweet, seoul("2026-05-03T23:59:00")), { clock: "night", eta: "내일", left: "내일 익어요" });
  assert.deepEqual(etaWords(plant("potato", T0, true), T0), { clock: "timed", eta: "30분 뒤", left: "30분 남았어요" });
  assert.deepEqual(etaWords(plant("potato", T0, true), T0 + 29 * MIN + 1000), { clock: "timed", eta: "1분 뒤", left: "1분 남았어요" });
  assert.deepEqual(etaWords(plant("sweet", T0, true), T0), { clock: "timed", eta: "1시간 뒤", left: "1시간 남았어요" });
  assert.deepEqual(etaWords(plant("lettuce", T0), T0), { clock: "timed", eta: "6시간 뒤", left: "6시간 남았어요" });
  assert.deepEqual(etaWords(plant("lettuce", T0), T0 + 4 * HOUR + 30 * MIN), { clock: "timed", eta: "2시간 뒤", left: "2시간 남았어요" });
  const evening = plant("lettuce", seoul("2026-05-01T22:00:00"));
  assert.deepEqual(etaWords(evening, seoul("2026-05-01T23:59:00")), { clock: "timed", eta: "5시간 뒤", left: "5시간 남았어요" });
  assert.deepEqual(etaWords(plant("potato", T0, true), T0 + 30 * MIN), { clock: "timed", eta: "", left: "" });
});

test("the starter packet plants 4 plots and keeps a spare 감자", () => {
  const farm = createFarm(T0);
  assert.deepEqual(crops(farm), ["sprout", "lettuce", "potato", "gold", null, null]);
  assert.deepEqual(farm.plots.map((p) => p && p.quick), [true, true, true, false, null, null]);
  assert.deepEqual(farm.bag, ["potato"]);
  assert.deepEqual([...farm.tasted].sort(), ["gold", "lettuce", "potato", "sprout"]);
  assert.deepEqual([farm.unlockedTo, farm.harvested, farm.golden, farm.arrived], [1, 0, 0, []]);
});

test("the first open creates the farm once", () => {
  const first = openFarm(null, 0, T0);
  assert.equal(first.created, true);
  assert.deepEqual(first.planted, [
    { plot: 0, crop: "sprout", quick: true },
    { plot: 1, crop: "lettuce", quick: true },
    { plot: 2, crop: "potato", quick: true },
    { plot: 3, crop: "gold", quick: false },
  ]);
  const again = openFarm(first.farm, 0, T0 + MIN);
  assert.equal(again.created, false);
  assert.deepEqual([again.planted, again.picked, again.xpGain], [[], [], 0]);
  assert.deepEqual(again.farm, first.farm);
});

test("맛보기 happens once per crop, marked at planting", () => {
  let farm = openFarm(null, 0, T0).farm;
  const sprout = pickPlot(farm, 0, T0 + MIN, 0);
  assert.deepEqual(sprout.picked, [{ plot: 0, crop: "sprout", xp: 40, quick: true }]);
  assert.deepEqual(sprout.planted, [{ plot: 0, crop: "potato", quick: false }]);
  assert.equal(ripeAt(sprout.farm.plots[0]), seoul("2026-05-02T00:00:00"));
  assert.deepEqual(sprout.farm.bag, []);
  farm = sprout.farm;
  const lettuce = pickPlot(farm, 40, T0 + 5 * MIN, 1);
  assert.deepEqual(lettuce.planted, [{ plot: 1, crop: "lettuce", quick: false }]);
  assert.equal(ripeAt(lettuce.farm.plots[1]), T0 + 5 * MIN + 6 * HOUR);
  const two = harvestFarm(blank({ tasted: ["lettuce"], bag: ["tomato", "tomato"], plots: [plant("lettuce", T0), plant("lettuce", T0), plant("gold", T0), plant("gold", T0), null, null] }), 0, T0 + 6 * HOUR);
  assert.deepEqual(two.planted, [{ plot: 0, crop: "tomato", quick: true }, { plot: 1, crop: "tomato", quick: false }]);
  assert.equal(pickPlot(blank({ tasted: [], bag: ["gold"], plots: [plant("lettuce", T0), plant("gold", T0), plant("gold", T0), plant("gold", T0), null, null] }), 0, T0 + 6 * HOUR, 0).planted[0].quick, false);
});

test("a harvest that levels up plants 당근 in the new plot 5, then replants bag-first", () => {
  const farm = openFarm(null, 60, T0).farm;
  const out = harvestFarm(farm, 60, T0 + MIN);
  assert.deepEqual(out.picked, [{ plot: 0, crop: "sprout", xp: 40, quick: true }]);
  assert.equal(out.xpAfter, xpForLevel(2));
  assert.deepEqual(out.opened, [4]);
  assert.deepEqual(out.seeds, [{ crop: "carrot", from: "unlock" }]);
  assert.deepEqual(out.planted, [{ plot: 4, crop: "carrot", quick: true }, { plot: 0, crop: "potato", quick: false }]);
  assert.equal(ripeAt(out.farm.plots[4]), T0 + MIN + 30 * MIN);
  assert.deepEqual(out.farm.bag, []);
  assert.equal(out.farm.unlockedTo, 2);
});

test("새싹 and 황금 감자 never replant; other crops save their seed", () => {
  const ripe = seoul("2026-05-09T00:00:00");
  const field = [plant("sprout", T0, true), plant("gold", T0), plant("lettuce", T0), plant("melon", T0), null, null];
  const empty = harvestFarm(blank({ plots: field }), 0, ripe);
  assert.deepEqual(crops(empty.farm), ["potato", "potato", "lettuce", "melon", null, null]);
  const bagged = harvestFarm(blank({ plots: field, bag: ["tomato", "carrot"] }), 0, ripe);
  assert.deepEqual(crops(bagged.farm), ["tomato", "carrot", "lettuce", "melon", null, null]);
  assert.deepEqual(bagged.farm.bag, []);
});

test("a level-up away from the farm leaves the new plot empty until open plants it", () => {
  const farm = createFarm(T0);
  assert.equal(farm.plots[4], null);
  assert.equal(farmDot(farm, 2, T0), true);
  const out = openFarm(farm, xpForLevel(2), T0 + MIN);
  assert.deepEqual(out.opened, [4]);
  assert.deepEqual(out.planted, [{ plot: 4, crop: "carrot", quick: true }]);
  assert.deepEqual(crops(out.farm), ["sprout", "lettuce", "potato", "gold", "carrot", null]);
  assert.deepEqual(out.farm.bag, ["potato"]);
});

test("open never replaces a growing or ripe crop", () => {
  const field = [plant("potato", T0), plant("lettuce", T0), plant("tomato", T0), plant("gold", T0), plant("carrot", T0), null];
  const out = openFarm(blank({ plots: field, unlockedTo: 2, bag: ["melon"] }), xpForLevel(3), seoul("2026-05-03T00:00:00"));
  assert.deepEqual(crops(out.farm), ["potato", "lettuce", "tomato", "gold", "carrot", "tomato"]);
  assert.deepEqual(out.planted, [{ plot: 5, crop: "tomato", quick: false }]);
  assert.deepEqual([out.picked, out.xpGain, out.farm.bag], [[], 0, ["melon"]]);
});

test("unlock seeds arrive once per level, in level order, at the front", () => {
  const first = openFarm(null, xpForLevel(5), T0);
  assert.deepEqual(first.seeds, ["carrot", "tomato", "sweet", "melon"].map((crop) => ({ crop, from: "unlock" })));
  assert.deepEqual(first.opened, [4, 5]);
  assert.deepEqual(crops(first.farm), ["sprout", "lettuce", "potato", "gold", "carrot", "tomato"]);
  assert.deepEqual(first.farm.bag, ["sweet", "melon", "potato"]);
  assert.equal(first.farm.unlockedTo, 5);
  const again = openFarm(first.farm, xpForLevel(6), T0 + MIN);
  assert.deepEqual([again.seeds, again.opened, again.farm.bag], [[], [], ["sweet", "melon", "potato"]]);
});

test("gift seeds follow the tier and the pet's level", () => {
  assert.deepEqual(giftSeeds("common", 1, seq(0, 0.99)), ["lettuce", "potato"]);
  assert.deepEqual(giftSeeds("common", 3, seq(0.99, 0.5)), ["tomato", "carrot"]);
  assert.deepEqual(giftSeeds("special", 3, seq(0, 0.3, 0.99)), ["lettuce", "potato", "tomato"]);
  assert.deepEqual(giftSeeds("special", 4, seq(0, 0, 0.99)), ["lettuce", "lettuce", "sweet"]);
  assert.deepEqual(giftSeeds("special", 5, seq(0, 0, 0.99)), ["lettuce", "lettuce", "melon"]);
  assert.deepEqual(giftSeeds("rare", 1, seq(0)), ["lettuce", "lettuce", "gold"]);
  const farm = addGiftSeeds(blank({ bag: ["potato"] }), ["carrot", "gold"]);
  assert.deepEqual(farm.bag, ["potato", "carrot", "gold"]);
  assert.deepEqual(farm.arrived, [{ crop: "carrot", from: "gift" }, { crop: "gold", from: "gift" }]);
  const out = openFarm(farm, 0, T0);
  assert.deepEqual(out.seeds, farm.arrived);
  assert.deepEqual(out.farm.arrived, []);
});

test("the bag holds 9 and drops from the tail, never 황금 감자", () => {
  const p = (n) => Array(n).fill("potato");
  assert.deepEqual(addSeeds([...p(7), "gold"], ["lettuce", "carrot"]), [...p(7), "gold", "lettuce"]);
  assert.deepEqual(addSeeds([...p(8), "gold"], ["gold"]), [...p(7), "gold", "gold"]);
  assert.deepEqual(addSeeds(p(9), ["carrot"], true), ["carrot", ...p(8)]);
  assert.deepEqual(addSeeds(Array(9).fill("gold"), ["gold", "lettuce"]), Array(10).fill("gold"));
  assert.deepEqual(addSeeds(["tomato"], ["carrot", "sweet"], true), ["carrot", "sweet", "tomato"]);
});

test("pick takes only a ripe plot", () => {
  const farm = openFarm(null, 0, T0).farm;
  for (const i of [0, 1, 4, 5]) {
    const out = pickPlot(farm, 0, T0 + 30 * MIN - 1, i);
    if (i === 0 || i === 1) assert.equal(out.picked.length, 1, String(i));
    else assert.deepEqual([out.picked, out.planted, out.xpGain], [[], [], 0], String(i));
  }
  const early = pickPlot(farm, 0, T0 + 30 * MIN - 1, 2);
  assert.deepEqual([early.picked, early.planted, early.farm.plots], [[], [], farm.plots]);
  const ripe = pickPlot(farm, 0, T0 + 30 * MIN, 2);
  assert.deepEqual(ripe.picked, [{ plot: 2, crop: "potato", xp: 5, quick: true }]);
  assert.deepEqual(crops(ripe.farm), ["sprout", "lettuce", "potato", "gold", null, null]);
  assert.deepEqual(ripe.farm.plots[0], farm.plots[0]);
});

test("a harvest takes every ripe plot, pays XP per crop and counts golden", () => {
  const field = [plant("lettuce", T0), plant("potato", T0), plant("gold", T0), plant("sweet", T0), plant("melon", T0, true), null];
  const out = harvestFarm(blank({ plots: field, unlockedTo: 2 }), xpForLevel(2), seoul("2026-05-08T00:00:00"));
  assert.deepEqual(out.picked.map((p) => [p.crop, p.xp]), [["lettuce", 2], ["potato", 5], ["gold", 0], ["sweet", 15], ["melon", 15]]);
  assert.equal(out.xpGain, 37);
  assert.deepEqual([out.farm.harvested, out.farm.golden], [5, 1]);
  const none = harvestFarm(blank({ plots: field, unlockedTo: 2 }), xpForLevel(2), T0);
  assert.deepEqual([none.picked, none.planted, none.xpGain], [[], [], 0]);
  assert.deepEqual(none.farm.plots, field);
});

test("corrupt or missing farm JSON reads as no farm", () => {
  for (const text of [null, undefined, "", "{", "null", "42", "[]", '"x"', '{"v":3,"plots":[]}', '{"v":1}', '{"v":2}', '{"v":1,"plots":"no"}']) {
    assert.equal(parseFarm(text), null, String(text));
  }
  const farm = createFarm(T0);
  assert.deepEqual(parseFarm(JSON.stringify(farm)), farm);
  const messy = parseFarm(JSON.stringify({ v: 1, plots: [{ crop: "rock", at: T0 }, { crop: "gold", at: "x" }, 7, { crop: "gold", at: T0, quick: true }], bag: ["potato", "rock", 3], tasted: "no", unlockedTo: -1, arrived: [{ crop: "carrot", from: "gift" }, { crop: "rock", from: "gift" }], harvested: "a" }));
  assert.deepEqual(messy, blank({ plots: [null, null, null, plant("gold", T0), null, null], bag: ["potato"], tasted: [], arrived: [{ crop: "carrot", from: "gift" }] }));
});

test("the view shows locks, times left and the next harvest", () => {
  const farm = openFarm(null, 0, T0).farm;
  const view = farmView(farm, 1, T0 + 2 * MIN);
  assert.equal(view.now, T0 + 2 * MIN);
  assert.deepEqual(view.plots[0], { plot: 0, crop: "sprout", name: "새싹", quick: true, at: T0, ripeAt: T0 + MIN, ripe: true, clock: "timed", eta: "", left: "" });
  assert.deepEqual(view.plots[1], { plot: 1, crop: "lettuce", name: "상추", quick: true, at: T0, ripeAt: T0 + 5 * MIN, ripe: false, clock: "timed", eta: "3분 뒤", left: "3분 남았어요" });
  assert.deepEqual(view.plots[3].left, "7밤 남았어요");
  assert.deepEqual(view.plots.slice(4), [{ plot: 4, locked: true, level: 2 }, { plot: 5, locked: true, level: 3 }]);
  assert.deepEqual(view.next, { plot: 1, crop: "lettuce", name: "상추", ripeAt: T0 + 5 * MIN, eta: "3분 뒤" });
  assert.deepEqual([view.ripe, view.bag, view.harvested, view.golden], [1, ["potato"], 0, 0]);
  assert.deepEqual(farmView(blank(), 3, T0).plots[5], { plot: 5, crop: null });
  assert.equal(farmView(blank(), 3, T0).next, null);
  assert.equal(nextRipeAt(farm, T0 + 2 * MIN), T0 + 5 * MIN);
  assert.equal(nextRipeAt(blank(), T0), null);
});

test("the dot lights for a missing farm, a ripe crop, seeds or an unlock waiting", () => {
  const farm = openFarm(null, 0, T0).farm;
  assert.equal(farmDot(null, 1, T0), true);
  assert.equal(farmDot(farm, 1, T0), false);
  assert.equal(farmDot(farm, 1, T0 + MIN), true);
  assert.equal(farmDot(farm, 2, T0), true);
  assert.equal(farmDot(addGiftSeeds(farm, ["lettuce"]), 1, T0), true);
  assert.equal(farmDot(blank({ unlockedTo: 5 }), 9, T0), false);
});

test("ripen makes every plot ripe now and touches nothing else", () => {
  const farm = openFarm(null, xpForLevel(3), T0).farm;
  const now = T0 + 2 * MIN;
  const out = ripenFarm(farm, now);
  assert.ok(out.plots.every((p) => p && isRipe(p, now)));
  assert.deepEqual(out.plots.map((p) => [p.crop, p.quick]), farm.plots.map((p) => [p.crop, p.quick]));
  assert.ok(out.plots.every((p, i) => ripeAt(p) > now - 2 * 24 * HOUR && p.at <= farm.plots[i].at));
  assert.deepEqual({ ...out, plots: null }, { ...farm, plots: null });
});

test("every crop has bus coins and a snack; the shop sells all but 새싹", () => {
  const table = Object.fromEntries(Object.entries(FARM.crops).map(([id, c]) => [id, [c.coins, c.snack.stat, c.snack.amount, c.price ?? null]]));
  assert.deepEqual(table, {
    sprout: [5, "cha", 10, null],
    lettuce: [5, "int", 10, 5],
    potato: [5, "str", 10, 5],
    carrot: [5, "agi", 10, 10],
    tomato: [5, "cha", 10, 10],
    sweet: [15, "str", 20, 30],
    melon: [15, "agi", 20, 30],
    gold: [50, "all", 20, 200],
  });
  assert.deepEqual([FARM.pantryMax, FARM.shopLevel, FARM.goldSeedLevel], [12, 3, 6]);
  assert.deepEqual(FARM.daily, { feedXp: 10, feedXpTimes: 3, sendXp: 5, sendXpCrops: 6 });
});

test("a v1 farm reads as v2 with nothing lost", () => {
  const v1 = { v: 1, plots: [plant("potato", T0), null, plant("gold", T0), plant("lettuce", T0, true), null, null], bag: ["carrot", "gold"], tasted: ["potato", "gold", "lettuce"], unlockedTo: 2, arrived: [{ crop: "carrot", from: "gift" }], harvested: 7, golden: 1 };
  const farm = parseFarm(JSON.stringify(v1));
  assert.deepEqual(farm, { ...v1, v: 2, pantry: [], coins: 0, day: { key: null, feeds: 0, sent: 0 } });
  assert.deepEqual(parseFarm(JSON.stringify({ ...v1, pantry: ["potato"], coins: 9 })).pantry, []);
  const out = harvestFarm(farm, 0, seoul("2026-05-02T00:00:00"));
  assert.deepEqual([out.farm.v, out.farm.pantry, out.farm.coins], [2, ["potato", "lettuce"], 0]);
  assert.deepEqual(parseFarm(JSON.stringify(out.farm)), out.farm);
});

test("a v2 farm keeps known pantry crops, at most 12, and whole coins", () => {
  const pantry = ["potato", "rock", 3, "gold", ...Array(12).fill("carrot")];
  const farm = parseFarm(JSON.stringify({ ...blank(), pantry, coins: 41.7, day: { key: "2026-05-01", feeds: 2, sent: 4 } }));
  assert.deepEqual(farm.pantry, ["potato", "gold", ...Array(10).fill("carrot")]);
  assert.deepEqual([farm.coins, farm.day], [41, { key: "2026-05-01", feeds: 2, sent: 4 }]);
  for (const coins of [-5, "50", null, Infinity]) assert.equal(parseFarm(JSON.stringify({ ...blank(), coins })).coins, 0, String(coins));
  const odd = parseFarm(JSON.stringify({ ...blank(), pantry: "no", day: { key: "today", feeds: -1, sent: 1.5 } }));
  assert.deepEqual([odd.pantry, odd.day], [[], { key: null, feeds: 0, sent: 0 }]);
  assert.deepEqual(parseFarm(JSON.stringify({ ...blank(), day: null })).day, { key: null, feeds: 0, sent: 0 });
  const fresh = createFarm(T0);
  assert.deepEqual([fresh.v, fresh.pantry, fresh.coins, fresh.day], [2, [], 0, { key: null, feeds: 0, sent: 0 }]);
});

test("a harvest puts the crops in the pantry, not on the bus", () => {
  const field = [plant("lettuce", T0), plant("potato", T0), plant("gold", T0), plant("carrot", T0), null, null];
  const out = harvestFarm(blank({ plots: field, pantry: ["tomato"], coins: 3 }), 0, seoul("2026-05-08T00:00:00"));
  assert.deepEqual(out.farm.pantry, ["tomato", "lettuce", "potato", "gold", "carrot"]);
  assert.deepEqual([out.pantry, out.bused, out.coinsGain, out.coins, out.farm.coins], [out.farm.pantry, [], 0, 3, 3]);
  const one = pickPlot(blank({ plots: field }), 0, seoul("2026-05-08T00:00:00"), 3);
  assert.deepEqual([one.farm.pantry, one.bused], [["carrot"], []]);
  const none = harvestFarm(blank({ plots: field, pantry: ["tomato"] }), 0, T0);
  assert.deepEqual([none.pantry, none.bused, none.coinsGain], [["tomato"], [], 0]);
  assert.deepEqual(openFarm(null, 0, T0).farm.pantry, []);
});

test("a full pantry sends the extras on the bus for coins", () => {
  const field = [plant("potato", T0), plant("carrot", T0), plant("sweet", T0), null, null, null];
  const ripe = seoul("2026-05-04T00:00:00");
  const out = harvestFarm(blank({ plots: field, pantry: Array(11).fill("lettuce"), coins: 7 }), 0, ripe);
  assert.deepEqual(out.farm.pantry, [...Array(11).fill("lettuce"), "potato"]);
  assert.deepEqual([out.bused, out.coinsGain, out.coins, out.farm.coins], [["carrot", "sweet"], 20, 27, 27]);
  assert.equal(out.farm.harvested, 3);
  const charm = harvestFarm(blank({ plots: field, pantry: Array(11).fill("lettuce") }), 0, ripe, { chaBonus: 8.3 });
  assert.deepEqual([charm.bused, charm.coinsGain], [["carrot", "sweet"], 23]);
  const full = harvestFarm(blank({ plots: field, pantry: Array(12).fill("lettuce") }), 0, ripe);
  assert.deepEqual([full.farm.pantry.length, full.bused, full.coinsGain], [12, ["potato", "carrot", "sweet"], 25]);
});

test("지능 raises harvest XP, rounded", () => {
  const field = [plant("lettuce", T0), plant("potato", T0), plant("sweet", T0), null, null, null];
  const ripe = seoul("2026-05-04T00:00:00");
  assert.equal(harvestFarm(blank({ plots: field }), 0, ripe).xpGain, 22);
  const smart = harvestFarm(blank({ plots: field }), 0, ripe, { intBonus: 15 });
  assert.deepEqual([smart.xpGain, smart.xpAfter], [29, 29]);
  assert.deepEqual(smart.picked.map((p) => p.xp), [2, 5, 15]);
  assert.equal(pickPlot(blank({ plots: field }), 0, ripe, 1, { intBonus: 15 }).xpGain, 7);
  assert.equal(openFarm(blank({ plots: field }), 0, ripe, { intBonus: 15 }).xpGain, 0);
  assert.equal(harvestFarm(blank({ plots: field }), xpForLevel(2) - 25, ripe, { intBonus: 15 }).farm.unlockedTo, 2);
});

test("the view shows the pantry, coins and the seed shop from Lv 3", () => {
  const farm = blank({ pantry: ["carrot", "gold"], coins: 8, bag: ["potato"] });
  const low = farmView(farm, 2, T0);
  assert.deepEqual([low.pantry, low.coins, low.shopOpen], [["carrot", "gold"], 8, false]);
  assert.ok(low.shop.every((s) => s.locked));
  assert.deepEqual(low.shop.map((s) => s.reason), ["Lv 3부터", "Lv 3부터", "Lv 3부터", "Lv 3부터", "Lv 4부터", "Lv 5부터", "Lv 6부터"]);
  const view = farmView(farm, 3, T0);
  assert.equal(view.shopOpen, true);
  assert.deepEqual(view.shop, [
    { crop: "lettuce", name: "상추", price: 5, locked: false, reason: "" },
    { crop: "potato", name: "감자", price: 5, locked: false, reason: "" },
    { crop: "carrot", name: "당근", price: 10, locked: true, reason: "코인이 모자라요" },
    { crop: "tomato", name: "토마토", price: 10, locked: true, reason: "코인이 모자라요" },
    { crop: "sweet", name: "고구마", price: 30, locked: true, reason: "Lv 4부터" },
    { crop: "melon", name: "수박", price: 30, locked: true, reason: "Lv 5부터" },
    { crop: "gold", name: "황금 감자", price: 200, locked: true, reason: "Lv 6부터" },
  ]);
  const rich = farmView(blank({ coins: 500 }), 6, T0);
  assert.ok(rich.shop.every((s) => !s.locked));
  const full = farmView(blank({ coins: 500, bag: Array(9).fill("potato") }), 6, T0);
  assert.deepEqual([...new Set(full.shop.map((s) => s.reason))], ["씨앗 주머니가 가득해요"]);
  assert.deepEqual(farmView(farm, 3, T0).pantry, farm.pantry);
  assert.notEqual(farmView(farm, 3, T0).pantry, farm.pantry);
});
