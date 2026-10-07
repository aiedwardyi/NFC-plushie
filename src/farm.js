import { PET, levelForXp, seoulDayKey } from "./pet.js";

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

export const FARM = {
  plots: 6,
  plotsByLevel: [4, 5, 6],
  bagMax: 9,
  pantryMax: 12,
  shopLevel: 3,
  goldSeedLevel: 6,
  daily: { feedXp: 10, feedXpTimes: 3, sendXp: 5, sendXpCrops: 6 },
  crops: {
    sprout: { name: "새싹", quickMs: MIN, xp: 40, coins: 5, snack: { stat: "cha", amount: 10 } },
    lettuce: { name: "상추", quickMs: 5 * MIN, waitMs: 6 * 60 * MIN, level: 1, tier: "common", xp: 2, coins: 5, snack: { stat: "int", amount: 10 }, price: 5 },
    potato: { name: "감자", quickMs: 30 * MIN, nights: 1, level: 1, tier: "common", xp: 5, coins: 5, snack: { stat: "str", amount: 10 }, price: 5 },
    carrot: { name: "당근", quickMs: 30 * MIN, nights: 1, level: 2, tier: "common", xp: 5, coins: 5, snack: { stat: "agi", amount: 10 }, price: 10 },
    tomato: { name: "토마토", quickMs: 30 * MIN, nights: 1, level: 3, tier: "common", xp: 5, coins: 5, snack: { stat: "cha", amount: 10 }, price: 10 },
    sweet: { name: "고구마", quickMs: 60 * MIN, nights: 3, level: 4, tier: "special", xp: 15, coins: 15, snack: { stat: "str", amount: 20 }, price: 30 },
    melon: { name: "수박", quickMs: 60 * MIN, nights: 3, level: 5, tier: "special", xp: 15, coins: 15, snack: { stat: "agi", amount: 20 }, price: 30 },
    // No level: a 황금 감자 never arrives as an unlock seed, only from gifts or the shop.
    gold: { name: "황금 감자", nights: 7, tier: "rare", xp: 0, coins: 50, snack: { stat: "all", amount: 20 }, price: 200 },
  },
  starter: ["sprout", "lettuce", "potato", "gold"],
  spare: ["potato"],
  // Their plot takes the next bag seed, else this.
  noReplant: ["sprout", "gold"],
  fallback: "potato",
};

const isCrop = (id) => typeof id === "string" && Object.hasOwn(FARM.crops, id);
const seoulMidnight = (ms) => Date.parse(`${seoulDayKey(ms)}T00:00:00Z`) - PET.seoulOffsetMs;
const newDay = () => ({ key: null, feeds: 0, sent: 0 });
const busCoins = (crops, chaBonus) => Math.round(crops.reduce((sum, id) => sum + FARM.crops[id].coins, 0) * (1 + 2 * chaBonus / 100));
const seedLevel = (id) => (id === "gold" ? FARM.goldSeedLevel : FARM.crops[id].level);

export function plotsFor(level) {
  return FARM.plotsByLevel[Math.min(Math.max(level, 1), FARM.plotsByLevel.length) - 1];
}

const lockLevel = (i) => FARM.plotsByLevel.findIndex((n) => n > i) + 1;

export function ripeAt(plot) {
  const c = FARM.crops[plot.crop];
  if (plot.quick) return plot.at + c.quickMs;
  return c.nights ? seoulMidnight(plot.at) + c.nights * DAY : plot.at + (c.waitMs ?? c.quickMs);
}

export function isRipe(plot, now) {
  return now >= ripeAt(plot);
}

export function etaWords(plot, now) {
  const at = ripeAt(plot);
  const clock = !plot.quick && FARM.crops[plot.crop].nights ? "night" : "timed";
  if (now >= at) return { clock, eta: "", left: "" };
  if (clock === "night") {
    const n = Math.round((at - seoulMidnight(now)) / DAY);
    return n === 1 ? { clock, eta: "내일", left: "내일 익어요" } : { clock, eta: `${n}밤 뒤`, left: `${n}밤 남았어요` };
  }
  const mins = Math.ceil((at - now) / MIN);
  const span = mins < 60 ? `${mins}분` : `${Math.ceil(mins / 60)}시간`;
  return { clock, eta: `${span} 뒤`, left: `${span} 남았어요` };
}

