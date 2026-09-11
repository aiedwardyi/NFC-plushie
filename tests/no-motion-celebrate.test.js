import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = () => readFileSync(new URL("../public/app.js", import.meta.url), "utf-8");
const css = () => readFileSync(new URL("../public/style.css", import.meta.url), "utf-8");

test("reduced-motion claim uses a still-frame celebration, not an empty early return", () => {
  const src = client();
  assert.match(src, /function showStillCelebrate/);
  const claim = src.match(/if \(kind === "claim"\) \{[\s\S]*?\n  \}/);
  assert.ok(claim);
  assert.match(claim[0], /showStillCelebrate\(\s*["']claim["']\s*\)/);
  assert.match(claim[0], /prefersReducedMotion/);
  assert.match(src, /showStillCelebrate\(\s*["']claim["']\s*\)/);
});

test("reduced-motion milestone and levelup use still-frame celebrates", () => {
  const src = client();
  const mile = src.match(/if \(kind === "milestone"\) \{[\s\S]*?\n  \}/);
  const level = src.match(/if \(kind === "levelup"\) \{[\s\S]*?\n  \}/);
  assert.ok(mile && level);
  assert.match(mile[0], /showStillCelebrate\(\s*["']milestone["']\s*\)/);
  assert.match(level[0], /showStillCelebrate\(\s*["']levelup["']\s*\)/);
});

test("still-frame celebrate styles: gold wash, sparkles, hold, opacity fade; claim bigger", () => {
  const styles = css();
  assert.match(styles, /\.is-still-celebrate/);
  assert.match(styles, /\.is-still-claim/);
  assert.match(styles, /still-sparkle|still-wash|is-still-gold/);
  assert.match(styles, /opacity/);
  assert.match(styles, /is-still-claim[\s\S]{0,800}0\.\d+/);
});

test("still celebrate responds to prefers-reduced-motion MediaQueryList changes", () => {
  const src = client();
  assert.match(src, /matchMedia\(\s*"\(prefers-reduced-motion: reduce\)"\s*\)/);
  assert.match(src, /function prefersReducedMotion[\s\S]*?matchMedia/);
});

test("reduced-motion claim still frame mounts a large moment card with celebration line", () => {
  const src = client();
  const styles = css();
  assert.match(src, /still-claim-card/);
  assert.match(src, /오늘부터 우리 친구예요!/);
  assert.match(styles, /\.still-claim-card/);
  assert.match(styles, /is-still-celebrate[\s\S]{0,200}main[\s\S]{0,120}z-index:\s*[1-9]/);
  assert.match(styles, /\.still-wash[\s\S]{0,120}z-index:\s*0/);
  assert.match(styles, /still-sparkle[\s\S]{0,200}clip-path|polygon/);
  assert.doesNotMatch(styles, /\.is-still-celebrate::after\s*\{[^}]*radial-gradient\(circle at/);
});

test("reduced-motion named still frame mounts a named card smaller than the claim card", () => {
  const src = client();
  const styles = css();
  const named = src.match(/if \(kind === "named"\) \{[\s\S]*?showStillCelebrate\([^)]+\);[\s\S]*?\n  \}/);
  assert.ok(named, "named runCelebrate handler exists");
  assert.match(named[0], /showStillCelebrate\(\s*["']named["']\s*\)/);
  assert.doesNotMatch(named[0], /showStillCelebrate\(\s*["']milestone["']\s*\)/);
  assert.match(src, /still-named-card/);
  assert.match(src, /이름을 지어 줘서 정말 기뻐요!/);
  assert.match(styles, /\.still-named-card/);
  const stillFn = src.match(/function showStillCelebrate\(kind\) \{[\s\S]*?\n\}/);
  assert.ok(stillFn);
  assert.match(stillFn[0], /case "named":[\s\S]*still-named-card/);
  assert.match(stillFn[0], /case "named":[\s\S]*이름을 지어 줘서 정말 기뻐요!/);
  const namedCase = stillFn[0].match(/case "named":[\s\S]*?break;/);
  assert.ok(namedCase);
  assert.doesNotMatch(namedCase[0], /still-claim-card/);
  const claimCount = (stillFn[0].match(/claimSlots = \[[\s\S]*?\];/) || [""])[0].split("[").length - 2;
  const smallCount = (stillFn[0].match(/smallSlots = \[[\s\S]*?\];/) || [""])[0].split("[").length - 2;
  assert.equal(claimCount, 12, "claim has 12 star slots");
  assert.equal(smallCount, 6, "named/milestone-size has 6 star slots");
  assert.match(stillFn[0], /slots = visual === "claim" \? claimSlots : smallSlots/);
  assert.match(stillFn[0], /kind === "named" \? "milestone"/);
  const claimFont = styles.match(/\.still-claim-card\s*\{[^}]*font-size:\s*([\d.]+)rem/);
  const namedFont = styles.match(/\.still-named-card\s*\{[^}]*font-size:\s*([\d.]+)rem/);
  assert.ok(claimFont && namedFont, "both card font sizes set");
  assert.ok(Number(namedFont[1]) < Number(claimFont[1]), "named card font smaller than claim");
});

test("showStillCelebrate cleans up before a second call so only one set remains", () => {
  const src = client();
  assert.match(src, /function clearStillCelebrate\s*\(/);
  const stillFn = src.match(/function showStillCelebrate\(kind\) \{[\s\S]*?\n\}/);
  assert.ok(stillFn);
  const body = stillFn[0];
  const clearAt = body.indexOf("clearStillCelebrate()");
  const washAt = body.indexOf("still-wash");
  assert.ok(clearAt >= 0 && washAt > clearAt, "clear before creating wash");
  assert.match(src, /clearStillCelebrate[\s\S]{0,400}still-wash[\s\S]{0,200}remove|querySelectorAll\([\s\S]*still-wash/);
  assert.match(src, /clearTimeout|stillCelebrateTimers/);
});
