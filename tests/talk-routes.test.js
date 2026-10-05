import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { createApp } from "../src/app.js";
import { applyChanges, TALK_LINES } from "../src/chat.js";
import { openDatabase } from "../src/db.js";
import { fakeUids } from "../src/pages.js";
import { talkFromEnv } from "../src/talk.js";

const [A, B, C] = fakeUids;
const T0 = Date.parse("2026-05-01T10:00:00+09:00");
const SEC = 1000;
const DAY = 24 * 60 * 60 * SEC;

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

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// A provider the test drives: each call waits on its own hook.
function fakeProvider() {
  const p = {
    model: "claude-haiku-4-5",
    replies: [],
    notebooks: [],
    replyWith: async ({ messages }) => ({ ok: true, stop: "end_turn", text: `대답: ${messages.at(-1).content}`, sources: [], usage: { input: 1000, output: 40, searches: 0 }, ms: 5 }),
    notebookWith: async () => ({ ok: true, stop: "end_turn", changes: { add: [], drop: [], plans: [] }, usage: { input: 600, output: 20, searches: 0 }, ms: 3 }),
    reply(args) {
      p.replies.push(args);
      return p.replyWith(args);
    },
    notebook(args) {
      p.notebooks.push(args);
      return p.notebookWith(args);
    },
  };
  return p;
}

async function setup(t, { uids = [A, C], talk, demoUids = [], production = false } = {}) {
  const dir = mkdtempSync(join(process.cwd(), ".test-data-"));
  const db = openDatabase(dir);
  let time = T0;
  const provider = fakeProvider();
  const talkOption = talk === undefined ? { provider, uids } : talk;
  const app = createApp({ db, now: () => time, rng: () => 0, demoUids, production, talk: talkOption });
  const server = app.listen(0, "localhost");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    await app.locals.talkIdle?.();
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
  return { db, app, provider, request, row, advance: (ms) => { time += ms; }, now: () => time };
}

async function meet(ctx, uid, name) {
  const jar = {};
  const first = await ctx.request(`/t?uid=${uid}`, { jar });
  assert.equal(first.status, 200);
  updateJar(jar, first.setCookies);
  if (name) {
    const named = await ctx.request("/name", { jar, body: { uid, name } });
    updateJar(jar, named.setCookies);
    const skip = await ctx.request(`/t?uid=${uid}`, { jar });
    updateJar(jar, skip.setCookies);
  }
  return jar;
}

async function say(ctx, jar, text, uid = A) {
  const res = await ctx.request("/talk", { jar, body: { uid, text } });
  return { status: res.status, body: res.html.startsWith("{") ? JSON.parse(res.html) : null };
}

const introOf = (html) => /<p class="intro"[^>]*>([^<]*)<\/p>/.exec(html)?.[1];
const plan = (ctx, uid, askOn, question, askedOn = null) => ctx.db.prepare("INSERT INTO talk_plans (uid, ask_on, question, at, asked_on) VALUES (?, ?, ?, ?, ?)").run(uid, askOn, question, ctx.now(), askedOn);
const notes = (ctx, uid = A) => ctx.db.prepare("SELECT fact FROM talk_notes WHERE uid = ? ORDER BY id").all(uid).map((r) => r.fact);

test("talk off: no route and no mic", async (t) => {
  for (const talk of [null, talkFromEnv({}, true), talkFromEnv({ ANTHROPIC_API_KEY: "k", TALK_UIDS: "" }, true), talkFromEnv({ TALK_FAKE: "1", TALK_UIDS: A }, true)]) {
    const ctx = await setup(t, { talk });
    const jar = await meet(ctx, A, "Mochi");
    const home = await ctx.request(`/t?uid=${A}`, { jar });
    assert.doesNotMatch(home.html, /talk-|data-talk/);
    assert.equal((await say(ctx, jar, "안녕")).status, 404);
  }
});

