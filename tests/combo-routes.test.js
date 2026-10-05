import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
import { fakeUids, heartHalves } from "../src/pages.js";
import { currentMood, xpProgress } from "../src/pet.js";

const [A, B] = fakeUids;
const T0 = Date.parse("2026-05-01T10:00:00+09:00");
const SEC = 1000;

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

async function setup(t, options = {}) {
  const dir = mkdtempSync(join(process.cwd(), ".test-data-"));
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
  return { db, request, row, advance: (ms) => { time += ms; }, now: () => time };
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

const comboOf = (html) => Number(/<nav class="dock"[^>]* data-combo="(\d)">/.exec(html)?.[1]);
const chainOf = (row) => [row.combo_count, row.combo_at];

async function tap(ctx, jar, uid = A) {
  const res = await ctx.request(`/t?uid=${uid}`, { jar });
  assert.equal(res.status, 200);
  return res;
}

async function combo(ctx, jar, uid = A) {
  const res = await ctx.request("/combo", { jar, body: { uid } });
  return { status: res.status, body: JSON.parse(res.html) };
}

async function start(ctx, jar, uid = A) {
  const res = await ctx.request("/combo", { jar, body: { uid, start: true } });
  return { status: res.status, body: JSON.parse(res.html) };
}

const REWARD_COLS = ["xp", "mood_value", "mood_updated_at", "last_rewarded_at", "reward_day", "reward_day_count", "last_gift_day", "gift_seen", "gift_found", "days_together", "last_active_day", "next_gift_tier"];
const rewardOf = (row) => REWARD_COLS.map((k) => row[k]);

test("owner taps 4 s apart climb 1, 2, 3, then start over", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  assert.deepEqual(chainOf(ctx.row()), [null, null]);
  const seen = [];
  for (let i = 0; i < 4; i++) {
    if (i) ctx.advance(4 * SEC);
    seen.push(comboOf((await tap(ctx, jar)).html));
    assert.deepEqual(chainOf(ctx.row()), [seen[i], ctx.now()]);
  }
  assert.deepEqual(seen, [1, 2, 3, 1]);
});

test("the chain closes at 12 s and a request within 800 ms is the same tap", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  assert.equal(comboOf((await tap(ctx, jar)).html), 1);
  ctx.advance(12 * SEC);
  assert.equal(comboOf((await tap(ctx, jar)).html), 1);
  ctx.advance(11.9 * SEC);
  assert.equal(comboOf((await tap(ctx, jar)).html), 2);
  ctx.advance(12 * SEC);
  assert.equal(comboOf((await tap(ctx, jar)).html), 1);
  const at = ctx.now();
  ctx.advance(500);
  assert.equal(comboOf((await tap(ctx, jar)).html), 1);
  assert.deepEqual(chainOf(ctx.row()), [1, at]);
});

test("a tap after the page's key ran out starts a new chain", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await tap(ctx, jar);
  ctx.advance(4 * SEC);
  jar.combo_done = B;
  assert.equal(comboOf((await tap(ctx, jar)).html), 2);
  ctx.advance(11 * SEC);
  jar.combo_done = A;
  const fresh = await tap(ctx, jar);
  assert.equal(comboOf(fresh.html), 1);
  assert.deepEqual(chainOf(ctx.row()), [1, ctx.now()]);
  updateJar(jar, fresh.setCookies);
  assert.equal(jar.combo_done, undefined);
  ctx.advance(4 * SEC);
  assert.equal(comboOf((await tap(ctx, jar)).html), 2);
});

test("a combo holds the cooldown line for after the key; a stale counter shows 0 and leaves the chain", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  const rewarded = await tap(ctx, jar, `${A}x000005`);
  assert.doesNotMatch(rewarded.html, /data-combo-later/);
  ctx.advance(4 * SEC);
  const cool = await tap(ctx, jar, `${A}x000006`);
  assert.match(cool.html, /data-reason="cooldown"/);
  assert.equal(comboOf(cool.html), 2);
  assert.doesNotMatch(cool.html, /is-soft/);
  assert.match(cool.html, /data-combo-later="방금 토닥여 줘서 기분 좋아요! 조금 있다가 또 토닥여 주세요\."/);
  const chain = chainOf(ctx.row());
  ctx.advance(4 * SEC);
  const stale = await tap(ctx, jar, `${A}x000006`);
  assert.equal(comboOf(stale.html), 0);
  assert.match(stale.html, /data-reason="stale"/);
  assert.match(stale.html, /폰을 진짜 저한테 톡 대 주세요!/);
  assert.deepEqual(chainOf(ctx.row()), chain);
});

