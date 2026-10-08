import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
import { fakeUids } from "../src/pages.js";

const [A, B, C] = fakeUids;
const [D, E, F] = ["04DDDDDDDDDDD4", "04EEEEEEEEEEE5", "04FFFFFFFFFFF6"];
const UIDS = [A, B, C, D, E, F];
const T0 = Date.parse("2026-05-01T10:00:00+09:00");
const MIN = 60 * 1000;
const NEXT_DAY = 14 * 60 * MIN + MIN;
const PID = /^[A-Za-z0-9_-]{12}$/;

function updateJar(jar, setCookies) {
  for (const sc of setCookies || []) {
    const m = /^([^=]+)=([^;]*)/.exec(sc);
    if (!m) continue;
    if (m[2].trim() === "" || /Expires=Thu, 01 Jan 1970/i.test(sc)) delete jar[m[1].trim()];
    else jar[m[1].trim()] = m[2].trim();
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
    if (jar) headers.Cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
    if (body) headers["Content-Type"] = "application/json";
    const res = await fetch(`http://localhost:${server.address().port}${path}`, { method: body ? "POST" : "GET", redirect: "manual", headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    const setCookies = res.headers.getSetCookie();
    if (jar) updateJar(jar, setCookies);
    return { status: res.status, html: await res.text(), location: res.headers.get("location") };
  }
  const row = (uid = A) => db.prepare("SELECT * FROM plushies WHERE uid = ?").get(uid);
  return { db, request, row, now: () => time, advance: (ms) => { time += ms; } };
}

// A new pet met and named on its owner's browser; its first tap of the day is still to come.
async function meet(ctx, uid, name = "Mochi", { kind = "", xp = 0 } = {}) {
  const jar = {};
  await ctx.request(`/t?uid=${uid}`, { jar });
  if (name) {
    await ctx.request("/name", { jar, body: { uid, name } });
    await ctx.request(`/t?uid=${uid}`, { jar });
  }
  if (kind) ctx.db.prepare("UPDATE plushies SET kind = ? WHERE uid = ?").run(kind, uid);
  if (xp) ctx.db.prepare("UPDATE plushies SET xp = ? WHERE uid = ?").run(xp, uid);
  return jar;
}

async function city(ctx, path, jar, body) {
  const res = await ctx.request(path, { jar, body });
  return { status: res.status, body: res.html.startsWith("{") ? JSON.parse(res.html) : null };
}

// A reply the route took, read as JSON.
async function took(ctx, path, jar, body) {
  const res = await city(ctx, path, jar, body);
  assert.equal(res.status, 200, path);
  return res.body;
}

const tap = (ctx, jar, uid) => ctx.request(`/t?uid=${uid}`, { jar });
const joinAs = (ctx, jar, uid, place = "seoul") => city(ctx, "/city/join", jar, { uid, city: place });
const pidOf = (ctx, uid) => ctx.row(uid).city_pid;
const race = (ctx, jar, uid, rival) => city(ctx, "/city/race", jar, { uid, rival: pidOf(ctx, rival) });
const matchOf = async (ctx, jar, uid, rival) => (await took(ctx, "/city/race", jar, { uid, rival: pidOf(ctx, rival) })).id;
const result = (ctx, jar, uid, id, won) => city(ctx, "/city/result", jar, { uid, id, won });
const records = (ctx, uid) => ctx.db.prepare("SELECT * FROM city_matches WHERE defender = ? AND done_at IS NOT NULL ORDER BY done_at DESC, rowid DESC").all(uid);

test("joining picks one of the 17 시·도, for a named pet's owner only", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A);
  const other = await meet(ctx, B, "Pippo");
  const unnamed = await meet(ctx, C, "");
  for (const body of [{ uid: "bad", city: "seoul" }, { uid: A, city: "tokyo" }, { uid: A, city: "" }, { uid: A, city: null }, { uid: A, city: "__proto__" }, { uid: A }]) {
    assert.equal((await city(ctx, "/city/join", jar, body)).status, 400, JSON.stringify(body));
  }
  for (const [who, uid] of [[{}, A], [{ owner_token: "wrong" }, A], [other, A], [jar, D], [unnamed, C]]) {
    assert.equal((await city(ctx, "/city/join", who, { uid, city: "seoul" })).status, 403, uid);
  }
  assert.equal(ctx.row().city, null);
  const joined = await joinAs(ctx, jar, A);
  assert.equal(joined.status, 200);
  assert.deepEqual(Object.keys(joined.body).sort(), ["city", "me", "ok", "tapped", "tickets", "wins"]);
  assert.deepEqual(joined.body.me, { id: ctx.row().city_pid, name: "Mochi", kind: "horse", edition: "classic", level: 1, city: "seoul" });
  assert.match(joined.body.me.id, PID);
  ctx.db.prepare("UPDATE plushies SET city_week = '2026-04-27', city_wins = 3 WHERE uid = ?").run(A);
  const moved = await joinAs(ctx, jar, A, "busan");
  assert.deepEqual([moved.body.city, moved.body.me.id, moved.body.wins, ctx.row().city_wins], ["busan", joined.body.me.id, 0, null]);
  assert.equal((await joinAs(ctx, jar, A, "busan")).body.me.id, joined.body.me.id);
});

