import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
import { fakeUids } from "../src/pages.js";

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

async function care(ctx, jar, act, uid = A) {
  const res = await ctx.request("/care", { jar, body: { uid, act } });
  return { status: res.status, body: JSON.parse(res.html) };
}

const careCols = (row) => [row.fed_at, row.meals, row.played_at, row.plays, row.slept_at];

test("owner feeds: full, nibble, then a stash that writes nothing", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  ctx.db.prepare("UPDATE plushies SET mood_value = 10, mood_updated_at = ? WHERE uid = ?").run(T0, A);
  const home = await ctx.request(`/t?uid=${A}`, { jar });
  assert.match(home.html, /<nav class="dock" aria-label="메뉴" data-want="feed" data-meals="0" data-care-uid="04AAAAAAAAAAA1" data-combo="0">/);
  ctx.db.prepare("UPDATE plushies SET mood_value = 10, mood_updated_at = ? WHERE uid = ?").run(T0, A);
  const one = await care(ctx, jar, "feed");
  assert.equal(one.status, 200);
  assert.deepEqual(one.body, { ok: true, beat: "full", gain: 20, hearts: 3, lonely: true, want: "play", meals: 1 });
  assert.deepEqual(careCols(ctx.row()), [T0, 1, null, 0, null]);
  assert.deepEqual([ctx.row().mood_value, ctx.row().mood_updated_at], [30, T0]);
  ctx.advance(MIN);
  const two = await care(ctx, jar, "feed");
  assert.deepEqual(two.body, { ok: true, beat: "nibble", gain: 10, hearts: 4, lonely: false, want: "play", meals: 2 });
  assert.deepEqual(careCols(ctx.row()), [T0 + MIN, 2, null, 0, null]);
  assert.deepEqual([ctx.row().mood_value, ctx.row().mood_updated_at], [40, T0 + MIN]);
  ctx.advance(MIN);
  const before = ctx.row();
  const three = await care(ctx, jar, "feed");
  assert.deepEqual(three.body, { ok: true, beat: "stash", gain: 0, hearts: 4, lonely: false, want: "play", meals: 2 });
  assert.deepEqual(ctx.row(), before);
  const played = await care(ctx, jar, "play");
  assert.deepEqual([played.body.beat, played.body.gain, played.body.want], ["play", 20, null]);
  assert.deepEqual(careCols(ctx.row()), [T0 + MIN, 2, T0 + 2 * MIN, 1, null]);
  const after = await ctx.request(`/t?uid=${A}`, { jar });
  assert.match(after.html, /data-want="" data-meals="2" data-care-uid=/);
});

test("care is the owner's alone and only for a named pet", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  const before = ctx.row();
  const stranger = await care(ctx, {}, "feed");
  assert.deepEqual([stranger.status, stranger.body], [403, { ok: false }]);
  const wrong = await care(ctx, { owner_token: "nope" }, "feed");
  assert.equal(wrong.status, 403);
  assert.deepEqual(ctx.row(), before);
  const unnamed = await meet(ctx, B);
  const res = await care(ctx, unnamed.jar, "feed", B);
  assert.deepEqual([res.status, res.body], [403, { ok: false }]);
  assert.deepEqual(careCols(ctx.row(B)), [null, null, null, null, null]);
  for (const body of [{ uid: A, act: "pat" }, { uid: A }, { uid: "bad", act: "feed" }, { act: "feed" }, { uid: A, act: ["feed"] }]) {
    const bad = await ctx.request("/care", { jar, body });
    assert.deepEqual([bad.status, JSON.parse(bad.html)], [400, { ok: false }]);
  }
  assert.deepEqual(ctx.row(), before);
});

test("sleep holds until the owner's next tap, which renders the morning page", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  const slept = await care(ctx, jar, "sleep");
  assert.deepEqual([slept.body.beat, slept.body.gain, slept.body.want], ["sleep", 10, null]);
  assert.equal(ctx.row().slept_at, T0);
  const mumble = await care(ctx, jar, "feed");
  assert.deepEqual([mumble.body.beat, mumble.body.gain], ["mumble", 0]);
  assert.deepEqual(careCols(ctx.row()), [null, 0, null, 0, T0]);
  ctx.advance(MIN);
  const stranger = await ctx.request(`/t?uid=${A}`);
  assert.match(stranger.html, /이미 주인이 있어요/);
  assert.doesNotMatch(stranger.html, /data-morning/);
  assert.equal(ctx.row().slept_at, T0);
  const morning = await ctx.request(`/t?uid=${A}`, { jar });
  assert.match(morning.html, /<body class="is-home"[^>]* data-morning>/);
  assert.match(morning.html, /<p class="intro"[^>]*>쿨쿨… 쿨쿨…<\/p>/);
  assert.match(morning.html, /data-want="feed" data-meals="0"/);
  assert.equal(ctx.row().slept_at, null);
  const next = await ctx.request(`/t?uid=${A}`, { jar });
  assert.doesNotMatch(next.html, /data-morning|쿨쿨/);
  assert.match(next.html, /다시 만나서 반가워요, Mochi!/);
});

