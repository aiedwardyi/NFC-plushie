// The 포키 카드: the pet as a 1080x1920 story card in its own world and edition, to save or send from its sheet.
export const CARD = { width: 1080, height: 1920, safe: { top: 260, bottom: 1660 }, bar: { w: 760, h: 18, max: 120 } };

const TAU = Math.PI * 2;
const RADIUS = { classic: 72, "8bit": 0, milk: 72, najeon: 24 };
const FRAME = { classic: 28, "8bit": 24, milk: 28, najeon: 22 };
const FADE = 36;
const TAGLINE = "인형을 톡 하면 만나요";
const BRAND = "POKKEY";
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function fitText(measure, room, max) {
  const wide = measure(max);
  let size = wide > room ? Math.max(1, Math.floor((max * room) / wide)) : max;
  while (size > 1 && measure(size) > room) size -= 1;
  while (size < max && measure(size + 1) <= room) size += 1;
  return size;
}

// Like the app's bar: base, edition and training over 120, the boost left to its tag; the edition's gold rides the tip.
export function barFill({ base = 0, plus = 0, trained = 0 }, edition, { width = CARD.bar.w, max = CARD.bar.max } = {}) {
  const fill = Math.round(clamp01((base + plus + trained) / max) * width);
  const gold = edition === "rare" || edition === "legendary" ? Math.min(fill, Math.round(clamp01(plus / max) * width)) : 0;
  return { fill, gold, fade: Math.min(FADE, gold) };
}

export const seoulDate = (ms) => new Date(ms + 9 * 3600000).toISOString().slice(0, 10).replaceAll("-", ".");

export function cardFileName(name) {
  const safe = String(name || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim();
  return safe ? `${safe}-pokkey-card.png` : "pokkey-card.png";
}

export const artSize = (natural, room, { pixel = false } = {}) => (pixel ? Math.max(1, Math.floor(room / natural)) * natural : Math.min(natural, room));

// iPhones and iPads keep an image from its own tab with a long press; a download lands in Files instead.
export const savesInTab = (ua, touches = 0) => /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touches > 1);

export const captionOf = ({ animal, level, days }) => `${animal} · Lv. ${level} · 함께한 지 ${days}일`;

const PRETENDARD = '"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
const GALMURI = `"Galmuri11", ${PRETENDARD}`;
const SSURROUND = `"Cafe24Ssurround", ${PRETENDARD}`;
const BATANG = '"Gowun Batang", "Noto Serif KR", serif';
const SIZE = { name: 88, wordmark: 28, seal: 26, caption: 34, label: 34, total: 52, tagline: 30, brand: 30, date: 24 };
// Galmuri11 is drawn on an 11px grid, so the 8비트 card keeps its type on it.
const PIXEL_SIZE = { name: 88, wordmark: 33, seal: 22, caption: 33, label: 33, total: 55, tagline: 33, brand: 33, date: 22 };
const sizes = (world) => (world === "8bit" ? PIXEL_SIZE : SIZE);

const line = (base, px) => ({ top: base - Math.round(px * 0.92), bottom: base + Math.round(px * 0.3) });

export function cardLayout(world) {
  const px = sizes(world);
  const box = { x: 80, y: 220, w: 920, h: 1480, r: RADIUS[world] ?? RADIUS.classic };
  const seal = { right: 920, top: 268, h: 56 };
  const rows = [0, 1, 2, 3].map((i) => {
    const top = 1060 + i * 108;
    return { top, base: top + 40, bar: top + 60 };
  });
  const at = { wordmark: 306, name: 938, caption: 1012, tagline: 1560, brand: 1612 };
  const lines = {
    wordmark: line(at.wordmark, px.wordmark),
    seal: { top: seal.top, bottom: seal.top + seal.h },
    name: line(at.name, px.name),
    caption: line(at.caption, px.caption),
    ...Object.fromEntries(rows.map((row, i) => [`stat${i + 1}`, { top: row.top, bottom: row.bar + CARD.bar.h }])),
    tagline: line(at.tagline, px.tagline),
    brand: line(at.brand, px.brand),
    date: line(at.brand, px.date),
  };
  return { box, frame: FRAME[world] ?? FRAME.classic, left: 160, right: 920, cx: 540, seal, at, art: { top: 344, room: 512 }, room: 760, rows, divider: 1500, lines };
}

const STATS = { str: ["#e4694f", "#f5a38c"], int: ["#6c7fd8", "#a9b5f0"], agi: ["#35a887", "#86d6bd"], cha: ["#e0719a", "#f3afc7"] };
const LOOK = {
  classic: {
    type: { name: [800, PRETENDARD], wordmark: [800, PRETENDARD], seal: [800, PRETENDARD], caption: [600, PRETENDARD], label: [800, PRETENDARD], total: [800, PRETENDARD], tagline: [700, PRETENDARD], brand: [800, PRETENDARD], date: [600, PRETENDARD] },
    text: "#f8f0e3", muted: "rgba(248,240,227,.68)", gold: "#d6a546", stats: STATS, total: null, glyph: 1,
    seal: ["#f8f0e3", "#141b2b"], rule: "rgba(241,214,140,.3)", track: () => "rgba(8,11,19,.5)",
  },
  "8bit": {
    type: { name: [700, GALMURI], wordmark: [700, GALMURI], seal: [700, GALMURI], caption: [400, GALMURI], label: [700, GALMURI], total: [700, GALMURI], tagline: [400, GALMURI], brand: [700, GALMURI], date: [400, GALMURI] },
    text: "#fff1e8", muted: "#c2c3c7", gold: "#ffec27", stats: { str: ["#ff004d", "#ffa300"], int: ["#83769c", "#29adff"], agi: ["#008751", "#00e436"], cha: ["#ff77a8", "#ff77a8"] }, total: null, glyph: 1,
    seal: ["#fff1e8", "#1d2b53"], rule: "rgba(255,241,232,.3)", track: () => "#0b0d1a",
  },
  milk: {
    type: { name: [400, SSURROUND], wordmark: [400, SSURROUND], seal: [400, SSURROUND], caption: [700, PRETENDARD], label: [800, PRETENDARD], total: [400, SSURROUND], tagline: [700, PRETENDARD], brand: [400, SSURROUND], date: [700, PRETENDARD] },
    text: "#7a2e45", muted: "rgba(122,46,69,.62)", gold: "#d99a16", stats: STATS, total: "#7a2e45", glyph: 0,
    seal: ["#7a2e45", "#fff8f3"], rule: "rgba(242,87,127,.32)", track: (deep) => mix(deep, "#ffffff", 0.86),
  },
  najeon: {
    type: { name: [700, BATANG], wordmark: [800, PRETENDARD], seal: [700, BATANG], caption: [700, BATANG], label: [700, BATANG], total: [700, BATANG], tagline: [700, BATANG], brand: [800, PRETENDARD], date: [400, BATANG] },
    text: "#ece9f2", muted: "rgba(220,217,230,.62)", gold: "#e2c27a", stats: STATS, total: null, glyph: 1,
    seal: ["#ece9f2", "#0c0c10"], rule: "rgba(233,231,239,.24)", track: () => "#050507", trackEdge: "rgba(233,231,239,.2)",
  },
};
const lookOf = (world) => LOOK[world] || LOOK.classic;
const fontOf = (look, world, role, px = sizes(world)[role]) => `${look.type[role][0]} ${px}px ${look.type[role][1]}`;

