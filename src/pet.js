import { GIFTS } from "./gifts.js";

export const PET = {
  moodMax: 100,
  moodFloor: 10,
  moodDecayPerHour: 1.25,
  moodLonelyAt: 30,
  moodTapGain: 40,
  cooldownMs: 30 * 60 * 1000,
  dailyCap: 6,
  xpPerTap: 10,
  xpDailyBonus: 30,
  tierOdds: { common: 0.8, special: 0.17, rare: 0.03 },
  seoulOffsetMs: 9 * 60 * 60 * 1000,
};

export function seoulDayKey(ms) {
  return new Date(ms + PET.seoulOffsetMs).toISOString().slice(0, 10);
}

export function currentMood(state, now) {
  const base = Number(state.moodValue);
  const updated = Number(state.moodUpdatedAt);
  if (!Number.isFinite(base) || !Number.isFinite(updated)) return PET.moodFloor;
  const hours = Math.max(0, (now - updated) / 3600000);
  return Math.max(PET.moodFloor, base - hours * PET.moodDecayPerHour);
}

export function levelForXp(xp) {
  const total = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 1;
  while (xpForLevel(level + 1) <= total) level += 1;
  return level;
}

export function xpForLevel(n) {
  return n <= 1 ? 0 : 25 * (n - 1) * (n + 2);
}

export function xpProgress(xp) {
  const level = levelForXp(xp);
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const total = Math.max(0, Math.floor(Number(xp) || 0));
  return { level, base, next, into: total - base, span: next - base };
}

export function parseTapUid(raw) {
  if (typeof raw !== "string") return null;
  const m = /^([0-9A-F]{14})(?:x([0-9A-F]{6}))?$/.exec(raw);
  if (!m) return null;
  return { serial: m[1], counter: m[2] === undefined ? null : parseInt(m[2], 16) };
}

export function rollGiftTier(rng, forced) {
  if (forced === "common" || forced === "special" || forced === "rare") return forced;
  const r = rng();
  if (r < PET.tierOdds.common) return "common";
  if (r < PET.tierOdds.common + PET.tierOdds.special) return "special";
  return "rare";
}

export function pickGift(state, rng, forcedTier) {
  const tier = rollGiftTier(rng, forcedTier);
  const pool = GIFTS[tier];
  const seen = new Set((state[`seen_${tier}`] || []));
  let unseen = pool.filter((g) => !seen.has(g.id));
  if (unseen.length === 0) unseen = pool.slice();
  const gift = unseen[Math.floor(rng() * unseen.length)];
  return { tier, gift };
}

export function gateTap(state, now, counter) {
  const today = seoulDayKey(now);
  if (counter.present && state.lastCounter !== null && !(counter.value > state.lastCounter)) {
    return { rewarded: false, reason: "stale" };
  }
  if (counter.missing && state.lastCounter !== null) {
    return { rewarded: false, reason: "stale" };
  }
  if (state.lastRewardedAt !== null && now - state.lastRewardedAt < PET.cooldownMs) {
    return { rewarded: false, reason: "cooldown" };
  }
  const dayCount = state.rewardDay === today ? state.rewardDayCount : 0;
  if (dayCount >= PET.dailyCap) {
    return { rewarded: false, reason: "cap" };
  }
  return { rewarded: true, reason: "" };
}

export function applyTap(state, now, { counter, rng }) {
  const today = seoulDayKey(now);
  const gate = gateTap(state, now, counter);
  if (!gate.rewarded) return { rewarded: false, reason: gate.reason };
  const moodBefore = currentMood(state, now);
  const moodAfter = Math.min(PET.moodMax, Math.round(moodBefore + PET.moodTapGain));
  const isFirstOfDay = state.lastGiftDay !== today;
  const xpGain = PET.xpPerTap + (isFirstOfDay ? PET.xpDailyBonus : 0);
  const levelBefore = levelForXp(state.xp);
  const xpAfter = state.xp + xpGain;
  const levelAfter = levelForXp(xpAfter);
  let gift = null;
  if (isFirstOfDay) gift = pickGift(state, rng, state.nextGiftTier || undefined);
  const dayCount = state.rewardDay === today ? state.rewardDayCount : 0;
  const activeDay = state.lastActiveDay !== today;
  return {
    rewarded: true,
    reason: "",
    moodBefore,
    moodAfter,
    xpGain,
    xpAfter,
    levelBefore,
    levelAfter,
    leveledUp: levelAfter > levelBefore,
    gift,
    giftDay: isFirstOfDay ? today : null,
    isFirstOfDay,
    reunion: moodBefore <= PET.moodLonelyAt,
    dayCountAfter: dayCount + 1,
    newActiveDay: activeDay,
  };
}
