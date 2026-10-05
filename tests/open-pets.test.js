import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { createApp } from "../src/app.js";
import * as binding from "../src/binding.js";
import { openDatabase } from "../src/db.js";
import { hash } from "../src/secrets.js";
import { fakeTalk } from "../src/talk.js";

const A = "04AAAAAAAAAAA1";
const B = "04BBBBBBBBBBB2";
const T0 = Date.parse("2026-05-01T10:00:00+09:00");

function updateJar(jar, setCookies) {
  for (const sc of setCookies || []) {
    const m = /^([^=]+)=([^;]*)/.exec(sc);
    if (!m) continue;
    const k = m[1].trim();
    const v = m[2].trim();
    if (v === "" || /Expires=Thu, 01 Jan 1970/i.test(sc) || /Max-Age=0/i.test(sc)) delete jar[k];
    else jar[k] = v;
  }
}

async function setup(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "open-pets-"));
  const db = openDatabase(dir);
  const app = createApp({ db, now: () => T0, rng: () => 0, production: false, demoUids: [], openUids: [A], ...options });
  const server = app.listen(0, "localhost");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const { port } = server.address();
  t.after(async () => {
    await app.locals.talkIdle?.();
    await new Promise((resolve) => server.close(resolve));
    db.close();
    assert.equal(dirname(dir), tmpdir());
    rmSync(dir, { recursive: true, force: true });
  });
  async function request(path, { jar, body } = {}) {
    const headers = { Connection: "close" };
    if (jar) {
      const pair = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
      if (pair) headers.Cookie = pair;
    }
    if (body) headers["Content-Type"] = "application/json";
    const res = await fetch(`http://localhost:${port}${path}`, {
      method: body ? "POST" : "GET",
      redirect: "manual",
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    return { status: res.status, html: await res.text(), setCookies, location: res.headers.get("location") };
  }
  const row = (uid = A) => db.prepare("SELECT * FROM plushies WHERE uid = ?").get(uid);
  return { db, request, row };
}

async function meet(ctx, uid = A) {
  const jar = {};
  updateJar(jar, (await ctx.request(`/t?uid=${uid}`, { jar })).setCookies);
  const named = await ctx.request("/name", { jar, body: { uid, name: "Mochi" } });
  assert.equal(named.status, 303);
  updateJar(jar, named.setCookies);
  updateJar(jar, (await ctx.request(`/t?uid=${uid}`, { jar })).setCookies);
  return jar;
}

test("two browsers own an open pet, including care, farm, combo, arcade and talk", async (t) => {
  const provider = fakeTalk({ delayMs: 0 });
  const talk = Object.freeze({ provider, uids: Object.freeze([B]) });
  const demoUids = Object.freeze([B]);
  const ctx = await setup(t, { talk, demoUids });
  const first = await meet(ctx);
  const second = await meet(ctx, B);
  assert.notEqual(first.owner_token, second.owner_token);
  const ownerHash = ctx.row().owner_token_hash;
  for (const jar of [first, second, {}]) {
    const taps = ctx.row().tap_count;
    const home = await ctx.request(`/t?uid=${A}`, { jar });
    assert.match(home.html, /data-care-uid="04AAAAAAAAAAA1"/);
    assert.match(home.html, /data-talk-mic/);
    assert.doesNotMatch(home.html, /id="claim-form"/);
    assert.equal(ctx.row().tap_count, taps + 1);
    for (const [path, body] of [
      ["/care", { act: "feed" }],
      ["/farm", { act: "open" }],
      ["/combo", {}],
      ["/arcade", { game: "gi", height: 10 }],
      ["/talk", { text: "안녕" }],
    ]) {
      const res = await ctx.request(path, { jar, body: { uid: A, ...body } });
      assert.equal(res.status, 200, path);
      assert.equal(JSON.parse(res.html).ok, true, path);
    }
    assert.equal(ctx.row().owner_token_hash, ownerHash);
  }
  assert.equal((await ctx.request("/name", { jar: second, body: { uid: A, name: "Pippo" } })).status, 303);
  assert.equal(ctx.row().pet_name, "Pippo");
  assert.match((await ctx.request(`/t?uid=${B}`, { jar: second })).html, /data-talk-mic/);
  assert.equal((await ctx.request("/talk", { jar: second, body: { uid: B, text: "안녕" } })).status, 200);
  assert.deepEqual(talk.uids, [B]);
  assert.deepEqual(demoUids, [B]);
});

test("a non-open pet keeps its owner and refuses a second browser", async (t) => {
  const ctx = await setup(t, { talk: { provider: fakeTalk({ delayMs: 0 }), uids: [B] } });
  const first = await meet(ctx, B);
  const second = await meet(ctx);
  const before = ctx.row(B);
  const stranger = await ctx.request(`/t?uid=${B}`, { jar: second });
  assert.match(stranger.html, /이미 주인이 있어요/);
  assert.doesNotMatch(stranger.html, /data-talk-mic|data-demo/);
  for (const [path, body] of [
    ["/name", { name: "Pippo" }],
    ["/care", { act: "feed" }],
    ["/farm", { act: "open" }],
    ["/combo", {}],
    ["/arcade", { game: "gi", height: 10 }],
    ["/talk", { text: "안녕" }],
  ]) assert.equal((await ctx.request(path, { jar: second, body: { uid: B, ...body } })).status, 403, path);
  assert.deepEqual(ctx.row(B), before);
  assert.match((await ctx.request(`/t?uid=${B}`, { jar: first })).html, /data-care-uid/);
});

test("an open pet still starts with wake-up, naming and a recovery code", async (t) => {
  const ctx = await setup(t);
  assert.equal((await ctx.request("/name", { body: { uid: A, name: "Mochi" } })).status, 403);
  const first = await ctx.request(`/t?uid=${A}`);
  assert.match(first.html, /data-wake/);
  assert.match(first.html, /제 이름을 뭐라고 지어 줄래요/);
  const code = first.html.match(/class="code">([A-Z2-9]{6})</)[1];
  const jar = {};
  updateJar(jar, first.setCookies);
  assert.equal(ctx.row().owner_token_hash, hash(jar.owner_token));
  assert.equal(ctx.row().recovery_code_hash, hash(code));
  assert.equal(ctx.row().tap_count, 1);
  assert.equal(ctx.row().pet_name, null);
  const second = await ctx.request(`/t?uid=${A}`);
  assert.doesNotMatch(second.html, /data-wake|id="claim-form"/);
  assert.equal((await ctx.request("/care", { body: { uid: A, act: "feed" } })).status, 403);
  assert.equal((await ctx.request("/name", { body: { uid: A, name: "Mochi" } })).status, 303);
  assert.equal(ctx.row().pet_name, "Mochi");
});

test("open pets get the dad menu, care reset and fresh-start without DEMO_UIDS", async (t) => {
  const ctx = await setup(t);
  await meet(ctx);
  await meet(ctx, B);
  const home = await ctx.request(`/t?uid=${A}`);
  assert.match(home.html, /data-demo-panel/);
  assert.match(home.html, /<footer data-demo-hold>/);
  await ctx.request("/care", { body: { uid: A, act: "feed" } });
  assert.equal(ctx.row().meals, 1);
  const reset = await ctx.request("/demo/care-reset", { body: { uid: A } });
  assert.equal(reset.status, 303);
  assert.equal(ctx.row().meals, null);
  const fresh = await ctx.request("/demo/fresh-start", { body: { uid: A } });
  assert.equal(fresh.status, 303);
  assert.equal(fresh.location, `/t?uid=${A}`);
  assert.equal(ctx.row(), undefined);
  assert.ok(ctx.row(B));
  assert.match((await ctx.request(`/t?uid=${A}`)).html, /data-wake/);
  for (const path of ["/demo/fresh-start", "/demo/care-reset"]) {
    assert.equal((await ctx.request(path, { body: { uid: B } })).status, 403);
  }
});

test("guest pets open on any browser, hide the code and the dad menu, and lock once dropped", async (t) => {
  const ctx = await setup(t, { openUids: [], guestUids: [A], talk: { provider: fakeTalk({ delayMs: 0 }), uids: [] } });
  const other = await meet(ctx, B);
  const met = await ctx.request(`/t?uid=${A}`, { jar: other });
  assert.match(met.html, /data-wake/);
  assert.doesNotMatch(met.html, /class="recovery"|class="code"/);
  assert.equal(met.setCookies.some((c) => c.startsWith("owner_token=")), false);
  assert.equal(ctx.row().recovery_code_hash, null);
  assert.equal((await ctx.request("/name", { body: { uid: A, name: "Mochi" } })).status, 303);
  for (const jar of [other, {}]) {
    const home = await ctx.request(`/t?uid=${A}`, { jar });
    assert.match(home.html, /data-care-uid="04AAAAAAAAAAA1"/);
    assert.match(home.html, /data-talk-mic/);
    assert.doesNotMatch(home.html, /data-demo/);
    for (const [path, body] of [["/farm", { act: "open" }], ["/talk", { text: "안녕" }]]) {
      assert.equal((await ctx.request(path, { jar, body: { uid: A, ...body } })).status, 200, path);
    }
  }
  assert.equal((await ctx.request("/demo/fresh-start", { body: { uid: A } })).status, 404);
  assert.match((await ctx.request(`/t?uid=${B}`, { jar: other })).html, /data-care-uid="04BBBBBBBBBBB2"/);
  const row = ctx.row();
  for (const token of [other.owner_token, null]) assert.equal(binding.resolveTap(row, token, hash), "STRANGER");
  assert.equal(binding.verifyClaim(row, "ABC234", hash), false);
});

test("open pets do not talk when talk is null", async (t) => {
  const ctx = await setup(t, { talk: null });
  await meet(ctx);
  assert.doesNotMatch((await ctx.request(`/t?uid=${A}`)).html, /data-talk-mic/);
  assert.equal((await ctx.request("/talk", { body: { uid: A, text: "안녕" } })).status, 404);
});

test("open pets wrap injected decisions and leave other decisions intact", async (t) => {
  const calls = [];
  const decisions = Object.freeze({
    resolveTap: (...args) => { calls.push(["tap", ...args]); return binding.resolveTap(...args); },
    canRename: (...args) => { calls.push(["rename", ...args]); return false; },
    verifyClaim: (...args) => { calls.push(["claim", ...args]); return false; },
  });
  const ctx = await setup(t, { decisions });
  await meet(ctx);
  assert.deepEqual(calls.map((c) => c[0]), ["tap"]);
  assert.deepEqual(calls[0].slice(1), [null, null, hash]);
  const jar = {};
  updateJar(jar, (await ctx.request(`/t?uid=${B}`)).setCookies);
  await ctx.request(`/t?uid=${B}`, { jar });
  assert.deepEqual(calls.at(-1).slice(2), [jar.owner_token, hash]);
  assert.equal((await ctx.request("/name", { jar, body: { uid: B, name: "Mochi" } })).status, 403);
  assert.equal(calls.at(-1)[0], "rename");
  assert.equal((await ctx.request("/claim", { body: { uid: A, code: "ABC234" } })).status, 403);
  assert.equal(calls.at(-1)[0], "claim");
});

test("OPEN_UIDS parses lowercase, whitespace and invalid entries", async (t) => {
  const before = process.env.OPEN_UIDS;
  process.env.OPEN_UIDS = ` ${A.toLowerCase()} , nope, `;
  t.after(() => {
    if (before === undefined) delete process.env.OPEN_UIDS;
    else process.env.OPEN_UIDS = before;
  });
  const ctx = await setup(t, { openUids: undefined });
  await meet(ctx);
  assert.match((await ctx.request(`/t?uid=${A}`)).html, /data-care-uid/);
  await meet(ctx, B);
  assert.match((await ctx.request(`/t?uid=${B}`)).html, /이미 주인이 있어요/);
});

test("GUEST_UIDS parses lowercase, whitespace and invalid entries", async (t) => {
  const before = process.env.GUEST_UIDS;
  process.env.GUEST_UIDS = ` ${A.toLowerCase()} , nope, `;
  t.after(() => {
    if (before === undefined) delete process.env.GUEST_UIDS;
    else process.env.GUEST_UIDS = before;
  });
  const ctx = await setup(t, { openUids: [], guestUids: undefined });
  assert.doesNotMatch((await ctx.request(`/t?uid=${A}`)).html, /class="recovery"/);
  assert.equal((await ctx.request("/name", { body: { uid: A, name: "Mochi" } })).status, 303);
  assert.match((await ctx.request(`/t?uid=${A}`)).html, /data-care-uid/);
  await meet(ctx, B);
  assert.match((await ctx.request(`/t?uid=${B}`)).html, /이미 주인이 있어요/);
});

test("OPEN_UIDS and GUEST_UIDS unset or empty keep every pet bound to its owner", async (t) => {
  const before = [process.env.OPEN_UIDS, process.env.GUEST_UIDS];
  t.after(() => {
    for (const [key, value] of [["OPEN_UIDS", before[0]], ["GUEST_UIDS", before[1]]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  for (const raw of [undefined, ""]) {
    for (const key of ["OPEN_UIDS", "GUEST_UIDS"]) {
      if (raw === undefined) delete process.env[key];
      else process.env[key] = raw;
    }
    const ctx = await setup(t, { openUids: undefined, guestUids: undefined });
    const jar = await meet(ctx);
    const owner = await ctx.request(`/t?uid=${A}`, { jar });
    const stranger = await ctx.request(`/t?uid=${A}`);
    assert.match(owner.html, /data-care-uid/);
    assert.match(stranger.html, /이미 주인이 있어요/);
    assert.doesNotMatch(owner.html + stranger.html, /data-demo|data-talk/);
    for (const [path, body, status] of [
      ["/name", { name: "Pippo" }, 403],
      ["/care", { act: "feed" }, 403],
      ["/farm", { act: "open" }, 403],
      ["/combo", {}, 403],
      ["/arcade", { game: "gi", height: 10 }, 403],
      ["/talk", { text: "안녕" }, 404],
      ["/demo/fresh-start", {}, 404],
      ["/demo/care-reset", {}, 404],
    ]) {
      assert.equal((await ctx.request(path, { body: { uid: A, ...body } })).status, status, path);
    }
  }
});
