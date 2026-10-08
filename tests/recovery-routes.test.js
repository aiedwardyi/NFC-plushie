import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { createApp } from "../src/app.js";
import * as binding from "../src/binding.js";
import { openDatabase } from "../src/db.js";
import { fakeUids } from "../src/pages.js";
import { hash } from "../src/secrets.js";

const [A, B, C] = fakeUids;
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
  const dir = mkdtempSync(join(process.cwd(), ".test-data-"));
  const db = openDatabase(dir);
  const server = createApp({ db, now: () => T0, rng: () => 0, demoUids: [], ...options }).listen(0, "localhost");
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
    if (jar) updateJar(jar, setCookies);
    return { status: res.status, html: await res.text(), headers: res.headers };
  }
  const row = (uid = A) => db.prepare("SELECT * FROM plushies WHERE uid = ?").get(uid);
  return { request, row };
}

async function meet(ctx, uid, name, jar = {}) {
  const first = await ctx.request(`/t?uid=${uid}`, { jar });
  const code = first.html.match(/class="code">([A-Z2-9]{6})</)?.[1] || null;
  if (name) {
    assert.equal((await ctx.request("/name", { jar, body: { uid, name } })).status, 303);
    await ctx.request(`/t?uid=${uid}`, { jar });
  }
  return { jar, code, first: first.html };
}

const renew = async (ctx, jar, uid = A) => {
  const res = await ctx.request("/recovery", { jar, body: { uid } });
  return { status: res.status, body: JSON.parse(res.html), headers: res.headers };
};

const recordSheet = (html) => html.match(/<div class="sheet" data-sheet="record"[\s\S]*?<\/section>/)?.[0] || "";

test("the owner gets a new 6-character code; the old one stops claiming at once and the new one moves the pet", async (t) => {
  const ctx = await setup(t);
  const { jar, code: old } = await meet(ctx, A, "Mochi");
  assert.equal(ctx.row().recovery_code_hash, hash(old));
  const said = [];
  const quiet = Object.fromEntries(["log", "info", "warn", "error", "debug"].map((name) => [name, console[name]]));
  for (const name of Object.keys(quiet)) console[name] = (...args) => said.push(args.join(" "));
  let out;
  try {
    out = await renew(ctx, jar);
  } finally {
    Object.assign(console, quiet);
  }
  assert.equal(out.status, 200);
  assert.equal(out.headers.get("cache-control"), "no-store");
  assert.deepEqual(Object.keys(out.body).sort(), ["code", "ok"]);
  assert.equal(out.body.ok, true);
  const { code } = out.body;
  assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  assert.equal(ctx.row().recovery_code_hash, hash(code));
  assert.equal(JSON.stringify(ctx.row()).includes(code), false);
  assert.equal(said.join("\n").includes(code), false);
  // The owner's own phone keeps the pet.
  assert.match((await ctx.request(`/t?uid=${A}&view=1`, { jar })).html, /data-care-uid="04AAAAAAAAAAA1"/);

  const phone = {};
  const refused = await ctx.request("/claim", { jar: phone, body: { uid: A, code: old } });
  assert.equal(refused.status, 403);
  assert.match(refused.html, /안심 코드가 맞지 않아요/);
  const moved = await ctx.request("/claim", { jar: phone, body: { uid: A, code: code.toLowerCase() } });
  assert.equal(moved.status, 303);
  assert.equal(moved.headers.get("location"), `/t?uid=${A}`);
  assert.match((await ctx.request(`/t?uid=${A}`, { jar: phone })).html, /data-care-uid="04AAAAAAAAAAA1"/);
  assert.match((await ctx.request(`/t?uid=${A}`, { jar })).html, /이미 주인이 있어요/);

  // The new phone's own reissue retires the code it came with.
  const again = await renew(ctx, phone);
  assert.equal(again.status, 200);
  assert.notEqual(again.body.code, code);
  assert.equal(binding.verifyClaim(ctx.row(), code, hash), false);
  assert.equal(binding.verifyClaim(ctx.row(), again.body.code, hash), true);
});

test("anyone but a named pet's owner gets 403 and every code stays", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  const { jar: unnamed } = await meet(ctx, B);
  const before = [ctx.row(A).recovery_code_hash, ctx.row(B).recovery_code_hash];
  for (const [who, uid, label] of [
    [{}, A, "no cookie"],
    [{ owner_token: "nope" }, A, "wrong cookie"],
    [unnamed, A, "another pet's owner"],
    [unnamed, B, "an unnamed pet"],
    [jar, B, "the owner of another pet"],
    [jar, C, "no pet yet"],
  ]) {
    const out = await renew(ctx, who, uid);
    assert.deepEqual([out.status, out.body], [403, { ok: false }], label);
  }
  assert.deepEqual([ctx.row(A).recovery_code_hash, ctx.row(B).recovery_code_hash], before);
  assert.equal(ctx.row(C), undefined);
});

