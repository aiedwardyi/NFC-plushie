import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
import { fakeUids } from "../src/pages.js";
import { hash } from "../src/secrets.js";

const [A, B, C] = fakeUids;
const T0 = Date.parse("2026-05-01T00:00:00+09:00");
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
  const server = createApp({ db, now: () => time, rng: () => 0, ...options }).listen(0, "localhost");
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
    return { status: res.status, html: await res.text(), headers: res.headers, setCookies };
  }
  const row = (uid = A) => db.prepare("SELECT * FROM plushies WHERE uid = ?").get(uid);
  return { db, request, row, advance: (ms) => { time += ms; } };
}

async function meet(setupCtx, uid, name) {
  const { request } = setupCtx;
  const jar = {};
  const first = await request(`/t?uid=${uid}`, { jar });
  assert.equal(first.status, 200);
  updateJar(jar, first.setCookies);
  const code = first.html.match(/class="code">([A-Z2-9]{6})</)[1];
  if (name) {
    const named = await request("/name", { jar, body: { uid, name } });
    assert.equal(named.status, 303);
    updateJar(jar, named.setCookies);
    const skip = await request(`/t?uid=${uid}`, { jar });
    assert.equal(skip.status, 200);
    updateJar(jar, skip.setCookies);
  }
  return { jar, code };
}

test("claim sets mood 100 with no XP, gift, or cooldown", async (t) => {
  const ctx = await setup(t);
  await meet(ctx, A, "Mochi");
  const row = ctx.row();
  assert.equal(row.mood_value, 100);
  assert.equal(row.mood_updated_at, T0);
  assert.equal(row.xp, 0);
  assert.equal(row.days_together, 1);
  assert.equal(row.last_gift_day, null);
  assert.equal(row.last_rewarded_at, null);
  assert.equal(row.reward_day_count, 0);
  assert.equal(row.gift_found, "[]");
});

test("the post-naming render is not a pet tap", async (t) => {
  const ctx = await setup(t);
  const { request } = ctx;
  const jar = {};
  const first = await request(`/t?uid=${A}`, { jar });
  updateJar(jar, first.setCookies);
  const named = await request("/name", { jar, body: { uid: A, name: "Mochi" } });
  updateJar(jar, named.setCookies);
  const skip = await request(`/t?uid=${A}`, { jar });
  assert.match(skip.html, /data-celebrate="named"/);
  assert.match(skip.html, /만나서 반가워요, Mochi!/);
  assert.doesNotMatch(skip.html, /다시 만나서 반가워요/);
  assert.match(skip.html, /data-rewarded="0" data-reason=""/);
  assert.doesNotMatch(skip.html, /오늘의 선물|특별한 선물|반짝 선물/);
  assert.doesNotMatch(skip.html, /행복이 가득|내일 또 만나자|콕 찍고|조금 있다가 또 토닥여|class="pet-line/);
  assert.equal(ctx.row().tap_count, 1);
  assert.equal(ctx.row().xp, 0);
  assert.equal(ctx.row().mood_value, 100);
});

test("first tap after claim is rewarded with first-of-day bonus and a gift", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  const tap = await ctx.request(`/t?uid=${A}`, { jar });
  updateJar(jar, tap.setCookies);
  assert.match(tap.html, /data-rewarded="1"/);
  assert.match(tap.html, /data-gift="common"/);
  assert.match(tap.html, /오늘도 와줘서 고마워요!/);
  assert.match(tap.html, /선물 1\/30/);
  assert.match(tap.html, /함께한 지 1일/);
  assert.match(tap.html, /Lv\. 1/);
  const row = ctx.row();
  assert.equal(row.xp, 40);
  assert.equal(row.mood_value, 100);
  assert.equal(row.last_gift_day, "2026-05-01");
  assert.equal(row.reward_day_count, 1);
});

