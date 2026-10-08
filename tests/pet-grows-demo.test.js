import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";
import { parseFarm } from "../src/farm.js";
import { fakeUids } from "../src/pages.js";
import { xpForLevel } from "../src/pet.js";
import { parseStats } from "../src/stats.js";

const [A] = fakeUids;
const T0 = Date.parse("2026-05-01T10:00:00+09:00");
const MIN = 60 * 1000;

function updateJar(jar, setCookies) {
  for (const sc of setCookies || []) {
    const m = /^([^=]+)=([^;]*)/.exec(sc);
    if (!m) continue;
    const k = m[1].trim();
    const v = m[2].trim();
    if (v === "" || /Expires=Thu, 01 Jan 1970/i.test(sc)) delete jar[k];
    else jar[k] = v;
  }
}

async function setup(t) {
  const dir = mkdtempSync(join(process.cwd(), ".test-data-"));
  const db = openDatabase(dir);
  let time = T0;
  const server = createApp({ db, now: () => time, rng: () => 0, demoUids: [] }).listen(0, "localhost");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    assert.equal(dirname(dir), process.cwd());
    rmSync(dir, { recursive: true, force: true });
  });
  async function request(path, { jar, body } = {}) {
    const headers = {};
    if (jar) {
      const pair = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
      if (pair) headers.Cookie = pair;
    }
    if (body) headers["Content-Type"] = "application/json";
    const res = await fetch(`http://localhost:${server.address().port}${path}`, {
      method: body ? "POST" : "GET",
      redirect: "manual",
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    return { status: res.status, html: await res.text(), setCookies };
  }
  const row = () => db.prepare("SELECT * FROM plushies WHERE uid = ?").get(A);
  const set = (sql, ...args) => db.prepare(`UPDATE plushies SET ${sql} WHERE uid = ?`).run(...args, A);
  return { request, row, set, advance: (ms) => { time += ms; } };
}

test("pet grows: tap, harvest, feed 당근, race on the boost, send the rest, buy a seed, see the next unlock", async (t) => {
  const ctx = await setup(t);
  const jar = {};
  const call = async (path, body) => {
    const res = await ctx.request(path, { jar, body: { uid: A, ...body } });
    return { status: res.status, body: JSON.parse(res.html) };
  };
  const pantry = () => parseFarm(ctx.row().farm).pantry;

  // The plushie's first tap meets the pet, then it gets its name and its page fills the animal.
  updateJar(jar, (await ctx.request(`/t?uid=${A}`, { jar })).setCookies);
  const named = await ctx.request("/name", { jar, body: { uid: A, name: "모찌" } });
  assert.equal(named.status, 303);
  updateJar(jar, named.setCookies);
  updateJar(jar, (await ctx.request(`/t?uid=${A}`, { jar })).setCookies);
  await call("/kind", { kind: "horse", fill: true });
  assert.equal(ctx.row().kind, "horse");

  // A real tap: the day's first, so 40 XP.
  ctx.advance(MIN);
  const tap = await ctx.request(`/t?uid=${A}`, { jar });
  assert.match(tap.html, /data-rewarded="1"/);
  assert.equal(ctx.row().xp, 40);

  // The farm opens with the starter packet, and one 기 모으기 trains 힘.
  assert.equal((await call("/farm", { act: "open" })).body.created, true);
  const gi = await call("/arcade", { game: "gi", height: 1000 });
  assert.deepEqual([gi.body.xpGain, gi.body.trained], [15, { stat: "str", gained: 1 }]);

  // The first harvest fills the basket, trains 지능 and reaches Lv 2, which plants 당근.
  await call("/dev/farm-ripen");
  const first = await call("/farm", { act: "harvest" });
  assert.deepEqual(first.body.picked.map((p) => p.crop), ["sprout", "lettuce", "potato", "gold"]);
  assert.deepEqual([first.body.level, first.body.leveledUp, first.body.trained], [2, true, { stat: "int", gained: 1 }]);
  assert.deepEqual(first.body.farm.pantry, ["sprout", "lettuce", "potato", "gold"]);
  assert.ok(first.body.planted.some((pl) => pl.plot === 4 && pl.crop === "carrot"));

  // The next harvest brings 당근 into the basket.
  await call("/dev/farm-ripen");
  const second = await call("/farm", { act: "harvest" });
  assert.ok(second.body.picked.some((p) => p.crop === "carrot"));
  assert.ok(pantry().includes("carrot"));
  assert.equal(second.body.trained.gained, 0);

  // 당근 as a snack: the next race gets 민첩 +10.
  const fed = await call("/farm", { act: "feed", crop: "carrot" });
  assert.deepEqual(fed.body.boost, { stat: "agi", amount: 10, set: true });
  assert.deepEqual([fed.body.stats.agi.boost, fed.body.stats.agi.total], [10, 80]);
  assert.ok(!pantry().includes("carrot"));

  // The race uses that boost and trains 민첩 +1.
  const race = await call("/arcade", { game: "race", rival: "sheep", won: true });
  assert.equal(race.status, 200);
  assert.deepEqual([race.body.boostUsed, race.body.trained], [10, { stat: "agi", gained: 1 }]);
  assert.deepEqual([race.body.stats.agi.boost, race.body.stats.agi.trained, race.body.stats.agi.total], [0, 1, 71]);
  assert.deepEqual(parseStats(ctx.row().stats).boost.agi, 0);

  // The rest ride the bus for coins.
  const rest = pantry();
  assert.ok(rest.length > 0);
  const sent = await call("/farm", { act: "send", crops: rest });
  assert.ok(sent.body.coinsGain > 0);
  assert.deepEqual([sent.body.farm.pantry, sent.body.farm.coins], [[], sent.body.coinsGain]);
  const coins = sent.body.farm.coins;

  // At Lv 3 the 씨앗 가게 opens and a seed drops into the bag.
  ctx.set("xp = ?", xpForLevel(3));
  const bought = await call("/farm", { act: "buy", crop: "lettuce" });
  assert.equal(bought.status, 200);
  assert.deepEqual([bought.body.farm.coins, bought.body.farm.shopOpen], [coins - 5, true]);
  assert.equal(bought.body.farm.bag.at(-1), "lettuce");

  // Back home, the level line names the next unlock and the card shows what grew.
  const home = await ctx.request(`/t?uid=${A}&view=1`, { jar });
  assert.match(home.html, /<span class="level-next" data-level-next data-unlocks="[^"]*">Lv 4: 고구마<\/span>/);
  const card = home.html.match(/<div class="sheet" data-sheet="stats"[\s\S]*?<\/section>\s*<\/div>/)[0];
  assert.deepEqual([...card.matchAll(/<b class="st-total">(\d+)<\/b>/g)].map((m) => Number(m[1])), [51, 41, 71, 60]);
});
