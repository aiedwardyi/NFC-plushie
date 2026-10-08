import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
import { THEMES, page } from "../src/pages.js";

const A = "04AAAAAAAAAAA1";
const NOT_FOUND = "<p>이 친구는 인형 속에서 기다리고 있어요. 인형에 폰을 톡 대 주세요.</p>";
const CSP = "default-src 'self'; style-src 'self' https://cdn.jsdelivr.net; font-src 'self' https://cdn.jsdelivr.net; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
const COLORS = { classic: "#141B2B", "8bit": "#1d2b53", milk: "#ffe3ea", najeon: "#0f0e13" };

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
  const server = createApp({ db, rng: () => 0, demoUids: [] }).listen(0, "localhost");
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
    if (jar) updateJar(jar, setCookies);
    return { status: res.status, html: await res.text(), headers: res.headers };
  }
  return { request };
}

async function named(t, theme) {
  const ctx = await setup(t);
  const jar = { theme };
  const first = await ctx.request(`/t?uid=${A}`, { jar });
  await ctx.request("/name", { jar, body: { uid: A, name: "Mochi" } });
  const home = await ctx.request(`/t?uid=${A}`, { jar });
  return { ...ctx, jar, first, home };
}

const count = (html, re) => (html.match(re) || []).length;

function assertThemed(html, id) {
  assert.match(html, new RegExp(`<html lang="ko" data-mascot="(horse|sheep)" data-theme="${id}">`));
  assert.match(html, new RegExp(`<link rel="stylesheet" href="/mascot-toggle.css">\\n  <link rel="stylesheet" href="/themes/${id}.css">`));
  assert.match(html, new RegExp(`<meta name="theme-color" content="${COLORS[id]}">`));
}