test("level-up and milestone visits show 0 and clear the chain", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await tap(ctx, jar);
  ctx.db.prepare("UPDATE plushies SET xp = 90, last_rewarded_at = NULL WHERE uid = ?").run(A);
  ctx.advance(4 * SEC);
  const up = await tap(ctx, jar);
  assert.match(up.html, /data-celebrate="levelup"/);
  assert.equal(comboOf(up.html), 0);
  assert.deepEqual(chainOf(ctx.row()), [0, null]);
  ctx.advance(4 * SEC);
  assert.equal(comboOf((await tap(ctx, jar)).html), 1);
  ctx.db.prepare("UPDATE plushies SET tap_count = 9 WHERE uid = ?").run(A);
  ctx.advance(4 * SEC);
  const mile = await tap(ctx, jar);
  assert.match(mile.html, /data-celebrate="milestone"/);
  assert.equal(comboOf(mile.html), 0);
  assert.deepEqual(chainOf(ctx.row()), [0, null]);
});

test("a morning page shows 0 and clears the chain; the next tap is 1", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await tap(ctx, jar);
  await ctx.request("/care", { jar, body: { uid: A, act: "sleep" } });
  ctx.advance(4 * SEC);
  const morning = await tap(ctx, jar);
  assert.match(morning.html, /data-morning/);
  assert.equal(comboOf(morning.html), 0);
  assert.deepEqual(chainOf(ctx.row()), [0, null]);
  ctx.advance(4 * SEC);
  assert.equal(comboOf((await tap(ctx, jar)).html), 1);
});

test("the skip render and stranger pages leave the chain alone", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await tap(ctx, jar);
  const chain = chainOf(ctx.row());
  ctx.advance(2 * SEC);
  const named = await ctx.request("/name", { jar, body: { uid: A, name: "Momo" } });
  updateJar(jar, named.setCookies);
  const skip = await tap(ctx, jar);
  assert.equal(comboOf(skip.html), 0);
  assert.deepEqual(chainOf(ctx.row()), chain);
  const stranger = await tap(ctx, {});
  assert.doesNotMatch(stranger.html, /class="dock"|data-combo/);
  assert.deepEqual(chainOf(ctx.row()), chain);
});

test("POST /combo continues an open chain and nothing else", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await tap(ctx, jar);
  const before = ctx.row();
  ctx.advance(3 * SEC);
  const two = await combo(ctx, jar);
  assert.deepEqual(two, { status: 200, body: { ok: true, combo: 2, same: false, tapCount: before.tap_count + 1 } });
  const after = ctx.row();
  assert.deepEqual([after.tap_count, after.last_tap_at, ...chainOf(after)], [before.tap_count + 1, new Date(ctx.now()).toISOString(), 2, ctx.now()]);
  assert.deepEqual([after.xp, after.mood_value, after.last_rewarded_at, after.gift_found], [before.xp, before.mood_value, before.last_rewarded_at, before.gift_found]);
  ctx.advance(500);
  const same = await combo(ctx, jar);
  assert.deepEqual(same.body, { ok: true, combo: 2, same: true, tapCount: before.tap_count + 1 });
  assert.deepEqual(ctx.row(), after);
  ctx.advance(3 * SEC);
  assert.deepEqual((await combo(ctx, jar)).body, { ok: true, combo: 3, same: false, tapCount: before.tap_count + 2 });
  const full = ctx.row();
  ctx.advance(SEC);
  assert.deepEqual(await combo(ctx, jar), { status: 200, body: { ok: true, combo: 0 } });
  assert.deepEqual(ctx.row(), full);
  ctx.advance(12 * SEC);
  assert.deepEqual((await combo(ctx, jar)).body, { ok: true, combo: 0 });
  assert.deepEqual(ctx.row(), full);
});

test("POST /combo: asleep and stale counters give 0 and write nothing", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await tap(ctx, jar, `${A}x000005`);
  ctx.advance(SEC);
  const before = ctx.row();
  for (const uid of [`${A}x000005`, `${A}x000004`, A]) {
    assert.deepEqual(await combo(ctx, jar, uid), { status: 200, body: { ok: true, combo: 0 } });
    assert.deepEqual(ctx.row(), before);
  }
  const ok = await combo(ctx, jar, `${A}x000007`);
  assert.equal(ok.body.combo, 2);
  assert.equal(ctx.row().last_counter, 7);
  await ctx.request("/care", { jar, body: { uid: A, act: "sleep" } });
  const asleep = ctx.row();
  ctx.advance(SEC);
  assert.deepEqual((await combo(ctx, jar, `${A}x000008`)).body, { ok: true, combo: 0 });
  assert.deepEqual(ctx.row(), asleep);
});

