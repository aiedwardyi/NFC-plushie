import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = () => readFileSync(new URL("../public/app.js", import.meta.url), "utf-8");
const css = () => readFileSync(new URL("../public/style.css", import.meta.url), "utf-8");

test("react() restarts squash every tap via remove → reflow → re-add", () => {
  const src = client();
  const react = src.match(/function react\(\) \{[\s\S]*?\n  \}/);
  assert.ok(react, "react() exists");
  const body = react[0];
  assert.match(body, /classList\.remove\(\s*["']is-press["']\s*\)/);
  assert.match(body, /offsetWidth/);
  assert.match(body, /classList\.add\(\s*["']is-press["']\s*\)/);
  assert.match(body, /clearTimeout\(\s*pressTimer\s*\)/);
  assert.match(body, /pressTimer\s*=\s*window\.setTimeout/);
  // remove must precede reflow, which must precede re-add
  const removeAt = body.indexOf('classList.remove("is-press")');
  const reflowAt = body.indexOf("offsetWidth");
  const addAt = body.indexOf('classList.add("is-press")');
  assert.ok(removeAt >= 0 && reflowAt > removeAt && addAt > reflowAt, "remove → reflow → add order");
});

test("squash keyframes stay cute and prefer-reduced-motion still disables press anim", () => {
  const styles = css();
  assert.match(styles, /@keyframes squash/);
  assert.match(styles, /\.is-press\s+\.pet-motion\s*\{\s*animation:\s*squash/);
  const reduce = styles.match(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{[\s\S]*?\n\}/);
  assert.ok(reduce, "reduced-motion block exists");
  assert.match(reduce[0], /\.is-press\s+\.pet-motion/);
  assert.match(reduce[0], /animation:\s*none/);
});
