import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
import { fakeUids } from "../src/pages.js";
import { hash, ownerToken, recoveryCode } from "../src/secrets.js";

const [A, B, C] = fakeUids;
const tapUrl = (uid = A) => `/t?uid=${uid}`;

async function setup(t, options = {}) {
  const dir = mkdtempSync(join(process.cwd(), ".test-data-"));
  const db = openDatabase(dir);
  const calls = [];
  const answers = { tap: "NEW", rename: true, claim: false };
  const decisions = {
    resolveTap: (...args) => { calls.push(["tap", ...args]); return answers.tap; },
    canRename: (...args) => { calls.push(["rename", ...args]); return answers.rename; },
    verifyClaim: (...args) => { calls.push(["claim", ...args]); return answers.claim; },
  };
  let time = Date.now();
  const server = createApp({ db, decisions, now: () => time, ...options }).listen(0, "localhost");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    assert.equal(dirname(dir), process.cwd());
    rmSync(dir, { recursive: true, force: true });
  });
  async function request(path, { cookie, body } = {}) {
    const res = await fetch(`http://localhost:${server.address().port}${path}`, {
      method: body ? "POST" : "GET",
      redirect: "manual",
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, html: await res.text(), headers: res.headers, cookie: res.headers.get("set-cookie")?.split(";")[0] };
  }
  return { db, calls, answers, request, dir, advance: (ms) => { time += ms; } };
}

test("scripted route flow: first meeting, naming, transfer, and separate plushies", async (t) => {
  const { db, calls, answers, request } = await setup(t);
  const pages = [];
  const first = await request(tapUrl());
  pages.push(first.html);
  assert.equal(first.status, 200);
  assert.match(first.html, /내 이름을 뭐라고 지어줄래요/);
  const code = first.html.match(/class="code">([A-Z2-9]{6})</)[1];
  const token = first.cookie.split("=")[1];
  let row = db.prepare("SELECT * FROM plushies WHERE uid = ?").get(A);
  assert.equal(row.owner_token_hash, hash(token));
  assert.equal(row.recovery_code_hash, hash(code));
  assert.equal(row.tap_count, 1);
  assert.equal(row.pet_name, null);
  assert.ok(row.created_at && row.last_tap_at);
  assert.deepEqual(calls[0].slice(0, 3), ["tap", null, null]);
  assert.equal(calls[0][3]("sample"), hash("sample"));
  assert.doesNotMatch(JSON.stringify(row), new RegExp(`${token}|${code}`));

  const named = await request("/name", { cookie: first.cookie, body: { uid: A, name: "  Mochi  " } });
  pages.push(named.html);
  assert.equal(named.status, 303);
  assert.equal(named.headers.get("location"), tapUrl());
  assert.equal(calls.at(-1)[0], "rename");
  assert.equal(calls.at(-1)[2], token);
  answers.tap = "OWNER";
  const owner = await request(tapUrl(), { cookie: first.cookie });
  pages.push(owner.html);
  assert.match(owner.html, /다시 만나서 반가워요, Mochi!/);
  assert.match(owner.html, /행복한 토닥임 2번/);
  assert.equal(calls.at(-1)[2], token);
  const reload = await request(tapUrl(), { cookie: first.cookie });
  pages.push(reload.html);
  assert.match(reload.html, /행복한 토닥임 3번/);

  answers.tap = "STRANGER";
  const stranger = await request(tapUrl());
  pages.push(stranger.html);
  assert.match(stranger.html, /이미 주인이 있어요/);
  assert.equal(db.prepare("SELECT tap_count FROM plushies WHERE uid = ?").get(A).tap_count, 3);
  answers.claim = true;
  const claimed = await request("/claim", { body: { uid: A, code } });
  pages.push(claimed.html);
  assert.equal(claimed.status, 303);
  assert.equal(claimed.headers.get("location"), tapUrl());
  assert.notEqual(claimed.cookie, first.cookie);
  assert.equal(calls.at(-1)[0], "claim");
  assert.equal(calls.at(-1)[2], code);
  assert.equal(calls.at(-1)[3], hash);
  row = db.prepare("SELECT * FROM plushies WHERE uid = ?").get(A);
  assert.equal(row.owner_token_hash, hash(claimed.cookie.split("=")[1]));
  assert.equal(row.recovery_code_hash, hash(code));
  answers.tap = "OWNER";
  const moved = await request(tapUrl(), { cookie: claimed.cookie });
  pages.push(moved.html);
  assert.match(moved.html, /다시 만나서 반가워요, Mochi!/);
  answers.tap = "STRANGER";
  const oldPhone = await request(tapUrl(), { cookie: first.cookie });
  pages.push(oldPhone.html);
  assert.match(oldPhone.html, /이미 주인이 있어요/);
  assert.equal(calls.at(-1)[2], token);

  const before = db.prepare("SELECT * FROM plushies WHERE uid = ?").get(A);
  answers.tap = "NEW";
  const second = await request(tapUrl(B));
  const third = await request(tapUrl(C));
  pages.push(second.html, third.html);
  assert.notEqual(second.cookie, third.cookie);
  assert.notEqual(first.cookie, second.cookie);
  assert.deepEqual(db.prepare("SELECT * FROM plushies WHERE uid = ?").get(A), before);
  assert.equal(db.prepare("SELECT count(*) AS n FROM plushies").get().n, 3);
  assert.equal(pages.join("").split(code).length - 1, 1);
});

