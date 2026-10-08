import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
import { DIAG } from "../src/diag.js";
import { fakeUids } from "../src/pages.js";

const [A, B] = fakeUids;
const T0 = Date.parse("2026-10-08T10:00:00+09:00");
const MIN = 60 * 1000;
const KEY = "lead-only";
const LOAD = "0123456789ab";

async function setup(t, options = {}, dir = mkdtempSync(join(process.cwd(), ".test-data-"))) {
  const db = openDatabase(dir);
  let time = T0;
  const server = createApp({ db, now: () => time, rng: () => 0, demoUids: [], diagKey: KEY, ...options }).listen(0, "localhost");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    assert.equal(dirname(dir), process.cwd());
    rmSync(dir, { recursive: true, force: true });
  });
  const url = (path) => `http://localhost:${server.address().port}${path}`;
  async function send(body, headers = {}) {
    const res = await fetch(url("/diag"), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
    return { status: res.status, text: await res.text() };
  }
  async function read(query = "", auth = `Bearer ${KEY}`) {
    const res = await fetch(url(`/diag${query}`), { headers: auth === null ? {} : { Authorization: auth } });
    const text = await res.text();
    return { status: res.status, type: res.headers.get("content-type") || "", text, json: /json/.test(res.headers.get("content-type")) ? JSON.parse(text) : null };
  }
  const rows = () => db.prepare("SELECT * FROM diag_log ORDER BY id").all();
  return { db, url, send, read, rows, advance: (ms) => { time += ms; } };
}

// A batch as the pet page's beacon sends it.
const batch = (events, extra = {}) => ({
  id: LOAD, uid: A, theme: "classic", kind: "dragon", view: "384x832@2", fullscreen: false, visibility: "visible",
  classes: "has-app", ua: "Mozilla/5.0 (Linux; Android 14; SM-S928N) SamsungBrowser/27.0", events, ...extra,
});
const ev = (name, detail = "", ms = 100) => ({ name, detail, ms });
const quiet = (t) => t.mock.method(console, "log", () => {});

test("a beacon batch is stored a row per event with its page's context, logged a line per event, and answered 204", async (t) => {
  const log = quiet(t);
  const ctx = await setup(t);
  const events = [ev("error", "Error: boom /app.js:12:3", 1520.4), ev("console", "TypeError: x @ /game/farm.js:9:1"), ev("gl-lost", "div.f-stage 768x600"), ev("stall", "timer gap 4012ms"), ev("pet-hidden", "opacity 0 1.5s after farm | box 82,301 220x220")];
  const res = await ctx.send(batch(events));
  assert.equal(res.status, 204);
  assert.equal(res.text, "");
  const rows = ctx.rows();
  assert.deepEqual(rows.map((r) => [r.event, r.detail]), events.map((e) => [e.name, e.detail]));
  for (const r of rows) {
    assert.equal(r.at, T0);
    assert.equal(r.load, LOAD);
    assert.equal(r.uid, A);
  }
  assert.deepEqual(JSON.parse(rows[0].context), { ms: 1520, theme: "classic", kind: "dragon", view: "384x832@2", fullscreen: false, visibility: "visible", classes: "has-app", ua: "Mozilla/5.0 (Linux; Android 14; SM-S928N) SamsungBrowser/27.0" });
  assert.deepEqual(log.mock.calls.map((c) => c.arguments), [
    [`diag error ${A} ${LOAD} 1520ms Error: boom /app.js:12:3`],
    [`diag console ${A} ${LOAD} 100ms TypeError: x @ /game/farm.js:9:1`],
    [`diag gl-lost ${A} ${LOAD} 100ms div.f-stage 768x600`],
    [`diag stall ${A} ${LOAD} 100ms timer gap 4012ms`],
    [`diag pet-hidden ${A} ${LOAD} 100ms opacity 0 1.5s after farm | box 82,301 220x220`],
  ]);
});