test("reload within 30 minutes is unrewarded and writes nothing but tap_count", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await ctx.request(`/t?uid=${A}`, { jar });
  const before = ctx.row();
  const reload = await ctx.request(`/t?uid=${A}`, { jar });
  assert.match(reload.html, /data-rewarded="0"/);
  assert.match(reload.html, /data-reason="cooldown"/);
  assert.match(reload.html, /data-combo="1"/);
  assert.doesNotMatch(reload.html, /is-soft/);
  assert.match(reload.html, /data-combo-later="방금 토닥여 줘서 기분 좋아요! 조금 있다가 또 토닥여 주세요\."/);
  assert.doesNotMatch(reload.html, /<p class="gift /);
  assert.doesNotMatch(reload.html, /행복이 가득/);
  const after = ctx.row();
  assert.equal(after.tap_count, before.tap_count + 1);
  assert.equal(after.xp, before.xp);
  assert.equal(after.mood_value, before.mood_value);
  assert.equal(after.mood_updated_at, before.mood_updated_at);
  assert.equal(after.last_rewarded_at, before.last_rewarded_at);
  assert.equal(after.gift_found, before.gift_found);
});

test("a phone's reload (view=1) shows the pet and is no tap", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await ctx.request(`/t?uid=${A}`, { jar });
  ctx.db.prepare("UPDATE plushies SET tap_count = 10 WHERE uid = ?").run(A);
  ctx.advance(31 * MIN);
  const before = ctx.row();
  const view = await ctx.request(`/t?uid=${A}&view=1`, { jar });
  assert.equal(view.status, 200);
  assert.match(view.html, /data-rewarded="0" data-reason=""/);
  assert.match(view.html, /data-combo="0"/);
  assert.match(view.html, /10번 토닥여 줬어요!/);
  assert.doesNotMatch(view.html, /data-celebrate|벌써 열 번이에요/);
  assert.deepEqual(ctx.row(), before);
  const stranger = await ctx.request(`/t?uid=${A}&view=1`);
  assert.match(stranger.html, /이미 주인이 있어요/);
  const tap = await ctx.request(`/t?uid=${A}`, { jar });
  assert.match(tap.html, /data-rewarded="1"/);
  assert.equal(ctx.row().tap_count, 11);
});

test("a phone's reload (view=1) before naming keeps the plain naming page", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A);
  const before = ctx.row();
  const view = await ctx.request(`/t?uid=${A}&view=1`, { jar });
  assert.equal(view.status, 200);
  assert.match(view.html, /name="name"/);
  assert.doesNotMatch(view.html, /data-pet-state|Lv\. 1/);
  assert.deepEqual(ctx.row(), before);
});

test("the 7th eligible tap in a Seoul day hits the daily cap", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  for (let i = 1; i <= 6; i++) {
    const r = await ctx.request(`/t?uid=${A}`, { jar });
    assert.match(r.html, /data-rewarded="1"/, `tap ${i} should be rewarded`);
    ctx.advance(31 * MIN);
  }
  const capped = await ctx.request(`/t?uid=${A}`, { jar });
  assert.match(capped.html, /data-rewarded="0"/);
  assert.match(capped.html, /data-reason="cap"/);
  assert.match(capped.html, /data-combo="1"/);
  assert.doesNotMatch(capped.html, /is-soft/);
  assert.match(capped.html, /data-combo-later="오늘은 실컷 놀았어요! 내일 또 만나요!"/);
});

test("uid-only and uid+counter map to the same plushie", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  const tap = await ctx.request(`/t?uid=${A}x00000A`, { jar });
  assert.equal(tap.status, 200);
  assert.match(tap.html, /data-rewarded="1"/);
  assert.equal(ctx.db.prepare("SELECT count(*) AS n FROM plushies").get().n, 1);
  assert.equal(ctx.row().tap_count, 2);
  assert.equal(ctx.row().last_counter, 10);
  ctx.advance(31 * MIN);
  const higher = await ctx.request(`/t?uid=${A}x00000B`, { jar });
  assert.match(higher.html, /data-rewarded="1"/);
  assert.equal(ctx.row().last_counter, 11);
});

test("a repeated or lower counter is stale, and the mirror never lowers", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await ctx.request(`/t?uid=${A}x00000A`, { jar });
  ctx.advance(31 * MIN);
  const same = await ctx.request(`/t?uid=${A}x00000A`, { jar });
  assert.match(same.html, /data-rewarded="0"/);
  assert.match(same.html, /data-reason="stale"/);
  assert.match(same.html, /폰을 진짜 저한테 톡 대 주세요!/);
  const lower = await ctx.request(`/t?uid=${A}x000009`, { jar });
  assert.match(lower.html, /data-reason="stale"/);
  assert.equal(ctx.row().last_counter, 10);
});