test("unnamed owner sees name prompt without a recovery code", async (t) => {
  const { answers, request } = await setup(t);
  const first = await request(tapUrl());
  answers.tap = "OWNER";
  const next = await request(tapUrl(), { cookie: first.cookie });
  assert.match(next.html, /내 이름을 뭐라고 지어줄래요/);
  assert.doesNotMatch(next.html, /class="code"|안심 코드/);
});

test("five failed claims trigger persistent per-uid cooldown and expiry", async (t) => {
  const { db, answers, calls, request, advance, dir } = await setup(t);
  await request(tapUrl());
  await request(tapUrl(B));
  for (let i = 1; i <= 5; i++) {
    const wrong = await request("/claim", { body: { uid: A, code: "WRONG" } });
    assert.equal(wrong.status, i === 5 ? 429 : 403);
    assert.match(wrong.html, i === 5 ? /15분/ : /코드가 맞지 않아요/);
  }
  const reopened = openDatabase(dir);
  assert.equal(reopened.prepare("SELECT attempts FROM claim_attempts WHERE uid = ?").get(A).attempts, 5);
  reopened.close();
  const count = calls.length;
  answers.claim = true;
  assert.equal((await request("/claim", { body: { uid: A, code: "ABC234" } })).status, 429);
  assert.equal(calls.length, count);
  answers.claim = false;
  assert.equal((await request("/claim", { body: { uid: B, code: "WRONG" } })).status, 403);
  advance(15 * 60 * 1000);
  assert.equal((await request("/claim", { body: { uid: A, code: "WRONG" } })).status, 403);
  assert.equal(db.prepare("SELECT attempts FROM claim_attempts WHERE uid = ?").get(A).attempts, 1);
  answers.claim = true;
  assert.equal((await request("/claim", { body: { uid: A, code: "ABC234" } })).status, 303);
  assert.equal(db.prepare("SELECT * FROM claim_attempts WHERE uid = ?").get(A), undefined);
});

for (const path of ["/t", "/t?uid=bad", "/t?uid=04aaaaaaaaaaa1", "/t?uid=04AAAAAAAAAAA", "/t?uid=04AAAAAAAAAAA11", `/t?uid=${A}%0A`, `/t?uid=${A}&uid=${B}`]) {
  test(`invalid UID rejected without binding or DB writes: ${path}`, async (t) => {
    const { db, calls, request } = await setup(t);
    assert.equal((await request(path)).status, 400);
    assert.equal(calls.length, 0);
    assert.equal(db.prepare("SELECT count(*) AS n FROM plushies").get().n, 0);
    assert.equal((await request("/health")).status, 200);
  });
}

for (const name of ["", "   ", "x".repeat(25), null, ["Mochi"], 123]) {
  test(`invalid name rejected: ${JSON.stringify(name)}`, async (t) => {
    const { db, request } = await setup(t);
    await request(tapUrl());
    assert.equal((await request("/name", { body: { uid: A, name } })).status, 400);
    assert.equal(db.prepare("SELECT pet_name FROM plushies WHERE uid = ?").get(A).pet_name, null);
  });
}