test("the owner of a listed, named pet gets the mic and the bar; others don't", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A, "Mochi");
  const home = await ctx.request(`/t?uid=${A}`, { jar });
  assert.match(home.html, /<button type="button" class="talk-mic" data-talk-mic aria-label="말 걸기" aria-expanded="false" hidden>/);
  assert.match(home.html, /placeholder="Mochi에게 말 걸기"/);
  assert.match(home.html, /<p class="intro"[^>]*>[^<]*<\/p>(?:(?!<\/section>)[\s\S])*data-talk-mic/);
  const unlisted = await meet(ctx, B, "Bori");
  assert.doesNotMatch((await ctx.request(`/t?uid=${B}`, { jar: unlisted })).html, /data-talk/);
  const unnamed = await meet(ctx, C);
  assert.doesNotMatch((await ctx.request(`/t?uid=${C}`, { jar: unnamed })).html, /data-talk/);
  assert.doesNotMatch((await ctx.request(`/t?uid=${A}`, { jar: {} })).html, /data-talk/);
});

test("403 for a stranger, an unnamed pet and an unlisted pet; 409 asleep", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A, "Mochi");
  assert.equal((await say(ctx, {}, "안녕")).status, 403);
  assert.equal((await say(ctx, { owner_token: "nope" }, "안녕")).status, 403);
  const c = await meet(ctx, C);
  assert.equal((await say(ctx, c, "안녕", C)).status, 403);
  const b = await meet(ctx, B, "Bori");
  assert.equal((await say(ctx, b, "안녕", B)).status, 403);
  ctx.db.prepare("UPDATE plushies SET slept_at = ? WHERE uid = ?").run(ctx.now(), A);
  assert.equal((await say(ctx, jar, "안녕")).status, 409);
  assert.equal(ctx.provider.replies.length, 0);
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM talk_log").get().n, 0);
});

test("input checks count characters, not code units", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A, "Mochi");
  const bad = async (body) => (await ctx.request("/talk", { jar, body })).status;
  assert.equal(await bad({ uid: A }), 400);
  assert.equal(await bad({ uid: A, text: 7 }), 400);
  assert.equal(await bad({ uid: A, text: "   \n " }), 400);
  assert.equal(await bad({ uid: "nope", text: "안녕" }), 400);
  assert.equal(await bad({ uid: A, text: "가".repeat(201) }), 400);
  assert.equal(await bad({ uid: A, text: `  ${"🐰".repeat(200)}  ` }), 200);
  assert.equal(await bad({ uid: A, text: "가".repeat(200) }), 200);
  assert.equal(ctx.provider.replies.at(-1).messages.at(-1).content, "가".repeat(200));
});

test("a reply comes back as text with sources, logged with its cost", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A, "Mochi");
  ctx.provider.replyWith = async () => ({ ok: true, stop: "end_turn", text: "맑아요!", sources: [{ title: "날씨", url: "https://w.example.kr/" }], usage: { input: 3000, output: 50, searches: 1 }, ms: 812 });
  const res = await say(ctx, jar, "  오늘 날씨 어때?  ");
  assert.deepEqual(res, { status: 200, body: { ok: true, text: "맑아요!", sources: [{ title: "날씨", url: "https://w.example.kr/" }] } });
  await ctx.app.locals.talkIdle();
  const log = ctx.db.prepare("SELECT * FROM talk_log ORDER BY id").all();
  assert.deepEqual(log.map((r) => [r.kind, r.uid, r.model, r.status, r.day]), [["reply", A, "claude-haiku-4-5", "ok", "2026-05-01"], ["notebook", A, "claude-haiku-4-5", "ok", "2026-05-01"]]);
  assert.deepEqual([log[0].ms, log[0].tokens_in, log[0].tokens_out, log[0].searches, log[0].said, log[0].reply], [812, 3000, 50, 1, "오늘 날씨 어때?", "맑아요!"]);
  assert.ok(Math.abs(log[0].cost - (3000 * 1 + 50 * 5) / 1e6 - 0.01) < 1e-12);
  assert.ok(Math.abs(log[1].cost - (600 * 1 + 20 * 5) / 1e6) < 1e-12);
});

