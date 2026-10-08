import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";

const A = "04AAAAAAAAAAA1";
const read = (path) => readFileSync(new URL(`../public/${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the want bubble is a button that does its dock verb", () => {
  const app = read("app.js");
  const set = app.match(/function setWant\(id\) \{[\s\S]*?\n  \}/);
  assert.ok(set, "setWant exists");
  assert.match(set[0], /document\.createElement\("button"\)/);
  assert.match(set[0], /\.type = "button"/);
  assert.match(set[0], /addEventListener\("click", \(\) => press\(id\)\)/);
  assert.doesNotMatch(set[0], /"role", "img"/);
  const want = read("style.css").match(/\n\.want \{[^}]*\}/);
  assert.ok(want, ".want rule exists");
  assert.doesNotMatch(want[0], /pointer-events: none/);
});

test("the race step also ends when the 오락실 sheet closes by its × or backdrop", () => {
  const race = read("app.js").match(/\n    race: \{[\s\S]*?\n    \},/);
  assert.ok(race, "race step exists");
  assert.match(race[0], /\[data-sheet-close\]/);
  assert.match(race[0], /event\.target === arcadeSheet/);
  assert.match(race[0], /done: "click"/);
});

test("at night the guide feeds first and tucks the pet in before the goodbye", () => {
  const app = read("app.js");
  assert.match(app, /자기 전에 밥 먹을래요! 밥을 눌러 줘요/);
  assert.match(app, /sleep: \{ target: \(\) => dock\.querySelector\('\[data-care="sleep"\]'\), line: \(\) => "이제 졸려요… 잠을 눌러 재워 줄래요\?"/);
  // The bubble only stands in for the verb it does: at night the moon bubble would put the pet to bed.
  assert.match(app, /also: \(\) => win\.querySelector\(`\.want\[data-want="\$\{verb\(\)\}"\]:not\(\.is-gone\)`\)/);
});

test("the farm tour waits on a growing crop with a soft ring and walks home at the end", () => {
  const app = read("app.js");
  assert.match(app, /쑥쑥 자라는 중! 다 자라면 알려 줄게요/);
  assert.match(app, /"farm-home": \{ target: \(\) => dock\.querySelector\("\[data-farm\]"\), line: \(\) => "집으로 가서 오락실도 구경해요!"/);
  const farm = read("game/farm.js");
  assert.match(farm, /growRect\(\) \{/);
});

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
  const clock = { now: Date.parse("2026-05-01T10:00:00+09:00") };
  const server = createApp({ db, now: () => clock.now, rng: () => 0, demoUids: [A] }).listen(0, "localhost");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    db.close();
    assert.equal(dirname(dir), process.cwd());
    rmSync(dir, { recursive: true, force: true });
  });
  async function request(path, { jar = {}, body } = {}) {
    const headers = {};
    const pair = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
    if (pair) headers.Cookie = pair;
    if (body) headers["Content-Type"] = "application/json";
    const res = await fetch(`http://localhost:${server.address().port}${path}`, {
      method: body ? "POST" : "GET",
      redirect: "manual",
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    updateJar(jar, typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : []);
    return { status: res.status, html: await res.text() };
  }
  const row = () => db.prepare("SELECT * FROM plushies WHERE uid = ?").get(A);
  return { clock, request, row };
}

const metOf = (html) => /<body[^>]*\sdata-met="([^"]*)"/.exec(html)?.[1] ?? null;

test("the owner's home carries its meet for the guide's key; strangers don't, and a fresh start is a new meet", async (t) => {
  const { clock, request, row } = await setup(t);
  const jar = {};
  const first = await request(`/t?uid=${A}`, { jar });
  assert.equal(metOf(first.html), null);
  await request("/name", { jar, body: { uid: A, name: "Mochi" } });
  const named = await request(`/t?uid=${A}`, { jar });
  assert.match(named.html, /data-celebrate="named"/);
  assert.equal(metOf(named.html), row().created_at);
  assert.equal(metOf((await request(`/t?uid=${A}&view=1`, { jar })).html), row().created_at);
  assert.equal(metOf((await request(`/t?uid=${A}`)).html), null);
  const before = row().created_at;
  clock.now += 60 * 1000;
  assert.equal((await request("/demo/fresh-start", { jar, body: { uid: A } })).status, 303);
  await request(`/t?uid=${A}`, { jar });
  await request("/name", { jar, body: { uid: A, name: "Bori" } });
  const again = metOf((await request(`/t?uid=${A}`, { jar })).html);
  assert.equal(again, row().created_at);
  assert.notEqual(again, before);
});

test("the owner's 우리 기록 ends with 가이드 다시 보기; strangers and previews have none", async (t) => {
  const { request } = await setup(t);
  const jar = {};
  await request(`/t?uid=${A}`, { jar });
  await request("/name", { jar, body: { uid: A, name: "Mochi" } });
  const home = (await request(`/t?uid=${A}&view=1`, { jar })).html;
  const record = home.match(/<div class="sheet" data-sheet="record"[\s\S]*?<\/section>/);
  assert.ok(record, "record sheet");
  assert.match(record[0], /<button type="button" class="record-guide" data-guide-replay>가이드 다시 보기<span class="g-chev" aria-hidden="true">›<\/span><\/button>\s*<\/section>$/);
  assert.equal((home.match(/data-guide-replay/g) || []).length, 1);
  assert.doesNotMatch((await request(`/t?uid=${A}`)).html, /data-guide-replay/);
  assert.doesNotMatch((await request("/dev/preview?kind=gift&count=10")).html, /data-guide-replay/);
  const app = read("app.js");
  assert.match(app, /\[data-guide-replay\]/);
  assert.match(app, /replay\(\)/);
});
