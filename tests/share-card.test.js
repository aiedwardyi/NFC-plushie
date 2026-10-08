import assert from "node:assert/strict";
import test from "node:test";
import { CARD, artSize, barFill, cardFileName, cardLayout, fitText, seoulDate } from "../public/share-card.js";
import { parseStats, statSheet } from "../src/stats.js";

const WORLDS = ["classic", "8bit", "milk", "najeon"];
const horse = (edition, stats = {}) => statSheet(parseStats(JSON.stringify(stats)), "horse", edition);

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