test("leaving takes the pet off its city, and a pet that joins again is a new card", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A);
  const other = await meet(ctx, B, "Pippo");
  await tap(ctx, other, B);
  assert.equal((await city(ctx, "/city/leave", jar, { uid: A })).status, 409);
  await joinAs(ctx, jar, A);
  await joinAs(ctx, other, B);
  const first = pidOf(ctx, A);
  assert.deepEqual((await city(ctx, "/city/roster", other, { uid: B })).body.rivals.map((r) => r.id), [first]);
  assert.equal((await city(ctx, "/city/leave", jar, { uid: "bad" })).status, 400);
  assert.equal((await city(ctx, "/city/leave", other, { uid: A })).status, 403);
  assert.equal((await city(ctx, "/city/leave", {}, { uid: A })).status, 403);
  assert.deepEqual((await city(ctx, "/city/leave", jar, { uid: A })).body, { ok: true, city: null });
  assert.deepEqual([ctx.row().city, ctx.row().city_pid], [null, null]);
  assert.deepEqual((await city(ctx, "/city/roster", other, { uid: B })).body.rivals, []);
  const mine = (await city(ctx, "/city/roster", jar, { uid: A })).body;
  assert.deepEqual([mine.city, mine.rivals], [null, []]);
  assert.equal((await city(ctx, "/city/race", other, { uid: B, rival: first })).status, 409);
  await joinAs(ctx, jar, A);
  assert.match(pidOf(ctx, A), PID);
  assert.notEqual(pidOf(ctx, A), first);
});

test("the roster shows the city's other joined pets by their public cards, closest level first", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A, "Mochi", { xp: 250 });
  const pets = {
    [B]: await meet(ctx, B, "Pippo", { kind: "dog", xp: 450 }),
    [C]: await meet(ctx, C, "Busan", { kind: "rat" }),
    [D]: await meet(ctx, D, "Nojoin"),
    [E]: await meet(ctx, E, "씨발", { kind: "tiger", xp: 2200 }),
    [F]: await meet(ctx, F, "Tori", { kind: "rabbit", xp: 100 }),
  };
  ctx.db.prepare("UPDATE plushies SET edition = 'rare' WHERE uid = ?").run(F);
  await joinAs(ctx, jar, A);
  for (const uid of [B, E, F]) await joinAs(ctx, pets[uid], uid);
  await joinAs(ctx, pets[C], C, "busan");
  const res = await city(ctx, "/city/roster", jar, { uid: A });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.rivals.map((r) => r.name), ["Pippo", "Tori", "호랑이"]);
  assert.deepEqual(res.body.rivals[1], { id: pidOf(ctx, F), name: "Tori", kind: "rabbit", edition: "rare", level: 2, city: "seoul" });
  for (const card of res.body.rivals) assert.deepEqual(Object.keys(card).sort(), ["city", "edition", "id", "kind", "level", "name"]);
  assert.equal((await city(ctx, "/city/roster", pets[B], { uid: A })).status, 403);
  assert.equal((await city(ctx, "/city/roster", jar, { uid: "x" })).status, 400);
  const busan = (await city(ctx, "/city/roster", pets[C], { uid: C })).body;
  assert.deepEqual([busan.city, busan.rivals], ["busan", []]);
  const none = (await city(ctx, "/city/roster", pets[D], { uid: D })).body;
  assert.deepEqual([none.ok, none.city, none.rivals, none.tickets, none.tapped], [true, null, [], 0, false]);
});

