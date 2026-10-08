import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
import { fakeUids } from "../src/pages.js";
import { STAT_KEYS } from "../src/stats.js";

const [A, B, C] = fakeUids;
const T0 = Date.parse("2026-05-01T10:00:00+09:00");

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
    return { status: res.status, html: await res.text(), setCookies };
  }
  const row = (uid = A) => db.prepare("SELECT * FROM plushies WHERE uid = ?").get(uid);
  const set = (sql, ...args) => db.prepare(`UPDATE plushies SET ${sql} WHERE uid = ?`).run(...args, A);
  return { db, request, row, set, advance: (ms) => { time += ms; } };
}

async function meet(ctx, uid, name, jar = {}) {
  updateJar(jar, (await ctx.request(`/t?uid=${uid}`, { jar })).setCookies);
  if (name) {
    const named = await ctx.request("/name", { jar, body: { uid, name } });
    assert.equal(named.status, 303);
    updateJar(jar, named.setCookies);
    updateJar(jar, (await ctx.request(`/t?uid=${uid}`, { jar })).setCookies);
  }
  return jar;
}

async function kind(ctx, jar, body) {
  const res = await ctx.request("/kind", { jar, body: { uid: A, ...body } });
  return { status: res.status, body: JSON.parse(res.html) };
}

const totals = (stats) => STAT_KEYS.map((k) => stats[k].total);

test("the owner's first named visit saves the animal from the mascot cookie", async (t) => {
  const ctx = await setup(t);
  await meet(ctx, A, "Mochi", { mascot: "sheep" });
  assert.equal(ctx.row(A).kind, "sheep");
  const plain = await meet(ctx, B, "Pippo");
  assert.equal(ctx.row(B).kind, null);
  await ctx.request("/kind", { jar: plain, body: { uid: B, kind: "horse", fill: true } });
  assert.equal(ctx.row(B).kind, "horse");
  await ctx.request(`/t?uid=${B}`, { jar: { ...plain, mascot: "sheep" } });
  assert.equal(ctx.row(B).kind, "horse");
  await meet(ctx, C);
  assert.equal(ctx.row(C).kind, null);
});

test("a stranger's visit saves nothing; the owner's next one fills an old row", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A, "Mochi");
  ctx.set("kind = NULL");
  for (const who of [{}, { owner_token: "nope", mascot: "sheep" }]) {
    const res = await ctx.request(`/t?uid=${A}`, { jar: who });
    assert.match(res.html, /이미 주인이 있어요/);
    assert.equal(ctx.row().kind, null);
  }
  await ctx.request(`/t?uid=${A}&view=1`, { jar: { ...jar, mascot: "sheep" } });
  assert.equal(ctx.row().kind, "sheep");
});

test("without the mascot cookie the page fills an old row's animal, never a saved one", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A, "Mochi");
  ctx.set("kind = NULL");
  const home = await ctx.request(`/t?uid=${A}`, { jar });
  assert.equal(ctx.row().kind, null);
  assert.doesNotMatch(home.html, /name="pet-kind"/);
  for (const who of [{}, { owner_token: "nope" }]) {
    assert.deepEqual(await kind(ctx, who, { kind: "sheep", fill: true }), { status: 403, body: { ok: false } });
  }
  const out = await kind(ctx, jar, { kind: "sheep", fill: true });
  assert.deepEqual([out.status, out.body.kind, out.body.name, totals(out.body.stats)], [200, "sheep", "양", [50, 60, 40, 70]]);
  assert.equal(ctx.row().kind, "sheep");
  const again = await ctx.request(`/t?uid=${A}&view=1`, { jar });
  assert.match(again.html, /<meta name="pet-kind" content="sheep">/);
  assert.match(again.html, /<b class="st-animal" data-stat-animal>양<\/b>/);
  assert.equal((await kind(ctx, jar, { kind: "horse" })).body.kind, "horse");
  const kept = await kind(ctx, jar, { kind: "sheep", fill: true });
  assert.deepEqual([kept.body.kind, kept.body.name, totals(kept.body.stats)], ["horse", "말", [50, 40, 70, 60]]);
  assert.equal(ctx.row().kind, "horse");
});

