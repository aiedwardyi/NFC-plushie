import { PET, currentMood } from "./pet.js";

export const CARE = {
  windowMs: 4 * 60 * 60 * 1000,
  feedGain: [20, 10],
  playGain: [20, 10],
  sleepGain: 10,
};

export function seoulHour(ms) {
  return new Date(ms + PET.seoulOffsetMs).getUTCHours();
}

const within = (at, now) => at !== null && now - at < CARE.windowMs;

export function mealsNow(state, now) {
  return within(state.fedAt, now) ? state.meals : 0;
}

export function careWant(state, now) {
  if (state.sleptAt !== null) return null;
  const hour = seoulHour(now);
  if (hour >= 22 || hour < 5) return "sleep";
  if (!within(state.fedAt, now)) return "feed";
  if (!within(state.playedAt, now)) return "play";
  return null;
}

export function applyCare(state, act, now) {
  const care = { fedAt: state.fedAt, meals: state.meals, playedAt: state.playedAt, plays: state.plays, sleptAt: state.sleptAt };
  const moodBefore = currentMood(state, now);
  let beat = "mumble";
  let gain = 0;
  if (state.sleptAt === null) {
    if (act === "feed") {
      const n = mealsNow(state, now) + 1;
      beat = n === 1 ? "full" : n === 2 ? "nibble" : "stash";
      if (n <= 2) {
        gain = CARE.feedGain[n - 1];
        care.fedAt = now;
        care.meals = n;
      }
    } else if (act === "play") {
      const n = (within(state.playedAt, now) ? state.plays : 0) + 1;
      beat = "play";
      gain = CARE.playGain[n - 1] ?? 0;
      care.playedAt = now;
      care.plays = n;
    } else if (act === "sleep") {
      beat = "sleep";
      gain = CARE.sleepGain;
      care.sleptAt = now;
    }
  }
  const moodAfter = gain > 0 ? Math.min(PET.moodMax, Math.round(moodBefore + gain)) : moodBefore;
  return { beat, gain, moodBefore, moodAfter, care };
}