function assertClassic(html) {
  assert.match(html, /<html lang="ko" data-mascot="(horse|sheep)">/);
  assert.doesNotMatch(html, /data-theme|\/themes\//);
  assert.match(html, /<meta name="theme-color" content="#141B2B">/);
}

test("one theme list carries every id, name and color", () => {
  assert.deepEqual(THEMES.map((t) => [t.id, t.name, t.color]), [
    ["classic", "클래식", "#141B2B"],
    ["8bit", "8비트", "#1d2b53"],
    ["milk", "딸기우유", "#ffe3ea"],
    ["najeon", "자개", "#0f0e13"],
  ]);
});

for (const id of ["8bit", "milk", "najeon"]) {
  test(`page renders the ${id} theme on html, its sheet after the toggle css and its color`, () => {
    assertThemed(page(null, NOT_FOUND, { theme: id }), id);
  });
}

test("classic, missing, unknown and hostile themes all render plain classic", () => {
  const plain = page(null, NOT_FOUND);
  assertClassic(plain);
  for (const theme of ["classic", undefined, "neon", '8bit"><script>']) {
    assert.equal(page(null, NOT_FOUND, { theme }), plain);
  }
});

test("a classic error page is byte-identical to the pre-theme markup", async (t) => {
  const fixture = readFileSync(new URL("./fixtures/classic-404.html", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.equal(page(null, NOT_FOUND), fixture);
  const { request } = await setup(t);
  assert.equal((await request("/missing")).html, fixture);
});

test("owner home, first meet and stranger honor the theme cookie", async (t) => {
  const { request, first, home } = await named(t, "milk");
  assertThemed(first.html, "milk");
  assertThemed(home.html, "milk");
  assertThemed((await request(`/t?uid=${A}`, { jar: { theme: "milk" } })).html, "milk");
});

test("error renders honor the theme cookie", async (t) => {
  const { request, jar } = await named(t, "najeon");
  const bad = await request("/t?uid=nope", { jar });
  assert.equal(bad.status, 400);
  assertThemed(bad.html, "najeon");
  const missing = await request("/missing", { jar });
  assert.equal(missing.status, 404);
  assertThemed(missing.html, "najeon");
  const long = await request("/name", { jar, body: { uid: A, name: "가".repeat(25) } });
  assert.equal(long.status, 400);
  assert.match(long.html, /1글자에서 24글자/);
  assertThemed(long.html, "najeon");
});

test("an invalid theme cookie means classic everywhere", async (t) => {
  const { request, first, home, jar } = await named(t, "neon");
  assertClassic(first.html);
  assertClassic(home.html);
  assertClassic((await request("/missing", { jar })).html);
  assertClassic((await request("/t?uid=nope", { jar: { theme: '8bit"><script>' } })).html);
});

test("owner home has the 꾸미기 button and sheet with the current world pressed", async (t) => {
  const { home } = await named(t, "8bit");
  assert.match(home.html, /<span class="topbar-end"><button type="button" class="theme-btn" data-open="theme" aria-haspopup="dialog" aria-label="꾸미기">[\s\S]*?<\/button><button type="button" class="level-pin" data-open="record" aria-haspopup="dialog" aria-label="우리 기록, Lv\. 1">Lv\. 1<\/button><\/span>/);
  assert.match(home.html, /<div class="sheet" data-sheet="theme" role="dialog" aria-modal="true" aria-labelledby="sheet-theme-title" hidden>/);
  assert.match(home.html, /<h2 id="sheet-theme-title">꾸미기<\/h2>/);
  assert.match(home.html, /<p class="theme-lede">어떤 세상에서 놀까요\?<\/p>/);
  assert.equal(count(home.html, /<button type="button" class="theme-card" data-pick="/g), 4);
  for (const t of THEMES) {
    assert.match(home.html, new RegExp(`data-pick="${t.id}" data-color="${t.color}" aria-pressed="${t.id === "8bit"}">[\\s\\S]*?<span class="theme-name">${t.name}</span>`));
  }
});

test("classic owner home presses the classic card", async (t) => {
  const { home } = await named(t);
  assert.match(home.html, /data-pick="classic" data-color="#141B2B" aria-pressed="true"/);
  assert.equal(count(home.html, /data-pick="\w+" data-color="#\w+" aria-pressed="false"/g), 3);
});

test("first meet, stranger and error pages have no 꾸미기", async (t) => {
  const { request, first, jar } = await named(t, "milk");
  const stranger = await request(`/t?uid=${A}`, { jar: { theme: "milk" } });
  const missing = await request("/missing", { jar });
  for (const html of [first.html, stranger.html, missing.html]) {
    assert.doesNotMatch(html, /theme-btn|data-sheet="theme"|data-pick=/);
  }
});

test("theme css is never cached, theme art and sounds are cached for a day", async (t) => {
  const { request } = await setup(t);
  const css = await request("/themes/8bit.css");
  assert.equal(css.status, 200);
  assert.match(css.headers.get("content-type"), /^text\/css/);
  assert.equal(css.headers.get("cache-control"), "no-store");
  const kinds = await request("/kinds.css");
  assert.equal(kinds.status, 200);
  assert.match(kinds.headers.get("content-type"), /^text\/css/);
  assert.equal(kinds.headers.get("cache-control"), "no-store");
  assert.match(kinds.html, /\[data-mascot="tiger"\] \{ --px: url\("\/themes\/px\/tiger-px\.png"\);/);
  const art = await request("/themes/px/horse-px.png");
  assert.equal(art.headers.get("cache-control"), "public, max-age=86400");
  const cry = await request("/sfx/cry-classic-happy.mp3");
  assert.equal(cry.status, 200);
  assert.equal(cry.headers.get("content-type"), "audio/mpeg");
  assert.equal(cry.headers.get("cache-control"), "public, max-age=86400");
});

test("the content security policy is unchanged", async (t) => {
  const { request } = await setup(t);
  for (const path of ["/missing", `/t?uid=${A}`, "/themes/milk.css"]) {
    assert.equal((await request(path, { jar: { theme: "milk" } })).headers.get("content-security-policy"), CSP);
  }
});
