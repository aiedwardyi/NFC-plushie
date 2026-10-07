/* 텃밭: the pet's farm on a PixiJS stage inside its window, drawn from the server's view. Reaches the app only through `api`. */

const ART_V = 1;
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const SEOUL_MS = 9 * 60 * MIN;
// `items` is only how many fly to the basket; `next` is the wait after the 맛보기.
const CROPS = {
  sprout: { name: "새싹", items: 2 },
  lettuce: { name: "상추", items: 2, next: "반나절" },
  potato: { name: "감자", items: 2, next: "하룻밤" },
  carrot: { name: "당근", items: 2, next: "하룻밤" },
  tomato: { name: "토마토", items: 3, next: "하룻밤" },
  sweet: { name: "고구마", items: 2, next: "3밤" },
  melon: { name: "수박", items: 1, next: "3밤" },
  gold: { name: "황금 감자", items: 0 },
};
// 3 x 2, back row first, so plots 4 and 5 (Lv 2 and 3) sit front right as in the mockup.
const LAYOUT = [
  { row: "back", x: 0.31, w: 0.27 },
  { row: "back", x: 0.585, w: 0.27 },
  { row: "back", x: 0.86, w: 0.27 },
  { row: "front", x: 0.31, w: 0.27 },
  { row: "front", x: 0.585, w: 0.27 },
  { row: "front", x: 0.86, w: 0.27 },
];
const ROW = { back: 0.64, front: 0.9 };
const LOCK_AT = [1, 1, 1, 1, 2, 3];
const PENTA = [1, 1.122, 1.26, 1.498, 1.682, 2, 2.245, 2.52];
const PILE_MAX = 14;
const LINES = {
  gift: "선물이에요! 씨앗이 들어 있어요!",
  goldSeed: "씨앗이에요! 황금 감자 씨앗도 있어요!",
  here: "우리 텃밭이에요! 같이 심어요!",
  water: "쑥쑥 자라라~ 물도 줄게요!",
  wait: "새싹은 금방 자라요! 1분만 기다려 볼까요?",
  ripe: "인형을 톡 해 볼래요?",
  growing: "아직 자라는 중이에요!",
  bus: "포키 버스 도착! 빵빵!",
  load: "바구니를 눌러 버스에 실어요!",
  gold: "황금 감자다!",
  yum: "냠냠! 황금 감자 최고예요!",
  plot: "새 밭이 열렸어요!",
  giftSeeds: "선물 씨앗이 왔어요! 다음 수확 때 심을게요",
  prompt: "수확했어요! 화면을 눌러 바구니를 열어요",
};
const KEY_SVG = `<svg viewBox="0 0 132 56" aria-hidden="true"><circle cx="26" cy="28" r="17" fill="#f1c75a" stroke="#9a7228" stroke-width="3"/><circle cx="26" cy="28" r="6" fill="#fff6dc" stroke="#9a7228" stroke-width="2"/><rect x="40" y="22" width="86" height="11" rx="3.5" fill="#f1c75a" stroke="#9a7228" stroke-width="2.6"/><rect x="60" y="31" width="13" height="16" rx="2.5" fill="#f1c75a" stroke="#9a7228" stroke-width="2.4"/><rect x="81" y="31" width="13" height="11" rx="2.5" fill="#f1c75a" stroke="#9a7228" stroke-width="2.4"/><rect x="102" y="31" width="13" height="19" rx="2.5" fill="#f1c75a" stroke="#9a7228" stroke-width="2.4"/></svg>`;
const E = {
  lin: (t) => t,
  out2: (t) => 1 - (1 - t) ** 2,
  out3: (t) => 1 - (1 - t) ** 3,
  in2: (t) => t * t,
  io: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
};
const rnd = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const STOP = Symbol("stop");
// Spout tip and packet mouth in texture px from each sprite's anchor.
const CAN_TIP = { x: 110, y: -48 };
const PACKET_TIP = { x: 40, y: -78 };
const CROP_IDS = Object.keys(CROPS);
const ART = [
  "plant-0", "plant-0-gold", "plant-1", "plant-1-gold",
  ...CROP_IDS.flatMap((c) => [`plant-${c}-2`, `plant-${c}-3`]),
  ...CROP_IDS.map((c) => `item-${c}`),
  "box", "lid", "can", "basket-back", "basket-front", "bus", "stop", "lock", "cloud", "spark", "heart", "drop", "leaf", "seed-gold", "seed-light", "packet", "packet-gold",
];

const artUrl = (name) => `/game/art/farm/${name}.svg?v=${ART_V}`;
// 새싹's item reads thin when small, so it never flies under 30 px.
const flySize = (crop, px) => (crop === "sprout" ? Math.max(30, px) : px);
const seoulMidnight = (ms) => Math.floor((ms + SEOUL_MS) / DAY) * DAY - SEOUL_MS;

// The server's words at `now` (server clock): a night crop counts nights, a timed crop the clock.
function timeWords(p, now) {
  if (now >= p.ripeAt) return { eta: "", left: "" };
  if (p.clock === "night") {
    const n = Math.round((p.ripeAt - seoulMidnight(now)) / DAY);
    return n === 1 ? { eta: "내일", left: "내일 익어요" } : { eta: `${n}밤 뒤`, left: `${n}밤 남았어요` };
  }
  const mins = Math.ceil((p.ripeAt - now) / MIN);
  const span = mins < 60 ? `${mins}분` : `${Math.ceil(mins / 60)}시간`;
  return { eta: `${span} 뒤`, left: `${span} 남았어요` };
}

function tasteWords(p) {
  const mins = Math.round((p.ripeAt - p.at) / MIN);
  return `맛보기! ${mins < 60 ? `${mins}분` : `${Math.round(mins / 60)}시간`} 뒤에 익어요`;
}

async function img(url) {
  const i = new Image();
  i.src = url;
  await i.decode();
  return i;
}