test("POST /combo leaves a milestone tap to /t", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await tap(ctx, jar);
  ctx.db.prepare("UPDATE plushies SET tap_count = 9 WHERE uid = ?").run(A);
  const before = ctx.row();
  ctx.advance(3 * SEC);
  assert.deepEqual(await combo(ctx, jar), { status: 200, body: { ok: true, combo: 0 } });
  assert.deepEqual(ctx.row(), before);
  const mile = await tap(ctx, jar);
  assert.match(mile.html, /data-celebrate="milestone"/);
  assert.equal(ctx.row().tap_count, 10);
});

test("POST /combo is the owner's alone, for a named pet and a valid uid", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await tap(ctx, jar);
  const before = ctx.row();
  ctx.advance(SEC);
  assert.deepEqual(await combo(ctx, {}), { status: 403, body: { ok: false } });
  assert.deepEqual(await combo(ctx, { owner_token: "nope" }), { status: 403, body: { ok: false } });
  const unnamed = await meet(ctx, B);
  assert.deepEqual(await combo(ctx, unnamed.jar, B), { status: 403, body: { ok: false } });
  for (const body of [{ uid: "bad" }, {}, { uid: [A] }, { uid: `${A}x12` }, { uid: A.toLowerCase() }]) {
    const bad = await ctx.request("/combo", { jar, body });
    assert.deepEqual([bad.status, JSON.parse(bad.html)], [400, { ok: false }]);
  }
  assert.deepEqual(ctx.row(), before);
});

test("POST /combo start: a plain tap starts the chain in place with /t's reward", async (t) => {
  const ctx = await setup(t);
  const a = await meet(ctx, A, "Mochi");
  const b = await meet(ctx, B, "Momo");
  await tap(ctx, a.jar);
  await tap(ctx, b.jar, B);
  ctx.advance(31 * 60 * SEC);
  const before = ctx.row();
  const res = await start(ctx, a.jar);
  await tap(ctx, b.jar, B);
  const after = ctx.row();
  assert.deepEqual(rewardOf(after), rewardOf(ctx.row(B)));
  assert.equal(after.xp, before.xp + 10);
  assert.deepEqual([after.tap_count, after.last_tap_at, ...chainOf(after)], [before.tap_count + 1, new Date(ctx.now()).toISOString(), 1, ctx.now()]);
  const xp = xpProgress(after.xp);
  assert.deepEqual(res, { status: 200, body: { ok: true, combo: 1, same: false, tapCount: after.tap_count, rewarded: true, hearts: heartHalves(after.mood_value), level: xp.level, xpInto: xp.into, xpSpan: xp.span, later: "" } });
  ctx.advance(500);
  assert.deepEqual((await start(ctx, a.jar)).body, { ok: true, combo: 1, same: true, tapCount: after.tap_count });
  assert.deepEqual(ctx.row(), after);
  ctx.advance(3 * SEC);
  assert.equal((await combo(ctx, a.jar)).body.combo, 2);
});

test("POST /combo start on cooldown counts the tap and holds the cooldown line for after the key", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await tap(ctx, jar);
  ctx.advance(4 * SEC);
  assert.equal((await combo(ctx, jar)).body.combo, 2);
  // The page's key ran out at 10 s; the server's window still has 2 s.
  ctx.advance(10.5 * SEC);
  const before = ctx.row();
  const res = await start(ctx, jar);
  const after = ctx.row();
  assert.deepEqual(rewardOf(after), rewardOf(before));
  assert.deepEqual([after.tap_count, ...chainOf(after)], [before.tap_count + 1, 1, ctx.now()]);
  const xp = xpProgress(after.xp);
  const mood = currentMood({ moodValue: after.mood_value, moodUpdatedAt: after.mood_updated_at }, ctx.now());
  assert.deepEqual(res.body, { ok: true, combo: 1, same: false, tapCount: after.tap_count, rewarded: false, hearts: heartHalves(mood), level: xp.level, xpInto: xp.into, xpSpan: xp.span, later: "방금 토닥여 줘서 기분 좋아요! 조금 있다가 또 토닥여 주세요." });
});

