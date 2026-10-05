import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
import { FARM, createFarm, parseFarm } from "../src/farm.js";
import { fakeUids } from "../src/pages.js";
import { hash } from "../src/secrets.js";

const [A, B] = fakeUids;
const T0 = Date.parse("2026-05-01T10:00:00+09:00");
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

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
  const set = (sql, ...args) => db.prepare(`UPDATE plushies SET ${sql} WHERE uid = ?`).run(...args, A);
  return { db, request, row, set, advance: (ms) => { time += ms; }, now: () => time };
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

async function farm(ctx, jar, act, extra = {}) {
  const res = await ctx.request("/farm", { jar, body: { uid: A, act, ...extra } });
  return { status: res.status, body: JSON.parse(res.html) };
}

const stateOf = (ctx, uid = A) => parseFarm(ctx.row(uid).farm);
const crops = (f) => f.plots.map((p) => p && p.crop);

test("the first open plants the starter packet, and only once", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  assert.equal(ctx.row().farm, null);
  const first = await farm(ctx, jar, "open");
  assert.equal(first.status, 200);
  const plot = (i, crop, name, quick, ripeAt, eta, left, clock = "timed") => ({ plot: i, crop, name, quick, at: T0, ripeAt, ripe: false, clock, eta, left });
  assert.deepEqual(first.body, {
    ok: true,
    act: "open",
    created: true,
    picked: [],
    planted: [
      { plot: 0, crop: "sprout", quick: true },
      { plot: 1, crop: "lettuce", quick: true },
      { plot: 2, crop: "potato", quick: true },
      { plot: 3, crop: "gold", quick: false },
    ],
    opened: [],
    seeds: [],
    xpGain: 0,
    level: 1,
    leveledUp: false,
    xpInto: 0,
    xpSpan: 100,
    hearts: 10,
    farm: {
      now: T0,
      plots: [
        plot(0, "sprout", "새싹", true, T0 + MIN, "1분 뒤", "1분 남았어요"),
        plot(1, "lettuce", "상추", true, T0 + 5 * MIN, "5분 뒤", "5분 남았어요"),
        plot(2, "potato", "감자", true, T0 + 30 * MIN, "30분 뒤", "30분 남았어요"),
        plot(3, "gold", "황금 감자", false, Date.parse("2026-05-08T00:00:00+09:00"), "7밤 뒤", "7밤 남았어요", "night"),
        { plot: 4, locked: true, level: 2 },
        { plot: 5, locked: true, level: 3 },
      ],
      next: { plot: 0, crop: "sprout", name: "새싹", ripeAt: T0 + MIN, eta: "1분 뒤" },
      ripe: 0,
      bag: ["potato"],
      harvested: 0,
      golden: 0,
    },
  });
  assert.deepEqual(stateOf(ctx), createFarm(T0));
  ctx.advance(MIN);
  const again = await farm(ctx, jar, "open");
  assert.deepEqual([again.body.created, again.body.planted, again.body.seeds, again.body.farm.bag], [false, [], [], ["potato"]]);
  assert.deepEqual(stateOf(ctx), createFarm(T0));
});

test("pick takes one ripe plot and pays its XP", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await farm(ctx, jar, "open");
  const early = await farm(ctx, jar, "pick", { plot: 0 });
  assert.deepEqual([early.status, early.body.picked, early.body.xpGain], [200, [], 0]);
  ctx.advance(MIN);
  const sprout = await farm(ctx, jar, "pick", { plot: 0 });
  assert.deepEqual(sprout.body.picked, [{ plot: 0, crop: "sprout", xp: 40, quick: true }]);
  assert.deepEqual(sprout.body.planted, [{ plot: 0, crop: "potato", quick: false }]);
  assert.deepEqual([sprout.body.xpGain, sprout.body.level, sprout.body.leveledUp, sprout.body.xpInto, sprout.body.xpSpan], [40, 1, false, 40, 100]);
  assert.equal(sprout.body.farm.plots[0].left, "내일 익어요");
  const growing = await farm(ctx, jar, "pick", { plot: 1 });
  assert.deepEqual([growing.body.picked, growing.body.xpGain], [[], 0]);
  const locked = await farm(ctx, jar, "pick", { plot: 5 });
  assert.deepEqual([locked.status, locked.body.picked], [200, []]);
  assert.equal(ctx.row().xp, 40);
  assert.equal(stateOf(ctx).harvested, 1);
});