test("the day's first plushie tap gives 3 tickets; a view reload or a later tap gives none", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A);
  const other = await meet(ctx, B, "Pippo");
  await joinAs(ctx, other, B);
  const town = () => took(ctx, "/city/roster", jar, { uid: A });
  assert.deepEqual([(await town()).tickets, (await town()).tapped], [0, false]);
  await ctx.request(`/t?uid=${A}&view=1`, { jar });
  assert.equal((await town()).tickets, 0);
  await tap(ctx, jar, A);
  assert.deepEqual([(await town()).tickets, (await town()).tapped, ctx.row().city_day], [3, true, "2026-05-01"]);
  // Tickets are the pet's for the day, joined or not.
  await joinAs(ctx, jar, A);
  assert.equal((await took(ctx, "/city/race", jar, { uid: A, rival: pidOf(ctx, B) })).tickets, 2);
  ctx.advance(31 * MIN);
  await tap(ctx, jar, A);
  assert.equal(ctx.row().reward_day_count, 2);
  assert.equal((await town()).tickets, 2);
  ctx.advance(NEXT_DAY);
  assert.deepEqual([(await town()).tickets, (await town()).tapped], [0, false]);
  await tap(ctx, jar, A);
  assert.deepEqual([(await town()).tickets, (await town()).tapped], [3, true]);
});

test("a row from before tickets gets 3 on its next real tap, once; a stale replay or a view reload gives none", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A);
  const other = await meet(ctx, B, "Pippo");
  await joinAs(ctx, other, B);
  const town = async () => { const r = await took(ctx, "/city/roster", jar, { uid: A }); return [r.tickets, r.tapped]; };
  await ctx.request(`/t?uid=${A}x000005`, { jar });
  ctx.db.prepare("UPDATE plushies SET city_day = NULL, city_tickets = NULL WHERE uid = ?").run(A);
  await ctx.request(`/t?uid=${A}x000005`, { jar });
  await ctx.request(`/t?uid=${A}x000005&view=1`, { jar });
  assert.deepEqual(await town(), [0, false]);
  ctx.advance(31 * MIN);
  await ctx.request(`/t?uid=${A}x000006`, { jar });
  assert.deepEqual([...(await town()), ctx.row().reward_day_count], [3, true, 2]);
  await joinAs(ctx, jar, A);
  await race(ctx, jar, A, B);
  await race(ctx, jar, A, B);
  ctx.advance(31 * MIN);
  await ctx.request(`/t?uid=${A}x000007`, { jar });
  assert.deepEqual([...(await town()), ctx.row().reward_day_count], [1, true, 3]);
});

test("the open page's tap fills the day's tickets like /t", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A);
  await tap(ctx, jar, A);
  ctx.db.prepare("UPDATE plushies SET city_day = NULL, city_tickets = NULL WHERE uid = ?").run(A);
  ctx.advance(31 * MIN);
  const res = await took(ctx, "/combo", jar, { uid: A, start: true });
  assert.deepEqual([res.combo, res.rewarded], [1, true]);
  assert.deepEqual([ctx.row().city_day, ctx.row().city_tickets], ["2026-05-01", 3]);
});

test("a cooldown tap just after midnight, or a tap chain running past it, gives the new day's tickets", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A);
  ctx.advance(13 * 60 * MIN + 40 * MIN);
  await tap(ctx, jar, A);
  const night = ctx.now();
  ctx.advance(20 * MIN + 30 * 1000);
  await tap(ctx, jar, A);
  assert.deepEqual([ctx.row().last_rewarded_at, ctx.row().city_day, ctx.row().city_tickets], [night, "2026-05-02", 3]);
  const late = await setup(t);
  const owner = await meet(late, A);
  late.advance(14 * 60 * MIN - 5 * 1000);
  await tap(late, owner, A);
  late.advance(10 * 1000);
  assert.equal((await took(late, "/combo", owner, { uid: A })).combo, 2);
  assert.deepEqual([late.row().city_day, late.row().city_tickets], ["2026-05-02", 3]);
});