export function parseFarm(text) {
  let v;
  try {
    v = JSON.parse(text || "");
  } catch {
    return null;
  }
  if (!v || typeof v !== "object" || (v.v !== 1 && v.v !== 2) || !Array.isArray(v.plots)) return null;
  const crops = (a) => (Array.isArray(a) ? a.filter(isCrop) : []);
  const count = (n) => (Number.isInteger(n) && n >= 0 ? n : 0);
  // v1 had no pantry, coins or day, so it moves up empty.
  const v2 = v.v === 2 ? v : {};
  const day = v2.day && typeof v2.day === "object" ? v2.day : {};
  return {
    v: 2,
    plots: Array.from({ length: FARM.plots }, (_, i) => {
      const p = v.plots[i];
      if (!p || typeof p !== "object" || !isCrop(p.crop) || !Number.isFinite(p.at)) return null;
      return { crop: p.crop, at: p.at, quick: p.quick === true && FARM.crops[p.crop].quickMs !== undefined };
    }),
    bag: crops(v.bag),
    tasted: crops(v.tasted),
    unlockedTo: Number.isInteger(v.unlockedTo) && v.unlockedTo >= 1 ? v.unlockedTo : 1,
    arrived: Array.isArray(v.arrived)
      ? v.arrived.filter((s) => s && isCrop(s.crop) && (s.from === "gift" || s.from === "unlock")).map((s) => ({ crop: s.crop, from: s.from }))
      : [],
    harvested: count(v.harvested),
    golden: count(v.golden),
    pantry: crops(v2.pantry).slice(0, FARM.pantryMax),
    coins: Number.isFinite(v2.coins) ? Math.max(0, Math.floor(v2.coins)) : 0,
    day: { key: typeof day.key === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day.key) ? day.key : null, feeds: count(day.feeds), sent: count(day.sent) },
  };
}

// The first planting of each crop ever is its 맛보기.
function sow(farm, plot, crop, now) {
  const quick = FARM.crops[crop].quickMs !== undefined && !farm.tasted.includes(crop);
  if (!farm.tasted.includes(crop)) farm.tasted.push(crop);
  farm.plots[plot] = { crop, at: now, quick };
  return { plot, crop, quick };
}

export function createFarm(now) {
  const farm = { v: 2, plots: Array(FARM.plots).fill(null), bag: [...FARM.spare], tasted: [], unlockedTo: 1, arrived: [], harvested: 0, golden: 0, pantry: [], coins: 0, day: newDay() };
  FARM.starter.forEach((crop, i) => sow(farm, i, crop, now));
  return farm;
}

export function addSeeds(bag, seeds, front = false) {
  const out = front ? [...seeds, ...bag] : [...bag, ...seeds];
  for (let i = out.length - 1; out.length > FARM.bagMax && i >= 0; i--) {
    if (out[i] !== "gold") out.splice(i, 1);
  }
  return out;
}

export function giftSeeds(tier, level, rng) {
  const pool = (t) => Object.keys(FARM.crops).filter((id) => FARM.crops[id].tier === t && FARM.crops[id].level <= level);
  const pick = (ids) => ids[Math.floor(rng() * ids.length)];
  const everyday = pool("common");
  const seeds = [pick(everyday), pick(everyday)];
  if (tier === "special") {
    const long = pool("special");
    seeds.push(pick(long.length ? long : everyday));
  }
  if (tier === "rare") seeds.push("gold");
  return seeds;
}

export function addGiftSeeds(farm, seeds) {
  return {
    ...farm,
    bag: addSeeds(farm.bag, seeds),
    arrived: [...farm.arrived, ...seeds.map((crop) => ({ crop, from: "gift" }))].slice(-FARM.bagMax),
  };
}

// Every farm action: pay the picks, grant unlocks, fill plots that were empty, replant the picks.
function tend(farm, xp, now, picks, { intBonus = 0, chaBonus = 0 } = {}) {
  const f = structuredClone(farm);
  const picked = [];
  for (const i of picks) {
    const p = f.plots[i];
    if (!p || !isRipe(p, now)) continue;
    picked.push({ plot: i, crop: p.crop, xp: FARM.crops[p.crop].xp, quick: p.quick });
    f.plots[i] = null;
  }
  const xpGain = Math.round(picked.reduce((sum, p) => sum + p.xp, 0) * (1 + 2 * intBonus / 100));
  // A full pantry sends the rest on the bus, so no crop is lost.
  const room = Math.max(0, FARM.pantryMax - f.pantry.length);
  f.pantry.push(...picked.slice(0, room).map((p) => p.crop));
  const bused = picked.slice(room).map((p) => p.crop);
  const coinsGain = busCoins(bused, chaBonus);
  f.coins += coinsGain;
  const level = levelForXp(xp + xpGain);
  const opened = [];
  for (let i = plotsFor(f.unlockedTo); i < plotsFor(level); i++) opened.push(i);
  const unlocked = Object.keys(FARM.crops).filter((id) => FARM.crops[id].level > f.unlockedTo && FARM.crops[id].level <= level);
  f.bag = addSeeds(f.bag, unlocked, true);
  f.unlockedTo = Math.max(f.unlockedTo, level);
  const seeds = [...f.arrived, ...unlocked.map((crop) => ({ crop, from: "unlock" }))];
  f.arrived = [];
  const planted = [];
  const emptied = new Set(picked.map((p) => p.plot));
  for (let i = 0; i < plotsFor(level); i++) {
    if (!f.plots[i] && !emptied.has(i) && f.bag.length) planted.push(sow(f, i, f.bag.shift(), now));
  }
  for (const p of picked) {
    const again = FARM.noReplant.includes(p.crop) ? FARM.fallback : p.crop;
    planted.push(sow(f, p.plot, f.bag.length ? f.bag.shift() : again, now));
  }
  f.harvested += picked.length;
  f.golden += picked.filter((p) => p.crop === "gold").length;
  return { farm: f, created: false, picked, planted, opened, seeds, xpGain, xpAfter: xp + xpGain, pantry: [...f.pantry], bused, coinsGain, coins: f.coins };
}

