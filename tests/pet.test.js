import assert from "node:assert/strict";
import test from "node:test";
import {
  PET,
  applyTap,
  currentMood,
  gateTap,
  levelForXp,
  parseTapUid,
  pickGift,
  rollGiftTier,
  seoulDayKey,
  xpForLevel,
} from "../src/pet.js";

const HOUR = 3600000;
const T0 = Date.parse("2026-03-01T00:00:00Z");

function fresh(over = {}) {
  return {
    moodValue: 100,
    moodUpdatedAt: T0,
    xp: 0,
    lastRewardedAt: null,
    rewardDay: null,
    rewardDayCount: 0,
    lastGiftDay: null,
    lastActiveDay: null,
    lastCounter: null,
    nextGiftTier: null,
    seen_common: [],
    seen_special: [],
    seen_rare: [],
    ...over,
  };
}

const noCounter = { present: false, missing: true, value: null };

test("decay curve and floor", () => {
  assert.equal(currentMood(fresh(), T0), 100);
  assert.equal(currentMood(fresh(), T0 + 36 * HOUR), 55);
  assert.equal(currentMood(fresh(), T0 + 72 * HOUR), 10);
  assert.equal(currentMood(fresh(), T0 + 200 * HOUR), 10);
  assert.ok(currentMood(fresh(), T0 + 1000 * HOUR) >= 10);
});

test("lonely threshold", () => {
  assert.ok(currentMood(fresh({ moodValue: 30, moodUpdatedAt: T0 }), T0) <= PET.moodLonelyAt);
  assert.ok(currentMood(fresh({ moodValue: 31, moodUpdatedAt: T0 }), T0) > PET.moodLonelyAt);
});

test("rewarded tap adds 40 mood capped at 100", () => {
  const mid = applyTap(fresh({ moodValue: 50, moodUpdatedAt: T0 }), T0, { counter: noCounter, rng: () => 0 });
  assert.equal(mid.moodAfter, 90);
  const top = applyTap(fresh({ moodValue: 80, moodUpdatedAt: T0 }), T0, { counter: noCounter, rng: () => 0 });
  assert.equal(top.moodAfter, 100);
});

test("30-minute cooldown edge", () => {
  const just = gateTap(fresh({ lastRewardedAt: T0 }), T0 + 30 * 60 * 1000, noCounter);
  assert.equal(just.rewarded, true);
  const early = gateTap(fresh({ lastRewardedAt: T0 }), T0 + 30 * 60 * 1000 - 1, noCounter);
  assert.deepEqual([early.rewarded, early.reason], [false, "cooldown"]);
});

test("6-per-day cap resets on a new Seoul day", () => {
  const today = seoulDayKey(T0);
  const full = fresh({ lastRewardedAt: null, rewardDay: today, rewardDayCount: 6 });
  assert.deepEqual([gateTap(full, T0, noCounter).rewarded, gateTap(full, T0, noCounter).reason], [false, "cap"]);
  const nextDay = gateTap(fresh({ lastRewardedAt: null, rewardDay: today, rewardDayCount: 6 }), T0 + 24 * HOUR, noCounter);
  assert.equal(nextDay.rewarded, true);
});

test("Seoul day rolls over at 00:00 KST (15:00 UTC)", () => {
  const before = Date.parse("2026-03-01T14:59:59Z");
  const at = Date.parse("2026-03-01T15:00:00Z");
  assert.equal(seoulDayKey(before), "2026-03-01");
  assert.equal(seoulDayKey(at), "2026-03-02");
});

test("level thresholds", () => {
  assert.deepEqual([xpForLevel(2), xpForLevel(3), xpForLevel(4), xpForLevel(5), xpForLevel(10)], [100, 250, 450, 700, 2700]);
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(99), 1);
  assert.equal(levelForXp(100), 2);
  assert.equal(levelForXp(249), 2);
  assert.equal(levelForXp(250), 3);
  assert.equal(levelForXp(2700), 10);
  assert.equal(levelForXp(5000), 13);
});

test("level is derived, and daily bonus applies once per Seoul day", () => {
  const first = applyTap(fresh(), T0, { counter: noCounter, rng: () => 0 });
  assert.equal(first.xpGain, 40);
  assert.equal(first.isFirstOfDay, true);
  const second = applyTap(
    fresh({ lastRewardedAt: null, lastGiftDay: seoulDayKey(T0) }),
    T0 + 31 * 60 * 1000,
    { counter: noCounter, rng: () => 0 },
  );
  assert.equal(second.xpGain, 10);
  assert.equal(second.isFirstOfDay, false);
  const nextDay = applyTap(
    fresh({ lastRewardedAt: null, lastGiftDay: seoulDayKey(T0) }),
    T0 + 24 * HOUR,
    { counter: noCounter, rng: () => 0 },
  );
  assert.equal(nextDay.xpGain, 40);
});

test("gift granted once per Seoul day", () => {
  const first = applyTap(fresh(), T0, { counter: noCounter, rng: () => 0 });
  assert.ok(first.gift);
  const second = applyTap(
    fresh({ lastRewardedAt: null, lastGiftDay: seoulDayKey(T0) }),
    T0 + 31 * 60 * 1000,
    { counter: noCounter, rng: () => 0 },
  );
  assert.equal(second.gift, null);
});

test("tier roll with fixed rng", () => {
  assert.equal(rollGiftTier(() => 0), "common");
  assert.equal(rollGiftTier(() => 0.79), "common");
  assert.equal(rollGiftTier(() => 0.8), "special");
  assert.equal(rollGiftTier(() => 0.969), "special");
  assert.equal(rollGiftTier(() => 0.971), "rare");
  assert.equal(rollGiftTier(() => 0.999), "rare");
  assert.equal(rollGiftTier(() => 0, "rare"), "rare");
});

test("no repeat within a tier, reset on exhaustion", () => {
  const s = fresh({ seen_common: ["c01"] });
  const picks = new Set();
  for (let i = 0; i < 21; i++) {
    const { gift } = pickGift({ ...s, seen_common: [...s.seen_common, ...picks] }, () => 0, "common");
    picks.add(gift.id);
  }
  assert.equal(picks.size, 21);
  assert.ok(!picks.has("c01"));
  const all = fresh({ seen_common: Array.from({ length: 22 }, (_, i) => `c${String(i + 1).padStart(2, "0")}`) });
  const { gift } = pickGift(all, () => 0, "common");
  assert.match(gift.id, /^c\d\d$/);
});

test("parseTapUid keeps the 14-char serial", () => {
  assert.deepEqual(parseTapUid("04AAAAAAAAAAA1"), { serial: "04AAAAAAAAAAA1", counter: null });
  assert.deepEqual(parseTapUid("04AAAAAAAAAAA1x00000A"), { serial: "04AAAAAAAAAAA1", counter: 10 });
  assert.equal(parseTapUid("bad"), null);
  assert.equal(parseTapUid("04aaaaaaaaaaa1"), null);
  assert.equal(parseTapUid("04AAAAAAAAAAA1xZZZZZZ"), null);
  assert.equal(parseTapUid("04AAAAAAAAAAA"), null);
});

test("reunion flag when decayed mood is at most 30", () => {
  const sad = applyTap(fresh({ moodValue: 100, moodUpdatedAt: T0 - 60 * HOUR }), T0, { counter: noCounter, rng: () => 0 });
  assert.equal(sad.reunion, true);
  assert.equal(sad.moodBefore, 25);
  const glad = applyTap(fresh(), T0, { counter: noCounter, rng: () => 0 });
  assert.equal(glad.reunion, false);
});
