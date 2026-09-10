import assert from "node:assert/strict";
import test from "node:test";
import { milestoneLine } from "../src/pages.js";

for (const [count, expected] of [
  [0, ""],
  [9, ""],
  [10, "벌써 열 번이야!"],
  [11, ""],
  [24, ""],
  [25, "스물다섯 번이야!"],
  [26, ""],
  [49, ""],
  [50, "오십 번이야!"],
  [51, ""],
  [99, ""],
  [100, "백 번 만났어!"],
  [101, ""],
  [150, ""],
  [200, "200번이야!"],
  [300, "300번이야!"],
]) {
  test(`milestoneLine: ${count}`, () => assert.equal(milestoneLine(count), expected));
}