export function openFarm(farm, xp, now, bonus) {
  if (farm) return tend(farm, xp, now, [], bonus);
  const fresh = createFarm(now);
  const out = tend(fresh, xp, now, [], bonus);
  const starter = FARM.starter.map((crop, i) => ({ plot: i, crop, quick: fresh.plots[i].quick }));
  return { ...out, created: true, planted: [...starter, ...out.planted] };
}

export function pickPlot(farm, xp, now, plot, bonus) {
  return tend(farm, xp, now, [plot], bonus);
}

export function harvestFarm(farm, xp, now, bonus) {
  return tend(farm, xp, now, farm.plots.map((_, i) => i), bonus);
}

export function nextRipeAt(farm, now) {
  const times = farm.plots.filter((p) => p && !isRipe(p, now)).map(ripeAt);
  return times.length ? Math.min(...times) : null;
}

export function farmDot(farm, level, now) {
  if (!farm) return true;
  const unlock = plotsFor(level) > plotsFor(farm.unlockedTo)
    || Object.values(FARM.crops).some((c) => c.level > farm.unlockedTo && c.level <= level);
  return unlock || farm.arrived.length > 0 || farm.plots.some((p) => p && isRipe(p, now));
}

// Why a seed can't be bought now, or "" when it can.
function seedLock(farm, crop, level) {
  const need = Math.max(FARM.shopLevel, seedLevel(crop));
  if (level < need) return `Lv ${need}부터`;
  if (farm.coins < FARM.crops[crop].price) return "코인이 모자라요";
  if (farm.bag.length >= FARM.bagMax) return "씨앗 주머니가 가득해요";
  return "";
}

export function farmView(farm, level, now) {
  const open = plotsFor(level);
  const plots = farm.plots.map((p, i) => {
    if (i >= open) return { plot: i, locked: true, level: lockLevel(i) };
    if (!p) return { plot: i, crop: null };
    return { plot: i, crop: p.crop, name: FARM.crops[p.crop].name, quick: p.quick, at: p.at, ripeAt: ripeAt(p), ripe: isRipe(p, now), ...etaWords(p, now) };
  });
  const growing = plots.filter((p) => p.crop && !p.ripe).sort((a, b) => a.ripeAt - b.ripeAt);
  const next = growing.length ? { plot: growing[0].plot, crop: growing[0].crop, name: growing[0].name, ripeAt: growing[0].ripeAt, eta: growing[0].eta } : null;
  const shop = Object.keys(FARM.crops).filter((id) => FARM.crops[id].price).map((id) => {
    const reason = seedLock(farm, id, level);
    return { crop: id, name: FARM.crops[id].name, price: FARM.crops[id].price, locked: reason !== "", reason };
  });
  return { now, plots, next, ripe: plots.filter((p) => p.ripe).length, bag: [...farm.bag], harvested: farm.harvested, golden: farm.golden, pantry: [...farm.pantry], coins: farm.coins, shopOpen: level >= FARM.shopLevel, shop };
}

// Dev only: shift plant times back so every plot is ripe now.
export function ripenFarm(farm, now) {
  const plots = farm.plots.map((p) => {
    if (!p) return p;
    const late = ripeAt(p) - now;
    if (late <= 0) return { ...p };
    const shift = !p.quick && FARM.crops[p.crop].nights ? Math.ceil(late / DAY) * DAY : late;
    return { ...p, at: p.at - shift };
  });
  return { ...farm, plots };
}
