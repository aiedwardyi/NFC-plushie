import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
import { fakeUids } from "../src/pages.js";

const [A, B] = fakeUids;
const T0 = Date.parse("2026-05-01T10:00:00+09:00");
const SHARE = '<button type="button" class="st-share" data-share-card aria-label="카드로 자랑하기">';

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
    return { status: res.status, html: await res.text() };
  }
  return { request };
}

const statHead = (html) => html.match(/<div class="sheet" data-sheet="stats"[\s\S]*?<\/header>/)?.[0] || "";
const shares = (html) => html.split(SHARE).length - 1;

test("the 능력치 header carries the card button left of the close, on the owner's page only", async (t) => {
  const ctx = await setup(t, { legendaryUids: [A] });
  const jar = {};
  await ctx.request(`/t?uid=${A}`, { jar });
  assert.equal((await ctx.request("/name", { jar, body: { uid: A, name: "Mochi" } })).status, 303);
  for (const path of [`/t?uid=${A}`, `/t?uid=${A}&view=1`]) {
    const home = await ctx.request(path, { jar });
    assert.equal(shares(home.html), 1, path);
    assert.match(statHead(home.html), /<h2 id="sheet-stats-title">능력치<\/h2>\s*<button type="button" class="st-share" data-share-card aria-label="카드로 자랑하기"><svg viewBox="0 0 24 24" aria-hidden="true">[\s\S]+?<\/svg><\/button><button type="button" class="sheet-close" data-sheet-close aria-label="닫기">/);
  }
  const stranger = await ctx.request(`/t?uid=${A}`, { jar: { owner_token: "nope" } });
  const wrong = await ctx.request("/claim", { body: { uid: A, code: "WRONG1" } });
  const preview = await ctx.request("/dev/preview?kind=gift&count=10");
  for (const page of [stranger, wrong, preview]) {
    assert.match(statHead(page.html), /<h2 id="sheet-stats-title">능력치<\/h2>/);
    assert.equal(shares(page.html), 0);
    assert.doesNotMatch(page.html, /data-share-card|st-share/);
  }
  const unnamed = await ctx.request(`/t?uid=${B}`, { jar: {} });
  assert.match(unnamed.html, /name="name"/);
  assert.doesNotMatch(unnamed.html, /data-share-card|st-share/);
});