test("only known events are kept and every size is capped", async (t) => {
  quiet(t);
  const ctx = await setup(t);
  const long = "가".repeat(400);
  assert.equal((await ctx.send(batch([ev("eval", "x"), ev("__proto__"), { name: ["error"] }, null, "error", ev("stall", `two\nlines\u0007\tand ${long}`), { name: "error", detail: { no: 1 }, ms: -5 }]))).status, 204);
  const [stall, error] = ctx.rows();
  assert.equal(ctx.rows().length, 2);
  assert.equal(stall.event, "stall");
  assert.equal(stall.detail, Array.from(`two lines and ${long}`).slice(0, DIAG.detail).join(""));
  assert.equal(Array.from(stall.detail).length, 300);
  assert.equal(error.detail, "");
  assert.equal(JSON.parse(error.context).ms, null);
  // A page sends at most 30; more in one batch are cut, never stored.
  await ctx.send(batch(Array.from({ length: 45 }, (_, i) => ev("console", `c${i}`))));
  assert.equal(ctx.rows().filter((r) => r.event === "console").length, DIAG.batch);
  assert.equal(ctx.rows().at(-1).detail, "c29");
  // The context's fields are capped too, and a uid that isn't one is dropped.
  await ctx.send(batch([ev("error", "x")], { uid: "04aaaaaaaaaaa1", ua: "U".repeat(900), classes: `${"c ".repeat(400)}`, theme: "neon-classic-pink-x", view: { w: 1 }, fullscreen: "yes", extra: "dropped" }));
  const last = ctx.rows().at(-1);
  assert.equal(last.uid, null);
  const context = JSON.parse(last.context);
  assert.deepEqual(Object.keys(context), ["ms", "theme", "kind", "view", "fullscreen", "visibility", "classes", "ua"]);
  assert.equal(context.ua.length, 300);
  assert.equal(context.classes.length, 300);
  assert.equal(context.theme, "neon-classic-pin");
  assert.equal(context.view, "");
  assert.equal(context.fullscreen, false);
});

test("malformed and oversized bodies are dropped, still with 204", async (t) => {
  const log = quiet(t);
  const ctx = await setup(t);
  const bodies = ["", "{not json", "null", "[]", "42", '"text"', JSON.stringify({ events: [ev("error")] }), JSON.stringify(batch([ev("error")], { id: "x" })),
    JSON.stringify(batch([ev("error")], { id: ["0123456789ab"] })), JSON.stringify(batch({ 0: ev("error") })), JSON.stringify(batch([]))];
  for (const body of bodies) assert.equal((await ctx.send(body)).status, 204, body);
  assert.equal((await ctx.send("\u0000ÿ", { "Content-Type": "application/json; charset=klingon" })).status, 204);
  // Over the cap, even a good batch is dropped whole.
  const big = JSON.stringify(batch([ev("error", "x")], { pad: "x".repeat(70 * 1024) }));
  assert.ok(Buffer.byteLength(big) > 64 * 1024);
  assert.equal((await ctx.send(big)).status, 204);
  assert.equal(ctx.rows().length, 0);
  assert.equal(log.mock.callCount(), 0);
});

test("a full batch is bigger than the app's 4 KB parsers take and still lands, whatever its content type", async (t) => {
  quiet(t);
  const ctx = await setup(t);
  const full = JSON.stringify(batch(Array.from({ length: 30 }, (_, i) => ev("pet-hidden", `${i} ${"가".repeat(290)}`))));
  assert.ok(Buffer.byteLength(full) > 16 * 1024);
  assert.equal((await ctx.send(full)).status, 204);
  assert.equal((await ctx.send(JSON.stringify(batch([ev("error", "as text")])), { "Content-Type": "text/plain;charset=UTF-8" })).status, 204);
  assert.equal(ctx.rows().length, 31);
  assert.equal(ctx.rows().at(-1).detail, "as text");
});

test("the log keeps only the newest 2000 rows", async (t) => {
  quiet(t);
  const ctx = await setup(t);
  for (let b = 0; b < 70; b++) {
    if (b % 4 === 0) ctx.advance(MIN);
    assert.equal((await ctx.send(batch(Array.from({ length: 30 }, (_, i) => ev("console", `b${b}-${i}`))))).status, 204);
  }
  const rows = ctx.rows();
  assert.equal(rows.length, DIAG.keep);
  assert.equal(rows[0].detail, "b3-10");
  assert.equal(rows.at(-1).detail, "b69-29");
});

test("one address gets 120 events a minute; past that its batches are dropped, others and the next minute still land", async (t) => {
  quiet(t);
  const ctx = await setup(t);
  const from = (ip) => ({ "X-Forwarded-For": ip });
  const full = () => batch(Array.from({ length: 30 }, (_, i) => ev("stall", `gap ${i}`)));
  for (let i = 0; i < 4; i++) await ctx.send(full(), from("203.0.113.5"));
  assert.equal(ctx.rows().length, DIAG.perWindow);
  await ctx.send(full(), from("203.0.113.5"));
  await ctx.send(batch([ev("error", "one more")]), from("203.0.113.5"));
  // Render's proxy adds the caller last, so a forged first hop changes nothing.
  await ctx.send(batch([ev("error", "forged")]), from("198.51.100.1, 203.0.113.5"));
  assert.equal(ctx.rows().length, DIAG.perWindow);
  await ctx.send(batch([ev("error", "another phone")]), from("198.51.100.7"));
  assert.equal(ctx.rows().at(-1).detail, "another phone");
  ctx.advance(MIN);
  await ctx.send(batch([ev("error", "next minute")]), from("203.0.113.5"));
  assert.equal(ctx.rows().at(-1).detail, "next minute");
});

