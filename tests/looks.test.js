import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
import { fakeUids } from "../src/pages.js";

const [A, B, C] = fakeUids;
const T0 = Date.parse("2026-05-01T10:00:00+09:00");
const client = readFileSync(new URL("../public/app.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const styles = Object.fromEntries(["style.css", "themes/8bit.css", "themes/milk.css", "themes/najeon.css"].map((f) => [f, readFileSync(new URL(`../public/${f}`, import.meta.url), "utf8")]));
const LEDES = {
  classic: "포근 클래식 친구예요. 금실 레어와 별밤 레전더리 인형은 이렇게 빛나요.",
  rare: "금실 레어 친구예요. 어떤 창틀로 보여줄까요?",
  legendary: "별밤 레전더리 친구예요. 어떤 창틀로 보여줄까요?",
};

function updateJar(jar, setCookies) {
  for (const sc of setCookies || []) {
    const m = /^([^=]+)=([^;]*)/.exec(sc);
    if (!m) continue;
    if (m[2].trim() === "" || /Expires=Thu, 01 Jan 1970/i.test(sc)) delete jar[m[1].trim()];
    else jar[m[1].trim()] = m[2].trim();
  }
}

// A: 금실 레어, B: 별밤 레전더리, C: 포근 클래식.
async function setup(t) {
  const dir = mkdtempSync(join(process.cwd(), ".test-data-"));
  const db = openDatabase(dir);
  const server = createApp({ db, now: () => T0, rng: () => 0, demoUids: [], rareUids: [A], legendaryUids: [B] }).listen(0, "localhost");
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
  async function name(uid, petName, cookies = {}) {
    const jar = { ...cookies };
    await request(`/t?uid=${uid}`, { jar });
    await request("/name", { jar, body: { uid, name: petName } });
    return { jar, named: await request(`/t?uid=${uid}`, { jar }) };
  }
  return { request, name };
}

const tagOf = (html) => html.match(/<html [^>]*>/)[0];
const tag = (attrs = "") => `<html lang="ko" data-mascot="horse"${attrs}>`;
const tiles = (html) => [...html.matchAll(/<button type="button" class="theme-card look-card( is-locked)?" data-look="(\w+)" aria-pressed="(true|false)"( aria-disabled="true")? aria-label="([^"]+)">([\s\S]*?)<\/button>/g)]
  .map(([, locked, look, pressed, disabled, label, inner]) => ({ look, locked: Boolean(locked), pressed: pressed === "true", disabled: Boolean(disabled), label, inner }));

test("a worn look is capped at the plushie's edition: a lower look cookie is worn, a higher or unknown one is not", async (t) => {
  const ctx = await setup(t);
  const want = {
    [C]: { none: "", classic: "", rare: "", legendary: "", gold: "" },
    [A]: { none: ' data-edition="rare" data-look="rare"', classic: ' data-edition="rare"', rare: ' data-edition="rare" data-look="rare"', legendary: ' data-edition="rare" data-look="rare"', gold: ' data-edition="rare" data-look="rare"' },
    [B]: { none: ' data-edition="legendary" data-look="legendary"', classic: ' data-edition="legendary"', rare: ' data-edition="legendary" data-look="rare"', legendary: ' data-edition="legendary" data-look="legendary"', gold: ' data-edition="legendary" data-look="legendary"' },
  };
  for (const uid of [A, B, C]) {
    const { jar } = await ctx.name(uid, "보리");
    for (const [cookie, attrs] of Object.entries(want[uid])) {
      const worn = cookie === "none" ? jar : { ...jar, look: cookie };
      // A phone's reload and a plushie tap both read the cookie.
      for (const path of [`/t?uid=${uid}&view=1`, `/t?uid=${uid}`]) {
        assert.equal(tagOf(await ctx.request(path, { jar: { ...worn } })), tag(attrs), `${uid} look=${cookie} ${path}`);
      }
    }
  }
});

test("the naming page reveals the plushie's own edition and a stranger sees it too, whatever the look cookie says", async (t) => {
  const ctx = await setup(t);
  const { jar, named } = await ctx.name(B, "보리", { look: "classic" });
  assert.equal(tagOf(named), tag(' data-edition-reveal="legendary"'));
  // Its 꾸미기 has only the worlds; the frames and the cookie come with the next load.
  assert.match(named, /data-sheet="theme"/);
  assert.doesNotMatch(named, /data-look|theme-sub|look-card/);
  const next = await ctx.request(`/t?uid=${B}&view=1`, { jar });
  assert.equal(tagOf(next), tag(' data-edition="legendary"'));
  assert.equal(tiles(next).length, 3);
  for (const look of ["classic", "rare"]) {
    const stranger = await ctx.request(`/t?uid=${B}`, { jar: { look } });
    assert.equal(tagOf(stranger), tag(' data-edition="legendary" data-look="legendary"'), `stranger look=${look}`);
    assert.doesNotMatch(stranger, /data-look-grid|look-card/);
  }
});

test("꾸미기 offers every frame up to the plushie's edition and shows the ones above as a locked showcase", async (t) => {
  const ctx = await setup(t);
  const jars = {};
  for (const [uid, own, open] of [[C, "classic", ["classic"]], [A, "rare", ["classic", "rare"]], [B, "legendary", ["classic", "rare", "legendary"]]]) {
    const { jar } = await ctx.name(uid, "보리<&>");
    jars[own] = jar;
    const home = await ctx.request(`/t?uid=${uid}&view=1`, { jar });
    assert.match(home, /<ul class="theme-grid">[\s\S]*?<\/ul>\n      <h3 class="theme-sub">창틀과 이름<\/h3>/, own);
    assert.match(home, new RegExp(`<p class="theme-lede" data-look-lede>${LEDES[own].replace(/[.?]/g, "\\$&")}</p>\\n      <ul class="theme-grid look-grid" data-look-grid>`), own);
    const row = tiles(home);
    assert.deepEqual(row.map((r) => r.look), ["classic", "rare", "legendary"], own);
    assert.deepEqual(row.filter((r) => !r.locked).map((r) => r.look), open, own);
    assert.deepEqual(row.filter((r) => r.pressed).map((r) => r.look), [own], own);
    for (const r of row) {
      const title = { classic: "포근 클래식", rare: "금실 레어", legendary: "별밤 레전더리" }[r.look];
      // Locked tiles keep their full preview; only the chip and the note mark them.
      assert.match(r.inner, /^<span class="look-mini" aria-hidden="true"><b class="look-name">보리&lt;&amp;&gt;<\/b><i class="look-frame"><\/i><\/span><span class="look-title">/, `${own} ${r.look}`);
      assert.equal(r.disabled, r.locked, `${own} ${r.look}`);
      if (r.locked) {
        assert.equal(r.label, `${title} 창틀, ${title} 인형이 열쇠예요`);
        assert.match(r.inner, new RegExp(`<small class="look-note">${title} 인형이 열쇠예요</small>$`));
      } else {
        assert.equal(r.label, `${title} 창틀`);
        assert.doesNotMatch(r.inner, /look-note/);
      }
    }
    assert.doesNotMatch(home, /구매|상점|가격|한정|https?:\/\/[^"]*shop/);
  }
  // A worn look is the pressed tile; the plushie's edition still decides the locks.
  for (const look of ["classic", "rare"]) {
    const row = tiles(await ctx.request(`/t?uid=${B}&view=1`, { jar: { ...jars.legendary, look } }));
    assert.deepEqual([row.filter((r) => r.pressed).map((r) => r.look), row.filter((r) => r.locked).length], [[look], 0], look);
  }
});

test("the stat card, its pill and the share card stay on the edition while the frame, the name and the sparkles wear the look", async (t) => {
  const ctx = await setup(t);
  const { jar } = await ctx.name(B, "보리");
  const home = await ctx.request(`/t?uid=${B}&view=1`, { jar: { ...jar, look: "classic" } });
  assert.equal(tagOf(home), tag(' data-edition="legendary"'));
  assert.match(home, /<span class="st-edition"><span>별밤 레전더리<\/span><\/span>/);
  assert.match(home, /<button type="button" class="st-share" data-share-card/);
  for (const [file, css] of Object.entries(styles)) {
    const rules = [...css.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim()).filter((s) => /data-(edition|look)/.test(s));
    for (const sel of rules.filter((s) => /\.st-|\.share-/.test(s))) assert.doesNotMatch(sel, /data-look/, `${file}: ${sel}`);
    for (const sel of rules.filter((s) => /\.finish|\.nameplate|\.sparkle/.test(s))) assert.doesNotMatch(sel, /data-edition(?!-reveal)/, `${file}: ${sel}`);
    assert.ok(rules.every((s) => !/\.st-/.test(s) || /data-edition/.test(s)), file);
  }
  assert.ok(Object.values(styles).some((css) => /html\[data-look="legendary"\] \.finish/.test(css)));
  // The certificate's buzz follows the plushie; the shooting tap star follows the look.
  assert.match(client, /STAT_BUZZ\[root\.dataset\.edition\]/);
  assert.match(client, /if \(document\.documentElement\.dataset\.look !== "legendary"\) return;/);
});

// One top-level function of the page script, run on its own.
function lift(name, ...deps) {
  const src = client.match(new RegExp(`\\nfunction ${name}\\([\\s\\S]*?\\n\\}`))?.[0];
  assert.ok(src, `${name} is in app.js`);
  return new Function(...deps, `${src}\nreturn ${name};`);
}

test("the naming reveal puts the plushie's own look on with its edition", () => {
  for (const still of [false, true]) {
    const root = { dataset: { editionReveal: "legendary" }, classList: { add() {}, remove() {} } };
    let synced = 0;
    const reveal = lift("revealEdition", "document", "prefersReducedMotion", "tryVibrate", "STAT_BUZZ", "syncLooks", "window")(
      { documentElement: root }, () => still, () => {}, { legendary: [10] }, () => synced++, { setTimeout() {} },
    );
    reveal();
    assert.deepEqual([root.dataset, synced], [{ edition: "legendary", look: "legendary" }, 1], `still ${still}`);
  }
});

// The 꾸미기 block on a stub page: its 창틀과 이름 tiles, the cookie it writes and the lines it says.
function pickerPage({ edition = "", look = "", theme = "" } = {}) {
  const block = client.match(/\nlet syncLooks = \(\) => \{\};\nconst themeSheet = [\s\S]*?\n\}\n/)?.[0];
  assert.ok(block, "the 꾸미기 block is in app.js");
  const classes = () => {
    const set = new Set();
    return { add: (n) => set.add(n), remove: (n) => set.delete(n), contains: (n) => set.has(n), toggle: (n, on) => (on ? set.add(n) : set.delete(n)), set };
  };
  const card = (id) => ({ dataset: { look: id }, classList: classes(), attrs: {}, offsetWidth: 0, setAttribute(k, v) { this.attrs[k] = v; } });
  const looks = ["classic", "rare", "legendary"].map(card);
  const lede = { textContent: "" };
  const said = [];
  const sounds = [];
  const cookies = [];
  let onPick = null;
  const root = { dataset: { ...(edition && { edition }), ...(look && { look }), ...(theme && { theme }) }, classList: classes(), style: { setProperty() {} } };
  const grid = (handlers) => ({ addEventListener: (type, fn) => handlers(fn) });
  const themeSheet = {
    querySelectorAll: (sel) => (sel === "[data-look]" ? looks : []),
    querySelector: (sel) => (sel === "[data-look-lede]" ? lede : sel === "[data-look-grid]" ? grid((fn) => { onPick = fn; }) : sel === ".theme-grid" ? grid(() => {}) : null),
  };
  const sandbox = {
    document: {
      documentElement: root,
      set cookie(v) { cookies.push(v); },
      get cookie() { return ""; },
      querySelector: (sel) => (sel === '[data-sheet="theme"]' ? themeSheet : sel === "[data-window]" ? { appendChild() {} } : null),
      createElement: () => ({ classList: classes(), remove() {}, set textContent(v) { said.push(v); } }),
    },
    window: { setTimeout: (fn) => fn(), clearTimeout() {} },
    prefersReducedMotion: () => true,
    playSfx: (name) => sounds.push(name),
    tryVibrate: () => sounds.push("buzz"),
    careHold: { asleep: false },
  };
  runInNewContext(`${block}\nglobalThis.syncNow = () => syncLooks();`, sandbox);
  const tap = (id) => onPick({ target: { closest: () => looks.find((c) => c.dataset.look === id) } });
  const state = () => ({
    look: root.dataset.look || "classic",
    pressed: looks.filter((c) => c.attrs["aria-pressed"] === "true").map((c) => c.dataset.look),
    locked: looks.filter((c) => c.classList.contains("is-locked")).map((c) => c.dataset.look),
    disabled: looks.filter((c) => c.attrs["aria-disabled"] === "true").map((c) => c.dataset.look),
    lede: lede.textContent,
  });
  return { root, looks, said, sounds, cookies, tap, state, sync: () => sandbox.syncNow() };
}

test("picking a frame wears it, keeps the world and stores it like the world: own edition clears the cookie", () => {
  const p = pickerPage({ edition: "legendary", look: "legendary", theme: "najeon" });
  p.tap("classic");
  assert.deepEqual(p.cookies, [`look=classic;path=/;max-age=${400 * 24 * 60 * 60};samesite=lax`]);
  assert.deepEqual(p.state(), { look: "classic", pressed: ["classic"], locked: [], disabled: [], lede: LEDES.legendary });
  assert.deepEqual([p.root.dataset.theme, p.said.at(-1), p.sounds], ["najeon", "포근하게 돌아왔어요!", ["care-soft-press", "buzz"]]);
  p.tap("rare");
  assert.deepEqual([p.cookies.at(-1), p.state().look, p.said.at(-1)], [`look=rare;path=/;max-age=${400 * 24 * 60 * 60};samesite=lax`, "rare", "금실이 반짝반짝해요!"]);
  p.tap("legendary");
  assert.deepEqual([p.cookies.at(-1), p.root.dataset.look, p.said.at(-1)], ["look=;path=/;max-age=0;samesite=lax", "legendary", "별밤처럼 빛나요!"]);
  // The frame already worn does nothing.
  const before = [p.cookies.length, p.said.length];
  p.tap("legendary");
  assert.deepEqual([p.cookies.length, p.said.length], before);
  const px = pickerPage({ edition: "rare", look: "rare", theme: "8bit" });
  px.tap("classic");
  assert.deepEqual(px.sounds, ["care-chip-press", "buzz"]);
});

test("a locked frame stays a showcase: the tile shakes, the pet names its plushie, and nothing is worn or stored", () => {
  for (const [edition, id, line] of [["", "rare", "금실 레어 인형이 열쇠예요!"], ["", "legendary", "별밤 레전더리 인형이 열쇠예요!"], ["rare", "legendary", "별밤 레전더리 인형이 열쇠예요!"]]) {
    const p = pickerPage({ edition, look: edition });
    p.tap(id);
    const tile = p.looks.find((c) => c.dataset.look === id);
    assert.deepEqual([p.cookies, p.root.dataset.look, p.said, tile.classList.contains("is-shake"), p.root.classList.contains("is-look-on")], [[], edition || undefined, [line], true, false], `${edition || "classic"} taps ${id}`);
  }
});

test("the tiles follow the plushie's edition when the admin or the naming changes it", () => {
  const p = pickerPage();
  p.sync();
  assert.deepEqual(p.state(), { look: "classic", pressed: ["classic"], locked: ["rare", "legendary"], disabled: ["rare", "legendary"], lede: LEDES.classic });
  p.root.dataset.edition = "rare";
  p.root.dataset.look = "rare";
  p.sync();
  assert.deepEqual(p.state(), { look: "rare", pressed: ["rare"], locked: ["legendary"], disabled: ["legendary"], lede: LEDES.rare });
  assert.deepEqual(p.looks.map((c) => c.attrs["aria-disabled"]), ["false", "false", "true"]);
});
