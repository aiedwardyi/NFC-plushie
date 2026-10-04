import assert from "node:assert/strict";
import test from "node:test";
import { COMBO, comboNext, comboTap } from "../src/combo.js";

const T0 = Date.parse("2026-05-01T10:00:00+09:00");
const chain = (comboCount, comboAt) => ({ comboCount, comboAt });

test("taps 4 s apart climb 1, 2, 3, then start over", () => {
  let s = chain(0, null);
  const seen = [];
  for (let i = 0; i < 5; i++) {
    const out = comboTap(s, T0 + i * 4000);
    seen.push(out.combo);
    s = chain(out.comboCount, out.comboAt);
  }
  assert.deepEqual(seen, [1, 2, 3, 1, 2]);
});

test("the window slides from the last tap and closes at 12 s", () => {
  assert.equal(comboTap(chain(1, T0), T0 + COMBO.windowMs - 1).combo, 2);
  assert.equal(comboTap(chain(1, T0), T0 + COMBO.windowMs).combo, 1);
  assert.equal(comboTap(chain(2, T0), T0 + 11000).combo, 3);
});

test("a second request within 800 ms is the same tap", () => {
  assert.deepEqual(comboTap(chain(1, T0), T0 + COMBO.sameTapMs - 1), { combo: 1, comboCount: 1, comboAt: T0, same: true });
  assert.equal(comboTap(chain(1, T0), T0 + COMBO.sameTapMs).combo, 2);
  assert.equal(comboTap(chain(0, null), T0).same, false);
});

test("the open page only continues an open chain", () => {
  assert.equal(comboNext(chain(0, null), T0), null);
  assert.equal(comboNext(chain(1, T0), T0 + COMBO.windowMs), null);
  assert.equal(comboNext(chain(1, T0), T0 + 3000).combo, 2);
  assert.equal(comboNext(chain(2, T0), T0 + 3000).combo, 3);
  assert.equal(comboNext(chain(3, T0), T0 + 3000), null);
  assert.equal(comboNext(chain(3, T0), T0 + 300).same, true);
});