test("after care-reset a real tap the same day gives 3 tickets again", async (t) => {
  const ctx = await setup(t, { demoUids: [A] });
  const jar = await meet(ctx, A);
  await tap(ctx, jar, A);
  await ctx.request("/demo/care-reset", { jar, body: { uid: A } });
  await tap(ctx, jar, A);
  assert.deepEqual([ctx.row().city_day, ctx.row().city_tickets], [null, null]);
  ctx.advance(MIN);
  await tap(ctx, jar, A);
  assert.deepEqual([ctx.row().city_day, ctx.row().city_tickets], ["2026-05-01", 3]);
});

test("a challenge spends a ticket and issues a match with the rival running on its own numbers", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A);
  const other = await meet(ctx, B, "Pippo", { kind: "dog", xp: 450 });
  const loner = await meet(ctx, D, "Nojoin");
  ctx.db.prepare(`UPDATE plushies SET edition = 'legendary', stats = '{"v":1,"trained":{"agi":3},"boost":{"agi":20}}' WHERE uid = ?`).run(B);
  await tap(ctx, jar, A);
  await tap(ctx, loner, D);
  await joinAs(ctx, jar, A);
  await joinAs(ctx, other, B);
  for (const rival of ["x", B, null, "Abc123_-xyz!", 12]) assert.equal((await city(ctx, "/city/race", jar, { uid: A, rival })).status, 400, String(rival));
  assert.equal((await city(ctx, "/city/race", {}, { uid: A, rival: pidOf(ctx, B) })).status, 403);
  assert.equal((await city(ctx, "/city/race", other, { uid: A, rival: pidOf(ctx, B) })).status, 403);
  assert.equal((await city(ctx, "/city/race", loner, { uid: D, rival: pidOf(ctx, B) })).status, 409, "not joined");
  assert.equal((await city(ctx, "/city/race", jar, { uid: A, rival: "Zzzzzzzzzzzz" })).status, 409, "no such pet");
  assert.equal((await race(ctx, jar, A, A)).status, 409, "itself");
  assert.equal(ctx.row().city_tickets, 3);
  const out = await race(ctx, jar, A, B);
  assert.equal(out.status, 200);
  assert.match(out.body.id, /^[A-Za-z0-9_-]{16}$/);
  // 강아지 base 50, 별밤 레전더리 +20, trained +3: 민첩 73 is +5.5%, about 1.9 race levels over its Lv.4; the snack boost waits.
  assert.equal(out.body.level, 6);
  assert.deepEqual(out.body.rival, { id: pidOf(ctx, B), name: "Pippo", kind: "dog", edition: "legendary", level: 4, city: "seoul" });
  assert.equal(out.body.tickets, 2);
  const match = ctx.db.prepare("SELECT * FROM city_matches WHERE id = ?").get(out.body.id);
  assert.deepEqual([match.challenger, match.defender, match.game, match.done_at, match.expires], [A, B, "race", null, T0 + 10 * MIN]);
  assert.equal(JSON.parse(match.card).id, pidOf(ctx, A));
  await race(ctx, jar, A, B);
  assert.equal((await took(ctx, "/city/race", jar, { uid: A, rival: pidOf(ctx, B) })).tickets, 0);
  assert.equal((await race(ctx, jar, A, B)).status, 409, "no tickets");
  await city(ctx, "/care", jar, { uid: A, act: "sleep" });
  ctx.db.prepare("UPDATE plushies SET city_tickets = 3 WHERE uid = ?").run(A);
  assert.equal((await race(ctx, jar, A, B)).status, 409, "asleep");
});