test("a harvest that levels up plants 당근 in plot 5 as a 맛보기", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await farm(ctx, jar, "open");
  ctx.set("xp = 60");
  ctx.advance(5 * MIN);
  const out = await farm(ctx, jar, "harvest");
  assert.deepEqual(out.body.picked.map((p) => [p.plot, p.crop, p.xp]), [[0, "sprout", 40], [1, "lettuce", 2]]);
  assert.deepEqual(out.body.opened, [4]);
  assert.deepEqual(out.body.seeds, [{ crop: "carrot", from: "unlock" }]);
  assert.deepEqual(out.body.planted, [
    { plot: 4, crop: "carrot", quick: true },
    { plot: 0, crop: "potato", quick: false },
    { plot: 1, crop: "lettuce", quick: false },
  ]);
  assert.deepEqual([out.body.xpGain, out.body.level, out.body.leveledUp, out.body.xpInto, out.body.xpSpan], [42, 2, true, 2, 150]);
  assert.deepEqual(out.body.farm.plots[4], { plot: 4, crop: "carrot", name: "당근", quick: true, at: T0 + 5 * MIN, ripeAt: T0 + 35 * MIN, ripe: false, clock: "timed", eta: "30분 뒤", left: "30분 남았어요" });
  assert.equal(ctx.row().xp, 102);
  const calm = await farm(ctx, jar, "harvest");
  assert.deepEqual([calm.body.picked, calm.body.leveledUp, calm.body.level], [[], false, 2]);
});

test("황금 감자 fills the hearts and pays no XP", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await farm(ctx, jar, "open");
  ctx.set("mood_value = 30, mood_updated_at = ?", T0);
  ctx.advance(7 * DAY);
  const out = await farm(ctx, jar, "harvest");
  assert.deepEqual(out.body.picked.map((p) => [p.crop, p.xp]), [["sprout", 40], ["lettuce", 2], ["potato", 5], ["gold", 0]]);
  assert.deepEqual([out.body.xpGain, out.body.hearts], [47, 10]);
  assert.deepEqual([ctx.row().mood_value, ctx.row().mood_updated_at], [100, ctx.now()]);
  assert.deepEqual([out.body.farm.golden, out.body.farm.harvested], [1, 4]);
  assert.deepEqual(crops(stateOf(ctx)).slice(0, 4), ["potato", "lettuce", "potato", "potato"]);
  ctx.set("mood_value = 30, mood_updated_at = ?", ctx.now());
  ctx.advance(DAY);
  const plain = await farm(ctx, jar, "harvest");
  assert.deepEqual(plain.body.picked.map((p) => p.crop), ["potato", "lettuce", "potato", "potato"]);
  assert.equal(plain.body.hearts, 1);
  assert.equal(ctx.row().mood_value, 30);
});

test("bad farm requests are refused and write nothing", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  const pickFirst = await farm(ctx, jar, "pick", { plot: 0 });
  assert.deepEqual([pickFirst.status, pickFirst.body], [409, { ok: false }]);
  assert.equal((await farm(ctx, jar, "harvest")).status, 409);
  assert.equal(ctx.row().farm, null);
  await farm(ctx, jar, "open");
  const before = ctx.row();
  for (const body of [{ act: "water" }, { act: "pick" }, { act: "pick", plot: -1 }, { act: "pick", plot: 6 }, { act: "pick", plot: 1.5 }, { act: "pick", plot: "1" }, { act: "open", uid: "bad" }, { act: "open", uid: "04aaaaaaaaaaa1" }]) {
    const res = await ctx.request("/farm", { jar, body: { uid: A, ...body } });
    assert.deepEqual([res.status, JSON.parse(res.html)], [400, { ok: false }], JSON.stringify(body));
  }
  for (const who of [{}, { owner_token: "nope" }]) {
    const res = await ctx.request("/farm", { jar: who, body: { uid: A, act: "open" } });
    assert.deepEqual([res.status, JSON.parse(res.html)], [403, { ok: false }]);
  }
  const unnamed = await meet(ctx, B);
  assert.equal((await ctx.request("/farm", { jar: unnamed.jar, body: { uid: B, act: "open" } })).status, 403);
  assert.equal(ctx.row(B).farm, null);
  assert.deepEqual(ctx.row(), before);
  await ctx.request("/care", { jar, body: { uid: A, act: "sleep" } });
  const asleep = ctx.row();
  for (const act of ["open", "pick", "harvest"]) {
    const out = await farm(ctx, jar, act, { plot: 0 });
    assert.deepEqual([out.status, out.body], [409, { ok: false }], act);
  }
  assert.deepEqual(ctx.row(), asleep);
  assert.equal(ctx.row().farm, before.farm);
});

