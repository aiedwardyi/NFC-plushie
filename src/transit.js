// Kakao Map: place names to coordinates, then public transit routes between them.

const KAKAO = "https://dapi.kakao.com";
const TIMEOUT_MS = 5000;
const SHOWN = 3;
const KIND = { SUBWAY: "지하철", BUS: "버스", BUS_AND_SUBWAY: "버스+지하철" };
const NO_ROUTE = {
  EQUAL_POINTS: "출발지와 도착지가 같아요.",
  STARTNODES_NULL: "출발지 근처에 역이나 정류장이 없어요.",
  ENDNODES_NULL: "도착지 근처에 역이나 정류장이 없어요.",
};

const minutes = (sec) => Math.max(1, Math.round((sec || 0) / 60));
const stopName = (s) => String(s?.name || "").replace(/\(.*?\)/g, "").trim();
const won = (n) => `${n.toLocaleString("ko-KR")}원`;

function fareOf(fare) {
  if (fare?.value) return won(fare.value);
  if (fare?.min && fare?.max) return fare.min === fare.max ? won(fare.min) : `${won(fare.min)}~${won(fare.max)}`;
  return "";
}

function stepLine({ properties: p = {} }) {
  const stops = (p.stops || []).map(stopName);
  const first = stops[0] || "";
  const last = stops.at(-1) || "";
  const walk = `걸어서 ${minutes(p.time)}분`;
  if (p.type === "WALKING") return first === last ? `${first}에서 갈아타기, ${walk}` : `${first}에서 ${last}까지 ${walk}`;
  const ride = `${first} → ${last}, ${Math.max(stops.length - 1, 1)}정거장 ${minutes(p.time)}분`;
  const vehicles = p.vehicles || [];
  if (p.type === "SUBWAY") return `${vehicles[0]?.name || "지하철"}${vehicles.some((v) => v.type === "급행") ? " 급행" : ""} ${ride}`;
  // Night buses ride along in the list; name them only when nothing else runs.
  const day = vehicles.filter((v) => !v.name.includes("심야"));
  const names = (day.length ? day : vehicles).slice(0, 3).map((v) => v.name).join("·");
  return `${vehicles[0]?.type || ""}버스 ${names}번 ${ride}`;
}

function routeText({ properties: p = {}, steps = [] }, i) {
  const head = [`${i + 1}) ${KIND[p.type] || "대중교통"} ${minutes(p.totalTime)}분`, p.transfers ? `환승 ${p.transfers}번` : "환승 없음", fareOf(p.fare)];
  return [head.filter(Boolean).join(", "), ...steps.map((s) => ` - ${stepLine(s)}`)].join("\n");
}

// Fastest first, and the fastest subway-only way always makes the list.
export function pickRoutes(routes, n = SHOWN) {
  const byTime = [...routes].sort((a, b) => (a.properties?.totalTime ?? Infinity) - (b.properties?.totalTime ?? Infinity));
  const top = byTime.slice(0, n);
  const subway = byTime.find((r) => r.properties?.type === "SUBWAY");
  if (subway && !top.includes(subway)) top[top.length - 1] = subway;
  return top;
}

export function describeRoutes(from, to, routes) {
  return [`출발: ${from.place_name}`, `도착: ${to.place_name}`, ...pickRoutes(routes).map(routeText)].join("\n");
}

export function kakaoTransit({ key, fetch = globalThis.fetch }) {
  async function get(path, params, signal) {
    const limit = AbortSignal.timeout(TIMEOUT_MS);
    const res = await fetch(`${KAKAO}${path}?${new URLSearchParams(params)}`, {
      headers: { Authorization: `KakaoAK ${key}` },
      signal: signal ? AbortSignal.any([signal, limit]) : limit,
    });
    if (!res.ok) throw new Error(`kakao_${res.status}`);
    return res.json();
  }

  // "강남역" should land on the station, not on a cafe named after it.
  async function place(name, signal) {
    const { documents = [] } = await get("/v2/local/search/keyword.json", { query: name, size: "5" }, signal);
    return (/역$/.test(name) && documents.find((d) => d.category_group_code === "SW8")) || documents[0] || null;
  }

  return {
    async route({ from, to, signal }) {
      const [a, b] = [from, to].map((s) => String(s || "").trim().slice(0, 40));
      if (!a || !b) return { ok: false, text: "출발지와 도착지를 둘 다 알려 주세요." };
      try {
        const [start, end] = await Promise.all([place(a, signal), place(b, signal)]);
        if (!start || !end) return { ok: false, text: `'${start ? b : a}'을(를) 지도에서 못 찾았어요.` };
        const r = await get("/v2/routing/publictraffic", {
          start_x: start.x, start_y: start.y, s_name: start.place_name,
          end_x: end.x, end_y: end.y, e_name: end.place_name,
        }, signal);
        if (r.status !== "OK" || !r.routes?.length) return { ok: false, text: NO_ROUTE[r.status] || "대중교통 길을 못 찾았어요." };
        return { ok: true, text: describeRoutes(start, end, r.routes), link: { title: "카카오맵 길찾기", url: String(r.properties?.landingURL || "") } };
      } catch {
        return { ok: false, text: "길찾기가 지금 대답하지 않아요." };
      }
    },
  };
}