test("a result lands once per match, from its challenger before it expires, as one of the day's arcade plays", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A);
  const other = await meet(ctx, B, "Pippo");
  await tap(ctx, jar, A);
  await tap(ctx, other, B);
  await joinAs(ctx, jar, A);
  await joinAs(ctx, other, B);
  const raceBefore = ctx.row().race;
  const m1 = await took(ctx, "/city/race", jar, { uid: A, rival: pidOf(ctx, B) });
  for (const body of [{ uid: A, id: "short", won: true }, { uid: A, id: m1.id, won: "true" }, { uid: A, id: m1.id }, { uid: "bad", id: m1.id, won: true }]) {
    assert.equal((await city(ctx, "/city/result", jar, body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await result(ctx, {}, A, m1.id, true)).status, 403);
  assert.equal((await result(ctx, jar, A, "AAAAAAAAAAAAAAAA", true)).status, 409, "never issued");
  assert.equal((await result(ctx, other, B, m1.id, true)).status, 409, "someone else's");
  const won = await result(ctx, jar, A, m1.id, true);
  assert.equal(won.status, 200);
  assert.deepEqual([won.body.won, won.body.xpGain, won.body.xpLeft, won.body.trained, won.body.tickets, won.body.tapped, won.body.wins], [true, 15, 2, { stat: "agi", gained: 1 }, 2, true, 1]);
  assert.equal(won.body.stats.agi.trained, 1);
  assert.deepEqual([ctx.row().arcade_plays, ctx.row().race, ctx.row().city_wins], [1, raceBefore, 1]);
  assert.deepEqual(records(ctx, B).map((r) => [r.challenger, r.won]), [[A, 1]]);
  const before = ctx.row();
  assert.equal((await result(ctx, jar, A, m1.id, true)).status, 409, "replayed");
  assert.deepEqual(ctx.row(), before);
  const m2 = await took(ctx, "/city/race", jar, { uid: A, rival: pidOf(ctx, B) });
  ctx.advance(10 * MIN);
  assert.equal((await result(ctx, jar, A, m2.id, true)).status, 409, "expired");
  assert.deepEqual([ctx.row().arcade_plays, records(ctx, B).length], [1, 1]);
  // A loss is the defender's win; the day's plays are shared with 기 모으기 and the built-in race.
  await city(ctx, "/arcade", jar, { uid: A, game: "gi", height: 1000 });
  const m3 = await took(ctx, "/city/race", jar, { uid: A, rival: pidOf(ctx, B) });
  const lost = await result(ctx, jar, A, m3.id, false);
  assert.deepEqual([lost.body.won, lost.body.xpGain, lost.body.xpLeft, lost.body.wins, lost.body.tickets], [false, 15, 0, 1, 0]);
  assert.equal(ctx.row(B).city_wins, 1);
  ctx.db.prepare("UPDATE plushies SET city_tickets = 1 WHERE uid = ?").run(A);
  const m4 = await took(ctx, "/city/race", jar, { uid: A, rival: pidOf(ctx, B) });
  assert.equal((await result(ctx, jar, A, m4.id, true)).body.xpGain, 0);
});

test("the defender hears of its away races once, newest first, and keeps its newest 20", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A);
  const other = await meet(ctx, B, "Pippo", { kind: "dog" });
  await tap(ctx, jar, A);
  await joinAs(ctx, jar, A);
  await joinAs(ctx, other, B);
  const card = (await took(ctx, "/city/roster", other, { uid: B })).rivals[0];
  assert.deepEqual((await city(ctx, "/city/inbox", other, { uid: B })).body, { ok: true, news: [], line: "", tickets: 0, tapped: false });
  await result(ctx, jar, A, await matchOf(ctx, jar, A, B), true);
  ctx.advance(MIN);
  await result(ctx, jar, A, await matchOf(ctx, jar, A, B), false);
  assert.equal((await city(ctx, "/city/inbox", jar, { uid: B })).status, 403);
  const news = (await city(ctx, "/city/inbox", other, { uid: B })).body;
  assert.deepEqual(news.news, [{ card, held: true, at: T0 + MIN, gone: false }, { card, held: false, at: T0, gone: false }]);
  assert.equal(news.line, "자리 비운 사이에 2번 도전받았어요! 1번 이겼어요");
  assert.deepEqual((await city(ctx, "/city/inbox", other, { uid: B })).body.news, []);
  ctx.db.prepare("UPDATE plushies SET city_tickets = 30 WHERE uid = ?").run(A);
  for (let i = 0; i < 22; i++) {
    ctx.advance(MIN);
    await result(ctx, jar, A, await matchOf(ctx, jar, A, B), i % 2 === 0);
  }
  const kept = records(ctx, B);
  assert.equal(kept.length, 20);
  assert.equal(kept.at(-1).done_at, T0 + 4 * MIN);
  assert.equal((await city(ctx, "/city/inbox", other, { uid: B })).body.news.length, 20);
});

