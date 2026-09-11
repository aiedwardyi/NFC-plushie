import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
import { hash } from "../src/secrets.js";

const A = "04AAAAAAAAAAA1";
const B = "04BBBBBBBBBBB2";
const C = "04CCCCCCCCCCC3";
const D = "04DDDDDDDDDDD4";
const R = "04DE45BAE02490";
const T = "FF000000000008";

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

async function setup(t) {
  const dir = mkdtempSync(join(process.cwd(), ".test-data-"));
  const db = openDatabase(dir);
  let time = Date.parse("2026-05-01T00:00:00+09:00");
  const server = createApp({ db, now: () => time, rng: () => 0 }).listen(0, "localhost");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
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
    return { status: res.status, html: await res.text(), setCookies, location: res.headers.get("location") };
  }
  const row = (uid) => db.prepare("SELECT * FROM plushies WHERE uid = ?").get(uid);
  async function meet(uid, name, jar = {}) {
    const first = await request(`/t?uid=${uid}`, { jar });
    updateJar(jar, first.setCookies);
    const code = first.html.match(/class="code">([A-Z2-9]{6})</)?.[1];
    if (name) {
      const named = await request("/name", { jar, body: { uid, name } });
      updateJar(jar, named.setCookies);
      const skip = await request(`/t?uid=${uid}`, { jar });
      updateJar(jar, skip.setCookies);
    }
    return { jar, code, first };
  }
  return { db, request, row, meet, advance: (ms) => { time += ms; } };
}

test("one browser owns A B C independently without losing earlier pets", async (t) => {
  const { request, row, meet } = await setup(t);
  const jar = {};
  await meet(A, "알파", jar);
  const aHash = row(A).owner_token_hash;
  const aTaps = row(A).tap_count;
  const cookieAfterA = jar.owner_token;

  await meet(B, "베타", jar);
  assert.equal(jar.owner_token, cookieAfterA, "claiming B must reuse the same browser token");
  assert.equal(row(A).owner_token_hash, aHash);
  assert.equal(row(A).pet_name, "알파");
  assert.equal(row(A).tap_count, aTaps);
  assert.equal(row(B).owner_token_hash, aHash);

  await meet(C, "감마", jar);
  assert.equal(jar.owner_token, cookieAfterA);
  assert.equal(row(A).owner_token_hash, aHash);
  assert.equal(row(C).owner_token_hash, aHash);

  for (const [uid, name] of [[A, "알파"], [B, "베타"], [C, "감마"]]) {
    const page = await request(`/t?uid=${uid}`, { jar });
    assert.doesNotMatch(page.html, /이미 주인이 있어요/, `${uid} must stay OWNER`);
    assert.match(page.html, new RegExp(name));
  }
  const bBefore = row(B).tap_count;
  await request(`/t?uid=${A}`, { jar });
  await request(`/t?uid=${A}`, { jar });
  assert.equal(row(B).tap_count, bBefore, "tapping A must not change B tap count");
  assert.ok(row(A).tap_count > bBefore);
});

test("dad case: claiming test pet T must not stranger real plushie R", async (t) => {
  const { request, row, meet } = await setup(t);
  const jar = {};
  await meet(R, "진짜덕", jar);
  const before = { ...row(R) };
  await meet(T, "테스트", jar);
  const again = await request(`/t?uid=${R}`, { jar });
  assert.doesNotMatch(again.html, /이미 주인이 있어요/);
  assert.match(again.html, /진짜덕/);
  assert.equal(row(R).owner_token_hash, before.owner_token_hash);
  assert.equal(row(R).pet_name, before.pet_name);
  assert.equal(row(R).tap_count, before.tap_count + 1);
  assert.equal(row(T).owner_token_hash, before.owner_token_hash);
});

test("recovery into an existing browser pass keeps claimer's other pets", async (t) => {
  const { request, row, meet } = await setup(t);
  const jar1 = {};
  const { code } = await meet(A, "알파", jar1);
  await meet(B, "베타", jar1);
  await meet(C, "감마", jar1);
  const hash1 = row(A).owner_token_hash;

  const jar2 = {};
  await meet(D, "델타", jar2);
  const hash2 = row(D).owner_token_hash;
  assert.notEqual(hash1, hash2);

  const claimed = await request("/claim", { jar: jar2, body: { uid: A, code } });
  assert.equal(claimed.status, 303);
  updateJar(jar2, claimed.setCookies);
  assert.equal(jar2.owner_token, Object.entries(jar2).find(([k]) => k === "owner_token")?.[1] || jar2.owner_token);
  assert.equal(row(A).owner_token_hash, hash2);
  assert.equal(row(D).owner_token_hash, hash2);

  assert.match((await request(`/t?uid=${A}`, { jar: jar1 })).html, /이미 주인이 있어요/);
  assert.doesNotMatch((await request(`/t?uid=${B}`, { jar: jar1 })).html, /이미 주인이 있어요/);
  assert.doesNotMatch((await request(`/t?uid=${C}`, { jar: jar1 })).html, /이미 주인이 있어요/);
  assert.doesNotMatch((await request(`/t?uid=${A}`, { jar: jar2 })).html, /이미 주인이 있어요/);
  assert.doesNotMatch((await request(`/t?uid=${D}`, { jar: jar2 })).html, /이미 주인이 있어요/);
});

test("pre-seeded row with existing cookie still resolves OWNER", async (t) => {
  const { db, request, row } = await setup(t);
  const token = "preexisting-owner-token-value-32chars!!";
  db.prepare(`INSERT INTO plushies (uid, pet_name, owner_token_hash, recovery_code_hash, tap_count, created_at, last_tap_at,
    mood_value, mood_updated_at, xp, reward_day_count, gift_seen, gift_found, days_together, last_active_day)
    VALUES (?, ?, ?, ?, 5, ?, ?, 80, ?, 10, 0, ?, ?, 2, ?)`)
    .run(R, "시드덕", hash(token), hash("ABC234"), new Date().toISOString(), new Date().toISOString(), Date.now(),
      '{"common":[],"special":[],"rare":[]}', "[]", "2026-05-01");
  const jar = { owner_token: token };
  const page = await request(`/t?uid=${R}`, { jar });
  assert.doesNotMatch(page.html, /이미 주인이 있어요/);
  assert.match(page.html, /시드덕/);
  assert.equal(row(R).owner_token_hash, hash(token));
});