test("a bad uid gets 400 before any owner check", async (t) => {
  const calls = [];
  const decisions = { ...binding, canRename: (...args) => { calls.push(args); return binding.canRename(...args); } };
  const ctx = await setup(t, { decisions });
  const { jar } = await meet(ctx, A, "Mochi");
  const before = ctx.row().recovery_code_hash;
  calls.length = 0;
  for (const body of [{}, { uid: "bad" }, { uid: A.toLowerCase() }, { uid: `${A}0` }, { uid: 123 }, { uid: [A] }, { uid: null }]) {
    const res = await ctx.request("/recovery", { jar, body });
    assert.deepEqual([res.status, JSON.parse(res.html)], [400, { ok: false }], JSON.stringify(body));
  }
  assert.equal(calls.length, 0);
  assert.equal(ctx.row().recovery_code_hash, before);
});

test("a guest pet never gets a code, so dropping it from GUEST_UIDS still locks everyone out", async (t) => {
  const ctx = await setup(t, { guestUids: [A] });
  const { jar, first } = await meet(ctx, A, "Mochi");
  assert.doesNotMatch(first, /class="recovery"/);
  const home = (await ctx.request(`/t?uid=${A}&view=1`, { jar })).html;
  assert.match(home, /data-care-uid="04AAAAAAAAAAA1"/);
  assert.match(home, /data-sheet="record"/);
  assert.doesNotMatch(home, /class="recovery|data-recovery|새 안심 코드/);
  for (const who of [jar, {}]) {
    const out = await renew(ctx, who);
    assert.deepEqual([out.status, out.body], [403, { ok: false }]);
  }
  assert.equal(ctx.row().recovery_code_hash, null);
});

test("an open pet lets any browser in, but only the owner's browser sees or gets a new code", async (t) => {
  const ctx = await setup(t, { openUids: [A] });
  const { jar } = await meet(ctx, A, "Mochi");
  const before = ctx.row().recovery_code_hash;
  for (const path of [`/t?uid=${A}&view=1`, `/t?uid=${A}`]) {
    const home = (await ctx.request(path, { jar: {} })).html;
    assert.match(home, /data-sheet="record"/);
    assert.doesNotMatch(home, /class="recovery|data-recovery|새 안심 코드/);
  }
  const out = await renew(ctx, {});
  assert.deepEqual([out.status, out.body], [403, { ok: false }]);
  assert.equal(ctx.row().recovery_code_hash, before);
  assert.match((await ctx.request(`/t?uid=${A}&view=1`, { jar })).html, /data-recovery/);
  assert.equal((await renew(ctx, jar)).status, 200);
});

test("only the owner's 우리 기록 ends with the 안심 코드 card, and no page carries a code", async (t) => {
  const ctx = await setup(t);
  const { jar, first } = await meet(ctx, A, "Mochi");
  const home = (await ctx.request(`/t?uid=${A}&view=1`, { jar })).html;
  const sheet = recordSheet(home);
  assert.match(sheet, /<\/dl>\s*<aside class="recovery[^"]*" data-recovery>/);
  const card = sheet.match(/<aside class="recovery[\s\S]*<\/aside>/)[0];
  const text = card.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, "|").split("|").map((s) => s.trim()).filter(Boolean);
  assert.deepEqual(text, [
    "안심 코드",
    "폰을 바꿔도 이 코드로 다시 만날 수 있어요.",
    "지금은 못 바꿨어요. 잠시 후 다시 해볼까요?",
    "새 안심 코드 받기",
    "새 코드를 받으면 예전 코드는 더 이상 쓸 수 없어요.",
    "새 코드 받기",
    "취소",
    "복사",
    "보내기",
    "꼭 적어두거나 나에게 보내두세요.",
  ]);
  assert.match(card, /<p[^>]* data-recovery-fail role="alert" hidden>/);
  assert.match(card, /<div[^>]* data-recovery-confirm hidden>/);
  assert.match(card, /<div[^>]* data-recovery-shown hidden>/);
  assert.match(card, /<strong class="code" data-recovery-code tabindex="-1"><\/strong>/);
  assert.match(card, /<button type="button" class="copy" data-recovery-share hidden>/);
  assert.doesNotMatch(card, /<form|data-copy[\s>]|value=/);
  assert.doesNotMatch(home, /class="code">[A-Z2-9]{6}</);

  const stranger = (await ctx.request(`/t?uid=${A}`)).html;
  const preview = (await ctx.request("/dev/preview?kind=gift&count=10")).html;
  for (const [name, html] of [["first meet", first], ["stranger", stranger], ["preview", preview]]) {
    assert.doesNotMatch(html, /data-recovery|새 안심 코드|class="recovery[^"]*" data-/, name);
  }
  assert.match(first, /<aside class="recovery">/);
});

test("the claim form asks for the first code or a new one from 우리 기록", async (t) => {
  const ctx = await setup(t);
  await meet(ctx, A, "Mochi");
  for (const html of [(await ctx.request(`/t?uid=${A}`)).html, (await ctx.request("/claim", { body: { uid: A, code: "WRONG1" } })).html]) {
    assert.match(html, /<p id="claim-help">처음 받은 코드나 우리 기록에서 새로 받은 안심 코드를 넣어주세요\.<\/p>/);
    assert.doesNotMatch(html, /적어둔/);
  }
});
