import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";
import { DEFAULT_KIND, KINDS, KIND_IDS, kindOf } from "../public/kinds.js";
import * as binding from "./binding.js";
import { hash, ownerToken, recoveryCode } from "./secrets.js";
import { EMPTY_FOUND, EMPTY_SEEN } from "./db.js";
import { GIFT_COUNT as GIFT_TOTAL, GIFT_TIERS, GIFTS } from "./gifts.js";
import { PET, applyTap, currentMood, levelForXp, parseTapUid, seoulDayKey, xpProgress } from "./pet.js";
import { applyCare, careWant, mealsNow, playsNow } from "./care.js";
import { comboNext, comboTap } from "./combo.js";
import { ARCADE, applyPlay, applyRace, raceState, xpPlaysLeft } from "./arcade.js";
import { FARM, addGiftSeeds, buySeed, farmDot, farmView, feedCrop, giftSeeds, harvestFarm, nextRipeAt, openFarm, parseFarm, pickPlot, ripenFarm, sendCrops } from "./farm.js";
import { KIND_CSS, awayLine, devPage, heartHalves, milestoneLine, page, petPage, previewPetPage, strangerPage, themeOf } from "./pages.js";
import { mountTalk, purgeTalk, takeQuestion } from "./chat.js";
import { EDITIONS, STAT_KEYS, editionOf, parseStats, setBoost, statSheet, train, useBoost } from "./stats.js";

const cookieAge = 400 * 24 * 60 * 60 * 1000;
const cooldown = 15 * 60 * 1000;
const skipAge = 2 * 60 * 1000;
const validUid = (uid) => typeof uid === "string" && /^[0-9A-F]{14}$/.test(uid);
const CARE_ACTS = ["feed", "play", "sleep"];
const validHeight = (h) => Number.isInteger(h) && h % 10 === 0 && h >= 0 && h <= ARCADE.maxHeight;
const FARM_ACTS = ["open", "pick", "harvest", "feed", "send", "buy"];
const PANTRY_ACTS = ["feed", "send", "buy"];
const validPlot = (p) => Number.isInteger(p) && p >= 0 && p < FARM.plots;
const validCrop = (id) => typeof id === "string" && Object.hasOwn(FARM.crops, id);
const validCrops = (a) => Array.isArray(a) && a.length >= 1 && a.length <= FARM.pantryMax && a.every(validCrop);
const TOGGLE_KINDS = KINDS.filter((k) => k.toggle).map((k) => k.id);
const parseDemoUids = (raw) => String(raw || "").split(",").map((s) => s.trim().toUpperCase()).filter(validUid);
const daysApart = (from, to) => (Date.parse(to) - Date.parse(from)) / (24 * 60 * 60 * 1000);

const STALE_LINE = "폰을 진짜 저한테 톡 대 주세요!";
const COOLDOWN_LINE = "방금 토닥여 줘서 기분 좋아요! 조금 있다가 또 토닥여 주세요.";
const UNREWARDED_LINES = {
  cooldown: COOLDOWN_LINE,
  cap: "오늘은 실컷 놀았어요! 내일 또 만나요!",
  stale: STALE_LINE,
};
const LONELY_LINE = "혼자 있어서 심심했어요...";
const REUNION_LINE = "보고 싶었어요! 진짜로요!";

function parseSeen(text) {
  const clean = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === "string") : []);
  try {
    const v = JSON.parse(text || "");
    if (!v || typeof v !== "object") return { common: [], special: [], rare: [] };
    return { common: clean(v.common), special: clean(v.special), rare: clean(v.rare) };
  } catch {
    return { common: [], special: [], rare: [] };
  }
}

