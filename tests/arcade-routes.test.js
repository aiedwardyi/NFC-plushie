import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
import { fakeUids } from "../src/pages.js";
import { hash } from "../src/secrets.js";
import { parseStats } from "../src/stats.js";

const [A, B] = fakeUids;
const T0 = Date.parse("2026-05-01T10:00:00+09:00");
const MIN = 60 * 1000;
const NEXT_DAY = 14 * 60 * MIN + MIN;

function updateJar(jar, setCookies) {
  for (const sc of setCookies || []) {
    const m = /^([^=]+)=([^;]*)/.exec(sc);
    if (!m) continue;
    const k = m[1].trim();
    const v = m[2].trim();
    if (v === "" || /Expires=Thu, 01 Jan 1970/i.test(sc)) delete jar[k];
    else jar[k] = v;
  }
}

async function setup(t, options = {}, dir = mkdtempSync(join(process.cwd(), ".test-data-"))) {
  const db = openDatabase(dir);
  let time = T0;
  const server = createApp({ db, now: () => time, rng: () => 0, demoUids: [], ...options }).listen(0, "localhost");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    assert.equal(dirname(dir), process.cwd());
    rmSync(dir, { recursive: true, force: true });
  });
  async function request(path, { jar, body } = {}) {
    const headers = {};
    if (jar) {
      const pair = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
      if (pair) headers.Cookie = pair;
    }
    if (body) headers["Content-Type"] = "application/json";
    const res = await fetch(`http://localhost:${server.address().port}${path}`, {
      method: body ? "POST" : "GET",
      redirect: "manual",
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    return { status: res.status, html: await res.text(), headers: res.headers, setCookies, location: res.headers.get("location") };
  }
  const row = (uid = A) => db.prepare("SELECT * FROM plushies WHERE uid = ?").get(uid);
  return { db, request, row, advance: (ms) => { time += ms; } };
}

async function meet(ctx, uid, name) {
  const { request } = ctx;
  const jar = {};
  const first = await request(`/t?uid=${uid}`, { jar });
  assert.equal(first.status, 200);
  updateJar(jar, first.setCookies);
  if (name) {
    const named = await request("/name", { jar, body: { uid, name } });
    assert.equal(named.status, 303);
    updateJar(jar, named.setCookies);
    const skip = await request(`/t?uid=${uid}`, { jar });
    assert.equal(skip.status, 200);
    updateJar(jar, skip.setCookies);
  }
  return { jar };
}

async function play(ctx, jar, body) {
  const res = await ctx.request("/arcade", { jar, body: { uid: A, game: "gi", height: 1000, ...body } });
  return { status: res.status, body: JSON.parse(res.html) };
}

const visit = (ctx, jar) => ctx.request(`/t?uid=${A}`, { jar: { ...jar, pet_skip: A } });
const count = (html, re) => (html.match(re) || []).length;

test("race rejects locked, own and malformed rivals without writing", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  const before = ctx.row();
  for (const body of [{ rival: "horse" }, { rival: "rat" }, { rival: "__proto__" }, { rival: null }, { won: 1 }, { won: "true" }, { won: undefined }]) {
    const out = await play(ctx, jar, { game: "race", rival: "sheep", won: true, ...body });
    assert.equal(out.status, 400, JSON.stringify(body));
    assert.deepEqual(ctx.row(), before);
  }
});

test("race requires an awake named owner", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  const body = { game: "race", rival: "sheep", won: false };
  const before = ctx.row();
  assert.equal((await play(ctx, {}, body)).status, 403);
  assert.equal((await play(ctx, { owner_token: "wrong" }, body)).status, 403);
  assert.equal((await play(ctx, jar, { ...body, uid: B })).status, 403);
  assert.deepEqual(ctx.row(), before);
  await ctx.request("/care", { jar, body: { uid: A, act: "sleep" } });
  const sleeping = ctx.row();
  assert.equal((await play(ctx, jar, body)).status, 409);
  assert.deepEqual(ctx.row(), sleeping);
});