test("failures and refusals answer with the pet's own lines and keep no turn", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A, "Mochi");
  ctx.provider.replyWith = async () => ({ ok: false, stop: "api_529", text: "", sources: [], usage: { input: 0, output: 0, searches: 0 }, ms: 9 });
  assert.deepEqual((await say(ctx, jar, "안녕")).body, { ok: false, line: TALK_LINES.error });
  ctx.provider.replyWith = async () => ({ ok: false, stop: "refusal", text: "", sources: [], usage: { input: 900, output: 0, searches: 0 }, ms: 9 });
  assert.deepEqual((await say(ctx, jar, "안녕")).body, { ok: false, line: TALK_LINES.refusal });
  ctx.provider.replyWith = async () => {
    throw new Error("boom");
  };
  assert.deepEqual((await say(ctx, jar, "안녕")).body, { ok: false, line: TALK_LINES.error });
  await ctx.app.locals.talkIdle();
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM talk_turns").get().n, 0);
  assert.equal(ctx.provider.notebooks.length, 0);
  // A dispatched failure is still logged.
  assert.deepEqual(ctx.db.prepare("SELECT status FROM talk_log ORDER BY id").all().map((r) => r.status), ["api_529", "refusal", "pending"]);
});

test("one request per pet at a time", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A, "Mochi");
  const gate = deferred();
  ctx.provider.replyWith = async () => {
    await gate.promise;
    return { ok: true, stop: "end_turn", text: "응!", sources: [], usage: { input: 1, output: 1, searches: 0 }, ms: 1 };
  };
  const first = say(ctx, jar, "하나");
  while (ctx.provider.replies.length < 1) await new Promise((r) => setTimeout(r, 5));
  const second = await say(ctx, jar, "둘");
  assert.equal(second.status, 409);
  gate.resolve();
  assert.equal((await first).body.text, "응!");
  assert.equal((await say(ctx, jar, "셋")).status, 200);
  assert.equal(ctx.provider.replies.length, 2);
});

