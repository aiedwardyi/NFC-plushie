import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
import { fakeUids } from "../src/pages.js";
import { hash } from "../src/secrets.js";

const [A, B] = fakeUids;
const T0 = Date.parse("2026-05-01T10:00:00+09:00");
const MIN = 60 * 1000;

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

test("the first 3 plays of the day give 5 XP each, the rest none", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  const xp0 = ctx.row().xp;
  const outs = [];
  for (let i = 0; i < 4; i++) {
    outs.push(await play(ctx, jar));
    ctx.advance(MIN);
  }
  assert.deepEqual(outs.map((o) => o.status), [200, 200, 200, 200]);
  assert.deepEqual(outs.map((o) => [o.body.xpGain, o.body.xpLeft]), [[5, 2], [5, 1], [5, 0], [0, 0]]);
  assert.equal(ctx.row().xp, xp0 + 15);
  assert.deepEqual([ctx.row().arcade_day, ctx.row().arcade_plays], ["2026-05-01", 4]);
});

test("plays come back after Seoul midnight", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  for (let i = 0; i < 3; i++) await play(ctx, jar);
  assert.equal((await play(ctx, jar)).body.xpGain, 0);
  ctx.advance(14 * 60 * MIN + MIN);
  const next = await play(ctx, jar);
  assert.deepEqual([next.body.xpGain, next.body.xpLeft], [5, 2]);
  assert.deepEqual([ctx.row().arcade_day, ctx.row().arcade_plays], ["2026-05-02", 1]);
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
  assert.deepEqual(out.body, { ok: true, xpGain: 5, xpLeft: 2, best: 1000, isBest: true, level: 2, leveledUp: true, xpInto: 0, xpSpan: 150 });
  const calm = await play(ctx, jar);
  assert.deepEqual([calm.body.leveledUp, calm.body.level, calm.body.xpInto], [false, 2, 5]);
});

test("bad plays are refused and write nothing", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  const before = ctx.row();
  for (const body of [{ height: -10 }, { height: 12510 }, { height: 1005 }, { height: 10.5 }, { height: "100" }, { height: undefined }, { game: "fish" }, { uid: "bad" }, { uid: "04aaaaaaaaaaa1" }]) {
    const out = await play(ctx, jar, body);
    assert.deepEqual([out.status, out.body], [400, { ok: false }], JSON.stringify(body));
  }
  assert.equal((await play(ctx, jar, { height: 12500 })).status, 200);
  ctx.db.prepare("UPDATE plushies SET arcade_day = NULL, arcade_plays = NULL, gi_best = NULL, xp = ? WHERE uid = ?").run(before.xp, A);
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

test("a play touches only XP and the arcade columns", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await ctx.request(`/t?uid=${A}`, { jar });
  const keep = (r) => [r.tap_count, r.mood_value, r.mood_updated_at, r.last_rewarded_at, r.reward_day, r.reward_day_count, r.combo_count, r.combo_at, r.gift_found, r.fed_at, r.played_at, r.slept_at];
  const before = ctx.row();
  ctx.advance(MIN);
  await play(ctx, jar);
  assert.deepEqual(keep(ctx.row()), keep(before));
  assert.equal(ctx.row().xp, before.xp + 5);
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
  assert.deepEqual([out.body.xpGain, out.body.best, ctx.row().xp], [5, 1000, 45]);
});
