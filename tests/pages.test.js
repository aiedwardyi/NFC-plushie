import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { awayLine, milestoneLine, nextUnlock, page } from "../src/pages.js";

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

test("stylesheet keeps Korean words intact", () => {
  const css = readFileSync(new URL("../public/style.css", import.meta.url), "utf8");
  assert.match(css, /word-break:\s*keep-all/);
  assert.match(css, /overflow-wrap:\s*break-word/);
});

test("pages declare light and dark so forced dark leaves them alone", () => {
  assert.match(page(null, ""), /<meta name="color-scheme" content="light dark">/);
});

test("the level line names each next unlock, then nothing", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 20].map(nextUnlock), ["Lv 2: 당근", "Lv 3: 토마토 + 씨앗 가게", "Lv 4: 고구마", "Lv 5: 수박", "Lv 6: 황금 감자 씨앗", "", "", ""]);
});

test("the away line names a ripe crop with the right 이/가, or the nap", () => {
  const T0 = Date.parse("2026-05-01T10:00:00+09:00");
  const later = T0 + 8 * 24 * 3600000;
  const field = (...crops) => ({ plots: [...crops.map((crop) => crop && { crop, at: T0, quick: false }), null, null, null, null, null, null].slice(0, 6) });
  const said = (crop) => awayLine(field(crop), later);
  assert.equal(said("carrot"), "당근이 다 익었어요! 같이 볼래요?");
  assert.deepEqual(["potato", "tomato", "melon", "lettuce", "gold", "sweet"].map(said), [
    "감자가 다 익었어요! 같이 볼래요?",
    "토마토가 다 익었어요! 같이 볼래요?",
    "수박이 다 익었어요! 같이 볼래요?",
    "상추가 다 익었어요! 같이 볼래요?",
    "황금 감자가 다 익었어요! 같이 볼래요?",
    "고구마가 다 익었어요! 같이 볼래요?",
  ]);
  assert.equal(awayLine(field("potato", null, "gold", "melon"), later), "황금 감자가 다 익었어요! 같이 볼래요?");
  assert.equal(awayLine(field("potato", "carrot"), later), "감자가 다 익었어요! 같이 볼래요?");
  const nap = "푹 자고 일어났어요. 오늘도 같이 놀아요!";
  assert.deepEqual([awayLine(null, later), awayLine(field(), later), awayLine(field("gold"), T0 + 24 * 3600000)], [nap, nap, nap]);
  for (const line of [nap, said("carrot"), said("gold")]) assert.doesNotMatch(line, /외로|왜 안|슬펐|미워/);
});
