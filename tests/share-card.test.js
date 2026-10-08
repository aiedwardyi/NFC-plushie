import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CARD, artSize, barFill, cardFileName, cardLayout, fitText, paintCard, readCard, seoulDate } from "../public/share-card.js";
import { parseStats, statSheet } from "../src/stats.js";

const WORLDS = ["classic", "8bit", "milk", "najeon"];
const horse = (edition, stats = {}) => statSheet(parseStats(JSON.stringify(stats)), "horse", edition);
const milk = readFileSync(new URL("../public/themes/milk.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");

// A gradient as the theme writes it, its vars read from the same file: [[offset, color], ...].
function cssStops(rule) {
  const vars = Object.fromEntries([...milk.matchAll(/--([\w-]+): (#[0-9a-f]{6});/gi)].map((m) => [m[1], m[2].toLowerCase()]));
  const parts = rule.match(/linear-gradient\(180deg, (.+)\)/)[1].split(/, (?![^(]*\))/);
  return parts.map((part, i) => {
    const [, color, at] = part.match(/^(var\(--[\w-]+\)|#[0-9a-f]{6})(?: ([\d.]+)%)?$/i);
    return [at ? Number(at) / 100 : i ? 1 : 0, (color.startsWith("var") ? vars[color.slice(6, -1)] : color).toLowerCase()];
  });
}

// Paints a card on a context that keeps only its colours: every gradient's stops and every flat fill.
function painted(world, edition) {
  const gradients = [];
  const fills = new Set();
  const context = () => new Proxy({}, {
    get(state, key) {
      if (key in state) return state[key];
      if (key === "measureText") return (text) => ({ width: String(text).length * 40, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 18 });
      if (key === "createImageData" || key === "getImageData") return (...size) => ({ data: new Uint8ClampedArray(size.at(-2) * size.at(-1) * 4) });
      if (key === "createLinearGradient" || key === "createRadialGradient") {
        return () => {
          const stops = [];
          gradients.push(stops);
          return { addColorStop: (at, color) => stops.push([Math.round(at * 1000) / 1000, String(color).toLowerCase()]) };
        };
      }
      return () => ({});
    },
    set(state, key, value) {
      state[key] = value;
      if (key === "fillStyle" && typeof value === "string") fills.add(value.toLowerCase());
      return true;
    },
  });
  const make = (width, height) => ({ width, height, getContext: context });
  paintCard(context(), { world, edition, kind: "horse", name: "모찌", animal: "말", level: 3, days: 2, seal: "별밤 레전더리", stats: [], date: "2026.10.08" }, null, make);
  return { gradients, fills };
}

test("a short name keeps 88px; a long one shrinks to the biggest size that fits", () => {
  const room = 760;
  const wide = (chars) => (px) => chars * px * 0.92;
  assert.equal(fitText(wide(4), room, 88), 88);
  for (const chars of [10, 13, 17, 24]) {
    const size = fitText(wide(chars), room, 88);
    assert.ok(size < 88 && wide(chars)(size) <= room, `${chars} chars at ${size}px`);
    assert.ok(wide(chars)(size + 1) > room, `${chars} chars could be ${size + 1}px`);
  }
});

test("a name that measures wider than it scales still never clips", () => {
  const lumpy = (px) => 24 * px * 0.92 + 40;
  const size = fitText(lumpy, 760, 88);
  assert.ok(lumpy(size) <= 760);
  assert.ok(lumpy(size + 1) > 760);
});

test("a stat bar fills like the app's: base, edition and training over 120, never the boost", () => {
  assert.deepEqual(barFill(horse("classic").agi, "classic"), { fill: 443, gold: 0, fade: 0 });
  assert.equal(barFill(horse("classic", { trained: { agi: 12 } }).agi, "classic").fill, 519);
  const full = horse("legendary", { trained: { agi: 30 }, boost: { agi: 20 } }).agi;
  assert.equal(full.total, 140);
  assert.equal(barFill(full, "legendary").fill, CARD.bar.w);
});

test("only rare and legendary bars carry gold, riding the tip with a soft crossfade", () => {
  for (const [edition, gold] of [["classic", 0], ["rare", 63], ["legendary", 127]]) {
    const bar = barFill(horse(edition).str, edition);
    assert.equal(bar.gold, gold, edition);
    if (!gold) {
      assert.equal(bar.fade, 0);
      continue;
    }
    assert.ok(bar.fade > 0 && bar.fade <= gold, `${edition} fades over ${bar.fade}px`);
    assert.ok(bar.fill - bar.gold - bar.fade / 2 > 0, `${edition} starts in the stat colour`);
  }
  assert.equal(barFill({ base: 50, plus: 10, trained: 0 }, "classic").gold, 0);
});

test("the card wears the edition the page wears, the naming page's unrevealed one too", () => {
  const text = { ".st-edition": "별밤 레전더리", "[data-nameplate]": "Mochi", "[data-stat-animal]": "말", ".level-badge": "3", ".record-hero": "함께한 지 2일" };
  const page = (dataset) => ({
    documentElement: { dataset: { theme: "milk", mascot: "horse", ...dataset } },
    querySelector: (sel) => (sel in text ? { textContent: text[sel] } : null),
    querySelectorAll: () => [],
  });
  assert.equal(readCard(page({ edition: "legendary" })).edition, "legendary");
  assert.equal(readCard(page({ editionReveal: "rare" })).edition, "rare");
  for (const dataset of [{}, { edition: "gold" }]) assert.equal(readCard(page(dataset)).edition, "classic");
  const card = readCard(page({ edition: "legendary" }));
  assert.deepEqual([card.world, card.name, card.animal, card.level, card.days, card.seal], ["milk", "Mochi", "말", 3, 2, "별밤 레전더리"]);
});

test("a quick tap mid count-up still prints the pet's real totals", () => {
  const row = (stat, shown) => ({
    dataset: { stat },
    querySelector: (sel) => (sel === ".st-total" ? { textContent: shown } : sel === ".st-bar" ? { dataset: { base: "50", plus: "0", trained: "0" } } : null),
    querySelectorAll: () => [],
  });
  const page = (stats) => ({
    documentElement: { dataset: { theme: "classic", mascot: "horse" } },
    querySelector: (sel) => (sel === ".pet[data-stats]" && stats !== null ? { dataset: { stats } } : null),
    querySelectorAll: (sel) => (sel === ".st-row[data-stat]" ? [row("str", "0"), row("agi", "37")] : []),
  });
  const totals = (stats) => readCard(page(stats)).stats.map((s) => s.total);
  assert.deepEqual(totals(JSON.stringify({ str: { total: 50 }, agi: { total: 70 } })), [50, 70]);
  assert.deepEqual(totals(null), [0, 37]);
  assert.deepEqual(totals("{"), [0, 37]);
});

test("딸기우유 별밤 레전더리 wears the app's twilight: its ring inside the pink plush, gold stars, a twilight-to-gold name and no dark outline", () => {
  const ring = cssStops(milk.match(/\[data-look="legendary"\] \.finish,[^{]*\{[^}]*?(linear-gradient\(180deg[^;]+\));/)[1]);
  const name = cssStops(milk.match(/\[data-look="legendary"\] \.nameplate,[^{]*\{[^}]*(linear-gradient\(180deg[^;]+\));/)[1]);
  const star = milk.match(/\[data-look="legendary"\] \.finish,[^{]*\{[^}]*--tier-star: (#[0-9a-f]{6});/i)[1].toLowerCase();
  const card = painted("milk", "legendary");
  const has = (stops) => card.gradients.some((g) => JSON.stringify(g) === JSON.stringify(stops));
  assert.ok(has(ring), `ring ${JSON.stringify(ring)}`);
  assert.ok(has(name), `name ${JSON.stringify(name)}`);
  assert.ok(card.fills.has(star));
  assert.ok(card.fills.has(milk.match(/--straw: (#[0-9a-f]{6});/i)[1].toLowerCase()));
  // The seal is the app's twilight pill: night-2 into night-1.
  const night = (n) => milk.match(new RegExp(`--tier-night-${n}: (#[0-9a-f]{6});`, "i"))[1].toLowerCase();
  assert.ok(card.gradients.some((g) => g[0]?.[1] === night(2) && g.at(-1)?.[1] === night(1)), "twilight seal");
  // The old navy band, seal and dark name edge are gone from 딸기우유; other worlds keep their night.
  assert.ok(!card.gradients.flat().some(([, color]) => color === "#38327c" || color === "#2e2a66"));
  assert.ok(!card.fills.has("#2e2a66"));
  assert.ok(painted("classic", "legendary").gradients.flat().some(([, color]) => color === "#38327c"));
});

test("the date is the Seoul day as YYYY.MM.DD", () => {
  assert.equal(seoulDate(Date.parse("2026-10-07T14:59:59Z")), "2026.10.07");
  assert.equal(seoulDate(Date.parse("2026-10-07T15:00:00Z")), "2026.10.08");
  assert.equal(seoulDate(Date.parse("2026-12-31T15:30:00Z")), "2027.01.01");
});

test("the file is named for the pet, minus what a phone can't save", () => {
  assert.equal(cardFileName("콩이"), "콩이-pokkey-card.png");
  assert.equal(cardFileName("  별빛   모찌 "), "별빛 모찌-pokkey-card.png");
  assert.equal(cardFileName('a/b\\c:d*e?f"g<h>i|j'), "abcdefghij-pokkey-card.png");
  assert.equal(cardFileName("///"), "pokkey-card.png");
});

test("the art is never upscaled; 8비트 pixels grow by whole numbers", () => {
  assert.equal(artSize(512, 560), 512);
  assert.equal(artSize(512, 440), 440);
  assert.equal(artSize(60, 512, { pixel: true }), 480);
  assert.equal(artSize(60, 539, { pixel: true }), 480);
  assert.equal(artSize(60, 540, { pixel: true }), 540);
});

test("the card is 920x1480 on 1080x1920, its corners set by the world", () => {
  assert.deepEqual([CARD.width, CARD.height], [1080, 1920]);
  const radius = {};
  for (const world of WORLDS) {
    const { box } = cardLayout(world);
    assert.deepEqual([box.x, box.y, box.w, box.h], [80, 220, 920, 1480], world);
    radius[world] = box.r;
  }
  assert.deepEqual(radius, { classic: 72, "8bit": 0, milk: 72, najeon: 24 });
});

test("every line on the card stays inside the story safe zone", () => {
  for (const world of WORLDS) {
    const { lines } = cardLayout(world);
    assert.ok(Object.keys(lines).length >= 9, world);
    for (const [part, line] of Object.entries(lines)) {
      assert.ok(line.top >= CARD.safe.top && line.bottom <= CARD.safe.bottom, `${world} ${part} ${line.top}-${line.bottom}`);
    }
  }
});