test("race persists wins, preserves losses and caps each rival independently", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  const body = { game: "race", rival: "sheep", won: true };
  const first = await play(ctx, jar, body);
  assert.deepEqual(first.body.race.sheep, { level: 2, best: 1 });
  assert.equal(first.body.rivalLevel, 1);
  const lost = await play(ctx, jar, { ...body, won: false });
  assert.deepEqual(lost.body.race, first.body.race);
  assert.match((await visit(ctx, jar)).html, /data-race="[^\"]*sheep[^\"]*level[^\"]*2/);
  for (let i = 0; i < 22; i++) await play(ctx, jar, body);
  const saved = JSON.parse(ctx.row().race);
  assert.deepEqual(saved, { horse: { level: 1, best: 0 }, sheep: { level: 20, best: 20 } });
  const swapped = await play(ctx, { ...jar, mascot: "sheep" }, { ...body, rival: "horse" });
  assert.equal(swapped.status, 200);
  assert.deepEqual(swapped.body.race.horse, { level: 2, best: 1 });
  assert.equal((await play(ctx, { ...jar, mascot: "sheep" }, body)).status, 400);
});

test("the race card shows the pet, its line and the saved rival levels", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await play(ctx, jar, { game: "race", rival: "sheep", won: true });
  const sheet = (await visit(ctx, jar)).html.match(/<div class="sheet" data-sheet="arcade"[\s\S]*?<\/section>\s*<\/div>/)[0];
  const card = sheet.match(/<li class="g-card is-ready"><span class="g-thumb r-thumb">.*<\/li>/)[0];
  assert.match(card, /<img class="g-thumb-pet" src="\/mascot-horse-512-v3\.png" alt="">.*<b>달리기 시합<\/b><small>화면을 톡톡! 결승선까지 달려요<\/small>.*<button type="button" class="g-start" data-game="race" data-race="[^"]+">시작<\/button>/);
  const saved = JSON.parse(card.match(/data-race="([^"]+)"/)[1].replaceAll("&quot;", '"'));
  assert.deepEqual(saved, { horse: { level: 1, best: 0 }, sheep: { level: 2, best: 1 } });
});

test("race and gi share three XP plays and reset at Seoul midnight", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  const xp = ctx.row().xp;
  const race = { game: "race", rival: "sheep", won: false };
  const replies = [await play(ctx, jar), await play(ctx, jar, race), await play(ctx, jar), await play(ctx, jar, race)];
  assert.deepEqual(replies.map((r) => [r.body.xpGain, r.body.xpLeft]), [[15, 2], [15, 1], [15, 0], [0, 0]]);
  assert.equal(ctx.row().xp, xp + 45);
  assert.equal(ctx.row().gi_best, 1000);
  ctx.advance(NEXT_DAY);
  const next = await play(ctx, jar, race);
  assert.deepEqual([next.body.xpGain, next.body.xpLeft], [15, 2]);
});

test("race leaves gi best and care state intact", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await play(ctx, jar, { height: 5000 });
  const before = ctx.row();
  await play(ctx, jar, { game: "race", rival: "sheep", won: true });
  const after = ctx.row();
  for (const field of Object.keys(before).filter((key) => !["xp", "arcade_day", "arcade_plays", "race", "stats"].includes(key))) assert.deepEqual(after[field], before[field], field);
  const gi = await play(ctx, jar, { height: 6000 });
  assert.deepEqual({ ...gi.body, stats: null }, { ok: true, xpGain: 15, xpLeft: 0, best: 6000, isBest: true, level: 1, leveledUp: false, xpInto: after.xp + 15, xpSpan: 100, trained: { stat: "str", gained: 0 }, boostUsed: 0, stats: null });
  assert.deepEqual([gi.body.stats.str.trained, gi.body.stats.agi.trained], [1, 1]);
});

test("the first 3 plays of the day give 15 XP each, the rest none", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  const xp0 = ctx.row().xp;
  const outs = [];
  for (let i = 0; i < 4; i++) {
    outs.push(await play(ctx, jar));
    ctx.advance(MIN);
  }
  assert.deepEqual(outs.map((o) => o.status), [200, 200, 200, 200]);
  assert.deepEqual(outs.map((o) => [o.body.xpGain, o.body.xpLeft]), [[15, 2], [15, 1], [15, 0], [0, 0]]);
  assert.equal(ctx.row().xp, xp0 + 45);
  assert.deepEqual([ctx.row().arcade_day, ctx.row().arcade_plays], ["2026-05-01", 4]);
});

test("plays come back after Seoul midnight", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  for (let i = 0; i < 3; i++) await play(ctx, jar);
  assert.equal((await play(ctx, jar)).body.xpGain, 0);
  ctx.advance(NEXT_DAY);
  const next = await play(ctx, jar);
  assert.deepEqual([next.body.xpGain, next.body.xpLeft], [15, 2]);
  assert.deepEqual([ctx.row().arcade_day, ctx.row().arcade_plays], ["2026-05-02", 1]);
});

