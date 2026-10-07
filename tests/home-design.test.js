import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
import { GIFT_COUNT, GIFTS } from "../src/gifts.js";
import { giftCollection, recordSheet } from "../src/pages.js";

const A = "04AAAAAAAAAAA1";
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

async function setup(t) {
  const dir = mkdtempSync(join(process.cwd(), ".test-data-"));
  const db = openDatabase(dir);
  const server = createApp({ db, now: () => T0, rng: () => 0, demoUids: [] }).listen(0, "localhost");
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
  return { request, db };
}

async function named(t) {
  const ctx = await setup(t);
  const jar = {};
  const first = await ctx.request(`/t?uid=${A}`, { jar });
  await ctx.request("/name", { jar, body: { uid: A, name: "Mochi" } });
  const skip = await ctx.request(`/t?uid=${A}`, { jar });
  return { ...ctx, jar, first, skip };
}

const count = (html, re) => (html.match(re) || []).length;

test("gift collection lists every gift and lights only the found ones", () => {
  const html = giftCollection(["c01", "s02", "r01", "zz9"]);
  assert.equal(count(html, /data-tile="/g), GIFT_COUNT);
  assert.equal(count(html, /<button type="button" class="tile /g), 3);
  assert.equal(count(html, /class="tile is-locked"/g), GIFT_COUNT - 3);
  assert.match(html, /class="tile is-common" data-tile="c01" data-tier="common" data-line="오늘도 와줘서 고마워요!"/);
  assert.match(html, /class="tile is-special" data-tile="s02" data-tier="special" data-line="외로운 밤에도 생각하면 마음이 따뜻해져요!"/);
  assert.match(html, /class="tile is-rare" data-tile="r01" data-tier="rare" data-line="별똥별을 주웠어요! 소원 하나 빌어요!"/);
  assert.match(html, /<span class="tile is-locked" data-tile="c02" role="img" aria-label="아직 못 찾은 선물">/);
  assert.match(html, /선물 3\/30/);
  for (const gift of GIFTS.common.slice(1)) assert.doesNotMatch(html, new RegExp(gift.line.replace(/[?!.]/g, "\\$&")));
});

test("gift collection marks today's gift and reads it first", () => {
  const today = { tier: "special", gift: GIFTS.special[4] };
  const html = giftCollection(["s05"], today);
  assert.match(html, /class="tile is-special is-new" data-tile="s05"/);
  assert.match(html, /<p class="gift-reader is-special" data-gift-reader><span class="reader-label">특별한 선물<\/span><span class="reader-text">고마움이 가득가득 넘쳐요!<\/span><\/p>/);
  assert.match(giftCollection([]), /아직 찾은 선물이 없어요\./);
  assert.match(giftCollection(["c01"]), /찾은 선물을 누르면 다시 읽을 수 있어요\./);
});

test("record sheet shows only real numbers", () => {
  const pet = { level: 3, xpInto: 40, xpSpan: 150, moodAfter: 72, days: 9 };
  const full = recordSheet({ tap_count: 41 }, pet);
  assert.match(full, /<p class="record-hero">함께한 지 9일<\/p>/);
  assert.match(full, /<dt>토닥인 횟수<\/dt><dd>41번<\/dd>/);
  assert.match(full, /<dt>레벨<\/dt><dd>Lv\. 3<\/dd>/);
  assert.match(full, /<dt>다음 레벨까지<\/dt><dd>110 XP<\/dd>/);
  assert.match(full, /aria-label="기분 8단계"/);
  const bare = recordSheet({ tap_count: 2, days_together: 4 });
  assert.match(bare, /함께한 지 4일/);
  assert.match(bare, /2번/);
  assert.doesNotMatch(bare, /Lv\.|XP|기분/);
});

test("rewarded owner home carries the dock, both sheets and the found gift", async (t) => {
  const { request, jar } = await named(t);
  const home = await request(`/t?uid=${A}`, { jar });
  assert.match(home.html, /data-rewarded="1"/);
  assert.match(home.html, /<button type="button" class="dock-btn is-verb" data-care="feed">.*밥<\/span><\/button>/);
  assert.match(home.html, /class="dock-btn is-side has-new" data-open="arcade" aria-haspopup="dialog">.*오락실<\/span>/);
  assert.match(home.html, /<button type="button" class="dock-btn is-side has-new" data-farm>.*텃밭<\/span><\/button>/);
  for (const id of ["arcade", "gifts", "record"]) {
    assert.match(home.html, new RegExp(`<div class="sheet" data-sheet="${id}" role="dialog" aria-modal="true" aria-labelledby="sheet-${id}-title" hidden>`));
    assert.match(home.html, new RegExp(`<h2 id="sheet-${id}-title">`));
  }
  assert.equal(count(home.html, /data-tile="/g), GIFT_COUNT);
  assert.match(home.html, /class="tile is-common is-new" data-tile="c01" data-tier="common" data-line="오늘도 와줘서 고마워요!"/);
  assert.match(home.html, /선물 1\/30/);
  assert.match(home.html, /<button type="button" class="level-pin" data-open="record" aria-haspopup="dialog" aria-label="우리 기록, Lv\. 1">Lv\. 1<\/button>/);
  assert.match(home.html, /함께한 지 1일/);
  assert.match(home.html, /<dt>다음 레벨까지<\/dt><dd>\d+ XP<\/dd>/);
  assert.match(home.html, /class="xp-fill" data-xp="\d+"/);
});

test("unrewarded tap keeps the collection from the database without a new mark", async (t) => {
  const { request, jar } = await named(t);
  await request(`/t?uid=${A}`, { jar });
  const cool = await request(`/t?uid=${A}`, { jar });
  assert.match(cool.html, /data-reason="cooldown"/);
  assert.match(cool.html, /class="tile is-common" data-tile="c01"/);
  assert.doesNotMatch(cool.html, /is-new|g-gifts has-new|reader-label/);
  assert.match(cool.html, /선물 1\/30/);
});

test("post-naming page is the full home with read-only stats and the first tap only", async (t) => {
  const { skip } = await named(t);
  assert.match(skip.html, /data-care="feed"/);
  assert.match(skip.html, /data-sheet="gifts"/);
  assert.match(skip.html, /선물 0\/30/);
  assert.match(skip.html, /함께한 지 1일/);
  assert.match(skip.html, /<p class="count" data-tap-count="1">/);
  assert.match(skip.html, /<dt>토닥인 횟수<\/dt><dd>1번<\/dd>/);
  assert.match(skip.html, /<section class="pet-stats"[\s\S]*class="hearts"[\s\S]*class="xp-fill" data-xp="\d+"/);
  assert.match(skip.html, /<button type="button" class="level-pin" data-open="record"[^>]*>Lv\. 1<\/button>/);
  assert.match(skip.html, /<dt>레벨<\/dt><dd>Lv\. 1<\/dd>/);
  assert.match(skip.html, /<dt>다음 레벨까지<\/dt><dd>\d+ XP<\/dd>/);
  assert.match(skip.html, /<dt>기분<\/dt>/);
  assert.match(skip.html, /만나서 반가워요, Mochi!/);
  assert.match(skip.html, /data-rewarded="0"/);
  assert.doesNotMatch(skip.html, /data-hearts-animate|g-gifts has-new|is-new|<p class="gift |class="pet-line/);
});

test("first meet has the live nameplate and key card hooks but no dock", async (t) => {
  const { first } = await named(t);
  assert.match(first.html, /<h1 class="nameplate is-placeholder" data-nameplate data-placeholder="새 친구">새 친구<\/h1>/);
  assert.match(first.html, /<input id="name" name="name" required maxlength="24"[^>]*data-name-input>/);
  assert.match(first.html, /<aside class="recovery">[\s\S]*<strong class="code">[A-Z2-9]{6}<\/strong><button type="button" class="copy" data-copy>/);
  assert.doesNotMatch(first.html, /data-care|class="dock"|data-sheet=|data-tile=/);
});

test("the owner home carries an empty 씨앗 가게 sheet for the farm to fill", async (t) => {
  const { request, jar } = await named(t);
  const home = await request(`/t?uid=${A}`, { jar });
  assert.match(home.html, /<div class="sheet" data-sheet="shop" role="dialog" aria-modal="true" aria-labelledby="sheet-shop-title" hidden>[\s\S]*?<h2 id="sheet-shop-title">씨앗 가게<\/h2>[\s\S]*?<ul class="shop-list" data-shop-list><\/ul>/);
  assert.doesNotMatch((await request(`/t?uid=${A}`)).html, /data-sheet="shop"/);
});

test("stranger page has no dock, owner sheets or collection, only the stat card", async (t) => {
  const { request } = await named(t);
  const stranger = await request(`/t?uid=${A}`);
  assert.match(stranger.html, /이미 주인이 있어요/);
  assert.doesNotMatch(stranger.html, /data-care|class="dock"|data-sheet="(?!stats")|data-tile=|level-pin|gift-tally/);
  assert.match(stranger.html, /<div class="sheet" data-sheet="stats" role="dialog"/);
});

test("the dock runs the arcade, the three care verbs, then the farm", async (t) => {
  const { request, jar } = await named(t);
  const home = await request(`/t?uid=${A}`, { jar });
  const dock = home.html.match(/<nav class="dock"[\s\S]*?<\/nav>/)[0];
  assert.match(dock, /^<nav class="dock" aria-label="메뉴" data-want="feed" data-meals="0" data-plays="0" data-care-uid="04AAAAAAAAAAA1" data-arcade-left="3" data-gi-best="0" data-combo="1">/);
  const buttons = dock.match(/<button [^>]*>/g);
  assert.deepEqual(buttons, [
    '<button type="button" class="dock-btn is-side has-new" data-open="arcade" aria-haspopup="dialog">',
    '<button type="button" class="dock-btn is-verb" data-care="feed">',
    '<button type="button" class="dock-btn is-verb" data-care="play">',
    '<button type="button" class="dock-btn is-verb" data-care="sleep">',
    '<button type="button" class="dock-btn is-side has-new" data-farm>',
  ]);
  assert.deepEqual(dock.match(/<span class="dock-label">[^<]*<\/span>/g).map((s) => s.replace(/<[^>]+>/g, "")), ["오락실", "밥", "놀이", "잠", "텃밭"]);
  assert.equal(count(dock, /<svg viewBox="0 0 24 24" aria-hidden="true">/g), 5);
  assert.doesNotMatch(home.html, /data-dock-pat|토닥<\/span>/);
  const preview = await request("/dev/preview?kind=gift&count=10");
  assert.match(preview.html, /data-care="feed"/);
  assert.doesNotMatch(preview.html, /data-care-uid/);
  assert.match(preview.html, /<nav class="dock"[^>]* data-combo="0">/);
  assert.match(preview.html, /<button type="button" class="dock-btn is-side" data-farm>/);
});

test("the level pin opens 우리 기록 and the dock keeps no record button", async (t) => {
  const { request, jar } = await named(t);
  const home = await request(`/t?uid=${A}`, { jar });
  assert.match(home.html, /<span class="topbar-end"><button type="button" class="theme-btn"[^>]*>[\s\S]*?<\/button><button type="button" class="level-pin" data-open="record" aria-haspopup="dialog" aria-label="우리 기록, Lv\. 1">Lv\. 1<\/button><\/span>/);
  assert.match(home.html, /<div class="sheet" data-sheet="record" role="dialog"/);
  assert.doesNotMatch(home.html.match(/<nav class="dock"[\s\S]*?<\/nav>/)[0], /data-open="record"|우리 기록/);
});

test("the 텃밭 dot goes out once the farm is open and growing", async (t) => {
  const { request, jar } = await named(t);
  await request(`/t?uid=${A}`, { jar });
  assert.equal((await request("/farm", { jar, body: { uid: A, act: "open" } })).status, 200);
  const home = await request(`/t?uid=${A}`, { jar });
  assert.match(home.html, /<button type="button" class="dock-btn is-side" data-farm>/);
  assert.match(home.html, /<body class="is-home" data-farm-dot="0"/);
});

for (const kind of ["horse", "sheep"]) {
  test(`the ${kind} pet carries every face frame`, async (t) => {
    const { request, jar } = await named(t);
    assert.equal((await request("/kind", { jar, body: { uid: A, kind } })).status, 200);
    const home = await request(`/t?uid=${A}`, { jar: { ...jar, mascot: kind } });
    const frames = home.html.match(/<img class="pet-frame[^>]*>/g);
    const srcOf = (img) => img.match(/ src="([^"]+)"/)[1];
    assert.deepEqual(frames.map((img) => [img.match(/data-frame="(\w+)"/)[1], srcOf(img)]), [
      ["canon", `/mascot-${kind}-512-v3.png`],
      ["blink", `/mascot-${kind}-closed-512.webp`],
      ["react", `/mascot-${kind}-happy-512.webp`],
      ["sleepy", `/mascot-${kind}-512-v3.png`],
      ["munch", `/mascot-${kind}-munch-512.webp`],
      ["yawn", `/mascot-${kind}-yawn-512.webp`],
      ["away", `/mascot-${kind}-away-512-v3.png`],
    ]);
    assert.doesNotMatch(frames[0], /fetchpriority/);
    for (const img of frames.slice(1)) assert.match(img, / fetchpriority="low" /);
  });
}

test("fonts are pinned and only the font CDN is allowed beyond self", async (t) => {
  const { request } = await setup(t);
  const page = await request(`/t?uid=${A}`);
  assert.match(page.html, /https:\/\/cdn\.jsdelivr\.net\/npm\/pretendard@1\.3\.9\//);
  const css = readFileSync(new URL("../public/style.css", import.meta.url), "utf8");
  assert.match(css, /https:\/\/cdn\.jsdelivr\.net\/npm\/galmuri@2\.40\.3\/dist\/Galmuri11\.woff2/);
  assert.match(css, /font-display:\s*swap/);
  const csp = page.headers.get("content-security-policy");
  assert.match(csp, /font-src 'self' https:\/\/cdn\.jsdelivr\.net;/);
  assert.match(csp, /script-src 'self';/);
});

test("the font CDN stylesheet never blocks first paint", async (t) => {
  const { request } = await setup(t);
  const page = await request(`/t?uid=${A}`);
  const head = page.html.split("</head>")[0].replace(/<noscript>[\s\S]*?<\/noscript>/g, "");
  assert.doesNotMatch(head, /<link rel="stylesheet" href="https:/);
  const boot = readFileSync(new URL("../public/mascot-boot.js", import.meta.url), "utf8");
  assert.match(boot, /https:\/\/cdn\.jsdelivr\.net\/npm\/pretendard@1\.3\.9\//);
});