test("gift seeds land in the bag once the farm exists", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await ctx.request(`/t?uid=${A}`, { jar });
  assert.equal(ctx.row().last_gift_day, "2026-05-01");
  assert.equal(ctx.row().farm, null);
  await farm(ctx, jar, "open");
  ctx.advance(DAY);
  await ctx.request(`/t?uid=${A}`, { jar });
  assert.deepEqual(stateOf(ctx).bag, ["potato", "lettuce", "lettuce"]);
  assert.deepEqual(stateOf(ctx).arrived, [{ crop: "lettuce", from: "gift" }, { crop: "lettuce", from: "gift" }]);
  ctx.advance(MIN);
  await ctx.request(`/t?uid=${A}`, { jar });
  assert.deepEqual(stateOf(ctx).bag, ["potato", "lettuce", "lettuce"]);
  const open = await farm(ctx, jar, "open");
  assert.deepEqual(open.body.seeds, [{ crop: "lettuce", from: "gift" }, { crop: "lettuce", from: "gift" }]);
  assert.deepEqual(stateOf(ctx).arrived, []);
});

test("gift seeds judge unlocks by the level after the tap", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await farm(ctx, jar, "open");
  ctx.set("xp = 420, next_gift_tier = 'special'");
  ctx.set("farm = ?", JSON.stringify({ ...stateOf(ctx), unlockedTo: 3 }));
  await ctx.request(`/t?uid=${A}`, { jar });
  assert.equal(ctx.row().xp, 460);
  assert.deepEqual(stateOf(ctx).bag, ["potato", "lettuce", "lettuce", "sweet"]);
  ctx.advance(DAY);
  ctx.set("xp = 0, next_gift_tier = 'special'");
  ctx.set("farm = ?", JSON.stringify({ ...stateOf(ctx), bag: [] }));
  await ctx.request(`/t?uid=${A}`, { jar });
  assert.deepEqual(stateOf(ctx).bag, ["lettuce", "lettuce", "lettuce"]);
});

test("a rare gift brings 황금 감자 even into a full bag", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await farm(ctx, jar, "open");
  ctx.set("next_gift_tier = 'rare'");
  ctx.set("farm = ?", JSON.stringify({ ...stateOf(ctx), bag: Array(9).fill("tomato") }));
  await ctx.request(`/t?uid=${A}`, { jar });
  assert.deepEqual(stateOf(ctx).bag, [...Array(8).fill("tomato"), "gold"]);
});

test("a level-up from a home tap leaves plot 5 empty until open plants it", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await farm(ctx, jar, "open");
  ctx.set("xp = 90");
  await ctx.request(`/t?uid=${A}`, { jar });
  assert.equal(ctx.row().xp, 130);
  assert.equal(stateOf(ctx).plots[4], null);
  assert.equal(stateOf(ctx).unlockedTo, 1);
  ctx.advance(MIN);
  const open = await farm(ctx, jar, "open");
  assert.deepEqual(open.body.opened, [4]);
  assert.deepEqual(open.body.planted, [{ plot: 4, crop: "carrot", quick: true }]);
  assert.deepEqual(open.body.seeds, [{ crop: "lettuce", from: "gift" }, { crop: "lettuce", from: "gift" }, { crop: "carrot", from: "unlock" }]);
  assert.deepEqual([open.body.level, open.body.leveledUp], [2, false]);
  assert.deepEqual(open.body.farm.bag, ["potato", "lettuce", "lettuce"]);
  const again = await farm(ctx, jar, "open");
  assert.deepEqual([again.body.opened, again.body.planted, again.body.seeds], [[], [], []]);
});

test("corrupt farm JSON never breaks a visit or the farm", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  for (const bad of ["{oops", '{"v":1,"plots":7}', "[]", "null"]) {
    ctx.set("farm = ?, last_gift_day = NULL, last_rewarded_at = NULL", bad);
    const visit = await ctx.request(`/t?uid=${A}`, { jar: { ...jar, farm_at: A } });
    assert.equal(visit.status, 200, bad);
    assert.doesNotMatch(visit.html, /data-farm-visit/);
    assert.equal(ctx.row().farm, bad);
    assert.equal((await farm(ctx, jar, "harvest")).status, 409);
    ctx.advance(DAY);
  }
  const open = await farm(ctx, jar, "open");
  assert.deepEqual([open.status, open.body.created], [200, true]);
});