test("/kind is the owner's alone and answers with the new sheet", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A, "Mochi");
  const before = ctx.row();
  for (const who of [{}, { owner_token: "nope" }]) {
    assert.deepEqual(await kind(ctx, who, { kind: "sheep" }), { status: 403, body: { ok: false } });
  }
  for (const body of [{ kind: "rat" }, { kind: "__proto__" }, { kind: null }, {}, { kind: "sheep", uid: "bad" }, { kind: "sheep", uid: "04aaaaaaaaaaa1" }]) {
    assert.deepEqual(await kind(ctx, jar, body), { status: 400, body: { ok: false } }, JSON.stringify(body));
  }
  const unnamed = await meet(ctx, B);
  assert.equal((await ctx.request("/kind", { jar: unnamed, body: { uid: B, kind: "sheep" } })).status, 403);
  assert.equal(ctx.row(B).kind, null);
  assert.deepEqual(ctx.row(), before);
  const out = await kind(ctx, jar, { kind: "sheep" });
  assert.equal(out.status, 200);
  assert.deepEqual([out.body.ok, out.body.kind, out.body.name, totals(out.body.stats)], [true, "sheep", "양", [50, 60, 40, 70]]);
  assert.deepEqual(out.body.stats.cha, { base: 70, plus: 0, trained: 0, boost: 0, total: 70, bonus: 5 });
  assert.equal(ctx.row().kind, "sheep");
  const back = await kind(ctx, jar, { kind: "horse" });
  assert.deepEqual([back.body.name, totals(back.body.stats)], ["말", [50, 40, 70, 60]]);
  assert.equal(ctx.row().kind, "horse");
});

test("RARE_UIDS and LEGENDARY_UIDS add to every stat", async (t) => {
  const ctx = await setup(t, { rareUids: [A], legendaryUids: [B] });
  const rare = await meet(ctx, A, "Mochi");
  assert.deepEqual(totals((await kind(ctx, rare, { kind: "horse" })).body.stats), [60, 50, 80, 70]);
  const legend = await meet(ctx, B, "Pippo");
  const out = await ctx.request("/kind", { jar: legend, body: { uid: B, kind: "horse" } });
  assert.deepEqual(totals(JSON.parse(out.html).stats), [70, 60, 90, 80]);
});

test("RARE_UIDS and LEGENDARY_UIDS read like DEMO_UIDS", async (t) => {
  const before = [process.env.RARE_UIDS, process.env.LEGENDARY_UIDS];
  process.env.RARE_UIDS = ` ${A.toLowerCase()} , nope, ${B}`;
  process.env.LEGENDARY_UIDS = `${B},`;
  t.after(() => {
    for (const [key, value] of [["RARE_UIDS", before[0]], ["LEGENDARY_UIDS", before[1]]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const ctx = await setup(t);
  const sheet = async (uid) => {
    const jar = await meet(ctx, uid, "Mochi");
    return totals(JSON.parse((await ctx.request("/kind", { jar, body: { uid, kind: "horse" } })).html).stats);
  };
  assert.deepEqual(await sheet(A), [60, 50, 80, 70]);
  assert.deepEqual(await sheet(B), [70, 60, 90, 80]);
  assert.deepEqual(await sheet(C), [50, 40, 70, 60]);
});

test("only the owner's own page marks the toggle to save the animal", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A, "Mochi");
  const home = await ctx.request(`/t?uid=${A}&view=1`, { jar });
  assert.match(home.html, /<aside class="mascot-toggle" data-mascot-toggle data-owner="1" /);
  const stranger = await ctx.request(`/t?uid=${A}`);
  assert.match(stranger.html, /<aside class="mascot-toggle" data-mascot-toggle role="group"/);
  const unnamed = await ctx.request(`/t?uid=${B}`);
  for (const html of [stranger.html, unnamed.html, (await ctx.request("/dev/preview?kind=gift&count=10")).html]) {
    assert.doesNotMatch(html, /data-owner/);
  }
});