test("a 복수전 is against a challenger that beat the pet in the last 7 days until the pet beats it in a race of its own, on the card it still holds", async (t) => {
  const G = "04ABABABABABAB";
  const ctx = await setup(t, { demoUids: [G] });
  const jars = { [A]: await meet(ctx, A) };
  for (const [uid, name] of [[B, "Pippo"], [C, "Coco"], [D, "Dodo"], [E, "Evi"], [F, "Fifi"], [G, "Gigi"]]) jars[uid] = await meet(ctx, uid, name);
  for (const uid of [A, B, C, D, E, F, G]) {
    await tap(ctx, jars[uid], uid);
    await joinAs(ctx, jars[uid], uid);
  }
  for (const uid of [F, B, C, D, G, E]) {
    ctx.advance(MIN);
    await result(ctx, jars[uid], uid, await matchOf(ctx, jars[uid], uid, A), uid !== C);
  }
  ctx.db.prepare("UPDATE city_matches SET done_at = done_at - 8 * 24 * 60 * 60 * 1000 WHERE challenger = ?").run(F);
  await city(ctx, "/city/leave", jars[D], { uid: D });
  await ctx.request("/demo/care-reset", { jar: jars[G], body: { uid: G } });
  await joinAs(ctx, jars[E], E, "busan");
  const town = () => took(ctx, "/city/roster", jars[A], { uid: A });
  let mine = await town();
  assert.deepEqual(mine.revenge.map((r) => [r.name, r.city, r.id]), [["Evi", "busan", pidOf(ctx, E)], ["Pippo", "seoul", pidOf(ctx, B)]]);
  assert.deepEqual(Object.keys(mine.revenge[0]).sort(), ["city", "edition", "id", "kind", "level", "name"]);
  assert.deepEqual(mine.rivals.map((r) => r.name).sort(), ["Coco", "Fifi"]);
  // A pet that joins again is a new card, so the old loss stays behind.
  await joinAs(ctx, jars[D], D);
  mine = await town();
  assert.deepEqual([mine.revenge.map((r) => r.name), mine.rivals.map((r) => r.name).sort()], [["Evi", "Pippo"], ["Coco", "Dodo", "Fifi"]]);
  ctx.advance(MIN);
  await result(ctx, jars[A], A, await matchOf(ctx, jars[A], A, B), false);
  assert.deepEqual((await town()).revenge.map((r) => r.name), ["Evi", "Pippo"]);
  ctx.advance(MIN);
  await result(ctx, jars[A], A, await matchOf(ctx, jars[A], A, B), true);
  mine = await town();
  assert.deepEqual([mine.revenge.map((r) => r.name), mine.rivals.map((r) => r.name).sort()], [["Evi"], ["Coco", "Dodo", "Fifi", "Pippo"]]);
  // A defense held by the pet's bot leaves it owed; a race it runs and wins settles it.
  ctx.advance(MIN);
  await result(ctx, jars[E], E, await matchOf(ctx, jars[E], E, A), false);
  assert.deepEqual((await town()).revenge.map((r) => r.name), ["Evi"]);
  ctx.advance(MIN);
  await result(ctx, jars[A], A, await matchOf(ctx, jars[A], A, E), true);
  assert.deepEqual((await town()).revenge, []);
  const away = (await took(ctx, "/city/roster", jars[D], { uid: D })).revenge;
  assert.deepEqual(away, []);
});

test("the news marks each card whose challenger can't be raced any more", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A);
  const pets = { [B]: await meet(ctx, B, "Pippo"), [C]: await meet(ctx, C, "Coco"), [D]: await meet(ctx, D, "Dodo") };
  await joinAs(ctx, jar, A);
  for (const uid of [B, C, D]) {
    await tap(ctx, pets[uid], uid);
    await joinAs(ctx, pets[uid], uid);
    await result(ctx, pets[uid], uid, await matchOf(ctx, pets[uid], uid, A), uid !== D);
    ctx.advance(MIN);
  }
  await joinAs(ctx, pets[B], B, "busan");
  await city(ctx, "/city/leave", pets[C], { uid: C });
  await city(ctx, "/city/leave", pets[D], { uid: D });
  const news = (await took(ctx, "/city/inbox", jar, { uid: A })).news;
  assert.deepEqual(news.map((n) => [n.card.name, n.held, n.gone]), [["Dodo", true, true], ["Coco", false, true], ["Pippo", false, false]]);
});