test("reading needs DIAG_KEY as a Bearer header: unset is the plain 404, a wrong key or one in the URL 403, the right key the newest rows", async (t) => {
  quiet(t);
  const off = await setup(t, { diagKey: "" });
  await off.send(batch([ev("error", "kept for the log")]));
  assert.equal(off.rows().length, 1);
  for (const auth of [null, `Bearer ${KEY}`, "Bearer"]) {
    const res = await off.read("", auth);
    assert.equal(res.status, 404);
    assert.match(res.text, /인형 속에서 기다리고 있어요/);
  }
  const ctx = await setup(t);
  await ctx.send(batch([ev("error", "first"), ev("stall", "timer gap 4000ms", 2000)]));
  const wrong = [null, "Bearer", "Bearer lead", "Bearer lead-only-not", `Bearer ${KEY.toUpperCase()}`, KEY, `Basic ${KEY}`].map((auth) => ["", auth]);
  for (const [query, auth] of [...wrong, [`?key=${KEY}`, null]]) {
    const res = await ctx.read(query, auth);
    assert.equal(res.status, 403, `${query} ${auth}`);
    assert.deepEqual(res.json, { ok: false });
  }
  const res = await ctx.read();
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.rows.map((r) => [r.event, r.detail]), [["stall", "timer gap 4000ms"], ["error", "first"]]);
  assert.deepEqual(res.json.rows[0], {
    id: 2, at: new Date(T0).toISOString(), load: LOAD, uid: A, event: "stall", detail: "timer gap 4000ms",
    context: { ms: 2000, theme: "classic", kind: "dragon", view: "384x832@2", fullscreen: false, visibility: "visible", classes: "has-app", ua: "Mozilla/5.0 (Linux; Android 14; SM-S928N) SamsungBrowser/27.0" },
  });
});

test("reading filters by since and uid and returns at most the newest 500", async (t) => {
  quiet(t);
  const ctx = await setup(t);
  for (let b = 0; b < 20; b++) {
    if (b % 4 === 0) ctx.advance(MIN);
    await ctx.send(batch(Array.from({ length: 30 }, (_, i) => ev("console", `b${b}-${i}`)), { uid: b % 2 ? B : A }));
  }
  const all = await ctx.read();
  assert.equal(all.json.rows.length, DIAG.read);
  assert.equal(all.json.rows[0].detail, "b19-29");
  assert.equal(all.json.rows.at(-1).detail, "b3-10");
  // The last 4 batches came in the fifth minute.
  const since = new Date(T0 + 5 * MIN).toISOString();
  const late = await ctx.read(`?since=${since}`);
  assert.equal(late.json.rows.length, 120);
  assert.ok(late.json.rows.every((r) => r.at >= since));
  const kst = await ctx.read(`?since=${encodeURIComponent("2026-10-08T10:05:00+09:00")}`);
  assert.equal(kst.json.rows.length, 120);
  const one = await ctx.read(`?uid=${B.toLowerCase()}&since=${since}`);
  assert.equal(one.json.rows.length, 60);
  assert.ok(one.json.rows.every((r) => r.uid === B));
  for (const query of ["?since=yesterday", "?since=", "?uid=nope", "?uid=", `?uid=${A}&uid=${B}`]) {
    const res = await ctx.read(query);
    assert.equal(res.status, 400, query);
    assert.deepEqual(res.json, { ok: false });
  }
});

test("only the pet page loads the beacon, before app.js", async (t) => {
  const ctx = await setup(t);
  const page = async (path) => (await fetch(ctx.url(path))).text();
  const meet = await page(`/t?uid=${A}`);
  assert.match(meet, /<script src="\/mascot-boot\.js"[^>]*><\/script>\n  <script type="module" src="\/diag\.js"><\/script>\n  <script src="\/app\.js" defer><\/script>/);
  // The same tap without the owner's cookie is a stranger's page.
  const stranger = await page(`/t?uid=${A}`);
  assert.match(stranger, /이미 주인이 있어요/);
  for (const html of [stranger, await page("/missing"), await page("/t?uid=nope"), await page("/dev")]) assert.doesNotMatch(html, /diag\.js/);
  const script = await fetch(ctx.url("/diag.js"));
  assert.equal(script.status, 200);
  assert.match(script.headers.get("content-type"), /javascript/);
  assert.equal(script.headers.get("cache-control"), "no-store");
});