test("the skip render after a redirect also wakes the pet", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await care(ctx, jar, "sleep");
  const taps = ctx.row().tap_count;
  const skip = await ctx.request(`/t?uid=${A}`, { jar: { ...jar, pet_skip: A } });
  assert.match(skip.html, /data-morning/);
  assert.equal(ctx.row().slept_at, null);
  assert.equal(ctx.row().tap_count, taps);
});

test("a cooldown tap on a morning page drops the soft line", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  const tap = await ctx.request(`/t?uid=${A}`, { jar });
  assert.match(tap.html, /data-rewarded="1"/);
  await care(ctx, jar, "sleep");
  ctx.advance(MIN);
  const morning = await ctx.request(`/t?uid=${A}`, { jar });
  assert.match(morning.html, /data-reason="cooldown"/);
  assert.match(morning.html, /data-morning/);
  assert.doesNotMatch(morning.html, /is-soft|조금 있다가 또 토닥여/);
  const cool = await ctx.request(`/t?uid=${A}`, { jar });
  assert.match(cool.html, /data-reason="cooldown"/);
  assert.doesNotMatch(cool.html, /data-morning/);
});

test("care never grants XP", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  for (const act of ["feed", "feed", "play", "play", "sleep"]) await care(ctx, jar, act);
  assert.equal(ctx.row().xp, 0);
});

test("a pre-care database gains the care columns as never fed, never played, awake", async (t) => {
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
      last_active_day TEXT, last_counter INTEGER, next_gift_tier TEXT
    );
    CREATE TABLE claim_attempts (
      uid TEXT PRIMARY KEY REFERENCES plushies(uid) ON DELETE CASCADE,
      attempts INTEGER NOT NULL, window_start INTEGER NOT NULL
    );`);
    old.prepare("INSERT INTO plushies (uid, pet_name, tap_count, mood_value, mood_updated_at, xp) VALUES (?, ?, ?, ?, ?, ?)").run(A, "Mochi", 3, 50, T0, 40);
    old.close();
  }
  const db = openDatabase(dir);
  const cols = db.prepare("PRAGMA table_info(plushies)").all().map((c) => c.name);
  for (const name of ["fed_at", "meals", "played_at", "plays", "slept_at"]) assert.ok(cols.includes(name), name);
  const row = db.prepare("SELECT * FROM plushies WHERE uid = ?").get(A);
  assert.deepEqual(careCols(row), [null, null, null, null, null]);
  assert.deepEqual([row.pet_name, row.tap_count, row.mood_value, row.xp], ["Mochi", 3, 50, 40]);
  db.close();
});

test("dad's care reset clears care for a demo chip only", async (t) => {
  const ctx = await setup(t, { demoUids: [A] });
  const { jar } = await meet(ctx, A, "Mochi");
  const home = await ctx.request(`/t?uid=${A}`, { jar });
  assert.match(home.html, /<form action="\/demo\/care-reset" method="post"[^>]*>\s*<input type="hidden" name="uid" value="04AAAAAAAAAAA1">\s*<button type="submit" class="secondary">돌봄 처음으로 돌리기<\/button>/);
  await care(ctx, jar, "feed");
  await care(ctx, jar, "play");
  await care(ctx, jar, "sleep");
  const taps = ctx.row().tap_count;
  const res = await ctx.request("/demo/care-reset", { jar, body: { uid: A } });
  assert.equal(res.status, 303);
  assert.equal(res.location, `/t?uid=${A}`);
  updateJar(jar, res.setCookies);
  assert.equal(jar.pet_skip, A);
  assert.deepEqual(careCols(ctx.row()), [null, null, null, null, null]);
  const back = await ctx.request(`/t?uid=${A}`, { jar });
  assert.doesNotMatch(back.html, /data-morning/);
  assert.match(back.html, /data-want="feed" data-meals="0"/);
  assert.equal(ctx.row().tap_count, taps);
  const other = await meet(ctx, B, "Pippo");
  await care(ctx, other.jar, "feed", B);
  const refused = await ctx.request("/demo/care-reset", { jar: other.jar, body: { uid: B } });
  assert.equal(refused.status, 403);
  assert.equal(ctx.row(B).meals, 1);
  const plain = await ctx.request(`/t?uid=${B}`, { jar: other.jar });
  assert.doesNotMatch(plain.html, /care-reset/);
});

test("care reset is not routed without demo chips", async (t) => {
  const ctx = await setup(t);
  await meet(ctx, A, "Mochi");
  assert.equal((await ctx.request("/demo/care-reset", { body: { uid: A } })).status, 404);
});