test("a name loses its bidi controls on the way in, and other owners never get one", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A, "\u202Ekcuf");
  const other = await meet(ctx, B, "Pippo");
  await joinAs(ctx, jar, A);
  await joinAs(ctx, other, B);
  const bidi = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/;
  assert.equal(ctx.row().pet_name, "kcuf");
  assert.doesNotMatch((await took(ctx, "/city/roster", other, { uid: B })).rivals[0].name, bidi);
  ctx.db.prepare("UPDATE plushies SET pet_name = ? WHERE uid = ?").run("\u2067Mo\u200Fchi\u061C\u2069", A);
  assert.equal((await took(ctx, "/city/roster", other, { uid: B })).rivals[0].name, "Mochi");
  const only = await ctx.request("/name", { jar, body: { uid: A, name: " \u202E\u200F\u2066 " } });
  assert.equal(only.status, 400);
  assert.match(only.html, /이름은 1글자에서 24글자 사이로 지어주세요/);
});

test("a city ranks this week's wins only once it has 5 joined pets", async (t) => {
  const ctx = await setup(t);
  const jars = {};
  for (const [uid, name] of [[A, "Mochi"], [B, "Pippo"], [C, "Coco"], [D, "Dodo"], [E, "Evi"]]) jars[uid] = await meet(ctx, uid, name);
  await tap(ctx, jars[A], A);
  for (const uid of [A, B, C, D]) await joinAs(ctx, jars[uid], uid);
  assert.deepEqual((await city(ctx, "/city/board", jars[E], { uid: E })).body, { ok: true, board: null }, "not joined");
  assert.deepEqual((await city(ctx, "/city/board", jars[A], { uid: A })).body, { ok: true, board: null }, "4 pets");
  assert.equal((await city(ctx, "/city/board", jars[B], { uid: A })).status, 403);
  await joinAs(ctx, jars[E], E);
  assert.deepEqual((await city(ctx, "/city/board", jars[A], { uid: A })).body.board, []);
  ctx.db.prepare("UPDATE plushies SET city_week = '2026-04-27', city_wins = 4 WHERE uid = ?").run(B);
  ctx.db.prepare("UPDATE plushies SET city_week = '2026-04-27', city_wins = 2 WHERE uid = ?").run(C);
  ctx.db.prepare("UPDATE plushies SET city_week = '2026-04-20', city_wins = 9 WHERE uid = ?").run(D);
  await result(ctx, jars[A], A, await matchOf(ctx, jars[A], A, E), true);
  const { board } = (await city(ctx, "/city/board", jars[A], { uid: A })).body;
  assert.deepEqual(board.map((b) => [b.name, b.wins, b.me]), [["Pippo", 4, false], ["Coco", 2, false], ["Mochi", 1, true]]);
  assert.deepEqual(Object.keys(board[0]).sort(), ["city", "edition", "id", "kind", "level", "me", "name", "wins"]);
  ctx.advance(3 * 24 * 60 * MIN);
  assert.deepEqual((await city(ctx, "/city/board", jars[A], { uid: A })).body.board, [], "a new week");
});

test("no city reply carries a uid, an owner or a way to a pet page", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A);
  const other = await meet(ctx, B, "Pippo");
  await tap(ctx, jar, A);
  await tap(ctx, other, B);
  const bodies = [];
  const keep = async (path, who, body) => {
    const res = await ctx.request(path, { jar: who, body });
    assert.equal(res.status, 200, path);
    bodies.push(res.html);
    return JSON.parse(res.html);
  };
  await keep("/city/join", jar, { uid: A, city: "seoul" });
  await keep("/city/join", other, { uid: B, city: "seoul" });
  await keep("/city/roster", jar, { uid: A });
  for (const won of [true, false]) {
    const started = await keep("/city/race", jar, { uid: A, rival: pidOf(ctx, B) });
    await keep("/city/result", jar, { uid: A, id: started.id, won });
  }
  const back = await keep("/city/race", other, { uid: B, rival: pidOf(ctx, A) });
  await keep("/city/result", other, { uid: B, id: back.id, won: true });
  for (const [who, uid] of [[jar, A], [other, B]]) {
    await keep("/city/inbox", who, { uid });
    await keep("/city/board", who, { uid });
    await keep("/city/roster", who, { uid });
  }
  await keep("/city/leave", jar, { uid: A });
  const hashes = [A, B].flatMap((uid) => [ctx.row(uid).owner_token_hash, ctx.row(uid).recovery_code_hash]).filter(Boolean);
  for (const html of bodies) {
    for (const uid of UIDS) assert.ok(!html.includes(uid), `${uid} in ${html}`);
    for (const h of hashes) assert.ok(!html.includes(h));
    assert.doesNotMatch(html, /"uid"|owner|\/t\?/);
  }
});

