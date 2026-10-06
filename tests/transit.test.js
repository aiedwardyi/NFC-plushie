import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { describeRoutes, kakaoTransit, pickRoutes } from "../src/transit.js";

const KAKAO = JSON.parse(readFileSync(new URL("./fixtures/kakao.json", import.meta.url), "utf8"));
const [AMSA] = KAKAO.places["암사역"];
const [GANGNAM] = KAKAO.places["강남역"];

// Answers like dapi.kakao.com from saved responses and keeps every request.
function kakao({ places = KAKAO.places, way = KAKAO.amsaToGangnam, status = 200 } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    const u = new URL(url);
    calls.push({ url: u, auth: init.headers.Authorization, signal: init.signal });
    const body = u.pathname === "/v2/local/search/keyword.json" ? { documents: places[u.searchParams.get("query")] || [] } : way;
    return { ok: status === 200, status, json: async () => structuredClone(body) };
  };
  return { fetch, calls };
}

test("a route reads as lines, transfers, stops and minutes", () => {
  assert.equal(describeRoutes(AMSA, GANGNAM, KAKAO.amsaToGangnam.routes), [
    "출발: 암사역 8호선",
    "도착: 강남역 2호선",
    "1) 지하철 25분, 환승 1번, 1,650원",
    " - 8호선 암사 → 잠실, 4정거장 8분",
    " - 잠실에서 갈아타기, 걸어서 4분",
    " - 2호선 잠실 → 강남, 6정거장 12분",
    "2) 지하철 30분, 환승 2번, 2,350원",
    " - 8호선 암사 → 석촌, 5정거장 11분",
    " - 석촌에서 갈아타기, 걸어서 2분",
    " - 9호선 급행 석촌 → 신논현, 4정거장 12분",
    " - 신논현에서 갈아타기, 걸어서 4분",
    " - 신분당선 신논현 → 강남, 1정거장 2분",
  ].join("\n"));
});

test("buses name day buses and a fare range; the three fastest ways are shown", () => {
  assert.equal(describeRoutes(GANGNAM, { place_name: "교대역 2호선" }, KAKAO.gangnamToGyodae.routes), [
    "출발: 강남역 2호선",
    "도착: 교대역 2호선",
    "1) 지하철 5분, 환승 없음, 1,550원",
    " - 2호선 강남 → 교대, 1정거장 2분",
    "2) 버스 11분, 환승 없음, 1,500원~2,500원",
    " - 간선버스 740·040번 강남역9번출구 → 지하철2호선교대역4번출구, 3정거장 4분",
    "3) 버스 12분, 환승 없음, 1,200원",
    " - 마을버스 서초10번 강남역9번출구 → 2호선교대역7번출구, 4정거장 6분",
  ].join("\n"));
});

test("the fastest subway-only way always makes the list", () => {
  const way = (type, totalTime) => ({ properties: { type, totalTime } });
  const routes = [way("SUBWAY", 900), way("BUS", 300), way("BUS_AND_SUBWAY", 400), way("BUS", 500), way("SUBWAY", 1000)];
  assert.deepEqual(pickRoutes(routes).map((r) => r.properties.totalTime), [300, 400, 900]);
  assert.deepEqual(pickRoutes(routes.filter((r) => r.properties.type !== "SUBWAY")).map((r) => r.properties.totalTime), [300, 400, 500]);
});

test("route finds both places, then asks for the way with the REST key", async () => {
  const k = kakao();
  const signal = AbortSignal.timeout(20000);
  const out = await kakaoTransit({ key: "rest-key", fetch: k.fetch }).route({ from: "암사역", to: " 강남역 ", signal });
  assert.equal(out.ok, true);
  assert.match(out.text, /^출발: 암사역 8호선\n도착: 강남역 2호선\n1\) 지하철 25분/);
  assert.deepEqual(out.link, { title: "카카오맵 길찾기", url: KAKAO.amsaToGangnam.properties.landingURL });
  assert.deepEqual(k.calls.map((c) => c.url.searchParams.get("query")), ["암사역", "강남역", null]);
  assert.ok(k.calls.every((c) => c.auth === "KakaoAK rest-key" && c.signal instanceof AbortSignal));
  assert.equal(k.calls[2].url.href.split("?")[0], "https://dapi.kakao.com/v2/routing/publictraffic");
  assert.deepEqual(Object.fromEntries(k.calls[2].url.searchParams), {
    start_x: AMSA.x, start_y: AMSA.y, s_name: "암사역 8호선",
    end_x: GANGNAM.x, end_y: GANGNAM.y, e_name: "강남역 2호선",
  });
});

test("a station name lands on the station even when a shop ranks first", async () => {
  const [station, , cafe] = KAKAO.places["강남역"];
  const k = kakao({ places: { ...KAKAO.places, "강남역": [cafe, station], "놀숲": [cafe, station] } });
  const transit = kakaoTransit({ key: "k", fetch: k.fetch });
  await transit.route({ from: "암사역", to: "강남역" });
  await transit.route({ from: "암사역", to: "놀숲" });
  assert.deepEqual([k.calls[2], k.calls[5]].map((c) => c.url.searchParams.get("e_name")), ["강남역 2호선", "놀숲 강남역점"]);
});

test("missing places, no way and a down service come back as plain failures", async () => {
  const route = (q, opts) => kakaoTransit({ key: "k", fetch: kakao(opts).fetch }).route(q);
  assert.deepEqual(await route({ from: "암사역", to: "없는곳" }), { ok: false, text: "'없는곳'을(를) 지도에서 못 찾았어요." });
  assert.deepEqual(await route({ from: "암사역", to: "강남역" }, { way: { status: "EQUAL_POINTS" } }), { ok: false, text: "출발지와 도착지가 같아요." });
  assert.deepEqual(await route({ from: "암사역", to: "강남역" }, { way: { status: "NO_RESULTS" } }), { ok: false, text: "대중교통 길을 못 찾았어요." });
  assert.deepEqual(await route({ from: "암사역", to: "강남역" }, { status: 429 }), { ok: false, text: "길찾기가 지금 대답하지 않아요." });
  assert.deepEqual(await route({ from: "암사역", to: " " }), { ok: false, text: "출발지와 도착지를 둘 다 알려 주세요." });
});
