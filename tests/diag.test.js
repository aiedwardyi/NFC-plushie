import assert from "node:assert/strict";
import test from "node:test";
import { petCheck } from "../public/diag.js";

// The home pet as the page sees it 1.5 s after the farm closed: drawn, bobbing, a tap at its center lands on it.
const drawn = (extra = {}) => ({
  scene: "farm",
  wait: 1500,
  rect: { x: 82, y: 301, w: 220, h: 220 },
  view: { w: 384, h: 832 },
  display: "",
  visibility: "visible",
  hiddenAt: "",
  opacity: [],
  anims: [{ on: "motion", name: "bob", state: "running", opacity: null }],
  style: { pet: "", motion: "" },
  frame: { name: "canon", src: "/mascot-dragon-512-v3.png", complete: true, width: 512 },
  hit: { name: "button.pet-hit", pet: true, ui: false },
  ...extra,
});

test("a visibly drawn pet sends nothing", () => {
  assert.equal(petCheck(drawn()), "");
  // Half faded, under a sheet the owner opened, or with its center just past the edge, it still counts as drawn.
  assert.equal(petCheck(drawn({ opacity: [{ at: "div.pet", value: 0.5 }] })), "");
  assert.equal(petCheck(drawn({ hit: { name: "div.sheet.is-open", pet: false, ui: true } })), "");
  assert.equal(petCheck(drawn({ rect: { x: -150, y: 301, w: 220, h: 220 }, hit: null })), "");
  // The farm's slide back, finished and let go, holds nothing.
  assert.equal(petCheck(drawn({ anims: [{ on: "pet", name: "transform+opacity 0>1", state: "running", opacity: 1 }] })), "");
});

test("hidden by opacity: the ancestors' opacities multiply", () => {
  const out = petCheck(drawn({ opacity: [{ at: "div.pet", value: 0 }], style: { pet: "opacity: 0;", motion: "" } }));
  assert.equal(out, "opacity 0 1.5s after farm | box 82,301 220x220 | opacity div.pet 0 | anims motion bob running | pet style opacity: 0; | frame canon /mascot-dragon-512-v3.png loaded 512w | hit button.pet-hit");
  assert.match(petCheck(drawn({ opacity: [{ at: "div.pet-motion", value: 0.3 }, { at: "div.window", value: 0.3 }] })), /^opacity 0\.09 1\.5s after farm \|/);
});

test("hidden by visibility, named where the hidden run starts", () => {
  const out = petCheck(drawn({ visibility: "hidden", hiddenAt: "div.pet", style: { pet: "visibility: hidden;", motion: "" } }));
  assert.match(out, /^visibility hidden at div\.pet 1\.5s after farm \| box 82,301 220x220 \| visibility hidden at div\.pet \|/);
  assert.match(out, /\| pet style visibility: hidden; \|/);
});

test("hidden by a stuck animation, ahead of the opacity it causes", () => {
  const stuck = { on: "pet", name: "transform+opacity 1>0", state: "finished", opacity: 0 };
  const out = petCheck(drawn({ scene: "race", wait: 6000, opacity: [{ at: "div.pet", value: 0 }], anims: [stuck, ...drawn().anims] }));
  assert.match(out, /^animation on pet holds opacity 0 \(transform\+opacity 1>0, finished\) 6s after race \|/);
  assert.match(out, /\| anims pet transform\+opacity 1>0 finished 0, motion bob running \|/);
  assert.match(petCheck(drawn({ anims: [{ on: "motion", name: "opacity 1>0", state: "paused", opacity: 0.04 }] })), /^animation on motion holds opacity 0\.04 \(opacity 1>0, paused\)/);
});

test("hidden by a broken or unloaded frame image", () => {
  const broken = petCheck(drawn({ frame: { name: "munch", src: "/mascot-dragon-munch-512.webp", complete: true, width: 0 } }));
  assert.match(broken, /^frame image broken 1\.5s after farm \|/);
  assert.match(broken, /\| frame munch \/mascot-dragon-munch-512\.webp loaded 0w \|/);
  assert.match(petCheck(drawn({ frame: { name: "canon", src: "/mascot-dragon-512-v3.png", complete: false, width: 0 } })), /^frame still loading /);
});

test("no shown frame, no box, off screen, display none, covered or gone each say so, in check order", () => {
  assert.match(petCheck(drawn({ frame: null })), /^no frame shown 1\.5s after farm \| .*\| no frame \| hit button\.pet-hit$/);
  assert.match(petCheck(drawn({ display: "main", rect: { x: 0, y: 0, w: 0, h: 0 } })), /^display none at main /);
  assert.match(petCheck(drawn({ rect: { x: 82, y: 301, w: 0, h: 0 } })), /^zero size /);
  assert.match(petCheck(drawn({ rect: { x: 82, y: 900, w: 220, h: 220 }, hit: null })), /^off screen /);
  assert.match(petCheck(drawn({ hit: { name: "canvas", pet: false, ui: false } })), /^covered by canvas 1\.5s after farm \|/);
  assert.equal(petCheck({ scene: "gimo", wait: 6000, gone: true }), "pet gone 6s after gimo");
  // Two checks failing: the earlier one names the fault.
  assert.match(petCheck(drawn({ visibility: "hidden", hiddenAt: "div.pet", opacity: [{ at: "div.pet", value: 0 }] })), /^visibility hidden/);
});

test("a detail never runs past 300 characters", () => {
  const out = petCheck(drawn({ opacity: [{ at: "div.pet", value: 0 }], style: { pet: "transform: translateX(-132px); ".repeat(20), motion: "" } }));
  assert.equal(Array.from(out).length, 300);
  assert.match(out, /^opacity 0 1\.5s after farm \|/);
});