test("the first 기 모으기 of a Seoul day trains 힘 +1, later plays that day don't", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  const first = await play(ctx, jar);
  assert.deepEqual([first.body.trained, first.body.boostUsed], [{ stat: "str", gained: 1 }, 0]);
  assert.deepEqual(first.body.stats.str, { base: 50, plus: 0, trained: 1, boost: 0, total: 51, bonus: 1.8 });
  const second = await play(ctx, jar);
  assert.deepEqual([second.body.trained, second.body.stats.str.trained], [{ stat: "str", gained: 0 }, 1]);
  for (let i = 0; i < 3; i++) await play(ctx, jar);
  assert.deepEqual([parseStats(ctx.row().stats).trained.str, parseStats(ctx.row().stats).trainedDay.str], [1, "2026-05-01"]);
  ctx.advance(NEXT_DAY);
  assert.deepEqual((await play(ctx, jar)).body.trained, { stat: "str", gained: 1 });
  assert.equal(parseStats(ctx.row().stats).trained.str, 2);
});

test("a 기 모으기 run spends a pending 힘 boost", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  ctx.db.prepare("UPDATE plushies SET stats = ? WHERE uid = ?").run(JSON.stringify({ v: 1, boost: { str: 10, agi: 20 } }), A);
  const out = await play(ctx, jar, { height: 14000 });
  assert.deepEqual([out.status, out.body.boostUsed, out.body.stats.str.boost, out.body.stats.agi.boost], [200, 10, 0, 20]);
  assert.deepEqual(parseStats(ctx.row().stats).boost, { str: 0, int: 0, agi: 20, cha: 0 });
  assert.equal((await play(ctx, jar)).body.boostUsed, 0);
});

test("a race trains 민첩 and spends a pending 민첩 boost", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  ctx.db.prepare("UPDATE plushies SET stats = ? WHERE uid = ?").run(JSON.stringify({ v: 1, boost: { str: 10, agi: 10 } }), A);
  const race = { game: "race", rival: "sheep", won: true };
  const out = await play(ctx, jar, race);
  assert.deepEqual([out.body.trained, out.body.boostUsed], [{ stat: "agi", gained: 1 }, 10]);
  assert.deepEqual(out.body.stats.agi, { base: 70, plus: 0, trained: 1, boost: 0, total: 71, bonus: 5.2 });
  assert.deepEqual(parseStats(ctx.row().stats).boost, { str: 10, int: 0, agi: 0, cha: 0 });
  const again = await play(ctx, jar, { ...race, won: false });
  assert.deepEqual([again.body.trained, again.body.boostUsed, again.body.stats.agi.trained], [{ stat: "agi", gained: 0 }, 0, 1]);
});

test("a 힘 bonus run up to 14375 m is accepted", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  for (const height of [14000, 14370]) assert.equal((await play(ctx, jar, { height })).status, 200, String(height));
  for (const height of [14380, 15000]) assert.equal((await play(ctx, jar, { height })).status, 400, String(height));
  assert.equal(ctx.row().gi_best, 14370);
});

test("the best height only moves up", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  const high = await play(ctx, jar, { height: 9000 });
  assert.deepEqual([high.body.best, high.body.isBest], [9000, true]);
  const low = await play(ctx, jar, { height: 4000 });
  assert.deepEqual([low.body.best, low.body.isBest], [9000, false]);
  assert.equal(ctx.row().gi_best, 9000);
});

test("a play can level the pet up", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  ctx.db.prepare("UPDATE plushies SET xp = 95 WHERE uid = ?").run(A);
  const out = await play(ctx, jar);
  assert.deepEqual({ ...out.body, stats: null }, { ok: true, xpGain: 15, xpLeft: 2, best: 1000, isBest: true, level: 2, leveledUp: true, xpInto: 10, xpSpan: 150, trained: { stat: "str", gained: 1 }, boostUsed: 0, stats: null });
  const calm = await play(ctx, jar);
  assert.deepEqual([calm.body.leveledUp, calm.body.level, calm.body.xpInto], [false, 2, 25]);
});

