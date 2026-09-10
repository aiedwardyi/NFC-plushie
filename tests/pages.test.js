import assert from "node:assert/strict";
import test from "node:test";
import { milestoneLine } from "../src/pages.js";

for (const [count, expected] of [
  [0, ""],
  [9, ""],
  [10, "벌써 열 번이에요!"],
  [11, ""],
  [24, ""],
  [25, "스물다섯 번이에요!"],
  [26, ""],
  [49, ""],
  [50, "오십 번이에요!"],
  [51, ""],
  [99, ""],
  [100, "백 번 만났어요!"],
  [101, ""],
  [150, ""],
  [200, "200번이에요!"],
  [300, "300번이에요!"],
]) {
  test(`milestoneLine: ${count}`, () => assert.equal(milestoneLine(count), expected));
}