export function cardFonts(world) {
  const look = lookOf(world);
  const faces = Object.keys(look.type).map((role) => fontOf(look, world, role).replace(/,.*$/, ""));
  return [...new Set([...faces, `700 34px "Pretendard Variable"`])];
}

/* ---------- painting ---------- */

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function mix(a, b, k) {
  const p = rgbOf(a);
  const q = rgbOf(b);
  return `rgb(${p.map((v, i) => Math.round(v + (q[i] - v) * k)).join(",")})`;
}

function rng(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedOf = (text) => Array.from(String(text)).reduce((h, ch) => Math.imul(h ^ ch.codePointAt(0), 16777619), 2166136261);

function rounded(x, X, Y, W, H, R) {
  const r = Math.max(0, Math.min(R, W / 2, H / 2));
  x.moveTo(X + r, Y);
  x.arcTo(X + W, Y, X + W, Y + H, r);
  x.arcTo(X + W, Y + H, X, Y + H, r);
  x.arcTo(X, Y + H, X, Y, r);
  x.arcTo(X, Y, X + W, Y, r);
  x.closePath();
}

function notched(x, X, Y, W, H, u) {
  x.moveTo(X + u, Y);
  x.lineTo(X + W - u, Y);
  x.lineTo(X + W - u, Y + u);
  x.lineTo(X + W, Y + u);
  x.lineTo(X + W, Y + H - u);
  x.lineTo(X + W - u, Y + H - u);
  x.lineTo(X + W - u, Y + H);
  x.lineTo(X + u, Y + H);
  x.lineTo(X + u, Y + H - u);
  x.lineTo(X, Y + H - u);
  x.lineTo(X, Y + u);
  x.lineTo(X + u, Y + u);
  x.closePath();
}

function plate(x, world, X, Y, W, H, R) {
  x.beginPath();
  if (world === "8bit") notched(x, X, Y, W, H, 4);
  else rounded(x, X, Y, W, H, R);
}

function linear(x, x0, y0, x1, y1, stops) {
  const g = x.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function glow(x, cx, cy, rx, ry, rgb, a, stop = 0.7) {
  x.save();
  x.translate(cx, cy);
  x.scale(1, ry / rx);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(stop, `rgba(${rgb},0)`);
  x.fillStyle = g;
  x.fillRect(-rx, -rx, rx * 2, rx * 2);
  x.restore();
}

function sparkle(x, cx, cy, r, color) {
  x.beginPath();
  x.moveTo(cx, cy - r);
  x.quadraticCurveTo(cx, cy, cx + r, cy);
  x.quadraticCurveTo(cx, cy, cx, cy + r);
  x.quadraticCurveTo(cx, cy, cx - r, cy);
  x.quadraticCurveTo(cx, cy, cx, cy - r);
  x.fillStyle = color;
  x.fill();
}

function dot(x, cx, cy, r, color) {
  x.beginPath();
  x.arc(cx, cy, r, 0, TAU);
  x.fillStyle = color;
  x.fill();
}

function aside(r, pad = 24) {
  for (;;) {
    const px = r() * CARD.width;
    const py = r() * CARD.height;
    if (px < 80 - pad || px > 1000 + pad || py < 220 - pad || py > 1700 + pad) return [px, py];
  }
}

function grain(x, make, r, a) {
  const tile = make(128, 128);
  const c = tile.getContext("2d");
  const img = c.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(r() * 255);
    img.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  x.save();
  x.globalAlpha = a;
  x.fillStyle = x.createPattern(tile, "repeat");
  x.fillRect(0, 0, CARD.width, CARD.height);
  x.restore();
}

function pixelStar(x, cx, cy, u, color) {
  x.fillStyle = color;
  x.fillRect(cx - u / 2, cy - u * 1.5, u, u * 3);
  x.fillRect(cx - u * 1.5, cy - u / 2, u * 3, u);
}

const BACKDROP = {
  classic(x, r, make) {
    const { width: W, height: H } = CARD;
    x.fillStyle = linear(x, 0, 0, 0, H, [[0, "#141b2b"], [0.55, "#161e30"], [1, "#141b2b"]]);
    x.fillRect(0, 0, W, H);
    glow(x, W / 2, H * 0.36, W * 0.9, H * 0.55, "241,214,140", 0.16);
    grain(x, make, r, 0.035);
    for (let i = 0; i < 26; i++) {
      const [px, py] = aside(r);
      if (i % 3) dot(x, px, py, 2 + r() * 2.5, `rgba(255,246,222,${0.35 + r() * 0.5})`);
      else sparkle(x, px, py, 9 + r() * 8, `rgba(255,244,214,${0.6 + r() * 0.35})`);
    }
  },
  "8bit"(x, r, make) {
    const { width: W, height: H } = CARD;
    const tile = make(16, 16);
    const c = tile.getContext("2d");
    c.fillStyle = "#1d2b53";
    c.fillRect(0, 0, 16, 16);
    c.fillStyle = "rgba(255,255,255,.035)";
    c.fillRect(0, 0, 8, 8);
    c.fillRect(8, 8, 8, 8);
    x.fillStyle = x.createPattern(tile, "repeat");
    x.fillRect(0, 0, W, H);
    for (let i = 0; i < 22; i++) {
      const [px, py] = aside(r, 16);
      if (py > H - 120) continue;
      const sx = Math.round(px / 4) * 4;
      const sy = Math.round(py / 4) * 4;
      if (i % 3) {
        x.fillStyle = i % 2 ? "#fff1e8" : "#c2c3c7";
        x.fillRect(sx, sy, 4, 4);
      } else pixelStar(x, sx, sy, 4, i % 2 ? "#ffec27" : "#fff1e8");
    }
    const top = H - 72;
    x.fillStyle = "#00e436";
    for (let gx = 0; gx < W; gx += 48) x.fillRect(gx, top, 16, 8);
    x.fillRect(0, top + 8, W, 12);
    x.fillStyle = "#008751";
    x.fillRect(0, top + 20, W, 24);
    x.fillStyle = "#ab5236";
    x.fillRect(0, top + 44, W, 28);
  },
  milk(x, r, make) {
    const { width: W, height: H } = CARD;
    x.fillStyle = linear(x, 0, 0, 0, H, [[0, "#ffe3ea"], [0.34, "#fff8f3"], [1, "#fff8f3"]]);
    x.fillRect(0, 0, W, H);
    const tile = make(84, 84);
    const c = tile.getContext("2d");
    for (const [cx, cy] of [[0, 0], [84, 0], [0, 84], [84, 84], [42, 42]]) dot(c, cx, cy, 12, "rgba(255,143,171,.22)");
    x.fillStyle = x.createPattern(tile, "repeat");
    x.fillRect(0, 0, W, H);
    const top = H - 112;
    x.fillStyle = "rgba(242,87,127,.35)";
    x.fillRect(0, top - 12, W, 6);
    x.fillStyle = "#fff";
    x.fillRect(0, top - 6, W, H - top + 6);
    x.fillStyle = "rgba(242,87,127,.5)";
    for (let gx = 0; gx < W; gx += 72) x.fillRect(gx, top, 36, H - top);
    for (let gy = top; gy < H; gy += 72) x.fillRect(0, gy, W, 36);
  },
  najeon(x, r, make) {
    const { width: W, height: H } = CARD;
    x.fillStyle = linear(x, 0, 0, 0, H, [[0, "#0f0e13"], [0.6, "#08080b"], [1, "#0f0e13"]]);
    x.fillRect(0, 0, W, H);
    glow(x, W / 2, H * 0.36, W * 0.9, H * 0.55, "233,231,239", 0.06);
    for (const [gx, gy, ox, oy, color] of [[118, 132, 8, 28, "rgba(214,239,236,.35)"], [152, 108, 52, 72, "rgba(242,226,236,.3)"]]) {
      for (let py = oy; py < H; py += gy) for (let px = ox; px < W; px += gx) dot(x, px, py, 2.5, color);
    }
    const sun = x.createRadialGradient(150, 96, 6, 168, 112, 56);
    sun.addColorStop(0, "#fff0b3");
    sun.addColorStop(0.7, "#f3c64f");
    sun.addColorStop(1, "#c99227");
    dot(x, 168, 112, 54, sun);
    x.lineWidth = 3;
    x.strokeStyle = "#e6e4ec";
    x.beginPath();
    x.arc(168, 112, 61, 0, TAU);
    x.stroke();
    pearlDisc(x, 912, 112, 54, rng(5));
  },
};

const PEARL = ["#f4f2f8", "#e6dff0", "#d6efec", "#f2e2ec", "#dfe8f6", "#cfc9df"];

function crackle(x, r, X, Y, W, H, n, a) {
  x.strokeStyle = `rgba(12,12,16,${a})`;
  x.lineWidth = 1.2;
  for (let i = 0; i < n; i++) {
    let px = X + r() * W;
    let py = Y + r() * H;
    x.beginPath();
    x.moveTo(px, py);
    for (let k = 0; k < 3; k++) {
      px += (r() - 0.5) * W * 0.22;
      py += (r() - 0.5) * H * 0.22;
      x.lineTo(px, py);
    }
    x.stroke();
  }
}

function pearlDisc(x, cx, cy, rad, r) {
  x.save();
  x.beginPath();
  x.arc(cx, cy, rad, 0, TAU);
  x.fillStyle = linear(x, cx - rad, cy - rad, cx + rad, cy + rad, PEARL.slice(0, 4).map((c, i) => [i / 3, c]));
  x.fill();
  x.clip();
  const shine = x.createRadialGradient(cx - rad * 0.3, cy - rad * 0.35, 2, cx, cy, rad);
  shine.addColorStop(0, "rgba(255,255,255,.55)");
  shine.addColorStop(1, "rgba(200,205,230,0)");
  x.fillStyle = shine;
  x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  crackle(x, r, cx - rad, cy - rad, rad * 2, rad * 2, 9, 0.2);
  x.restore();
  x.lineWidth = 3;
  x.strokeStyle = "rgba(244,242,248,.9)";
  x.beginPath();
  x.arc(cx, cy, rad, 0, TAU);
  x.stroke();
}

/* ---------- the card body: shadow, edition frame, world surface ---------- */

function weave(make) {
  const t = make(18, 18);
  const c = t.getContext("2d");
  for (const [ox, oy, flat] of [[0, 0, true], [9, 9, true], [9, 0, false], [0, 9, false]]) {
    for (let k = 0; k < 9; k += 3) {
      c.fillStyle = "rgba(255,246,214,.42)";
      if (flat) c.fillRect(ox, oy + k, 9, 1);
      else c.fillRect(ox + k, oy, 1, 9);
      c.fillStyle = "rgba(110,70,15,.3)";
      if (flat) c.fillRect(ox, oy + k + 2, 9, 1);
      else c.fillRect(ox + k + 2, oy, 1, 9);
    }
  }
  return t;
}

function onBand(r, box, depth) {
  const { x: X, y: Y, w: W, h: H } = box;
  let t = r() * 2 * (W + H);
  if (t < W) return [X + t, Y + depth];
  t -= W;
  if (t < H) return [X + W - depth, Y + t];
  t -= H;
  if (t < W) return [X + W - t, Y + H - depth];
  return [X + depth, Y + H - (t - W)];
}

function stitch(x, world, box, F, R, color, dash = [16, 11], width = 3) {
  x.save();
  x.setLineDash(dash);
  x.lineWidth = width;
  x.lineCap = "round";
  x.strokeStyle = color;
  plate(x, world, box.x + F / 2, box.y + F / 2, box.w - F, box.h - F, Math.max(0, R - F / 2));
  x.stroke();
  x.restore();
}

function hairline(x, world, box, inset, R, color, width = 2) {
  x.lineWidth = width;
  x.strokeStyle = color;
  plate(x, world, box.x + inset, box.y + inset, box.w - inset * 2, box.h - inset * 2, Math.max(0, R - inset));
  x.stroke();
}

function frame(x, world, edition, box, F, r, make) {
  const { x: X, y: Y, w: W, h: H, r: R } = box;
  const pixel = world === "8bit";
  plate(x, world, X, Y, W, H, R);
  x.save();
  x.clip();
  if (pixel) {
    x.fillStyle = "#0b0d1a";
    x.fillRect(X, Y, W, H);
    const ring = { x: X + 4, y: Y + 4, w: W - 8, h: H - 8 };
    plate(x, world, ring.x, ring.y, ring.w, ring.h, 0);
    if (edition === "rare") {
      const tile = make(8, 8);
      const c = tile.getContext("2d");
      c.fillStyle = "#ffa300";
      c.fillRect(0, 0, 8, 8);
      c.fillStyle = "#ffec27";
      c.fillRect(0, 0, 4, 4);
      c.fillRect(4, 4, 4, 4);
      x.fillStyle = x.createPattern(tile, "repeat");
      x.fill();
    } else if (edition === "legendary") {
      x.fillStyle = "#000000";
      x.fill();
      x.clip();
      for (let i = 0; i < 70; i++) {
        const [px, py] = onBand(r, ring, 4 + Math.floor(r() * 2) * 4);
        const sx = Math.round(px / 4) * 4;
        const sy = Math.round(py / 4) * 4;
        if (i % 5 === 0) pixelStar(x, sx, sy, 4, "#ffec27");
        else {
          x.fillStyle = i % 2 ? "#fff1e8" : "#83769c";
          x.fillRect(sx, sy, 4, 4);
        }
      }
    } else {
      x.fillStyle = "#fff1e8";
      x.fill();
      x.fillStyle = "#c2c3c7";
      x.fillRect(ring.x, ring.y + ring.h - 4, ring.w, 4);
      x.fillRect(ring.x + ring.w - 4, ring.y, 4, ring.h);
    }
    x.restore();
    plate(x, world, X + F - 4, Y + F - 4, W - 2 * F + 8, H - 2 * F + 8, 0);
    x.fillStyle = edition === "legendary" ? "#ffec27" : "#0b0d1a";
    x.fill();
    return;
  }
  if (edition === "rare") {
    x.fillStyle = linear(x, X, Y, X + W, Y + H, [[0, "#b8812a"], [0.22, "#f2c451"], [0.36, "#fff0be"], [0.52, "#e0ae45"], [0.74, "#f6d27a"], [1, "#a8741f"]]);
    x.fillRect(X, Y, W, H);
    x.fillStyle = x.createPattern(weave(make), "repeat");
    x.fillRect(X, Y, W, H);
  } else if (edition === "legendary") {
    x.fillStyle = linear(x, X, Y, X + W, Y + H, [[0, "#38327c"], [0.55, "#242b63"], [1, "#1a214b"]]);
    x.fillRect(X, Y, W, H);
    for (let i = 0; i < 120; i++) {
      const [px, py] = onBand(r, box, 3 + r() * (F - 6));
      dot(x, px, py, 0.9 + r() * 1.7, i % 4 ? `rgba(255,255,255,${0.45 + r() * 0.5})` : `rgba(243,226,168,${0.6 + r() * 0.4})`);
    }
    for (let i = 0; i < 9; i++) {
      const [px, py] = onBand(r, box, F / 2);
      sparkle(x, px, py, 6 + r() * 4, "#f3e2a8");
    }
  } else if (world === "najeon") {
    x.fillStyle = linear(x, X, Y, X + W, Y + H, [[0, "#f4f2f8"], [0.28, "#e6dff0"], [0.48, "#d6efec"], [0.68, "#f2e2ec"], [1, "#f4f2f8"]]);
    x.fillRect(X, Y, W, H);
    crackle(x, r, X, Y, W, H, 260, 0.22);
  } else {
    x.fillStyle = linear(x, X, Y, X + W, Y + H, world === "milk" ? [[0, "#fffaf4"], [0.5, "#fbf0e4"], [1, "#f3e4d2"]] : [[0, "#fdf8ee"], [0.5, "#f3e7d3"], [1, "#e8d9bf"]]);
    x.fillRect(X, Y, W, H);
  }
  x.restore();
  if (edition === "legendary") {
    hairline(x, world, box, 3, R, "rgba(226,194,122,.55)", 1.5);
    hairline(x, world, box, F - 5, R, "#e2c27a", 2);
  } else if (edition === "rare") {
    hairline(x, world, box, 1.5, R, "#fff0be", 2);
    hairline(x, world, box, F - 1.5, R, "#9a7228", 2.5);
  } else if (world === "najeon") {
    hairline(x, world, box, F - 1.5, R, "rgba(12,12,16,.85)", 2);
  } else {
    stitch(x, world, box, F, R, world === "milk" ? "#ff8fab" : "rgba(150,118,80,.55)");
    hairline(x, world, box, F - 1, R, world === "milk" ? "rgba(122,46,69,.18)" : "rgba(74,44,32,.4)", 2);
  }
  if (world === "milk" && edition !== "classic") stitch(x, world, box, F, R, "rgba(255,255,255,.9)", [14, 10], 2.5);
}

function surface(x, world, box, F) {
  const { x: X, y: Y, w: W, h: H, r: R } = box;
  const [ix, iy, iw, ih] = [X + F, Y + F, W - 2 * F, H - 2 * F];
  const ir = world === "najeon" ? 6 : Math.max(0, R - F);
  plate(x, world, ix, iy, iw, ih, ir);
  if (world === "8bit") {
    x.fillStyle = "#1d2b53";
    x.fill();
    return;
  }
  x.save();
  x.clip();
  if (world === "milk") {
    x.fillStyle = linear(x, 0, iy, 0, iy + ih, [[0, "#ffffff"], [0.3, "#fff8f3"], [1, "#fff3ef"]]);
    x.fillRect(ix, iy, iw, ih);
    glow(x, 540, 620, 420, 380, "255,143,171", 0.16, 1);
  } else if (world === "najeon") {
    x.fillStyle = linear(x, 0, iy, 0, iy + ih, [[0, "#18171d"], [0.4, "#0e0e12"], [1, "#0a0a0d"]]);
    x.fillRect(ix, iy, iw, ih);
    x.fillStyle = linear(x, ix, iy, ix + iw, iy + ih, [[0.3, "rgba(214,239,236,0)"], [0.42, "rgba(214,239,236,.05)"], [0.48, "rgba(242,226,236,.07)"], [0.6, "rgba(242,226,236,0)"]]);
    x.fillRect(ix, iy, iw, ih);
    glow(x, 540, 620, 420, 380, "233,231,239", 0.08, 1);
  } else {
    x.fillStyle = linear(x, 0, iy, 0, iy + ih, [[0, "#232c44"], [0.42, "#1b2233"], [1, "#161d2e"]]);
    x.fillRect(ix, iy, iw, ih);
    glow(x, 540, 600, 440, 400, "241,214,140", 0.14, 1);
  }
  x.restore();
}

function cardBody(x, world, edition, L, r, make) {
  const { box, frame: F } = L;
  const { x: X, y: Y, w: W, h: H, r: R } = box;
  if (world === "najeon") {
    x.save();
    x.setLineDash([0.1, 12]);
    x.lineCap = "round";
    x.lineWidth = 5;
    x.strokeStyle = "rgba(233,231,239,.75)";
    plate(x, world, X - 14, Y - 14, W + 28, H + 28, R + 14);
    x.stroke();
    x.restore();
  }
  x.save();
  if (world === "8bit") {
    plate(x, world, X + 12, Y + 16, W, H, 0);
    x.fillStyle = "rgba(0,0,0,.35)";
  } else {
    plate(x, world, X, Y, W, H, R);
    x.shadowColor = world === "milk" ? "rgba(242,87,127,.32)" : "rgba(0,0,0,.5)";
    x.shadowBlur = 64;
    x.shadowOffsetY = 26;
    x.fillStyle = "#000";
  }
  x.fill();
  x.restore();
  frame(x, world, edition, box, F, r, make);
  surface(x, world, box, F);
}

/* ---------- type ---------- */

function spaced(x, text, X, Y, gap) {
  let at = X;
  for (const ch of Array.from(text)) {
    x.fillText(ch, Math.round(at), Y);
    at += x.measureText(ch).width + gap;
  }
  return at - gap - X;
}

function middle(x, text, cy) {
  const m = x.measureText(text);
  return Math.round(cy + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
}

function header(x, card, L, look) {
  const pixel = card.world === "8bit";
  const cy = L.seal.top + L.seal.h / 2;
  x.textAlign = "left";
  x.textBaseline = "alphabetic";
  x.font = fontOf(look, card.world, "wordmark");
  const base = middle(x, BRAND, cy);
  const gap = sizes(card.world).wordmark * 0.32;
  if (pixel) {
    x.fillStyle = "#0b0d1a";
    spaced(x, BRAND, L.left + 4, base + 4, gap);
  }
  x.fillStyle = look.gold;
  spaced(x, BRAND, L.left, base, gap);

  x.font = fontOf(look, card.world, "seal");
  const w = Math.ceil(x.measureText(card.seal).width) + 56;
  const { right, top, h } = L.seal;
  const X = right - w;
  x.save();
  plate(x, card.world, X, top, w, h, h / 2);
  let ink = look.seal[1];
  if (card.edition === "rare") {
    x.fillStyle = pixel ? "#ffec27" : linear(x, X, top, X + w, top + h, [[0, "#fceab2"], [1, "#e2b252"]]);
    ink = pixel ? "#0b0d1a" : "#4a2c20";
  } else if (card.edition === "legendary") {
    x.fillStyle = pixel ? "#0b0d1a" : linear(x, X, top, X + w, top + h, [[0, "#2e2a66"], [1, "#18264f"]]);
    ink = pixel ? "#ffec27" : "#f3e2a8";
  } else x.fillStyle = look.seal[0];
  if (!pixel && card.edition !== "classic") {
    x.shadowColor = card.edition === "legendary" ? "rgba(226,194,122,.35)" : "rgba(214,165,70,.3)";
    x.shadowBlur = 18;
  }
  x.fill();
  x.restore();
  if (card.edition === "legendary") {
    if (pixel) {
      x.lineWidth = 4;
      x.strokeStyle = "#ffec27";
      plate(x, card.world, X + 2, top + 2, w - 4, h - 4, 0);
    } else {
      x.lineWidth = 2;
      x.strokeStyle = "#e2c27a";
      plate(x, card.world, X + 2, top + 2, w - 4, h - 4, (h - 4) / 2);
    }
    x.stroke();
  }
  x.fillStyle = ink;
  x.textAlign = "center";
  x.fillText(card.seal, Math.round(X + w / 2), middle(x, card.seal, cy));
}

const GOLD_THREAD = [[0, "#fff3c4"], [0.32, "#f2c451"], [0.58, "#d9982b"], [0.78, "#f6d27a"], [1, "#b8812a"]];
const STARLIT = [[0, "#fffbe9"], [0.3, "#f9e3a0"], [0.62, "#e9bf5c"], [1, "#c99227"]];
const PEARL_SHEEN = [[0, "#f4f2f8"], [0.28, "#e6dff0"], [0.48, "#d6efec"], [0.68, "#f2e2ec"], [1, "#f4f2f8"]];

function threads(c, w, h) {
  c.lineWidth = 1.6;
  for (let i = -h; i < w + h; i += 7) {
    c.strokeStyle = "rgba(255,250,228,.42)";
    c.beginPath();
    c.moveTo(i, h);
    c.lineTo(i + h * 0.6, 0);
    c.stroke();
    c.strokeStyle = "rgba(122,80,18,.24)";
    c.beginPath();
    c.moveTo(i + 3.5, h);
    c.lineTo(i + 3.5 + h * 0.6, 0);
    c.stroke();
  }
}

function starlight(c, w, h, r) {
  for (let i = 0; i < Math.round(w / 40); i++) sparkle(c, r() * w, h * (0.25 + r() * 0.5), 4 + r() * 5, "rgba(255,255,255,.85)");
  for (let i = 0; i < Math.round(w / 12); i++) dot(c, r() * w, r() * h, 0.8 + r() * 1.2, "rgba(255,255,255,.7)");
}

// The name's edition finish: the world's own nameplate for 포근 클래식, gold thread for 금실 레어, starlit gold for 별밤 레전더리.
function finishOf(world, edition) {
  if (world === "8bit") {
    const bands = edition === "rare" ? [["#ffec27", 0.55], ["#ffa300", 1]] : edition === "legendary" ? [["#fff1e8", 0.3], ["#ffec27", 0.64], ["#ffa300", 1]] : [["#fff1e8", 1]];
    return { bands };
  }
  if (edition === "rare") return { stops: GOLD_THREAD, texture: threads };
  if (edition === "legendary") return { stops: STARLIT, texture: starlight, around: true };
  if (world === "najeon") return { stops: PEARL_SHEEN, across: true };
  return { color: world === "milk" ? "#f2577f" : "#f8f0e3" };
}

// The finished name recoloured to one flat colour: emoji keep their own colours in fillText, so shadows start from this.
function silhouette(make, face, color) {
  const s = make(face.width, face.height);
  const c = s.getContext("2d");
  c.drawImage(face, 0, 0);
  c.globalCompositeOperation = "source-in";
  c.fillStyle = color;
  c.fillRect(0, 0, s.width, s.height);
  return s;
}

function outline(make, face, color, radius) {
  const sil = silhouette(make, face, color);
  const out = make(face.width, face.height);
  const c = out.getContext("2d");
  c.drawImage(sil, 0, 0);
  for (const ring of [radius, (radius * 2) / 3, radius / 3]) {
    const steps = Math.max(8, Math.ceil(ring * 2.5));
    for (let i = 0; i < steps; i++) c.drawImage(sil, Math.cos((i / steps) * TAU) * ring, Math.sin((i / steps) * TAU) * ring);
  }
  return out;
}

function nameLine(x, card, L, look, r, make) {
  const world = card.world;
  const pixel = world === "8bit";
  const fin = finishOf(world, card.edition);
  const pad = world === "milk" ? 12 : pixel ? 8 : 4;
  const measure = (px) => {
    x.font = fontOf(look, world, "name", px);
    return x.measureText(card.name).width + pad * 2;
  };
  let size = fitText(measure, L.room, sizes(world).name);
  if (pixel) size = Math.max(11, Math.floor(size / 11) * 11);
  x.font = fontOf(look, world, "name", size);
  const m = x.measureText(card.name);
  const asc = Math.ceil(m.actualBoundingBoxAscent);
  const desc = Math.ceil(m.actualBoundingBoxDescent);
  const left = Math.round(L.cx - m.width / 2);
  const base = L.at.name;
  const edge = 24;
  const bw = Math.ceil(m.width) + edge * 2;
  const bh = asc + desc + edge * 2;
  const layer = make(bw, bh);
  const c = layer.getContext("2d");
  c.font = x.font;
  c.textBaseline = "alphabetic";
  const top = edge;
  const bottom = edge + asc + desc;
  if (fin.bands) {
    const g = c.createLinearGradient(0, top, 0, bottom);
    let from = 0;
    for (const [color, to] of fin.bands) {
      g.addColorStop(from, color);
      g.addColorStop(to, color);
      from = to;
    }
    c.fillStyle = g;
  } else if (fin.stops) c.fillStyle = fin.across ? linear(c, edge, 0, bw - edge, 0, fin.stops) : linear(c, 0, top, 0, bottom, fin.stops);
  else c.fillStyle = fin.color;
  c.fillText(card.name, edge, edge + asc);
  if (fin.texture) {
    c.globalCompositeOperation = "source-atop";
    fin.texture(c, bw, bh, r);
  }
  const lx = left - edge;
  const ly = base - asc - edge;
  if (world === "milk") {
    const lift = Math.round(size * 0.08);
    const ring = Math.max(2, Math.round(size * 0.12));
    x.save();
    x.globalAlpha = 0.25;
    x.drawImage(outline(make, layer, "#f2577f", ring), lx, ly + lift);
    x.restore();
    x.drawImage(outline(make, layer, "#ffffff", ring), lx, ly);
    if (card.edition !== "classic") x.drawImage(outline(make, layer, card.edition === "rare" ? "#b07a24" : "#2e2a66", Math.max(1, Math.round(size / 40))), lx, ly);
  } else if (pixel) x.drawImage(silhouette(make, layer, "#0b0d1a"), lx + size / 11, ly + size / 11);
  else x.drawImage(silhouette(make, layer, world === "najeon" ? "rgba(0,0,0,.6)" : "rgba(0,0,0,.3)"), lx, ly + Math.max(1, Math.round(size / 22)));
  x.drawImage(layer, lx, ly);
  if (fin.around) {
    const spots = [[left - 26, base - asc * 0.8, 13], [left + m.width + 24, base - asc * 0.95, 10], [left + m.width + 10, base + desc + 2, 7]];
    for (const [sx, sy, sr] of spots) sparkle(x, sx, sy, sr, world === "milk" ? "#e0a81e" : "#f3e2a8");
  } else if (pixel && card.edition === "legendary") {
    pixelStar(x, Math.round((left - 24) / 4) * 4, Math.round((base - asc * 0.7) / 4) * 4, 4, "#ffec27");
    pixelStar(x, Math.round((left + m.width + 24) / 4) * 4, Math.round((base - asc) / 4) * 4, 4, "#fff1e8");
  }
}

function caption(x, card, L, look) {
  const text = captionOf(card);
  const measure = (px) => {
    x.font = fontOf(look, card.world, "caption", px);
    return x.measureText(text).width;
  };
  const size = fitText(measure, L.room, sizes(card.world).caption);
  x.font = fontOf(look, card.world, "caption", size);
  x.fillStyle = look.muted;
  x.textAlign = "left";
  x.fillText(text, Math.round(L.cx - x.measureText(text).width / 2), L.at.caption);
}

function pixelGlyph(x, make, paths, color, X, Y) {
  const n = 12;
  const t = make(n, n);
  const c = t.getContext("2d");
  c.scale(n / 24, n / 24);
  for (const d of paths) c.fill(new Path2D(d));
  const { data } = c.getImageData(0, 0, n, n);
  x.fillStyle = color;
  for (let i = 0; i < n * n; i++) if (data[i * 4 + 3] > 110) x.fillRect(X + (i % n) * 3, Y + Math.floor(i / n) * 3, 3, 3);
}

function smoothBar(x, card, look, bar, X, Y, deep, light) {
  const { w: W, h: H } = CARD.bar;
  const R = H / 2;
  x.beginPath();
  rounded(x, X, Y, W, H, R);
  x.fillStyle = look.track(deep);
  x.fill();
  x.save();
  x.clip();
  x.fillStyle = card.world === "milk" ? "rgba(122,46,69,.1)" : "rgba(0,0,0,.25)";
  x.fillRect(X, Y, W, 3);
  x.restore();
  if (look.trackEdge) {
    x.lineWidth = 1.5;
    x.strokeStyle = look.trackEdge;
    x.stroke();
  }
  if (!bar.fill) return;
  const len = Math.max(bar.fill, H);
  const stops = card.world === "najeon" ? [[0, deep], [0.45, light], [0.65, "#e6dff0"], [1, light]] : [[0, deep], [1, light]];
  const g = x.createLinearGradient(X, 0, X + len, 0);
  if (bar.gold) {
    const seam = clamp01((len - bar.gold) / len);
    const half = bar.fade / 2 / len;
    for (const [o, c] of stops) g.addColorStop(o * Math.max(0, seam - half), c);
    g.addColorStop(Math.min(1, seam + half), "#f2c451");
    g.addColorStop(1, "#ffe9a8");
  } else for (const [o, c] of stops) g.addColorStop(o, c);
  x.beginPath();
  rounded(x, X, Y, len, H, R);
  x.fillStyle = g;
  x.fill();
  x.save();
  x.clip();
  x.fillStyle = "rgba(255,255,255,.32)";
  x.fillRect(X + R / 2, Y + 3, len - R, 2);
  x.restore();
  if (card.edition === "legendary" && bar.gold) sparkle(x, X + len - 8, Y + H / 2, 12, "rgba(255,255,255,.9)");
}

function pixelBar(x, bar, X, Y, deep, light) {
  const { w: W, h: H } = CARD.bar;
  const u = 4;
  plate(x, "8bit", X, Y, W, H, 0);
  x.fillStyle = "#0b0d1a";
  x.fill();
  if (!bar.fill) return;
  const len = Math.max(3 * u, Math.round(bar.fill / u) * u);
  const gold = Math.round(bar.gold / u) * u;
  x.save();
  plate(x, "8bit", X, Y, len, H, 0);
  x.clip();
  x.fillStyle = light;
  x.fillRect(X, Y, len, H);
  x.fillStyle = deep;
  x.fillRect(X, Y + H - u, len, u);
  x.fillStyle = "rgba(255,255,255,.35)";
  x.fillRect(X, Y + u, len, u);
  if (gold) {
    const seam = X + len - gold;
    x.fillStyle = "#ffec27";
    x.fillRect(seam, Y, gold, H);
    x.fillStyle = "#ffa300";
    x.fillRect(seam, Y + H - u, gold, u);
    x.fillStyle = "#ffec27";
    for (let row = 0; row * u < H; row++) {
      const h = Math.min(u, H - row * u);
      if (row % 4 !== 3) x.fillRect(seam - u, Y + row * u, u, h);
      if (row % 2 === 0) x.fillRect(seam - 2 * u, Y + row * u, u, h);
      if (row % 4 === 1) x.fillRect(seam - 3 * u, Y + row * u, u, h);
    }
  }
  x.restore();
}

function statRows(x, card, L, look, make) {
  const pixel = card.world === "8bit";
  card.stats.forEach((stat, i) => {
    const row = L.rows[i];
    if (!row) return;
    const [deep, light] = look.stats[stat.key] || STATS.str;
    const ink = look.glyph ? light : deep;
    if (stat.icon?.length) {
      if (pixel) pixelGlyph(x, make, stat.icon, ink, L.left, row.base - 32);
      else {
        x.save();
        x.translate(L.left, row.base - 30);
        x.scale(1.5, 1.5);
        x.fillStyle = ink;
        for (const d of stat.icon) x.fill(new Path2D(d));
        x.restore();
      }
    }
    x.textAlign = "left";
    x.font = fontOf(look, card.world, "label");
    x.fillStyle = look.text;
    x.fillText(stat.label, L.left + 56, row.base);
    x.textAlign = "right";
    x.font = fontOf(look, card.world, "total");
    x.fillStyle = look.total || light;
    x.fillText(String(stat.total), L.right, row.base);
    const bar = barFill(stat, card.edition);
    if (pixel) pixelBar(x, bar, L.left, row.bar, deep, light);
    else smoothBar(x, card, look, bar, L.left, row.bar, deep, light);
  });
}

function nfc(x, gx, gy, color, pixel) {
  if (pixel) {
    x.fillStyle = color;
    x.fillRect(gx - 4, gy - 4, 8, 8);
    for (const [ox, h] of [[8, 12], [16, 20], [24, 28]]) {
      x.fillRect(gx + ox, gy - h / 2 + 4, 4, h - 8);
      x.fillRect(gx + ox - 4, gy - h / 2, 4, 4);
      x.fillRect(gx + ox - 4, gy + h / 2 - 4, 4, 4);
    }
    return;
  }
  x.save();
  x.strokeStyle = color;
  x.lineWidth = 3;
  x.lineCap = "round";
  dot(x, gx, gy, 3.5, color);
  for (const rad of [9, 15, 21]) {
    x.beginPath();
    x.arc(gx, gy, rad, -0.85, 0.85);
    x.stroke();
  }
  x.restore();
}

function footer(x, card, L, look) {
  const pixel = card.world === "8bit";
  x.save();
  if (pixel) {
    x.fillStyle = look.rule;
    for (let px = L.left; px < L.right; px += 16) x.fillRect(px, L.divider, 8, 4);
  } else {
    x.setLineDash([0.1, 10]);
    x.lineCap = "round";
    x.lineWidth = 4;
    x.strokeStyle = look.rule;
    x.beginPath();
    x.moveTo(L.left + 2, L.divider);
    x.lineTo(L.right - 2, L.divider);
    x.stroke();
  }
  x.restore();
  x.textAlign = "left";
  x.font = fontOf(look, card.world, "tagline");
  x.fillStyle = look.text;
  x.fillText(TAGLINE, L.left, L.at.tagline);
  x.font = fontOf(look, card.world, "brand");
  const gap = sizes(card.world).brand * 0.32;
  if (pixel) {
    x.fillStyle = "#0b0d1a";
    spaced(x, BRAND, L.left + 4, L.at.brand + 4, gap);
  }
  x.fillStyle = look.gold;
  const wide = spaced(x, BRAND, L.left, L.at.brand, gap);
  nfc(x, Math.round(L.left + wide + 26), L.at.brand - 11, look.gold, pixel);
  x.textAlign = "right";
  x.font = fontOf(look, card.world, "date");
  x.fillStyle = look.muted;
  x.fillText(card.date, L.right, L.at.brand);
}

function petArt(x, card, L, art) {
  if (!art) return;
  const pixel = card.world === "8bit";
  const natural = art.naturalWidth || art.width;
  const size = artSize(natural, L.art.room, { pixel });
  const left = Math.round(L.cx - size / 2);
  const top = L.art.top + Math.round((L.art.room - size) / 2);
  // The plates' feet stand at 479/512 and the sprites' at 57/60.
  const feet = top + Math.round(size * (pixel ? 57 / 60 : 479 / 512));
  if (pixel) {
    const w = Math.round((size * 0.42) / 8) * 8;
    x.fillStyle = "rgba(0,0,0,.28)";
    x.fillRect(Math.round(L.cx - w / 2), feet - 4, w, 8);
    x.fillRect(Math.round(L.cx - w / 2) + 8, feet + 4, w - 16, 4);
  } else {
    const color = card.world === "milk" ? "122,46,69" : card.world === "najeon" ? "233,231,239" : "0,0,0";
    glow(x, L.cx, feet - 2, size * 0.31, size * 0.05, color, card.world === "najeon" ? 0.2 : card.world === "milk" ? 0.3 : 0.55, 1);
  }
  x.save();
  x.imageSmoothingEnabled = !pixel;
  if (!pixel) x.imageSmoothingQuality = "high";
  x.drawImage(art, left, top, size, size);
  x.restore();
}

export function paintCard(x, card, art, make) {
  const world = Object.hasOwn(LOOK, card.world) ? card.world : "classic";
  const look = LOOK[world];
  const L = cardLayout(world);
  const r = rng(seedOf(card.name));
  card = { ...card, world };
  x.save();
  x.clearRect(0, 0, CARD.width, CARD.height);
  BACKDROP[world](x, r, make);
  cardBody(x, world, card.edition, L, r, make);
  header(x, card, L, look);
  petArt(x, card, L, art);
  nameLine(x, card, L, look, r, make);
  caption(x, card, L, look);
  statRows(x, card, L, look, make);
  footer(x, card, L, look);
  x.restore();
}

/* ---------- the page side ---------- */

const EDITIONS = ["classic", "rare", "legendary"];
const WORLDS = Object.keys(LOOK);
const artSrc = (world, kind) => (world === "8bit" ? `/themes/px/${kind}-happy-px.png` : `/mascot-${kind}-happy-512.webp`);

export function readCard(doc, now = Date.now()) {
  const root = doc.documentElement;
  const seal = doc.querySelector(".st-edition");
  const number = (el) => Number(el?.textContent.match(/\d+/)?.[0]) || 1;
  return {
    world: WORLDS.includes(root.dataset.theme) ? root.dataset.theme : "classic",
    edition: EDITIONS.find((e) => seal?.classList.contains(`is-${e}`)) || "classic",
    kind: /^[a-z]+$/.test(root.dataset.mascot || "") ? root.dataset.mascot : "horse",
    name: doc.querySelector("[data-nameplate]")?.textContent.trim() || "",
    animal: doc.querySelector("[data-stat-animal]")?.textContent.trim() || "",
    level: number(doc.querySelector(".level-badge")),
    days: number(doc.querySelector(".record-hero")),
    seal: seal?.textContent.trim() || "",
    stats: Array.from(doc.querySelectorAll(".st-row[data-stat]"), (row) => {
      const bar = row.querySelector(".st-bar")?.dataset || {};
      return {
        key: row.dataset.stat,
        label: row.querySelector(".st-label")?.textContent.trim() || "",
        base: Number(bar.base) || 0,
        plus: Number(bar.plus) || 0,
        trained: Number(bar.trained) || 0,
        total: Number(row.querySelector(".st-total")?.textContent) || 0,
        icon: Array.from(row.querySelectorAll(".st-icon path"), (p) => p.getAttribute("d")),
      };
    }),
    date: seoulDate(now),
  };
}

function loadArt(doc, src) {
  const img = doc.createElement("img");
  img.src = src;
  return img.decode().then(() => img);
}

// Pretendard and Gowun Batang come in unicode-range slices, so each load names the card's own text.
function loadFonts(doc, world, text) {
  if (!doc.fonts?.load) return Promise.resolve();
  const loads = Promise.all(cardFonts(world).map((face) => doc.fonts.load(face, text).catch(() => [])));
  return Promise.race([loads, new Promise((resolve) => setTimeout(resolve, 3000))]);
}

export async function drawShareCard(canvas, card) {
  const doc = canvas.ownerDocument;
  const text = [card.name, captionOf(card), card.seal, ...card.stats.map((s) => `${s.label}${s.total}`), TAGLINE, BRAND, card.date].join("");
  const [art] = await Promise.all([loadArt(doc, artSrc(card.world, card.kind)).catch(() => null), loadFonts(doc, card.world, text)]);
  const make = (w, h) => Object.assign(doc.createElement("canvas"), { width: w, height: h });
  paintCard(canvas.getContext("2d"), card, art, make);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("no card"))), "image/png"));
}

