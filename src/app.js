import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";
import * as binding from "./binding.js";
import { hash, ownerToken, recoveryCode } from "./secrets.js";
import { EMPTY_FOUND, EMPTY_SEEN } from "./db.js";
import { GIFT_COUNT as GIFT_TOTAL, GIFT_TIERS, GIFTS } from "./gifts.js";
import { PET, applyTap, currentMood, parseTapUid, seoulDayKey, xpProgress } from "./pet.js";
import { devPage, milestoneLine, page, petPage, previewPetPage, strangerPage } from "./pages.js";

const cookieAge = 400 * 24 * 60 * 60 * 1000;
const cooldown = 15 * 60 * 1000;
const skipAge = 2 * 60 * 1000;
const validUid = (uid) => typeof uid === "string" && /^[0-9A-F]{14}$/.test(uid);

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
    seen_common: seen.common,
    seen_special: seen.special,
    seen_rare: seen.rare,
  };
}

export function createApp({ db, decisions = binding, production = process.env.NODE_ENV === "production", now = Date.now, rng = Math.random }) {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    });
    next();
  });
  app.use(express.urlencoded({ extended: false, limit: "4kb" }));
  app.use(express.json({ limit: "4kb" }));
  app.use(cookieParser());
  app.use(express.static(fileURLToPath(new URL("../public", import.meta.url)), {
    setHeaders(res, filePath) {
      if (/\.(?:png|jpe?g|gif|webp|svg|ico)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=86400");
      }
    },
  }));

  const getRow = (uid) => db.prepare("SELECT * FROM plushies WHERE uid = ?").get(uid) || null;
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
  const invalidUid = (res) => res.status(400).send(page(null, "<p>링크가 잘 맞지 않아요. 인형에 있는 링크로 다시 찾아와 주세요.</p>"));

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
    return { after, foundCount: found.length };
  }

  function petView(fresh, st, out, t, extra = {}) {
    const xpNow = xpProgress(st.xp);
    const moodBefore = out.rewarded ? out.moodBefore : currentMood(st, t);
    const moodAfter = out.rewarded ? out.moodAfter : moodBefore;
    const leveledUp = Boolean(out.rewarded && out.leveledUp);
    const level = out.rewarded ? extra.after.level : xpNow.level;
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
      unrewardedLine: out.rewarded ? "" : (UNREWARDED_LINES[out.reason] || ""),
      lonelyLine: !out.rewarded && moodAfter <= PET.moodLonelyAt ? LONELY_LINE : "",
      reunionLine: out.rewarded && out.reunion ? REUNION_LINE : "",
    };
  }

  app.get("/health", (req, res) => res.type("text").send("ok"));
  app.get("/t", (req, res) => {
    const parsed = parseTapUid(req.query.uid);
    if (!parsed) return invalidUid(res);
    const serial = parsed.serial;
    const counter = parsed.counter;
    const result = db.transaction(() => {
      const row = getRow(serial);
      const state = decisions.resolveTap(row, req.cookies.owner_token || null, hash);
      const t = now();
      const today = seoulDayKey(t);
      const stamp = new Date(t).toISOString();
      if (state === "NEW") {
        const existing = req.cookies.owner_token;
        const token = typeof existing === "string" && existing ? existing : ownerToken();
        const code = recoveryCode();
        db.prepare(`INSERT INTO plushies (uid, owner_token_hash, recovery_code_hash, tap_count, created_at, last_tap_at,
          mood_value, mood_updated_at, xp, reward_day_count, gift_seen, gift_found, days_together, last_active_day, last_counter)
          VALUES (?, ?, ?, 1, ?, ?, 100, ?, 0, 0, ?, ?, 1, ?, ?)`)
          .run(serial, hash(token), hash(code), stamp, stamp, t, EMPTY_SEEN, EMPTY_FOUND, today, counter);
        return { html: petPage(getRow(serial), code, { celebrate: "claim" }), token };
      }
      if (state === "OWNER") {
        db.prepare("UPDATE plushies SET tap_count = tap_count + 1, last_tap_at = ? WHERE uid = ?").run(stamp, serial);
        const afterTap = getRow(serial);
        const raiseMirror = () => {
          if (counter !== null && (afterTap.last_counter === null || counter > afterTap.last_counter)) {
            db.prepare("UPDATE plushies SET last_counter = ? WHERE uid = ?").run(counter, serial);
          }
        };
        const flash = takeCelebrate(req, res);
        if (req.cookies.pet_skip === serial) {
          clearSkip(res);
          raiseMirror();
          return { html: petPage(getRow(serial), null, { celebrate: flash }) };
        }
        if (!afterTap.pet_name) {
          raiseMirror();
          return { html: petPage(getRow(serial), null, { celebrate: flash }) };
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
        const mile = milestoneLine(fresh.tap_count);
        let visual = flash;
        if (!visual && out.rewarded && out.leveledUp) visual = "levelup";
        else if (!visual && out.rewarded && out.reunion) visual = "reunion";
        else if (!visual && mile) visual = "milestone";
        else if (!visual && out.rewarded && out.gift && out.gift.tier === "rare") visual = "rare";
        else if (!visual && out.rewarded && out.gift && out.gift.tier === "special") visual = "special";
        return { html: petPage(fresh, null, { celebrate: visual, pet: petView(fresh, st, out, t, extra || {}) }) };
      }
      if (state === "STRANGER") return { html: strangerPage(row) };
      throw new Error("Invalid binding result");
    })();
    if (result.token) setOwner(res, result.token);
    res.send(result.html);
  });

  app.post("/name", (req, res) => {
    const { uid, name } = req.body || {};
    if (!validUid(uid)) return invalidUid(res);
    const row = getRow(uid);
    if (!decisions.canRename(row, req.cookies.owner_token || null, hash)) {
      return res.status(403).send(row ? strangerPage(row) : page(null, "<p>먼저 인형에 있는 링크로 친구를 만나보세요.</p>"));
    }
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (!trimmed || Array.from(trimmed).length > 24) {
      return res.status(400).send(page(row, `<p>이름은 1글자에서 24글자 사이로 지어주세요.</p><a class="button" href="/t?uid=${uid}">다시 지어볼래요</a>`));
    }
    const firstName = !row.pet_name;
    db.prepare("UPDATE plushies SET pet_name = ? WHERE uid = ?").run(trimmed, uid);
    if (firstName) setCelebrate(res, "named");
    setSkip(res, uid);
    res.redirect(303, `/t?uid=${uid}`);
  });

  app.post("/claim", (req, res) => {
    const { uid, code } = req.body || {};
    if (!validUid(uid)) return invalidUid(res);
    const result = db.transaction(() => {
      const row = getRow(uid);
      const time = now();
      const attempt = db.prepare("SELECT * FROM claim_attempts WHERE uid = ?").get(uid);
      const active = attempt && time - attempt.window_start < cooldown;
      if (active && attempt.attempts >= 5) return { status: 429, row, message: "너무 여러 번 시도했어요. 처음 시도한 때로부터 15분이 지나면 다시 해볼 수 있어요." };
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
        ? "너무 여러 번 시도했어요. 처음 시도한 때로부터 15분이 지나면 다시 해볼 수 있어요."
        : "안심 코드가 맞지 않아요." };
    })();
    if (result.token) {
      setOwner(res, result.token);
      setSkip(res, uid);
      return res.redirect(303, `/t?uid=${uid}`);
    }
    res.status(result.status).send(result.row ? strangerPage(result.row, result.message) : page(null, "<p>먼저 인형에 있는 링크로 친구를 만나보세요.</p>"));
  });

  if (!production) {
    app.get("/dev", (req, res) => res.send(devPage()));
    app.get("/dev/preview", (req, res) => {
      const kind = req.query.kind;
      const count = Number(req.query.count);
      const tier = req.query.tier;
      const reason = req.query.reason;
      const ok = previewPetPage.validate({ kind, count, tier, reason });
      if (!ok) {
        return res.status(404).send(page(null, "<p>이 친구는 인형에 있는 링크에서 기다리고 있어요.</p>"));
      }
      res.send(previewPetPage({ kind, count, tier, reason }));
    });
    app.post("/dev/prime", (req, res) => {
      const { uid, preset, tier } = req.body || {};
      if (!validUid(uid)) return invalidUid(res);
      const row = getRow(uid);
      if (!row) return res.status(404).send(page(null, "<p>먼저 인형에 있는 링크로 친구를 만나보세요.</p>"));
      const t = now();
      if (preset === "lonely") {
        db.prepare("UPDATE plushies SET mood_value = 20, mood_updated_at = ?, last_rewarded_at = NULL WHERE uid = ?").run(t, uid);
      } else if (preset === "levelup") {
        db.prepare("UPDATE plushies SET xp = 90, last_rewarded_at = NULL WHERE uid = ?").run(uid);
      } else if (preset === "fresh") {
        db.prepare("UPDATE plushies SET last_rewarded_at = NULL, reward_day_count = 0 WHERE uid = ?").run(uid);
      } else if (preset) {
        return res.status(400).send(page(null, "<p>잘 알아듣지 못했어요. 다시 한 번 해보세요.</p>"));
      }
      if (tier === "none") {
        db.prepare("UPDATE plushies SET next_gift_tier = NULL WHERE uid = ?").run(uid);
      } else if (tier === "common" || tier === "special" || tier === "rare") {
        db.prepare("UPDATE plushies SET next_gift_tier = ?, last_gift_day = NULL, last_rewarded_at = NULL WHERE uid = ?").run(tier, uid);
      } else if (tier) {
        return res.status(400).send(page(null, "<p>잘 알아듣지 못했어요. 다시 한 번 해보세요.</p>"));
      }
      res.redirect(303, "/dev");
    });
    app.post("/dev/reset", (req, res) => {
      db.prepare("DELETE FROM plushies").run();
      res.clearCookie("owner_token", { path: "/", httpOnly: true, sameSite: "lax" });
      clearCelebrate(res);
      clearSkip(res);
      res.redirect(303, "/dev");
    });
  }
  app.use((req, res) => res.status(404).send(page(null, "<p>이 친구는 인형에 있는 링크에서 기다리고 있어요.</p>")));
  app.use((error, req, res, next) => {
    const status = error.status >= 400 && error.status < 500 ? error.status : 500;
    res.status(status).send(page(null, status === 500
      ? "<p>친구가 아직 깨어나지 못했어요. 잠시 후에 다시 찾아와 주세요.</p>"
      : "<p>잘 알아듣지 못했어요. 다시 한 번 해보세요.</p>"));
  });
  return app;
}
