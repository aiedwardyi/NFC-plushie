import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CITIES, CITY_IDS, cityName } from "../public/cities.js";
import { RACE, cityLevel, newRace, raceTap, rivalTime, stepRace } from "../public/game/race-model.js";
import { CITY, addWin, boardShown, cityPid, dayTickets, joinCity, leaveCity, matchId, matchRefusal, newsLine, pastInbox, shownName, spendTicket, ticketsLeft, validMatch, validPid, weekOf, winsThisWeek } from "../src/city.js";
import { parseStats, statBonus, statSheet } from "../src/stats.js";

const T0 = Date.parse("2026-05-01T10:00:00+09:00");
const DAY = 24 * 60 * 60 * 1000;
const town = (over = {}) => ({ city: null, cityPid: null, cityDay: null, cityTickets: 0, cityWeek: null, cityWins: 0, ...over });

test("the 17 시·도 are the cities, in their usual order", () => {
  assert.deepEqual(CITIES.map((c) => c.name), ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"]);
  assert.equal(new Set(CITY_IDS).size, 17);
  assert.equal(cityName("jeju"), "제주");
  assert.equal(cityName("tokyo"), "");
});

test("the day's first tap gives 3 tickets that end with the Seoul day", () => {
  const got = dayTickets(T0);
  assert.deepEqual(got, { cityDay: "2026-05-01", cityTickets: 3 });
  assert.equal(ticketsLeft(town(got), T0), 3);
  const night = Date.parse("2026-05-01T23:59:00+09:00");
  assert.equal(ticketsLeft(town(got), night), 3);
  assert.equal(ticketsLeft(town(got), night + 2 * 60 * 1000), 0);
  assert.equal(ticketsLeft(town(), T0), 0);
});

test("a challenge spends one ticket and none is left after the third", () => {
  let s = town(dayTickets(T0));
  const lefts = [];
  for (let i = 0; i < 3; i++) {
    const spent = spendTicket(s, T0);
    lefts.push(spent.cityTickets);
    s = town(spent);
  }
  assert.deepEqual(lefts, [2, 1, 0]);
  assert.equal(spendTicket(s, T0), null);
  assert.equal(spendTicket(town(dayTickets(T0 - DAY)), T0), null);
});

test("joining gives a public id, a move keeps it and this week's wins stay behind", () => {
  const joined = joinCity(town(), "seoul", "Abc123_-xyz0");
  assert.deepEqual(joined, { city: "seoul", cityPid: "Abc123_-xyz0", cityWeek: null, cityWins: null });
  const moved = joinCity(town({ city: "seoul", cityPid: "Abc123_-xyz0", cityWeek: "2026-04-27", cityWins: 4 }), "busan", "Zzzzzzzzzzzz");
  assert.deepEqual(moved, { city: "busan", cityPid: "Abc123_-xyz0", cityWeek: null, cityWins: null });
  assert.equal(joinCity(town({ city: "seoul", cityPid: "Abc123_-xyz0" }), "seoul", "Zzzzzzzzzzzz"), null);
});

test("leaving clears the city, the public id and the wins, so a pet joining again is a new card", () => {
  assert.deepEqual(leaveCity(), { city: null, cityPid: null, cityWeek: null, cityWins: null });
  const back = joinCity(town(leaveCity()), "seoul", "NewNewNewNew");
  assert.equal(back.cityPid, "NewNewNewNew");
});

test("public ids and match ids are random, url-safe and of their own lengths", () => {
  const pids = new Set(Array.from({ length: 200 }, cityPid));
  const ids = new Set(Array.from({ length: 200 }, matchId));
  assert.equal(pids.size, 200);
  assert.equal(ids.size, 200);
  assert.ok([...pids].every(validPid));
  assert.ok([...ids].every(validMatch));
  for (const bad of ["", "short", "04AAAAAAAAAAA1", "Abc123_-xyz0!", "Abc123_-xyz0x", null, 12, ["Abc123_-xyz0"]]) assert.equal(validPid(bad), false, String(bad));
  assert.equal(validMatch("Abc123_-xyz0"), false);
});

test("a match takes one result, from its challenger, before it expires", () => {
  const match = { challenger: "04AAAAAAAAAAA1", done_at: null, expires: T0 + CITY.matchMs };
  assert.equal(CITY.matchMs, 10 * 60 * 1000);
  assert.equal(matchRefusal(match, "04AAAAAAAAAAA1", T0), "");
  assert.equal(matchRefusal(match, "04AAAAAAAAAAA1", T0 + CITY.matchMs - 1), "");
  assert.equal(matchRefusal(match, "04AAAAAAAAAAA1", T0 + CITY.matchMs), "expired");
  assert.equal(matchRefusal({ ...match, done_at: T0 }, "04AAAAAAAAAAA1", T0), "used");
  assert.equal(matchRefusal(match, "04BBBBBBBBBBB2", T0), "unknown");
  assert.equal(matchRefusal(undefined, "04AAAAAAAAAAA1", T0), "unknown");
});

test("a defender keeps its newest 20 records", () => {
  const records = Array.from({ length: 22 }, (_, i) => ({ id: `m${i}` }));
  assert.equal(CITY.inbox, 20);
  assert.deepEqual(pastInbox(records), [{ id: "m20" }, { id: "m21" }]);
  assert.deepEqual(pastInbox(records.slice(0, 20)), []);
});

test("a city ranks only with 5 joined pets, on this Seoul week's wins", () => {
  assert.deepEqual([4, 5, 6].map(boardShown), [false, true, true]);
  assert.equal(weekOf(T0), "2026-04-27");
  assert.equal(weekOf(Date.parse("2026-05-03T23:59:00+09:00")), "2026-04-27");
  assert.equal(weekOf(Date.parse("2026-05-04T00:00:00+09:00")), "2026-05-04");
  let s = town();
  for (let i = 0; i < 3; i++) s = town(addWin(s, T0));
  assert.deepEqual([s.cityWeek, s.cityWins, winsThisWeek(s, T0)], ["2026-04-27", 3, 3]);
  const nextWeek = Date.parse("2026-05-04T09:00:00+09:00");
  assert.equal(winsThisWeek(s, nextWeek), 0);
  assert.deepEqual(addWin(s, nextWeek), { cityWeek: "2026-05-04", cityWins: 1 });
});

test("other owners see a clean name, else the animal's", () => {
  for (const name of ["콩이", "Mochi", "포키 2호", "별님⭐", "Bori Bori", "새싹이", "시바견"]) assert.equal(shownName(name, "dog"), name);
  for (const name of ["씨발", "시 발", "ㅅㅂ", "개새끼", "병신아", "f u c k", "FuCk", "fvck", "f.u.c.k", "ｆｕｃｋ", "sh1t", "b1tch", "asshole", "섹스"]) assert.equal(shownName(name, "dog"), "강아지", name);
  assert.equal(shownName("", "rabbit"), "토끼");
  assert.equal(shownName(null, "unicorn"), "말");
});

test("the filter knows ㅄ, ㅆ발, ㅗ and a few more, and reads Cyrillic or Greek look-alikes as Latin", () => {
  for (const name of ["ㅄ", "ㅆ발", "ㅅ발", "씹", "ㅗ", "fck", "phuck", "Hitler", "n a z i", "fu\u0441k", "FU\u0421K", "\u0455h\u0456t", "\u039D\u0391Z\u0399", "f\u03C5ck", "\u0430\u0455\u0455h\u043El\u0435"]) assert.equal(shownName(name, "dog"), "강아지", name);
  for (const name of ["\u0422\u043E\u0448\u0430", "\u03A9mega", "보리"]) assert.equal(shownName(name, "dog"), name);
});

test("the pet tells its away races in plain numbers", () => {
  const held = { held: true };
  const lost = { held: false };
  assert.equal(newsLine([held]), "자리 비운 사이에 도전받았어요! 제가 이겼어요");
  assert.equal(newsLine([lost]), "자리 비운 사이에 도전받았어요! 아깝게 졌어요");
  assert.equal(newsLine([held, lost, held]), "자리 비운 사이에 3번 도전받았어요! 2번 이겼어요");
  assert.equal(newsLine([held, held]), "자리 비운 사이에 2번 도전받았어요! 다 이겼어요");
  assert.equal(newsLine([lost, lost]), "자리 비운 사이에 2번 도전받았어요! 다 졌어요");
});

// The defender's 민첩 total as the card counts it: base + edition + training, without a snack boost.
const agiOf = (kind, edition, trained = 0, boost = 0) => {
  const stats = parseStats(JSON.stringify({ trained: { agi: trained }, boost: { agi: boost } }));
  const s = statSheet(stats, kind, edition).agi;
  return statBonus(s.total - s.boost);
};

test("a city rival races at its own level plus its 민첩, counted in race levels", () => {
  // Each race level is 2.8% faster, so a 15% bonus is about 5 levels and a 5% one about 2.
  assert.equal(Math.round(Math.log(1.15) / Math.log(rivalTime(1) / rivalTime(2)) * 10) / 10, 4.9);
  const pinned = [
    [1, 0, 1], [1, 5, 3], [3, 3.3, 4], [4, 3.3, 5], [7, 7.5, 10], [10, 15, 15], [16, 15, 20], [30, 0, 20], [1, 15, 6],
  ];
  for (const [level, agi, want] of pinned) assert.equal(cityLevel(level, agi), want, `Lv.${level} 민첩 +${agi}%`);
  // Real pets: an untrained 포근 클래식 말, a trained 금실 레어 토끼, a fully trained 별밤 레전더리 쥐.
  assert.deepEqual([agiOf("horse", "classic"), agiOf("rabbit", "rare", 5), agiOf("rat", "legendary", 30)], [5, 7.5, 11.7]);
  assert.equal(cityLevel(1, agiOf("horse", "classic")), 3);
  assert.equal(cityLevel(5, agiOf("rabbit", "rare", 5)), 8);
  assert.equal(cityLevel(12, agiOf("rat", "legendary", 30)), 16);
  // A snack boost waits for the defender's own race.
  assert.equal(agiOf("horse", "classic", 0, 20), agiOf("horse", "classic"));
});

test("a stronger city rival is never easier, and the edition counts through its 민첩", () => {
  for (let level = 1; level <= 30; level++) {
    for (let agi = 0; agi <= 15; agi += 0.5) {
      const here = cityLevel(level, agi);
      assert.ok(here >= 1 && here <= RACE.cap);
      assert.ok(cityLevel(level + 1, agi) >= here);
      assert.ok(cityLevel(level, agi + 0.5) >= here);
    }
  }
  assert.ok(cityLevel(4, agiOf("dragon", "legendary")) > cityLevel(4, agiOf("dragon", "classic")));
});

test("the strongest city rival is still beaten by fast taps alone", () => {
  const race = newRace(cityLevel(999, 15));
  let tap = 0;
  while (race.time < 40 && race.finish.some((t) => t === null)) {
    if (race.time + 1e-8 >= tap / 11) { raceTap(race, "screen"); tap++; }
    stepRace(race, 1 / 240);
  }
  assert.ok(race.finish[0] < race.finish[1]);
});

test("the race leads with the 복수전 the server still owes and tags only those, whatever the news held", async () => {
  const { avenge, owed, townRivals } = await import("../public/game/city.js");
  const card = (id, name) => ({ id, name, kind: "dog", edition: "classic", level: 2, city: "seoul" });
  const [pippo, coco, dodo] = [card("Pippo0000000", "Pippo"), card("Coco00000000", "Coco"), card("Dodo00000000", "Dodo")];
  const town = { city: "seoul", revenge: [pippo], rivals: [coco, dodo] };
  assert.deepEqual(townRivals(town).map((r) => r.name), ["Pippo", "Coco", "Dodo"]);
  assert.deepEqual([pippo, coco, dodo, null].map((r) => owed(town, r)), [true, false, false, false]);
  const won = avenge(town, pippo.id);
  assert.deepEqual([townRivals(won).map((r) => r.name), owed(won, pippo), owed(town, pippo)], [["Pippo", "Coco", "Dodo"], false, true]);
  const reloaded = { ...town, revenge: [], rivals: [coco, dodo, pippo] };
  assert.deepEqual([townRivals(reloaded).map((r) => r.name), owed(reloaded, pippo)], [["Coco", "Dodo", "Pippo"], false]);
  assert.deepEqual(townRivals({ city: "seoul", rivals: [coco] }).map((r) => r.name), ["Coco"]);
  assert.deepEqual([townRivals({ city: null, revenge: [], rivals: [] }), townRivals(null)], [[], []]);
});

test("the 우리 동네 fine print names everything other owners see", () => {
  const race = readFileSync(new URL("../public/game/race.js", import.meta.url), "utf8");
  assert.match(race, /<p class="c-fine">다른 친구들한테는 이름, 동물, 등급, 레벨, 동네, 승리 수만 보여요\. 우리 기록에서 언제든 바꾸거나 나갈 수 있어요\.<\/p>/);
});