let current = null;
let runs = 0;

function buildSheet(doc, wire) {
  const sheet = doc.createElement("div");
  sheet.className = "sheet";
  sheet.dataset.sheet = "share";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-labelledby", "sheet-share-title");
  sheet.hidden = true;
  // The page's CSP keeps blob: images out, so the preview is the card's own canvas.
  sheet.innerHTML = `<section class="sheet-card">
      <header class="sheet-head">
        <h2 id="sheet-share-title">포키 카드</h2>
      </header>
      <div class="share-stage"><canvas class="share-canvas" width="${CARD.width}" height="${CARD.height}" role="img" aria-label="포키 카드"></canvas></div>
      <p class="share-hint" data-share-hint aria-live="polite" hidden></p>
      <div class="share-actions">
        <button type="button" class="share-send" data-share-send hidden>공유하기</button>
        <button type="button" class="share-save" data-share-save disabled>이미지 저장</button>
      </div>
    </section>`;
  const close = doc.querySelector(".sheet-close")?.cloneNode(true);
  if (close) sheet.querySelector(".sheet-head").append(close);
  const hint = sheet.querySelector("[data-share-hint]");
  sheet.querySelector("[data-share-send]").addEventListener("click", () => {
    if (current) navigator.share({ files: [current.file] }).catch(() => {});
  });
  sheet.querySelector("[data-share-save]").addEventListener("click", () => {
    if (!current) return;
    // Opened inside the tap itself, or Safari blocks the new tab.
    if (savesInTab(navigator.userAgent, navigator.maxTouchPoints) && window.open(current.url, "_blank")) {
      hint.textContent = "길게 눌러서 저장해요";
      hint.hidden = false;
      return;
    }
    const a = doc.createElement("a");
    a.href = current.url;
    a.download = current.file.name;
    a.hidden = true;
    doc.body.append(a);
    a.click();
    a.remove();
  });
  doc.body.append(sheet);
  wire(sheet);
  return sheet;
}

