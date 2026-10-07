import { seoulDayKey } from "./pet.js";

export const STAT_KEYS = ["str", "int", "agi", "cha"];
export const STAT_NAMES = { str: "힘", int: "지능", agi: "민첩", cha: "매력" };
// s per animal [str, int, agi, cha]; shown base = 20 + s * 10
export const ANIMALS = { rabbit: [2, 3, 5, 4], ox: [5, 3, 2, 4], tiger: [5, 2, 4, 3], dragon: [4, 5, 2, 3], snake: [2, 5, 3, 4], horse: [3, 2, 5, 4], sheep: [3, 4, 2, 5], monkey: [2, 5, 4, 3], rooster: [3, 3, 4, 4], dog: [4, 3, 3, 4], pig: [4, 4, 2, 4], rat: [1, 5, 4, 4] };
export const ANIMAL_NAMES = { rabbit: "토끼", ox: "소", tiger: "호랑이", dragon: "용", snake: "뱀", horse: "말", sheep: "양", monkey: "원숭이", rooster: "닭", dog: "개", pig: "돼지", rat: "쥐" };
export const EDITIONS = { classic: { name: "포근 클래식", plus: 0 }, rare: { name: "금실 레어", plus: 10 }, legendary: { name: "별밤 레전더리", plus: 20 } };
export const STAT_RULES = { trainCap: 30, bonusCap: 15 };

const BOOSTS = [10, 20];
const perStat = (fn) => Object.fromEntries(STAT_KEYS.map((k, i) => [k, fn(k, i)]));
const copy = (s) => ({ v: 1, trained: { ...s.trained }, trainedDay: { ...s.trainedDay }, boost: { ...s.boost } });

export function editionOf(uid, { rare = [], legendary = [] } = {}) {
  if (legendary.includes(uid)) return "legendary";
  return rare.includes(uid) ? "rare" : "classic";
}

export function parseStats(text) {
  let v;
  try {
    v = JSON.parse(text || "");
  } catch {
    v = null;
  }
  const part = (name) => (v && typeof v === "object" && v[name] && typeof v[name] === "object" ? v[name] : {});
  const trained = part("trained");
  const days = part("trainedDay");
  const boost = part("boost");
  return {
    v: 1,
    trained: perStat((k) => (Number.isFinite(trained[k]) ? Math.max(0, Math.min(STAT_RULES.trainCap, Math.floor(trained[k]))) : 0)),
    trainedDay: perStat((k) => (typeof days[k] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(days[k]) ? days[k] : null)),
    boost: perStat((k) => (BOOSTS.includes(boost[k]) ? boost[k] : 0)),
  };
}

export function statBonus(total) {
  return Math.round(Math.min(STAT_RULES.bonusCap, Math.max(0, (total - 40) / 6)) * 10) / 10;
}

export function statSheet(stats, kind, edition) {
  const s = ANIMALS[Object.hasOwn(ANIMALS, kind) ? kind : "horse"];
  const plus = EDITIONS[Object.hasOwn(EDITIONS, edition) ? edition : "classic"].plus;
  return perStat((k, i) => {
    const base = 20 + s[i] * 10;
    const total = base + plus + stats.trained[k] + stats.boost[k];
    return { base, plus, trained: stats.trained[k], boost: stats.boost[k], total, bonus: statBonus(total) };
  });
}

export function train(stats, key, now) {
  const out = copy(stats);
  const day = seoulDayKey(now);
  if (out.trainedDay[key] === day || out.trained[key] >= STAT_RULES.trainCap) return { stats: out, gained: 0 };
  out.trained[key] += 1;
  out.trainedDay[key] = day;
  return { stats: out, gained: 1 };
}

export function setBoost(stats, key, amount) {
  const out = copy(stats);
  if (out.boost[key] > 0 || !BOOSTS.includes(amount)) return { stats: out, set: false };
  out.boost[key] = amount;
  return { stats: out, set: true };
}

export function useBoost(stats, key) {
  const out = copy(stats);
  const used = out.boost[key];
  out.boost[key] = 0;
  return { stats: out, used };
}
