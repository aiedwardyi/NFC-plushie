import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../public/${path}`, import.meta.url), "utf8");

test("every touch wakes sound again, a finger from its lift, and a pause is asked back on screen", () => {
  const app = read("app.js");
  assert.doesNotMatch(app, /addEventListener\("pointerdown", wakeAudio, \{ once: true/);
  assert.match(app, /for \(const type of \["pointerdown", "pointerup", "keydown"\]\) document\.addEventListener\(type, rewake, true\)/);
  const rewake = app.match(/function rewake\(event\) \{[\s\S]*?\n\}/);
  assert.ok(rewake, "rewake exists");
  assert.match(rewake[0], /event\.key !== "Enter" && event\.key !== " "/);
  assert.match(rewake[0], /hasBeenActive === false\) return/);
  assert.match(rewake[0], /firstTouch\.splice\(0\)/);
  assert.match(app, /addEventListener\("statechange", \(\) => \{\n\s*if \(!document\.hidden && \(ctx\.state === "suspended" \|\| ctx\.state === "interrupted"\)\)/);
  assert.match(app, /addEventListener\("visibilitychange", \(\) => \{\n\s*if \(!document\.hidden && audio && audio\.state !== "running"/);
});

test("the plain boot path holds the first line behind a typing bubble until the first touch", () => {
  const app = read("app.js");
  const start = app.match(/function startDialog\(onTyped\) \{[\s\S]*?\n\}/);
  assert.ok(start, "startDialog exists");
  assert.match(start[0], /prefersReducedMotion\(\)\) \{\n\s*onTyped\?\.\(\);\n\s*return;/);
  assert.match(start[0], /dialog-dots[\s\S]*setAttribute\("aria-hidden", "true"\)[\s\S]*visually-hidden/);
  assert.match(start[0], /firstTouch\.push\(/);
  assert.match(start[0], /window\.setTimeout\(\(\) => \{\n\s*if \(token !== sayToken\)/);
  assert.match(app, /runCelebrate\(\);\n\s*startDialog\(\(\) => care\?\.opened\(\)\);/);
});

test("the want sound and the load-time celebration buzzes wait for the first touch", () => {
  const app = read("app.js");
  assert.match(app, /firstTouch\.push\(\(\) => wantEl === shown && sound\("want"\)\)/);
  const reunion = app.match(/function reunionJump\(\) \{[\s\S]*?\n\}/);
  assert.ok(reunion, "reunionJump exists");
  assert.match(reunion[0], /celebrateBuzz\(\[40, 60, 40\], \(\) => pet\.classList\.contains\("is-reunion-jump"\)\)/);
  const claim = app.match(/if \(kind === "claim"\) \{[\s\S]*?\n  \}/);
  assert.match(claim[0], /celebrateBuzz\(\[30, 40, 30, 40, 80\]/);
});

test("the typing bubble pulses gently, holds still under reduced motion and dresses for every world", () => {
  const css = read("style.css");
  assert.match(css, /\.dialog-dots i \{[^}]*animation: dialog-dots/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[^@]*\.dialog-dots i \{ animation: none;/);
  assert.match(read("themes/8bit.css"), /\.dialog-dots i \{[^}]*border-radius: 0/);
  assert.match(read("themes/milk.css"), /\.dialog-dots i \{ background: var\(--straw-deep\)/);
  const najeon = read("themes/najeon.css").match(/^html\[data-theme="najeon"\] \.dialog-dots.*$/gm);
  assert.equal(najeon?.length, 2);
  for (const rule of najeon) assert.doesNotMatch(rule, /vermilion|coral|#b8282f|#c8323c|#d0393f/);
  assert.match(najeon[1], /pearl/);
});