test("POST /combo start leaves /t's big moments to a full load and writes nothing", async (t) => {
  const cases = {
    "first tap of the day": (ctx) => ctx.advance(24 * 60 * 60 * SEC),
    "level-up": (ctx) => {
      ctx.advance(31 * 60 * SEC);
      ctx.db.prepare("UPDATE plushies SET xp = 90 WHERE uid = ?").run(A);
    },
    milestone: (ctx) => ctx.db.prepare("UPDATE plushies SET tap_count = 9 WHERE uid = ?").run(A),
    reunion: (ctx) => {
      ctx.db.prepare("UPDATE plushies SET mood_value = 20, mood_updated_at = ? WHERE uid = ?").run(ctx.now(), A);
      ctx.advance(31 * 60 * SEC);
    },
    "lonely on cooldown": (ctx) => ctx.db.prepare("UPDATE plushies SET mood_value = 20, mood_updated_at = ? WHERE uid = ?").run(ctx.now(), A),
    asleep: (ctx, jar) => ctx.request("/care", { jar, body: { uid: A, act: "sleep" } }),
  };
  for (const [name, arrange] of Object.entries(cases)) {
    const ctx = await setup(t);
    const { jar } = await meet(ctx, A, "Mochi");
    await tap(ctx, jar);
    await arrange(ctx, jar);
    ctx.advance(20 * SEC);
    const before = ctx.row();
    assert.deepEqual(await start(ctx, jar), { status: 200, body: { ok: true, combo: 0 } }, name);
    assert.deepEqual(ctx.row(), before, name);
  }
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await tap(ctx, jar, `${A}x000005`);
  ctx.advance(20 * SEC);
  const before = ctx.row();
  for (const uid of [`${A}x000005`, A]) {
    assert.deepEqual(await start(ctx, jar, uid), { status: 200, body: { ok: true, combo: 0 } }, uid);
    assert.deepEqual(ctx.row(), before, uid);
  }
  assert.equal((await start(ctx, jar, `${A}x000006`)).body.combo, 1);
  assert.equal(ctx.row().last_counter, 6);
});

test("POST /combo start is the owner's alone, for a named pet", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await tap(ctx, jar);
  ctx.advance(20 * SEC);
  const before = ctx.row();
  assert.deepEqual(await start(ctx, {}), { status: 403, body: { ok: false } });
  const unnamed = await meet(ctx, B);
  assert.deepEqual(await start(ctx, unnamed.jar, B), { status: 403, body: { ok: false } });
  assert.deepEqual(ctx.row(), before);
});

test("a pre-combo database gains the combo columns as no chain", async (t) => {
  const dir = mkdtempSync(join(process.cwd(), ".test-data-"));
  t.after(() => {
    assert.equal(dirname(dir), process.cwd());
    rmSync(dir, { recursive: true, force: true });
  });
  {
    const old = new Database(join(dir, "plushies.db"));
    old.exec(`CREATE TABLE plushies (
      uid TEXT PRIMARY KEY, pet_name TEXT NULL, owner_token_hash TEXT NULL,
      recovery_code_hash TEXT NULL, tap_count INTEGER DEFAULT 0, created_at TEXT, last_tap_at TEXT,
      mood_value INTEGER, mood_updated_at INTEGER, xp INTEGER, last_rewarded_at INTEGER, reward_day TEXT,
      reward_day_count INTEGER, last_gift_day TEXT, gift_seen TEXT, gift_found TEXT, days_together INTEGER,
      last_active_day TEXT, last_counter INTEGER, next_gift_tier TEXT,
      fed_at INTEGER, meals INTEGER, played_at INTEGER, plays INTEGER, slept_at INTEGER
    );
    CREATE TABLE claim_attempts (
      uid TEXT PRIMARY KEY REFERENCES plushies(uid) ON DELETE CASCADE,
      attempts INTEGER NOT NULL, window_start INTEGER NOT NULL
    );`);
    old.prepare("INSERT INTO plushies (uid, pet_name, tap_count) VALUES (?, ?, ?)").run(A, "Mochi", 3);
    old.close();
  }
  const db = openDatabase(dir);
  const cols = db.prepare("PRAGMA table_info(plushies)").all().map((c) => c.name);
  for (const name of ["combo_count", "combo_at"]) assert.ok(cols.includes(name), name);
  assert.deepEqual(chainOf(db.prepare("SELECT * FROM plushies WHERE uid = ?").get(A)), [null, null]);
  db.close();
});

test("dad's panel has the hidden NFC button for a named demo pet", async (t) => {
  const ctx = await setup(t, { demoUids: [A, B] });
  const { jar } = await meet(ctx, A, "Mochi");
  const home = await tap(ctx, jar);
  assert.match(home.html, /돌봄 처음으로 돌리기<\/button>\s*<\/form>\s*<button type="button" class="secondary" data-demo-nfc hidden>NFC 바로 인식 켜기<\/button>/);
  const unnamed = await meet(ctx, B);
  const meetPage = await tap(ctx, unnamed.jar, B);
  assert.match(meetPage.html, /data-demo-panel/);
  assert.doesNotMatch(meetPage.html, /data-demo-nfc/);
});
