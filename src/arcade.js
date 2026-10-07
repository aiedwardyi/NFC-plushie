import { seoulDayKey } from "./pet.js";

// 12500 m is a full charge; the top 힘 bonus adds 15%.
export const ARCADE = { xpPlays: 3, xpPerPlay: 15, maxHeight: 14375 };

export function arcadeToday(state, now) {
  return state.arcadeDay === seoulDayKey(now) ? state.arcadePlays : 0;
}

export function xpPlaysLeft(state, now) {
  return Math.max(0, ARCADE.xpPlays - arcadeToday(state, now));
}

// One finished run. The height is the page's word, so it only moves the best record, never XP.
export function applyPlay(state, height, now) {
  const plays = arcadeToday(state, now) + 1;
  return {
    arcadeDay: seoulDayKey(now),
    arcadePlays: plays,
    xpGain: plays <= ARCADE.xpPlays ? ARCADE.xpPerPlay : 0,
    xpLeft: Math.max(0, ARCADE.xpPlays - plays),
    best: Math.max(state.giBest, height),
    isBest: height > state.giBest,
  };
}

export function raceState(text) {
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  return Object.fromEntries(["horse", "sheep"].map((kind) => {
    const r = data?.[kind];
    const best = Number.isInteger(r?.best) ? Math.max(0, Math.min(20, r.best)) : 0;
    return [kind, { level: Math.min(20, best + 1), best }];
  }));
}

// One finished race, counted as a day's play with the 기 모으기 record left as is. The win is the page's word, so it only raises that rival, never XP.
export function applyRace(state, race, rival, won, now) {
  const out = applyPlay(state, state.giBest, now);
  const before = race[rival];
  const best = won ? Math.max(before.best, before.level) : before.best;
  const next = { ...race, [rival]: { level: Math.min(20, best + 1), best } };
  return { ...out, race: next, rivalLevel: before.level };
}
