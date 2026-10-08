import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

function page({ saved = null, preference = "horse", lapsed = false, query = "", owner = false, kept = null } = {}) {
  let stored = preference;
  let cookie = preference && !lapsed ? `mascot=${preference}` : "";
  let art = saved || "horse";
  let href = `http://localhost/t?uid=04AAAAAAAAAAA1${query}`;
  const clicks = new Map();
  const posts = [];
  const buttons = ["horse", "sheep"].map((kind) => ({
    getAttribute: () => kind,
    setAttribute() {},
    classList: { toggle() {} },
    addEventListener: (event, fn) => { if (event === "click") clicks.set(kind, () => fn({ currentTarget: buttons.find((b) => b.getAttribute() === kind) })); },
  }));
  const document = {
    get cookie() { return cookie; },
    set cookie(value) { cookie = value.split(";")[0]; },
    documentElement: { getAttribute: () => art, setAttribute: (_, value) => { art = value; } },
    querySelector: (selector) => selector === "script[data-mascots]" ? { dataset: { mascots: "horse sheep" } }
      : selector === 'meta[name="pet-kind"]' && saved ? { content: saved }
      : selector === ".dock[data-care-uid]" && owner ? { dataset: { careUid: "04AAAAAAAAAAA1" } } : null,
    querySelectorAll: (selector) => selector === ".mascot-tog" ? buttons : [],
  };
  const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8").split(/\r?\nconst toggle =/)[0];
  runInNewContext(source, {
    document, URL, URLSearchParams,
    window: { location: { href, search: new URL(href).search }, history: { replaceState: (_, __, value) => { href = value; } } },
    localStorage: { getItem: () => stored, setItem: (_, value) => { stored = value; } },
    fetch: async (url, init) => {
      const body = JSON.parse(init.body);
      posts.push([url, body]);
      return { ok: true, json: async () => ({ ok: true, kind: kept || body.kind, stats: {} }) };
    },
    paintStats() {},
    armReveal() {},
  });
  return { choice: () => ({ cookie, stored, art }), click: (kind) => clicks.get(kind)(), url: () => href, posts: () => posts };
}

function boot({ saved = null, stored = null } = {}) {
  const attrs = { "data-mascot": "horse" };
  const frames = [];
  let parsed = null;
  const document = {
    cookie: "",
    currentScript: { getAttribute: () => "horse sheep" },
    head: { appendChild() {} },
    createElement: () => ({}),
    addEventListener() {},
    documentElement: { getAttribute: (key) => attrs[key] ?? null, setAttribute: (key, value) => { attrs[key] = value; }, hasAttribute: (key) => key in attrs, classList: { add() {}, remove() {} } },
    querySelector: (selector) => selector === 'meta[name="pet-kind"]' && saved ? { content: saved } : null,
    querySelectorAll: (selector) => selector === "img.pet-frame" ? frames : [],
  };
  const MutationObserver = class {
    constructor(fn) { parsed = fn; }
    observe() {}
    disconnect() { parsed = null; }
  };
  runInNewContext(readFileSync(new URL("../public/mascot-boot.js", import.meta.url), "utf8"), {
    document, location: { search: "" }, localStorage: { getItem: () => stored }, URLSearchParams, MutationObserver,
  });
  return {
    mascot: () => attrs["data-mascot"],
    parse(src) {
      const img = { src, getAttribute: () => img.src, setAttribute: (_, value) => { img.src = value; } };
      frames.push(img);
      parsed?.([]);
      return img.src;
    },
  };
}

test("pet frames parsed after the boot script already show this browser's animal", () => {
  const unsaved = boot({ stored: "sheep" });
  assert.equal(unsaved.mascot(), "sheep");
  assert.equal(unsaved.parse("/mascot-horse-512-v3.png"), "/mascot-sheep-512-v3.png");
  assert.equal(unsaved.parse("/mascot-horse-closed-512.webp"), "/mascot-sheep-closed-512.webp");
  assert.equal(boot({ saved: "horse", stored: "sheep" }).parse("/mascot-horse-512-v3.png"), "/mascot-horse-512-v3.png");
});

test("a saved pet changes the art without changing this browser's animal", () => {
  for (const saved of ["horse", "sheep", "tiger"]) {
    for (const preference of [null, "horse", "sheep"]) {
      const p = page({ saved, preference });
      assert.deepEqual(p.choice(), { cookie: preference ? `mascot=${preference}` : "", stored: preference, art: saved });
    }
  }
});

test("only the owner's page of an unsaved pet fills its animal, even from localStorage alone", () => {
  const p = page({ preference: "sheep", lapsed: true, owner: true });
  assert.deepEqual(p.posts(), [["/kind", { uid: "04AAAAAAAAAAA1", kind: "sheep", fill: true }]]);
  assert.deepEqual(p.choice(), { cookie: "", stored: "sheep", art: "sheep" });
  for (const [saved, owner] of [[null, false], ["horse", true], ["tiger", true], ["horse", false]]) {
    assert.deepEqual(page({ saved, preference: "sheep", lapsed: true, owner }).posts(), [], `${saved} ${owner}`);
  }
});

test("a fill that finds an animal saved meanwhile shows it and keeps this browser's choice", async () => {
  const p = page({ preference: "sheep", lapsed: true, owner: true, kept: "tiger" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(p.choice(), { cookie: "", stored: "sheep", art: "tiger" });
});

test("an explicit mascot query persists the choice while saved pet art still wins", () => {
  const p = page({ saved: "horse", query: "&mascot=sheep" });
  assert.deepEqual(p.choice(), { cookie: "mascot=sheep", stored: "sheep", art: "horse" });
  assert.doesNotMatch(p.url(), /mascot=/);
});

test("the admin animal picker keeps the browser's choice after saving", async () => {
  const p = page({ saved: "horse" });
  p.click("sheep");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(p.choice(), { cookie: "mascot=horse", stored: "horse", art: "sheep" });
});