test("a uid-only tap on a mirrored plushie is stale", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await ctx.request(`/t?uid=${A}x00000A`, { jar });
  ctx.advance(31 * MIN);
  const bare = await ctx.request(`/t?uid=${A}`, { jar });
  assert.match(bare.html, /data-rewarded="0"/);
  assert.match(bare.html, /data-reason="stale"/);
  assert.match(bare.html, /폰을 진짜 저한테 톡 대 주세요!/);
});

test("a null mirror keeps uid-only behavior exactly", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  const tap = await ctx.request(`/t?uid=${A}`, { jar });
  assert.match(tap.html, /data-rewarded="1"/);
  assert.equal(ctx.row().last_counter, null);
});

for (const bad of [`${A}xZZZZZZ`, `${A}x12345`, `${A}x1234567`, `${A}x00000a`, `${A}X00000A`]) {
  test(`malformed counter rejected without writes: ${bad}`, async (t) => {
    const ctx = await setup(t);
    const r = await ctx.request(`/t?uid=${bad}`);
    assert.equal(r.status, 400);
    assert.equal(ctx.db.prepare("SELECT count(*) AS n FROM plushies").get().n, 0);
  });
}

test("stranger pages leak no pet state", async (t) => {
  const ctx = await setup(t);
  await meet(ctx, A, "Mochi");
  await ctx.request(`/t?uid=${A}`, { jar: {} });
  const stranger = await ctx.request(`/t?uid=${A}`);
  for (const re of [/data-pet-state/, /pet-stats/, /pet-moments/, /data-hearts/, /Lv\./, /선물 \d/, /함께한 지/, /data-mood/, /data-gift/, /data-rewarded/, /data-reason/, /data-tap-count/, /data-celebrate/, /count-final/, /class="milestone"/, /<p class="gift /, /evo-overlay/, /data-evo/]) {
    assert.doesNotMatch(stranger.html, re, String(re));
  }
  assert.match(stranger.html, /이미 주인이 있어요/);
});

test("unnamed owner taps stay non-rewarded until named", async (t) => {
  const ctx = await setup(t);
  const { request } = ctx;
  const jar = {};
  await request(`/t?uid=${A}`, { jar }).then((r) => updateJar(jar, r.setCookies));
  const next = await request(`/t?uid=${A}`, { jar });
  assert.match(next.html, /제 이름을 뭐라고 지어 줄래요/);
  assert.doesNotMatch(next.html, /data-pet-state/);
  assert.equal(ctx.row().xp, 0);
});

test("recovery transfer keeps mood, XP, gifts, and days together", async (t) => {
  const ctx = await setup(t);
  const { request } = ctx;
  const { jar, code } = await meet(ctx, A, "Mochi");
  await request(`/t?uid=${A}`, { jar });
  const before = ctx.row();
  assert.ok(before.xp > 0);
  const freshJar = {};
  const claimed = await request("/claim", { jar: freshJar, body: { uid: A, code } });
  assert.equal(claimed.status, 303);
  assert.equal(claimed.headers.get("location"), `/t?uid=${A}`);
  updateJar(freshJar, claimed.setCookies);
  assert.notEqual((freshJar.owner_token || ""), (jar.owner_token || ""));
  const moved = await request(`/t?uid=${A}`, { jar: freshJar });
  updateJar(freshJar, moved.setCookies);
  const after = ctx.row();
  assert.equal(after.mood_value, before.mood_value);
  assert.equal(after.xp, before.xp);
  assert.equal(after.gift_found, before.gift_found);
  assert.equal(after.gift_seen, before.gift_seen);
  assert.equal(after.days_together, before.days_together);
  assert.equal(after.pet_name, before.pet_name);
  const oldPhone = await request(`/t?uid=${A}`, { jar });
  assert.match(oldPhone.html, /이미 주인이 있어요/);
});

test("naming A then tapping B still rewards B", async (t) => {
  const ctx = await setup(t);
  const b = await meet(ctx, B, "DuckB");
  const a = await meet(ctx, A, "DuckA");
  const tapB = await ctx.request(`/t?uid=${B}`, { jar: b.jar });
  assert.match(tapB.html, /data-rewarded="1"/, "B must not be skipped by A pet_skip");
  assert.equal(ctx.row(B).xp, 40);
});

test("counter-URL owners name with the serial, and pages carry the serial only", async (t) => {
  const ctx = await setup(t);
  const { request } = ctx;
  const jar = {};
  const first = await request(`/t?uid=${A}x00000A`, { jar });
  assert.equal(first.status, 200);
  updateJar(jar, first.setCookies);
  assert.match(first.html, new RegExp(`name="uid" value="${A}"`));
  assert.doesNotMatch(first.html, new RegExp(`${A}x`));
  const named = await request("/name", { jar, body: { uid: A, name: "Mochi" } });
  assert.equal(named.status, 303);
  assert.equal(named.headers.get("location"), `/t?uid=${A}`);
  updateJar(jar, named.setCookies);
  const skip = await request(`/t?uid=${A}x00000B`, { jar });
  assert.equal(skip.status, 200);
  assert.doesNotMatch(skip.html, new RegExp(`${A}x`));
});

test("migration keeps identity and backfills pet fields", async (t) => {
  const dir = mkdtempSync(join(process.cwd(), ".test-data-"));
  t.after(() => {
    assert.equal(dirname(dir), process.cwd());
    rmSync(dir, { recursive: true, force: true });
  });
  const tokenHash = hash("owner-token");
  const codeHash = hash("ABC234");
  {
    const old = new Database(join(dir, "plushies.db"));
    old.exec(`CREATE TABLE plushies (
      uid TEXT PRIMARY KEY, pet_name TEXT NULL, owner_token_hash TEXT NULL,
      recovery_code_hash TEXT NULL, tap_count INTEGER DEFAULT 0, created_at TEXT, last_tap_at TEXT
    );
    CREATE TABLE claim_attempts (
      uid TEXT PRIMARY KEY REFERENCES plushies(uid) ON DELETE CASCADE,
      attempts INTEGER NOT NULL, window_start INTEGER NOT NULL
    );`);
    old.prepare("INSERT INTO plushies (uid, pet_name, owner_token_hash, recovery_code_hash, tap_count, created_at, last_tap_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(A, "Mochi", tokenHash, codeHash, 7, "2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z");
    old.close();
  }
  const before = Date.now();
  const db = openDatabase(dir);
  const after = Date.now();
  const row = db.prepare("SELECT * FROM plushies WHERE uid = ?").get(A);
  assert.equal(row.pet_name, "Mochi");
  assert.equal(row.owner_token_hash, tokenHash);
  assert.equal(row.recovery_code_hash, codeHash);
  assert.equal(row.tap_count, 7);
  assert.equal(row.xp, 0);
  assert.equal(row.mood_value, 70);
  assert.ok(row.mood_updated_at >= before && row.mood_updated_at <= after);
  assert.equal(row.days_together, 1);
  assert.equal(row.gift_seen, '{"common":[],"special":[],"rare":[]}');
  assert.equal(row.gift_found, "[]");
  assert.equal(row.last_counter, null);
  assert.equal(row.reward_day_count, 0);
  db.close();
  const reopened = openDatabase(dir);
  const again = reopened.prepare("SELECT * FROM plushies WHERE uid = ?").get(A);
  assert.deepEqual(again, row);
  reopened.close();
});

test("dev prime and preview cover the pet states", async (t) => {
  const ctx = await setup(t);
  const { request } = ctx;
  await meet(ctx, C, "Pippo");
  const lonely = await request("/dev/prime", { body: { uid: C, preset: "lonely" } });
  assert.equal(lonely.status, 303);
  assert.equal(ctx.db.prepare("SELECT mood_value FROM plushies WHERE uid = ?").get(C).mood_value, 20);
  const levelup = await request("/dev/prime", { body: { uid: C, preset: "levelup" } });
  assert.equal(levelup.status, 303);
  assert.equal(ctx.db.prepare("SELECT xp FROM plushies WHERE uid = ?").get(C).xp, 90);
  const forced = await request("/dev/prime", { body: { uid: C, tier: "rare" } });
  assert.equal(forced.status, 303);
  assert.equal(ctx.db.prepare("SELECT next_gift_tier FROM plushies WHERE uid = ?").get(C).next_gift_tier, "rare");
  for (const path of [
    "/dev/preview?kind=levelup&count=10",
    "/dev/preview?kind=reunion&count=10",
    "/dev/preview?kind=gift&count=10&tier=rare",
    "/dev/preview?kind=lonely&count=10",
    "/dev/preview?kind=gift&count=10&reason=stale",
  ]) {
    assert.equal((await request(path)).status, 200, path);
  }
  assert.equal((await request("/dev/preview?kind=nope&count=10")).status, 404);
});

test("reunion tap from mood 25 shows reunion with no lonely marker", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  ctx.db.prepare("UPDATE plushies SET mood_value = 25, mood_updated_at = ?, last_rewarded_at = NULL WHERE uid = ?")
    .run(T0, A);
  const tap = await ctx.request(`/t?uid=${A}`, { jar });
  assert.match(tap.html, /data-rewarded="1"/);
  assert.match(tap.html, /data-reunion="1"/);
  assert.match(tap.html, /data-lonely="0"/);
  assert.match(tap.html, /보고 싶었어요! 진짜로요!/);
  assert.doesNotMatch(tap.html, /is-lonely/);
  assert.doesNotMatch(tap.html, /외로워/);
});

test("celebration priority: levelup over milestone, reunion over milestone, rare over special", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  ctx.db.prepare("UPDATE plushies SET tap_count = 9, xp = 90, last_rewarded_at = NULL WHERE uid = ?").run(A);
  const both = await ctx.request(`/t?uid=${A}`, { jar });
  assert.match(both.html, /data-celebrate="levelup"/);
  assert.match(both.html, /쑥쑥 컸어요! 이제 Lv\. 2!/);
  assert.match(both.html, /벌써 열 번이에요!/);
  assert.match(both.html, /Lv\. 2/);
  assert.match(both.html, /pet-moments[\s\S]*쑥쑥 컸어요![\s\S]*벌써 열 번이에요![\s\S]*pet-stats/);
  assert.match(both.html, /xp-fill" data-xp="(\d+)"/);
  const xpPct = Number(both.html.match(/xp-fill" data-xp="(\d+)"/)[1]);
  assert.ok(xpPct < 50, `expected near-empty XP after level-up, got ${xpPct}%`);
  assert.notEqual(xpPct, 100);

  const ctx2 = await setup(t);
  const { jar: jar2 } = await meet(ctx2, A, "Mochi");
  ctx2.db.prepare("UPDATE plushies SET tap_count = 9, mood_value = 20, mood_updated_at = ?, last_rewarded_at = NULL WHERE uid = ?")
    .run(T0, A);
  const reunion = await ctx2.request(`/t?uid=${A}`, { jar: jar2 });
  assert.match(reunion.html, /data-celebrate="reunion"/);
  assert.match(reunion.html, /벌써 열 번이에요!/);
  assert.match(reunion.html, /보고 싶었어요! 진짜로요!/);

  const ctx3 = await setup(t);
  const { jar: jar3 } = await meet(ctx3, A, "Mochi");
  await ctx3.request("/dev/prime", { body: { uid: A, tier: "rare" } });
  const rare = await ctx3.request(`/t?uid=${A}`, { jar: jar3 });
  assert.match(rare.html, /data-celebrate="rare"/);
  assert.match(rare.html, /data-gift="rare"/);
  assert.match(rare.html, /반짝 선물/);

  const ctx4 = await setup(t);
  const { jar: jar4 } = await meet(ctx4, A, "Mochi");
  await ctx4.request("/dev/prime", { body: { uid: A, tier: "special" } });
  const special = await ctx4.request(`/t?uid=${A}`, { jar: jar4 });
  assert.match(special.html, /data-celebrate="special"/);
  assert.match(special.html, /data-gift="special"/);
  assert.match(special.html, /특별한 선물/);
});

test("days_together counts distinct Seoul days with rewarded taps", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  assert.equal(ctx.row().days_together, 1);
  await ctx.request(`/t?uid=${A}`, { jar });
  assert.equal(ctx.row().days_together, 1);
  ctx.advance(24 * 60 * MIN);
  const next = await ctx.request(`/t?uid=${A}`, { jar });
  assert.match(next.html, /함께한 지 2일/);
  assert.equal(ctx.row().days_together, 2);
  ctx.advance(31 * MIN);
  const again = await ctx.request(`/t?uid=${A}`, { jar });
  assert.match(again.html, /함께한 지 2일/);
  assert.equal(ctx.row().days_together, 2);
});

test("claim render carries the claim marker and the client claim path is not empty", async (t) => {
  const ctx = await setup(t);
  const { request } = ctx;
  const jar = {};
  const first = await request(`/t?uid=${A}`, { jar });
  updateJar(jar, first.setCookies);
  assert.match(first.html, /data-celebrate="claim"/);
  await request("/name", { jar, body: { uid: A, name: "Mochi" } }).then((r) => updateJar(jar, r.setCookies));
  const skip = await request(`/t?uid=${A}`, { jar });
  assert.match(skip.html, /data-celebrate="named"/);
  const client = readFileSync(new URL("../public/app.js", import.meta.url), "utf-8");
  const block = client.match(/if \(kind === "claim"\) \{[\s\S]*?\n  \}/);
  assert.ok(block, "claim handler exists in client");
  assert.match(block[0], /pulseFlash/);
  assert.match(block[0], /shakeScreen/);
  assert.match(block[0], /burstConfetti/);
  assert.match(block[0], /mode: "claim"/);
  assert.match(block[0], /enhanceRollingCounter/);
});

test("gift card absent on unrewarded taps", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await ctx.request(`/t?uid=${A}`, { jar });
  const cool = await ctx.request(`/t?uid=${A}`, { jar });
  assert.match(cool.html, /data-reason="cooldown"/);
  assert.doesNotMatch(cool.html, /<p class="gift /);
  assert.match(cool.html, /선물 \d+\/30/);

  for (let i = 0; i < 5; i++) {
    ctx.advance(31 * MIN);
    await ctx.request(`/t?uid=${A}`, { jar });
  }
  ctx.advance(31 * MIN);
  const cap = await ctx.request(`/t?uid=${A}`, { jar });
  assert.match(cap.html, /data-reason="cap"/);
  assert.doesNotMatch(cap.html, /<p class="gift /);
});

test("first-claim greeting uses first-meeting copy", async (t) => {
  const ctx = await setup(t);
  const { request } = ctx;
  const jar = {};
  const first = await request(`/t?uid=${A}`, { jar });
  updateJar(jar, first.setCookies);
  const named = await request("/name", { jar, body: { uid: A, name: "Mochi" } });
  updateJar(jar, named.setCookies);
  const skip = await request(`/t?uid=${A}`, { jar });
  assert.match(skip.html, /만나서 반가워요, Mochi!/);
  assert.doesNotMatch(skip.html, /다시 만나서 반가워요/);
});

const DAY = 24 * 60 * MIN;
const statCardOf = (html) => html.match(/<div class="sheet" data-sheet="stats"[\s\S]*?<\/section>\s*<\/div>/)?.[0] || "";
const totalsOf = (card) => [...card.matchAll(/<b class="st-total">(\d+)<\/b>/g)].map((m) => Number(m[1]));
const petStatsOf = (html) => JSON.parse(html.match(/<div class="pet[^"]*" data-pet="(?:alive|away)" data-stats="([^"]+)"/)[1].replaceAll("&quot;", '"'));
const introOf = (html) => html.match(/<p class="intro"[^>]*>([^<]*)<\/p>/)[1];
const dialogOf = (html) => html.match(/<section class="dialog"[\s\S]*?<\/section>/)[0];
const setA = (ctx, sql, ...args) => ctx.db.prepare(`UPDATE plushies SET ${sql} WHERE uid = ?`).run(...args, A);
const GUILT = /외로|왜 안|슬펐|미워/;

test("the stat card shows a 포근 클래식 말 at 50/40/70/60, closed until asked", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  const home = await ctx.request(`/t?uid=${A}`, { jar });
  assert.match(home.html, /<div class="sheet" data-sheet="stats" role="dialog" aria-modal="true" aria-labelledby="sheet-stats-title" hidden>/);
  const card = statCardOf(home.html);
  assert.match(card, /<h2 id="sheet-stats-title">능력치<\/h2>/);
  assert.match(card, /<b class="st-animal" data-stat-animal>말<\/b><span class="st-edition is-classic">포근 클래식<\/span>/);
  assert.deepEqual(totalsOf(card), [50, 40, 70, 60]);
  assert.deepEqual([...card.matchAll(/<span class="st-label">([^<]+)<\/span>/g)].map((m) => m[1]), ["힘", "지능", "민첩", "매력"]);
  assert.deepEqual([...card.matchAll(/<small class="st-job">([^<]+)<\/small>/g)].map((m) => m[1]), ["기 모으기에서 더 높이", "텃밭 경험치 더 많이", "달리기에서 더 빨리", "버스 코인 더 많이"]);
  assert.match(card, /data-stat="agi">\s*<span class="st-label">민첩<\/span>\s*<span class="st-bar" role="img" aria-label="민첩 70" data-base="70" data-plus="0" data-trained="0">/);
  assert.equal((card.match(/<span class="st-boost" hidden>/g) || []).length, 4);
  assert.match(card, /<button type="button" class="st-snack" data-stat-farm>텃밭에서 간식 주기<\/button>/);
  assert.match(home.html, /<button type="button" class="level-open" data-open="stats" aria-haspopup="dialog" aria-label="능력치 보기, Lv\. 1">/);
  assert.deepEqual(petStatsOf(home.html), { str: { total: 50, bonus: 1.7, boost: 0 }, int: { total: 40, bonus: 0, boost: 0 }, agi: { total: 70, bonus: 5, boost: 0 }, cha: { total: 60, bonus: 3.3, boost: 0 } });
  const sheep = await ctx.request(`/t?uid=${A}&view=1`, { jar: { ...jar, mascot: "sheep" } });
  assert.deepEqual(totalsOf(statCardOf(sheep.html)), [50, 40, 70, 60]);
});

test("a RARE 말 shows 금실 레어 at 60/50/80/70 with its training and a pending boost", async (t) => {
  const ctx = await setup(t, { rareUids: [A] });
  const { jar } = await meet(ctx, A, "Mochi");
  setA(ctx, "stats = ?", JSON.stringify({ v: 1, trained: { cha: 3 }, boost: { agi: 10 } }));
  const home = await ctx.request(`/t?uid=${A}&view=1`, { jar });
  const card = statCardOf(home.html);
  assert.match(card, /<span class="st-edition is-rare">금실 레어<\/span>/);
  assert.deepEqual(totalsOf(card), [60, 50, 90, 73]);
  assert.match(card, /data-stat="agi">[\s\S]*?<b class="st-total">90<\/b><span class="st-boost">\+10<\/span>/);
  assert.match(card, /data-base="60" data-plus="10" data-trained="3"/);
  assert.deepEqual(petStatsOf(home.html).agi, { total: 90, bonus: 8.3, boost: 10 });
  setA(ctx, "stats = NULL");
  assert.deepEqual(totalsOf(statCardOf((await ctx.request(`/t?uid=${A}&view=1`, { jar })).html)), [60, 50, 80, 70]);
});

test("the level line names the next unlock until Lv 6", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  const next = async (xp) => {
    setA(ctx, "xp = ?", xp);
    return (await ctx.request(`/t?uid=${A}&view=1`, { jar })).html.match(/<span class="level-next" data-level-next data-unlocks="[^"]*"( hidden)?>([^<]*)<\/span>/);
  };
  assert.equal((await next(0))[2], "Lv 2: 당근");
  const two = await next(100);
  assert.deepEqual([two[1], two[2]], [undefined, "Lv 3: 토마토 + 씨앗 가게"]);
  assert.equal((await next(700))[2], "Lv 6: 황금 감자 씨앗");
  const six = await next(1000);
  assert.deepEqual([six[1], six[2]], [" hidden", ""]);
  const unlocks = JSON.parse((await ctx.request(`/t?uid=${A}&view=1`, { jar })).html.match(/data-unlocks="([^"]*)"/)[1].replaceAll("&quot;", '"'));
  assert.deepEqual(unlocks, { 1: "Lv 2: 당근", 2: "Lv 3: 토마토 + 씨앗 가게", 3: "Lv 4: 고구마", 4: "Lv 5: 수박", 5: "Lv 6: 황금 감자 씨앗" });
});

test("after a missed day, the first line says what ripened, never guilt", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  setA(ctx, "farm = ?", JSON.stringify({ v: 2, plots: [{ crop: "carrot", at: T0, quick: false }, null, null, null, null, null], bag: [], tasted: ["carrot"], unlockedTo: 2, arrived: [], harvested: 0, golden: 0, pantry: [], coins: 0, day: { key: null, feeds: 0, sent: 0 } }));
  ctx.advance(2 * DAY + 9 * 60 * MIN);
  const tap = await ctx.request(`/t?uid=${A}`, { jar });
  assert.match(tap.html, /data-rewarded="1"/);
  assert.equal(introOf(tap.html), "당근이 다 익었어요! 같이 볼래요?");
  assert.doesNotMatch(dialogOf(tap.html), GUILT);
  assert.doesNotMatch(tap.html, /다시 만나서 반가워요/);
  const again = await ctx.request(`/t?uid=${A}`, { jar });
  assert.equal(introOf(again.html), "다시 만나서 반가워요, Mochi!");
});

test("after a missed day with nothing ripe, the pet napped; one day apart keeps the usual hello", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  ctx.advance(DAY + 9 * 60 * MIN);
  assert.equal(introOf((await ctx.request(`/t?uid=${A}`, { jar })).html), "다시 만나서 반가워요, Mochi!");
  ctx.advance(2 * DAY);
  const view = await ctx.request(`/t?uid=${A}&view=1`, { jar });
  assert.equal(introOf(view.html), "다시 만나서 반가워요, Mochi!");
  const tap = await ctx.request(`/t?uid=${A}`, { jar });
  assert.equal(introOf(tap.html), "푹 자고 일어났어요. 오늘도 같이 놀아요!");
  assert.doesNotMatch(dialogOf(tap.html), GUILT);
});

