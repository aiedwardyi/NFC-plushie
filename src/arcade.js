import { seoulDayKey } from "./pet.js";

export const ARCADE = { xpPlays: 3, xpPerPlay: 5, maxHeight: 12500 };

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
