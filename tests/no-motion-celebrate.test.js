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
  // wash/sparkles stay behind main content
  assert.match(styles, /is-still-celebrate[\s\S]{0,200}main[\s\S]{0,120}z-index:\s*[1-9]/);
  assert.match(styles, /\.still-wash[\s\S]{0,120}z-index:\s*0/);
  // four-point star sparkles, not plain dots via body::after circles
  assert.match(styles, /still-sparkle[\s\S]{0,200}clip-path|polygon/);
  assert.doesNotMatch(styles, /\.is-still-celebrate::after\s*\{[^}]*radial-gradient\(circle at/);
});
