import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { KINDS, KIND_IDS } from "../public/kinds.js";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
import { fakeUids } from "../src/pages.js";
import { ANIMALS, STAT_KEYS } from "../src/stats.js";

const [A, B] = fakeUids;
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
  const server = createApp({ db, now: () => T0, rng: () => 0, demoUids: [A], ...options }).listen(0, "localhost");
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
  return { db, request, row };
}

async function meet(ctx, uid, name, jar = {}) {
  updateJar(jar, (await ctx.request(`/t?uid=${uid}`, { jar })).setCookies);
  if (name) {
    updateJar(jar, (await ctx.request("/name", { jar, body: { uid, name } })).setCookies);
    updateJar(jar, (await ctx.request(`/t?uid=${uid}`, { jar })).setCookies);
  }
  return jar;
}

async function post(ctx, path, jar, body) {
  const res = await ctx.request(path, { jar, body });
  return { status: res.status, body: JSON.parse(res.html) };
}

const totals = (stats) => STAT_KEYS.map((k) => stats[k].total);
const baseOf = (kind, plus = 0) => ANIMALS[kind].map((s) => 20 + s * 10 + plus);
const home = async (ctx, jar, uid = A) => (await ctx.request(`/t?uid=${uid}&view=1`, { jar })).html;
const statCard = (html) => html.match(/<div class="sheet" data-sheet="stats"[\s\S]*?<\/ul>/)[0];
const picker = (html) => html.match(/<aside class="mascot-toggle" data-demo-switch[\s\S]*?<\/aside>/)?.[0] || "";
const tiers = (html) => html.match(/<div class="demo-tier" data-demo-edition[\s\S]*?<\/div>/)?.[0] || "";

test("the admin chip's owner turns the pet into any of the 12 and every page follows", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A, "Mochi");
  const out = await post(ctx, "/demo/kind", jar, { uid: A, kind: "tiger" });
  assert.equal(out.status, 200);
  assert.deepEqual([out.body.ok, out.body.kind, out.body.name, totals(out.body.stats)], [true, "tiger", "호랑이", baseOf("tiger")]);
  assert.equal(ctx.row().kind, "tiger");
  const html = await home(ctx, jar);
  assert.match(html, /<html lang="ko" data-mascot="tiger">/);
  assert.match(html, /<meta name="pet-kind" content="tiger">/);
  assert.match(html, /<img class="pet-frame is-show" data-frame="canon" src="\/mascot-tiger-512-v3\.png"/);
  assert.match(statCard(html), /<span data-stat-animal>호랑이<\/span>/);
  assert.match(html, /<img class="g-thumb-pet" src="\/mascot-tiger-512-v3\.png" alt="">/);
  assert.doesNotMatch(html, /mascot-horse-(?!512-v3\.png" width="(?:32|40)")/);
  const stranger = (await ctx.request(`/t?uid=${A}`)).html;
  assert.match(stranger, /<img class="pet-frame is-show" src="\/mascot-tiger-away-512-v3\.png"/);
  assert.match(stranger, /호랑이 친구의 능력치/);
  const back = await post(ctx, "/demo/kind", jar, { uid: A, kind: "sheep" });
  assert.deepEqual([back.body.kind, back.body.name], ["sheep", "양"]);
  assert.equal(ctx.row().kind, "sheep");
});

test("the admin panel lists all 12 with the pet's own pressed, then the tier row", async (t) => {
  const ctx = await setup(t, { rareUids: [A] });
  const jar = await meet(ctx, A, "Mochi");
  await post(ctx, "/demo/kind", jar, { uid: A, kind: "dragon" });
  const html = await home(ctx, jar);
  const kinds = [...picker(html).matchAll(/<button type="button" class="mascot-tog( is-active)?" data-mascot="(\w+)" aria-label="([^"]+)" aria-pressed="(true|false)"/g)];
  assert.deepEqual(kinds.map((m) => m[2]), KIND_IDS);
  assert.deepEqual(kinds.map((m) => m[3]), KINDS.map((k) => `${k.name} 친구`));
  assert.deepEqual(kinds.filter((m) => m[4] === "true").map((m) => m[2]), ["dragon"]);
  assert.deepEqual(kinds.filter((m) => m[1]).map((m) => m[2]), ["dragon"]);
  const row = [...tiers(html).matchAll(/<button type="button" data-edition="(\w+)" aria-pressed="(true|false)">([^<]+)<\/button>/g)];
  assert.deepEqual(row.map((m) => [m[1], m[3]]), [["classic", "클래식"], ["rare", "레어"], ["legendary", "레전더리"]]);
  assert.deepEqual(row.filter((m) => m[2] === "true").map((m) => m[1]), ["rare"]);
  assert.ok(html.indexOf("data-demo-switch") < html.indexOf("data-demo-edition"));
});