test("a pre-farm database gains the farm column as no farm", async (t) => {
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
      played_at INTEGER, plays INTEGER, slept_at INTEGER, combo_count INTEGER, combo_at INTEGER,
      arcade_day TEXT, arcade_plays INTEGER, gi_best INTEGER
    );
    CREATE TABLE claim_attempts (
      uid TEXT PRIMARY KEY REFERENCES plushies(uid) ON DELETE CASCADE,
      attempts INTEGER NOT NULL, window_start INTEGER NOT NULL
    );`);
    old.prepare("INSERT INTO plushies (uid, pet_name, owner_token_hash, tap_count, mood_value, mood_updated_at, xp) VALUES (?, ?, ?, ?, ?, ?, ?)").run(A, "Mochi", hash(token), 3, 50, T0, 260);
    old.close();
  }
  const ctx = await setup(t, {}, dir);
  assert.ok(ctx.db.prepare("PRAGMA table_info(plushies)").all().some((c) => c.name === "farm"));
  assert.equal(ctx.row().farm, null);
  const open = await farm(ctx, { owner_token: token }, "open");
  assert.deepEqual([open.body.created, open.body.level, open.body.opened], [true, 3, [4, 5]]);
  assert.deepEqual(crops(stateOf(ctx)), [...FARM.starter, "carrot", "tomato"]);
});

const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const visitOf = (html) => {
  const m = /<body[^>]* data-farm-visit="([^"]*)"/.exec(html);
  return m ? JSON.parse(unescape(m[1])) : null;
};
const bodyAttr = (html, name) => new RegExp(`<body[^>]* data-${name}="([^"]*)"`).exec(html)?.[1] ?? null;
const clearsFarmAt = (res) => res.setCookies.some((c) => /^farm_at=;/.test(c) && /Expires=Thu, 01 Jan 1970/.test(c) && /Path=\//.test(c));
const COOLDOWN = "방금 토닥여 줘서 기분 좋아요!";

test("a farm visit scores the tap, harvests every ripe plot and opens into the farm", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await farm(ctx, jar, "open");
  ctx.advance(MIN);
  const res = await ctx.request(`/t?uid=${A}`, { jar: { ...jar, farm_at: A } });
  assert.equal(res.status, 200);
  assert.ok(clearsFarmAt(res));
  const row = ctx.row();
  assert.deepEqual([row.tap_count, row.reward_day_count, row.last_rewarded_at, row.xp], [2, 1, T0 + MIN, 80]);
  assert.deepEqual([row.combo_count, row.combo_at], [0, null]);
  assert.match(res.html, /<nav class="dock"[^>]* data-combo="0">/);
  assert.match(res.html, /<p class="intro" data-pet-state="1" data-rewarded="1"/);
  const visit = visitOf(res.html);
  assert.deepEqual([visit.ok, visit.act, visit.created], [true, "harvest", false]);
  assert.deepEqual(visit.picked, [{ plot: 0, crop: "sprout", xp: 40, quick: true }]);
  assert.deepEqual(visit.planted, [{ plot: 0, crop: "potato", quick: false }]);
  assert.deepEqual(visit.seeds, [{ crop: "lettuce", from: "gift" }, { crop: "lettuce", from: "gift" }]);
  assert.deepEqual([visit.xpGain, visit.level, visit.leveledUp, visit.xpInto, visit.xpSpan, visit.hearts], [40, 1, false, 80, 100, 10]);
  assert.deepEqual(visit.farm.bag, ["lettuce", "lettuce"]);
  assert.equal(visit.farm.now, T0 + MIN);
  assert.deepEqual(stateOf(ctx).arrived, []);
  assert.equal(bodyAttr(res.html, "farm-dot"), "0");
  assert.equal(bodyAttr(res.html, "farm-next"), String(T0 + 5 * MIN));
});