test("name boundaries and HTML escaping", async (t) => {
  const { answers, request } = await setup(t);
  await request(tapUrl());
  for (const name of ["M", "x".repeat(24), "<img src=x onerror=x>"]) {
    assert.equal((await request("/name", { body: { uid: A, name } })).status, 303);
  }
  answers.tap = "OWNER";
  const res = await request(tapUrl());
  assert.doesNotMatch(res.html, /<img/);
  assert.match(res.html, /&lt;img src=x onerror=x&gt;/);
});

test("denied rename leaves the stored name unchanged", async (t) => {
  const { db, answers, request } = await setup(t);
  await request(tapUrl());
  answers.rename = false;
  assert.equal((await request("/name", { body: { uid: A, name: "Mochi" } })).status, 403);
  assert.equal(db.prepare("SELECT pet_name FROM plushies WHERE uid = ?").get(A).pet_name, null);
});

test("missing plushie is passed to both POST decision functions", async (t) => {
  const { answers, calls, request } = await setup(t);
  answers.rename = false;
  assert.equal((await request("/name", { body: { uid: A, name: "Mochi" } })).status, 403);
  assert.equal(calls.at(-1)[1], null);
  assert.equal((await request("/claim", { body: { uid: A, code: "ABC234" } })).status, 404);
  assert.equal(calls.at(-1)[1], null);
});

test("claim passes typed code unchanged to binding", async (t) => {
  const { calls, request } = await setup(t);
  await request(tapUrl());
  await request("/claim", { body: { uid: A, code: " aBc 234 " } });
  assert.equal(calls.at(-1)[2], " aBc 234 ");
});

test("POST routes reject invalid UID before decisions", async (t) => {
  const { calls, request } = await setup(t);
  for (const path of ["/name", "/claim"]) {
    assert.equal((await request(path, { body: { uid: "bad" } })).status, 400);
    assert.equal((await request(path, { body: {} })).status, 400);
  }
  assert.equal(calls.length, 0);
});

test("dev links, reset, and health", async (t) => {
  const { db, request } = await setup(t);
  const dev = await request("/dev");
  for (const uid of fakeUids) assert.ok(dev.html.includes(tapUrl(uid)));
  await request(tapUrl());
  await request("/claim", { body: { uid: A, code: "WRONG" } });
  assert.equal((await request("/dev/reset", { body: {} })).status, 303);
  assert.equal(db.prepare("SELECT count(*) AS n FROM plushies").get().n, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM claim_attempts").get().n, 0);
  assert.equal((await request("/health")).html, "ok");
});

test("production hides dev routes and sets secure owner cookie", async (t) => {
  const { request } = await setup(t, { production: true });
  assert.equal((await request("/dev")).status, 404);
  assert.equal((await request("/dev/reset", { body: {} })).status, 404);
  const first = await request(tapUrl());
  assert.match(first.headers.get("set-cookie"), /; Secure/);
  assert.match(first.headers.get("set-cookie"), /HttpOnly/);
  assert.match(first.headers.get("set-cookie"), /SameSite=Lax/);
  assert.match(first.headers.get("set-cookie"), /Max-Age=34560000/);
});

test("local cookie works over HTTP; sensitive pages cannot be cached", async (t) => {
  const { request } = await setup(t);
  const first = await request(tapUrl());
  assert.doesNotMatch(first.headers.get("set-cookie"), /; Secure/);
  assert.equal(first.headers.get("cache-control"), "no-store");
  assert.equal(first.headers.get("referrer-policy"), "no-referrer");
  assert.match(first.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.equal((await request("/app.js")).status, 200);
  assert.equal((await request("/style.css")).status, 200);
});

test("database retains pet state across connections", async (t) => {
  const { dir, request } = await setup(t);
  await request(tapUrl());
  await request("/name", { body: { uid: A, name: "Mochi" } });
  const reopened = openDatabase(dir);
  assert.equal(reopened.prepare("SELECT pet_name FROM plushies WHERE uid = ?").get(A).pet_name, "Mochi");
  reopened.close();
});

test("secrets have the required format and hashes", () => {
  const token = ownerToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(token, "base64url").length, 32);
  assert.notEqual(ownerToken(), token);
  for (let i = 0; i < 100; i++) assert.match(recoveryCode(), /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  assert.equal(hash("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
