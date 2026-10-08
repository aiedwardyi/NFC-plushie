import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { DEFAULT_KIND, KINDS, KIND_IDS, kindFiles, kindOf } from "../public/kinds.js";
import { KIND_CSS, THEMES } from "../src/pages.js";
import { ANIMALS } from "../src/stats.js";

const worlds = THEMES.map((t) => t.id);

test("the 12 plushies in zodiac order, each with stats and a name", () => {
  assert.deepEqual(KIND_IDS, ["rat", "ox", "tiger", "rabbit", "dragon", "snake", "horse", "sheep", "monkey", "rooster", "dog", "pig"]);
  assert.deepEqual(Object.keys(ANIMALS).sort(), [...KIND_IDS].sort());
  for (const kind of KINDS) assert.match(kind.name, /^[가-힣]+$/, kind.id);
  assert.deepEqual(KINDS.map((k) => k.name), ["쥐", "소", "호랑이", "토끼", "용", "뱀", "말", "양", "원숭이", "닭", "강아지", "돼지"]);
});

test("every pet races its zodiac neighbour, and the neighbour races it back", () => {
  for (const kind of KINDS) {
    assert.ok(KIND_IDS.includes(kind.rival), kind.id);
    assert.notEqual(kind.rival, kind.id);
    assert.equal(kindOf(kind.rival).rival, kind.id, kind.id);
  }
  assert.equal(kindOf("horse").rival, "sheep");
});

test("말 and 양 stay the everyday switch, 말 the first look", () => {
  assert.deepEqual(KINDS.filter((k) => k.toggle).map((k) => k.id), ["horse", "sheep"]);
  assert.equal(DEFAULT_KIND, "horse");
  assert.equal(kindOf("unicorn").id, "horse");
  assert.equal(kindOf("__proto__").id, "horse");
  assert.equal(kindOf(undefined).id, "horse");
});

for (const kind of KINDS) {
  test(`${kind.name} (${kind.id}) ships every file the manifest lists`, () => {
    const files = kindFiles(kind, worlds);
    assert.equal(files.length, kind.reveal ? 22 : 21);
    assert.equal(files.includes(`/reveal/diamond-${kind.id}.mp4`), Boolean(kind.reveal));
    const missing = files.filter((path) => !existsSync(new URL(`../public${path}`, import.meta.url)));
    assert.deepEqual(missing, []);
  });
}

test("the race roster's art carries a version, so phones drop their cached silhouettes", () => {
  const race = readFileSync(new URL("../public/game/race.js", import.meta.url), "utf8");
  assert.ok(/^const ART_V = \d+;$/m.test(race), "ART_V");
  const urls = [...race.matchAll(/\/game\/art\/race\/[^\n]*?\.webp(\?v=\$\{ART_V\})?/g)];
  assert.ok(urls.length);
  for (const [url, version] of urls) assert.ok(version, url);
});

test("/kinds.css points every kind at its own sprites and world previews", () => {
  for (const kind of KINDS) {
    const block = KIND_CSS.split("\n").find((line) => line.startsWith(`[data-mascot="${kind.id}"] {`));
    const urls = [...block.matchAll(/url\("([^"?]+)/g)].map((m) => m[1]);
    assert.deepEqual(urls, kindFiles(kind, worlds).filter((path) => path.startsWith("/themes/")), kind.id);
  }
  assert.match(KIND_CSS, /--thumb-najeon: url\("\/themes\/thumbs\/najeon-horse\.webp\?v=2"\);/);
});