test("bad plays are refused and write nothing", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  const before = ctx.row();
  for (const body of [{ height: -10 }, { height: 14380 }, { height: 1005 }, { height: 10.5 }, { height: "100" }, { height: undefined }, { game: "fish" }, { uid: "bad" }, { uid: "04aaaaaaaaaaa1" }]) {
    const out = await play(ctx, jar, body);
    assert.deepEqual([out.status, out.body], [400, { ok: false }], JSON.stringify(body));
  }
  assert.equal((await play(ctx, jar, { height: 14370 })).status, 200);
  ctx.db.prepare("UPDATE plushies SET arcade_day = NULL, arcade_plays = NULL, gi_best = NULL, stats = NULL, xp = ? WHERE uid = ?").run(before.xp, A);
  assert.deepEqual(ctx.row(), before);
  const stranger = await play(ctx, {});
  assert.deepEqual([stranger.status, stranger.body], [403, { ok: false }]);
  const wrong = await play(ctx, { owner_token: "nope" });
  assert.equal(wrong.status, 403);
  const unnamed = await meet(ctx, B);
  const res = await ctx.request("/arcade", { jar: unnamed.jar, body: { uid: B, game: "gi", height: 100 } });
  assert.equal(res.status, 403);
  assert.deepEqual([ctx.row(B).arcade_plays, ctx.row(B).xp], [null, 0]);
  assert.deepEqual(ctx.row(), before);
});

test("a sleeping pet can't play", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await ctx.request("/care", { jar, body: { uid: A, act: "sleep" } });
  const before = ctx.row();
  const out = await play(ctx, jar);
  assert.deepEqual([out.status, out.body], [409, { ok: false }]);
  assert.deepEqual(ctx.row(), before);
});

test("a play touches only XP, stats and the arcade columns", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await ctx.request(`/t?uid=${A}`, { jar });
  const keep = (r) => [r.tap_count, r.mood_value, r.mood_updated_at, r.last_rewarded_at, r.reward_day, r.reward_day_count, r.combo_count, r.combo_at, r.gift_found, r.fed_at, r.played_at, r.slept_at, r.farm, r.kind];
  const before = ctx.row();
  ctx.advance(MIN);
  await play(ctx, jar);
  assert.deepEqual(keep(ctx.row()), keep(before));
  assert.equal(ctx.row().xp, before.xp + 15);
});

test("the owner home shows the 오락실 and its sheet", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  const home = await visit(ctx, jar);
  const dock = home.html.match(/<nav class="dock"[\s\S]*?<\/nav>/)[0];
  assert.match(dock, / data-arcade-left="3" data-gi-best="0" /);
  assert.match(dock, /<button type="button" class="dock-btn is-side has-new" data-open="arcade" aria-haspopup="dialog"><span class="dock-cap"><svg[^>]*>[\s\S]*?<\/svg><\/span><span class="dock-label">오락실<\/span><\/button>/);
  const sheet = home.html.match(/<div class="sheet" data-sheet="arcade"[\s\S]*?<\/section>\s*<\/div>/)[0];
  assert.match(sheet, /<h2 id="sheet-arcade-title">오락실<\/h2>/);
  assert.match(sheet, /<p class="g-today" data-arcade-today><span>오늘 XP 놀이<\/span><i class="g-pip"><\/i><i class="g-pip"><\/i><i class="g-pip"><\/i><b>3번 남았어요<\/b><\/p>/);
  assert.match(sheet, /<li class="g-card is-ready">.*<img class="g-thumb-pet" src="\/mascot-horse-512-v3\.png" alt="">.*<b>기 모으기<\/b><small>인형을 톡톡! 하늘 끝까지 날아가요<\/small>.*<button type="button" class="g-start" data-game="gi">시작<\/button><\/li>/);
  assert.equal(count(sheet, /<li class="g-card is-locked">/g), 2);
  assert.match(sheet, /<b>낚시<\/b><small>곧 만나요<\/small>/);
  assert.match(sheet, /<b>풍선 사냥<\/b><small>곧 만나요<\/small>/);
  assert.match(sheet, /<button type="button" class="g-gifts" data-open-gifts>.*모은 선물 <b>0\/30<\/b><span class="g-chev" aria-hidden="true">›<\/span><\/button>/);
  assert.match(home.html, /data-sheet="gifts"/);
  const gifted = await ctx.request(`/t?uid=${A}`, { jar });
  assert.match(gifted.html, /class="g-gifts has-new" data-open-gifts>.*모은 선물 <b>1\/30<\/b>/);
  ctx.advance(MIN);
  for (let i = 0; i < 3; i++) await play(ctx, jar, { height: 4200 });
  const done = await visit(ctx, jar);
  assert.doesNotMatch(done.html, /has-new" data-open="arcade"|g-gifts has-new/);
  assert.match(done.html, / data-arcade-left="0" data-gi-best="4200" /);
  assert.match(done.html, /<i class="g-pip is-used"><\/i><i class="g-pip is-used"><\/i><i class="g-pip is-used"><\/i><b>다 했어요!<\/b>/);
  const sheep = await ctx.request(`/t?uid=${A}`, { jar: { ...jar, pet_skip: A, mascot: "sheep" } });
  assert.match(sheep.html, /<img class="g-thumb-pet" src="\/mascot-sheep-512-v3\.png" alt="">/);
});

