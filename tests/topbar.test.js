import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { KINDS, KIND_IDS } from "../public/kinds.js";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
import { fakeUids } from "../src/pages.js";

const [A] = fakeUids;
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
    return { status: res.status, html: await res.text() };
  }
  const set = (sql, uid = A) => db.prepare(`UPDATE plushies SET ${sql} WHERE uid = ?`).run(uid);
  return { request, set };
}

async function meet(ctx, uid, name, jar = {}) {
  const first = await ctx.request(`/t?uid=${uid}`, { jar });
  if (name) {
    await ctx.request("/name", { jar, body: { uid, name } });
    await ctx.request(`/t?uid=${uid}`, { jar });
  }
  return { jar, first: first.html };
}

const topbar = (html) => html.match(/<header class="topbar">[\s\S]*?<\/header>/)[0];

test("no page renders the top-bar 말/양 switch", async (t) => {
  const ctx = await setup(t);
  const { jar, first } = await meet(ctx, A);
  const pages = {
    first,
    naming: (await ctx.request(`/t?uid=${A}&view=1`, { jar })).html,
    longName: (await ctx.request("/name", { jar, body: { uid: A, name: "가".repeat(25) } })).html,
  };
  await ctx.request("/name", { jar, body: { uid: A, name: "Mochi" } });
  Object.assign(pages, {
    named: (await ctx.request(`/t?uid=${A}`, { jar })).html,
    home: (await ctx.request(`/t?uid=${A}`, { jar })).html,
    sheep: (await ctx.request(`/t?uid=${A}&view=1&mascot=sheep`, { jar })).html,
    stranger: (await ctx.request(`/t?uid=${A}`)).html,
    claim: (await ctx.request("/claim", { body: { uid: A, code: "WRONG1" } })).html,
    preview: (await ctx.request("/dev/preview?kind=claim&count=10&mascot=sheep")).html,
    gift: (await ctx.request("/dev/preview?kind=gift&count=10&tier=rare")).html,
    missing: (await ctx.request("/missing")).html,
    dev: (await ctx.request("/dev")).html,
  });
  assert.match(pages.home, /data-care-uid="04AAAAAAAAAAA1"/);
  assert.match(pages.stranger, /이미 주인이 있어요/);
  // Only a page with the level line has the top-right buttons; the rest keep the bare wordmark.
  const homes = ["named", "home", "sheep", "preview", "gift"];
  for (const [name, html] of Object.entries(pages)) {
    assert.doesNotMatch(html, /data-mascot-toggle|class="mascot-tog|친구 바꾸기/, name);
    assert.equal(/class="level-line"/.test(html), homes.includes(name), name);
    const end = homes.includes(name) ? "<span class=\"topbar-end\">[\\s\\S]*<\\/span>\\s*" : "";
    assert.match(topbar(html), new RegExp(`^<header class="topbar">\\s*<span class="wordmark">POKKEY</span>\\s*${end}</header>$`), name);
  }
});

test("a demo chip keeps the admin panel's 12 animals and 3 tiers, and the top bar stays clear", async (t) => {
  const ctx = await setup(t, { demoUids: [A] });
  const { jar, first } = await meet(ctx, A, "Mochi");
  for (const html of [first, (await ctx.request(`/t?uid=${A}&view=1`, { jar })).html]) {
    assert.doesNotMatch(topbar(html), /mascot/);
    assert.deepEqual(html.match(/<aside class="mascot-toggle"[^>]*>/g), ['<aside class="mascot-toggle" data-demo-switch role="group" aria-label="친구 바꾸기">']);
    const picker = html.match(/<aside class="mascot-toggle" data-demo-switch[\s\S]*?<\/aside>/)[0];
    const kinds = [...picker.matchAll(/<button type="button" class="mascot-tog(?: is-active)?" data-mascot="(\w+)" aria-label="([^"]+)"/g)];
    assert.deepEqual(kinds.map((m) => m[1]), KIND_IDS);
    assert.deepEqual(kinds.map((m) => m[2]), KINDS.map((k) => `${k.name} 친구`));
    const tiers = html.match(/<div class="demo-tier" data-demo-edition[\s\S]*?<\/div>/)[0];
    assert.deepEqual([...tiers.matchAll(/data-edition="(\w+)"/g)].map((m) => m[1]), ["classic", "rare", "legendary"]);
  }
});

test("the top-right pin shows the days together and opens 우리 기록; the level stays on the level line", async (t) => {
  const ctx = await setup(t);
  const { jar } = await meet(ctx, A, "Mochi");
  ctx.set("days_together = 12, xp = 300");
  const html = (await ctx.request(`/t?uid=${A}&view=1`, { jar })).html;
  assert.match(topbar(html), /<span class="topbar-end"><button type="button" class="theme-btn" data-open="theme" aria-haspopup="dialog" aria-label="꾸미기"><span class="swatch" aria-hidden="true"><\/span><\/button><button type="button" class="level-pin" data-open="record" aria-haspopup="dialog" aria-label="우리 기록, 함께한 지 12일"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="[^"]+"\/><\/svg>12일<\/button><\/span>/);
  assert.doesNotMatch(topbar(html), /Lv|레벨/);
  assert.match(html, /<p class="record-hero">함께한 지 12일<\/p>/);
  assert.match(html, /<span class="level-badge" aria-label="Lv\. 3">3<\/span>/);
  assert.equal(html.match(/data-open="record"/g).length, 1);
  const preview = (await ctx.request("/dev/preview?kind=levelup&count=10")).html;
  assert.match(topbar(preview), /aria-label="우리 기록, 함께한 지 12일"><svg [^>]*>[\s\S]*?<\/svg>12일<\/button>/);
  assert.match(preview, /<span class="level-badge" aria-label="Lv\. 2">2<\/span>/);
});