test("fresh-start and care-reset leave a clean pet: out of its city, no tickets, no news and no records of its own", async (t) => {
  for (const path of ["/demo/care-reset", "/demo/fresh-start"]) {
    const ctx = await setup(t, { demoUids: [A] });
    const jar = await meet(ctx, A);
    const other = await meet(ctx, B, "Pippo");
    await tap(ctx, jar, A);
    await tap(ctx, other, B);
    await joinAs(ctx, jar, A);
    await joinAs(ctx, other, B);
    await result(ctx, jar, A, await matchOf(ctx, jar, A, B), true);
    const open = await matchOf(ctx, jar, A, B);
    await result(ctx, other, B, await matchOf(ctx, other, B, A), false);
    assert.deepEqual([records(ctx, A).length, ctx.row().city_wins], [1, 2], path);
    const res = await ctx.request(path, { jar, body: { uid: A } });
    assert.equal(res.status, 303, path);
    const row = ctx.row();
    if (path === "/demo/fresh-start") assert.equal(row, undefined);
    else assert.deepEqual([row.city, row.city_pid, row.city_day, row.city_tickets, row.city_week, row.city_wins], [null, null, null, null, null, null], path);
    assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM city_matches WHERE defender = ? OR id = ?").get(A, open).n, 0, path);
    // The race it ran against Pippo is Pippo's record, and stays.
    assert.deepEqual(records(ctx, B).map((r) => r.challenger), [A], path);
    // A pet met again on the same browser keeps that browser's token.
    if (path === "/demo/fresh-start") {
      await ctx.request(`/t?uid=${A}`, { jar });
      await ctx.request("/name", { jar, body: { uid: A, name: "Mochi" } });
    }
    const town = (await city(ctx, "/city/roster", jar, { uid: A })).body;
    assert.deepEqual([town.city, town.tickets, town.wins], [null, 0, 0], path);
    assert.deepEqual((await city(ctx, "/city/inbox", jar, { uid: A })).body.news, [], path);
    assert.equal((await result(ctx, jar, A, open, true)).status, 409, path);
  }
});

test("우리 기록 holds the city row for the owner, and the news sheet comes only with unseen news", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A);
  const other = await meet(ctx, B, "Pippo");
  const home = async () => (await ctx.request(`/t?uid=${A}&view=1`, { jar })).html;
  let html = await home();
  assert.match(html, /<div class="record-town" data-town data-city="">[\s\S]*<dd data-town-name>아직 없어요<\/dd>[\s\S]*동네 고르기/);
  assert.equal((html.match(/<button type="button" class="c-city" data-city="\w+" aria-pressed="false">/g) || []).length, 17);
  assert.doesNotMatch(html, /data-sheet="news"/);
  assert.match(html, /data-recovery>[\s\S]*<\/aside>\s*<div class="record-town"/);
  await joinAs(ctx, jar, A);
  html = await home();
  assert.match(html, /data-town data-city="seoul">[\s\S]*<dd data-town-name>서울<\/dd>[\s\S]*동네 바꾸기<\/button><button type="button" class="copy" data-town-leave>나가기/);
  assert.match(html, /data-city="seoul" aria-pressed="true">서울/);
  await tap(ctx, other, B);
  await joinAs(ctx, other, B);
  await result(ctx, other, B, await matchOf(ctx, other, B, A), true);
  assert.match(await home(), /<div class="sheet" data-sheet="news"[^>]*>[\s\S]*우리 동네 소식[\s\S]*<div class="news" data-news><\/div>/);
  await city(ctx, "/city/inbox", jar, { uid: A });
  assert.doesNotMatch(await home(), /data-sheet="news"/);
  const stranger = (await ctx.request(`/t?uid=${A}`)).html;
  assert.doesNotMatch(stranger, /data-town|data-sheet="news"|data-city=/);
});