test("normal owners and strangers never get the picker or the tier row", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, B, "Pippo");
  for (const html of [await home(ctx, jar, B), (await ctx.request(`/t?uid=${B}`)).html]) {
    assert.doesNotMatch(html, /data-demo-switch|data-demo-edition|data-demo-panel/);
  }
});

test("the edition saved on the pet wins over RARE_UIDS and LEGENDARY_UIDS", async (t) => {
  const ctx = await setup(t, { legendaryUids: [A] });
  const jar = await meet(ctx, A, "Mochi");
  assert.match(statCard(await home(ctx, jar)), /<span class="st-edition"><span>별밤 레전더리<\/span><\/span>/);
  const classic = await post(ctx, "/demo/edition", jar, { uid: A, edition: "classic" });
  assert.equal(classic.status, 200);
  assert.deepEqual([classic.body.ok, classic.body.edition, classic.body.name, totals(classic.body.stats)], [true, "classic", "포근 클래식", baseOf("horse")]);
  assert.equal(ctx.row().edition, "classic");
  assert.match(statCard(await home(ctx, jar)), /<span class="st-edition"><span>포근 클래식<\/span><\/span>/);
  const rare = await post(ctx, "/demo/edition", jar, { uid: A, edition: "rare" });
  assert.deepEqual([rare.body.edition, rare.body.name, totals(rare.body.stats)], ["rare", "금실 레어", baseOf("horse", 10)]);
  // Every reply that carries the sheet reads the saved edition too.
  const care = await post(ctx, "/care", jar, { uid: A, act: "feed" });
  assert.deepEqual(totals(care.body.stats), [60, 50, 80, 71]);
  const kind = await post(ctx, "/demo/kind", jar, { uid: A, kind: "rat" });
  assert.deepEqual(totals(kind.body.stats), [30 + 10, 70 + 10, 60 + 10, 60 + 10 + 1]);
});

test("only the admin chip's owner may pick: other chips, strangers and bad values change nothing", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A, "Mochi");
  const other = await meet(ctx, B, "Pippo");
  const [a, b] = [ctx.row(A), ctx.row(B)];
  for (const [path, body] of [["/demo/kind", { kind: "tiger" }], ["/demo/edition", { edition: "legendary" }]]) {
    assert.deepEqual(await post(ctx, path, other, { uid: B, ...body }), { status: 403, body: { ok: false } }, `${path} other chip`);
    for (const who of [{}, { owner_token: "nope" }, other]) {
      assert.deepEqual(await post(ctx, path, who, { uid: A, ...body }), { status: 403, body: { ok: false } }, `${path} stranger`);
    }
  }
  for (const body of [{ kind: "unicorn" }, { kind: "__proto__" }, { kind: null }, {}, { kind: "tiger", uid: "bad" }]) {
    assert.equal((await post(ctx, "/demo/kind", jar, { uid: A, ...body })).status, 400, JSON.stringify(body));
  }
  for (const body of [{ edition: "gold" }, { edition: "__proto__" }, { edition: null }, {}, { edition: "rare", uid: "bad" }]) {
    assert.equal((await post(ctx, "/demo/edition", jar, { uid: A, ...body })).status, 400, JSON.stringify(body));
  }
  assert.deepEqual([ctx.row(A), ctx.row(B)], [a, b]);
});

test("the page's fill never changes the admin's pick", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A, "Mochi");
  await post(ctx, "/demo/kind", jar, { uid: A, kind: "tiger" });
  const fill = await post(ctx, "/kind", jar, { uid: A, kind: "sheep", fill: true });
  assert.deepEqual([fill.status, fill.body.kind, fill.body.name, totals(fill.body.stats)], [200, "tiger", "호랑이", baseOf("tiger")]);
  assert.equal(ctx.row().kind, "tiger");
});