test("a farm visit inside the cooldown drops the cooldown line", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await ctx.request(`/t?uid=${A}`, { jar });
  await farm(ctx, jar, "open");
  ctx.advance(MIN);
  const res = await ctx.request(`/t?uid=${A}`, { jar: { ...jar, farm_at: A } });
  assert.match(res.html, /data-rewarded="0" data-reason="cooldown"/);
  assert.ok(!res.html.includes(COOLDOWN));
  assert.deepEqual(visitOf(res.html).picked.map((p) => p.crop), ["sprout"]);
  assert.deepEqual([ctx.row().tap_count, ctx.row().xp, ctx.row().combo_count], [3, 80, 0]);
  ctx.advance(MIN);
  const plain = await ctx.request(`/t?uid=${A}`, { jar });
  assert.ok(plain.html.includes(COOLDOWN));
  assert.equal(visitOf(plain.html), null);
});

test("a harvest level-up on a visit lives in the farm payload; the page stays post-tap", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await farm(ctx, jar, "open");
  ctx.set("xp = 50");
  ctx.advance(MIN);
  const res = await ctx.request(`/t?uid=${A}`, { jar: { ...jar, farm_at: A } });
  assert.equal(ctx.row().xp, 130);
  assert.doesNotMatch(res.html, /data-celebrate=/);
  assert.match(res.html, /<span class="level-badge" aria-label="Lv\. 1">1<\/span>/);
  const visit = visitOf(res.html);
  assert.deepEqual([visit.leveledUp, visit.level, visit.xpInto, visit.xpSpan, visit.opened], [true, 2, 30, 150, [4]]);
  assert.deepEqual(visit.planted[0], { plot: 4, crop: "carrot", quick: true });
  assert.equal(visit.farm.plots[4].crop, "carrot");
});

test("a visit that eats 황금 감자 fills the hearts in the payload only", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await farm(ctx, jar, "open");
  ctx.advance(7 * DAY);
  const res = await ctx.request(`/t?uid=${A}`, { jar: { ...jar, farm_at: A } });
  assert.match(res.html, /data-mood-before="10" data-mood-after="50"/);
  const visit = visitOf(res.html);
  assert.deepEqual(visit.picked.map((p) => p.crop), ["sprout", "lettuce", "potato", "gold"]);
  assert.equal(visit.hearts, 10);
  assert.equal(ctx.row().mood_value, 100);
});

test("a visit with nothing ripe still opens the farm and changes nothing", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  await farm(ctx, jar, "open");
  await ctx.request(`/t?uid=${A}`, { jar });
  const before = ctx.row().farm;
  ctx.advance(10 * 1000);
  const res = await ctx.request(`/t?uid=${A}`, { jar: { ...jar, farm_at: A } });
  const visit = visitOf(res.html);
  assert.deepEqual([visit.picked, visit.planted, visit.xpGain], [[], [], 0]);
  assert.equal(visit.farm.next.crop, "sprout");
  assert.deepEqual(parseFarm(ctx.row().farm).plots, parseFarm(before).plots);
});

test("every /t that receives farm_at clears it", async (t) => {
  const ctx = await setup(t, { demoUids: [A] });
  const fresh = await ctx.request(`/t?uid=${A}`, { jar: { farm_at: A } });
  assert.ok(clearsFarmAt(fresh), "new pet");
  const owner = {};
  updateJar(owner, fresh.setCookies);
  const unnamed = await ctx.request(`/t?uid=${A}`, { jar: { ...owner, farm_at: A } });
  assert.ok(clearsFarmAt(unnamed), "unnamed");
  await ctx.request("/name", { jar: owner, body: { uid: A, name: "Mochi" } });
  const skip = await ctx.request(`/t?uid=${A}`, { jar: { ...owner, pet_skip: A, farm_at: A } });
  assert.ok(clearsFarmAt(skip), "skip");
  const normal = await ctx.request(`/t?uid=${A}`, { jar: { ...owner, farm_at: A } });
  assert.ok(clearsFarmAt(normal), "normal, no farm");
  await farm(ctx, owner, "open");
  ctx.advance(MIN);
  const harvest = await ctx.request(`/t?uid=${A}`, { jar: { ...owner, farm_at: A } });
  assert.ok(clearsFarmAt(harvest) && visitOf(harvest.html), "farm visit");
  await ctx.request("/care", { jar: owner, body: { uid: A, act: "sleep" } });
  const morning = await ctx.request(`/t?uid=${A}`, { jar: { ...owner, farm_at: A } });
  assert.ok(clearsFarmAt(morning), "morning");
  const stranger = await ctx.request(`/t?uid=${A}`, { jar: { farm_at: A } });
  assert.ok(clearsFarmAt(stranger), "stranger");
  const bad = await ctx.request("/t?uid=nope", { jar: { farm_at: A } });
  assert.ok(clearsFarmAt(bad), "bad uid");
  const reset = await ctx.request("/demo/fresh-start", { jar: { ...owner, farm_at: A }, body: { uid: A } });
  assert.equal(reset.status, 303);
  const replay = await ctx.request(reset.location, { jar: { ...owner, farm_at: A } });
  assert.ok(clearsFarmAt(replay), "after fresh-start");
  assert.equal(ctx.row().farm, null);
  const none = await ctx.request(`/t?uid=${A}`, { jar: owner });
  assert.ok(!none.setCookies.some((c) => c.startsWith("farm_at=")));
});