function parseFound(text) {
  try {
    const v = JSON.parse(text || "");
    return Array.isArray(v) ? v.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function petState(row, t) {
  const seen = parseSeen(row.gift_seen);
  return {
    moodValue: row.mood_value ?? 70,
    moodUpdatedAt: row.mood_updated_at ?? t,
    xp: row.xp ?? 0,
    lastRewardedAt: row.last_rewarded_at ?? null,
    rewardDay: row.reward_day ?? null,
    rewardDayCount: row.reward_day_count ?? 0,
    lastGiftDay: row.last_gift_day ?? null,
    lastActiveDay: row.last_active_day ?? null,
    lastCounter: row.last_counter ?? null,
    nextGiftTier: GIFT_TIERS.includes(row.next_gift_tier) ? row.next_gift_tier : null,
    fedAt: row.fed_at ?? null,
    meals: row.meals ?? 0,
    playedAt: row.played_at ?? null,
    plays: row.plays ?? 0,
    sleptAt: row.slept_at ?? null,
    comboCount: row.combo_count ?? 0,
    comboAt: row.combo_at ?? null,
    arcadeDay: row.arcade_day ?? null,
    arcadePlays: row.arcade_plays ?? 0,
    giBest: row.gi_best ?? 0,
    seen_common: seen.common,
    seen_special: seen.special,
    seen_rare: seen.rare,
  };
}

export function createApp({ db, decisions = binding, production = process.env.NODE_ENV === "production", now = Date.now, rng = Math.random, demoUids = parseDemoUids(process.env.DEMO_UIDS), openUids = parseDemoUids(process.env.OPEN_UIDS), guestUids = parseDemoUids(process.env.GUEST_UIDS), rareUids = parseDemoUids(process.env.RARE_UIDS), legendaryUids = parseDemoUids(process.env.LEGENDARY_UIDS), talk = null }) {
  const anyone = [...new Set([...openUids, ...guestUids])];
  if (anyone.length) {
    const base = decisions;
    decisions = {
      ...base,
      resolveTap: (row, ...args) => row && anyone.includes(row.uid) ? "OWNER" : base.resolveTap(row, ...args),
      canRename: (row, ...args) => row && anyone.includes(row.uid) ? true : base.canRename(row, ...args),
    };
    demoUids = [...new Set([...demoUids, ...openUids])];
    if (talk) talk = { ...talk, uids: [...new Set([...talk.uids, ...anyone])] };
  }
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'self'; style-src 'self' https://cdn.jsdelivr.net; font-src 'self' https://cdn.jsdelivr.net; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    });
    next();
  });
  // Before the body parsers, so their error pages still get the theme.
  app.use(cookieParser());
  app.use((req, res, next) => {
    req.theme = themeOf(req.cookies?.theme).id;
    next();
  });
  app.use(express.urlencoded({ extended: false, limit: "4kb" }));
  app.use(express.json({ limit: "4kb" }));
  app.use(express.static(fileURLToPath(new URL("../public", import.meta.url)), {
    setHeaders(res, filePath) {
      // Vendor files carry their version in the name, so they never change in place.
      if (/[\\/]public[\\/]vendor[\\/]/.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else if (/\.(?:png|jpe?g|gif|webp|svg|ico|mp4|mp3)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=86400");
      }
    },
  }));

  // Dad demo: ?mascot= picks a switch kind (cookie), else none was said. Does not touch binding.js.
  const resolveDemoMascot = (req, res) => {
    const q = typeof req.query?.mascot === "string" ? req.query.mascot : "";
    if (TOGGLE_KINDS.includes(q)) {
      res.cookie("mascot", q, { httpOnly: false, sameSite: "lax", secure: production, maxAge: cookieAge, path: "/" });
      return q;
    }
    return TOGGLE_KINDS.includes(req.cookies?.mascot) ? req.cookies.mascot : "";
  };
  app.use((req, res, next) => {
    const mascot = resolveDemoMascot(req, res);
    req.demoMascot = mascot;
    if (!mascot || mascot === DEFAULT_KIND) return next();
    const send = res.send.bind(res);
    const from = `mascot-${DEFAULT_KIND}`;
    res.send = (body) => {
      if (typeof body === "string" && body.includes(from) && !body.includes('name="pet-kind"')) {
        // Keep the admin picker's icons as they are; only rewrite pet frames outside it.
        const parts = body.split(/(<aside class="mascot-toggle"[\s\S]*?<\/aside>)/);
        body = parts
          .map((part) =>
            part.startsWith('<aside class="mascot-toggle"')
              ? part
              : part.split(from).join(`mascot-${mascot}`),
          )
          .join("");
      }
      return send(body);
    };
    next();
  });

  const getRow = (uid) => db.prepare("SELECT * FROM plushies WHERE uid = ?").get(uid) || null;
  const editions = { rare: rareUids, legendary: legendaryUids };
  const sheetOf = (row, stats, kind) => statSheet(stats, kind, editionOf(row.uid, editions, row.edition));
  // The saved animal wins over this browser's toggle.
  const animalOf = (row, req) => row.kind || req.demoMascot || DEFAULT_KIND;
  const cardOf = (row, req) => {
    const kind = animalOf(row, req);
    return { kind, edition: editionOf(row.uid, editions, row.edition), sheet: sheetOf(row, parseStats(row.stats), kind) };
  };

  // One care beat's write, for 밥 놀이 잠 and for a hungry pet's farm snack.
  function saveCare(uid, out, t) {
    const c = out.care;
    if (out.beat !== "stash" && out.beat !== "mumble") {
      db.prepare("UPDATE plushies SET fed_at = ?, meals = ?, played_at = ?, plays = ?, slept_at = ? WHERE uid = ?")
        .run(c.fedAt, c.meals, c.playedAt, c.plays, c.sleptAt, uid);
    }
    if (out.gain > 0) db.prepare("UPDATE plushies SET mood_value = ?, mood_updated_at = ? WHERE uid = ?").run(out.moodAfter, t, uid);
  }
  const setOwner = (res, token) => res.cookie("owner_token", token, {
    httpOnly: true, sameSite: "lax", secure: production, maxAge: cookieAge, path: "/",
  });
  const celebrateCookie = { httpOnly: true, sameSite: "lax", secure: production, path: "/", maxAge: 120 * 1000 };
  const setCelebrate = (res, kind) => res.cookie("celebrate", kind, celebrateCookie);
  const clearCelebrate = (res) => res.clearCookie("celebrate", {
    httpOnly: true, sameSite: "lax", secure: production, path: "/",
  });
  const takeCelebrate = (req, res) => {
    const raw = req.cookies.celebrate;
    const kind = raw === "claim" || raw === "named" ? raw : "";
    if (kind) clearCelebrate(res);
    return kind;
  };
  const skipCookie = { httpOnly: true, sameSite: "lax", secure: production, path: "/", maxAge: skipAge };
  const setSkip = (res, serial) => res.cookie("pet_skip", serial, skipCookie);
  const clearSkip = (res) => res.clearCookie("pet_skip", {
    httpOnly: true, sameSite: "lax", secure: production, path: "/",
  });
  const talks = (uid) => Boolean(talk?.uids.includes(uid));
  const invalidUid = (req, res) => res.status(400).send(page(null, "<p>어? 링크가 이상해요. 인형에 폰을 다시 톡 대 주세요.</p>", { theme: req.theme }));

  function writePetReward(serial, st, out, row, t, today) {
    const seen = { common: [...st.seen_common], special: [...st.seen_special], rare: [...st.seen_rare] };
    let found = parseFound(row.gift_found);
    let giftDay = st.lastGiftDay;
    if (out.gift) {
      const tier = out.gift.tier;
      const ids = GIFTS[tier].map((g) => g.id);
      seen[tier] = ids.every((id) => st[`seen_${tier}`].includes(id)) ? [out.gift.gift.id] : [...st[`seen_${tier}`], out.gift.gift.id];
      if (!found.includes(out.gift.gift.id)) found.push(out.gift.gift.id);
      giftDay = out.giftDay;
    }
    const after = xpProgress(out.xpAfter);
    db.prepare(`UPDATE plushies SET mood_value = ?, mood_updated_at = ?, xp = ?, last_rewarded_at = ?,
      reward_day = ?, reward_day_count = ?, last_gift_day = ?, gift_seen = ?, gift_found = ?,
      days_together = ?, last_active_day = ?, next_gift_tier = NULL WHERE uid = ?`).run(
      out.moodAfter, t, out.xpAfter, t, today, out.dayCountAfter, giftDay,
      JSON.stringify(seen), JSON.stringify(found),
      out.newActiveDay ? (row.days_together ?? 1) + 1 : (row.days_together ?? 1),
      out.newActiveDay ? today : st.lastActiveDay, serial,
    );
    const farm = out.gift ? parseFarm(row.farm) : null;
    if (farm) {
      const seeds = giftSeeds(out.gift.tier, levelForXp(out.xpAfter), rng);
      db.prepare("UPDATE plushies SET farm = ? WHERE uid = ?").run(JSON.stringify(addGiftSeeds(farm, seeds)), serial);
    }
    return { after, foundCount: found.length };
  }

  function petView(fresh, st, out, t, extra = {}) {
    const xpNow = xpProgress(st.xp);
    const moodBefore = out.rewarded ? out.moodBefore : currentMood(st, t);
    const moodAfter = out.rewarded ? out.moodAfter : moodBefore;
    const leveledUp = Boolean(out.rewarded && out.leveledUp);
    const level = out.rewarded ? extra.after.level : xpNow.level;
    const care = petState(fresh, t);
    const farmRow = extra.farmRow || fresh;
    const farm = parseFarm(farmRow.farm);
    return {
      rewarded: out.rewarded,
      reason: out.reason || "",
      moodBefore: Math.round(moodBefore * 10) / 10,
      moodAfter: Math.round(moodAfter * 10) / 10,
      lonely: moodAfter <= PET.moodLonelyAt,
      reunion: Boolean(out.rewarded && out.reunion),
      leveledUp,
      level,
      levelUpLine: leveledUp ? `쑥쑥 컸어요! 이제 Lv. ${level}!` : "",
      xpInto: out.rewarded ? extra.after.into : xpNow.into,
      xpSpan: out.rewarded ? extra.after.span : xpNow.span,
      gift: out.gift || null,
      giftFound: out.rewarded ? extra.foundCount : parseFound(fresh.gift_found).length,
      giftTotal: GIFT_TOTAL,
      days: fresh.days_together ?? 1,
      unrewardedLine: out.rewarded || extra.morning || extra.combo > 0 || extra.visit ? "" : (UNREWARDED_LINES[out.reason] || ""),
      // The key says 한 번 더 톡!, so a combo page saves the line for after the key runs out.
      comboLaterLine: out.rewarded || extra.morning || !(extra.combo > 0) ? "" : (UNREWARDED_LINES[out.reason] || ""),
      lonelyLine: !out.rewarded && moodAfter <= PET.moodLonelyAt ? LONELY_LINE : "",
      // The away line already speaks for the time apart, so the reunion keeps its jump but not its line.
      reunionLine: out.rewarded && out.reunion && !extra.away ? REUNION_LINE : "",
      awayLine: extra.away || "",
      want: careWant(care, t) || "",
      meals: mealsNow(care, t),
      plays: playsNow(care, t),
      morning: Boolean(extra.morning),
      asleep: Boolean(extra.asleep),
      view: Boolean(extra.view),
      combo: extra.combo || 0,
      arcadeLeft: xpPlaysLeft(care, t),
      giBest: care.giBest,
      race: raceState(fresh.race),
      farm: { dot: farmDot(farm, levelForXp(farmRow.xp ?? 0), t), next: farm ? nextRipeAt(farm, t) : null, now: t, visit: extra.visit || null },
    };
  }

  // A reported game trains its stat once a Seoul day and spends that stat's snack boost.
  function playStats(row, key, t) {
    const trained = train(parseStats(row.stats), key, t);
    const spent = useBoost(trained.stats, key);
    return { stats: spent.stats, trained: { stat: key, gained: trained.gained }, boostUsed: spent.used };
  }

  // Saves a farm action's field, XP and stats, then answers like /arcade with the field and the stat sheet.
  function farmReply(uid, row, act, farm, xpGain, stats, animal, t, extra) {
    const xp = row.xp ?? 0;
    const xpAfter = xp + xpGain;
    db.prepare("UPDATE plushies SET farm = ?, xp = ?, stats = ? WHERE uid = ?").run(JSON.stringify(farm), xpAfter, JSON.stringify(stats), uid);
    const after = xpProgress(xpAfter);
    return {
      ok: true,
      act,
      ...extra,
      xpGain,
      level: after.level,
      leveledUp: levelForXp(xpAfter) > levelForXp(xp),
      xpInto: after.into,
      xpSpan: after.span,
      hearts: heartHalves(currentMood(petState(getRow(uid), t), t)),
      farm: farmView(farm, after.level, t),
      stats: sheetOf(row, stats, animal),
    };
  }

  // One farm action on a named, awake pet; null when there is no farm to pick from.
  function tendFarm(uid, row, act, plot, t, animal) {
    const farm = parseFarm(row.farm);
    if (!farm && act !== "open") return null;
    const xp = row.xp ?? 0;
    let stats = parseStats(row.stats);
    const sheet = sheetOf(row, stats, animal);
    const bonus = { intBonus: sheet.int.bonus, chaBonus: sheet.cha.bonus };
    const out = act === "open" ? openFarm(farm, xp, t, bonus) : act === "pick" ? pickPlot(farm, xp, t, plot, bonus) : harvestFarm(farm, xp, t, bonus);
    let gained = 0;
    if (out.picked.length) {
      ({ stats, gained } = train(stats, "int", t));
      stats = useBoost(stats, "int").stats;
    }
    if (out.bused.length) stats = useBoost(stats, "cha").stats;
    if (out.picked.some((p) => p.crop === "gold")) {
      db.prepare("UPDATE plushies SET mood_value = ?, mood_updated_at = ? WHERE uid = ?").run(PET.moodMax, t, uid);
    }
    return farmReply(uid, row, act, out.farm, out.xpGain, stats, animal, t, {
      created: out.created,
      picked: out.picked,
      planted: out.planted,
      opened: out.opened,
      seeds: out.seeds,
      coinsGain: out.coinsGain,
      bused: out.bused,
      ...(act === "open" ? {} : { trained: { stat: "int", gained } }),
    });
  }

  // Feed a pantry crop, send crops on the bus or buy a seed; null when the crop, the room or the coins aren't there.
  function pantryFarm(uid, row, { act, crop, crops }, t, animal) {
    const farm = parseFarm(row.farm);
    if (!farm) return null;
    let stats = parseStats(row.stats);
    if (act === "feed") {
      const out = feedCrop(farm, crop, t);
      if (!out) return null;
      const { stat, amount } = out.snack;
      let set = false;
      for (const key of stat === "all" ? STAT_KEYS : [stat]) {
        const boosted = setBoost(stats, key, amount);
        stats = boosted.stats;
        set ||= boosted.set;
      }
      // A hungry pet takes the crop as its 밥 too, so the reply carries the dock's care state like /care.
      const st = petState(row, t);
      const meal = careWant(st, t) === "feed";
      if (meal) saveCare(uid, applyCare(st, "feed", t), t);
      const care = petState(getRow(uid), t);
      return farmReply(uid, row, act, out.farm, out.xpGain, stats, animal, t, {
        crop, boost: { stat, amount, set }, meal,
        lonely: currentMood(care, t) <= PET.moodLonelyAt, want: careWant(care, t), meals: mealsNow(care, t), plays: playsNow(care, t),
      });
    }
    if (act === "send") {
      const out = sendCrops(farm, crops, sheetOf(row, stats, animal).cha.bonus, t);
      if (!out) return null;
      return farmReply(uid, row, act, out.farm, out.xpGain, useBoost(stats, "cha").stats, animal, t, { crops, coinsGain: out.coinsGain });
    }
    const out = buySeed(farm, crop, levelForXp(row.xp ?? 0));
    if (!out) return null;
    return farmReply(uid, row, act, out.farm, 0, stats, animal, t, { crop, price: out.price });
  }

  app.get("/health", (req, res) => res.type("text").send("ok"));
  app.get("/kinds.css", (req, res) => res.type("css").send(KIND_CSS));
  app.get("/t", (req, res) => {
    // The open farm page sets farm_at; any tap spends it.
    const farmAt = req.cookies.farm_at;
    if (farmAt !== undefined) res.clearCookie("farm_at", { sameSite: "lax", secure: production, path: "/" });
    const parsed = parseTapUid(req.query.uid);
    if (!parsed) return invalidUid(req, res);
    const serial = parsed.serial;
    const counter = parsed.counter;
    const demo = demoUids.includes(serial) ? serial : "";
    // No browser ever holds a guest pet's token or code, so dropping it from GUEST_UIDS locks everyone out.
    const guest = guestUids.includes(serial);
    const theme = req.theme;
    const result = db.transaction(() => {
      const row = getRow(serial);
      const state = decisions.resolveTap(row, req.cookies.owner_token || null, hash);
      const t = now();
      const today = seoulDayKey(t);
      const stamp = new Date(t).toISOString();
      if (state === "NEW") {
        const existing = req.cookies.owner_token;
        const token = !guest && typeof existing === "string" && existing ? existing : ownerToken();
        const code = recoveryCode();
        purgeTalk(db, serial);
        db.prepare(`INSERT INTO plushies (uid, owner_token_hash, recovery_code_hash, tap_count, created_at, last_tap_at,
          mood_value, mood_updated_at, xp, reward_day_count, gift_seen, gift_found, days_together, last_active_day, last_counter)
          VALUES (?, ?, ?, 1, ?, ?, 100, ?, 0, 0, ?, ?, 1, ?, ?)`)
          .run(serial, hash(token), guest ? null : hash(code), stamp, stamp, t, EMPTY_SEEN, EMPTY_FOUND, today, counter);
        const fresh = getRow(serial);
        return { html: petPage(fresh, code, { celebrate: "claim", demo, theme, guest, card: cardOf(fresh, req) }), token: guest ? null : token };
      }
      if (state === "OWNER") {
        // The skip cookie marks the redirect after /name or /claim, not a tap; view=1 is a phone page's own reload.
        const skip = req.cookies.pet_skip === serial;
        const view = !skip && req.query.view === "1";
        if (!skip && !view) db.prepare("UPDATE plushies SET tap_count = tap_count + 1, last_tap_at = ? WHERE uid = ?").run(stamp, serial);
        const afterTap = getRow(serial);
        // Safari ends the script-set mascot cookie after 7 days while localStorage keeps the animal, so without it the page fills the kind.
        if (afterTap.pet_name && !afterTap.kind && req.demoMascot) db.prepare("UPDATE plushies SET kind = ? WHERE uid = ?").run(req.demoMascot, serial);
        const raiseMirror = () => {
          if (counter !== null && (afterTap.last_counter === null || counter > afterTap.last_counter)) {
            db.prepare("UPDATE plushies SET last_counter = ? WHERE uid = ?").run(counter, serial);
          }
        };
        const flash = takeCelebrate(req, res);
        // The owner's next visit after 잠 wakes the pet; strangers and reloads never do.
        const morning = !view && Boolean(afterTap.pet_name) && afterTap.slept_at !== null;
        if (morning) db.prepare("UPDATE plushies SET slept_at = NULL WHERE uid = ?").run(serial);
        if (skip || (view && afterTap.pet_name)) {
          if (skip) clearSkip(res);
          raiseMirror();
          const skipped = getRow(serial);
          const asleep = view && Boolean(skipped.pet_name) && skipped.slept_at !== null;
          const pet = petView(skipped, petState(skipped, t), { rewarded: false }, t, { morning, asleep, view });
          return { html: petPage(skipped, null, { celebrate: flash, pet, demo, found: parseFound(skipped.gift_found), theme, talk: talks(serial), guest, card: cardOf(skipped, req) }) };
        }
        if (!afterTap.pet_name) {
          raiseMirror();
          const fresh = getRow(serial);
          return { html: petPage(fresh, null, { celebrate: flash, demo, theme, card: cardOf(fresh, req) }) };
        }
        const st = petState(afterTap, t);
        const out = applyTap(st, t, {
          counter: { present: counter !== null, missing: counter === null, value: counter },
          rng,
        });
        raiseMirror();
        let extra = null;
        if (out.rewarded) extra = writePetReward(serial, st, out, getRow(serial), t, today);
        const fresh = getRow(serial);
        // The day's first tap after a missed Seoul day opens with what happened meanwhile; a morning has its own wake line.
        const away = out.rewarded && out.newActiveDay && !morning && daysApart(st.lastActiveDay, today) >= 2 ? awayLine(parseFarm(fresh.farm), t) : "";
        const mile = milestoneLine(fresh.tap_count);
        let visual = flash;
        if (!visual && out.rewarded && out.leveledUp) visual = "levelup";
        else if (!visual && out.rewarded && out.reunion) visual = "reunion";
        else if (!visual && mile) visual = "milestone";
        else if (!visual && out.rewarded && out.gift && out.gift.tier === "rare") visual = "rare";
        else if (!visual && out.rewarded && out.gift && out.gift.tier === "special") visual = "special";
        const visit = farmAt === serial && !morning && parseFarm(fresh.farm) ? tendFarm(serial, fresh, "harvest", null, t, animalOf(fresh, req)) : null;
        // A celebration, a morning or a farm visit takes the whole visit; a stale reload is not a tap.
        let combo = 0;
        if (morning || visual || visit) {
          db.prepare("UPDATE plushies SET combo_count = 0, combo_at = NULL WHERE uid = ?").run(serial);
        } else if (out.reason !== "stale") {
          // The page saw this chain's key run out, so the tap starts over though the server's window has 2 s left.
          const ended = req.cookies.combo_done === serial;
          if (ended) res.clearCookie("combo_done", { path: "/" });
          const c = comboTap(ended ? { comboCount: 0, comboAt: null } : st, t);
          if (!c.same) db.prepare("UPDATE plushies SET combo_count = ?, combo_at = ? WHERE uid = ?").run(c.comboCount, c.comboAt, serial);
          combo = c.combo;
        }
        // A follow-up waits for a visit with nothing to celebrate.
        const ask = talks(serial) && !visual && !morning && !visit && !away && combo <= 1 ? takeQuestion(db, serial, today) : "";
        return { html: petPage(fresh, null, { celebrate: visual, pet: petView(fresh, st, out, t, { ...extra, morning, combo, visit, away, farmRow: visit ? getRow(serial) : fresh }), demo, found: parseFound(fresh.gift_found), theme, talk: talks(serial), ask, guest, card: cardOf(getRow(serial), req) }) };
      }
      if (state === "STRANGER") return { html: strangerPage(row, "", { demo, theme, card: cardOf(row, req) }) };
      throw new Error("Invalid binding result");
    })();
    if (result.token) setOwner(res, result.token);
    res.send(result.html);
  });

  app.post("/name", (req, res) => {
    const { uid, name } = req.body || {};
    if (!validUid(uid)) return invalidUid(req, res);
    const row = getRow(uid);
    if (!decisions.canRename(row, req.cookies.owner_token || null, hash)) {
      return res.status(403).send(row ? strangerPage(row, "", { theme: req.theme, card: cardOf(row, req) }) : page(null, "<p>먼저 인형에 폰을 톡 대서 친구를 만나 보세요.</p>", { theme: req.theme }));
    }
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (!trimmed || Array.from(trimmed).length > 24) {
      return res.status(400).send(page(row, `<p>이름은 1글자에서 24글자 사이로 지어주세요.</p><a class="button" href="/t?uid=${uid}">다시 지어볼래요</a>`, { theme: req.theme }));
    }
    const firstName = !row.pet_name;
    db.prepare("UPDATE plushies SET pet_name = ? WHERE uid = ?").run(trimmed, uid);
    if (firstName) setCelebrate(res, "named");
    setSkip(res, uid);
    res.redirect(303, `/t?uid=${uid}`);
  });

  app.post("/care", (req, res) => {
    const { uid, act } = req.body || {};
    if (!validUid(uid) || !CARE_ACTS.includes(act)) return res.status(400).json({ ok: false });
    const reply = db.transaction(() => {
      const row = getRow(uid);
      if (!decisions.canRename(row, req.cookies.owner_token || null, hash) || !row.pet_name) return null;
      const t = now();
      const st = petState(row, t);
      const out = applyCare(st, act, t);
      saveCare(uid, out, t);
      // The day's first real care trains 매력; a stash or a mumble changes nothing.
      let stats = parseStats(row.stats);
      let gained = 0;
      if (out.beat !== "stash" && out.beat !== "mumble") {
        ({ stats, gained } = train(stats, "cha", t));
        if (gained) db.prepare("UPDATE plushies SET stats = ? WHERE uid = ?").run(JSON.stringify(stats), uid);
      }
      const after = { ...st, ...out.care };
      return {
        ok: true,
        beat: out.beat,
        gain: out.gain,
        hearts: heartHalves(out.moodAfter),
        lonely: out.moodAfter <= PET.moodLonelyAt,
        want: careWant(after, t),
        meals: mealsNow(after, t),
        plays: playsNow(after, t),
        trained: { stat: "cha", gained },
        stats: sheetOf(row, stats, animalOf(row, req)),
      };
    })();
    if (!reply) return res.status(403).json({ ok: false });
    res.json(reply);
  });

  // The open page's tap with no key up starts its chain in place, scored as /t would; anything /t celebrates gives 0.
  function startChain(uid, row, st, counter, t) {
    const again = comboTap(st, t);
    if (again.same) return { ok: true, combo: again.combo, same: true, tapCount: row.tap_count };
    if (row.slept_at !== null || milestoneLine(row.tap_count + 1)) return { ok: true, combo: 0 };
    const out = applyTap(st, t, { counter: { present: counter !== null, missing: counter === null, value: counter }, rng });
    const mood = out.rewarded ? out.moodAfter : currentMood(st, t);
    const big = out.rewarded
      ? out.leveledUp || out.reunion || out.gift || out.newActiveDay
      : out.reason === "stale" || mood <= PET.moodLonelyAt;
    if (big) return { ok: true, combo: 0 };
    db.prepare("UPDATE plushies SET tap_count = tap_count + 1, last_tap_at = ?, combo_count = 1, combo_at = ? WHERE uid = ?")
      .run(new Date(t).toISOString(), t, uid);
    if (counter !== null && (st.lastCounter === null || counter > st.lastCounter)) {
      db.prepare("UPDATE plushies SET last_counter = ? WHERE uid = ?").run(counter, uid);
    }
    if (out.rewarded) writePetReward(uid, st, out, getRow(uid), t, seoulDayKey(t));
    const fresh = getRow(uid);
    const xp = xpProgress(fresh.xp);
    return {
      ok: true,
      combo: 1,
      same: false,
      tapCount: fresh.tap_count,
      rewarded: out.rewarded,
      hearts: heartHalves(mood),
      level: xp.level,
      xpInto: xp.into,
      xpSpan: xp.span,
      later: out.rewarded ? "" : UNREWARDED_LINES[out.reason] || "",
    };
  }

  app.post("/combo", (req, res) => {
    const parsed = parseTapUid(req.body?.uid);
    if (!parsed) return res.status(400).json({ ok: false });
    const { serial: uid, counter } = parsed;
    const reply = db.transaction(() => {
      const row = getRow(uid);
      if (!decisions.canRename(row, req.cookies.owner_token || null, hash) || !row.pet_name) return null;
      const t = now();
      const st = petState(row, t);
      if (req.body.start === true) return startChain(uid, row, st, counter, t);
      const stale = counter === null ? st.lastCounter !== null : st.lastCounter !== null && !(counter > st.lastCounter);
      const c = row.slept_at === null && !stale ? comboNext(st, t) : null;
      // A milestone needs /t's celebration, so the page loads that tap in full.
      if (!c || (!c.same && milestoneLine(row.tap_count + 1))) return { ok: true, combo: 0 };
      if (!c.same) {
        db.prepare("UPDATE plushies SET tap_count = tap_count + 1, last_tap_at = ?, combo_count = ?, combo_at = ? WHERE uid = ?")
          .run(new Date(t).toISOString(), c.comboCount, c.comboAt, uid);
        if (counter !== null && (st.lastCounter === null || counter > st.lastCounter)) {
          db.prepare("UPDATE plushies SET last_counter = ? WHERE uid = ?").run(counter, uid);
        }
      }
      return { ok: true, combo: c.combo, same: c.same, tapCount: getRow(uid).tap_count };
    })();
    if (!reply) return res.status(403).json({ ok: false });
    res.json(reply);
  });

  app.post("/arcade", (req, res) => {
    if (req.body?.game === "race") {
      const { uid, rival, won } = req.body;
      if (!validUid(uid) || !KIND_IDS.includes(rival) || typeof won !== "boolean") return res.status(400).json({ ok: false });
      const reply = db.transaction(() => {
        const row = getRow(uid);
        if (!decisions.canRename(row, req.cookies.owner_token || null, hash) || !row?.pet_name) return 403;
        if (row.slept_at !== null) return 409;
        const t = now();
        const st = petState(row, t);
        const out = applyRace(st, raceState(row.race), rival, won, t);
        const xp = st.xp + out.xpGain;
        const { stats, trained, boostUsed } = playStats(row, "agi", t);
        db.prepare("UPDATE plushies SET arcade_day = ?, arcade_plays = ?, race = ?, xp = ?, stats = ? WHERE uid = ?")
          .run(out.arcadeDay, out.arcadePlays, JSON.stringify(out.race), xp, JSON.stringify(stats), uid);
        const after = xpProgress(xp);
        return { ok: true, race: out.race, rivalLevel: out.rivalLevel, xpGain: out.xpGain, xpLeft: out.xpLeft,
          level: after.level, leveledUp: after.level > levelForXp(st.xp), xpInto: after.into, xpSpan: after.span,
          trained, boostUsed, stats: sheetOf(row, stats, animalOf(row, req)) };
      })();
      if (typeof reply === "number") return res.status(reply).json({ ok: false });
      return res.json(reply);
    }
    const { uid, game, height } = req.body || {};
    if (!validUid(uid) || game !== "gi" || !validHeight(height)) return res.status(400).json({ ok: false });
    const reply = db.transaction(() => {
      const row = getRow(uid);
      if (!decisions.canRename(row, req.cookies.owner_token || null, hash) || !row.pet_name) return 403;
      if (row.slept_at !== null) return 409;
      const t = now();
      const st = petState(row, t);
      const out = applyPlay(st, height, t);
      const xpAfter = st.xp + out.xpGain;
      const { stats, trained, boostUsed } = playStats(row, "str", t);
      db.prepare("UPDATE plushies SET arcade_day = ?, arcade_plays = ?, gi_best = ?, xp = ?, stats = ? WHERE uid = ?")
        .run(out.arcadeDay, out.arcadePlays, out.best, xpAfter, JSON.stringify(stats), uid);
      const after = xpProgress(xpAfter);
      return {
        ok: true,
        xpGain: out.xpGain,
        xpLeft: out.xpLeft,
        best: out.best,
        isBest: out.isBest,
        level: after.level,
        leveledUp: levelForXp(xpAfter) > levelForXp(st.xp),
        xpInto: after.into,
        xpSpan: after.span,
        trained,
        boostUsed,
        stats: sheetOf(row, stats, animalOf(row, req)),
      };
    })();
    if (typeof reply === "number") return res.status(reply).json({ ok: false });
    res.json(reply);
  });

  app.post("/farm", (req, res) => {
    const { uid, act, plot, crop, crops } = req.body || {};
    if (!validUid(uid) || !FARM_ACTS.includes(act) || (act === "pick" && !validPlot(plot))
      || ((act === "feed" || act === "buy") && !validCrop(crop)) || (act === "send" && !validCrops(crops))) return res.status(400).json({ ok: false });
    const reply = db.transaction(() => {
      const row = getRow(uid);
      if (!decisions.canRename(row, req.cookies.owner_token || null, hash) || !row.pet_name) return 403;
      if (row.slept_at !== null) return 409;
      const animal = animalOf(row, req);
      const out = PANTRY_ACTS.includes(act) ? pantryFarm(uid, row, { act, crop, crops }, now(), animal) : tendFarm(uid, row, act, plot, now(), animal);
      return out || 409;
    })();
    if (typeof reply === "number") return res.status(reply).json({ ok: false });
    res.json(reply);
  });

  app.post("/kind", (req, res) => {
    const { uid, kind, fill } = req.body || {};
    if (!validUid(uid) || !TOGGLE_KINDS.includes(kind)) return res.status(400).json({ ok: false });
    const reply = db.transaction(() => {
      const row = getRow(uid);
      if (!decisions.canRename(row, req.cookies.owner_token || null, hash) || !row.pet_name) return null;
      // A page's fill only sets an empty kind, so an animal picked meanwhile stays.
      const saved = fill === true && row.kind ? row.kind : kind;
      db.prepare("UPDATE plushies SET kind = ? WHERE uid = ?").run(saved, uid);
      return { ok: true, kind: saved, name: kindOf(saved).name, stats: sheetOf(row, parseStats(row.stats), saved) };
    })();
    if (!reply) return res.status(403).json({ ok: false });
    res.json(reply);
  });

  app.post("/claim", (req, res) => {
    const { uid, code } = req.body || {};
    if (!validUid(uid)) return invalidUid(req, res);
    const result = db.transaction(() => {
      const row = getRow(uid);
      const time = now();
      const attempt = db.prepare("SELECT * FROM claim_attempts WHERE uid = ?").get(uid);
      const active = attempt && time - attempt.window_start < cooldown;
      if (active && attempt.attempts >= 5) return { status: 429, row, message: "너무 여러 번 시도했어요. 15분 안에 다시 해 볼 수 있게 돼요." };
      if (decisions.verifyClaim(row, code, hash)) {
        const existing = req.cookies.owner_token;
        const token = typeof existing === "string" && existing ? existing : ownerToken();
        db.prepare("UPDATE plushies SET owner_token_hash = ? WHERE uid = ?").run(hash(token), uid);
        db.prepare("DELETE FROM claim_attempts WHERE uid = ?").run(uid);
        return { token };
      }
      if (!row) return { status: 404 };
      const count = active ? attempt.attempts + 1 : 1;
      db.prepare(`INSERT INTO claim_attempts (uid, attempts, window_start) VALUES (?, ?, ?)
        ON CONFLICT(uid) DO UPDATE SET attempts = excluded.attempts, window_start = excluded.window_start`).run(uid, count, active ? attempt.window_start : time);
      return { status: count >= 5 ? 429 : 403, row, message: count >= 5
        ? "너무 여러 번 시도했어요. 15분 안에 다시 해 볼 수 있게 돼요."
        : "안심 코드가 맞지 않아요." };
    })();
    if (result.token) {
      setOwner(res, result.token);
      setSkip(res, uid);
      return res.redirect(303, `/t?uid=${uid}`);
    }
    const demo = demoUids.includes(uid) ? uid : "";
    res.status(result.status).send(result.row ? strangerPage(result.row, result.message, { demo, theme: req.theme, card: cardOf(result.row, req) }) : page(null, "<p>먼저 인형에 폰을 톡 대서 친구를 만나 보세요.</p>", { theme: req.theme }));
  });

  app.post("/recovery", (req, res) => {
    const { uid } = req.body || {};
    if (!validUid(uid)) return res.status(400).json({ ok: false });
    const reply = db.transaction(() => {
      const row = getRow(uid);
      // A guest pet never gets a code, so dropping it from GUEST_UIDS still locks everyone out.
      if (!decisions.canRename(row, req.cookies.owner_token || null, hash) || !row.pet_name || guestUids.includes(uid)) return null;
      const code = recoveryCode();
      db.prepare("UPDATE plushies SET recovery_code_hash = ? WHERE uid = ?").run(hash(code), uid);
      return { ok: true, code };
    })();
    if (!reply) return res.status(403).json({ ok: false });
    res.json(reply);
  });

  if (demoUids.length) {
    app.post("/demo/fresh-start", (req, res) => {
      const uid = req.body?.uid;
      if (!demoUids.includes(uid)) return res.status(403).send(page(null, "<p>이 친구는 인형 속에서 기다리고 있어요. 인형에 폰을 톡 대 주세요.</p>", { theme: req.theme }));
      db.prepare("DELETE FROM plushies WHERE uid = ?").run(uid);
      purgeTalk(db, uid);
      clearCelebrate(res);
      clearSkip(res);
      res.redirect(303, `/t?uid=${uid}`);
    });
    app.post("/demo/care-reset", (req, res) => {
      const uid = req.body?.uid;
      if (!demoUids.includes(uid)) return res.status(403).send(page(null, "<p>이 친구는 인형 속에서 기다리고 있어요. 인형에 폰을 톡 대 주세요.</p>", { theme: req.theme }));
      db.prepare("UPDATE plushies SET fed_at = NULL, meals = NULL, played_at = NULL, plays = NULL, slept_at = NULL WHERE uid = ?").run(uid);
      setSkip(res, uid);
      res.redirect(303, `/t?uid=${uid}`);
    });
    // The admin panel's animal and edition, saved on the pet like /kind, named or not; the demo chip's owner only.
    const demoSave = (column, valid, said) => (req, res) => {
      const { uid } = req.body || {};
      const value = req.body?.[column];
      if (!validUid(uid) || !valid(value)) return res.status(400).json({ ok: false });
      const reply = db.transaction(() => {
        if (!demoUids.includes(uid) || !decisions.canRename(getRow(uid), req.cookies.owner_token || null, hash)) return null;
        db.prepare(`UPDATE plushies SET ${column} = ? WHERE uid = ?`).run(value, uid);
        const row = getRow(uid);
        return { ok: true, [column]: value, name: said(value), stats: sheetOf(row, parseStats(row.stats), animalOf(row, req)) };
      })();
      if (!reply) return res.status(403).json({ ok: false });
      res.json(reply);
    };
    app.post("/demo/kind", demoSave("kind", (kind) => KIND_IDS.includes(kind), (kind) => kindOf(kind).name));
    app.post("/demo/edition", demoSave("edition", (edition) => typeof edition === "string" && Object.hasOwn(EDITIONS, edition), (edition) => EDITIONS[edition].name));
  }

  if (!production) {
    app.get("/dev", (req, res) => res.send(devPage(undefined, { theme: req.theme })));
    app.get("/dev/preview", (req, res) => {
      const kind = req.query.kind;
      const count = Number(req.query.count);
      const tier = req.query.tier;
      const reason = req.query.reason;
      const ok = previewPetPage.validate({ kind, count, tier, reason });
      if (!ok) {
        return res.status(404).send(page(null, "<p>이 친구는 인형 속에서 기다리고 있어요. 인형에 폰을 톡 대 주세요.</p>", { theme: req.theme }));
      }
      // A preview shows any kind; only the switch kinds stick to this phone.
      const mascot = KIND_IDS.includes(req.query.mascot) ? req.query.mascot : req.demoMascot || DEFAULT_KIND;
      res.send(previewPetPage({ kind, count, tier, reason, mascot, theme: req.theme }));
    });
    app.post("/dev/prime", (req, res) => {
      const { uid, preset, tier } = req.body || {};
      if (!validUid(uid)) return invalidUid(req, res);
      const row = getRow(uid);
      if (!row) return res.status(404).send(page(null, "<p>먼저 인형에 폰을 톡 대서 친구를 만나 보세요.</p>", { theme: req.theme }));
      const t = now();
      if (preset === "lonely") {
        db.prepare("UPDATE plushies SET mood_value = 20, mood_updated_at = ?, last_rewarded_at = NULL WHERE uid = ?").run(t, uid);
      } else if (preset === "levelup") {
        db.prepare("UPDATE plushies SET xp = 90, last_rewarded_at = NULL WHERE uid = ?").run(uid);
      } else if (preset === "fresh") {
        db.prepare("UPDATE plushies SET last_rewarded_at = NULL, reward_day_count = 0 WHERE uid = ?").run(uid);
      } else if (preset) {
        return res.status(400).send(page(null, "<p>잘 알아듣지 못했어요. 다시 한 번 해보세요.</p>", { theme: req.theme }));
      }
      if (tier === "none") {
        db.prepare("UPDATE plushies SET next_gift_tier = NULL WHERE uid = ?").run(uid);
      } else if (tier === "common" || tier === "special" || tier === "rare") {
        db.prepare("UPDATE plushies SET next_gift_tier = ?, last_gift_day = NULL, last_rewarded_at = NULL WHERE uid = ?").run(tier, uid);
      } else if (tier) {
        return res.status(400).send(page(null, "<p>잘 알아듣지 못했어요. 다시 한 번 해보세요.</p>", { theme: req.theme }));
      }
      res.redirect(303, "/dev");
    });
    app.post("/dev/farm-ripen", (req, res) => {
      const uid = req.body?.uid;
      if (!validUid(uid)) return res.status(400).json({ ok: false });
      const farm = parseFarm(getRow(uid)?.farm);
      if (!farm) return res.status(409).json({ ok: false });
      db.prepare("UPDATE plushies SET farm = ? WHERE uid = ?").run(JSON.stringify(ripenFarm(farm, now())), uid);
      res.json({ ok: true });
    });
    app.post("/dev/reset", (req, res) => {
      db.prepare("DELETE FROM plushies").run();
      purgeTalk(db);
      res.clearCookie("owner_token", { path: "/", httpOnly: true, sameSite: "lax" });
      clearCelebrate(res);
      clearSkip(res);
      res.redirect(303, "/dev");
    });
  }
  if (talk) mountTalk(app, { db, talk, now, getRow, animalOf, owns: (row, req) => decisions.canRename(row, req.cookies.owner_token || null, hash) });
  app.use((req, res) => res.status(404).send(page(null, "<p>이 친구는 인형 속에서 기다리고 있어요. 인형에 폰을 톡 대 주세요.</p>", { theme: req.theme })));
  app.use((error, req, res, next) => {
    const status = error.status >= 400 && error.status < 500 ? error.status : 500;
    res.status(status).send(page(null, status === 500
      ? "<p>친구가 아직 깨어나지 못했어요. 잠시 후에 다시 찾아와 주세요.</p>"
      : "<p>잘 알아듣지 못했어요. 다시 한 번 해보세요.</p>", { theme: req.theme }));
  });
  return app;
}