test("a pick before naming is kept when the pet gets its name", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A);
  assert.equal((await post(ctx, "/demo/kind", jar, { uid: A, kind: "dragon" })).status, 200);
  assert.equal((await post(ctx, "/demo/edition", jar, { uid: A, edition: "legendary" })).status, 200);
  const meetPage = (await ctx.request(`/t?uid=${A}&view=1`, { jar })).html;
  assert.match(meetPage, /<html lang="ko" data-mascot="dragon">/);
  assert.match(meetPage, /<form action="\/name" method="post" class="name-form" data-met="[\d-]+">/);
  await meet(ctx, A, "Mochi", { ...jar, mascot: "sheep" });
  assert.deepEqual([ctx.row().kind, ctx.row().edition], ["dragon", "legendary"]);
});

test("every pet with its own opening video gets the replay, and the page lists them", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A, "Mochi");
  const reveals = KINDS.filter((k) => k.reveal).map((k) => k.id);
  assert.deepEqual(reveals, KIND_IDS);
  assert.match(await home(ctx, jar), new RegExp(`<script src="/mascot-boot\\.js" data-mascots="horse sheep" data-reveals="${reveals.join(" ")}"></script>`));
  for (const kind of KINDS) {
    await post(ctx, "/demo/kind", jar, { uid: A, kind: kind.id });
    assert.match(await home(ctx, jar), new RegExp(`<button type="button" data-reveal-replay data-met="[\\d-]+"${kind.reveal ? "" : " hidden"}>영상 다시 보기</button>`), kind.id);
  }
});

test("the fresh start forgets the animal and the edition", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A, "Mochi");
  await post(ctx, "/demo/kind", jar, { uid: A, kind: "pig" });
  await post(ctx, "/demo/edition", jar, { uid: A, edition: "rare" });
  assert.deepEqual([ctx.row().kind, ctx.row().edition], ["pig", "rare"]);
  assert.equal((await ctx.request("/demo/fresh-start", { jar, body: { uid: A } })).status, 303);
  assert.equal(ctx.row(), undefined);
  const again = await ctx.request(`/t?uid=${A}`, { jar });
  assert.match(again.html, /<html lang="ko" data-mascot="horse">/);
  assert.deepEqual([ctx.row().kind, ctx.row().edition], [null, null]);
});

test("demo off: the picker routes are not there", async (t) => {
  const ctx = await setup(t, { demoUids: [] });
  const jar = await meet(ctx, A, "Mochi");
  for (const [path, body] of [["/demo/kind", { kind: "tiger" }], ["/demo/edition", { edition: "rare" }]]) {
    assert.equal((await ctx.request(path, { jar, body: { uid: A, ...body } })).status, 404);
  }
  assert.equal(ctx.row().kind, null);
});

for (const kind of KINDS) {
  test(`${kind.name}'s stat card names it and starts from its own stats`, async (t) => {
    const ctx = await setup(t);
    const jar = await meet(ctx, A, "Mochi");
    await post(ctx, "/demo/kind", jar, { uid: A, kind: kind.id });
    const card = statCard(await home(ctx, jar));
    assert.match(card, new RegExp(`<span data-stat-animal>${kind.name}</span>`));
    assert.deepEqual([...card.matchAll(/<b class="st-total">(\d+)<\/b>/g)].map((m) => Number(m[1])), baseOf(kind.id));
  });
}

test("a picked animal races any rival, each with its own level", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A, "Mochi");
  await post(ctx, "/demo/kind", jar, { uid: A, kind: "tiger" });
  assert.equal((await post(ctx, "/arcade", jar, { uid: A, game: "race", rival: "unicorn", won: true })).status, 400);
  const won = await post(ctx, "/arcade", { ...jar, mascot: "sheep" }, { uid: A, game: "race", rival: "rabbit", won: true });
  assert.equal(won.status, 200);
  assert.deepEqual(won.body.race.rabbit, { level: 2, best: 1 });
  assert.deepEqual(Object.keys(won.body.race), KIND_IDS);
  const horse = await post(ctx, "/arcade", jar, { uid: A, game: "race", rival: "horse", won: true });
  assert.deepEqual([horse.status, horse.body.race.horse, horse.body.race.rabbit], [200, { level: 2, best: 1 }, { level: 2, best: 1 }]);
  assert.match(await home(ctx, jar), /data-race="[^"]*rabbit&quot;:\{&quot;level&quot;:2/);
});
