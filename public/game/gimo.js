/* 기 모으기: the pet charges up and flies as high as the charge, on a PixiJS stage inside its window. Reaches the app only through `api`. */

const CHARGE_MS = 10000;
const NFC_STEP = 0.085;
const SCREEN_STEP = 0.026;
const SCREEN_GAP = 220;
const MAX = 1.25;
const CHUTE_TOP = 8;
const TIERS = [{ id: "cloud", at: 0.25 }, { id: "moon", at: 0.5 }, { id: "star", at: 0.75 }, { id: "galaxy", at: 1 }];
const PLACE = { sky: "하늘", cloud: "구름", moon: "달", star: "별", galaxy: "은하수", beyond: "은하수 너머" };
const tierOf = (c) => (c >= 1.15 ? "beyond" : c >= 1 ? "galaxy" : c >= 0.75 ? "star" : c >= 0.5 ? "moon" : c >= 0.25 ? "cloud" : "sky");
const LAND = { sky: 0.12, moon: 0.5, galaxy: 1, beyond: 1.25 };
const meters = (c) => Math.round(c * 1000) * 10;
const fmt = (n) => n.toLocaleString("ko-KR");
const LINES = {
  ready: { classic: "준비됐어요? 인형을 톡톡!", "8bit": "READY? 인형을 연타!", milk: "준비됐어요? 딸기 로켓 충전!", najeon: "준비되셨나요? 인형을 톡톡." },
  readyScreen: { classic: "준비됐어요? 화면을 톡톡!", "8bit": "READY? 화면을 연타!", milk: "준비됐어요? 화면을 톡톡!", najeon: "준비되셨나요? 화면을 톡톡." },
  go: { classic: "톡톡! 힘을 모아 주세요!", "8bit": "기 모으기! 연타 연타!", milk: "톡톡! 딸기 힘 충전 중!", najeon: "톡톡, 기운을 모아 주세요." },
  hurry: { classic: "조금만 더!", "8bit": "3초 남았어요!", milk: "조금만 더요!", najeon: "조금만 더요!" },
  launch: { classic: "발사!", "8bit": "발사! 슝!", milk: "딸기 로켓 발사!", najeon: "날아올라요!" },
  top: {
    sky: { classic: "하늘을 날았어요!", "8bit": "1스테이지 클리어!", milk: "하늘이 핑크빛이에요!", najeon: "하늘을 날았어요." },
    cloud: { classic: "구름 위까지 왔어요!", "8bit": "구름 스테이지 클리어!", milk: "솜사탕 구름이에요!", najeon: "구름을 타고 왔어요." },
    moon: { classic: "달님, 안녕!", "8bit": "달 스테이지 도착!", milk: "달님도 딸기우유 좋아해요!", najeon: "달님께 인사드려요." },
    star: { classic: "별을 하나 땄어요!", "8bit": "별 스테이지 클리어!", milk: "별이 반짝반짝 딸기맛!", najeon: "별을 하나 땄어요." },
    galaxy: { classic: "은하수까지 왔어요!", "8bit": "은하수 스테이지! 최고 점수!", milk: "우유 은하수예요!", najeon: "은하수를 건넜어요." },
    beyond: { classic: "은하수 너머까지 갔어요!", "8bit": "히든 스테이지 발견!", milk: "딸기 행성 발견!", najeon: "은하수 너머까지 다녀왔어요." },
  },
  home: { classic: "다녀왔어요! 또 날아 볼래요?", "8bit": "착지 성공! 한 판 더?", milk: "착지 성공! 또 날아요!", najeon: "무사히 돌아왔어요." },
  hint: "폰 뒷면 가운데에 인형을 톡!",
};
const PAL = {
  classic: { core: 0xfff2c4, glow: [0xffd36a, 0xffe7a3, 0xfff6d8, 0xbfe4ff, 0xffffff], orb: [0xffe9a8, 0xffffff, 0xffd36a], trail: [0xffd36a, 0xfff2c4, 0xffffff], dust: 0xe8dcc6, ring: 0xffe7a3, bloom: { threshold: 0.35, bloomScale: 1.2, brightness: 1, blur: 7, quality: 6 } },
  "8bit": { core: 0xffec27, glow: [0xffa300, 0xffec27, 0xfff1e8, 0x29adff, 0xff77a8], orb: [0xffec27, 0xff77a8, 0xfff1e8], trail: [0xffa300, 0xffec27, 0xff004d], dust: 0xc2c3c7, ring: 0xffec27, bloom: null },
  milk: { core: 0xffffff, glow: [0xff6fa0, 0xff4f7b, 0xffd0e0, 0xc89cff, 0xffffff], orb: [0xffffff, 0xff8fb3, 0xffd0dc], trail: [0xff8fb3, 0xffffff, 0xff4f7b], dust: 0xffd6e2, ring: 0xff8fb3, bloom: { threshold: 0.35, bloomScale: 1.1, brightness: 1, blur: 7, quality: 6 } },
  najeon: { core: 0xffffff, glow: [0xdbe9ff, 0xf3e6ff, 0xdff6ff, 0xfff4dc, 0xffffff], orb: [0xeef3ff, 0xdff6ff, 0xf6e8ff], trail: [0xeef3ff, 0xdff6ff, 0xf6e8ff], dust: 0x8d9bbd, ring: 0xdbe9ff, bloom: { threshold: 0.35, bloomScale: 1.3, brightness: 1, blur: 8, quality: 6 } },
};
// C D E G A, as playbackRate over each octave's C.
const LADDER = [1, 1.1225, 1.2599, 1.4983, 1.6818];
const TIER_RATE = [1, 1.1225, 1.2599, 1.4983];
const DING_RATE = [1, 1.1892, 1.5874, 2];
const E = {
  lin: (t) => t,
  out2: (t) => 1 - (1 - t) ** 2,
  out3: (t) => 1 - (1 - t) ** 3,
  in2: (t) => t * t,
  io: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  back: (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
  // Flight: a short shove, a long cruise, a soft arrival.
  fly: (t) => (t < 0.12 ? 0.5 * (t / 0.12) ** 2 * 0.12 : 0.06 + 0.94 * (1 - (1 - (t - 0.12) / 0.88) ** 2.2)),
};
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const STOP = Symbol("stop");

// Pieces under /game/art/<world>/, drawn into canvas textures; bump ART_V when one changes.
const ART_V = 2;
const ART = {
  "8bit": ["cloud", "moon", "bird", "planet", "star-0", "star-1", "chute", "shower-0", "shower-1", "shower-2"],
  classic: ["cloud", "moon", "bird", "planet", "chute", "star-0", "star-1", "shower-0", "shower-1"],
  milk: ["cloud", "moon", "bird", "planet", "chute", "shower-0", "shower-1", "shower-2"],
  najeon: ["cloud", "moon", "bird", "planet", "chute", "sun", "star-0", "star-1", "star-2"],
};
const PX = {
  cloud: ["....##....", "..######..", ".#########", "##########", "-########-", ".--------."],
  planet: ["......####........", ".....######.......", "++..########...+++", "..++########+++...", "....++####++......", ".....######.......", "......####........"],
};
const HINT_ART = `<svg viewBox="0 0 40 56" aria-hidden="true"><rect x="6" y="2" width="28" height="52" rx="6" class="h-phone"/><circle cx="20" cy="22" r="7" class="h-spot"/><circle cx="20" cy="22" r="7" class="h-wave"/><circle cx="12" cy="9" r="2.2" class="h-cam"/></svg>`;

// Slow frames during the countdown turn the heavy effects off for the page's life.
let lowFx = false;

function pixSvg(rows, pal) {
  let r = "";
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${pal[ch]}"/>`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges">${r}</svg>`;
}

function iconSvg(id, px) {
  if (px) {
    const PXI = { cloud: [PX.cloud, { "#": "#fff1e8", "-": "#c2c3c7" }], moon: [["..####..", ".#####-.", "####-...", "###.....", "###.....", "####-...", ".#####-.", "..####.."], { "#": "#ffec27", "-": "#ffa300" }], star: [["....#....", "....#....", "...###...", "#########", ".#######.", "..#####..", "..##.##..", ".##...##."], { "#": "#ffec27" }], galaxy: [["...+++....", ".++...#+..", "+..###..+.", "+.#+.+#.+.", "+.#.#.#.+.", ".+.##..+..", "..+...+...", "...+++...."], { "#": "#ff77a8", "+": "#83769c" }], sky: [["#...#...#", ".#..#..#.", "...###...", "##.###.##", "...###...", ".#..#..#.", "#...#...#"], { "#": "#ffa300" }], beyond: [PX.planet, { "#": "#ffa300", "+": "#ffccaa" }] };
    return pixSvg(...PXI[id]).replace("<svg ", '<svg aria-hidden="true" ');
  }
  const SI = {
    cloud: `<path class="i-a" d="M9 25h15a6 6 0 0 0 .7-12 8 8 0 0 0-15.2-1.6A6.8 6.8 0 0 0 9 25z"/>`,
    moon: `<path class="i-a" d="M20.5 4a12 12 0 1 0 7.5 19.8A10.2 10.2 0 0 1 20.5 4z"/>`,
    star: `<path class="i-a" d="M16 3.5l3.6 7.6 8.3 1-6.1 5.7 1.6 8.2L16 22l-7.4 4 1.6-8.2-6.1-5.7 8.3-1z"/>`,
    galaxy: `<circle class="i-a" cx="16" cy="16" r="3.6"/><path class="i-b" d="M16 6.5c5.6 0 9.6 3.4 9.6 7.6M16 25.5c-5.6 0-9.6-3.4-9.6-7.6M6.8 10.8C8.4 7.6 11.8 5.8 16 6.2M25.2 21.2c-1.6 3.2-5 5-9.2 4.6"/>`,
    sky: `<circle class="i-a" cx="16" cy="16" r="6"/><path class="i-b" d="M16 3.5v3.2M16 25.3v3.2M3.5 16h3.2M25.3 16h3.2M7.2 7.2l2.2 2.2M22.6 22.6l2.2 2.2M7.2 24.8l2.2-2.2M22.6 9.4l2.2-2.2"/>`,
    beyond: `<circle class="i-a" cx="16" cy="16" r="7.5"/><ellipse class="i-b" cx="16" cy="16.5" rx="14" ry="4.2" transform="rotate(-16 16 16)"/>`,
  };
  return `<svg viewBox="0 0 32 32" data-icon="${id}" aria-hidden="true">${SI[id]}</svg>`;
}

export async function createGimo(api) {
  // A retry's query reaches the stage module too: a failed module import stays failed for its URL.
  const { makeStage, loadImage: img } = await import(`./stage.js${new URL(import.meta.url).search}`);
  const P = window.PIXI;
  const FX = P.filters;
  const { win, pet: petEl } = api;
  const w = document.documentElement.dataset.theme || "classic";
  const px = w === "8bit";
  const kit = px ? "chip" : "soft";
  const pl = PAL[w] || PAL.classic;
  const pick = (table) => table[w] || table.classic;

  /* ---------- sound and buzz ---------- */
  // A paused run keeps each timer's time left and sets it again on resume.
  const timers = new Set();
  function arm(t) {
    t.at = performance.now();
    t.id = setTimeout(() => {
      timers.delete(t);
      t.fn();
    }, t.left);
  }
  function later(fn, ms) {
    const t = { fn, left: ms, at: 0, id: 0 };
    timers.add(t);
    arm(t);
  }
  const nap = (ms) => new Promise((res) => later(res, ms));
  const play = (name, o = {}) => {
    if (o.at) later(() => api.sfx(name, { rate: o.rate, gain: o.gain }), o.at);
    else api.sfx(name, { rate: o.rate, gain: o.gain });
  };
  const sfx = (name, o) => play(`care-${kit}-${name}`, o);
  const game = (name, o) => play(`game-${kit}-${name}`, o);
  const tapSfx = (name, o) => play(`tap-${kit}-${name}`, o);
  const voice = (mood, o = {}) => play(`cry-${w}-${mood}`, { rate: o.rate || 0.96 + Math.random() * 0.08, at: o.at });
  const buzz = (p) => api.buzz(p);

  /* ---------- textures ---------- */
  const T = {};
  const owned = [];
  // Art is painted once and uploaded again by each stage, so 시작 waits only on the GPU side.
  const painted = new Map();
  function paint(key, cw, ch, draw, nearest) {
    const w = Math.max(1, Math.round(cw));
    const h = Math.max(1, Math.round(ch));
    let c = painted.get(key);
    if (!c || c.width !== w || c.height !== h) {
      c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const x = c.getContext("2d");
      if (nearest) x.imageSmoothingEnabled = false;
      draw(x, w, h);
      painted.set(key, c);
    }
    return c;
  }
  function texOf(c, nearest) {
    const t = P.Texture.from(c);
    if (nearest) t.source.scaleMode = "nearest";
    owned.push(t);
    return t;
  }
  const canvasTex = (key, cw, ch, draw, nearest) => texOf(paint(key, cw, ch, draw, nearest), nearest);
  async function art(name, nearest) {
    const key = `art:${name}`;
    if (!painted.has(key)) {
      const i = await img(`/game/art/${name}.svg?v=${ART_V}`);
      paint(key, i.naturalWidth, i.naturalHeight, (x, cw, ch) => x.drawImage(i, 0, 0, cw, ch), nearest);
    }
    return texOf(painted.get(key), nearest);
  }
  function radial(key, size, stops) {
    return canvasTex(key, size, size, (x, s) => {
      const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      stops.forEach(([o, c]) => g.addColorStop(o, c));
      x.fillStyle = g;
      x.fillRect(0, 0, s, s);
    });
  }
  // Pet faces exactly as the app shows them, so worlds and every animal follow.
  function faceUrl(name) {
    const el = petEl.querySelector(`[data-frame="${name}"]`);
    const c = getComputedStyle(el).content;
    return c && c.startsWith("url(") ? c.slice(5, -2) : el.currentSrc || el.src;
  }
  const pics = new Map();
  const picOf = (url) => pics.get(url) || img(url).then((i) => {
    pics.set(url, i);
    return i;
  });
  let facesFrom = "";
  async function loadFaces() {
    const urls = ["canon", "blink", "react"].map(faceUrl);
    if (urls.join() === facesFrom) return;
    const faces = await Promise.all(urls.map(picOf));
    for (const t of Object.values(T.pet || {})) t.destroy(true);
    T.pet = {};
    ["canon", "blink", "react"].forEach((name, i) => {
      const t = new P.Texture({ source: new P.ImageSource({ resource: faces[i] }) });
      if (px) t.source.scaleMode = "nearest";
      T.pet[name] = t;
    });
    facesFrom = urls.join();
  }

  async function buildTextures(W, H) {
    T.glow = radial("glow", 128, [[0, "rgba(255,255,255,1)"], [0.25, "rgba(255,255,255,.75)"], [0.6, "rgba(255,255,255,.18)"], [1, "rgba(255,255,255,0)"]]);
    T.soft = radial("soft", 64, [[0, "rgba(255,255,255,.9)"], [0.5, "rgba(255,255,255,.35)"], [1, "rgba(255,255,255,0)"]]);
    T.puff = radial("puff", 64, [[0, "rgba(255,255,255,.85)"], [0.55, "rgba(255,255,255,.5)"], [1, "rgba(255,255,255,0)"]]);
    T.ring = canvasTex("ring", 128, 128, (x) => { x.strokeStyle = "#fff"; x.lineWidth = 7; x.shadowColor = "#fff"; x.shadowBlur = 10; x.beginPath(); x.arc(64, 64, 52, 0, Math.PI * 2); x.stroke(); });
    T.streak = canvasTex("streak", 8, 128, (x) => { const g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.6, "rgba(255,255,255,.9)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(2, 0, 4, 128); });
    T.rays = canvasTex("rays", 512, 512, (x) => {
      x.translate(256, 256);
      for (let i = 0; i < 18; i++) {
        x.rotate((Math.PI * 2) / 18);
        const g = x.createLinearGradient(0, 0, 0, -256);
        g.addColorStop(0, "rgba(255,255,255,.55)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        x.fillStyle = g;
        x.beginPath();
        x.moveTo(0, 0);
        x.lineTo(-22, -256);
        x.lineTo(22, -256);
        x.closePath();
        x.fill();
      }
    });
    T.pix = canvasTex("pix", 4, 4, (x) => { x.fillStyle = "#fff"; x.fillRect(0, 0, 4, 4); }, true);
    T.pixRing = canvasTex("pixRing", 32, 32, (x) => { x.fillStyle = "#fff"; x.fillRect(0, 0, 32, 3); x.fillRect(0, 29, 32, 3); x.fillRect(0, 0, 3, 32); x.fillRect(29, 0, 3, 32); }, true);
    const names = ART[w] || ART.classic;
    const [shared, pieces] = await Promise.all([
      Promise.all(["spark", "heart", "petal"].map((n) => art(n))),
      Promise.all(names.map((n) => art(`${w in ART ? w : "classic"}/${n}`, px))),
      loadFaces(),
    ]);
    [T.spark, T.heart, T.petal] = shared;
    const A = Object.fromEntries(names.map((n, i) => [n, pieces[i]]));
    T.cloud = [A.cloud];
    T.moon = A.moon;
    T.bird = A.bird;
    T.planet = A.planet;
    T.chute = A.chute;
    if (px) {
      T.star = [A["star-0"], A["star-1"]];
      T.shower = [A["shower-0"], A["shower-1"], A["shower-2"]];
    } else if (w === "milk") {
      T.star = [T.heart, T.spark];
      T.shower = [A["shower-0"], A["shower-1"], A["shower-2"]];
    } else if (w === "najeon") {
      T.sun = A.sun;
      T.star = [A["star-0"], A["star-1"], A["star-2"]];
      T.shower = T.star;
    } else {
      T.star = [A["star-0"], A["star-1"]];
      T.shower = [A["shower-0"], A["shower-1"]];
    }
    T.sky = skyTex(W, H);
    T.ground = groundTex(W, H);
    T.galaxy = galaxyTex();
  }

  // Tall sky column, bottom = the window's own sky at rest.
  const altOf = (c, H) => c * 4.7 * H;
  function skyTex(W, H) {
    const Ht = 7 * H;
    const at = (c) => 1 - (0.5 * H + altOf(c, H)) / Ht;
    const stops = {
      classic: [[0, "#fff9f0"], [-0.2, "#fff9f0"], [0.12, "#cfe8f6"], [0.25, "#a9d3f0"], [0.4, "#86b5e6"], [0.5, "#6a86cf"], [0.62, "#4a4f9a"], [0.75, "#2a2c63"], [1, "#1a1b48"], [1.25, "#0e0f27"]],
      milk: [[0, "#fff1f4"], [-0.2, "#fff1f4"], [0.12, "#ffd0dc"], [0.25, "#ffb6cb"], [0.4, "#ff9fbd"], [0.5, "#e889bd"], [0.62, "#c070ad"], [0.75, "#8a4f94"], [1, "#4b2a5e"], [1.25, "#2a1838"]],
      najeon: [[0, "#121119"], [0.5, "#0f0e15"], [1, "#0b0a10"], [1.25, "#07060a"]],
    }[w] || [];
    if (px) {
      return canvasTex("sky", W, Ht, (x, cw, ch) => {
        const band = (y0, y1, col) => { x.fillStyle = col; x.fillRect(0, y0, cw, y1 - y0); };
        const yOf = (c) => Math.round(at(c) * ch);
        band(0, yOf(0.95), "#000000");
        band(yOf(0.95), yOf(0.55), "#1d2b53");
        band(yOf(0.55), ch, "#29adff");
        const dither = (y, a, b) => { for (let yy = 0; yy < 12; yy += 3) for (let xx = 0; xx < cw; xx += 3) { x.fillStyle = ((xx + yy) / 3) % 2 ? a : b; x.fillRect(xx, y - 6 + yy, 3, 3); } };
        dither(yOf(0.95), "#000000", "#1d2b53");
        dither(yOf(0.55), "#1d2b53", "#29adff");
      }, true);
    }
    return canvasTex("sky", W, Ht, (x, cw, ch) => {
      const g = x.createLinearGradient(0, 0, 0, ch);
      stops.slice().sort((a, b) => at(a[0]) - at(b[0])).forEach(([c, col]) => g.addColorStop(clamp(at(c), 0, 1), col));
      x.fillStyle = g;
      x.fillRect(0, 0, cw, ch);
      if (w === "najeon") {
        // Faint pearl dust in the lacquer.
        let s = 3;
        const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
        for (let i = 0; i < 420; i++) { x.fillStyle = `rgba(${220 + R() * 35},${230 + R() * 25},255,${0.04 + R() * 0.12})`; x.fillRect(R() * cw, R() * ch, 1.2, 1.2); }
      }
    });
  }
  function groundTex(W, H) {
    const gh = Math.round(0.27 * H);
    if (px) return canvasTex("ground", W, gh, (x, cw, ch) => { x.fillStyle = "#00e436"; x.fillRect(0, 0, cw, ch); x.fillStyle = "#008751"; x.fillRect(0, 0, cw, 6); x.fillStyle = "#ab5236"; x.fillRect(0, ch * 0.45, cw, ch); }, true);
    return canvasTex("ground", W * 2, gh * 2, (x, cw, ch) => {
      if (w === "milk") {
        x.fillStyle = "#fff";
        x.fillRect(0, 0, cw, ch);
        x.fillStyle = "rgba(255,143,179,.5)";
        for (let i = 0; i < cw; i += 56) x.fillRect(i, 0, 28, ch);
        for (let j = 0; j < ch; j += 56) x.fillRect(0, j, cw, 28);
      } else if (w === "najeon") {
        x.fillStyle = "#0b0a0e";
        x.fillRect(0, 0, cw, ch);
        x.strokeStyle = "rgba(236,233,242,.7)";
        x.lineWidth = 2.4;
        for (let row = 0, y = 34; y < ch + 40; y += 30, row++) for (let i = (row % 2) * 36 - 36; i < cw + 72; i += 72) for (const r of [30, 20, 10]) { x.beginPath(); x.arc(i, y, r, Math.PI, 0); x.stroke(); }
      } else {
        const g = x.createLinearGradient(0, 0, 0, ch);
        g.addColorStop(0, "#f3ebdd");
        g.addColorStop(1, "#e8dcc6");
        x.fillStyle = g;
        x.fillRect(0, 0, cw, ch);
        x.fillStyle = "rgba(255,255,255,.7)";
        x.fillRect(0, 0, cw, 2);
      }
    });
  }
  function galaxyTex() {
    let s = 9;
    const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
    return canvasTex("galaxy", px ? 200 : 800, px ? 60 : 240, (x, cw, ch) => {
      if (px) {
        for (let i = 0; i < 520; i++) {
          const xx = Math.floor(R() * cw);
          const yy = Math.floor(ch / 2 + (R() - 0.5) * ch * 0.5 * (1 + R()));
          x.fillStyle = ["#ff77a8", "#83769c", "#fff1e8", "#29adff"][Math.floor(R() * 4)];
          x.fillRect(xx, yy, 2, 2);
        }
        return;
      }
      const g = x.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, cw / 2);
      const col = { classic: ["rgba(255,255,255,.6)", "rgba(217,194,255,.42)", "rgba(255,179,217,.2)"], milk: ["rgba(255,255,255,.9)", "rgba(255,244,248,.6)", "rgba(255,194,214,.22)"], najeon: ["rgba(240,248,255,.55)", "rgba(191,227,255,.35)", "rgba(243,230,255,.2)"] }[w] || [];
      g.addColorStop(0, col[0]);
      g.addColorStop(0.35, col[1]);
      g.addColorStop(0.65, col[2]);
      g.addColorStop(1, "rgba(255,255,255,0)");
      x.save();
      x.scale(1, ch / cw);
      x.fillStyle = g;
      x.beginPath();
      x.arc(cw / 2, cw / 2, cw / 2, 0, Math.PI * 2);
      x.fill();
      x.restore();
      for (let i = 0; i < 700; i++) {
        const xx = R() * cw;
        const spread = Math.sin((xx / cw) * Math.PI);
        const yy = ch / 2 + (R() - 0.5) * ch * 0.7 * spread * (0.4 + R());
        x.fillStyle = w === "milk" && R() > 0.85 ? "rgba(255,79,123,.95)" : `rgba(255,255,255,${0.35 + R() * 0.65})`;
        x.beginPath();
        x.arc(xx, yy, 0.6 + R() * 2.2 * spread, 0, Math.PI * 2);
        x.fill();
      }
    }, px);
  }

  /* ---------- stage: made on 시작, dropped when the game ends ---------- */
  let stage = null;
  let app = null;
  let built = false;
  let W = 0;
  let H = 0;
  let floorY = 0;
  let petSize = 0;
  let S = {};
  let alt = 0;
  let shake = 0;
  let zoom = 1;
  let zoomV = 0;
  let speed = 0;
  let calm = false;
  let samples = null;
  const spring = { x: 1, y: 1, vx: 0, vy: 0, tx: 1, ty: 1 };
  const tweens = [];
  const parts = [];
  const tickers = new Set();

  function tween(ms, fn, ease = E.lin) {
    return new Promise((res) => tweens.push({ t: 0, d: ms / 1000, fn, ease, res }));
  }
  function emit(tex, o) {
    const s = new P.Sprite(Array.isArray(tex) ? tex[Math.floor(Math.random() * tex.length)] : tex);
    s.anchor.set(0.5);
    s.blendMode = o.blend || "add";
    s.x = o.x;
    s.y = o.y;
    s.rotation = o.rot || 0;
    s.tint = o.tint ?? 0xffffff;
    (o.layer || S.fxFront).addChild(s);
    const p = { s, vx: o.vx || 0, vy: o.vy || 0, ax: o.ax || 0, ay: o.ay || 0, life: o.life || 1, age: 0, s0: o.s0 ?? 0.5, s1: o.s1 ?? 0, a0: o.a0 ?? 1, a1: o.a1 ?? 0, spin: o.spin || 0, drag: o.drag || 0, update: o.update, stretch: o.stretch || 0, snap: px };
    parts.push(p);
    return p;
  }
  function stepParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1 || p.s.destroyed) { if (!p.s.destroyed) p.s.destroy(); parts.splice(i, 1); continue; }
      if (p.update) p.update(p, k, dt);
      else {
        p.vx += p.ax * dt;
        p.vy += p.ay * dt;
        const d = Math.pow(1 - p.drag, dt * 60);
        p.vx *= d;
        p.vy *= d;
        p.s.x += p.vx * dt;
        p.s.y += p.vy * dt;
      }
      const sc = p.s0 + (p.s1 - p.s0) * k;
      if (p.stretch) {
        p.s.scale.set(sc, sc * (1 + Math.hypot(p.vx, p.vy) * p.stretch));
        p.s.rotation = Math.atan2(p.vy, p.vx) - Math.PI / 2;
      } else {
        p.s.scale.set(sc);
        p.s.rotation += p.spin * dt;
      }
      p.s.alpha = p.a0 + (p.a1 - p.a0) * k;
      if (p.snap) { p.s.x = Math.round(p.s.x / 2) * 2; p.s.y = Math.round(p.s.y / 2) * 2; }
    }
  }

  // Screen y for a world item `off` px above the window center when the camera is at tier value c.
  function placeY(f, c, off) {
    return H - (0.5 * H + altOf(c, H) * f + off);
  }

  function measure() {
    const pr = petEl.getBoundingClientRect();
    const wr = win.getBoundingClientRect();
    return { W: win.clientWidth, H: win.clientHeight, petSize: pr.width, floorY: pr.bottom - wr.top };
  }

  async function setupStage() {
    const g = gen;
    ({ W, H, petSize, floorY } = measure());
    await buildTextures(W, H);
    if (g !== gen) throw STOP;
    const made = await makeStage(P, { width: W, height: H, roundPixels: px, fault: lost });
    // Left while the stage was being made: it goes at once.
    if (g !== gen) {
      made.drop();
      throw STOP;
    }
    stage = made;
    app = made.app;
    S = {};
    const holder = document.createElement("div");
    holder.className = "g2-stage";
    holder.setAttribute("aria-hidden", "true");
    holder.appendChild(app.canvas);
    win.insertBefore(holder, petEl);
    S.holder = holder;
    const st = app.stage;
    S.cam = new P.Container();
    S.cam.pivot.set(W / 2, H / 2);
    S.cam.position.set(W / 2, H / 2);
    st.addChild(S.cam);
    S.worldC = new P.Container();
    S.cam.addChild(S.worldC);
    S.sky = new P.Sprite(T.sky);
    S.sky.width = W;
    S.sky.height = 7 * H;
    S.far = new P.Container();
    S.mid = new P.Container();
    S.near = new P.Container();
    S.worldC.addChild(S.sky, S.far, S.mid, S.near);
    S.worldC.visible = false;
    S.fxBack = new P.Container();
    S.petC = new P.Container();
    S.fxFront = new P.Container();
    S.cam.addChild(S.fxBack, S.petC, S.fxFront);
    S.flash = new P.Sprite(P.Texture.WHITE);
    S.flash.width = W;
    S.flash.height = H;
    S.flash.alpha = 0;
    st.addChild(S.flash);
    // Pet: bottom-center anchor so squash grows out of the floor.
    S.chute = new P.Sprite(T.chute);
    S.chute.anchor.set(0.5, 1);
    S.chute.visible = false;
    S.pet = new P.Sprite(T.pet.canon);
    S.pet.anchor.set(0.5, 1);
    S.pet.width = petSize;
    S.pet.height = petSize;
    S.petBase = S.pet.scale.x;
    S.petFlash = new P.Sprite(T.pet.canon);
    S.petFlash.blendMode = "add";
    S.petFlash.alpha = 0;
    S.petC.addChild(S.chute, S.pet, S.petFlash);
    S.petC.position.set(W / 2, floorY);
    // Aura.
    S.aura = new P.Container();
    S.auraHalo = new P.Sprite(T.glow);
    S.auraCore = new P.Sprite(T.glow);
    S.rays = new P.Sprite(T.rays);
    S.floorGlow = new P.Sprite(T.glow);
    for (const s of [S.auraHalo, S.auraCore, S.rays, S.floorGlow]) { s.anchor.set(0.5); s.blendMode = px ? "normal" : "add"; s.alpha = 0; }
    S.aura.addChild(S.rays, S.auraHalo, S.auraCore);
    S.fxBack.addChild(S.floorGlow, S.aura);
    S.motes = Array.from({ length: 10 }, (_, i) => {
      const m = new P.Sprite(px ? T.pix : T.glow);
      m.anchor.set(0.5);
      m.blendMode = px ? "normal" : "add";
      m.tint = pl.orb[i % pl.orb.length];
      m.alpha = 0;
      S.fxBack.addChild(m);
      return m;
    });
    S.sparks = new P.Graphics();
    S.sparks.blendMode = "add";
    S.fxBack.addChild(S.sparks);
    S.keep = new Set([S.floorGlow, S.aura, S.sparks, ...S.motes]);
    buildWorld();
    S.blur = px ? null : new FX.MotionBlurFilter({ velocity: { x: 0, y: 0 }, kernelSize: 11 });
    S.bloom = pl.bloom ? new FX.AdvancedBloomFilter(pl.bloom) : null;
    S.shocks = [];
    S.hue = w === "najeon" ? new P.ColorMatrixFilter() : null;
    if (S.hue) { S.mid.filters = [S.hue]; S.far.filters = [S.hue]; }
    // Fixed filter areas: growing bounds would re-allocate GPU targets mid-show.
    S.fxFront.filterArea = new P.Rectangle(0, 0, W, H);
    S.cam.filterArea = new P.Rectangle(0, 0, W, H);
    // Warm every shader before the show.
    S.worldC.visible = true;
    S.worldC.filters = S.blur ? [S.blur] : null;
    S.fxFront.filters = S.bloom ? [S.bloom] : null;
    const warm = px ? null : new FX.ShockwaveFilter({ center: { x: W / 2, y: H / 2 }, amplitude: 1, wavelength: 50, radius: 10 });
    S.cam.filters = warm ? [warm] : null;
    S.sparks.moveTo(0, 0).lineTo(1, 1).stroke({ width: 2, color: 0xffffff, alpha: 0.01 });
    stage.draw();
    S.cam.filters = null;
    warm?.destroy();
    S.sparks.clear();
    S.worldC.visible = false;
    S.holder.style.visibility = "hidden";
    resetStage();
    built = true;
  }
  // A frame that threw or a lost context: the game ends, or the stage goes if none is on.
  function lost(error) {
    console.error(error);
    exit("aborted");
  }
  // Bloom only lights the effects; on the sky or the fur it washes the frame out.
  function applyCamFilters() {
    S.fxFront.filters = S.bloom && !lowFx ? [S.bloom] : null;
    S.cam.filters = S.shocks.length ? S.shocks.map((s) => s.f) : null;
    S.worldC.filters = S.blur && !lowFx && !calm ? [S.blur] : null;
  }
  function shockwave(x, y, amp, wl, ms, radius = -1) {
    if (px || lowFx || calm) return;
    const f = new FX.ShockwaveFilter({ center: { x, y }, amplitude: amp, wavelength: wl, brightness: 1.0, speed: 520, radius });
    S.shocks.push({ f, t: 0, d: ms / 1000 });
    applyCamFilters();
  }

  function buildWorld() {
    const add = (layer, tex, x, y, o = {}) => {
      const s = new P.Sprite(tex);
      s.anchor.set(0.5);
      s.x = x;
      s.y = y;
      if (o.w) s.scale.set(o.w / tex.width);
      if (o.rot) s.rotation = o.rot;
      if (o.alpha != null) s.alpha = o.alpha;
      layer.addChild(s);
      return s;
    };
    // Ground strip on the near layer at the window floor.
    const g = new P.Sprite(T.ground);
    g.width = W;
    g.height = Math.round(0.27 * H);
    g.y = H - g.height;
    S.near.addChild(g);
    // Clouds: near layer, from just above the floor to the moon zone.
    const cl = [[0.06, 0.18, 150], [0.12, 0.72, 118], [0.19, 0.08, 176], [0.26, 0.78, 140], [0.33, 0.2, 124], [0.4, 0.7, 160], [0.47, 0.12, 112], [0.55, 0.85, 120]];
    S.clouds = cl.map(([c, xf, cw], i) => add(S.near, T.cloud[0], xf * W, placeY(1, c, (i % 2 ? 1 : -1) * 0.18 * H), { w: px ? cw * 0.8 : cw }));
    // Birds / balloons / cranes, sun.
    const fl = [[0.2, 0.22, 74], [0.31, 0.72, 58]];
    S.birds = fl.map(([c, xf, bw]) => add(S.mid, T.bird, xf * W, placeY(0.8, c, 0.1 * H), { w: px ? bw * 0.5 : bw }));
    if (T.sun) S.sun = add(S.mid, T.sun, 0.2 * W, placeY(0.8, 0.22, 0.24 * H), { w: 62 });
    // Moon upper right of the frame when the camera parks on it.
    S.moon = add(S.mid, T.moon, W - 70, placeY(0.8, 0.5, 0.2 * H), { w: px ? 96 : 104 });
    S.moonGlow = add(S.mid, T.glow, S.moon.x, S.moon.y, { w: 260, alpha: px ? 0 : 0.55 });
    S.moonGlow.blendMode = "add";
    S.moonGlow.tint = w === "milk" ? 0xffc2d6 : w === "najeon" ? 0xdbe9ff : 0xfff0c0;
    S.mid.addChildAt(S.moonGlow, S.mid.getChildIndex(S.moon));
    // Stars: far layer, spread from dusk to deep space.
    S.stars = [];
    let s = 4;
    const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 70; i++) {
      const c = 0.55 + R() * 0.85;
      const st = add(S.far, T.star[i % T.star.length], R() * W, placeY(0.55, c, (R() - 0.5) * H), { w: px ? (R() > 0.7 ? 12 : 6) : 7 + R() * 12 });
      st.tw = R() * 6.28;
      st.base = st.scale.x;
      if (!px) st.blendMode = "add";
      S.stars.push(st);
    }
    // Galaxy band behind the pet at its tier.
    S.galaxy = add(S.far, T.galaxy, W / 2, placeY(0.55, 1, 0), { w: W * 1.9, rot: -0.31 });
    S.galaxy.height = 0.56 * H;
    if (!px) S.galaxy.blendMode = "add";
    S.planet = add(S.far, T.planet, 0.24 * W, placeY(0.55, 1.25, 0.2 * H), { w: px ? 126 : 116 });
    S.planetBase = S.planet.scale.x;
  }

  function frame(ms) {
    // Paused, the stage still draws its last frame but nothing moves.
    if (paused) return;
    if (samples) samples.push(ms);
    const dt = Math.min(0.05, ms / 1000);
    const t = performance.now() / 1000;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.d);
      tw.fn(tw.ease(k), k);
      if (k >= 1) { tweens.splice(i, 1); tw.res(); }
    }
    for (const fn of tickers) fn(dt, t);
    // Pet jelly spring.
    const sp = spring;
    sp.vx += (220 * (sp.tx - sp.x) - 11 * sp.vx) * dt;
    sp.vy += (220 * (sp.ty - sp.y) - 11 * sp.vy) * dt;
    sp.x += sp.vx * dt;
    sp.y += sp.vy * dt;
    const fs = S.petC.flyScale || 1;
    S.pet.scale.set(S.petBase * sp.x * fs, S.petBase * sp.y * fs);
    // Airborne the pet spins about its middle; on the ground it squashes out of the floor.
    S.pet.y = S.pet.anchor.y === 1 ? 0 : -petSize * fs * 0.5;
    if (S.chute.visible) S.chute.y = -petSize * fs * 1.0;
    const pf = S.petFlash;
    pf.texture = S.pet.texture;
    pf.anchor.copyFrom(S.pet.anchor);
    pf.scale.copyFrom(S.pet.scale);
    pf.position.copyFrom(S.pet.position);
    pf.rotation = S.pet.rotation;
    pf.alpha *= Math.pow(0.0015, dt);
    // Camera: parallax world, shake, zoom punch.
    S.sky.y = H - 7 * H + alt;
    S.far.y = alt * 0.55;
    S.mid.y = alt * 0.8;
    S.near.y = alt;
    if (calm) {
      shake = 0;
      zoomV = 0;
      S.flash.alpha = 0;
    }
    zoomV += (220 * (1 - zoom) - 14 * zoomV) * dt;
    zoom += zoomV * dt;
    shake *= Math.pow(0.0009, dt);
    const sx = (Math.random() - 0.5) * 2 * shake;
    const sy = (Math.random() - 0.5) * 2 * shake;
    S.cam.position.set(W / 2 + (px ? Math.round(sx / 2) * 2 : sx), H / 2 + (px ? Math.round(sy / 2) * 2 : sy));
    S.cam.scale.set(zoom);
    if (S.blur) S.blur.velocity = { x: 0, y: Math.min(26, speed * 0.016) };
    for (const st of S.stars) st.scale.set(st.base * (0.75 + 0.35 * Math.sin(t * 3 + st.tw)));
    if (S.hue) S.hue.hue(Math.sin(t * 1.4) * 22, false);
    for (let i = S.shocks.length - 1; i >= 0; i--) {
      const s = S.shocks[i];
      s.t += dt;
      s.f.time = s.t;
      if (s.t >= s.d) { S.shocks.splice(i, 1); s.f.destroy(); applyCamFilters(); }
    }
    stepParts(dt);
  }

  /* ---------- charge visuals ---------- */
  let charge = 0;
  let reached = 0;
  function petCenter() {
    return { x: S.petC.x, y: S.petC.y - petSize * 0.5 * (S.petC.flyScale || 1) };
  }
  function auraTick(dt, t) {
    const c = charge;
    const { x, y } = petCenter();
    S.aura.position.set(x, y + petSize * 0.06);
    const breathe = 1 + 0.06 * Math.sin(t * 7) + (c > 0.75 ? 0.04 * Math.sin(t * 23) : 0);
    S.auraCore.scale.set((0.9 + c * 0.9) * breathe);
    S.auraCore.alpha = clamp(0.08 + c * 0.6, 0, 0.8);
    S.auraHalo.scale.set((1.5 + c * 1.1) * breathe);
    S.auraHalo.alpha = clamp(0.05 + c * 0.3, 0, 0.42);
    S.rays.rotation += dt * (0.4 + c);
    S.rays.scale.set(0.7 + c * 0.45);
    S.rays.alpha = clamp((c - 0.35) * 1.2, 0, 0.75);
    S.floorGlow.position.set(S.petC.x, S.petC.y - 4);
    S.floorGlow.scale.set(1.2 + c * 0.9, 0.26 + c * 0.12);
    S.floorGlow.alpha = clamp(c * 0.7, 0, 0.6);
    const ring = clamp((c - 0.45) * 2.4, 0, 1);
    S.motes.forEach((m, i) => {
      const a = t * (1.6 + c) + (i / S.motes.length) * Math.PI * 2;
      const r = petSize * (0.52 + 0.06 * Math.sin(t * 5 + i));
      m.position.set(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.42 + petSize * 0.08);
      m.scale.set(px ? 1.6 : 0.16 + 0.05 * Math.sin(t * 9 + i));
      m.alpha = ring * (Math.sin(a) > -0.2 ? 1 : 0.35);
    });
    // Lightning crackle at full power.
    S.sparks.clear();
    if (c >= 0.75 && !px && !lowFx && !calm && Math.random() < 0.55) {
      for (let k = 0; k < 2; k++) {
        const a0 = rnd(0, Math.PI * 2);
        let px0 = x + Math.cos(a0) * petSize * 0.25;
        let py0 = y + Math.sin(a0) * petSize * 0.3;
        S.sparks.moveTo(px0, py0);
        for (let j = 0; j < 5; j++) {
          px0 += Math.cos(a0) * 14 + rnd(-9, 9);
          py0 += Math.sin(a0) * 14 + rnd(-9, 9);
          S.sparks.lineTo(px0, py0);
        }
      }
      S.sparks.stroke({ width: 2, color: pl.glow[Math.min(4, reached)], alpha: 0.9 });
    }
    // Pebbles and motes drift up off the floor as power builds.
    if (c > 0.3 && Math.random() < c * 0.5) {
      emit(px ? T.pix : T.soft, { x: S.petC.x + rnd(-petSize * 0.6, petSize * 0.6), y: S.petC.y + rnd(-6, 6), vy: -rnd(30, 70) * (0.5 + c), vx: rnd(-6, 6), life: rnd(0.9, 1.6), s0: px ? 1.5 : rnd(0.08, 0.16), s1: 0, a0: 0.9, a1: 0, tint: pl.orb[Math.floor(rnd(0, 3))], layer: S.fxBack });
    }
  }
  function inflow(n, big) {
    const { x, y } = petCenter();
    for (let i = 0; i < n; i++) {
      const a0 = rnd(0, Math.PI * 2);
      const r0 = rnd(150, 210) * (big ? 1.1 : 0.85);
      const spin = rnd(1.4, 2.4) * (Math.random() < 0.5 ? -1 : 1);
      const life = rnd(0.38, 0.55);
      emit(px ? T.pix : T.glow, {
        x, y, life, s0: px ? 2.2 : big ? 0.22 : 0.15, s1: px ? 1 : 0.05, a0: 1, a1: 0.6, tint: pl.orb[i % pl.orb.length], layer: S.fxBack,
        update: (p, k) => {
          const e = k * k;
          const r = r0 * (1 - e);
          const a = a0 + spin * e;
          const nx = x + Math.cos(a) * r;
          const ny = y + Math.sin(a) * r * 0.8;
          if (!px && Math.random() < 0.5) emit(T.glow, { x: p.s.x, y: p.s.y, life: 0.22, s0: 0.07, s1: 0, a0: 0.6, a1: 0, tint: pl.orb[0], layer: S.fxBack });
          p.s.x = nx;
          p.s.y = ny;
        },
      });
    }
  }
  function burst(x, y, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2);
      const v = rnd(o.v0 || 120, o.v1 || 320);
      emit(o.tex || (px ? T.pix : T.spark), { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ay: o.g || 0, drag: o.drag ?? 0.04, life: rnd(0.5, o.life || 0.9), s0: px ? 2 : rnd(0.25, 0.5), s1: 0, a0: 1, a1: 0, spin: rnd(-6, 6), tint: (o.tint || pl.orb)[i % (o.tint || pl.orb).length], blend: o.blend, layer: o.layer });
    }
  }
  function ringPulse(x, y, scale, tint, ms = 600) {
    const r = new P.Sprite(px ? T.pixRing : T.ring);
    r.anchor.set(0.5);
    r.position.set(x, y);
    r.tint = tint;
    r.blendMode = px ? "normal" : "add";
    S.fxFront.addChild(r);
    tween(ms, (k) => { r.scale.set((px ? 1.6 : 0.25) + k * scale); r.alpha = 1 - k; }, px ? (k) => Math.floor(E.out3(k) * 5) / 5 : E.out3).then(() => r.destroy());
  }
  function dust(n, spread, up = 1) {
    for (let i = 0; i < n; i++) {
      const dir = i % 2 ? 1 : -1;
      emit(px ? T.pix : T.puff, { x: S.petC.x + dir * rnd(10, petSize * 0.3), y: S.petC.y - rnd(0, 8), vx: dir * rnd(60, 160) * spread, vy: -rnd(10, 60) * up, drag: 0.06, life: rnd(0.5, 0.9), s0: px ? 3 : rnd(0.3, 0.5), s1: px ? 1 : rnd(0.7, 1), a0: 0.7, a1: 0, tint: pl.dust, blend: "normal" });
    }
  }

  /* ---------- HUD (DOM inside the window) ---------- */
  const doms = new Set();
  let hudEl = null;
  let shownHeight = 0;
  let heightTween = 0;
  // The pet's 힘 bonus in percent, read as each play starts. Floored, so a full charge stays under the server's cap.
  let str = 0;
  const reach = (c) => Math.floor((meters(c) * (1 + str / 100)) / 10) * 10;
  function setHeight(n, instant) {
    cancelAnimationFrame(heightTween);
    const el = hudEl?.querySelector(".g-height b");
    if (!el) return;
    if (instant) { shownHeight = n; el.textContent = fmt(n); return; }
    const from = shownHeight;
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 260);
      shownHeight = Math.round((from + (n - from) * (1 - (1 - k) ** 3)) / 10) * 10;
      el.textContent = fmt(shownHeight);
      if (k < 1) heightTween = requestAnimationFrame(step);
    };
    heightTween = requestAnimationFrame(step);
  }
  function domAdd(cls, html = "", parent = win) {
    const el = document.createElement("div");
    el.className = cls;
    el.innerHTML = html;
    parent.appendChild(el);
    doms.add(el);
    return el;
  }
  const domAnim = (el, frames, o) => el.animate(frames, { fill: "forwards", ...o }).finished.catch(() => {});
  function bigText(text, cls = "") {
    const el = domAdd(`g-big ${cls}`, text);
    el.setAttribute("aria-hidden", "true");
    const frames = calm
      ? [{ opacity: 0 }, { opacity: 1, offset: 0.22 }, { opacity: 1, offset: 0.86 }, { opacity: 0 }]
      : [{ transform: "scale(.2)", opacity: 0 }, { transform: "scale(1.15)", opacity: 1, offset: 0.22 }, { transform: "scale(1)", opacity: 1, offset: 0.4 }, { transform: "scale(1)", opacity: 1, offset: 0.86 }, { transform: "scale(1.1)", opacity: 0 }];
    domAnim(el, frames, { duration: 560, easing: calm ? "linear" : px ? "steps(6)" : "cubic-bezier(.3,1.2,.5,1)" }).then(() => { el.remove(); doms.delete(el); });
  }

  /* ---------- game flow ---------- */
  let phase = "idle";
  // Bumped by every play and every exit: a run's awaits find out they are stale through hold().
  let gen = 0;
  let done = null;
  let taps = 0;
  let nfcTaps = 0;
  let lastScreen = 0;
  let best = 0;
  let mode = "nfc";
  let hintEl = null;
  let reply = null;
  let paused = null;
  const face = (n) => { S.pet.texture = T.pet[n] || T.pet.canon; };
  const say = (text) => api.say(text);

  // Every await in a run goes through here, so an ended run stops at its next step.
  async function hold(p) {
    const g = gen;
    const v = await p;
    if (g !== gen) throw STOP;
    return v;
  }

  function resetStage() {
    tweens.length = 0;
    tickers.clear();
    for (const p of parts) if (!p.s.destroyed) p.s.destroy();
    parts.length = 0;
    for (const c of [...S.fxBack.children]) if (!S.keep.has(c)) c.destroy();
    for (const c of [...S.fxFront.children]) c.destroy();
    for (const s of S.shocks) s.f.destroy();
    S.shocks = [];
    alt = 0;
    shake = 0;
    zoom = 1;
    zoomV = 0;
    speed = 0;
    charge = 0;
    reached = 0;
    Object.assign(spring, { x: 1, y: 1, vx: 0, vy: 0, tx: 1, ty: 1 });
    S.petC.position.set(W / 2, floorY);
    S.petC.rotation = 0;
    S.petC.flyScale = 1;
    S.pet.anchor.set(0.5, 1);
    S.pet.rotation = 0;
    S.pet.texture = T.pet.canon;
    S.petFlash.alpha = 0;
    S.chute.visible = false;
    S.chute.alpha = 1;
    S.chute.scale.set(1);
    S.worldC.visible = false;
    S.worldC.alpha = 1;
    S.flash.alpha = 0;
    for (const s of [S.auraCore, S.auraHalo, S.rays, S.floorGlow, ...S.motes]) s.alpha = 0;
    S.auraHalo.tint = pl.glow[0];
    S.auraCore.tint = pl.core;
    S.rays.tint = pl.glow[1];
    S.floorGlow.tint = pl.glow[0];
    S.sparks.clear();
    S.moon.rotation = 0;
    S.moonGlow.alpha = px ? 0 : 0.55;
    S.planet.rotation = 0;
    S.planet.scale.set(S.planetBase);
    applyCamFilters();
    frame(0);
  }

  // Leaving, from any phase: the pet is back on the home and play() settles once, whatever else fails on the way.
  // Only "again" keeps the stage, for the run that follows at once.
  function exit(value) {
    gen += 1;
    if (!done) {
      // Nothing on screen yet: an open the app gave up on, so whatever it made goes.
      teardown();
      return;
    }
    const ended = done;
    done = null;
    phase = "idle";
    paused = null;
    petEl.style.visibility = "";
    try {
      for (const t of timers) clearTimeout(t.id);
      timers.clear();
      cancelAnimationFrame(heightTween);
      api.drone.stop();
      for (const el of doms) {
        el.getAnimations().forEach((a) => a.cancel());
        el.remove();
      }
      doms.clear();
      hudEl = null;
      hintEl = null;
      samples = null;
      if (value !== "again") teardown();
      else if (built) {
        stage.stop();
        S.holder.style.visibility = "hidden";
      }
    } finally {
      ended.resolve(value);
    }
  }

  function changed() {
    const m = measure();
    return m.W !== W || m.H !== H || Math.abs(m.petSize - petSize) > 0.5 || Math.abs(m.floorY - floorY) > 0.5;
  }

  function teardown() {
    built = false;
    S.holder?.remove();
    for (const f of [S.bloom, S.blur, S.hue]) f?.destroy();
    S = {};
    stage?.drop();
    stage = null;
    app = null;
    for (const t of owned) t.destroy(true);
    owned.length = 0;
    for (const t of Object.values(T.pet || {})) t.destroy(true);
    T.pet = null;
    facesFrom = "";
  }

  // The stage for a game, or the last round's while the window keeps its size. One open at a time: one asked for while
  // another is still being made waits for that one, then makes its own; exit() lets a pending one go.
  let opening = null;
  async function open() {
    const g = gen;
    while (opening) await opening.catch(() => {});
    if (g !== gen) throw STOP;
    opening = (async () => {
      if (!built || changed()) {
        teardown();
        await setupStage();
      } else {
        await loadFaces();
      }
    })();
    try {
      await opening;
    } finally {
      opening = null;
    }
    if (g !== gen) throw STOP;
  }

  // Everything up to the first await shows at once: play() puts the game on screen in the same task the app takes it.
  async function begin() {
    if (!built) throw new Error("gimo played without its stage");
    resetStage();
    hudEl = domAdd("g-hud", `<div class="g-timer"><i></i></div><p class="g-height"><small>예상 높이</small><b>0</b><span>m</span></p>${str > 0 ? `
      <p class="g-bonus">힘 +${str >= 1 ? Math.round(str) : str}%</p>` : ""}
      <div class="g-meter"><div class="g-fill"></div>${TIERS.map((t) => `<span class="g-tier" data-tier="${t.id}">${iconSvg(t.id, px)}</span>`).join("")}</div>`);
    hudEl.setAttribute("aria-hidden", "true");
    hudEl.classList.toggle("is-still", calm);
    hudEl.querySelectorAll(".g-tier").forEach((el, i) => { el.style.bottom = `${(TIERS[i].at / MAX) * 100}%`; });
    setHeight(0, true);
    // Hand the pet over to the stage, drawn fresh before it shows.
    face("canon");
    stage.draw();
    S.holder.style.visibility = "visible";
    stage.run(frame);
    petEl.style.visibility = "hidden";
    tickers.add(auraTick);
    voice("happy");
    face("react");
    spring.vy -= 2.2;
    spring.vx += 1.4;
    await hold(tween(520, (k) => { S.petC.y = floorY - Math.sin(k * Math.PI) * petSize * 0.1; }, E.lin));
    say(pick(mode === "nfc" ? LINES.ready : LINES.readyScreen));
    face("canon");
    await hold(nap(620));
    samples = [];
    for (const n of [3, 2, 1]) {
      bigText(n);
      game("count");
      buzz(8);
      zoomV += 0.9;
      await hold(nap(560));
    }
    const ms = samples.sort((a, b) => a - b);
    if (ms.length > 4 && ms[Math.floor(ms.length / 2)] > 20) lowFx = true;
    samples = null;
    applyCamFilters();
    bigText("톡톡!", "is-go");
    game("go");
    buzz([20, 40, 20]);
    zoomV += 1.6;
    phase = "charge";
    api.drone.start(px);
    say(pick(LINES.go));
    face("blink");
    const bar = hudEl.querySelector(".g-timer i");
    domAnim(bar, [{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], { duration: CHARGE_MS, easing: "linear" });
    later(() => {
      hudEl.querySelector(".g-timer").classList.add("is-hurry");
      say(pick(LINES.hurry));
      [0, 1000, 2000].forEach((at) => sfx("click", { rate: 1.5, gain: 0.7, at }));
    }, CHARGE_MS - 3000);
    if (mode === "nfc") later(() => { if (!nfcTaps) showHint(); }, 3000);
    await hold(new Promise((res) => later(res, CHARGE_MS)));
    const tier = await launch();
    await fly(tier);
    return result(tier);
  }

  function showHint() {
    if (hintEl) return;
    hintEl = domAdd("g-hint", `${HINT_ART}<span>${LINES.hint}</span>`);
    domAnim(hintEl, [{ transform: "translateY(10px)", opacity: 0 }, { transform: "translateY(0)", opacity: 1 }], { duration: 300, easing: "ease-out" });
  }
  function hideHint() {
    if (!hintEl) return;
    const h = hintEl;
    hintEl = null;
    domAnim(h, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 }).then(() => { h.remove(); doms.delete(h); });
  }

  function note(step, nfc) {
    const s = Math.min(14, step);
    game(`note-c${5 + Math.floor(s / 5)}`, { rate: LADDER[s % 5], gain: nfc ? 1 : px ? 0.55 : 0.53 });
    if (nfc && !px) game("thump");
  }

  // The page hiding stops a countdown or a charge where it stands; the next tap plays on and is not counted.
  function pause() {
    if (paused || (phase !== "ready" && phase !== "charge")) return;
    const now = performance.now();
    for (const t of timers) {
      clearTimeout(t.id);
      t.left = Math.max(0, t.left - (now - t.at));
    }
    const anims = [...doms].flatMap((el) => el.getAnimations({ subtree: true })).filter((a) => a.playState === "running");
    anims.forEach((a) => a.pause());
    const chip = domAdd("g-pause", `<b>잠깐 멈췄어요</b><small>${mode === "nfc" ? "인형이나 화면을" : "화면을"} 톡 하면 이어서 해요</small>`);
    chip.setAttribute("role", "status");
    paused = { phase, anims, chip };
    phase = "paused";
    api.drone.stop();
  }

  function resume() {
    const p = paused;
    paused = null;
    p.chip.remove();
    doms.delete(p.chip);
    phase = p.phase;
    for (const t of timers) arm(t);
    p.anims.forEach((a) => a.play());
    if (phase === "charge") {
      api.drone.start(px);
      api.drone.set(charge);
    }
  }

  function tap(kind) {
    if (phase === "paused") {
      if (!document.hidden) resume();
      return false;
    }
    if (phase !== "charge") return false;
    const nfc = kind === "nfc";
    if (!nfc) {
      const t = performance.now();
      if (t - lastScreen < SCREEN_GAP) return false;
      lastScreen = t;
    }
    charge = Math.min(MAX, charge + (nfc ? NFC_STEP : SCREEN_STEP));
    taps++;
    if (nfc) { nfcTaps++; hideHint(); }
    api.drone.set(charge);
    const { x, y } = petCenter();
    // Impact: jelly squash, shove, ring, shockwave, motes rushing in.
    S.petFlash.alpha = nfc ? (px ? 0.7 : 0.55) : 0.25;
    spring.vy -= nfc ? 3.4 : 1.6;
    spring.vx += nfc ? 2.4 : 1.1;
    spring.tx = 1 + 0.08 * charge;
    spring.ty = 1 - 0.1 * charge;
    shake = Math.max(shake, nfc ? 4 + charge * 3 : 1.5);
    zoomV += nfc ? 0.8 : 0.3;
    face("react");
    later(() => { if (phase === "charge") face("blink"); }, 260);
    ringPulse(x, y, nfc ? 3.2 : 1.8, pl.ring, nfc ? 650 : 420);
    if (nfc) shockwave(x, y, 9, 70, 0.55, 230);
    inflow(nfc ? 16 : 6, nfc);
    if (nfc) dust(4, 0.6, 0.6);
    if (nfc) {
      const wd = domAdd("tap-word", "톡!");
      wd.setAttribute("aria-hidden", "true");
      wd.style.left = `${x + petSize * (taps % 2 ? 0.18 : -0.42)}px`;
      wd.style.top = `${y - petSize * 0.5}px`;
      later(() => { wd.remove(); doms.delete(wd); }, 950);
    }
    hudEl.querySelector(".g-fill").style.height = `${Math.min(100, (charge / MAX) * 100)}%`;
    setHeight(reach(charge));
    note(taps - 1, nfc);
    buzz(nfc ? 16 : 8);
    while (reached < TIERS.length && charge >= TIERS[reached].at) {
      const t = TIERS[reached];
      reached++;
      S.auraHalo.tint = pl.glow[Math.min(pl.glow.length - 1, reached)];
      S.rays.tint = pl.glow[Math.min(pl.glow.length - 1, reached)];
      hudEl.querySelector(`.g-tier[data-tier="${t.id}"]`).classList.add("is-reached");
      hudEl.querySelector(".g-label")?.remove();
      const lab = domAdd("g-label", `${iconSvg(t.id, px)}${PLACE[t.id]}까지 갈 수 있어요!`, hudEl);
      domAnim(lab, [{ transform: "translateY(-6px) scale(.6)", opacity: 0 }, { transform: "translateY(0) scale(1.08)", opacity: 1, offset: 0.16 }, { transform: "translateY(0) scale(1)", opacity: 1, offset: 0.3 }, { transform: "translateY(0) scale(1)", opacity: 1, offset: 0.85 }, { transform: "translateY(-4px) scale(1)", opacity: 0 }], { duration: 1500 }).then(() => { lab.remove(); doms.delete(lab); });
      game("tier", { rate: TIER_RATE[reached - 1], at: 40 });
      burst(x, y, 26, { v0: 160, v1: 360, life: 0.8, tint: [pl.glow[Math.min(4, reached)], 0xffffff], layer: S.fxBack });
      ringPulse(x, y, 4.2, pl.glow[Math.min(4, reached)], 800);
      S.flash.tint = pl.glow[Math.min(4, reached)];
      tween(260, (k) => { S.flash.alpha = 0.22 * (1 - k); });
    }
    return true;
  }

  async function launch() {
    phase = "launch";
    hideHint();
    api.drone.stop();
    const target = Math.min(charge, MAX);
    const tier = tierOf(target);
    const height = reach(target);
    // The save runs through the flight; the result card gives a slow one a moment more.
    reply = Promise.resolve().then(() => api.onLaunch(height)).catch(() => null);
    say(pick(LINES.launch));
    face("blink");
    // Inhale: aura sucks in, the pet coils.
    spring.tx = 1.24;
    spring.ty = 0.7;
    inflow(30, true);
    for (let i = 0; i < 6; i++) later(() => (shake = Math.max(shake, 2 + i * 1.4)), i * 45);
    await hold(tween(300, (k) => { S.auraCore.scale.set((0.9 + charge * 0.9) * (1 - 0.45 * k)); }));
    // Release.
    face("react");
    voice("excited");
    game("rocket");
    sfx("whoosh", { rate: 0.85 });
    buzz([30, 30, 60]);
    const { x } = petCenter();
    S.flash.tint = 0xffffff;
    tween(420, (k) => { S.flash.alpha = 0.9 * (1 - k); }, E.out2);
    shake = px ? 8 : 12;
    zoomV += 4;
    shockwave(x, S.petC.y - 10, 26, 150, 0.9, 420);
    ringPulse(x, S.petC.y - 6, 5.5, pl.ring, 700);
    dust(18, 1.6, 0.4);
    burst(x, S.petC.y - petSize * 0.3, 34, { v0: 200, v1: 460, life: 0.7 });
    tickers.delete(auraTick);
    S.sparks.clear();
    for (const s of [S.auraCore, S.auraHalo, S.rays, S.floorGlow, ...S.motes]) tween(200, (k) => (s.alpha *= 1 - k));
    spring.tx = 0.86;
    spring.ty = 1.3;
    // Cut to the sky: the world layer takes over under the flash.
    S.worldC.visible = true;
    S.worldC.alpha = 0;
    tween(160, (k) => (S.worldC.alpha = k));
    return tier;
  }

  async function fly(tier) {
    phase = "flight";
    const target = Math.min(charge, MAX);
    const camC = LAND[tierOf(target)] ?? target;
    const D = altOf(camC, H);
    const dur = 1800 + 2600 * (camC / MAX);
    hudEl.querySelector(".g-meter").classList.add("is-away");
    hudEl.querySelector(".g-timer").classList.add("is-away");
    hudEl.querySelector(".g-height small").textContent = "높이";
    hudEl.classList.add("is-flight");
    setHeight(0, true);
    game(dur < 2700 ? "wind-2" : dur < 3800 ? "wind-3" : "wind-4");
    // The pet rides up into the middle of the frame while the world drops away.
    const fy = H * 0.5 + petSize * 0.8 * 0.5;
    S.pet.anchor.set(0.5, 0.5);
    tween(380, (k) => { S.petC.y = lerp(floorY, fy, k); S.petC.flyScale = lerp(1, 0.8, k); }, E.out3).then(() => { spring.tx = 1; spring.ty = 1; });
    let passed = 0;
    const passY = TIERS.map((t) => altOf(t.at, H));
    const heightEl = hudEl.querySelector(".g-height b");
    const trail = () => {
      const n = Math.max(1, Math.round(speed / 260));
      for (let i = 0; i < n; i++) {
        emit(px ? T.pix : i % 3 === 0 ? T.spark : T.glow, { x: S.petC.x + rnd(-petSize * 0.12, petSize * 0.12), y: S.petC.y - 6, vx: rnd(-30, 30), vy: rnd(120, 260) + speed * 0.25, life: rnd(0.35, 0.6), s0: px ? 2.4 : rnd(0.12, 0.26), s1: 0, a0: 1, a1: 0, tint: pl.trail[Math.floor(rnd(0, pl.trail.length))], spin: rnd(-4, 4) });
      }
      if (speed > 500 && Math.random() < speed / 1600) {
        emit(px ? T.pix : T.streak, { x: rnd(0, W), y: -40, vy: speed * 1.25, life: 0.45, s0: px ? 1 : 1.0, s1: 1.0, a0: px ? 0.9 : 0.55, a1: 0.2, tint: 0xffffff, layer: S.fxBack, update: (p, k, d) => { p.s.y += p.vy * d; if (px) p.s.scale.set(1, 10); else p.s.scale.set(0.6, 0.6 + speed / 900); } });
      }
    };
    tickers.add(trail);
    await hold(tween(dur, (k) => {
      const prev = alt;
      alt = D * k;
      speed = (alt - prev) * 60;
      heightEl.textContent = fmt(Math.round((reach(target) * k) / 10) * 10);
      while (passed < passY.length && alt >= passY[passed] - 2) {
        game("ding", { rate: DING_RATE[passed] });
        buzz(10);
        passed++;
      }
    }, E.fly));
    speed = 0;
    tickers.delete(trail);
    heightEl.textContent = fmt(reach(target));
    await apex(tier);
    await descend(D);
  }

  async function apex(tier) {
    phase = "apex";
    const { x, y } = petCenter();
    say(LINES.top[tier][w] || LINES.top[tier].classic);
    face("react");
    const bob = (ms) => tween(ms, (k) => { S.pet.rotation = Math.sin(k * Math.PI * 2) * 0.14; S.petC.y = H * 0.5 + petSize * 0.4 - Math.sin(k * Math.PI) * 8; }, E.io);
    if (tier === "galaxy" || tier === "beyond") {
      voice("excited", { rate: 1.04 });
      tapSfx("fanfare", { at: 120 });
      buzz([40, 50, 40, 50, 140]);
      const rays = new P.Sprite(T.rays);
      rays.anchor.set(0.5);
      rays.position.set(x, y);
      rays.blendMode = px ? "normal" : "add";
      rays.tint = pl.glow[4];
      S.fxBack.addChild(rays);
      tween(2200, (k) => { rays.rotation = k * 1.2; rays.alpha = Math.sin(k * Math.PI) * 0.8; rays.scale.set(0.8 + k * 0.6); }).then(() => rays.destroy());
      S.flash.tint = 0xffffff;
      tween(300, (k) => (S.flash.alpha = 0.55 * (1 - k)));
      shake = 6;
      zoomV += 3;
      shockwave(x, y, 18, 120, 0.8, 380);
      // Fireworks.
      for (let f = 0; f < 4; f++) {
        later(() => {
          const fx = rnd(W * 0.15, W * 0.85);
          const fy = rnd(H * 0.12, H * 0.4);
          burst(fx, fy, 30, { v0: 80, v1: 220, g: 140, life: 1.1, drag: 0.03, tint: [pl.glow[f % 5], 0xffffff, pl.orb[f % 3]] });
          game("ding", { rate: 2 });
        }, 150 + f * 260);
      }
      // Spin.
      tween(800, (k) => { S.pet.rotation = k * Math.PI * 2; S.petC.y = H * 0.5 + petSize * 0.4 - Math.sin(k * Math.PI) * 26; }, E.io).then(() => (S.pet.rotation = 0));
      // Shower.
      for (let i = 0; i < 26; i++) {
        later(() => {
          emit(T.shower, { x: rnd(0, W), y: -20, vx: rnd(-30, 30), vy: rnd(80, 160), ay: 160, life: 2.2, s0: px ? 1.4 : rnd(0.45, 0.7), s1: px ? 1.4 : 0.5, a0: 1, a1: 0.8, spin: rnd(-5, 5), blend: "normal" });
        }, i * 45);
      }
      if (tier === "beyond") {
        tween(1200, (k) => { S.planet.rotation = Math.sin(k * Math.PI * 4) * 0.2; S.planet.scale.set(S.planetBase * (1 + 0.15 * Math.sin(k * Math.PI))); });
        for (let i = 0; i < 3; i++) later(() => shootingStar(), 250 + i * 380);
      }
      await hold(wait(2000));
    } else if (tier === "star") {
      voice("happy");
      const st = new P.Sprite(T.shower[0]);
      st.anchor.set(0.5);
      st.position.set(W * 0.15, H * 0.1);
      st.scale.set(px ? 1.6 : 0.5);
      S.fxFront.addChild(st);
      sfx("whoosh", { rate: 1.3 });
      const sx0 = st.x;
      const sy0 = st.y;
      await hold(tween(560, (k) => { st.x = lerp(sx0, x, k); st.y = lerp(sy0, y + petSize * 0.12, k) - Math.sin(k * Math.PI) * 40; st.rotation = k * 6; st.scale.set((px ? 1.6 : 0.5) + k * (px ? 1 : 0.6)); if (!px) emit(T.glow, { x: st.x, y: st.y, life: 0.3, s0: 0.25, s1: 0, a0: 0.8, a1: 0, tint: pl.orb[0] }); }, E.io));
      game("chime");
      buzz([20, 40, 30]);
      burst(x, y + petSize * 0.12, 24, { v0: 80, v1: 220, life: 0.8 });
      ringPulse(x, y + petSize * 0.12, 3, pl.ring, 700);
      tickers.add(() => { if (!st.destroyed) { st.x = S.petC.x; st.y = S.petC.y - petSize * 0.8 * 0.38; } });
      later(() => tween(300, (k) => (st.alpha = 1 - k)).then(() => st.destroy()), 1300);
      await hold(bob(1400));
    } else if (tier === "moon") {
      voice("happy");
      game("chime-low");
      buzz([16, 40, 16]);
      const m = S.moon.getGlobalPosition();
      tween(1400, (k) => { S.moonGlow.alpha = 0.55 + Math.sin(k * Math.PI) * 0.45; S.moon.rotation = Math.sin(k * Math.PI * 3) * 0.08; });
      burst(m.x, m.y, 18, { v0: 40, v1: 120, life: 1.0, drag: 0.05 });
      await hold(bob(1500));
    } else {
      voice("happy");
      sfx("sparkle", { rate: 1.2 });
      buzz(16);
      burst(x, y - petSize * 0.2, 14, { tex: px ? T.pix : T.heart, v0: 40, v1: 120, g: -40, life: 1.2, blend: "normal", tint: [0xff8fb3, 0xff6f9c, 0xffffff] });
      await hold(bob(1400));
    }
  }
  function shootingStar() {
    const s = emit(px ? T.pix : T.streak, { x: rnd(W * 0.5, W * 1.1), y: rnd(-20, H * 0.2), vx: -520, vy: 260, life: 0.8, s0: px ? 2 : 1, s1: 1, a0: 1, a1: 0, stretch: px ? 0 : 0.004, layer: S.fxBack });
    if (!px) s.s.scale.set(1.2, 2.4);
  }

  async function descend(D) {
    phase = "descend";
    face("blink");
    game("fall");
    domAnim(hudEl.querySelector(".g-height"), [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    const low = 0.4 * H;
    const fallMs = 560 + Math.min(700, D / 6);
    const fy0 = S.petC.y;
    const fs0 = S.petC.flyScale || 1;
    // A short window can't hold the open canopy over the pet, so both shrink to fit and the pet grows back on touchdown.
    const aspect = S.chute.texture.height / S.chute.texture.width;
    const fit = Math.min(1, (fy0 + petSize * 0.1 - CHUTE_TOP) / (petSize * (0.8 + 0.86 * aspect)));
    const cw = petSize * 0.86 * fit;
    const room = (y) => (y - CHUTE_TOP - cw * aspect) / petSize;
    spring.tx = 0.9;
    spring.ty = 1.12;
    const streaks = () => {
      if (Math.random() < 0.6) emit(px ? T.pix : T.streak, { x: rnd(0, W), y: H + 40, vy: -900, life: 0.5, s0: 1, s1: 1, a0: px ? 0.8 : 0.45, a1: 0.1, layer: S.fxBack, update: (p, k, d) => { p.s.y += p.vy * d; p.s.scale.set(px ? 1 : 0.6, px ? 10 : 1.4); } });
    };
    tickers.add(streaks);
    await hold(tween(fallMs, (k) => { alt = lerp(D, low, k); S.petC.y = lerp(fy0, fy0 + petSize * 0.1, k); S.petC.flyScale = lerp(fs0, 0.8 * fit, k); S.pet.rotation = Math.sin(k * 12) * 0.08; }, E.in2));
    tickers.delete(streaks);
    // Parachute pops: spring in, sway, float home.
    face("react");
    sfx("boing", { rate: 1.35, gain: 0.8 });
    buzz(14);
    S.chute.visible = true;
    tween(420, (k) => { const sc = E.back(k); S.chute.width = cw * sc; S.chute.height = cw * aspect * sc; S.chute.alpha = Math.min(1, k * 3); });
    burst(S.petC.x, S.petC.y - petSize * 0.95 * fit, 10, { v0: 40, v1: 140, life: 0.6 });
    spring.tx = 1;
    spring.ty = 1;
    const fy1 = S.petC.y;
    const sway = (dt, t) => { S.petC.rotation = Math.sin(t * 3.4) * 0.07; };
    tickers.add(sway);
    await hold(tween(1300, (k) => { alt = lerp(low, 0, k); S.petC.y = lerp(fy1, floorY, k); S.petC.flyScale = Math.min(lerp(0.8, 1, k), room(S.petC.y)); S.pet.rotation *= 0.9; }, E.io));
    tickers.delete(sway);
    S.petC.rotation = 0;
    S.pet.rotation = 0;
    tween(260, (k) => { S.chute.alpha = 1 - k; S.chute.scale.y *= 0.92; }).then(() => (S.chute.visible = false));
    // Touchdown.
    S.pet.anchor.set(0.5, 1);
    const fsLand = S.petC.flyScale;
    if (fsLand < 1) tween(240, (k) => { S.petC.flyScale = lerp(fsLand, 1, k); }, E.out3);
    spring.vy -= 4;
    spring.vx += 3;
    shake = px ? 6 : 7;
    zoomV += 2;
    sfx("land");
    voice("happy", { at: 60, rate: 1.08 });
    buzz([30, 40, 50]);
    shockwave(S.petC.x, S.petC.y - 6, 12, 90, 0.6, 260);
    ringPulse(S.petC.x, S.petC.y - 4, 4, pl.ring, 700);
    dust(14, 1.2, 0.3);
    await hold(tween(380, (k) => (S.worldC.alpha = 1 - k)));
    S.worldC.visible = false;
    alt = 0;
  }

  async function result(tier) {
    phase = "result";
    const h = reach(Math.min(charge, MAX));
    const r = await hold(Promise.race([reply, wait(1500)]));
    const isBest = Boolean(r?.isBest);
    say(pick(LINES.home));
    face("canon");
    hudEl.classList.add("is-done");
    const xp = !r ? '<p class="g-xp">기록을 못 남겼어요</p>'
      : r.xpGain > 0 ? `<p class="g-xp"><b>+${r.xpGain} XP</b><span>오늘 ${3 - r.xpLeft}/3</span></p>`
      : '<p class="g-xp">오늘 XP는 다 받았어요</p>';
    const card = domAdd("g-result", `<div class="g-badge" data-tier="${tier}">${iconSvg(tier, px)}</div>
      <p class="g-place">${PLACE[tier]}까지!</p>
      <p class="g-meters"><b>${fmt(h)}</b>m</p>
      ${isBest ? '<p class="g-best">최고 기록!</p>' : `<p class="g-prev">최고 기록 ${fmt(r ? r.best : best)}m</p>`}
      ${xp}${r?.leveledUp ? `<p class="g-level">쑥쑥 컸어요! 이제 Lv. ${r.level}!</p>` : ""}
      <div class="g-actions"><button type="button" class="g-again">한 번 더</button><button type="button" class="g-quit">그만할래요</button></div>`);
    card.setAttribute("role", "status");
    card.querySelector(".g-again").addEventListener("click", () => exit("again"));
    card.querySelector(".g-quit").addEventListener("click", () => exit("quit"));
    game(isBest ? "best" : "result");
    if (isBest) {
      for (let i = 0; i < 40; i++) emit(px ? T.pix : T.petal, { x: rnd(W * 0.2, W * 0.8), y: H * 0.18, vx: rnd(-160, 160), vy: rnd(-260, -80), ay: 380, drag: 0.02, life: 1.6, s0: px ? 2 : 0.5, s1: px ? 2 : 0.4, a0: 1, a1: 0.6, spin: rnd(-8, 8), tint: [0xff9aa2, 0xffd38a, 0x9ad7ff, 0xa8f0c0, pl.glow[1]][i % 5], blend: "normal" });
    }
    buzz(isBest ? [20, 40, 20, 40, 60] : 18);
    await hold(domAnim(card, [{ transform: "translateY(24px) scale(.85)", opacity: 0 }, { transform: "translateY(-4px) scale(1.03)", opacity: 1, offset: 0.65 }, { transform: "translateY(0) scale(1)", opacity: 1 }], { duration: 420, easing: "cubic-bezier(.3,1.3,.5,1)" }));
  }

  // The art is painted now, ahead of 시작; the stage itself is made only when a game starts.
  try {
    const m = measure();
    await buildTextures(m.W, m.H);
  } finally {
    teardown();
  }

  return {
    open,
    // On screen at once, after open(); settles once, with "again", "quit" or "aborted".
    play(how, record) {
      if (done) return done.promise;
      let resolve;
      const promise = new Promise((res) => (resolve = res));
      done = { promise, resolve };
      gen += 1;
      phase = "ready";
      mode = how === "nfc" ? "nfc" : "screen";
      best = Number(record) || 0;
      str = Math.max(0, Number(api.bonus?.("str")) || 0);
      calm = Boolean(api.still());
      taps = 0;
      nfcTaps = 0;
      lastScreen = 0;
      reply = null;
      begin().catch((error) => {
        if (error === STOP) return;
        console.error(error);
        exit("aborted");
      });
      return promise;
    },
    tap,
    pause,
    exit,
    get phase() {
      return phase;
    },
    dispose() {
      exit("aborted");
    },
  };
}