test("no usage cap: 80 messages from one pet in one Seoul day all get replies", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A, "Mochi");
  for (let i = 0; i < 80; i++) {
    ctx.advance(60 * SEC);
    const res = await say(ctx, jar, `메시지 ${i}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.text, `대답: 메시지 ${i}`);
  }
  await ctx.app.locals.talkIdle();
  assert.equal(ctx.db.prepare("SELECT COUNT(DISTINCT day) AS n FROM talk_log WHERE kind = 'reply'").get().n, 1);
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM talk_log WHERE kind = 'reply' AND status = 'ok'").get().n, 80);
});

test("context keeps the last 10 pairs, text only", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A, "Mochi");
  for (let i = 1; i <= 12; i++) await say(ctx, jar, `말 ${i}`);
  await ctx.app.locals.talkIdle();
  const rows = ctx.db.prepare("SELECT said, reply FROM talk_turns WHERE uid = ? ORDER BY id").all(A);
  assert.equal(rows.length, 10);
  assert.deepEqual(rows[0], { said: "말 3", reply: "대답: 말 3" });
  await say(ctx, jar, "말 13");
  const { messages } = ctx.provider.replies.at(-1);
  assert.equal(messages.length, 21);
  assert.deepEqual(messages.slice(0, 2), [{ role: "user", content: "말 3" }, { role: "assistant", content: "대답: 말 3" }]);
  assert.deepEqual(messages.at(-1), { role: "user", content: "말 13" });
});

test("the system prompt: persona first, then context with asked-today questions and the notebook; due ones stay out", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A, "Mochi");
  ctx.db.prepare("INSERT INTO talk_notes (uid, fact, at) VALUES (?, ?, ?)").run(A, "딸기를 좋아함", ctx.now());
  plan(ctx, A, "2026-04-30", "시험 잘 봤어요?", "2026-05-01");
  plan(ctx, A, "2026-04-29", "소풍 재밌었어요?", "2026-04-30");
  plan(ctx, A, "2026-05-01", "그림 다 그렸어요?");
  await say(ctx, jar, "안녕");
  const { system } = ctx.provider.replies[0];
  assert.ok(system.startsWith("당신은 주인의 작은 POKKEY 인형 친구예요."));
  assert.ok(system.indexOf("\n[정보]\n") > system.indexOf("\n안전\n"));
  assert.match(system, /지금: 2026년 5월 1일 \(금\) 오전 10시 0분, 서울/);
  assert.match(system, /이름: "Mochi"/);
  assert.match(system, /레벨: \d+/);
  assert.match(system, /\[오늘 집에서 주인에게 물어본 것\]\n- 시험 잘 봤어요\?/);
  assert.doesNotMatch(system, /소풍|그림/);
  assert.match(system, /\[메모\][^\n]*\n- 딸기를 좋아함/);
});

test("the notebook updates after the reply, never before it", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A, "Mochi");
  const gate = deferred();
  ctx.provider.notebookWith = async () => {
    await gate.promise;
    return { ok: true, stop: "end_turn", changes: { add: ["딸기를 좋아함"], drop: [], plans: [{ ask_on: "2026-05-03", question: "수학 시험 잘 봤어요?" }] }, usage: { input: 1, output: 1, searches: 0 }, ms: 1 };
  };
  const res = await say(ctx, jar, "나 딸기 좋아해. 모레 수학 시험이야");
  assert.equal(res.body.ok, true);
  assert.deepEqual(notes(ctx), []);
  const { prompt } = ctx.provider.notebooks[0];
  assert.match(prompt, /Today: 2026-05-01/);
  assert.match(prompt, /Owner: "나 딸기 좋아해. 모레 수학 시험이야"/);
  gate.resolve();
  await ctx.app.locals.talkIdle();
  assert.deepEqual(notes(ctx), ["딸기를 좋아함"]);
  assert.deepEqual(ctx.db.prepare("SELECT ask_on, question, asked_on FROM talk_plans").all(), [{ ask_on: "2026-05-03", question: "수학 시험 잘 봤어요?", asked_on: null }]);
});

test("notebook jobs run one at a time, each reading the notebook when it starts", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A, "Mochi");
  ctx.db.prepare("INSERT INTO talk_notes (uid, fact, at) VALUES (?, ?, ?)").run(A, "강아지를 키움", ctx.now());
  const slow = deferred();
  const fast = deferred();
  ctx.provider.notebookWith = async ({ prompt }) => {
    if (/Owner: "하나"/.test(prompt)) {
      await slow.promise;
      return { ok: true, stop: "end_turn", changes: { add: ["고양이를 키움"], drop: [1], plans: [] }, usage: { input: 1, output: 1, searches: 0 }, ms: 1 };
    }
    await fast.promise;
    return { ok: true, stop: "end_turn", changes: { add: ["피아노를 배움"], drop: [], plans: [] }, usage: { input: 1, output: 1, searches: 0 }, ms: 1 };
  };
  await say(ctx, jar, "하나");
  await say(ctx, jar, "둘");
  fast.resolve();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(ctx.provider.notebooks.length, 1);
  slow.resolve();
  await ctx.app.locals.talkIdle();
  assert.equal(ctx.provider.notebooks.length, 2);
  assert.match(ctx.provider.notebooks[1].prompt, /Notebook:\n1\. 고양이를 키움\n/);
  assert.deepEqual(notes(ctx), ["고양이를 키움", "피아노를 배움"]);
});

test("a job never writes after the pet was reset or recreated", async (t) => {
  const ctx = await setup(t, { demoUids: [A] });
  let jar = await meet(ctx, A, "Mochi");
  const gate = deferred();
  ctx.provider.notebookWith = async () => {
    await gate.promise;
    return { ok: true, stop: "end_turn", changes: { add: ["딸기를 좋아함"], drop: [], plans: [{ ask_on: "2026-05-02", question: "잘 잤어요?" }] }, usage: { input: 1, output: 1, searches: 0 }, ms: 1 };
  };
  await say(ctx, jar, "나 딸기 좋아해");
  ctx.advance(SEC);
  assert.equal((await ctx.request("/demo/fresh-start", { jar, body: { uid: A } })).status, 303);
  jar = await meet(ctx, A, "Mochi");
  gate.resolve();
  await ctx.app.locals.talkIdle();
  assert.deepEqual(notes(ctx), []);
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM talk_plans").get().n, 0);
});

test("notebook limits: 20 newest facts, 40 characters, 5 open plans within 60 days, no repeats, private entries dropped", (t) => {
  const dir = mkdtempSync(join(process.cwd(), ".test-data-"));
  const db = openDatabase(dir);
  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const today = "2026-05-01";
  const facts = () => db.prepare("SELECT fact FROM talk_notes WHERE uid = ? ORDER BY id").all(A).map((r) => r.fact);
  const ids = () => db.prepare("SELECT id FROM talk_notes WHERE uid = ? ORDER BY id").all(A).map((r) => r.id);
  applyChanges(db, A, { add: Array.from({ length: 22 }, (_, i) => `좋아하는 숫자 ${i}`), drop: [], plans: [] }, { noteIds: [], today, t: 1 });
  assert.equal(facts().length, 20);
  assert.equal(facts()[0], "좋아하는 숫자 2");
  applyChanges(db, A, {
    add: [
      "가".repeat(41), "전화번호 010-1234-5678", "엄마 번호 01012345678", "메일 kid@example.com",
      "https://evil.example.com 기억", "www.example.com 좋아함", "블로그 example.kr 운영", "나".repeat(40), "좋아하는 숫자 5",
    ],
    drop: [1, 99, 0, -1],
    plans: [],
  }, { noteIds: ids(), today, t: 2 });
  assert.deepEqual(facts().slice(-1), ["나".repeat(40)]);
  assert.ok(!facts().includes("좋아하는 숫자 2"));
  assert.equal(facts().filter((f) => f === "좋아하는 숫자 5").length, 1);
  assert.equal(facts().length, 20);
  db.prepare("INSERT INTO talk_plans (uid, ask_on, question, at, asked_on) VALUES (?, ?, ?, ?, ?)").run(A, "2026-04-20", "소풍 재밌었어요?", 0, "2026-04-20");
  applyChanges(db, A, { add: [], drop: [], plans: [
    { ask_on: "2026-05-01", question: "오늘은요?" },
    { ask_on: "2026-07-01", question: "너무 멀어요?" },
    { ask_on: "2026-02-30", question: "없는 날?" },
    { ask_on: "2026-05-02", question: "소풍 재밌었어요?" },
    { ask_on: "2026-05-02", question: "가".repeat(41) },
    { ask_on: "2026-05-02", question: "010-1234-5678로 전화했어요?" },
    { ask_on: "2026-05-02", question: "하나" },
    { ask_on: "2026-06-30", question: "둘" },
    { ask_on: "2026-05-03", question: "셋" },
    { ask_on: "2026-05-04", question: "넷" },
    { ask_on: "2026-05-05", question: "다섯" },
    { ask_on: "2026-05-06", question: "여섯" },
  ] }, { noteIds: ids(), today, t: 3 });
  assert.deepEqual(db.prepare("SELECT question FROM talk_plans WHERE asked_on IS NULL ORDER BY id").all().map((r) => r.question), ["하나", "둘", "셋", "넷", "다섯"]);
});

test("a bad notebook answer changes nothing", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A, "Mochi");
  for (const out of [
    { ok: false, stop: "refusal", changes: null },
    { ok: false, stop: "max_tokens", changes: null },
    { ok: true, stop: "end_turn", changes: { add: "딸기", drop: [], plans: [] } },
    { ok: true, stop: "end_turn", changes: { add: [], drop: ["1"], plans: [] } },
  ]) {
    ctx.provider.notebookWith = async () => ({ ...out, usage: { input: 1, output: 1, searches: 0 }, ms: 1 });
    await say(ctx, jar, "안녕");
    await ctx.app.locals.talkIdle();
  }
  assert.deepEqual(notes(ctx), []);
  assert.deepEqual(ctx.db.prepare("SELECT status FROM talk_log WHERE kind = 'notebook' ORDER BY id").all().map((r) => r.status), ["refusal", "max_tokens", "bad_shape", "bad_shape"]);
});

test("a due follow-up replaces the greeting once, oldest first", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A, "Mochi");
  plan(ctx, A, "2026-05-01", "그림 다 그렸어요?");
  plan(ctx, A, "2026-04-29", "시험 잘 봤어요?");
  plan(ctx, A, "2026-05-02", "내일 거예요?");
  const first = await ctx.request(`/t?uid=${A}`, { jar });
  assert.equal(introOf(first.html), "시험 잘 봤어요?");
  // A common gift's line still follows the question.
  assert.match(first.html, /<p class="gift is-common"/);
  assert.equal(ctx.db.prepare("SELECT asked_on FROM talk_plans WHERE question = ?").get("시험 잘 봤어요?").asked_on, "2026-05-01");
  ctx.advance(20 * SEC);
  assert.equal(introOf((await ctx.request(`/t?uid=${A}`, { jar })).html), "그림 다 그렸어요?");
  ctx.advance(20 * SEC);
  assert.equal(introOf((await ctx.request(`/t?uid=${A}`, { jar })).html), "다시 만나서 반가워요, Mochi!");
  ctx.advance(DAY);
  assert.equal(introOf((await ctx.request(`/t?uid=${A}`, { jar })).html), "내일 거예요?");
});

test("a follow-up is never taken by a celebration, a morning, a combo stage or a strange visit", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A, "Mochi");
  const waiting = () => ctx.db.prepare("SELECT asked_on FROM talk_plans").get().asked_on;
  plan(ctx, A, "2026-05-01", "시험 잘 봤어요?");
  // Level-up.
  ctx.db.prepare("UPDATE plushies SET xp = 90 WHERE uid = ?").run(A);
  const level = await ctx.request(`/t?uid=${A}`, { jar });
  assert.match(level.html, /data-celebrate="levelup"/);
  assert.equal(waiting(), null);
  // Morning.
  ctx.advance(13 * SEC);
  ctx.db.prepare("UPDATE plushies SET slept_at = ? WHERE uid = ?").run(ctx.now(), A);
  const morning = await ctx.request(`/t?uid=${A}`, { jar });
  assert.match(morning.html, /data-morning/);
  assert.equal(waiting(), null);
  // Combo stage 2 and 3: the first tap of a chain would take it, so the plan arrives after it.
  ctx.db.prepare("DELETE FROM talk_plans").run();
  ctx.advance(13 * SEC);
  await ctx.request(`/t?uid=${A}`, { jar });
  plan(ctx, A, "2026-05-01", "시험 잘 봤어요?");
  ctx.advance(4 * SEC);
  assert.match((await ctx.request(`/t?uid=${A}`, { jar })).html, /data-combo="2"/);
  ctx.advance(4 * SEC);
  assert.match((await ctx.request(`/t?uid=${A}`, { jar })).html, /data-combo="3"/);
  assert.equal(waiting(), null);
  // A stranger never sees it.
  assert.doesNotMatch((await ctx.request(`/t?uid=${A}`, { jar: {} })).html, /시험 잘 봤어요/);
  assert.equal(waiting(), null);
  ctx.advance(13 * SEC);
  assert.equal(introOf((await ctx.request(`/t?uid=${A}`, { jar })).html), "시험 잘 봤어요?");
});

test("a farm visit leaves a follow-up for the next quiet visit", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A, "Mochi");
  assert.equal((await ctx.request("/farm", { jar, body: { uid: A, act: "open" } })).status, 200);
  plan(ctx, A, "2026-05-01", "시험 잘 봤어요?");
  ctx.advance(61 * SEC);
  const visit = await ctx.request(`/t?uid=${A}`, { jar: { ...jar, farm_at: A } });
  assert.match(visit.html, /data-farm-visit="/);
  assert.doesNotMatch(visit.html, /시험 잘 봤어요/);
  assert.equal(ctx.db.prepare("SELECT asked_on FROM talk_plans").get().asked_on, null);
  ctx.advance(13 * SEC);
  assert.equal(introOf((await ctx.request(`/t?uid=${A}`, { jar })).html), "시험 잘 봤어요?");
});

test("a follow-up escapes and waits for talk to be on", async (t) => {
  const ctx = await setup(t, { uids: [C] });
  const jar = await meet(ctx, A, "Mochi");
  plan(ctx, A, "2026-05-01", "<b>시험</b>?");
  assert.equal(introOf((await ctx.request(`/t?uid=${A}`, { jar })).html), "다시 만나서 반가워요, Mochi!");
  assert.equal(ctx.db.prepare("SELECT asked_on FROM talk_plans").get().asked_on, null);
  const ctx2 = await setup(t);
  const jar2 = await meet(ctx2, A, "Mochi");
  plan(ctx2, A, "2026-05-01", "<b>시험</b>?");
  assert.match((await ctx2.request(`/t?uid=${A}`, { jar: jar2 })).html, /<p class="intro"[^>]*>&lt;b&gt;시험&lt;\/b&gt;\?<\/p>/);
});

const talkRows = (ctx, uid) => ["talk_turns", "talk_notes", "talk_plans"].map((tbl) => ctx.db.prepare(`SELECT COUNT(*) AS n FROM ${tbl} WHERE uid = ?`).get(uid).n);
function seed(ctx, uid) {
  ctx.db.prepare("INSERT INTO talk_turns (uid, said, reply, at) VALUES (?, '안녕', '반가워요', ?)").run(uid, ctx.now());
  ctx.db.prepare("INSERT INTO talk_notes (uid, fact, at) VALUES (?, '딸기를 좋아함', ?)").run(uid, ctx.now());
  plan(ctx, uid, "2026-05-09", "시험 잘 봤어요?");
  ctx.db.prepare("INSERT INTO talk_log (uid, at, day, kind, model, status, cost, said, reply) VALUES (?, ?, '2026-05-01', 'reply', 'm', 'ok', 0.001, '안녕', '반가워요')").run(uid, ctx.now());
}

test("purges: fresh-start, dev reset and a new pet row delete that serial's talk data", async (t) => {
  const ctx = await setup(t, { demoUids: [A] });
  const jar = await meet(ctx, A, "Mochi");
  seed(ctx, A);
  seed(ctx, C);
  await ctx.request("/demo/fresh-start", { jar, body: { uid: A } });
  assert.deepEqual(talkRows(ctx, A), [0, 0, 0]);
  assert.deepEqual(talkRows(ctx, C), [1, 1, 1]);
  assert.deepEqual(ctx.db.prepare("SELECT said, reply FROM talk_log WHERE uid = ?").get(A), { said: null, reply: null });
  assert.equal(ctx.db.prepare("SELECT said FROM talk_log WHERE uid = ?").get(C).said, "안녕");
  seed(ctx, B);
  await ctx.request(`/t?uid=${B}`);
  assert.deepEqual(talkRows(ctx, B), [0, 0, 0]);
  await ctx.request("/dev/reset", { body: {} });
  assert.deepEqual(talkRows(ctx, C), [0, 0, 0]);
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM talk_log WHERE said IS NOT NULL").get().n, 0);
});

test("message text is cleared after 14 days; the rest of the log row stays", async (t) => {
  const ctx = await setup(t);
  const jar = await meet(ctx, A, "Mochi");
  await say(ctx, jar, "안녕");
  await ctx.app.locals.talkIdle();
  ctx.advance(14 * DAY + SEC);
  await say(ctx, jar, "또 안녕");
  await ctx.app.locals.talkIdle();
  const rows = ctx.db.prepare("SELECT said, reply, tokens_in FROM talk_log WHERE kind = 'reply' ORDER BY id").all();
  assert.deepEqual(rows, [{ said: null, reply: null, tokens_in: 1000 }, { said: "또 안녕", reply: "대답: 또 안녕", tokens_in: 1000 }]);
  assert.deepEqual(ctx.db.prepare("SELECT said FROM talk_turns").all(), [{ said: "또 안녕" }]);
});
