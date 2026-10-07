import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

function page({ saved = null, preference = "horse", query = "", picker = false } = {}) {
  let stored = preference;
  let cookie = preference ? `mascot=${preference}` : "";
  let art = saved || "horse";
  let href = `http://localhost/t?uid=04AAAAAAAAAAA1${query}`;
  const clicks = new Map();
  const buttons = ["horse", "sheep"].map((kind) => ({
    getAttribute: () => kind,
    setAttribute() {},
    classList: { toggle() {} },
    closest: () => picker ? {} : null,
    addEventListener: (event, fn) => { if (event === "click") clicks.set(kind, () => fn({ currentTarget: buttons.find((b) => b.getAttribute() === kind) })); },
  }));
  const document = {
    get cookie() { return cookie; },
    set cookie(value) { cookie = value.split(";")[0]; },
    documentElement: { getAttribute: () => art, setAttribute: (_, value) => { art = value; } },
    querySelector: (selector) => selector === "script[data-mascots]" ? { dataset: { mascots: "horse sheep" } }
      : selector === 'meta[name="pet-kind"]' && saved ? { content: saved } : null,
    querySelectorAll: (selector) => selector === ".mascot-tog" ? buttons : [],
  };
  const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8").split(/\r?\nconst toggle =/)[0];
  runInNewContext(source, {
    document, URL, URLSearchParams,
    window: { location: { href, search: new URL(href).search }, history: { replaceState: (_, __, value) => { href = value; } } },
    localStorage: { getItem: () => stored, setItem: (_, value) => { stored = value; } },
    fetch: async () => ({ ok: true, json: async () => ({ ok: true, stats: {} }) }),
    paintStats() {},
    armReveal() {},
  });
  return { choice: () => ({ cookie, stored, art }), click: (kind) => clicks.get(kind)(), url: () => href };
}

test("a saved pet changes the art without changing this browser's animal", () => {
  for (const saved of ["horse", "sheep", "tiger"]) {
    for (const preference of [null, "horse", "sheep"]) {
      const p = page({ saved, preference });
      assert.deepEqual(p.choice(), { cookie: preference ? `mascot=${preference}` : "", stored: preference, art: saved });
    }
  }
});

test("an explicit mascot query persists the choice while saved pet art still wins", () => {
  const p = page({ saved: "horse", query: "&mascot=sheep" });
  assert.deepEqual(p.choice(), { cookie: "mascot=sheep", stored: "sheep", art: "horse" });
  assert.doesNotMatch(p.url(), /mascot=/);
});

test("the everyday toggle persists a choice even when that pet is already shown", () => {
  const p = page({ saved: "sheep" });
  p.click("sheep");
  assert.deepEqual(p.choice(), { cookie: "mascot=sheep", stored: "sheep", art: "sheep" });
  p.click("horse");
  assert.deepEqual(p.choice(), { cookie: "mascot=horse", stored: "horse", art: "horse" });
});

test("the admin animal picker keeps the browser's choice after saving", async () => {
  const p = page({ saved: "horse", picker: true });
  p.click("sheep");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(p.choice(), { cookie: "mascot=horse", stored: "horse", art: "sheep" });
});
