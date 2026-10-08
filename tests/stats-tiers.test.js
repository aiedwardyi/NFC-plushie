import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
import { fakeUids } from "../src/pages.js";
import { STAT_KEYS, parseStats, statSheet } from "../src/stats.js";

const [A, B, C] = fakeUids;
const T0 = Date.parse("2026-05-01T10:00:00+09:00");
const client = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const styles = ["../public/style.css", "../public/themes/8bit.css", "../public/themes/milk.css", "../public/themes/najeon.css"].map((f) => readFileSync(new URL(f, import.meta.url), "utf8"));

// One top-level function of the page script, run on its own.
function lift(name, ...deps) {
  const src = client.match(new RegExp(`\\nfunction ${name}\\([\\s\\S]*?\\n\\}`))?.[0];
  assert.ok(src, `${name} is in app.js`);
  return new Function(...deps, `${src}\nreturn ${name};`);
}
const stopsOf = (bar) => [...bar.stops.matchAll(/var\(--([\w-]+)\) ([\d.]+)%/g)].map((m) => [m[1], Number(m[2])]);
const sheetOf = (edition, trained = {}) => statSheet(parseStats(JSON.stringify({ trained })), "horse", edition);

function updateJar(jar, setCookies) {
  for (const sc of setCookies || []) {
    const m = /^([^=]+)=([^;]*)/.exec(sc);
    if (!m) continue;
    if (m[2].trim() === "" || /Expires=Thu, 01 Jan 1970/i.test(sc)) delete jar[m[1].trim()];
    else jar[m[1].trim()] = m[2].trim();
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
    if (jar) headers.Cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
    if (body) headers["Content-Type"] = "application/json";
    const res = await fetch(`http://localhost:${server.address().port}${path}`, { method: body ? "POST" : "GET", redirect: "manual", headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    const html = await res.text();
    if (jar) updateJar(jar, res.headers.getSetCookie());
    return html;
  }
  // Meets and names the pet; the page after the name is its naming page.
  async function name(uid, petName) {
    const jar = {};
    const meet = await request(`/t?uid=${uid}`, { jar });
    await request("/name", { jar, body: { uid, name: petName } });
    return { jar, meet, named: await request(`/t?uid=${uid}`, { jar }) };
  }
  return { request, name };
}

test("a 포근 클래식 bar is base into its light, and training glows at the tip, never gold", () => {
  const statBar = lift("statBar")();
  const sheet = sheetOf("classic", { int: 3 });
  const plain = statBar(sheet.str);
  assert.deepEqual(stopsOf(plain), [["st", 0], ["st-light", 100]]);
  assert.equal(plain.fill, 50 / 120);
  const grown = statBar(sheet.int);
  assert.deepEqual([grown.base, grown.seam], [93, 100]);
  assert.deepEqual(stopsOf(grown), [["st", 0], ["st-light", 89], ["st-hi", 97], ["st-hi", 100]]);
  for (const k of STAT_KEYS) {
    assert.doesNotMatch(statBar(sheet[k]).stops, /gold/, k);
    assert.equal(statBar(sheet[k]).cells.gold, 0, k);
  }
});

test("the edition's gold rides the tip, after the base and the training", () => {
  const statBar = lift("statBar")();
  const sheet = sheetOf("legendary", { int: 3, agi: 12 });
  const agi = statBar(sheet.agi);
  assert.equal(agi.fill, 102 / 120);
  assert.deepEqual([agi.base, agi.seam], [68.6, 80.4]);
  assert.deepEqual(stopsOf(agi), [["st", 0], ["st-light", 64.6], ["st-hi", 72.6], ["st-hi", 80.4], ["tier-gold-2", 84.4], ["tier-gold-1", 91.2], ["tier-gold-3", 100]]);
  // One trained point is a glint between the stat and its gold, not a part of its own.
  assert.deepEqual(stopsOf(statBar(sheet.int)), [["st", 0], ["st-light", 59.5], ["st-hi", 68.3], ["tier-gold-2", 72.3], ["tier-gold-1", 85.7], ["tier-gold-3", 100]]);
  assert.deepEqual(stopsOf(statBar(sheetOf("rare").str)), [["st", 0], ["st-light", 79.3], ["st-hi", 83.3], ["tier-gold-2", 87.3], ["tier-gold-1", 92.5], ["tier-gold-3", 100]]);
  for (const k of STAT_KEYS) {
    const at = stopsOf(statBar(sheet[k])).map(([, p]) => p);
    assert.deepEqual(at, [...at].sort((a, b) => a - b), k);
    assert.equal(at.at(-1), 100, k);
  }
});

test("8비트 lights the edition's gold in whole cells, never fewer than one", () => {
  const statBar = lift("statBar")();
  assert.deepEqual(statBar(sheetOf("legendary").str).cells, { base: 7, grown: 0, gold: 3 });
  assert.deepEqual(statBar(sheetOf("rare", { agi: 12 }).agi).cells, { base: 10, grown: 2, gold: 2 });
  assert.deepEqual(statBar({ base: 70, plus: 20, trained: 30 }).cells, { base: 10, grown: 5, gold: 3 });
  assert.deepEqual(statBar({ base: 30, plus: 1, trained: 0 }).cells, { base: 4, grown: 0, gold: 1 });
  assert.deepEqual(statBar(sheetOf("classic", { cha: 1 }).cha).cells, { base: 9, grown: 0, gold: 0 });
  // The old bar gave every part but the base 0 width in this world.
  assert.doesNotMatch(client, /segmented \?/);
});

test("the trained part is the stat's own highlight, never a green stripe", () => {
  for (const css of styles) assert.equal(css.match(/\.st-trained|#8fd18a|#b7e5a8|#8fd6c0/i)?.[0], undefined);
  assert.match(styles[0], /--st-hi: color-mix\(in srgb, var\(--st-light\) 72%, #fff\);/);
});

test("a 금실 레어 or 별밤 레전더리 page wears its edition from its naming on; 포근 클래식 wears none", async (t) => {
  const ctx = await setup(t, { rareUids: [A], legendaryUids: [B] });
  for (const [uid, edition] of [[A, "rare"], [B, "legendary"], [C, "classic"]]) {
    const { jar, meet } = await ctx.name(uid, "Mochi");
    assert.doesNotMatch(meet, /data-edition(-reveal)?="/, `${edition} before naming`);
    const home = await ctx.request(`/t?uid=${uid}&view=1`, { jar });
    const stranger = await ctx.request(`/t?uid=${uid}`);
    for (const html of [home, stranger]) {
      const tag = html.match(/<html [^>]*>/)[0];
      if (edition === "classic") assert.equal(tag, '<html lang="ko" data-mascot="horse">');
      else assert.equal(tag, `<html lang="ko" data-mascot="horse" data-edition="${edition}" data-look="${edition}">`);
    }
    assert.match(home, /<button type="button" class="st-share" data-share-card aria-label="카드로 자랑하기">/);
    assert.doesNotMatch(stranger, /data-share-card/);
  }
});

test("only a 금실 레어 or 별밤 레전더리 naming says its edition and saves the finish for that line", async (t) => {
  const ctx = await setup(t, { rareUids: [A], legendaryUids: [B] });
  for (const [uid, edition, line] of [[A, "rare", "이 친구는 금실 레어예요!"], [B, "legendary", "이 친구는 별밤 레전더리예요!"], [C, "classic", null]]) {
    const { jar, named } = await ctx.name(uid, "Mochi");
    assert.match(named, /data-celebrate="named"/);
    const tag = named.match(/<html [^>]*>/)[0];
    const said = named.match(/<p class="pet-line is-edition">([^<]+)<\/p>/)?.[1] || null;
    assert.equal(said, line, edition);
    assert.equal(tag, line ? `<html lang="ko" data-mascot="horse" data-edition-reveal="${edition}">` : '<html lang="ko" data-mascot="horse">');
    const later = await ctx.request(`/t?uid=${uid}&view=1`, { jar });
    assert.doesNotMatch(later, /is-edition|data-edition-reveal/, `${edition} later`);
  }
});

test("the admin picker's reply dresses the page and repaints the bars", () => {
  const painted = [];
  const pill = { textContent: "포근 클래식" };
  let naming = false;
  const document = {
    documentElement: { dataset: { editionReveal: "rare" } },
    querySelector: (sel) => (sel === "[data-name-input]" ? (naming ? {} : null) : sel === ".st-edition > span" ? pill : null),
  };
  let synced = 0;
  const showEdition = lift("showEdition", "document", "paintStats", "syncLooks")(document, (sheet) => painted.push(sheet), () => synced++);
  const root = document.documentElement;
  const sheet = sheetOf("legendary");
  showEdition("legendary", "별밤 레전더리", sheet);
  assert.deepEqual([root.dataset, pill.textContent, painted, synced], [{ edition: "legendary", look: "legendary" }, "별밤 레전더리", [sheet], 1]);
  showEdition("classic", "포근 클래식", sheetOf("classic"));
  assert.deepEqual([root.dataset, pill.textContent, painted.length, synced], [{}, "포근 클래식", 2, 2]);
  // Before naming the finish waits for the naming; the card still repaints.
  naming = true;
  showEdition("rare", "금실 레어", sheetOf("rare"));
  assert.deepEqual([root.dataset, pill.textContent, painted.length, synced], [{}, "금실 레어", 3, 2]);
});