test("the away line takes the reunion's words but keeps its jump", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  setA(ctx, "mood_value = 20, mood_updated_at = ?", T0);
  ctx.advance(3 * DAY + 9 * 60 * MIN);
  const tap = await ctx.request(`/t?uid=${A}`, { jar });
  assert.match(tap.html, /data-reunion="1"/);
  assert.match(tap.html, /data-celebrate="reunion"/);
  assert.equal(introOf(tap.html), "푹 자고 일어났어요. 오늘도 같이 놀아요!");
  assert.doesNotMatch(tap.html, /보고 싶었어요|is-reunion"/);
  assert.doesNotMatch(dialogOf(tap.html), GUILT);
});

test("a morning after a missed day keeps its own wake line", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await ctx.request("/care", { jar, body: { uid: A, act: "sleep" } });
  ctx.advance(2 * DAY + 9 * 60 * MIN);
  const morning = await ctx.request(`/t?uid=${A}`, { jar });
  assert.match(morning.html, /data-morning/);
  assert.equal(introOf(morning.html), "쿨쿨… 쿨쿨…");
});

test("a stranger sees the stat card without the owner's buttons", async (t) => {
  const ctx = await setup(t, { legendaryUids: [A] });
  await meet(ctx, A, "Mochi");
  setA(ctx, "kind = 'sheep'");
  for (const jar of [{}, { owner_token: "nope", mascot: "horse" }]) {
    const stranger = await ctx.request(`/t?uid=${A}`, { jar });
    assert.match(stranger.html, /이미 주인이 있어요/);
    const card = statCardOf(stranger.html);
    assert.match(card, /<b class="st-animal" data-stat-animal>양<\/b><span class="st-edition is-legendary">별밤 레전더리<\/span>/);
    assert.deepEqual(totalsOf(card), [70, 80, 60, 90]);
    assert.match(stranger.html, /<button type="button" class="ghost stat-peek" data-open="stats" aria-haspopup="dialog">양 친구의 능력치<\/button>/);
    assert.doesNotMatch(stranger.html, /data-stat-farm|data-care|data-owner|data-farm|level-open|class="dock"/);
  }
  const claim = await ctx.request("/claim", { body: { uid: A, code: "WRONG1" } });
  assert.equal(claim.status, 403);
  assert.deepEqual(totalsOf(statCardOf(claim.html)), [70, 80, 60, 90]);
});