// share() and the iOS tab need the tap's own activation, so the PNG is made before the buttons wake.
export async function showShareCard(doc, { wire, open }) {
  const sheet = doc.querySelector('[data-sheet="share"]') || buildSheet(doc, wire);
  const canvas = sheet.querySelector(".share-canvas");
  const send = sheet.querySelector("[data-share-send]");
  const save = sheet.querySelector("[data-share-save]");
  const hint = sheet.querySelector("[data-share-hint]");
  const run = ++runs;
  const card = readCard(doc);
  send.hidden = true;
  save.disabled = true;
  hint.hidden = true;
  canvas.setAttribute("aria-label", `${card.name} 포키 카드`);
  sheet.classList.add("is-drawing");
  open();
  try {
    const blob = await drawShareCard(canvas, card);
    if (run !== runs) return;
    if (current) URL.revokeObjectURL(current.url);
    const file = new File([blob], cardFileName(card.name), { type: "image/png" });
    current = { file, url: URL.createObjectURL(blob) };
    send.hidden = !navigator.canShare?.({ files: [file] });
    save.disabled = false;
  } catch {
    if (run !== runs) return;
    hint.textContent = "카드를 그리지 못했어요. 다시 열어 주세요.";
    hint.hidden = false;
  } finally {
    if (run === runs) sheet.classList.remove("is-drawing");
  }
}