export async function createFarm(api) {
  const P = window.PIXI;
  const FX = P.filters;
  const { win, pet: petEl } = api;
  const w = document.documentElement.dataset.theme || "classic";
  const kit = w === "8bit" ? "chip" : "soft";

  /* ---------- sound and buzz ---------- */
  const timers = new Set();
  function later(fn, ms) {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  }
  const play = (name, o = {}) => {
    if (o.at) later(() => api.sfx(name, { rate: o.rate, gain: o.gain }), o.at);
    else api.sfx(name, { rate: o.rate, gain: o.gain });
  };
  const sfx = (name, o) => play(`care-${kit}-${name}`, o);
  const game = (name, o) => play(`game-${kit}-${name}`, o);
  const tapSfx = (name, o) => play(`tap-${kit}-${name}`, o);
  const farmSfx = (name, o) => play(`farm-${kit}-${name}`, o);
  // There is no chip thump; the chip kit stays quiet there.
  const thump = (o) => kit === "soft" && game("thump", o);
  const voice = (mood, o = {}) => play(`cry-${w}-${mood}`, { rate: o.rate || 0.96 + Math.random() * 0.08, gain: o.gain, at: o.at });
  const buzz = (p) => api.buzz(p);
  const say = (text) => api.say(text);

  /* ---------- textures ---------- */
  const T = {};
  const owned = [];
  let seed = 11;
  const R = (a, b) => a + ((seed = (seed * 16807) % 2147483647) / 2147483647) * (b - a);
  function canvasTex(cw, ch, draw) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(cw));
    c.height = Math.max(1, Math.round(ch));
    draw(c.getContext("2d"), c.width, c.height);
    const t = P.Texture.from(c);
    owned.push(t);
    return t;
  }
  async function art(name) {
    const i = await img(artUrl(name));
    return canvasTex(i.naturalWidth, i.naturalHeight, (x, cw, ch) => x.drawImage(i, 0, 0, cw, ch));
  }
  function radial(size, stops) {
    return canvasTex(size, size, (x, s) => {
      const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      stops.forEach(([o, c]) => g.addColorStop(o, c));
      x.fillStyle = g;
      x.fillRect(0, 0, s, s);
    });
  }
  function vgrad(cw, ch, stops) {
    return canvasTex(cw, ch, (x) => {
      const g = x.createLinearGradient(0, 0, 0, ch);
      stops.forEach(([o, c]) => g.addColorStop(o, c));
      x.fillStyle = g;
      x.fillRect(0, 0, cw, ch);
    });
  }
  function bedTex(wet) {
    return canvasTex(240, 96, (x, cw, ch) => {
      const [top, furrow, rim] = wet ? ["#5f3c22", "#4a2e19", "#523320"] : ["#a8713f", "#8d5c33", "#8a5a36"];
      x.fillStyle = rim;
      x.beginPath();
      x.roundRect(6, 14, cw - 12, ch - 18, 40);
      x.fill();
      x.fillStyle = top;
      x.beginPath();
      x.roundRect(8, 8, cw - 16, ch - 22, 36);
      x.fill();
      x.strokeStyle = furrow;
      x.lineWidth = 5;
      x.lineCap = "round";
      for (const fy of [0.32, 0.5, 0.68]) {
        x.beginPath();
        x.moveTo(cw * 0.14, ch * fy);
        x.quadraticCurveTo(cw * 0.5, ch * fy - 10, cw * 0.86, ch * fy);
        x.stroke();
      }
      if (!wet) {
        x.strokeStyle = "rgba(255,220,170,.35)";
        x.lineWidth = 3;
        x.beginPath();
        x.moveTo(cw * 0.2, ch * 0.2);
        x.quadraticCurveTo(cw * 0.5, ch * 0.1, cw * 0.8, ch * 0.2);
        x.stroke();
      }
    });
  }
  // Pet faces exactly as the app shows them, so worlds and horse/sheep follow.
  function faceUrl(name) {
    const el = petEl.querySelector(`[data-frame="${name}"]`);
    const c = getComputedStyle(el).content;
    return c && c.startsWith("url(") ? c.slice(5, -2) : el.currentSrc || el.src;
  }
  const FACES = ["canon", "blink", "react", "munch"];
  let facesFrom = "";
  async function loadFaces() {
    const urls = FACES.map(faceUrl);
    if (urls.join() === facesFrom) return;
    const pics = await Promise.all(urls.map(img));
    for (const t of Object.values(T.pet || {})) t.destroy(true);
    T.pet = {};
    FACES.forEach((name, i) => {
      const t = P.Texture.from(pics[i]);
      if (kit === "chip") t.source.scaleMode = "nearest";
      T.pet[name] = t;
    });
    facesFrom = urls.join();
    if (S.pet) S.pet.texture = T.pet.canon;
  }

  async function buildTextures() {
    seed = 11;
    T.glow = radial(128, [[0, "rgba(255,255,255,1)"], [0.3, "rgba(255,255,255,.7)"], [0.65, "rgba(255,255,255,.15)"], [1, "rgba(255,255,255,0)"]]);
    T.ring = canvasTex(128, 128, (x) => {
      x.strokeStyle = "#fff";
      x.lineWidth = 7;
      x.beginPath();
      x.arc(64, 64, 52, 0, Math.PI * 2);
      x.stroke();
    });
    T.rays = canvasTex(512, 512, (x) => {
      x.translate(256, 256);
      for (let i = 0; i < 16; i++) {
        x.rotate((Math.PI * 2) / 16);
        const g = x.createLinearGradient(0, 0, 0, -256);
        g.addColorStop(0, "rgba(255,255,255,.6)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        x.fillStyle = g;
        x.beginPath();
        x.moveTo(0, 0);
        x.lineTo(-26, -256);
        x.lineTo(26, -256);
        x.closePath();
        x.fill();
      }
    });
    T.sky = vgrad(8, 256, [[0, "#bfe1f4"], [1, "#fff6e6"]]);
    T.dusk = vgrad(8, 256, [[0, "#f6a77d"], [0.55, "#ffcf9e"], [1, "#ffe9c9"]]);
    T.night = canvasTex(W, Math.round(H * 0.5), (x, cw, ch) => {
      const g = x.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, "#16204a");
      g.addColorStop(1, "#3a4a85");
      x.fillStyle = g;
      x.fillRect(0, 0, cw, ch);
      for (let i = 0; i < 46; i++) {
        x.fillStyle = `rgba(255,248,220,${R(0.45, 1)})`;
        x.beginPath();
        x.arc(R(0, cw), R(0, ch * 0.85), R(0.6, 1.6), 0, Math.PI * 2);
        x.fill();
      }
    });
    T.moonN = canvasTex(64, 64, (x) => {
      x.fillStyle = "#fff4cf";
      x.beginPath();
      x.arc(32, 32, 20, 0, Math.PI * 2);
      x.fill();
      x.globalCompositeOperation = "destination-out";
      x.beginPath();
      x.arc(42, 26, 18, 0, Math.PI * 2);
      x.fill();
    });
    T.hills = canvasTex(W, Math.round(H * 0.2), (x, cw, ch) => {
      x.fillStyle = "#d3e8b9";
      x.beginPath();
      x.moveTo(0, ch);
      x.lineTo(0, ch * 0.5);
      x.bezierCurveTo(cw * 0.18, ch * 0.05, cw * 0.42, ch * 0.1, cw * 0.58, ch * 0.48);
      x.bezierCurveTo(cw * 0.7, ch * 0.2, cw * 0.9, ch * 0.15, cw, ch * 0.42);
      x.lineTo(cw, ch);
      x.fill();
      x.fillStyle = "#bcdb9a";
      x.beginPath();
      x.moveTo(0, ch);
      x.lineTo(0, ch * 0.78);
      x.bezierCurveTo(cw * 0.25, ch * 0.48, cw * 0.5, ch * 0.62, cw * 0.72, ch * 0.72);
      x.bezierCurveTo(cw * 0.84, ch * 0.62, cw * 0.94, ch * 0.6, cw, ch * 0.66);
      x.lineTo(cw, ch);
      x.fill();
      for (const [tx, ty, r] of [[0.1, 0.62, 9], [0.16, 0.66, 7], [0.8, 0.56, 8], [0.88, 0.6, 10]]) {
        x.fillStyle = "#8a6a3a";
        x.fillRect(cw * tx - 1.5, ch * ty, 3, r * 1.2);
        x.fillStyle = "#8cc06a";
        x.beginPath();
        x.arc(cw * tx, ch * ty, r, 0, Math.PI * 2);
        x.fill();
      }
    });
    T.grass = canvasTex(W, Math.round(H * 0.5), (x, cw, ch) => {
      const g = x.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, "#d6eab0");
      g.addColorStop(1, "#bfdc93");
      x.fillStyle = g;
      x.fillRect(0, 0, cw, ch);
      x.strokeStyle = "rgba(120,170,80,.45)";
      x.lineWidth = 1.4;
      for (let i = 0; i < 70; i++) {
        const gx = R(0, cw);
        const gy = R(ch * 0.08, ch);
        const s = 2 + (gy / ch) * 4;
        x.beginPath();
        x.moveTo(gx - s, gy);
        x.lineTo(gx - s * 0.3, gy - s * 1.4);
        x.moveTo(gx, gy);
        x.lineTo(gx + s * 0.2, gy - s * 1.8);
        x.moveTo(gx + s, gy);
        x.lineTo(gx + s * 0.5, gy - s * 1.3);
        x.stroke();
      }
    });
    T.bedDry = bedTex(false);
    T.bedWet = bedTex(true);
    T.dust = radial(64, [[0, "rgba(214,196,160,.9)"], [0.6, "rgba(214,196,160,.45)"], [1, "rgba(214,196,160,0)"]]);
    T.dirt = radial(24, [[0, "rgba(120,78,44,1)"], [0.7, "rgba(120,78,44,1)"], [1, "rgba(120,78,44,0)"]]);
    const [pieces] = await Promise.all([Promise.all(ART.map(art)), loadFaces()]);
    T.art = Object.fromEntries(ART.map((n, i) => [n, pieces[i]]));
  }
  const plantTex = (crop, stage) => T.art[stage < 2 ? `plant-${stage}${crop === "gold" ? "-gold" : ""}` : `plant-${crop}-${stage}`];
  const itemTex = (crop) => T.art[`item-${crop}`];

  /* ---------- stage ---------- */
  let app = null;
  let built = false;
  let W = 0;
  let H = 0;
  let petH = 0;
  let calm = false;
  let shake = 0;
  let busGrow = 1;
  let S = {};
  const L = {};
  const guideKey = `farm-guide:${api.uid}`;
  let guideDone = false;
  let guideStep = 0;
  let guideTimer = 0;
  try { guideDone = localStorage.getItem(guideKey) === "1"; } catch {}
  const tweens = [];
  const parts = [];
  const tickers = new Set();
  const waits = new Set();
  const naps = new Set();
  const spring = { x: 1, y: 1, vx: 0, vy: 0 };
  const plots = [];
  const xOf = (f) => f * W;
  const yOf = (f) => f * H;

  function tween(ms, fn, ease = E.lin) {
    return new Promise((res) => tweens.push({ t: 0, d: Math.max(1, calm ? ms * 0.6 : ms) / 1000, fn, ease, res }));
  }
  function pause(ms) {
    return new Promise((res) => {
      const id = setTimeout(() => {
        naps.delete(id);
        res();
      }, ms);
      naps.add(id);
    });
  }
  function emit(tex, o) {
    const s = new P.Sprite(Array.isArray(tex) ? tex[Math.floor(rnd(0, tex.length))] : tex);
    s.anchor.set(0.5);
    s.blendMode = o.blend || "normal";
    s.x = o.x;
    s.y = o.y;
    s.rotation = o.rot || 0;
    s.tint = o.tint ?? 0xffffff;
    (o.layer || S.fx).addChild(s);
    const p = { s, vx: o.vx || 0, vy: o.vy || 0, ay: o.ay || 0, life: o.life || 1, age: 0, s0: o.s0 ?? 0.5, s1: o.s1 ?? 0, a0: o.a0 ?? 1, a1: o.a1 ?? 0, spin: o.spin || 0, drag: o.drag || 0, onDie: o.onDie };
    s.scale.set(p.s0);
    s.alpha = p.a0;
    parts.push(p);
    return p;
  }
  function stepParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1 || p.s.destroyed) {
        if (!p.s.destroyed) {
          if (k >= 1 && p.onDie) p.onDie(p.s.x, p.s.y);
          p.s.destroy();
        }
        parts.splice(i, 1);
        continue;
      }
      p.vy += p.ay * dt;
      const d = Math.pow(1 - p.drag, dt * 60);
      p.vx *= d;
      p.vy *= d;
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.s.scale.set(p.s0 + (p.s1 - p.s0) * k);
      p.s.rotation += p.spin * dt;
      p.s.alpha = p.a0 + (p.a1 - p.a0) * k;
    }
  }
  function burst(x, y, n, o = {}) {
    for (let i = 0; i < (calm ? Math.ceil(n / 2) : n); i++) {
      const a = rnd(o.a0 ?? 0, o.a1 ?? Math.PI * 2);
      const sp = rnd(o.v0 ?? 80, o.v1 ?? 220);
      emit(o.tex || T.art.spark, { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: o.ay ?? 0, drag: o.drag ?? 0.04, life: rnd(o.l0 ?? 0.5, o.l1 ?? 0.9), s0: rnd(o.s0 ?? 0.3, o.s1 ?? 0.6), s1: o.end ?? 0, spin: rnd(-6, 6), tint: Array.isArray(o.tint) ? o.tint[i % o.tint.length] : o.tint, blend: o.blend, layer: o.layer });
    }
  }
  function ringPulse(x, y, scale, tint, ms = 600) {
    const r = new P.Sprite(T.ring);
    r.anchor.set(0.5);
    r.position.set(x, y);
    r.tint = tint;
    r.blendMode = "add";
    S.fx.addChild(r);
    return tween(ms, (k) => {
      r.scale.set(0.1 + k * scale);
      r.alpha = 1 - k;
    }, E.out2).then(() => r.destroy());
  }
  function shockwave(x, y, amp, wl, ms) {
    if (calm) return;
    const f = new FX.ShockwaveFilter({ center: { x, y }, amplitude: amp, wavelength: wl, brightness: 1.05, speed: 480, radius: -1 });
    S.shocks.push({ f, t: 0, d: ms / 1000 });
    S.cam.filters = S.shocks.map((s) => s.f);
  }
  function flash(alpha, ms) {
    if (calm) return;
    S.flash.alpha = alpha;
    tween(ms, (k) => {
      S.flash.alpha = alpha * (1 - k);
    });
  }

  function frame(tk) {
    const dt = Math.min(0.05, tk.deltaMS / 1000);
    const t = performance.now() / 1000;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.d);
      tw.fn(tw.ease(k), k);
      if (k >= 1) {
        tweens.splice(i, 1);
        tw.res();
      }
    }
    for (const fn of tickers) fn(dt, t);
    const sp = spring;
    sp.vx += (240 * (1 - sp.x) - 12 * sp.vx) * dt;
    sp.vy += (240 * (1 - sp.y) - 12 * sp.vy) * dt;
    sp.x += sp.vx * dt;
    sp.y += sp.vy * dt;
    const depth = S.petC.depth || 1;
    S.pet.scale.set(S.petBase * sp.x * depth, S.petBase * sp.y * depth);
    S.hand.scale.set(sp.x * depth, sp.y * depth);
    shake = calm ? 0 : shake * Math.pow(0.002, dt);
    S.cam.position.set(S.cam.pivot.x + rnd(-1, 1) * shake, S.cam.pivot.y + rnd(-1, 1) * shake);
    for (let i = S.shocks.length - 1; i >= 0; i--) {
      const s = S.shocks[i];
      s.t += dt;
      s.f.time = s.t;
      if (s.t >= s.d) {
        S.shocks.splice(i, 1);
        s.f.destroy();
        S.cam.filters = S.shocks.length ? S.shocks.map((x) => x.f) : null;
      }
    }
    S.clouds.forEach((c, i) => {
      c.x += (6 + i * 3) * dt;
      if (c.x > W + 60) c.x = -60;
    });
    stepParts(dt);
    if (L.fieldX !== S.farm.x) {
      L.fieldX = S.farm.x;
      L.field.style.transform = S.farm.x ? `translateX(${S.farm.x}px)` : "";
    }
  }

  function sprite(tex, layer, x, y, ax = 0.5, ay = 0.5, width) {
    const s = new P.Sprite(tex);
    s.anchor.set(ax, ay);
    s.position.set(x, y);
    if (width) {
      s.width = width;
      s.scale.y = s.scale.x;
    }
    layer.addChild(s);
    return s;
  }

  function measure() {
    return api.size();
  }

  async function setupStage() {
    ({ W, H } = measure());
    petH = Math.min(0.28 * H, 0.3 * W);
    await buildTextures();
    app = new P.Application();
    await app.init({ width: W, height: H, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true, backgroundAlpha: 0, antialias: true, preference: "webgl" });
    // Plot taps are hit-tested in the DOM; Pixi's own pointer events would keep its shared ticker running while the farm is shut.
    app.renderer.events.setTargetElement(null);
    S = {};
    const holder = document.createElement("div");
    holder.className = "f-stage";
    holder.setAttribute("aria-hidden", "true");
    holder.appendChild(app.canvas);
    holder.style.visibility = "hidden";
    win.appendChild(holder);
    S.holder = holder;
    L.dom = document.createElement("div");
    L.dom.className = "f-layer";
    win.appendChild(L.dom);
    L.field = document.createElement("div");
    L.field.className = "f-field";
    L.dom.appendChild(L.field);
    L.fieldX = null;
    const st = app.stage;
    S.cam = new P.Container();
    S.cam.pivot.set(W / 2, H / 2);
    S.cam.position.set(W / 2, H / 2);
    st.addChild(S.cam);
    S.shocks = [];
    S.cam.filterArea = new P.Rectangle(0, 0, W, H);
    S.homeFx = new P.Container();
    S.cam.addChild(S.homeFx);
    S.farm = new P.Container();
    S.cam.addChild(S.farm);
    S.farm.x = W;
    const skyH = yOf(0.4);
    for (const [k, tex] of [["skyDay", T.sky], ["skyDusk", T.dusk], ["skyNight", T.night]]) {
      S[k] = sprite(tex, S.farm, 0, 0, 0, 0);
      S[k].width = W;
      S[k].height = skyH;
    }
    S.sunGlow = sprite(T.glow, S.farm, xOf(0.18), yOf(0.1), 0.5, 0.5, 110);
    S.sunGlow.tint = 0xfff1b8;
    S.sunGlow.alpha = 0.85;
    S.sun = new P.Graphics().circle(0, 0, 17).fill(0xffe39a).circle(0, 0, 13).fill(0xfff3c4);
    S.sun.position.set(xOf(0.18), yOf(0.1));
    S.farm.addChild(S.sun);
    S.moonN = sprite(T.moonN, S.farm, xOf(0.8), yOf(0.12), 0.5, 0.5, 46);
    S.clouds = [sprite(T.art.cloud, S.farm, xOf(0.52), yOf(0.12), 0.5, 0.5, 92), sprite(T.art.cloud, S.farm, xOf(0.9), yOf(0.24), 0.5, 0.5, 64)];
    S.hills = sprite(T.hills, S.farm, 0, yOf(0.2), 0, 0);
    S.hills.width = W;
    S.hills.height = yOf(0.2);
    S.road = new P.Graphics().rect(0, yOf(0.35), W, yOf(0.06)).fill(0xf4e8cc).rect(0, yOf(0.35), W, 2).fill(0xe0cfa8).rect(0, yOf(0.408), W, 2.5).fill(0xd9c69c);
    S.farm.addChild(S.road);
    S.stop = sprite(T.art.stop, S.farm, xOf(0.48), yOf(0.357), 0.5, 1, 26);
    S.busLayer = new P.Container();
    S.farm.addChild(S.busLayer);
    S.bus = sprite(T.art.bus, S.busLayer, W + 120, yOf(0.4), 0.5, 1, W * 0.48);
    S.busBase = S.bus.scale.x;
    S.grass = sprite(T.grass, S.farm, 0, yOf(0.41), 0, 0);
    S.grass.width = W;
    S.grass.height = H - yOf(0.41) + 2;
    S.beds = new P.Container();
    S.farm.addChild(S.beds);
    S.mid = new P.Container();
    S.mid.sortableChildren = true;
    S.farm.addChild(S.mid);
    S.shade = new P.Sprite(P.Texture.WHITE);
    S.shade.width = W;
    S.shade.height = H;
    S.farm.addChild(S.shade);
    S.fx = new P.Container();
    S.farm.addChild(S.fx);
    plots.length = 0;
    LAYOUT.forEach((d, i) => {
      const cx = xOf(d.x);
      const cy = yOf(ROW[d.row]);
      const pw = xOf(d.w);
      const bed = sprite(T.bedDry, S.beds, cx, cy);
      bed.width = pw;
      bed.height = pw * 0.56;
      const wet = sprite(T.bedWet, S.beds, cx, cy);
      wet.width = pw;
      wet.height = pw * 0.56;
      wet.alpha = 0;
      const plant = sprite(plantTex("potato", 0), S.mid, cx, cy + pw * 0.05, 0.5, 0.94);
      plant.width = pw * 1.08;
      plant.height = pw * 1.08 * 1.125;
      plant.zIndex = cy;
      plant.visible = false;
      plant.base = plant.scale.x;
      const lock = sprite(T.art.lock, S.mid, cx, cy - pw * 0.05, 0.5, 0.75, pw * 0.24);
      lock.zIndex = cy + 1;
      lock.visible = false;
      const glow = sprite(T.glow, S.beds, cx, cy - pw * 0.2, 0.5, 0.5, pw * 1.3);
      glow.tint = 0xffd36a;
      glow.alpha = 0;
      plots.push({ glow, plantY: plant.y, i, row: d.row, cx, cy, w: pw, bed, wet, plant, lock, lockY: lock.y, data: null, stage: -1, tag: null });
    });
    S.basketGlow = sprite(T.glow, S.mid, xOf(0.155), yOf(0.995) - xOf(0.22) * 0.3, 0.5, 0.5, xOf(0.5));
    S.basketGlow.tint = 0xffe39a;
    S.basketGlow.blendMode = "add";
    S.basketGlow.alpha = 0;
    S.basketGlow.zIndex = yOf(0.995) - 2;
    S.basketBack = sprite(T.art["basket-back"], S.mid, xOf(0.155), yOf(0.995), 0.5, 1, xOf(0.22));
    S.basketBack.zIndex = yOf(0.995) - 1;
    S.pile = new P.Container();
    S.pile.zIndex = yOf(0.995) - 0.5;
    S.mid.addChild(S.pile);
    S.basketFront = sprite(T.art["basket-front"], S.mid, xOf(0.155), yOf(0.995), 0.5, 1, xOf(0.22));
    S.basketFront.zIndex = yOf(0.995);
    S.basketBase = S.basketFront.scale.x;
    S.basketTop = { x: xOf(0.155), y: yOf(0.995) - xOf(0.22) * 0.62 };
    S.petC = new P.Container();
    S.mid.addChild(S.petC);
    S.pet = new P.Sprite(T.pet.canon);
    S.pet.anchor.set(0.5, 1);
    S.pet.width = petH;
    S.pet.height = petH;
    S.petBase = S.pet.scale.x;
    S.petC.addChild(S.pet);
    // What the pet holds sits in its right paw and squashes and shrinks with it.
    S.hand = new P.Container();
    S.petC.addChild(S.hand);
    S.can = new P.Sprite(T.art.can);
    S.can.anchor.set(0.25, 0.7);
    S.can.width = petH * 0.42;
    S.can.scale.y = S.can.scale.x;
    S.can.position.set(petH * 0.16, -petH * 0.35);
    S.hand.addChild(S.can);
    S.packet = new P.Sprite(T.art.packet);
    S.packet.anchor.set(0.3, 0.85);
    S.packet.width = petH * 0.2;
    S.packet.scale.y = S.packet.scale.x;
    S.packet.position.set(petH * 0.16, -petH * 0.35);
    S.hand.addChild(S.packet);
    S.flash = new P.Sprite(P.Texture.WHITE);
    S.flash.width = W;
    S.flash.height = H;
    S.flash.alpha = 0;
    st.addChild(S.flash);
    L.cta = document.createElement("div");
    L.cta.className = "f-cta";
    L.cta.hidden = true;
    L.cta.setAttribute("role", "status");
    L.dom.appendChild(L.cta);
    app.ticker.add(frame);
    // Warm the ripple's shader before the first harvest needs it.
    const warm = new FX.ShockwaveFilter({ center: { x: W / 2, y: H / 2 }, amplitude: 1, wavelength: 50, radius: 10 });
    S.cam.filters = [warm];
    app.renderer.render(app.stage);
    S.cam.filters = null;
    warm.destroy();
    sleep();
    resetPet();
    built = true;
  }

  // Pixi's renderer also runs texture housekeeping on the shared system ticker: the farm keeps that stopped, so it runs
  // one ticker while open and none while shut (its textures live until teardown anyway).
  function sleep() {
    app.ticker.stop();
    P.Ticker.system.stop();
  }
  function wake() {
    P.Ticker.system.stop();
    app.ticker.start();
  }

  // Sky follows the app's time of day: day, dusk or night over the same farm.
  function paintSky() {
    const band = document.documentElement.dataset.time || "day";
    const dusk = band === "evening";
    const night = band === "night";
    S.skyDusk.alpha = dusk ? 1 : 0;
    S.skyNight.alpha = night ? 1 : 0;
    S.moonN.alpha = night ? 1 : 0;
    S.sun.visible = S.sunGlow.visible = !night;
    const sunAt = dusk ? { x: xOf(0.86), y: yOf(0.36) } : { x: xOf(0.18), y: yOf(0.1) };
    S.sun.position.set(sunAt.x, sunAt.y);
    S.sunGlow.position.set(sunAt.x, sunAt.y);
    S.clouds.forEach((c) => {
      c.alpha = night ? 0.3 : 1;
    });
    S.shade.tint = night ? 0x1e2a5e : 0x8a3a1e;
    S.shade.alpha = night ? 0.42 : dusk ? 0.12 : 0;
  }

  function resetPet() {
    Object.assign(spring, { x: 1, y: 1, vx: 0, vy: 0 });
    S.petC.position.set(xOf(0.13), yOf(0.875));
    S.petC.zIndex = yOf(0.875);
    S.petC.depth = 1;
    S.pet.rotation = 0;
    S.pet.texture = T.pet.canon;
    S.can.visible = false;
    S.can.rotation = 0;
    S.packet.visible = false;
    S.packet.rotation = 0;
    for (const c of [...S.hand.children]) if (c !== S.can && c !== S.packet) c.destroy();
  }

  /* ---------- the drawn field ---------- */
  let truth = null;
  let latestReply = null;
  let clock = { server: Date.now(), at: performance.now() };
  const serverNow = () => clock.server + (performance.now() - clock.at);
  const pending = new Set();

  function setTruth(view) {
    truth = view;
    clock = { server: view.now, at: performance.now() };
  }

  function stageOf(d, now = serverNow()) {
    if (d.ripe || now >= d.ripeAt) return 3;
    return (now - d.at) / Math.max(1, d.ripeAt - d.at) < 0.5 ? 1 : 2;
  }

  function lockTag(p, level) {
    p.tag?.remove();
    p.tag = domAdd("f-tag is-lock", `Lv ${level}`, L.field);
    p.tag.style.left = `${p.cx}px`;
    p.tag.style.top = `${p.cy + p.w * 0.1}px`;
  }

  function drawPlot(i, d) {
    const p = plots[i];
    p.data = d;
    const locked = Boolean(d?.locked);
    p.bed.alpha = locked ? 0.45 : 1;
    p.wet.alpha = 0;
    p.lock.visible = locked;
    p.lock.alpha = 1;
    p.lock.y = p.lockY;
    p.lock.rotation = 0;
    p.tag?.remove();
    p.tag = null;
    if (locked) lockTag(p, d.level || LOCK_AT[i]);
    if (locked || !d?.crop) {
      p.plant.visible = false;
      p.stage = -1;
      return;
    }
    p.stage = stageOf(d);
    p.plant.texture = plantTex(d.crop, p.stage);
    p.plant.scale.set(p.plant.base);
    p.plant.alpha = 1;
    p.plant.visible = true;
  }

  // The field as it stood before `r`: picked plots still ripe, new plots still empty or locked.
  function before(r) {
    const picked = new Map(r.picked.map((pk) => [pk.plot, pk]));
    const fresh = new Set(r.planted.map((pl) => pl.plot).filter((i) => !picked.has(i)));
    const opened = new Set(r.created ? [] : r.opened);
    return r.farm.plots.map((p, i) => {
      if (picked.has(i)) return { plot: i, crop: picked.get(i).crop, ripe: true };
      if (opened.has(i)) return { plot: i, locked: true, level: LOCK_AT[i] };
      if (fresh.has(i)) return { plot: i, crop: null };
      return p;
    });
  }

  /* ---------- DOM over the stage ---------- */
  function domAdd(cls, html = "", parent = L.dom) {
    const el = document.createElement("div");
    el.className = cls;
    el.innerHTML = html;
    parent.appendChild(el);
    return el;
  }
  const domAnim = (el, frames, o) => el.animate(frames, { fill: "forwards", ...o }).finished.catch(() => {});
  function bigText(text, cls = "", hold = 900) {
    const el = domAdd(`f-big ${cls}`);
    el.textContent = text;
    el.setAttribute("aria-hidden", "true");
    const frames = calm
      ? [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }]
      : [{ transform: "scale(.2)", opacity: 0 }, { transform: "scale(1.15)", opacity: 1, offset: 0.18 }, { transform: "scale(1)", opacity: 1, offset: 0.3 }, { transform: "scale(1)", opacity: 1, offset: 0.85 }, { transform: "scale(1.08) translateY(-8px)", opacity: 0 }];
    return domAnim(el, frames, { duration: hold + 500, easing: calm ? "linear" : "cubic-bezier(.3,1.2,.5,1)" }).then(() => el.remove());
  }
  // Centered over the plot, but never past the window's edge.
  function placeTag(el, x) {
    const half = el.offsetWidth / 2;
    el.style.left = `${Math.max(half + 4, Math.min(W - half - 4, x))}px`;
  }
  function plotTag(p, text, cls = "", ms = 3200) {
    const el = domAdd(`f-tag is-say ${cls}`, "", L.field);
    el.textContent = text;
    placeTag(el, p.cx);
    el.style.top = `${p.cy - p.w * 0.95}px`;
    const frames = calm
      ? [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }]
      : [{ transform: "translate(-50%, 6px) scale(.6)", opacity: 0 }, { transform: "translate(-50%, 0) scale(1.06)", opacity: 1, offset: 0.12 }, { transform: "translate(-50%, 0) scale(1)", opacity: 1, offset: 0.2 }, { transform: "translate(-50%, 0) scale(1)", opacity: 1, offset: 0.86 }, { transform: "translate(-50%, -6px) scale(1)", opacity: 0 }];
    return domAnim(el, frames, { duration: ms }).then(() => el.remove());
  }
  function tapWord() {
    const el = domAdd("f-tap", "톡!");
    el.setAttribute("aria-hidden", "true");
    el.style.left = `${S.petC.x + petH * 0.22}px`;
    el.style.top = `${S.petC.y - petH * 1.08}px`;
    domAnim(el, [{ transform: "scale(.3) rotate(-12deg)", opacity: 0 }, { transform: "scale(1.15) rotate(-6deg)", opacity: 1, offset: 0.25 }, { opacity: 1, offset: 0.7 }, { transform: "translateY(-22px) scale(1) rotate(-6deg)", opacity: 0 }], { duration: 900 }).then(() => el.remove());
  }

  let ctaRipe = false;
  let ctaText = "";
  function paintCta() {
    if (!L.cta) return;
    const now = serverNow();
    const drawn = plots.map((p) => p.data).filter((d) => d?.crop && !d.locked && !pending.has(d.plot));
    const ripe = drawn.filter((d) => stageOf(d, now) === 3).length;
    const growing = drawn.filter((d) => stageOf(d, now) < 3).sort((a, b) => a.ripeAt - b.ripeAt);
    ctaRipe = ripe > 0;
    let text = "";
    if (ctaRipe) text = `${KEY_SVG}<b>인형을 톡! 한 번에 수확해요</b><small>작물을 눌러도 하나씩 딸 수 있어요</small>`;
    else if (growing.length) text = `<b>다음 수확: ${CROPS[growing[0].crop].name} ${timeWords(growing[0], now).eta}</b>`;
    if (text !== ctaText) {
      ctaText = text;
      L.cta.innerHTML = text;
    }
    L.cta.classList.toggle("is-ripe", ctaRipe);
    if (ctaRipe && !showing && !guideDone && !guideStep && !busState) guide(1);
    L.cta.hidden = !text || showing || guideStep > 0 || Boolean(busState);
  }
  function nudgeCta() {
    if (calm || L.cta.hidden) return;
    domAnim(L.cta, [{ transform: "translateX(-50%) scale(1)" }, { transform: "translateX(-50%) scale(1.08)" }, { transform: "translateX(-50%) scale(1)" }], { duration: 360, fill: "none" });
  }

  /* ---------- runs: one show at a time, chores queue behind ---------- */
  let gen = 0;
  let showing = false;
  let entered = false;
  let chain = Promise.resolve();
  let cutFire = null;
  let cutSignal = null;
  const armCut = () => {
    cutSignal = new Promise((res) => {
      cutFire = res;
    });
  };
  armCut();
  async function hold(p) {
    const g = gen;
    const v = await Promise.race([p, cutSignal]);
    if (g !== gen) throw STOP;
    return v;
  }
  // Ends whatever runs now: dropped tweens and pauses never call back, and every hold in flight throws STOP.
  function cut({ keepRound = false } = {}) {
    flushRound();
    clearTimeout(guideTimer);
    guideStep = 0;
    clearTimeout(busTimer);
    busState = "";
    loadBus = null;
    order = null;
    if (!keepRound) {
      round.length = 0;
      cargo.length = 0;
      roundNote = 0;
      for (const it of [...S.pile.children]) it.destroy();
    }
    gen += 1;
    tweens.length = 0;
    for (const id of naps) clearTimeout(id);
    naps.clear();
    for (const done of [...waits]) done();
    const fire = cutFire;
    armCut();
    fire();
    for (const id of timers) clearTimeout(id);
    timers.clear();
    tickers.clear();
    tickers.add(twinkle);
    for (const p of parts) if (!p.s.destroyed) p.s.destroy();
    parts.length = 0;
    for (const c of [...S.fx.children]) c.destroy();
    for (const c of [...S.homeFx.children]) c.destroy();
    for (const s of S.shocks) s.f.destroy();
    S.shocks = [];
    S.cam.filters = null;
    S.cam.scale.set(1);
    S.cam.pivot.set(W / 2, H / 2);
    S.flash.alpha = 0;
    S.basketGlow.alpha = 0;
    for (const el of [...L.dom.children, ...L.field.children]) {
      if (el === L.cta || el === L.field || el.classList.contains("f-tap") || plots.some((p) => p.tag === el)) continue;
      el.getAnimations().forEach((a) => a.cancel());
      el.remove();
    }
    document.querySelectorAll(".f-prompt, .f-delivery").forEach((el) => el.remove());
    busGrow = 1;
    S.bus.x = W + 120;
    S.bus.y = yOf(0.4);
    S.bus.rotation = 0;
    S.bus.scale.set(S.busBase);
    S.basketFront.scale.set(S.basketBase);
    resetPet();
    pending.clear();
    chain = Promise.resolve();
    showing = false;
  }
  function show(fn) {
    showing = true;
    if (L.cta) L.cta.hidden = true;
    const g = gen;
    return fn().catch((e) => {
      if (e !== STOP) throw e;
    }).finally(() => {
      if (g !== gen) return;
      showing = false;
      paintCta();
      schedule();
    });
  }
  function chore(fn) {
    const g = gen;
    chain = chain.then(() => (g === gen ? fn() : null)).catch((e) => {
      if (e !== STOP) console.error(e);
    }).then(() => {
      if (g === gen) {
        paintCta();
        schedule();
      }
    });
    return chain;
  }

  /* ---------- motion ---------- */
  const face = (n) => {
    S.pet.texture = T.pet[n] || T.pet.canon;
  };
  function hop(x, y, ms = 360, h = 24, depth) {
    const x0 = S.petC.x;
    const y0 = S.petC.y;
    const d0 = S.petC.depth || 1;
    const d1 = depth ?? d0;
    spring.vy -= 1.6;
    spring.vx += 1.0;
    return tween(ms, (k) => {
      S.petC.x = lerp(x0, x, k);
      S.petC.y = lerp(y0, y, k) - Math.sin(k * Math.PI) * h;
      S.petC.zIndex = lerp(y0, y, k);
      S.petC.depth = lerp(d0, d1, k);
      S.pet.rotation = Math.sin(k * Math.PI) * 0.12 * Math.sign(x - x0);
    }, E.io).then(() => {
      S.pet.rotation = 0;
      spring.vy += 2.2;
      spring.vx -= 1.4;
      sfx("land", { gain: 0.35, rate: 1.2 });
    });
  }
  const home = () => hop(xOf(0.13), yOf(0.875), 380, 26, 1);
  const tipOf = (spr, tip) => S.farm.toLocal(spr.toGlobal(new P.Point(tip.x, tip.y)));
  // Where the pet stands so the held tool, tipped to `rot`, pours over the plot.
  function standFor(p, spr, tip, rot) {
    const depth = p.row === "back" ? 0.8 : 0.95;
    const r0 = spr.rotation;
    const s0 = { x: S.hand.scale.x, y: S.hand.scale.y };
    spr.rotation = rot;
    S.hand.scale.set(depth);
    const o = S.petC.toLocal(spr.toGlobal(new P.Point(tip.x, tip.y)));
    spr.rotation = r0;
    S.hand.scale.set(s0.x, s0.y);
    return { x: p.cx - p.w * 0.06 - o.x, y: p.cy + p.w * 0.12, depth };
  }
  // A drop or seed thrown from `from` so it lands inside the plot.
  function aimDrop(from, p, tex, o = {}) {
    const tx = p.cx + (o.bias || 0) * p.w + rnd(-o.spread, o.spread) * p.w;
    const ty = p.cy + rnd(-0.07, 0.07) * p.w;
    const g = o.g ?? 760;
    const vy = o.vy ?? rnd(-60, -10);
    const dy = Math.max(2, ty - from.y);
    const t = (-vy + Math.sqrt(vy * vy + 2 * g * dy)) / g;
    return emit(tex, { x: from.x, y: from.y, vx: (tx - from.x) / t, vy, ay: g, life: t, s0: o.s ?? 0.45, s1: (o.s ?? 0.45) * 0.92, a0: 1, a1: 1, spin: o.spin || 0, onDie: o.onLand });
  }
  function splash(x, y) {
    const r = new P.Sprite(T.ring);
    r.anchor.set(0.5);
    r.position.set(x, y);
    r.tint = 0x9ad8f0;
    r.scale.set(0.04, 0.018);
    r.alpha = 0.9;
    S.fx.addChild(r);
    tween(260, (k) => {
      r.scale.set(0.04 + k * 0.12, (0.04 + k * 0.12) * 0.45);
      r.alpha = 0.9 * (1 - k);
    }, E.out2).then(() => r.destroy());
    for (let i = 0; i < 2; i++) emit(T.art.drop, { x, y: y - 1, vx: rnd(-40, 40), vy: rnd(-90, -50), ay: 600, life: 0.22, s0: 0.2, s1: 0.12, a0: 0.9, a1: 0.3 });
  }
  function setStage(p, stage, crop = p.data.crop) {
    p.stage = stage;
    p.plant.texture = plantTex(crop, stage);
    p.plant.visible = true;
    p.plant.alpha = 1;
    const b = p.plant.base;
    return tween(420, (k) => {
      const s = b * (k < 0.55 ? lerp(0.2, 1.18, k / 0.55) : lerp(1.18, 1, (k - 0.55) / 0.45));
      p.plant.scale.set(s, s * (1 + Math.sin(k * Math.PI) * 0.08));
    }, E.out2);
  }
  function arc(spr, x0, y0, x1, y1, ms, peak, o = {}) {
    return tween(ms, (k) => {
      spr.x = lerp(x0, x1, k);
      spr.y = lerp(y0, y1, k) - Math.sin(k * Math.PI) * peak;
      if (o.spin) spr.rotation = o.spin * k;
      if (o.s0 !== undefined) spr.scale.set(lerp(o.s0, o.s1, k));
    }, o.ease || E.lin);
  }
  function squash(p) {
    const b = p.plant.base;
    return tween(260, (k) => p.plant.scale.set(b * (1 + Math.sin(k * Math.PI) * 0.15), b * (1 - Math.sin(k * Math.PI) * 0.2)));
  }
  function bumpBasket() {
    const b = S.basketBase;
    tween(160, (k) => {
      const q = Math.sin(k * Math.PI) * 0.06;
      S.basketFront.scale.set(b * (1 + q), b * (1 - q));
    });
  }
  function addToPile(crop, x, y) {
    const pi = sprite(itemTex(crop), S.pile, x, y, 0.5, 0.5, 24);
    pi.rotation = rnd(-0.6, 0.6);
    pi.crop = crop;
    while (S.pile.children.length > PILE_MAX) S.pile.children[0].destroy();
  }
  // One crop item hops from the plot into the basket.
  function toBasket(p, crop, note, size) {
    const it = sprite(itemTex(crop), S.fx, p.cx + rnd(-8, 8), p.cy - 6, 0.5, 0.5, flySize(crop, size ?? (p.row === "back" ? 26 : 30)));
    const s0 = it.scale.x;
    if (note !== null) game("note-c6", { rate: PENTA[Math.min(7, note)] * 0.75, gain: 0.7 });
    const tx = S.basketTop.x + rnd(-14, 14);
    const ty = S.basketTop.y + rnd(-2, 6);
    return arc(it, it.x, it.y, tx, ty, 560, 70 + rnd(0, 30), { spin: rnd(-6, 6), s0, s1: crop === "sprout" ? s0 : s0 * 0.85 }).then(() => {
      it.destroy();
      thump({ gain: 0.5, rate: 1.3 });
      addToPile(crop, tx, ty + 4);
      cargo.push(crop);
      paintOrder();
      bumpBasket();
    });
  }
  function leafBurst(p) {
    burst(p.cx, p.cy - p.w * 0.3, 8, { tex: T.art.leaf, a0: Math.PI * 1.05, a1: Math.PI * 1.95, v0: 70, v1: 160, ay: 300, s0: 0.5, s1: 0.9, l0: 0.5, l1: 0.8 });
    burst(p.cx, p.cy, 6, { tex: T.dirt, a0: Math.PI * 1.1, a1: Math.PI * 1.9, v0: 50, v1: 120, ay: 420, s0: 0.25, s1: 0.45, l0: 0.35, l1: 0.55 });
  }
  function twinkle(dt, t) {
    for (const p of plots) {
      const ripe = p.stage === 3 && p.plant.visible && !pending.has(p.i);
      p.glow.alpha = ripe ? 0.32 + (calm ? 0 : Math.sin(t * 2.4 + p.i) * 0.09) : 0;
      p.plant.y = p.plantY - (ripe && !calm ? (1 + Math.sin(t * 2.4 + p.i)) * 2 : 0);
    }
    if (Math.floor(t * 6) === Math.floor((t - dt) * 6)) return;
    const ripe = plots.filter((p) => p.stage === 3 && p.plant.visible);
    if (!ripe.length || calm) return;
    const p = ripe[Math.floor(rnd(0, ripe.length))];
    emit(T.art.spark, { x: p.cx + rnd(-p.w * 0.3, p.w * 0.3), y: p.cy - rnd(p.w * 0.2, p.w * 0.7), life: 0.6, s0: 0.05, s1: 0.4, tint: p.data?.crop === "gold" ? 0xffe39a : 0xffffff, blend: "add", spin: 3 });
  }

  /* ---------- pieces of every show ---------- */
  async function giftDrop() {
    const boxW = W * 0.27;
    const gx = xOf(0.77);
    const floor = yOf(0.95);
    const shadow = sprite(T.glow, S.homeFx, gx, floor - 2, 0.5, 0.5, boxW * 1.3);
    shadow.tint = 0x4a2c20;
    shadow.scale.y *= 0.22;
    shadow.alpha = 0;
    const box = sprite(T.art.box, S.homeFx, gx, -70, 0.5, 1, boxW);
    const lid = sprite(T.art.lid, S.homeFx, gx, -70, 0.5, 1, boxW * 1.1);
    const sh0 = shadow.scale.x;
    sfx("drop", { gain: 0.9 });
    say(LINES.gift);
    await hold(tween(560, (k) => {
      box.y = lerp(-70, floor, k);
      box.rotation = Math.sin(k * 9) * 0.08 * (1 - k);
      lid.rotation = box.rotation;
      lid.y = box.y - boxW * 0.55;
      lid.x = box.x + Math.sin(box.rotation) * boxW * 0.55;
      shadow.alpha = 0.38 * k;
      shadow.scale.x = sh0 * lerp(0.4, 1, k);
    }, E.in2));
    box.rotation = lid.rotation = 0;
    lid.x = gx;
    sfx("land", { gain: 1 });
    thump({ gain: 0.8 });
    shake = 4;
    burst(gx, floor, 10, { tex: T.dust, a0: Math.PI, a1: Math.PI * 2, v0: 40, v1: 120, s0: 0.3, s1: 0.6, l0: 0.5, l1: 0.8, layer: S.homeFx });
    if (!calm) domAnim(petEl, [{ transform: "translateY(0)" }, { transform: "translateY(-16px)", offset: 0.45 }, { transform: "translateY(0)" }], { duration: 420, easing: "ease-out", fill: "none" });
    voice("happy", { at: 120, rate: 1.05 });
    const bs = box.scale.x;
    await hold(tween(260, (k) => {
      box.scale.set(bs * (1 + Math.sin(k * Math.PI) * 0.12), bs * (1 - Math.sin(k * Math.PI) * 0.14));
      lid.y = box.y - boxW * 0.55 * (1 - Math.sin(k * Math.PI) * 0.14);
    }));
    await hold(pause(380));
    tapSfx("unlock", { gain: 0.9 });
    sfx("sparkle", { at: 80, gain: 1 });
    const rays = sprite(T.rays, S.homeFx, gx, floor - boxW * 0.4, 0.5, 0.5, W * 0.9);
    rays.tint = 0xffe39a;
    rays.blendMode = "add";
    rays.alpha = 0;
    S.homeFx.setChildIndex(rays, 0);
    tickers.add((dt) => {
      if (!rays.destroyed) rays.rotation += dt * 0.6;
    });
    tween(400, (k) => {
      rays.alpha = k * 0.7;
    });
    arc(lid, gx, lid.y, W * 1.05, -40, 650, 70, { spin: 1.6 });
    burst(gx, floor - boxW * 0.45, 22, { tint: [0xffe39a, 0xffffff, 0xfff1b8], blend: "add", v0: 120, v1: 300, s0: 0.3, s1: 0.7, layer: S.homeFx });
    await hold(pause(300));
    return { box, shadow, rays };
  }

  // Every crop the gift plants, then what waits in the bag; 황금 감자 last for its sparkle.
  async function seedCard(r) {
    const crops = [...r.planted.map((pl) => pl.crop), ...r.farm.bag];
    const order = [...crops.filter((c) => c !== "gold"), ...crops.filter((c) => c === "gold")];
    const card = domAdd("f-card", `<h3>씨앗 꾸러미!</h3><p>텃밭에 심으면 쑥쑥 자라요</p><div class="f-seeds"></div>${order.includes("gold") ? '<p class="f-gold-line">반짝! 황금 감자 씨앗이 나왔어요!</p>' : ""}<button type="button" class="f-go">텃밭에 심으러 가기</button>`);
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "씨앗 꾸러미");
    const go = card.querySelector(".f-go");
    // A tap while the seeds deal still counts: the card closes once they are down.
    const tapped = new Promise((res) => go.addEventListener("click", res, { once: true }));
    await hold(domAnim(card, [{ transform: "translate(-50%,-40%) scale(.5)", opacity: 0 }, { transform: "translate(-50%,-50%) scale(1.05)", opacity: 1, offset: 0.7 }, { transform: "translate(-50%,-50%) scale(1)", opacity: 1 }], { duration: calm ? 200 : 380, easing: "ease-out" }));
    const seeds = card.querySelector(".f-seeds");
    for (const [i, crop] of order.entries()) {
      const s = domAdd(`f-seed${crop === "gold" ? " is-gold" : ""}`, `<img src="${artUrl(`item-${crop}`)}" alt=""><b>${CROPS[crop].name}</b>`, seeds);
      if (!calm) domAnim(s, [{ transform: "translateY(14px) scale(.4)", opacity: 0 }, { transform: "translateY(0) scale(1.1)", opacity: 1, offset: 0.7 }, { transform: "scale(1)", opacity: 1 }], { duration: 300, easing: "ease-out" });
      if (crop === "gold") {
        game("best", { gain: 0.9 });
        voice("excited", { at: 120, rate: 1.05 });
        const line = card.querySelector(".f-gold-line");
        line.classList.add("is-on");
        say(LINES.goldSeed);
      } else {
        game("note-c6", { rate: PENTA[Math.min(7, i + 1)], gain: 0.7 });
      }
      await hold(pause(crop === "gold" ? 400 : 240));
    }
    go.focus({ preventScroll: true });
    await hold(tapped);
    sfx("press", { gain: 0.8 });
    domAnim(card, [{ transform: "translate(-50%,-50%) scale(1)", opacity: 1 }, { transform: "translate(-50%,-50%) scale(.6)", opacity: 0 }], { duration: 260 }).then(() => card.remove());
  }

  async function slideIn() {
    sfx("whoosh", { gain: 0.9 });
    S.holder.style.visibility = "visible";
    const pr = petEl.getBoundingClientRect();
    const out = calm
      ? domAnim(petEl, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 })
      : domAnim(petEl, [{ transform: "translateX(0)", opacity: 1 }, { transform: `translateX(${-pr.width * 0.6}px)`, opacity: 0 }], { duration: 600, easing: "cubic-bezier(.6,0,.3,1)" });
    out.then(() => {
      if (entered) petEl.style.visibility = "hidden";
    });
    await hold(tween(700, (k) => {
      S.farm.x = W * (1 - k);
    }, E.io));
    S.farm.x = 0;
    for (const c of [...S.homeFx.children]) c.destroy();
  }

  async function plantOne(p, pl, tip = true) {
    const gold = pl.crop === "gold";
    S.packet.texture = gold ? T.art["packet-gold"] : T.art.packet;
    const s = standFor(p, S.packet, PACKET_TIP, 1.0);
    await hold(hop(s.x, s.y, 320, 22, s.depth));
    await hold(tween(170, (k) => {
      S.packet.rotation = lerp(0, 1.0, k);
    }, E.out2));
    farmSfx("patter", { gain: 0.9 });
    for (let j = 0; j < 3; j++) {
      aimDrop(tipOf(S.packet, PACKET_TIP), p, gold ? T.art["seed-gold"] : T.art["seed-light"], {
        spread: 0.12, s: 0.5, spin: 7, vy: rnd(-90, -50),
        onLand: (x, y) => {
          emit(T.art.spark, { x, y: y - 2, life: 0.35, s0: 0.12, s1: 0.32, a0: 1, a1: 0, tint: gold ? 0xffe39a : 0xffffff, blend: "add", spin: 4 });
          emit(T.dust, { x, y, vx: rnd(-10, 10), vy: -12, life: 0.4, s0: 0.12, s1: 0.22, a0: 0.8, a1: 0 });
        },
      });
      await hold(pause(80));
    }
    await hold(pause(260));
    if (tip) tween(150, (k) => {
      S.packet.rotation = lerp(1.0, 0, k);
    });
    p.data = { plot: p.i, crop: pl.crop, planting: true };
    setStage(p, 0, pl.crop);
    sfx("bonk", { gain: 0.35, rate: 1.4 });
    if (gold) {
      burst(p.cx, p.cy - 8, 12, { tint: [0xffe39a, 0xffffff], blend: "add", v0: 60, v1: 150, s0: 0.25, s1: 0.5 });
      game("ding", { at: 60, gain: 0.8, rate: 1.26 });
    }
    await hold(pause(100));
  }

  async function waterOne(p, crop, note) {
    const s = standFor(p, S.can, CAN_TIP, 0.55);
    await hold(hop(s.x, s.y, 300, 18, s.depth));
    await hold(tween(150, (k) => {
      S.can.rotation = lerp(0, 0.55, k);
    }, E.out2));
    farmSfx("splash", { gain: 0.9 });
    for (let j = 0; j < 14; j++) {
      aimDrop(tipOf(S.can, CAN_TIP), p, T.art.drop, {
        spread: 0.26, bias: 0.05, s: 0.38, g: 900, vy: rnd(-20, 20),
        onLand: (x, y) => {
          splash(x, y);
          p.wet.alpha = Math.min(0.9, p.wet.alpha + 0.06);
        },
      });
      await hold(pause(26));
    }
    await hold(pause(190));
    tween(160, (k) => {
      p.wet.alpha = lerp(p.wet.alpha, 0.9, k);
    });
    setStage(p, 1, crop);
    game("note-c6", { rate: PENTA[Math.min(7, note)], gain: 0.75 });
    burst(p.cx, p.cy - p.w * 0.15, 5, { tex: T.art.leaf, a0: Math.PI * 1.15, a1: Math.PI * 1.85, v0: 40, v1: 90, ay: 160, s0: 0.5, s1: 0.8, l0: 0.5, l1: 0.7 });
    await hold(tween(120, (k) => {
      S.can.rotation = lerp(0.55, 0, k);
    }));
  }

  const toolIn = (spr, tex) => {
    if (tex) spr.texture = tex;
    spr.visible = true;
    spr.alpha = 0;
    spr.rotation = 0;
    return tween(200, (k) => {
      spr.alpha = k;
    });
  };
  const toolOut = (spr) => tween(200, (k) => {
    spr.alpha = 1 - k;
  }).then(() => {
    spr.visible = false;
    spr.rotation = 0;
  });

  // The plot's words once planted: its 맛보기 wait, or what the next wait is after a 맛보기 harvest.
  function plantedWords(r, pl) {
    const after = r.farm.plots[pl.plot];
    if (pl.quick && after?.ripeAt) return tasteWords(after);
    const pk = r.picked.find((x) => x.plot === pl.plot);
    const next = CROPS[pl.crop].next;
    return pk?.quick && next ? `다음부터는 ${next} 걸려요` : "";
  }

  function settlePlot(r, i) {
    pending.delete(i);
    const d = r.farm.plots[i];
    const p = plots[i];
    const wet = p.wet.alpha;
    drawPlot(i, d);
    p.wet.alpha = wet;
    if (wet) tween(1400, (k) => {
      p.wet.alpha = wet * (1 - k);
    });
  }

  // The pet plants and waters each plot in turn, then says what each plot needs.
  async function plantAll(r, list) {
    if (!list.length) return;
    await hold(toolIn(S.packet));
    for (const [n, pl] of list.entries()) {
      const p = plots[pl.plot];
      S.can.visible = false;
      S.packet.visible = true;
      S.packet.alpha = 1;
      await plantOne(p, pl);
      S.packet.visible = false;
      S.can.visible = true;
      S.can.alpha = 1;
      sfx("sip", { gain: 0.5, rate: 1.3 });
      await waterOne(p, pl.crop, n + 2);
      S.can.visible = false;
      settlePlot(r, pl.plot);
      const words = plantedWords(r, pl);
      if (words) plotTag(p, words, pl.quick ? "is-taste" : "");
    }
    S.packet.visible = false;
    S.can.visible = false;
    await hold(home());
  }

  async function openPlot(i) {
    const p = plots[i];
    if (!p.data?.locked) return;
    await hold(tween(520, (k) => {
      p.lock.rotation = Math.sin(k * Math.PI * 6) * 0.3 * (1 - k * 0.5);
    }));
    game("ding", { rate: 1.5, gain: 0.8 });
    sfx("sparkle", { at: 60, gain: 0.9 });
    burst(p.cx, p.cy - p.w * 0.15, 18, { tint: [0xffe39a, 0xffffff], blend: "add", v0: 80, v1: 200, s0: 0.3, s1: 0.6 });
    const ly0 = p.lock.y;
    const tag = p.tag;
    p.tag = null;
    if (tag) domAnim(tag, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 }).then(() => tag.remove());
    tween(420, (k) => {
      p.lock.y = ly0 - k * 30;
      p.lock.alpha = 1 - k;
      p.bed.alpha = lerp(0.45, 1, k);
    }, E.out2).then(() => {
      p.lock.visible = false;
    });
    p.data = { plot: i, crop: null };
    pending.add(i);
    plotTag(p, LINES.plot, "is-plot", 3000);
    say(LINES.plot);
    await hold(pause(1500));
  }

  async function levelLine(level) {
    tapSfx("fanfare", { gain: 0.8 });
    voice("excited", { at: 100 });
    api.levelPop();
    const line = `쑥쑥 컸어요! 이제 Lv. ${level}!`;
    say(line);
    await hold(bigText(line, "is-level", 1100));
  }

  async function golden(i, hearts) {
    const p = plots[i];
    pending.add(i);
    say(LINES.gold);
    const rays = sprite(T.rays, S.fx, p.cx, p.cy - 30, 0.5, 0.5, W * 0.7);
    rays.tint = 0xffd75a;
    rays.blendMode = "add";
    rays.alpha = 0;
    tickers.add((dt) => {
      if (!rays.destroyed) rays.rotation += dt * 0.8;
    });
    tween(400, (k) => {
      rays.alpha = k * 0.45;
    });
    const zoomTo = (z, ms) => {
      if (calm) return Promise.resolve();
      const z0 = S.cam.scale.x;
      return tween(ms, (k) => {
        const zz = lerp(z0, z, k);
        const f = (zz - 1) / 0.12;
        S.cam.scale.set(zz);
        S.cam.pivot.set(lerp(W / 2, p.cx, f), lerp(H / 2, p.cy - 20, f));
      }, E.io);
    };
    zoomTo(1.12, 600);
    p.plant.visible = false;
    p.stage = -1;
    const glow = sprite(T.glow, S.fx, p.cx, p.cy - 4, 0.5, 0.5, 90);
    glow.tint = 0xffd75a;
    glow.blendMode = "add";
    const gold = sprite(itemTex("gold"), S.fx, p.cx, p.cy - 4, 0.5, 0.5, 40);
    leafBurst(p);
    sfx("whistle-up", { gain: 0.8 });
    await hold(tween(700, (k) => {
      gold.y = glow.y = p.cy - 4 - k * 58;
      gold.rotation = Math.sin(k * 9) * 0.15;
    }, E.out3));
    farmSfx("fanfare", { gain: 0.9 });
    voice("excited", { at: 200, rate: 1.08 });
    buzz([60, 40, 60, 40, 220]);
    burst(gold.x, gold.y, 26, { tint: [0xffe39a, 0xffffff, 0xffd75a], blend: "add", v0: 100, v1: 260, s0: 0.3, s1: 0.7, l0: 0.6, l1: 1.1 });
    ringPulse(gold.x, gold.y, 2.2, 0xffd75a, 700);
    bigText(LINES.gold, "is-gold", 1100);
    const bob = (dt, t) => {
      gold.y = glow.y = p.cy - 62 + Math.sin(t * 5) * 4;
      glow.alpha = 0.75 + Math.sin(t * 7) * 0.2;
    };
    tickers.add(bob);
    await hold(pause(1500));
    tickers.delete(bob);
    zoomTo(1, 500);
    tween(400, (k) => {
      rays.alpha = 0.45 * (1 - k);
    }).then(() => rays.destroy());
    // The pet holds it under its chin and lifts it to its mouth (texture y 262 of 512) for each bite.
    await hold(hop(xOf(0.2), yOf(0.875), 300, 16, 1));
    const CHIN = -0.42 * petH;
    const MOUTH = -0.475 * petH;
    const handAt = (y) => S.farm.toLocal(S.hand.toGlobal(new P.Point(0, y)));
    const holdAt = handAt(CHIN);
    glow.destroy();
    await hold(arc(gold, gold.x, gold.y, holdAt.x, holdAt.y, 420, 16, { spin: 6.3 }));
    const snack = new P.Sprite(itemTex("gold"));
    snack.anchor.set(0.5);
    snack.width = 30 / S.hand.scale.x;
    snack.scale.y = snack.scale.x;
    snack.position.set(0, CHIN);
    S.hand.addChild(snack);
    gold.destroy();
    face("react");
    const sn = snack.scale.x;
    for (let b = 0; b < 3; b++) {
      await hold(tween(90, (k) => {
        snack.y = lerp(CHIN, MOUTH, k);
      }, E.out2));
      face("munch");
      sfx(`chomp-${b}`, { gain: 0.9 });
      buzz(14);
      spring.vy += 0.7;
      snack.scale.set(sn * (1 - (b + 1) * 0.3));
      const m = handAt(MOUTH);
      for (let c = 0; c < 4; c++) emit(T.art.spark, { x: m.x + rnd(-6, 6), y: m.y + 4, vx: rnd(-40, 40), vy: rnd(-40, 10), ay: 520, life: 0.5, s0: 0.22, s1: 0.1, a0: 1, a1: 0.2, tint: 0xffd75a, spin: 5 });
      await hold(pause(150));
      face("react");
      await hold(tween(110, (k) => {
        snack.y = lerp(MOUTH, CHIN, k);
      }, E.out2));
      await hold(pause(90));
    }
    snack.destroy();
    voice("munch");
    sfx("gulp", { at: 260, gain: 0.8 });
    await hold(pause(520));
    face("canon");
    voice("happy", { rate: 1.05 });
    for (let h = 0; h < 6; h++) emit(T.art.heart, { x: S.petC.x + rnd(-30, 30), y: S.petC.y - petH * 0.7, vx: rnd(-20, 20), vy: rnd(-90, -60), life: 1.2, s0: 0.3, s1: 0.5 });
    api.hearts(hearts);
    sfx("sparkle", { gain: 0.7 });
    say(LINES.yum);
    await hold(pause(1600));
    await hold(home());
  }

  // Lines for seeds that arrived; gift seeds only while some still wait in the bag.
  async function seedLines(r) {
    if (r.created) return;
    const gifts = r.seeds.filter((s) => s.from === "gift").length;
    if (gifts && Math.min(gifts, r.farm.bag.length) > 0) {
      say(LINES.giftSeeds);
      voice("happy");
      await hold(pause(2200));
    }
  }
  async function unlockLines(r) {
    if (r.created) return;
    for (const s of r.seeds.filter((x) => x.from === "unlock")) {
      say(`${CROPS[s.crop].name} 씨앗이 생겼어요!`);
      sfx("sparkle", { gain: 0.8 });
      await hold(pause(1500));
    }
  }

  // Everything after the picks: level line, new plots, 황금 감자, unlock seeds, planting, gift seeds.
  async function aftermath(r, { levelShown = false } = {}) {
    if (r.leveledUp && !levelShown) await levelLine(r.level);
    for (const i of r.opened) await openPlot(i);
    const gold = r.picked.find((pk) => pk.crop === "gold");
    if (gold) await golden(gold.plot, r.hearts);
    await unlockLines(r);
    await plantAll(r, r.planted);
    for (const i of [...r.opened, ...r.picked.map((pk) => pk.plot)]) if (pending.has(i)) settlePlot(r, i);
    await seedLines(r);
  }

  async function tutorial(r) {
    const gift = await giftDrop();
    await seedCard(r);
    tween(300, (k) => {
      gift.box.alpha = 1 - k;
      gift.shadow.alpha = 0.38 * (1 - k);
      gift.rays.alpha = 0.7 * (1 - k);
    });
    await slideIn();
    say(LINES.here);
    voice("happy", { at: 100 });
    await hold(pause(1000));
    // The first plant and water pass as the mockup showed it, then each plot says its wait.
    await hold(toolIn(S.packet, T.art.packet));
    for (const pl of r.planted) await plantOne(plots[pl.plot], pl);
    await hold(toolOut(S.packet));
    say(LINES.water);
    await hold(home());
    await hold(toolIn(S.can));
    sfx("sip", { gain: 0.5, rate: 1.3 });
    for (const [n, pl] of r.planted.entries()) {
      await waterOne(plots[pl.plot], pl.crop, n + 2);
      settlePlot(r, pl.plot);
      const words = plantedWords(r, pl);
      // A first visit reads the wait before the pet moves on.
      if (words) {
        plotTag(plots[pl.plot], words, "is-taste", 3800);
        await hold(pause(1100));
      }
    }
    await hold(toolOut(S.can));
    await hold(home());
    say(LINES.wait);
    await hold(pause(400));
  }

  /* ---------- the plushie harvest ---------- */
  function knock() {
    tapWord();
    sfx("sparkle", { gain: 1 });
    voice("excited", { at: 40 });
    face("react");
    spring.vy -= 2;
    spring.vx += 1.4;
    later(() => {
      if (!showing) face("canon");
    }, 520);
  }

  async function harvestShow(r) {
    const pc = { x: S.petC.x, y: S.petC.y - petH * 0.5 };
    face("react");
    spring.vy -= 3;
    spring.vx += 2;
    shake = 7;
    flash(0.5, 420);
    farmSfx("ripple", { gain: 0.9 });
    buzz([40, 60, 40, 60, 160]);
    shockwave(pc.x, pc.y, 22, 120, 900);
    ringPulse(pc.x, pc.y, 3.2, 0xfff1b8, 700);
    await hold(pause(260));
    const regular = r.picked.filter((pk) => pk.crop !== "gold");
    let note = 0;
    const landed = [];
    for (const pk of regular) {
      const p = plots[pk.plot];
      squash(p);
      leafBurst(p);
      for (let j = 0; j < CROPS[pk.crop].items; j++) {
        landed.push(toBasket(p, pk.crop, note++));
        await hold(pause(70));
      }
      p.plant.visible = false;
      p.stage = -1;
      p.data = { plot: pk.plot, crop: null };
      pending.add(pk.plot);
      await hold(pause(110));
    }
    await hold(Promise.all(landed));
    await hold(pause(regular.length ? 600 : 200));
    face("canon");
    await bus(true);
  }

  const round = [];
  const cargo = [];
  const flights = new Set();
  let busTimer = 0;
  let busState = "";
  let loadBus = null;
  let order = null;
  let roundNote = 0;
  let lastPick = 0;

  function guide(step) {
    guideStep = step;
    L.guide?.remove();
    L.hand?.remove();
    const text = step === 1 ? "쓱 밀어서 수확해요!" : step === 2 ? LINES.load : "다음엔 인형을 톡! 한 번에 수확해요";
    say(text);
    L.cta.hidden = true;
    L.guide = domAdd("f-guide", `${step === 3 ? KEY_SVG : ""}<b>${text}</b>`);
    L.guide.setAttribute("role", "status");
    if (step === 3) return;
    L.hand = domAdd(`f-hand is-${step === 1 ? "swipe" : "basket"}`, '<svg viewBox="0 0 80 88" aria-hidden="true"><path d="M25 43V13c0-10 13-10 13 0v23c3-8 13-5 13 2 5-6 13-2 13 5 8-3 13 2 11 11l-5 19c-2 8-9 11-21 11-13 0-21-4-27-12L8 53c-5-8 4-16 11-9l9 9" fill="#fffaf0" stroke="#4a2c20" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg><span>→</span>');
    L.hand.style.left = `${step === 1 ? plots[0].cx : S.basketTop.x}px`;
    L.hand.style.top = `${step === 1 ? plots[0].cy - 30 : S.basketTop.y - 20}px`;
    L.hand.style.setProperty("--swipe", `${plots[2].cx - plots[0].cx}px`);
    if (step === 2) {
      const repeat = () => {
        if (guideStep !== 2) return;
        say(text);
        guideTimer = setTimeout(repeat, 8000);
      };
      guideTimer = setTimeout(repeat, 8000);
    }
  }
  async function finishGuide() {
    if (!guideStep) return;
    clearTimeout(guideTimer);
    guideDone = true;
    try { localStorage.setItem(guideKey, "1"); } catch {}
    guide(3);
    await hold(new Promise((resolve) => {
      const done = () => {
        clearTimeout(guideTimer);
        win.removeEventListener("pointerdown", done);
        waits.delete(done);
        resolve();
      };
      waits.add(done);
      win.addEventListener("pointerdown", done, { once: true });
      guideTimer = setTimeout(done, 3000);
    }));
    L.guide?.remove();
    guideStep = 0;
  }

  function flushRound() {
    const newest = round.at(-1) || latestReply;
    if (newest) api.level(newest);
    for (const r of round) r.painted = true;
  }
  function roundReply() {
    const newest = round.at(-1);
    const unique = (key) => [...new Map(round.flatMap((r) => r[key]).map((p) => [p.plot, p])).values()];
    return { ...newest, picked: unique("picked"), planted: unique("planted"), opened: [...new Set(round.flatMap((r) => r.opened))], seeds: round.flatMap((r) => r.seeds), leveledUp: round.some((r) => r.leveledUp), xpGain: round.reduce((n, r) => n + (r.painted ? 0 : r.xpGain), 0) };
  }
  function paintOrder(loaded = {}) {
    if (!order) return;
    const totals = {};
    for (const crop of cargo) totals[crop] = (totals[crop] || 0) + 1;
    order.innerHTML = Object.entries(totals).map(([crop, n]) => `<span class="f-chip"><img src="${artUrl(`item-${crop}`)}" alt="${CROPS[crop].name}"><span>${loaded[crop] || 0}/${n}</span></span>`).join("");
  }
  function scheduleBus() {
    clearTimeout(busTimer);
    if (!entered || !round.length || busState) return;
    const ripe = plots.some((p) => p.stage === 3 && !pending.has(p.i));
    const delay = ripe ? Math.max(0, lastPick + 2500 - performance.now()) : 600;
    busTimer = setTimeout(async () => {
      if (api.picking() || flights.size) {
        scheduleBus();
        return;
      }
      try { await bus(); } catch (e) { if (e !== STOP) api.fail(e); }
    }, delay);
  }
  async function xpFlight(r) {
    if (r.xpGain <= 0) return;
    const box = win.getBoundingClientRect();
    const pin = document.querySelector(".level-pin").getBoundingClientRect();
    const el = domAdd("f-xp f-delivery", `+${r.xpGain} XP`, document.body);
    el.style.left = `${box.left + W * 0.64}px`;
    el.style.top = `${box.top + H * 0.4}px`;
    const dx = pin.left + pin.width / 2 - box.left - W * 0.64;
    const dy = pin.top + pin.height / 2 - box.top - H * 0.4;
    await hold(domAnim(el, [{ transform: "translate(-50%, 0) scale(1.4)", opacity: 1 }, { transform: `translate(calc(-50% + ${dx}px), ${dy}px) scale(.6)`, opacity: 1 }], { duration: calm ? 300 : 850, easing: "ease-in-out" }));
    el.remove();
    game("result", { gain: 0.9 });
    flushRound();
    api.levelPop();
  }
  async function settle(r) {
    await xpFlight(r);
    flushRound();
    await finishGuide();
    round.length = 0;
    cargo.length = 0;
    roundNote = 0;
    await aftermath(r);
    busState = "";
    showing = false;
    paintCta();
    schedule();
  }
  async function bus(auto = false) {
    clearTimeout(busTimer);
    // 황금 감자 never rides in the basket: a round of only gold skips the bus and keeps the guide for the next crop.
    if (!cargo.length) {
      clearTimeout(guideTimer);
      guideStep = 0;
      L.hand?.remove();
      L.guide?.remove();
      showing = true;
      L.cta.hidden = true;
      return settle(roundReply());
    }
    busState = "arriving";
    L.cta.hidden = true;
    say(LINES.bus);
    const busX = xOf(0.64);
    const bx0 = W + S.bus.width;
    S.bus.x = bx0;
    order = domAdd("f-bubble f-order", "", L.field);
    order.style.left = `${busX}px`;
    order.style.top = `${Math.max(66, S.bus.y - S.bus.height - 44)}px`;
    paintOrder();
    await hold(tween(400, (k) => { S.bus.x = lerp(bx0, busX, k); }, E.out3));
    busState = "waiting";
    order.dataset.state = busState;
    if (!auto) {
      if (guideStep === 1) guide(2);
      else say(LINES.load);
      const bounce = (dt, t) => {
        S.basketGlow.alpha = 0.5 + Math.sin(t * 4) * 0.2;
        S.basketFront.scale.set(S.basketBase * (1 + (calm ? 0 : Math.sin(t * 5) * 0.06)));
      };
      tickers.add(bounce);
      await hold(new Promise((resolve) => {
        loadBus = resolve;
        if (guideStep !== 2) busTimer = setTimeout(() => { say("제가 실을게요!"); resolve(); }, 5000);
      }));
      tickers.delete(bounce);
      clearTimeout(busTimer);
    }
    loadBus = null;
    clearTimeout(guideTimer);
    L.hand?.remove();
    L.guide?.remove();
    showing = true;
    L.cta.hidden = true;
    busState = "loading";
    order.dataset.state = busState;
    while (api.picking() || flights.size) await hold(pause(40));
    S.basketGlow.alpha = 0;
    S.basketFront.scale.set(S.basketBase);
    const r = roundReply();
    const loaded = {};
    for (const [i, crop] of cargo.entries()) {
      const it = S.pile.children[0];
      if (it) it.destroy();
      const fly = sprite(itemTex(crop), S.fx, S.basketTop.x, S.basketTop.y, 0.5, 0.5, flySize(crop, 30));
      game("note-c6", { rate: PENTA[Math.min(i, 7)], gain: 0.7 });
      await hold(arc(fly, fly.x, fly.y, busX, S.bus.y - S.bus.height * 0.45, 280, 65, { spin: 5 }));
      fly.destroy();
      loaded[crop] = (loaded[crop] || 0) + 1;
      paintOrder(loaded);
    }
    domAdd("f-check", "✓", order);
    game("ding");
    buzz([25, 40, 65]);
    await hold(pause(650));
    farmSfx("honk");
    voice("happy", { at: 120 });
    busState = "leaving";
    order.dataset.state = busState;
    await hold(tween(900, (k) => { S.bus.x = lerp(busX, -S.bus.width, k); }, E.in2));
    order.remove();
    order = null;
    await settle(r);
  }

  /* ---------- a screen pick ---------- */
  async function pickFx(r) {
    const landed = [];
    for (const pk of r.picked) {
      const p = plots[pk.plot];
      farmSfx("pop");
      buzz(10);
      pending.add(pk.plot);
      if (pk.crop === "gold") continue;
      await hold(squash(p));
      leafBurst(p);
      p.plant.visible = false;
      p.stage = -1;
      p.data = { plot: pk.plot, crop: null };
      landed.push(toBasket(p, pk.crop, roundNote++, 30));
    }
    await hold(Promise.all(landed));
  }

  // A growing plot shakes its leaves and says how long it has left; a locked one rattles its lock.
  function wiggle(i) {
    const p = plots[i];
    const d = p.data;
    if (!d) return;
    sfx("press", { gain: 0.6, rate: 1.2 });
    if (d.locked) {
      tween(420, (k) => {
        p.lock.rotation = Math.sin(k * Math.PI * 5) * 0.25 * (1 - k);
      });
      return;
    }
    if (!d.crop || !p.plant.visible) return;
    const b = p.plant.base;
    tween(460, (k) => {
      p.plant.rotation = Math.sin(k * Math.PI * 4) * 0.12 * (1 - k);
      p.plant.scale.set(b, b * (1 - Math.sin(k * Math.PI) * 0.06));
    }).then(() => {
      p.plant.rotation = 0;
    });
    burst(p.cx, p.cy - p.w * 0.35, 3, { tex: T.art.leaf, a0: Math.PI * 1.1, a1: Math.PI * 1.9, v0: 30, v1: 70, ay: 200, s0: 0.4, s1: 0.6, l0: 0.4, l1: 0.6 });
    const words = d.ripeAt ? timeWords(d, serverNow()).left : "";
    if (words) plotTag(p, words, "", 2600);
  }

  /* ---------- ripening on an open farm ---------- */
  let growTimer = 0;
  function schedule() {
    clearTimeout(growTimer);
    if (!entered) return;
    const now = serverNow();
    let next = now + 15000;
    for (const p of plots) {
      const d = p.data;
      if (!d?.crop || !d.ripeAt || p.stage >= 3 || pending.has(p.i)) continue;
      const half = d.at + (d.ripeAt - d.at) / 2;
      if (p.stage < 2 && half > now) next = Math.min(next, half);
      next = Math.min(next, d.ripeAt + 300);
    }
    growTimer = setTimeout(grow, Math.max(250, next - now));
  }
  function grow() {
    if (!entered) return;
    if (showing) {
      schedule();
      return;
    }
    const now = serverNow();
    let ripened = 0;
    for (const p of plots) {
      const d = p.data;
      if (!d?.crop || !d.ripeAt || pending.has(p.i) || !p.plant.visible) continue;
      const s = stageOf(d, now);
      if (s === p.stage) continue;
      setStage(p, s);
      if (s === 3) {
        ripened += 1;
        burst(p.cx, p.cy - p.w * 0.35, 6, { tint: d.crop === "gold" ? [0xffe39a, 0xffffff] : [0xffffff, 0xfff6d6], blend: "add", v0: 40, v1: 110, s0: 0.25, s1: 0.45 });
      } else {
        game("note-c6", { rate: PENTA[3], gain: 0.55 });
      }
    }
    const was = ctaRipe;
    paintCta();
    // The chip twinkle is mostly above 4 kHz, sharp on a phone speaker, so it plays softer.
    if (ripened) farmSfx("twinkle", { gain: kit === "chip" ? 0.6 : 1 });
    if (!was && ctaRipe && !guideStep) {
      say(LINES.ripe);
      voice("ask", { at: 200 });
      sfx("want", { at: 300, gain: 0.8 });
    }
    schedule();
  }

  /* ---------- the touch prompt for a page-load harvest ---------- */
  function promptTouch() {
    const glow = (dt, t) => {
      S.basketGlow.alpha = 0.55 + Math.sin(t * 4) * 0.25;
    };
    tickers.add(glow);
    const el = document.createElement("div");
    el.className = "f-prompt";
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.innerHTML = `<p>${LINES.prompt}</p>`;
    document.body.appendChild(el);
    el.focus({ preventScroll: true });
    return new Promise((res) => {
      const done = () => {
        waits.delete(done);
        document.removeEventListener("pointerdown", go, true);
        document.removeEventListener("keydown", go, true);
        tickers.delete(glow);
        S.basketGlow.alpha = 0;
        el.remove();
        res();
      };
      const go = (e) => {
        if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
        done();
      };
      waits.add(done);
      document.addEventListener("pointerdown", go, true);
      document.addEventListener("keydown", go, true);
    });
  }

  /* ---------- build, enter, leave ---------- */
  function changed() {
    const m = measure();
    return m.W !== W || m.H !== H;
  }
  function teardown() {
    built = false;
    entered = false;
    clearTimeout(growTimer);
    for (const id of timers) clearTimeout(id);
    timers.clear();
    S.holder?.remove();
    L.dom?.remove();
    app?.destroy(true, { children: true });
    app = null;
    S = {};
    for (const t of owned) t.destroy(true);
    owned.length = 0;
    for (const t of Object.values(T.pet || {})) t.destroy(true);
    T.pet = null;
    facesFrom = "";
  }
  async function ready() {
    if (!built || changed()) {
      teardown();
      await setupStage();
    } else {
      await loadFaces();
    }
  }

  try {
    await setupStage();
  } catch (error) {
    teardown();
    throw error;
  }

  return {
    // Draws the field as it was before `r` and brings the farm in; "tutorial" plays the whole first open.
    async enter(r, how = "open") {
      const g = gen;
      await ready();
      // 집으로 while the stage was still loading: stay shut.
      if (g !== gen) return undefined;
      cut();
      calm = Boolean(api.still());
      entered = true;
      latestReply = r;
      setTruth(r.farm);
      paintSky();
      const drawn = r.created ? r.farm.plots.map((p, i) => (r.planted.some((pl) => pl.plot === i) ? { plot: i, crop: null } : p)) : before(r);
      drawn.forEach((d, i) => drawPlot(i, d));
      for (const pl of r.planted) pending.add(pl.plot);
      for (const pk of r.picked) pending.add(pk.plot);
      for (const i of r.created ? [] : r.opened) pending.add(i);
      S.farm.x = W;
      S.holder.style.visibility = "visible";
      wake();
      tickers.add(twinkle);
      if (how === "tutorial") return show(() => tutorial(r));
      await show(() => slideIn());
      if (!entered) return undefined;
      // A page-load harvest waits for its touch before the show; with nothing ripe it just says so.
      if (how === "visit" && r.picked.length) {
        L.cta.hidden = true;
        return undefined;
      }
      // The pet speaks for the farm as it opens, so the room's last line never lingers over it.
      if (!guideStep) say(ctaRipe ? LINES.ripe : LINES.growing);
      chore(() => aftermath(r));
      return undefined;
    },
    // The plushie harvest, picks or not.
    async harvest(r, { knocked = false } = {}) {
      try {
        await hold(Promise.all(flights));
      } catch (e) {
        // A cut (집으로) while a picked crop still flew: nothing to show, and the page paints the reply.
        if (e !== STOP) throw e;
        setTruth(r.farm);
        return undefined;
      }
      if (!r.picked.length && !round.length) {
        setTruth(r.farm);
        if (!knocked) knock();
        say(LINES.growing);
        nudgeCta();
        if (r.planted.length || r.opened.length || r.seeds.length) {
          for (const pl of r.planted) pending.add(pl.plot);
          for (const i of r.opened) pending.add(i);
          chore(() => aftermath(r));
        }
        return Promise.resolve();
      }
      if (latestReply === r && !round.length) latestReply = null;
      cut({ keepRound: true });
      latestReply = r;
      round.push(r);
      setTruth(r.farm);
      before(roundReply()).forEach((d, i) => drawPlot(i, d));
      for (const pl of r.planted) pending.add(pl.plot);
      for (const i of r.opened) pending.add(i);
      for (const pk of r.picked) pending.add(pk.plot);
      return show(() => harvestShow(r));
    },
    // Pick replies wait in the basket until delivery.
    picked(r) {
      latestReply = r;
      setTruth(r.farm);
      if (!r.picked.length) {
        r.farm.plots.forEach((d, i) => {
          if (!pending.has(i)) drawPlot(i, d);
        });
        paintCta();
        return;
      }
      round.push(r);
      lastPick = performance.now();
      const flight = pickFx(r);
      flights.add(flight);
      flight.catch((e) => { if (e !== STOP) api.fail(e); }).finally(() => {
        flights.delete(flight);
        scheduleBus();
      });
      for (const pl of r.planted) pending.add(pl.plot);
      for (const i of r.opened) pending.add(i);
      paintCta();
    },
    loadAt(x, y) {
      if (!loadBus) return false;
      const basket = x < W * 0.3 && y > H * 0.7;
      const busHit = Math.abs(x - S.bus.x) < S.bus.width / 2 && y > S.bus.y - S.bus.height && y < S.bus.y + 12;
      if (!basket && !busHit) return false;
      loadBus();
      return true;
    },
    trail(x, y) {
      if (!entered || showing) return;
      burst(x, y, 3, { tex: T.art.spark, tint: [0xffd36a, 0xffffff], v0: 8, v1: 30, s0: 0.2, s1: 0.35, l0: 0.2, l1: 0.4 });
    },
    knock,
    promptTouch,
    // Which plot a screen tap at window point (x, y) lands on, and what it holds.
    plotAt(x, y) {
      if (!entered || showing) return null;
      const order = [3, 4, 5, 0, 1, 2];
      // A front box starts where the back row's ends, so a tap on a back bed picks the back plot.
      const floor = plots[0].cy + plots[0].w * 0.3;
      for (const i of order) {
        const p = plots[i];
        const top = i >= 3 ? Math.max(p.cy - p.w * 0.95, floor) : p.cy - p.w * 0.95;
        if (x < p.cx - p.w * 0.55 || x > p.cx + p.w * 0.55 || y < top || y > p.cy + p.w * 0.3) continue;
        const d = p.data;
        if (pending.has(i) || !d) return { plot: i, kind: "busy" };
        if (d.locked) return { plot: i, kind: "locked" };
        if (!d.crop) return { plot: i, kind: "empty" };
        return { plot: i, kind: p.stage === 3 ? "ripe" : "growing" };
      }
      return null;
    },
    wiggle,
    // Redraws from the server's view, dropping anything half shown.
    redraw(view) {
      cut();
      setTruth(view);
      view.plots.forEach((d, i) => drawPlot(i, d));
      paintCta();
      schedule();
    },
    // The window changed size under an open farm: rebuild at the new size and redraw from the truth.
    async refit() {
      if (!entered || showing || !changed()) return;
      cut();
      teardown();
      const g = gen;
      await setupStage();
      if (g !== gen) return;
      entered = true;
      calm = Boolean(api.still());
      paintSky();
      S.farm.x = 0;
      S.holder.style.visibility = "visible";
      petEl.style.visibility = "hidden";
      wake();
      tickers.add(twinkle);
      truth.plots.forEach((d, i) => drawPlot(i, d));
      paintCta();
      schedule();
    },
    async leave() {
      // Mid-rebuild there is no stage to slide out; the bump keeps a pending enter or refit shut.
      if (!built) {
        gen += 1;
        entered = false;
        petEl.style.visibility = "";
        // The slide-out's last frame (opacity 0) would keep the home pet invisible.
        petEl.getAnimations().forEach((a) => a.cancel());
        return;
      }
      cut();
      entered = false;
      clearTimeout(growTimer);
      L.cta.hidden = true;
      const away = petEl.style.visibility === "hidden";
      petEl.style.visibility = "";
      petEl.getAnimations().forEach((a) => a.cancel());
      const pr = petEl.getBoundingClientRect();
      if (away && !calm) domAnim(petEl, [{ transform: `translateX(${-pr.width * 0.6}px)`, opacity: 0 }, { transform: "translateX(0)", opacity: 1 }], { duration: 520, easing: "cubic-bezier(.3,0,.2,1)", fill: "none" });
      const x0 = S.farm.x;
      const until = cutSignal;
      await Promise.race([tween(calm ? 1 : 520, (k) => {
        S.farm.x = lerp(x0, W, E.in2(k));
      }), until]);
      if (entered) return;
      for (const p of plots) {
        p.tag?.remove();
        p.tag = null;
      }
      S.holder.style.visibility = "hidden";
      sleep();
    },
    get busy() {
      return showing;
    },
    destroy() {
      if (built) cut();
      teardown();
    },
  };
}