test("one play used shows one used pip", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await play(ctx, jar);
  const home = await visit(ctx, jar);
  assert.match(home.html, /<i class="g-pip is-used"><\/i><i class="g-pip"><\/i><i class="g-pip"><\/i><b>2번 남았어요<\/b>/);
  assert.match(home.html, /class="dock-btn is-side has-new" data-open="arcade"/);
});

test("the preview page shows the 오락실 with nothing to play", async (t) => {
  const ctx = await setup(t);
  const preview = await ctx.request("/dev/preview?kind=gift&count=10");
  assert.match(preview.html, /data-open="arcade"/);
  assert.match(preview.html, / data-arcade-left="3" data-gi-best="0" /);
  assert.match(preview.html, /data-sheet="arcade"[\s\S]*<b>3번 남았어요<\/b>[\s\S]*모은 선물 <b>7\/30<\/b>/);
  assert.doesNotMatch(preview.html, /data-care-uid/);
});

test("vendor files cache for a year; the app script still never caches", async (t) => {
  const ctx = await setup(t);
  for (const file of ["pixi-8.22.0.min.js", "pixi-unsafe-eval-8.22.0.min.js", "pixi-filters-6.1.5.js"]) {
    const res = await ctx.request(`/vendor/${file}`);
    assert.equal(res.status, 200, file);
    assert.equal(res.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.doesNotMatch(res.html.slice(-200), /sourceMappingURL/);
  }
  assert.equal((await ctx.request("/app.js")).headers.get("cache-control"), "no-store");
  assert.equal((await ctx.request("/game/gimo.js")).headers.get("cache-control"), "no-store");
});

test("a pre-arcade database gains the arcade columns as no plays and no best", async (t) => {
  const dir = mkdtempSync(join(process.cwd(), ".test-data-"));
  const token = "owner-token";
  {
    const old = new Database(join(dir, "plushies.db"));
    old.exec(`CREATE TABLE plushies (
      uid TEXT PRIMARY KEY, pet_name TEXT NULL, owner_token_hash TEXT NULL,
      recovery_code_hash TEXT NULL, tap_count INTEGER DEFAULT 0, created_at TEXT, last_tap_at TEXT,
      mood_value INTEGER, mood_updated_at INTEGER, xp INTEGER, last_rewarded_at INTEGER, reward_day TEXT,
      reward_day_count INTEGER, last_gift_day TEXT, gift_seen TEXT, gift_found TEXT, days_together INTEGER,
      last_active_day TEXT, last_counter INTEGER, next_gift_tier TEXT, fed_at INTEGER, meals INTEGER,
      played_at INTEGER, plays INTEGER, slept_at INTEGER, combo_count INTEGER, combo_at INTEGER
    );
    CREATE TABLE claim_attempts (
      uid TEXT PRIMARY KEY REFERENCES plushies(uid) ON DELETE CASCADE,
      attempts INTEGER NOT NULL, window_start INTEGER NOT NULL
    );`);
    old.prepare("INSERT INTO plushies (uid, pet_name, owner_token_hash, tap_count, mood_value, mood_updated_at, xp) VALUES (?, ?, ?, ?, ?, ?, ?)").run(A, "Mochi", hash(token), 3, 50, T0, 40);
    old.close();
  }
  const ctx = await setup(t, {}, dir);
  const cols = ctx.db.prepare("PRAGMA table_info(plushies)").all().map((c) => c.name);
  for (const name of ["arcade_day", "arcade_plays", "gi_best"]) assert.ok(cols.includes(name), name);
  assert.deepEqual([ctx.row().arcade_day, ctx.row().arcade_plays, ctx.row().gi_best], [null, null, null]);
  const home = await visit(ctx, { owner_token: token });
  assert.match(home.html, / data-arcade-left="3" data-gi-best="0" /);
  const out = await play(ctx, { owner_token: token });
  assert.deepEqual([out.body.xpGain, out.body.best, ctx.row().xp], [15, 1000, 55]);
  assert.deepEqual([out.body.trained, out.body.stats.str.total], [{ stat: "str", gained: 1 }, 51]);
});