test("only this pet's cookie on a named, awake pet with a farm makes a farm visit", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  const noFarm = await ctx.request(`/t?uid=${A}`, { jar: { ...jar, farm_at: A } });
  assert.equal(visitOf(noFarm.html), null);
  assert.match(noFarm.html, /data-combo="1">/);
  await farm(ctx, jar, "open");
  ctx.advance(7 * DAY);
  const plots = () => stateOf(ctx).plots;
  const before = plots();
  const other = await ctx.request(`/t?uid=${A}`, { jar: { ...jar, farm_at: B } });
  assert.equal(visitOf(other.html), null);
  assert.ok(clearsFarmAt(other));
  const skip = await ctx.request(`/t?uid=${A}`, { jar: { ...jar, pet_skip: A, farm_at: A } });
  assert.equal(visitOf(skip.html), null);
  await ctx.request("/care", { jar, body: { uid: A, act: "sleep" } });
  const morning = await ctx.request(`/t?uid=${A}`, { jar: { ...jar, farm_at: A } });
  assert.match(morning.html, /data-morning>/);
  assert.equal(visitOf(morning.html), null);
  assert.deepEqual(plots(), before);
  const stranger = await ctx.request(`/t?uid=${A}`, { jar: { farm_at: A } });
  assert.equal(visitOf(stranger.html), null);
  const unnamed = await meet(ctx, B);
  const page = await ctx.request(`/t?uid=${B}`, { jar: { ...unnamed.jar, farm_at: B } });
  assert.doesNotMatch(page.html, /data-farm-/);
  assert.deepEqual(plots(), before);
  const visit = await ctx.request(`/t?uid=${A}`, { jar: { ...jar, farm_at: A } });
  assert.equal(visitOf(visit.html).picked.length, 4);
});

test("the home page tells the 텃밭 dot and the next ripe time", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  const home = () => ctx.request(`/t?uid=${A}`, { jar: { ...jar, pet_skip: A } });
  const none = await home();
  assert.match(none.html, /<body class="is-home" data-farm-dot="1" data-farm-now="\d+"/);
  assert.equal(bodyAttr(none.html, "farm-next"), null);
  await farm(ctx, jar, "open");
  const growing = await home();
  assert.deepEqual([bodyAttr(growing.html, "farm-dot"), bodyAttr(growing.html, "farm-now"), bodyAttr(growing.html, "farm-next")], ["0", String(T0), String(T0 + MIN)]);
  ctx.advance(MIN);
  const ripe = await home();
  assert.deepEqual([bodyAttr(ripe.html, "farm-dot"), bodyAttr(ripe.html, "farm-next")], ["1", String(T0 + 5 * MIN)]);
  for (const html of [(await ctx.request(`/t?uid=${A}`, { jar: {} })).html, (await ctx.request("/dev/preview?kind=gift&count=10")).html, (await ctx.request(`/t?uid=${B}`)).html]) {
    assert.doesNotMatch(html, /data-farm-/);
  }
});

test("the dev ripen route ripens every plot, and only outside production", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  const ripen = (c = ctx) => c.request("/dev/farm-ripen", { body: { uid: A } });
  assert.equal((await ripen()).status, 409);
  await farm(ctx, jar, "open");
  assert.equal((await ctx.request("/dev/farm-ripen", { body: { uid: "bad" } })).status, 400);
  const res = await ripen();
  assert.deepEqual([res.status, JSON.parse(res.html)], [200, { ok: true }]);
  const out = await farm(ctx, jar, "harvest");
  assert.deepEqual(out.body.picked.map((p) => p.crop), FARM.starter);
  const prod = await setup(t, { production: true });
  assert.equal((await ripen(prod)).status, 404);
});
