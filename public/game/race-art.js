// 달리기 시합 worlds, painted into canvases at the stage's own size so every phone gets crisp layers.
const TAU = Math.PI * 2;

export function rng(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvas(w, h, res, draw) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * res));
  c.height = Math.max(1, Math.round(h * res));
  c.res = res;
  const x = c.getContext("2d");
  x.scale(c.width / w, c.height / h);
  draw(x, w, h);
  return c;
}

const mix = (a, b, k) => {
  const p = [a >> 16, (a >> 8) & 255, a & 255];
  const q = [b >> 16, (b >> 8) & 255, b & 255];
  return (Math.round(p[0] + (q[0] - p[0]) * k) << 16) | (Math.round(p[1] + (q[1] - p[1]) * k) << 8) | Math.round(p[2] + (q[2] - p[2]) * k);
};
const lerp = (a, b, k) => a + (b - a) * k;
const css = (c, a = 1) => `rgba(${c >> 16},${(c >> 8) & 255},${c & 255},${a})`;

function grad(x, y0, y1, stops) {
  const g = x.createLinearGradient(0, y0, 0, y1);
  for (const [o, c, a] of stops) g.addColorStop(o, css(c, a ?? 1));
  return g;
}

// Integer frequencies over the tile width, so every ridge wraps seamlessly.
function wave(r, w, terms) {
  const ph = terms.map(() => r() * TAU);
  return (x) => terms.reduce((s, [k, a, sharp], i) => s + a * (sharp ? 1 - 2 * Math.abs(Math.sin(Math.PI * k * x / w + ph[i])) : Math.sin(TAU * k * x / w + ph[i])), 0);
}

function wrap(w, x, span, fn) {
  fn(x);
  if (x + span > w) fn(x - w);
  if (x - span < 0) fn(x + w);
}

function ridgePath(x, w, base, f, step = 2) {
  x.beginPath();
  x.moveTo(0, base + 999);
  for (let i = 0; i <= w; i += step) x.lineTo(i, f(i));
  x.lineTo(w, base + 999);
  x.closePath();
}

// Light along a ridge on the slopes that face the sun.
function rim(x, w, f, color, width, sun = [0.8, -0.6], step = 2) {
  for (let i = 0; i < w; i += step) {
    const y0 = f(i);
    const y1 = f(i + step);
    const len = Math.hypot(step, y1 - y0);
    const lit = ((y1 - y0) / len) * sun[0] + (-step / len) * sun[1];
    if (lit <= 0.05) continue;
    x.strokeStyle = css(color, Math.min(1, lit * 1.4));
    x.lineWidth = width;
    x.beginPath();
    x.moveTo(i, y0);
    x.lineTo(i + step, y1);
    x.stroke();
  }
}

function glowDot(x, cx, cy, r, color, a = 1) {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, css(color, a));
  g.addColorStop(0.35, css(color, a * 0.45));
  g.addColorStop(1, css(color, 0));
  x.fillStyle = g;
  x.fillRect(cx - r, cy - r, r * 2, r * 2);
}

function noise(x, w, h, res, amount, seed, step = 1) {
  const r = rng(seed);
  const cw = Math.round(w * res);
  const ch = Math.round(h * res);
  const img = x.getImageData(0, 0, cw, ch);
  const d = img.data;
  for (let j = 0; j < ch; j += step) {
    for (let i = 0; i < cw; i += step) {
      const n = (r() - 0.5) * amount;
      for (let b = 0; b < step && j + b < ch; b++) for (let a = 0; a < step && i + a < cw; a++) {
        const k = ((j + b) * cw + i + a) * 4;
        d[k] += n;
        d[k + 1] += n;
        d[k + 2] += n;
      }
    }
  }
  x.putImageData(img, 0, 0);
}

function tree(x, cx, base, size, r, body, rimColor) {
  const blobs = [];
  for (let i = 0; i < 5; i++) blobs.push([cx + (r() - 0.5) * size * 0.8, base - size * (0.75 + r() * 0.5), size * (0.32 + r() * 0.22)]);
  x.fillStyle = css(body);
  x.fillRect(cx - size * 0.05, base - size * 0.6, size * 0.1, size * 0.6);
  for (const [bx, by, br] of blobs) {
    x.beginPath();
    x.arc(bx, by, br, 0, TAU);
    x.fill();
  }
  if (!rimColor) return;
  x.save();
  x.globalCompositeOperation = "source-atop";
  for (const [bx, by, br] of blobs) {
    x.strokeStyle = css(rimColor, 0.55);
    x.lineWidth = Math.max(1, br * 0.12);
    x.beginPath();
    x.arc(bx, by, br - x.lineWidth * 0.5, -1.25, 0.15);
    x.stroke();
  }
  x.restore();
}

function bunting(x, x0, y0, x1, y1, sag, colors, size) {
  const n = Math.max(3, Math.round(Math.hypot(x1 - x0, y1 - y0) / (size * 1.25)));
  const at = (k) => [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k + Math.sin(Math.PI * k) * sag];
  x.strokeStyle = "rgba(255,255,255,.45)";
  x.lineWidth = 0.8;
  x.beginPath();
  for (let i = 0; i <= 24; i++) {
    const [px, py] = at(i / 24);
    if (i) x.lineTo(px, py);
    else x.moveTo(px, py);
  }
  x.stroke();
  for (let i = 0; i < n; i++) {
    const [ax, ay] = at((i + 0.15) / n);
    const [bx, by] = at((i + 0.85) / n);
    x.fillStyle = css(colors[i % colors.length]);
    x.beginPath();
    x.moveTo(ax, ay);
    x.lineTo(bx, by);
    x.lineTo((ax + bx) / 2, (ay + by) / 2 + size);
    x.closePath();
    x.fill();
  }
}

/* ---------- classic: golden hour track ---------- */

const classic = {
  look: { base: 0x1d2d26, ghost: 0xffe9b8, accent: 0xffd36a, dust: 0xe8b08a, grit: 0x6e3326, line: 0xfff3dc, speed: 0xfff1d0, confetti: [0xffd36a, 0xfff3c4, 0xff8a6b, 0xffffff, 0xf1b04c], flash: 0xfff8e8, shadow: 0x2a1424, starter: "pistol", party: "fireworks" },
  sky(g, res) {
    return canvas(g.W + 2 * g.over, g.H + 2 * g.over, res, (x, w, h) => {
      const hz = g.Y(g.D.far) + g.over;
      x.fillStyle = grad(x, 0, hz, [[0, 0x14183e], [0.3, 0x2f2b67], [0.55, 0x7d4a86], [0.75, 0xd56b6e], [0.9, 0xf59e5b], [1, 0xffcf7a]]);
      x.fillRect(0, 0, w, h);
      const r = rng(11);
      for (let i = 0; i < 110; i++) {
        const sy = Math.pow(r(), 1.7) * hz * 0.55;
        x.fillStyle = css(0xfff6e0, (1 - sy / (hz * 0.55)) * (0.3 + r() * 0.7));
        const s = r() < 0.12 ? 1.5 : 0.8;
        x.beginPath();
        x.arc(r() * w, sy, s, 0, TAU);
        x.fill();
      }
    });
  },
  discs: [{ x: 0.7, y: -0.075, r: 0.08, core: 0xfff3c8, edge: 0xffb85c, glow: 0xffa64d, glowA: 0.55, rays: true }],
  clouds(g, res) {
    const w = Math.round(g.W * 2.2);
    const h = Math.round(g.H * 0.22);
    return canvas(w, h, res, (x) => {
      const r = rng(7);
      // Wisps: many soft lobes along a slant, lit warm from below by the low sun.
      for (let i = 0; i < 7; i++) {
        const cx = r() * w;
        const cy = h * (0.2 + r() * 0.6);
        const len = g.W * (0.35 + r() * 0.45);
        const thick = h * (0.05 + r() * 0.05);
        for (let k = 0; k < 26; k++) {
          const t = k / 25;
          const lx = cx + (t - 0.5) * len;
          const ly = cy + Math.sin(t * Math.PI * 2 + i) * thick * 0.4 - t * thick * 0.6;
          const rw = len * (0.08 + 0.1 * Math.sin(t * Math.PI)) * (0.7 + r() * 0.6);
          const rh = thick * (0.5 + 0.7 * Math.sin(t * Math.PI));
          wrap(w, lx, rw, (px) => {
            const gr = x.createRadialGradient(px, ly, 0, px, ly, rw);
            gr.addColorStop(0, css(0xf3a07e, 0.2));
            gr.addColorStop(1, css(0xf3a07e, 0));
            x.save();
            x.translate(px, ly);
            x.scale(1, rh / rw);
            x.translate(-px, -ly);
            x.fillStyle = gr;
            x.fillRect(px - rw, ly - rw, rw * 2, rw * 2);
            x.restore();
          });
        }
        wrap(w, cx, len, (px) => {
          x.strokeStyle = css(0xffd3a0, 0.35);
          x.lineWidth = 1;
          x.beginPath();
          for (let k = 0; k <= 20; k++) {
            const t = k / 20;
            const lx = px + (t - 0.5) * len * 0.8;
            const ly = cy + Math.sin(t * Math.PI * 2 + i) * thick * 0.4 - t * thick * 0.6 + thick * 0.45 * Math.sin(t * Math.PI);
            if (k) x.lineTo(lx, ly);
            else x.moveTo(lx, ly);
          }
          x.stroke();
        });
      }
    });
  },
  far(g, res, L) {
    return canvas(L.w, L.h, res, (x, w, h) => {
      const r = rng(3);
      const b = L.base;
      const back = wave(r, w, [[2, 0.5, true], [5, 0.25, true], [9, 0.12], [17, 0.05]]);
      const fb = (i) => b - h * (0.42 + back(i) * 0.22);
      ridgePath(x, w, b, fb);
      x.fillStyle = grad(x, b - h * 0.75, b, [[0, 0xb4708f], [0.6, 0x8b5884], [1, 0x6c4677]]);
      x.fill();
      rim(x, w, fb, 0xffc98a, 1.2);
      const front = wave(r, w, [[3, 0.45, true], [7, 0.22, true], [13, 0.1], [29, 0.03]]);
      const ff = (i) => b - h * (0.2 + front(i) * 0.14);
      ridgePath(x, w, b, ff);
      x.fillStyle = grad(x, b - h * 0.4, b + h * 0.1, [[0, 0x553a6b], [1, 0x35284f]]);
      x.fill();
      rim(x, w, ff, 0xffb46b, 1.4);
      x.fillStyle = grad(x, b - h * 0.12, b + h * 0.05, [[0, 0xf59e5b, 0], [1, 0xf59e5b, 0.28]]);
      x.fillRect(0, b - h * 0.12, w, h * 0.17);
      x.fillStyle = css(0x35284f);
      x.fillRect(0, b + h * 0.05 - 0.5, w, h);
    });
  },
  mid(g, res, L) {
    return canvas(L.w, L.h, res, (x, w, h) => {
      const r = rng(5);
      const b = L.base;
      const hill = wave(r, w, [[2, 0.5], [3, 0.3], [7, 0.15], [11, 0.05]]);
      const fh = (i) => b - h * (0.16 + hill(i) * 0.07);
      ridgePath(x, w, b, fh);
      x.fillStyle = grad(x, b - h * 0.3, b, [[0, 0x2f3460], [1, 0x232848]]);
      x.fill();
      rim(x, w, fh, 0xf3a774, 1);
      const trees = [];
      for (let i = 0; i < 26; i++) trees.push([r() * w, 0.06 + r() * 0.08]);
      for (const [tx, ts] of trees.sort((a, c) => a[1] - c[1])) {
        const s = h * ts;
        wrap(w, tx, s, (px) => tree(x, px, fh(((px % w) + w) % w) + s * 0.2, s, rng(Math.round(tx * 7)), 0x1b2142, 0xf0a868));
      }
      for (let i = 0; i < 5; i++) {
        const px = ((i + 0.3 + r() * 0.4) / 5) * w;
        const s = h * 0.1;
        const by = fh(px) + 2;
        x.fillStyle = css(0x1b2142);
        x.fillRect(px - s * 0.4, by - s * 0.5, s * 0.8, s * 0.5);
        x.beginPath();
        x.moveTo(px - s * 0.5, by - s * 0.48);
        x.lineTo(px, by - s * 0.85);
        x.lineTo(px + s * 0.5, by - s * 0.48);
        x.fill();
        glowDot(x, px - s * 0.12, by - s * 0.26, s * 0.4, 0xffc46b, 0.35);
        x.fillStyle = css(0xffd98a);
        x.fillRect(px - s * 0.2, by - s * 0.34, s * 0.16, s * 0.14);
      }
      for (let i = 0; i < 4; i++) {
        const x0 = r() * w;
        const x1 = x0 + w * 0.12;
        const y0 = fh(x0 % w) - h * 0.08;
        const y1 = fh(x1 % w) - h * 0.08;
        for (let k = 0; k <= 10; k++) {
          const px = x0 + (x1 - x0) * (k / 10);
          const py = y0 + (y1 - y0) * (k / 10) + Math.sin(Math.PI * k / 10) * h * 0.03;
          wrap(w, px, 4, (qx) => {
            glowDot(x, qx, py, 3.2, 0xffd98a, 0.8);
            x.fillStyle = css(0xfff1c4);
            x.fillRect(qx - 0.5, py - 0.5, 1, 1);
          });
        }
      }
      x.fillStyle = css(0x232848);
      x.fillRect(0, b - 0.5, w, h);
    });
  },
  props(g, res, L, frame) {
    return canvas(L.w, L.h, res, (x, w, h) => {
      const r = rng(9);
      const b = L.base;
      const u = h / 10;
      x.fillStyle = css(0x24342f);
      x.fillRect(0, b - u * 0.3, w, h);
      const shirts = [0xffd36a, 0xff8a6b, 0xfff3c4, 0x8fb8e8, 0xc78bd8, 0x6fc2a8, 0xff6f91, 0xf6f0e6];
      const hair = [0x3a2a2a, 0x5b3b2b, 0x2a2030, 0x7a5236, 0x1d1a24];
      for (const [s0, sw] of [[0.03, 0.44], [0.53, 0.44]]) {
        const sx = s0 * w;
        const ex = sx + sw * w;
        const roof = b - u * 7.6;
        x.fillStyle = grad(x, roof, b, [[0, 0x2a2244], [1, 0x3a2c4c]]);
        x.fillRect(sx, roof, ex - sx, b - roof);
        for (let tier = 3; tier >= 0; tier--) {
          const ty = b - u * (1.3 + tier * 1.45);
          x.fillStyle = css(mix(0x4a3a58, 0x5e4a66, tier / 4));
          x.fillRect(sx, ty, ex - sx, u * 0.28);
          const n = Math.floor((ex - sx) / (u * 0.95));
          for (let i = 0; i < n; i++) {
            if (r() < 0.1) continue;
            const cx = sx + (i + 0.5 + (r() - 0.5) * 0.5) * ((ex - sx) / n);
            const jump = frame && r() < 0.45 ? u * 0.32 : 0;
            const shirt = shirts[Math.floor(r() * shirts.length)];
            const hy = ty - u * 0.62 - jump;
            x.fillStyle = css(mix(shirt, 0x2a2244, 0.15));
            x.beginPath();
            x.ellipse(cx, ty - u * 0.05 - jump * 0.6, u * 0.42, u * 0.5, 0, Math.PI, TAU);
            x.fill();
            x.fillStyle = css(0xf2c7a5);
            x.beginPath();
            x.arc(cx, hy, u * 0.27, 0, TAU);
            x.fill();
            x.fillStyle = css(hair[Math.floor(r() * hair.length)]);
            x.beginPath();
            x.arc(cx, hy - u * 0.06, u * 0.29, Math.PI * 1.05, Math.PI * 1.95);
            x.fill();
            if (frame && r() < 0.3) {
              x.strokeStyle = css(mix(shirt, 0x2a2244, 0.15));
              x.lineWidth = u * 0.16;
              x.lineCap = "round";
              const side = r() < 0.5 ? -1 : 1;
              x.beginPath();
              x.moveTo(cx + side * u * 0.3, ty - u * 0.35 - jump);
              x.lineTo(cx + side * u * 0.55, hy - u * 0.55);
              x.stroke();
            }
          }
        }
        x.fillStyle = grad(x, roof, b, [[0, 0x1c1630, 0.45], [1, 0x2a2244, 0.12]]);
        x.fillRect(sx, roof, ex - sx, b - roof);
        x.fillStyle = grad(x, roof - u * 0.9, roof, [[0, 0x3b2f5c], [1, 0x241d3a]]);
        x.beginPath();
        x.moveTo(sx - u * 0.8, roof);
        x.lineTo(sx + u * 0.4, roof - u * 0.9);
        x.lineTo(ex - u * 0.4, roof - u * 0.9);
        x.lineTo(ex + u * 0.8, roof);
        x.fill();
        x.fillStyle = css(0xffd36a);
        x.fillRect(sx - u * 0.8, roof - u * 0.05, ex - sx + u * 1.6, u * 0.14);
        for (let k = 0; k <= 22; k++) {
          const lx = sx + (ex - sx) * (k / 22);
          const ly = roof + u * 0.45 + Math.sin((k / 22) * Math.PI * 4) * u * 0.18;
          glowDot(x, lx, ly, u * 0.9, 0xffcf7a, frame ? 0.5 : 0.38);
          x.fillStyle = css(0xfff4cf);
          x.beginPath();
          x.arc(lx, ly, u * 0.12, 0, TAU);
          x.fill();
        }
        for (const px of [sx + u * 0.3, ex - u * 0.3]) {
          x.fillStyle = css(0x1c1630);
          x.fillRect(px - u * 0.12, roof, u * 0.24, b - roof);
        }
        for (let k = 0; k < 3; k++) {
          const fx = sx + (ex - sx) * ((k + 0.5) / 3);
          x.fillStyle = css(0x1c1630);
          x.fillRect(fx - u * 0.05, roof - u * 2.6, u * 0.1, u * 1.8);
          x.fillStyle = css([0xffd36a, 0xff8a6b, 0xfff3c4][k]);
          x.beginPath();
          x.moveTo(fx + u * 0.05, roof - u * 2.6);
          x.quadraticCurveTo(fx + u * 0.7, roof - u * (frame ? 2.2 : 2.45), fx + u * 1.3, roof - u * 2.3);
          x.lineTo(fx + u * 0.05, roof - u * 1.9);
          x.fill();
        }
        if (frame) {
          for (let k = 0; k < 3; k++) glowDot(x, sx + r() * (ex - sx), b - u * (1.5 + r() * 5), u * 0.6, 0xffffff, 0.95);
        }
      }
      for (const px of [0.5, 0.995]) {
        const lx = px * w;
        const top = b - u * 6.6;
        x.fillStyle = css(0x1c1630);
        x.fillRect(lx - u * 0.08, top, u * 0.16, b - top);
        glowDot(x, lx, top, u * 2.6, 0xffcf7a, 0.6);
        x.fillStyle = css(0xfff1c4);
        x.beginPath();
        x.arc(lx, top, u * 0.32, 0, TAU);
        x.fill();
      }
      x.fillStyle = css(0xf3e3d3, 0.92);
      x.fillRect(0, b - u * 1.05, w, u * 0.2);
      x.fillRect(0, b - u * 0.55, w, u * 0.12);
      for (let px = 0; px < w; px += u * 1.6) x.fillRect(px, b - u * 1.1, u * 0.14, u * 1.1);
    });
  },
  board(res, n) {
    return canvas(46, 92, res, (x, w, h) => {
      x.fillStyle = css(0x2b2342);
      x.fillRect(w / 2 - 2, 30, 4, h - 30);
      x.fillStyle = css(0xfff3dc);
      x.beginPath();
      x.roundRect(2, 2, w - 4, 32, 6);
      x.fill();
      x.strokeStyle = css(0xd6a546);
      x.lineWidth = 2.5;
      x.stroke();
      x.fillStyle = css(0x2b2342);
      x.font = "900 19px 'Pretendard Variable', Pretendard, sans-serif";
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillText(String(n), w / 2, 19);
    });
  },
  // Gate parts are painted at the scale of depth 1: g.f px per metre.
  gate(g, res) {
    const f = g.f;
    const pole = (tall, wide, stripe) => canvas(Math.ceil(f * wide), Math.ceil(f * tall), res, (x, w, h) => {
      const gr = x.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, "#c9a46a");
      gr.addColorStop(0.45, "#fff3dc");
      gr.addColorStop(1, "#b58a4e");
      x.fillStyle = gr;
      x.fillRect(w * 0.15, w * 0.4, w * 0.7, h);
      for (let y = w * 1.2; y < h; y += stripe) {
        x.fillStyle = css(0xd6a546, 0.85);
        x.fillRect(w * 0.15, y, w * 0.7, stripe * 0.35);
      }
      x.fillStyle = css(0xffd36a);
      x.beginPath();
      x.arc(w / 2, w * 0.5, w * 0.5, 0, TAU);
      x.fill();
    });
    const banner = canvas(Math.ceil(f * 10.4), Math.ceil(f * 2.2), res, (x, w, h) => {
      x.fillStyle = grad(x, 0, h, [[0, 0x262c58], [1, 0x171b3a]]);
      x.beginPath();
      x.roundRect(0, 0, w, h, h * 0.12);
      x.fill();
      const sq = h / 7;
      x.save();
      x.beginPath();
      x.roundRect(0, 0, w, h, h * 0.12);
      x.clip();
      for (let i = 0; i < w / sq; i++) for (const row of [0, 6]) {
        x.fillStyle = (i + row) % 2 ? "#fff3dc" : "#1b1d2a";
        x.fillRect(i * sq, row * sq, sq, sq);
      }
      x.restore();
      x.strokeStyle = css(0xffd36a);
      x.lineWidth = h * 0.05;
      x.strokeRect(h * 0.2, sq * 1.35, w - h * 0.4, h - sq * 2.7);
      x.fillStyle = css(0xffd36a);
      x.font = `900 ${Math.round(h * 0.44)}px 'Pretendard Variable', Pretendard, sans-serif`;
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.shadowColor = "rgba(255,200,110,.8)";
      x.shadowBlur = h * 0.15;
      x.fillText("FINISH", w / 2, h / 2 + h * 0.02);
    });
    const balloons = canvas(120, 150, res, (x) => {
      const r = rng(21);
      const spots = [[60, 50, 0xffd36a], [34, 64, 0xff8a6b], [86, 62, 0xfff3c4], [58, 82, 0xf1b04c]];
      for (const [bx, by] of spots) {
        x.strokeStyle = "rgba(255,255,255,.6)";
        x.lineWidth = 1;
        x.beginPath();
        x.moveTo(bx, by + 20);
        x.quadraticCurveTo(bx + (r() - 0.5) * 20, by + 50, 60, 148);
        x.stroke();
      }
      for (const [bx, by, c] of spots) {
        const gr = x.createRadialGradient(bx - 7, by - 9, 2, bx, by, 24);
        gr.addColorStop(0, css(mix(c, 0xffffff, 0.6)));
        gr.addColorStop(0.5, css(c));
        gr.addColorStop(1, css(mix(c, 0x40203a, 0.35)));
        x.fillStyle = gr;
        x.beginPath();
        x.ellipse(bx, by, 19, 23, 0, 0, TAU);
        x.fill();
        x.fillStyle = css(mix(c, 0x40203a, 0.3));
        x.beginPath();
        x.moveTo(bx - 3, by + 25);
        x.lineTo(bx + 3, by + 25);
        x.lineTo(bx, by + 21);
        x.fill();
      }
    });
    return { post: pole(7.4, 0.36, f * 0.5), stake: pole(2.5, 0.14, f * 0.3), banner, balloons, tape: 0xff6b6b };
  },
  starter(g, res) {
    const f = g.f;
    return canvas(Math.ceil(f * 1.6), Math.ceil(f * 3.4), res, (x, w, h) => {
      x.fillStyle = css(0x3a2c4c);
      x.fillRect(w * 0.18, h * 0.3, w * 0.08, h * 0.7);
      x.fillRect(w * 0.74, h * 0.3, w * 0.08, h * 0.7);
      x.fillStyle = css(0x4a3a58);
      x.fillRect(w * 0.1, h * 0.26, w * 0.8, h * 0.08);
      x.fillStyle = css(0xffd36a);
      x.fillRect(w * 0.1, h * 0.26, w * 0.8, h * 0.02);
      x.fillStyle = css(0xfff3dc);
      x.beginPath();
      x.roundRect(w * 0.2, h * 0.02, w * 0.6, h * 0.22, 4);
      x.fill();
      x.fillStyle = css(0x2b2342);
      x.font = `900 ${Math.round(h * 0.11)}px 'Pretendard Variable', Pretendard, sans-serif`;
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillText("START", w / 2, h * 0.135);
    });
  },
  // Rows run far (top) to near (bottom) in base-camera screen space; columns are world metres.
  ground(g, res, G) {
    return canvas(G.w, G.h, res, (x, w, h) => {
      const { row } = G;
      const { back, split, near } = g.D;
      const m = w / G.period;
      x.fillStyle = grad(x, 0, row(back), [[0, 0x2a3f3a], [1, 0x35503f]]);
      x.fillRect(0, 0, w, row(back));
      for (let i = 0; i < G.period; i += 2) {
        x.fillStyle = css(0x3c5a44, 0.5);
        x.fillRect(i * m, 0, m, row(back));
      }
      x.fillStyle = grad(x, row(back), row(near), [[0, 0xa34e3e], [0.4, 0xb45a43], [1, 0x9c4636]]);
      x.fillRect(0, row(back), w, row(near) - row(back));
      x.fillStyle = grad(x, row(back), row(split), [[0, 0xffb46b, 0.3], [1, 0xffb46b, 0]]);
      x.fillRect(0, row(back), w, row(split) - row(back));
      x.fillStyle = grad(x, row(near), h, [[0, 0x2f4a3a], [1, 0x1d2d26]]);
      x.fillRect(0, row(near), w, h - row(near));
      for (let i = 1; i < G.period; i += 2) {
        x.fillStyle = css(0x3a5a44, 0.45);
        x.fillRect(i * m, row(near), m, h - row(near));
      }
      noise(x, w, h, res, 20, 4, 2);
      for (const d of [back, split, near]) {
        const t = Math.max(1, G.thick(d, 0.06));
        x.fillStyle = css(0xfff3dc, 0.9);
        x.fillRect(0, row(d) - t / 2, w, t);
      }
    });
  },
  fg(g, res, L) {
    return canvas(L.w, L.h, res, (x, w, h) => {
      const r = rng(13);
      const b = L.base;
      for (let i = 0; i < 140; i++) {
        const bx = r() * w;
        const bh = h * (0.25 + r() * 0.55);
        const lean = (r() - 0.3) * bh * 0.35;
        const bw = 1.2 + r() * 2.2;
        const c = mix(0x10151f, 0x24303a, r());
        wrap(w, bx, Math.abs(lean) + bw, (px) => {
          x.fillStyle = css(c);
          x.beginPath();
          x.moveTo(px - bw, b);
          x.quadraticCurveTo(px + lean * 0.3, b - bh * 0.6, px + lean, b - bh);
          x.quadraticCurveTo(px + lean * 0.3 + bw * 0.6, b - bh * 0.55, px + bw, b);
          x.fill();
        });
      }
      for (let i = 0; i < 16; i++) {
        const fx = r() * w;
        const fy = b - h * (0.35 + r() * 0.45);
        const fr = h * (0.035 + r() * 0.035);
        const petal = [0xff8fa3, 0xfff1e6, 0xffb36b, 0xf06a8a][Math.floor(r() * 4)];
        wrap(w, fx, fr * 2, (px) => {
          x.strokeStyle = css(0x18202a);
          x.lineWidth = 1.4;
          x.beginPath();
          x.moveTo(px, b);
          x.quadraticCurveTo(px - fr, (b + fy) / 2, px, fy);
          x.stroke();
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * TAU;
            x.fillStyle = css(mix(petal, 0x2a1e30, 0.25));
            x.beginPath();
            x.ellipse(px + Math.cos(a) * fr * 0.55, fy + Math.sin(a) * fr * 0.55, fr * 0.5, fr * 0.22, a, 0, TAU);
            x.fill();
          }
          x.fillStyle = css(0xffc94a);
          x.beginPath();
          x.arc(px, fy, fr * 0.28, 0, TAU);
          x.fill();
        });
      }
      x.fillStyle = css(0x10151f);
      x.fillRect(0, b - 1, w, h);
    });
  },
};

/* ---------- najeon: mother-of-pearl on black lacquer, under the moon ---------- */

const PEARL = [0xf4f2f8, 0xe6dff0, 0xd6efec, 0xf2e2ec, 0xdfe8f6, 0xcfc9df];
const LACQUER = 0x0c0c10;

function pearlFill(x, x0, y0, x1, y1, r, a = 1, shift = 0) {
  const g = x.createLinearGradient(x0, y0, x1, y1);
  const k = Math.floor(r() * PEARL.length) + shift;
  for (let i = 0; i < 4; i++) g.addColorStop(i / 3, css(PEARL[(k + i * 2) % PEARL.length], a));
  return g;
}

// Hairline cracks inside a shell piece: the inlay look.
function crackle(x, clip, bx, by, bw, bh, r, n, a = 0.55) {
  x.save();
  x.clip(clip);
  x.strokeStyle = css(LACQUER, a);
  x.lineWidth = 0.6;
  for (let i = 0; i < n; i++) {
    let px = bx + r() * bw;
    let py = by + r() * bh;
    x.beginPath();
    x.moveTo(px, py);
    for (let k = 0; k < 3; k++) {
      px += (r() - 0.5) * bw * 0.25;
      py += (r() - 0.5) * bh * 0.25;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  x.restore();
}

function facetPeak(x, cx, base, half, tall, r, dim = 0, shift = 0) {
  // A steep 오봉 peak, inlaid in contour bands: light on the left face, deeper on the right.
  const shape = (t) => tall * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), 1.5)), 1.7);
  const bands = 6;
  const wob = Array.from({ length: bands + 1 }, () => [r() * TAU, 0.04 + r() * 0.05]);
  const edge = (k, t) => (k === 0 ? 0 : (k / bands) * shape(t) * (1 + Math.sin(t * 5 + wob[k][0]) * wob[k][1]));
  for (let k = bands - 1; k >= 0; k--) {
    for (const side of [-1, 1]) {
      const path = new Path2D();
      const steps = 24;
      for (let i = 0; i <= steps; i++) {
        const t = side * (i / steps);
        const y = base - Math.min(shape(t), edge(k + 1, t) || shape(t));
        if (i) path.lineTo(cx + t * half, y);
        else path.moveTo(cx + t * half, y);
      }
      for (let i = steps; i >= 0; i--) {
        const t = side * (i / steps);
        path.lineTo(cx + t * half, base - edge(k, t));
      }
      path.closePath();
      const light = side < 0 ? 1 - dim : 0.78 - dim;
      x.fillStyle = pearlFill(x, cx - half, base - tall, cx + half, base, r, light - k * 0.03, shift);
      x.fill(path);
      crackle(x, path, cx - half, base - tall, half * 2, tall, r, 3, 0.3);
      x.strokeStyle = css(LACQUER, 0.9);
      x.lineWidth = 1.1;
      x.stroke(path);
    }
  }
}

function pine(x, cx, base, size, r, shift = 0) {
  const dir = r() < 0.5 ? -1 : 1;
  const top = [cx + dir * size * 0.12, base - size * 0.82];
  // A leaning 소나무: one S-curved trunk, pads of needles like little clouds at three heights.
  const trunk = new Path2D();
  trunk.moveTo(cx - size * 0.05, base);
  trunk.bezierCurveTo(cx - size * 0.02 + dir * size * 0.1, base - size * 0.3, cx - dir * size * 0.12, base - size * 0.55, top[0] - size * 0.012, top[1]);
  trunk.lineTo(top[0] + size * 0.012, top[1]);
  trunk.bezierCurveTo(cx - dir * size * 0.08, base - size * 0.55, cx + size * 0.02 + dir * size * 0.14, base - size * 0.3, cx + size * 0.05, base);
  trunk.closePath();
  x.fillStyle = grad(x, top[1], base, [[0, 0x8a4436], [1, 0x5a2a22]]);
  x.fill(trunk);
  x.strokeStyle = css(LACQUER, 0.9);
  x.lineWidth = 1;
  x.stroke(trunk);
  const pads = [[0.86, 0.5, dir * 0.08], [0.64, 0.42, -dir * 0.18], [0.46, 0.34, dir * 0.2]];
  for (const [at, wide, off] of pads) {
    const pcx = cx + off * size + dir * size * 0.06 * (at - 0.4) * 2;
    const pcy = base - size * at;
    const pw = size * wide;
    const ph = size * 0.1;
    x.strokeStyle = css(0x6e342b);
    x.lineWidth = Math.max(1, size * 0.018);
    x.beginPath();
    x.moveTo(lerp(cx, top[0], at), pcy + ph * 0.6);
    x.quadraticCurveTo((pcx + cx) / 2, pcy + ph * 0.2, pcx, pcy + ph * 0.3);
    x.stroke();
    const pad = new Path2D();
    const bumps = 5;
    pad.moveTo(pcx - pw / 2, pcy + ph * 0.35);
    for (let k = 0; k < bumps; k++) {
      const x0 = pcx - pw / 2 + (k / bumps) * pw;
      const x1 = pcx - pw / 2 + ((k + 1) / bumps) * pw;
      const lift = ph * (0.75 + 0.35 * Math.sin((k / (bumps - 1)) * Math.PI));
      pad.bezierCurveTo(x0, pcy - lift, x1, pcy - lift, x1, pcy + ph * (k === bumps - 1 ? 0.35 : -0.05));
    }
    pad.quadraticCurveTo(pcx, pcy + ph * 0.75, pcx - pw / 2, pcy + ph * 0.35);
    pad.closePath();
    x.fillStyle = pearlFill(x, pcx - pw / 2, pcy - ph, pcx + pw / 2, pcy + ph, r, 0.96, shift);
    x.fill(pad);
    crackle(x, pad, pcx - pw / 2, pcy - ph, pw, ph * 2, r, 5, 0.4);
    x.strokeStyle = css(LACQUER, 0.9);
    x.lineWidth = 1;
    x.stroke(pad);
  }
}
function lantern(x, cx, cy, s, lit = 0.6) {
  glowDot(x, cx, cy, s * 2.6, 0xffb36b, lit);
  x.fillStyle = css(0xd9c27a);
  x.fillRect(cx - s * 0.45, cy - s * 0.78, s * 0.9, s * 0.14);
  x.fillRect(cx - s * 0.45, cy + s * 0.64, s * 0.9, s * 0.14);
  x.fillStyle = css(0x3a5bb8);
  x.beginPath();
  x.ellipse(cx, cy - s * 0.2, s * 0.55, s * 0.5, 0, Math.PI, TAU);
  x.fill();
  x.fillStyle = css(0xd2343e);
  x.beginPath();
  x.ellipse(cx, cy - s * 0.2, s * 0.55, s * 0.82, 0, 0, Math.PI);
  x.fill();
  x.fillStyle = css(0xfff0c8, 0.35);
  x.beginPath();
  x.ellipse(cx - s * 0.15, cy, s * 0.15, s * 0.45, 0, 0, TAU);
  x.fill();
  x.fillStyle = css(0xd9c27a);
  x.fillRect(cx - s * 0.05, cy + s * 0.78, s * 0.1, s * 0.4);
}

function waves(x, x0, y0, w, rowH, cell, color, a) {
  x.strokeStyle = css(color, a);
  x.lineWidth = Math.max(0.6, rowH * 0.06);
  for (let row = 0; row < 2; row++) {
    const off = row ? cell / 2 : 0;
    for (let cx = -cell + off; cx < w + cell; cx += cell) {
      for (let k = 1; k <= 3; k++) {
        x.beginPath();
        x.ellipse(x0 + cx, y0 + rowH * (0.5 + row * 0.5), (cell / 2) * (k / 3), rowH * 0.5 * (k / 3), 0, Math.PI, TAU);
        x.stroke();
      }
    }
  }
}

const najeon = {
  bands: { mid: [0.21, 0.13] },
  look: { base: 0x0a0a0e, ghost: 0xe6f0ff, accent: 0xdbe9ff, dust: 0xb9c2dc, grit: 0xe6dff0, line: 0xece9f2, speed: 0xe6f0ff, confetti: [0xf4f2f8, 0xd6efec, 0xf2e2ec, 0xdfe8f6, 0xe6dff0], flash: 0xf3f6ff, shadow: 0x000000, starter: "drum", party: "cranes", shimmer: true },
  sky(g, res) {
    return canvas(g.W + 2 * g.over, g.H + 2 * g.over, res, (x, w, h) => {
      const hz = g.Y(g.D.far) + g.over;
      x.fillStyle = grad(x, 0, hz, [[0, 0x050508], [0.55, 0x0d0c15], [1, 0x1d1a2a]]);
      x.fillRect(0, 0, w, h);
      const r = rng(17);
      for (let i = 0; i < 70; i++) {
        const sy = Math.pow(r(), 1.4) * hz * 0.9;
        const c = PEARL[Math.floor(r() * PEARL.length)];
        x.fillStyle = css(c, 0.35 + r() * 0.55);
        x.beginPath();
        x.arc(r() * w, sy, r() < 0.15 ? 1.5 : 0.8, 0, TAU);
        x.fill();
      }
    });
  },
  discs: [
    { x: 0.7, y: -0.2, r: 0.13, glow: 0xdfe8ff, glowA: 0.32, paint: (res) => canvas(128, 128, res, (x) => {
      const r = rng(5);
      const path = new Path2D();
      path.arc(64, 64, 62, 0, TAU);
      x.fillStyle = pearlFill(x, 0, 0, 128, 128, r);
      x.fill(path);
      const gr = x.createRadialGradient(46, 42, 4, 64, 64, 64);
      gr.addColorStop(0, "rgba(255,255,255,.55)");
      gr.addColorStop(1, "rgba(200,205,230,0)");
      x.fillStyle = gr;
      x.fill(path);
      crackle(x, path, 0, 0, 128, 128, r, 26, 0.32);
      x.strokeStyle = css(0xf4f2f8, 0.9);
      x.lineWidth = 2;
      x.stroke(path);
    }) },
    // Gold like the 자개 home sun: a red disc reads as Japan's flag.
    { x: 0.2, y: -0.12, r: 0.06, glow: 0xffd27a, glowA: 0.28, paint: (res) => canvas(64, 64, res, (x) => {
      const gr = x.createRadialGradient(26, 22, 2, 32, 32, 32);
      gr.addColorStop(0, "#fff0b3");
      gr.addColorStop(0.7, "#f3c64f");
      gr.addColorStop(1, "#c99227");
      x.fillStyle = gr;
      x.beginPath();
      x.arc(32, 32, 30, 0, TAU);
      x.fill();
      x.strokeStyle = "#9a7228";
      x.lineWidth = 1.5;
      x.stroke();
    }) },
  ],
  clouds(g, res) {
    const w = Math.round(g.W * 2.2);
    const h = Math.round(g.H * 0.22);
    return canvas(w, h, res, (x) => {
      const r = rng(23);
      // Stylised 운문 clouds: a row of curls with pearl edges.
      for (let i = 0; i < 6; i++) {
        const cx = r() * w;
        const cy = h * (0.25 + r() * 0.55);
        const s = h * (0.1 + r() * 0.08);
        wrap(w, cx, s * 5, (px) => {
          x.strokeStyle = css(PEARL[i % PEARL.length], 0.55);
          x.fillStyle = css(0x1a1826, 0.55);
          x.lineWidth = 1.2;
          const path = new Path2D();
          path.moveTo(px - s * 2.4, cy + s * 0.4);
          for (let k = 0; k < 4; k++) path.arc(px - s * 1.6 + k * s * 1.05, cy - (k % 2) * s * 0.35, s * (0.55 + (k % 2) * 0.2), Math.PI, TAU);
          path.lineTo(px + s * 2.4, cy + s * 0.4);
          path.closePath();
          x.fill(path);
          x.stroke(path);
          x.beginPath();
          x.arc(px + s * 2.4, cy - s * 0.1, s * 0.5, Math.PI * 0.5, Math.PI * 2.1);
          x.stroke();
        });
      }
    });
  },
  far(g, res, L, frame = 0) {
    return canvas(L.w, L.h, res, (x, w, h) => {
      const r = rng(31);
      const b = L.base;
      x.fillStyle = grad(x, b - h * 0.2, b + h * 0.2, [[0, 0x14121c], [1, 0x0d0c12]]);
      x.fillRect(0, b - h * 0.05, w, h);
      const peaks = [[0.06, 0.55, 0.07], [0.17, 0.78, 0.09], [0.3, 0.62, 0.08], [0.43, 0.95, 0.11], [0.56, 0.66, 0.08], [0.69, 0.84, 0.1], [0.82, 0.58, 0.075], [0.93, 0.72, 0.085]];
      for (const [px, tall, half] of peaks) wrap(w, px * w, half * w, (cx) => facetPeak(x, cx, b + 2, half * w, tall * L.base * 0.92, rng(Math.round(px * 99)), 0.1, frame * 3));
    });
  },
  mid(g, res, L, frame = 0) {
    return canvas(L.w, L.h, res, (x, w, h) => {
      const r = rng(37);
      const b = L.base;
      const hill = wave(r, w, [[2, 0.5], [3, 0.3], [5, 0.15]]);
      const fh = (i) => b - h * (0.12 + hill(i) * 0.05);
      ridgePath(x, w, b, fh);
      x.fillStyle = grad(x, b - h * 0.2, b, [[0, 0x16141e], [1, 0x0e0d13]]);
      x.fill();
      x.strokeStyle = css(0xe6dff0, 0.45);
      x.lineWidth = 1;
      x.beginPath();
      for (let i = 0; i <= w; i += 3) (i ? x.lineTo(i, fh(i)) : x.moveTo(i, fh(i)));
      x.stroke();
      const trees = [];
      for (let i = 0; i < 4; i++) trees.push([((i + 0.5 + (r() - 0.5) * 0.4) / 4) * w, 0.62 + r() * 0.18]);
      for (const [tx, ts] of trees) wrap(w, tx, b * ts * 0.4, (px) => pine(x, px, fh(((px % w) + w) % w) + 4, b * ts, rng(Math.round(tx)), frame * 3));
      x.fillStyle = css(0x0e0d13);
      x.fillRect(0, b - 0.5, w, h);
    });
  },
  props(g, res, L, frame) {
    return canvas(L.w, L.h, res, (x, w, h) => {
      const b = L.base;
      const u = h / 10;
      x.fillStyle = css(0x111017);
      x.fillRect(0, b - u * 0.4, w, h);
      const top = b - u * 4.2;
      x.fillStyle = grad(x, top, b, [[0, 0x1b1924], [1, 0x121118]]);
      x.fillRect(0, top, w, b - top);
      waves(x, 0, top + u * 1.1, w, u * 1.3, u * 2.2, 0xe6dff0, 0.32);
      waves(x, 0, top + u * 2.4, w, u * 1.3, u * 2.2, 0xd6efec, 0.24);
      x.fillStyle = css(0x0b0a0f);
      x.fillRect(0, top - u * 0.9, w, u * 0.9);
      for (let tx = 0; tx < w + u; tx += u * 0.7) {
        x.fillStyle = css(0x2a2733);
        x.beginPath();
        x.arc(tx, top - u * 0.9, u * 0.36, Math.PI, TAU);
        x.fill();
        x.fillStyle = css(0xe6dff0, 0.3);
        x.fillRect(tx - u * 0.05, top - u * 1.2, u * 0.1, u * 0.3);
      }
      x.fillStyle = css(0x2a2733);
      x.beginPath();
      x.moveTo(0, top - u * 0.9);
      x.lineTo(w, top - u * 0.9);
      x.lineTo(w, top - u * 1.5);
      x.quadraticCurveTo(w / 2, top - u * 1.25, 0, top - u * 1.5);
      x.fill();
      for (let k = 0; k < 6; k++) {
        const px = ((k + 0.5) / 6) * w;
        x.fillStyle = css(0x3a2a24);
        x.fillRect(px - u * 0.12, b - u * 7.4, u * 0.24, u * 7.4);
        x.fillStyle = css(0xe6dff0, 0.5);
        for (let d = 0; d < 6; d++) x.fillRect(px - u * 0.04, b - u * (1 + d * 1.1), u * 0.08, u * 0.08);
        const sway = frame ? u * 0.25 : 0;
        x.strokeStyle = css(0x3a2a24);
        x.lineWidth = u * 0.12;
        x.beginPath();
        x.moveTo(px, b - u * 7.3);
        x.lineTo(px + u * 1.2, b - u * 7.3);
        x.stroke();
        lantern(x, px + u * 1.2 + sway * 0.3, b - u * 5.9, u * 1.05, frame ? 0.7 : 0.55);
      }
      x.fillStyle = css(0xe6dff0, 0.7);
      x.fillRect(0, b - u * 0.5, w, u * 0.1);
    });
  },
  ground(g, res, G) {
    return canvas(G.w, G.h, res, (x, w, h) => {
      const { row } = G;
      const { back, split, near } = g.D;
      const m = w / G.period;
      x.fillStyle = css(0x0e0d13);
      x.fillRect(0, 0, w, row(back));
      for (let d = 2.2, i = 0; d > back; d -= 0.09, i++) {
        const y0 = row(d);
        const y1 = row(Math.max(back, d - 0.09));
        waves(x, (i % 2) * m * 0.5, y0, w, y1 - y0, m, i % 2 ? 0xd6efec : 0xe6dff0, 0.3);
      }
      x.fillStyle = grad(x, row(back), row(near), [[0, 0x18161f], [0.25, 0x221f2c], [0.6, 0x14131a], [1, 0x0f0e14]]);
      x.fillRect(0, row(back), w, row(near) - row(back));
      noise(x, w, h, res, 8, 9, 2);
      for (const d of [back, split, near]) {
        const t = Math.max(1.2, G.thick(d, 0.05));
        const gr = x.createLinearGradient(0, 0, w, 0);
        for (let i = 0; i <= 8; i++) gr.addColorStop(i / 8, css(PEARL[i % PEARL.length], 0.95));
        x.fillStyle = gr;
        x.fillRect(0, row(d) - t / 2, w, t);
      }
      x.fillStyle = css(0x0e0d13);
      x.fillRect(0, row(near) + 2, w, h);
      for (let d = near, i = 0; d > 0.6; d -= 0.06, i++) {
        const y0 = row(d) + 2;
        const y1 = row(Math.max(0.6, d - 0.06));
        waves(x, (i % 2) * m * 0.5, y0, w, y1 - y0, m * 0.8, i % 2 ? 0xd6efec : 0xe6dff0, 0.34);
      }
    });
  },
  fg(g, res, L) {
    return canvas(L.w, L.h, res, (x, w, h) => {
      const r = rng(41);
      const b = L.base;
      for (let i = 0; i < 26; i++) {
        const bx = r() * w;
        const bh = h * (0.4 + r() * 0.5);
        const lean = (r() - 0.35) * bh * 0.7;
        const bw = 2.5 + r() * 3;
        wrap(w, bx, Math.abs(lean) + bw * 2, (px) => {
          const path = new Path2D();
          path.moveTo(px - bw, b);
          path.quadraticCurveTo(px + lean * 0.2, b - bh * 0.7, px + lean, b - bh);
          path.quadraticCurveTo(px + lean * 0.3 + bw, b - bh * 0.6, px + bw, b);
          path.closePath();
          x.fillStyle = pearlFill(x, px - bw, b - bh, px + lean, b, r, 0.85);
          x.fill(path);
          x.strokeStyle = css(LACQUER, 0.9);
          x.lineWidth = 0.8;
          x.stroke(path);
        });
      }
      x.fillStyle = css(LACQUER);
      x.fillRect(0, b - 1, w, h);
    });
  },
  board(res, n) {
    return canvas(40, 96, res, (x, w, h) => {
      x.fillStyle = css(0x3a2a24);
      x.fillRect(w / 2 - 2, 34, 4, h - 34);
      x.fillStyle = css(0x121118);
      x.fillRect(3, 2, w - 6, 34);
      x.strokeStyle = css(0xe6dff0);
      x.lineWidth = 1.5;
      x.strokeRect(5, 4, w - 10, 30);
      x.fillStyle = css(0xece9f2);
      x.font = "700 17px 'Gowun Batang', serif";
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillText(String(n), w / 2, 20);
    });
  },
  gate(g, res) {
    const f = g.f;
    // 홍살문: red pillars and arrow bars, 오색 streamers under the plaque.
    const post = canvas(Math.ceil(f * 0.4), Math.ceil(f * 7.4), res, (x, w, h) => {
      x.fillStyle = grad(x, 0, 0, [[0, 0xb8282f]]);
      const gr = x.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, "#7e1a1f");
      gr.addColorStop(0.45, "#c8323c");
      gr.addColorStop(1, "#8e1c22");
      x.fillStyle = gr;
      x.fillRect(w * 0.12, 0, w * 0.76, h);
      x.fillStyle = css(0x1b1924);
      x.fillRect(0, h - w * 0.8, w, w * 0.8);
      x.fillStyle = css(0xe6dff0, 0.8);
      x.fillRect(0, h - w * 0.8, w, 1.5);
    });
    const stake = canvas(Math.ceil(f * 0.14), Math.ceil(f * 2.5), res, (x, w, h) => {
      x.fillStyle = css(0xc8323c);
      x.fillRect(0, 0, w, h);
    });
    const banner = canvas(Math.ceil(f * 10.4), Math.ceil(f * 3), res, (x, w, h) => {
      const bar = h * 0.14;
      x.fillStyle = css(0xb8282f);
      x.fillRect(0, h * 0.06, w, bar);
      x.fillRect(0, h * 0.52, w, bar * 0.8);
      for (let i = 0; i < 17; i++) {
        const px = (i + 0.5) * (w / 17);
        x.fillRect(px - 1.5, h * 0.06 - h * 0.08, 3, h * 0.5);
        x.beginPath();
        x.moveTo(px - 4, h * 0.0);
        x.lineTo(px, -h * 0.06);
        x.lineTo(px + 4, h * 0.0);
        x.fill();
      }
      const colors = [0x2e4a9a, 0xd2343e, 0xf2c94c, 0xf4f2f8, 0x1b1924];
      for (let i = 0; i < 15; i++) {
        const px = (i + 0.5) * (w / 15);
        x.fillStyle = css(colors[i % 5]);
        x.beginPath();
        x.moveTo(px - w / 34, h * 0.64);
        x.lineTo(px + w / 34, h * 0.64);
        x.lineTo(px + w / 50, h);
        x.lineTo(px, h * 0.94);
        x.lineTo(px - w / 50, h);
        x.fill();
      }
      const pw = w * 0.34;
      x.fillStyle = css(0x121118);
      x.fillRect(w / 2 - pw / 2, h * 0.17, pw, h * 0.34);
      x.strokeStyle = css(0xe6dff0);
      x.lineWidth = 2;
      x.strokeRect(w / 2 - pw / 2 + 3, h * 0.17 + 3, pw - 6, h * 0.34 - 6);
      x.fillStyle = css(0xf4f2f8);
      x.font = `700 ${Math.round(h * 0.22)}px 'Gowun Batang', serif`;
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillText("결 승", w / 2, h * 0.345);
    });
    const balloons = canvas(80, 150, res, (x) => {
      x.strokeStyle = css(0x3a2a24);
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(40, 150);
      x.lineTo(40, 40);
      x.stroke();
      lantern(x, 40, 70, 22, 0.75);
    });
    return { post, stake, banner, balloons, tape: 0xd2343e };
  },
  starter(g, res) {
    const f = g.f;
    // A 북 on its stand, 태극 on the head.
    return canvas(Math.ceil(f * 2), Math.ceil(f * 3), res, (x, w, h) => {
      x.strokeStyle = css(0x3a2a24);
      x.lineWidth = w * 0.06;
      x.beginPath();
      x.moveTo(w * 0.2, h);
      x.lineTo(w * 0.5, h * 0.45);
      x.lineTo(w * 0.8, h);
      x.stroke();
      const cy = h * 0.4;
      x.fillStyle = grad(x, cy - w * 0.3, cy + w * 0.3, [[0, 0xc8323c], [1, 0x7e1a1f]]);
      x.beginPath();
      x.ellipse(w * 0.5, cy, w * 0.36, w * 0.3, 0, 0, TAU);
      x.fill();
      x.fillStyle = css(0xe9dcc0);
      x.beginPath();
      x.ellipse(w * 0.5, cy, w * 0.22, w * 0.27, 0, 0, TAU);
      x.fill();
      x.fillStyle = css(0xc8323c);
      x.beginPath();
      x.arc(w * 0.5, cy, w * 0.14, Math.PI * 1.5, Math.PI * 0.5);
      x.fill();
      x.fillStyle = css(0x2e4a9a);
      x.beginPath();
      x.arc(w * 0.5, cy, w * 0.14, Math.PI * 0.5, Math.PI * 1.5);
      x.fill();
      x.fillStyle = css(0xd9c27a);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        x.beginPath();
        x.arc(w * 0.5 + Math.cos(a) * w * 0.33, cy + Math.sin(a) * w * 0.27, 1.6, 0, TAU);
        x.fill();
      }
    });
  },
  sprites(res) {
    return {
      crane: [0, 1].map((up) => canvas(64, 40, res, (x) => {
        x.fillStyle = "#f4f2f8";
        x.beginPath();
        x.ellipse(32, 22, 14, 5, -0.1, 0, TAU);
        x.fill();
        x.beginPath();
        x.moveTo(44, 20);
        x.quadraticCurveTo(54, 14, 60, 15);
        x.lineTo(60, 17);
        x.quadraticCurveTo(54, 17, 45, 23);
        x.fill();
        x.fillStyle = "#d2343e";
        x.beginPath();
        x.arc(58, 15, 2, 0, TAU);
        x.fill();
        x.fillStyle = "#e6dff0";
        x.beginPath();
        x.moveTo(26, 20);
        x.quadraticCurveTo(18, up ? 2 : 34, 6, up ? 4 : 36);
        x.quadraticCurveTo(24, up ? 12 : 28, 36, 21);
        x.fill();
        x.fillStyle = "#1b1924";
        x.fillRect(4, up ? 4 : 33, 6, 3);
        x.strokeStyle = "#1b1924";
        x.lineWidth = 1.2;
        x.beginPath();
        x.moveTo(20, 24);
        x.lineTo(8, 28);
        x.stroke();
      })),
      petal: canvas(16, 10, res, (x) => {
        const g = x.createLinearGradient(0, 0, 16, 10);
        g.addColorStop(0, "#f4f2f8");
        g.addColorStop(0.5, "#d6efec");
        g.addColorStop(1, "#f2e2ec");
        x.fillStyle = g;
        x.beginPath();
        x.ellipse(8, 5, 7, 4, 0, 0, TAU);
        x.fill();
      }),
    };
  },
};

/* ---------- 8bit: a real pixel world, one canvas pixel per art pixel, PICO-8 colours ---------- */

const K = { ink: 0x000000, navy: 0x1d2b53, plum: 0x7e2553, green: 0x008751, brown: 0xab5236, dark: 0x5f574f, grey: 0xc2c3c7, white: 0xfff1e8, red: 0xff004d, orange: 0xffa300, yellow: 0xffec27, lime: 0x00e436, blue: 0x29adff, lav: 0x83769c, pink: 0xff77a8, peach: 0xffccaa };
const GLYPH = {
  A: [".##.", "#..#", "####", "#..#", "#..#"], E: ["####", "#...", "###.", "#...", "####"], G: [".###", "#...", "#.##", "#..#", ".###"],
  K: ["#..#", "#.#.", "##..", "#.#.", "#..#"], L: ["#...", "#...", "#...", "#...", "####"], O: [".##.", "#..#", "#..#", "#..#", ".##."],
  P: ["###.", "#..#", "###.", "#...", "#..."], R: ["###.", "#..#", "###.", "#.#.", "#..#"], S: [".###", "#...", ".##.", "...#", "###."],
  T: ["###", ".#.", ".#.", ".#.", ".#."], Y: ["#.#", "#.#", ".#.", ".#.", ".#."], " ": ["..", "..", "..", "..", ".."], "!": ["#", "#", "#", ".", "#"],
  0: ["###", "#.#", "#.#", "#.#", "###"], 1: [".#.", "##.", ".#.", ".#.", "###"], 2: ["###", "..#", "###", "#..", "###"], 3: ["###", "..#", ".##", "..#", "###"],
  4: ["#.#", "#.#", "###", "..#", "..#"], 5: ["###", "#..", "###", "..#", "###"], 6: ["###", "#..", "###", "#.#", "###"], 7: ["###", "..#", ".#.", ".#.", ".#."],
  8: ["###", "#.#", "###", "#.#", "###"], 9: ["###", "#.#", "###", "..#", "###"],
};

// Art-pixel canvas: two CSS pixels per canvas pixel, drawn without smoothing.
function pix(w, h, draw) {
  return canvas(w, h, 0.5, (x, cw, ch) => {
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.imageSmoothingEnabled = false;
    draw(x, Math.round(cw / 2), Math.round(ch / 2));
  });
}
const dot = (x, c, px, py, w = 1, h = 1) => { x.fillStyle = css(c); x.fillRect(Math.round(px), Math.round(py), w, h); };

function text8(x, s, px, py, c) {
  let cx = px;
  for (const ch of s) {
    const g = GLYPH[ch] || GLYPH[" "];
    g.forEach((row, j) => [...row].forEach((on, i) => { if (on === "#") dot(x, c, cx + i, py + j); }));
    cx += g[0].length + 1;
  }
  return textWidth(s);
}
const textWidth = (s) => [...s].reduce((n, ch) => n + (GLYPH[ch] || GLYPH[" "])[0].length + 1, -1);

function disc8(x, cx, cy, r, c) {
  for (let j = -r; j <= r; j++) {
    const half = Math.floor(Math.sqrt(r * r - j * j) + 0.35);
    dot(x, c, cx - half, cy + j, half * 2 + 1, 1);
  }
}

function cloud8(x, cx, cy, s) {
  for (const [ox, oy, r] of [[0, 0, s], [-s * 1.1, s * 0.35, s * 0.7], [s * 1.1, s * 0.3, s * 0.75], [s * 0.4, -s * 0.4, s * 0.7]]) disc8(x, cx + ox, cy + oy, Math.round(r), K.white);
  dot(x, K.grey, cx - s * 1.8, cy + s * 0.7, s * 3.6, 2);
}

function tree8(x, cx, base, s, c1, c2) {
  dot(x, K.brown, cx - 1, base - s, 2, s);
  disc8(x, cx, base - s - Math.round(s * 0.5), Math.round(s * 0.65), c2);
  disc8(x, cx - 1, base - s - Math.round(s * 0.6), Math.round(s * 0.5), c1);
  dot(x, K.white, cx - Math.round(s * 0.35), base - s - Math.round(s * 0.9), 1, 1);
}

const pixel = {
  bands: { far: [0.17, 0.09], mid: [0.11, 0.13], props: [0.12, 0.06] },
  look: { base: K.green, ghost: K.white, accent: K.yellow, dust: K.peach, grit: K.brown, line: K.white, speed: K.white, confetti: [K.yellow, K.pink, K.blue, K.lime, K.orange, K.white], flash: K.white, shadow: K.navy, starter: "flag", party: "pixel" },
  sky(g) {
    return pix(g.W + 2 * g.over, g.H + 2 * g.over, (x, w, h) => {
      const hz = Math.round((g.Y(g.D.far) + g.over) / 2);
      const bands = [K.blue, 0x59c1ff, 0x8ed6ff, 0xc4ebff];
      const edge = (i) => Math.round(hz * [0, 0.38, 0.62, 0.84][i]);
      for (let i = 0; i < 4; i++) dot(x, bands[i], 0, edge(i), w, (i < 3 ? edge(i + 1) : h) - edge(i));
      for (let i = 1; i < 4; i++) for (let row = 0; row < 2; row++) for (let px = (row % 2); px < w; px += 2) dot(x, bands[i], px, edge(i) - 1 - row * 2);
      const r = rng(3);
      for (let i = 0; i < 7; i++) cloud8(x, r() * w, 10 + r() * hz * 0.45, 4 + Math.floor(r() * 4));
    });
  },
  discs: [{ x: 0.78, y: -0.17, r: 0.07, glow: K.yellow, glowA: 0, paint: () => pix(64, 64, (x) => { disc8(x, 16, 16, 14, K.orange); disc8(x, 16, 16, 12, K.yellow); dot(x, K.white, 9, 10, 3, 2); }) }],
  far(g, res, L) {
    return pix(L.w, L.h, (x, w, h) => {
      const r = rng(5);
      const b = Math.round(L.base / 2);
      const ridge = wave(r, w, [[3, 0.5, true], [7, 0.3, true], [13, 0.12]]);
      for (let px = 0; px < w; px++) {
        const top = Math.round(b - h * (0.3 + ridge(px) * 0.22));
        dot(x, K.lav, px, top, 1, h - top);
        if (b - top > h * 0.38) dot(x, K.white, px, top, 1, Math.max(1, Math.round((b - top - h * 0.38) * 0.6)));
        if (((px + top) & 1) === 0 && ridge(px + 1) < ridge(px)) dot(x, K.dark, px, top + 3, 1, Math.max(0, b - top - 3));
      }
      dot(x, K.navy, 0, b, w, h - b);
      for (let px = 0; px < w; px += 2) dot(x, K.lav, px + ((px / 2) & 1), b, 1, 1);
    });
  },
  mid(g, res, L) {
    return pix(L.w, L.h, (x, w, h) => {
      const r = rng(9);
      const b = Math.round(L.base / 2);
      const hill = wave(r, w, [[2, 0.5], [5, 0.3], [9, 0.12]]);
      for (let px = 0; px < w; px++) {
        const top = Math.round(b - h * (0.12 + hill(px) * 0.07));
        dot(x, K.green, px, top, 1, h - top);
        dot(x, K.lime, px, top, 1, 1);
      }
      for (let i = 0; i < 18; i++) {
        const tx = Math.round(r() * w);
        const top = Math.round(b - h * (0.12 + hill(tx) * 0.07));
        tree8(x, tx, top + 2, 5 + Math.floor(r() * 4), K.lime, K.green);
      }
      const cx = Math.round(w * 0.3);
      const top = Math.round(b - h * (0.12 + hill(cx) * 0.07)) - 2;
      dot(x, K.grey, cx - 7, top - 12, 14, 12);
      for (let i = 0; i < 4; i++) dot(x, K.grey, cx - 7 + i * 4, top - 14, 2, 2);
      dot(x, K.dark, cx - 2, top - 6, 4, 6);
      dot(x, K.dark, cx - 1, top - 20, 1, 8);
      dot(x, K.red, cx, top - 20, 4, 3);
    });
  },
  props(g, res, L, frame) {
    return pix(L.w, L.h, (x, w, h) => {
      const r = rng(13);
      const b = Math.round(L.base / 2);
      dot(x, K.green, 0, b - 2, w, h - b + 2);
      const top = b - Math.round(h * 0.55);
      for (let row = 0; row < 5; row++) {
        const ry = top + row * 4;
        dot(x, row % 2 ? K.navy : K.dark, 0, ry, w, 4);
        for (let px = 1 + (row % 2) * 2; px < w - 2; px += 4) {
          if (r() < 0.12) continue;
          const up = frame && r() < 0.5 ? 1 : 0;
          const shirt = [K.red, K.yellow, K.blue, K.pink, K.lime, K.orange, K.white][Math.floor(r() * 7)];
          dot(x, shirt, px, ry + 1 - up, 3, 2);
          dot(x, [K.peach, K.brown, K.peach][Math.floor(r() * 3)], px + 1, ry - 1 - up, 1, 2);
          if (frame && r() < 0.25) dot(x, K.peach, px + (r() < 0.5 ? -1 : 3), ry - 2 - up, 1, 2);
        }
      }
      dot(x, K.grey, 0, top - 3, w, 3);
      for (let px = 0; px < w; px += 6) dot(x, K.white, px, top - 3, 3, 1);
      const boardW = textWidth("POKKEY GP") + 6;
      for (const at of [0.25, 0.75]) {
        const bx = Math.round(at * w - boardW / 2);
        dot(x, K.ink, bx, top - 14, boardW, 10);
        dot(x, K.dark, bx + 1, top - 13, boardW - 2, 8);
        text8(x, "POKKEY GP", bx + 3, top - 12, frame ? K.yellow : K.orange);
        dot(x, K.grey, bx + 2, top - 4, 1, 1);
        dot(x, K.grey, bx + boardW - 3, top - 4, 1, 1);
      }
      for (let px = 0; px < w; px += 16) {
        dot(x, K.grey, px, b - 9, 1, 7);
        dot(x, [K.red, K.yellow, K.blue][(px / 16) % 3], px + 1, b - 9 - (frame ? 1 : 0), 4, 3);
      }
      dot(x, K.white, 0, b - 3, w, 1);
      for (let px = 0; px < w; px += 4) dot(x, K.white, px, b - 3, 1, 3);
    });
  },
  ground(g, res, G) {
    return pix(G.w, G.h, (x, w, h) => {
      const row = (d) => Math.round(G.row(d) / 2);
      const { back, split, near } = g.D;
      const m = w / G.period;
      dot(x, K.lime, 0, 0, w, row(back));
      for (let i = 0; i < G.period; i += 2) dot(x, K.green, Math.round(i * m), 0, Math.round(m), row(back));
      dot(x, K.brown, 0, row(back), w, row(near) - row(back));
      for (let i = 0; i < 160; i++) dot(x, K.orange, Math.floor(rng(i)() * w), row(back) + Math.floor(rng(i + 999)() * (row(near) - row(back))));
      for (const d of [back, near]) dot(x, K.white, 0, row(d) - 1, w, 2);
      for (let px = 0; px < w; px += 8) dot(x, K.white, px, row(split) - 1, 5, 2);
      dot(x, K.lime, 0, row(near) + 1, w, h);
      for (let i = 1; i < G.period; i += 2) dot(x, K.green, Math.round(i * m), row(near) + 1, Math.round(m), h);
    });
  },
  fg(g, res, L) {
    return pix(L.w, L.h, (x, w, h) => {
      const r = rng(17);
      const b = Math.round(L.base / 2);
      for (let i = 0; i < 70; i++) {
        const px = Math.floor(r() * w);
        const t = 3 + Math.floor(r() * 9);
        dot(x, r() < 0.5 ? K.green : K.lime, px, b - t, 1, t);
        dot(x, K.green, px + 1, b - Math.round(t * 0.6), 1, Math.round(t * 0.6));
      }
      for (let i = 0; i < 10; i++) {
        const px = Math.floor(r() * w);
        const py = b - 8 - Math.floor(r() * 10);
        const c = [K.red, K.yellow, K.pink, K.white][i % 4];
        dot(x, K.green, px, py + 2, 1, b - py - 2);
        dot(x, c, px - 1, py, 3, 1);
        dot(x, c, px, py - 1, 1, 3);
        dot(x, K.yellow, px, py, 1, 1);
      }
      dot(x, K.green, 0, b - 1, w, h);
    });
  },
  board(res, n) {
    const s = String(n);
    return pix(24, 44, (x) => {
      dot(x, K.grey, 5, 8, 2, 14);
      dot(x, K.ink, 0, 0, 12, 9);
      dot(x, K.white, 1, 1, 10, 7);
      text8(x, s, 6 - Math.floor(textWidth(s) / 2), 2, K.navy);
    });
  },
  gate(g) {
    const f = g.f;
    const tall = Math.ceil((f * 7.4) / 2) * 2;
    const post = pix(12, tall, (x, w, h) => {
      for (let y = 0; y < h; y += 4) dot(x, (y / 4) % 2 ? K.ink : K.white, 1, y, 4, 4);
      dot(x, K.red, 0, 0, 6, 3);
    });
    const stake = pix(4, Math.ceil(f * 2.5), (x, w, h) => { dot(x, K.white, 0, 0, 2, h); dot(x, K.red, 0, 0, 2, 2); });
    const bw = Math.ceil((f * 10.4) / 2) * 2;
    const banner = pix(bw, Math.ceil(f * 2.4), (x, w, h) => {
      dot(x, K.ink, 0, 0, w, h);
      dot(x, K.red, 1, 1, w - 2, h - 2);
      for (let px = 1; px < w - 1; px += 2) { const on = Math.floor(px / 2) % 2; dot(x, on ? K.white : K.ink, px, 1, 2, 2); dot(x, on ? K.ink : K.white, px, h - 3, 2, 2); }
      // Big letters from the small font, with a one-pixel shadow so it stays a crisp outline at any size.
      const tw = textWidth("GOAL");
      const scale = Math.max(1, Math.floor((h - 8) / 5));
      const gx = Math.round(w / 2 - (tw * scale) / 2);
      const gy = Math.round(h / 2 - (5 * scale) / 2);
      for (const [o, color] of [[1, K.plum], [0, K.yellow]]) {
        const c = document.createElement("canvas");
        c.width = tw;
        c.height = 5;
        text8(c.getContext("2d"), "GOAL", 0, 0, color);
        x.drawImage(c, gx + o, gy + o, tw * scale, 5 * scale);
      }
    });
    const balloons = pix(60, 90, (x) => {
      dot(x, K.grey, 15, 22, 1, 23);
      for (const [cx, cy, c] of [[9, 8, K.red], [21, 9, K.yellow], [15, 16, K.blue]]) {
        disc8(x, cx, cy, 5, c);
        dot(x, K.white, cx - 2, cy - 3, 1, 2);
      }
    });
    return { post, stake, banner, balloons, tape: K.red };
  },
  starter(g) {
    const f = g.f;
    return pix(Math.ceil(f * 1.6), Math.ceil(f * 3.4), (x, w, h) => {
      dot(x, K.dark, Math.round(w * 0.3), Math.round(h * 0.55), 2, h);
      dot(x, K.dark, Math.round(w * 0.7) - 2, Math.round(h * 0.55), 2, h);
      dot(x, K.grey, Math.round(w * 0.2), Math.round(h * 0.5), Math.round(w * 0.6), 3);
      const tw = textWidth("START");
      dot(x, K.ink, Math.round(w / 2 - tw / 2) - 2, Math.round(h * 0.3), tw + 4, 9);
      text8(x, "START", Math.round(w / 2 - tw / 2), Math.round(h * 0.3) + 2, K.white);
    });
  },
  sprites() {
    return {
      flag: [0, 1].map((down) => pix(40, 40, (x) => {
        dot(x, K.grey, 4, 2, 1, 18);
        for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) dot(x, (i + j) % 2 ? K.ink : K.white, down ? 5 + j * 2 : 5 + i * 2, down ? 4 + i * 2 : 2 + j * 2, 2, 2);
      })),
      puff: pix(16, 16, (x) => { disc8(x, 4, 4, 3, K.white); dot(x, K.grey, 2, 7, 5, 1); }),
    };
  },
};

/* ---------- milk: a strawberry-milk picnic in the pink afternoon ---------- */

const M = { milk: 0xfff8f3, cream: 0xfff1e6, pink: 0xff8fab, deep: 0xf2577f, berry: 0x7a2e45, leaf: 0x4fae5e, leafDark: 0x2f8a46, blush: 0xffd0dc };
const MILK_FONT = "'Cafe24Ssurround', 'Pretendard Variable', Pretendard, sans-serif";

function strawberry(x, cx, cy, s) {
  x.fillStyle = grad(x, cy - s, cy + s, [[0, 0xff5c7c], [1, 0xd9264f]]);
  x.beginPath();
  x.moveTo(cx, cy + s);
  x.bezierCurveTo(cx - s * 1.2, cy + s * 0.2, cx - s * 0.9, cy - s * 0.85, cx, cy - s * 0.6);
  x.bezierCurveTo(cx + s * 0.9, cy - s * 0.85, cx + s * 1.2, cy + s * 0.2, cx, cy + s);
  x.fill();
  x.fillStyle = css(0xfff1c4, 0.9);
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4;
    x.beginPath();
    x.ellipse(cx + Math.cos(a) * s * 0.42, cy + s * 0.05 + Math.sin(a) * s * 0.35, s * 0.06, s * 0.09, 0, 0, TAU);
    x.fill();
  }
  x.fillStyle = css(M.leaf);
  for (let i = -2; i <= 2; i++) {
    x.beginPath();
    x.ellipse(cx + i * s * 0.22, cy - s * 0.66, s * 0.26, s * 0.12, i * 0.5, 0, TAU);
    x.fill();
  }
}

function puffCloud(x, cx, cy, s, r) {
  const lobes = [[0, 0, 1], [-1, 0.25, 0.75], [1, 0.2, 0.8], [-0.45, -0.35, 0.7], [0.5, -0.3, 0.72]];
  for (const [ox, oy, k] of lobes) {
    const gr = x.createRadialGradient(cx + ox * s - s * 0.2, cy + oy * s - s * 0.3, s * 0.1, cx + ox * s, cy + oy * s, s * k);
    gr.addColorStop(0, css(0xffffff));
    gr.addColorStop(0.7, css(0xfff4f6));
    gr.addColorStop(1, css(0xffd6e0));
    x.fillStyle = gr;
    x.beginPath();
    x.arc(cx + ox * s, cy + oy * s, s * k, 0, TAU);
    x.fill();
  }
}

function carton(x, cx, base, s, r) {
  const w = s * 0.8;
  const h = s;
  x.fillStyle = css(r() < 0.5 ? 0xffe3ea : 0xfff8f3);
  x.fillRect(cx - w / 2, base - h, w, h);
  x.fillStyle = css(M.pink);
  x.beginPath();
  x.moveTo(cx - w / 2 - s * 0.05, base - h);
  x.lineTo(cx, base - h - s * 0.42);
  x.lineTo(cx + w / 2 + s * 0.05, base - h);
  x.fill();
  x.fillStyle = css(M.deep);
  x.fillRect(cx - s * 0.04, base - h - s * 0.5, s * 0.08, s * 0.12);
  x.fillStyle = css(M.pink, 0.8);
  x.fill(heartPath(cx, base - h * 0.55, s * 0.22));
  x.fillStyle = css(M.berry, 0.45);
  x.fillRect(cx - w / 2, base - s * 0.06, w, s * 0.06);
}

function heartPath(cx, cy, s) {
  const p = new Path2D();
  p.moveTo(cx, cy + s * 0.55);
  p.bezierCurveTo(cx - s * 1.1, cy - s * 0.1, cx - s * 0.45, cy - s * 0.85, cx, cy - s * 0.3);
  p.bezierCurveTo(cx + s * 0.45, cy - s * 0.85, cx + s * 1.1, cy - s * 0.1, cx, cy + s * 0.55);
  return p;
}

function lolly(x, cx, base, s) {
  x.fillStyle = css(0xffffff);
  x.fillRect(cx - s * 0.04, base - s, s * 0.08, s);
  const cy = base - s;
  x.fillStyle = css(M.pink);
  x.beginPath();
  x.arc(cx, cy, s * 0.36, 0, TAU);
  x.fill();
  x.strokeStyle = css(0xffffff, 0.95);
  x.lineWidth = s * 0.07;
  x.beginPath();
  for (let a = 0; a < TAU * 2.2; a += 0.2) x.lineTo(cx + Math.cos(a) * a * s * 0.025, cy + Math.sin(a) * a * s * 0.025);
  x.stroke();
}

const milk = {
  bands: { mid: [0.13, 0.13], props: [0.12, 0.06] },
  look: { base: 0xffd6e2, ghost: 0xffffff, accent: 0xff6f9a, dust: 0xffe4ec, grit: 0xf2577f, line: 0xfff8f3, speed: 0xffffff, confetti: [0xff6f9a, 0xffffff, 0xffb3c7, 0xff4f79, 0xfff1c4], flash: 0xfff4f8, shadow: 0xb8506e, starter: "popper", party: "hearts" },
  sky(g, res) {
    return canvas(g.W + 2 * g.over, g.H + 2 * g.over, res, (x, w, h) => {
      const hz = g.Y(g.D.far) + g.over;
      x.fillStyle = grad(x, 0, hz, [[0, 0xff9dbb], [0.55, 0xffc7d7], [1, 0xfff1f4]]);
      x.fillRect(0, 0, w, h);
      const r = rng(19);
      for (let i = 0; i < 26; i++) {
        const bx = r() * w;
        const by = r() * hz * 0.8;
        const br = 2 + r() * 6;
        x.strokeStyle = css(0xffffff, 0.55);
        x.lineWidth = 1.2;
        x.beginPath();
        x.arc(bx, by, br, 0, TAU);
        x.stroke();
        x.fillStyle = css(0xffffff, 0.5);
        x.beginPath();
        x.arc(bx - br * 0.35, by - br * 0.35, br * 0.22, 0, TAU);
        x.fill();
      }
    });
  },
  discs: [{ x: 0.74, y: -0.14, r: 0.075, glow: 0xffffff, glowA: 0.55, core: 0xffffff, edge: 0xffe0ea }],
  clouds(g, res) {
    const w = Math.round(g.W * 2.2);
    const h = Math.round(g.H * 0.22);
    return canvas(w, h, res, (x) => {
      const r = rng(29);
      for (let i = 0; i < 6; i++) {
        const cx = r() * w;
        const cy = h * (0.35 + r() * 0.4);
        const s = h * (0.12 + r() * 0.08);
        wrap(w, cx, s * 2.2, (px) => puffCloud(x, px, cy, s, r));
      }
    });
  },
  far(g, res, L) {
    return canvas(L.w, L.h, res, (x, w, h) => {
      const r = rng(43);
      const b = L.base;
      const mounds = wave(r, w, [[3, 0.5], [5, 0.35], [8, 0.15]]);
      const top = (i) => b - h * (0.28 + mounds(i) * 0.14);
      ridgePath(x, w, b, top);
      x.fillStyle = grad(x, b - h * 0.45, b, [[0, 0xfffaf6], [0.5, 0xffe2ea], [1, 0xffb9cc]]);
      x.fill();
      x.fillStyle = css(0xffc1d1, 0.55);
      for (let i = 0; i < 16; i++) {
        const dx = r() * w;
        const dy = top(dx) + h * (0.04 + r() * 0.06);
        const dw = 6 + r() * 10;
        const dl = 8 + r() * 22;
        wrap(w, dx, dw, (px) => {
          x.beginPath();
          x.moveTo(px - dw, dy);
          x.quadraticCurveTo(px - dw, dy + dl, px, dy + dl);
          x.quadraticCurveTo(px + dw, dy + dl, px + dw, dy);
          x.fill();
        });
      }
      x.strokeStyle = css(0xffffff, 0.9);
      x.lineWidth = 2;
      x.beginPath();
      for (let i = 0; i <= w; i += 3) (i ? x.lineTo(i, top(i) + 2) : x.moveTo(i, top(i) + 2));
      x.stroke();
      x.fillStyle = css(0xffd6e2);
      x.fillRect(0, b - 0.5, w, h);
    });
  },
  mid(g, res, L) {
    return canvas(L.w, L.h, res, (x, w, h) => {
      const r = rng(47);
      const b = L.base;
      const hill = wave(r, w, [[2, 0.5], [4, 0.3], [9, 0.1]]);
      const top = (i) => b - h * (0.1 + hill(i) * 0.05);
      ridgePath(x, w, b, top);
      x.fillStyle = grad(x, b - h * 0.2, b, [[0, 0x9fdc8f], [1, 0x7cc47a]]);
      x.fill();
      for (let k = 0; k < 4; k++) {
        const ry = b - h * 0.02 - k * h * 0.025;
        for (let px = 0; px < w; px += 9) {
          x.fillStyle = css(M.leafDark, 0.55);
          x.beginPath();
          x.ellipse(px + (k % 2) * 4, ry, 4.5, 2.2, 0, 0, TAU);
          x.fill();
          if ((px + k * 7) % 27 < 9) strawberry(x, px + (k % 2) * 4, ry - 1, 2.6);
        }
      }
      for (let i = 0; i < 5; i++) {
        const cx = ((i + 0.3 + r() * 0.4) / 5) * w;
        wrap(w, cx, 30, (px) => carton(x, px, top(((px % w) + w) % w) + 3, h * (0.13 + r() * 0.05), r));
      }
      for (let i = 0; i < 7; i++) {
        const cx = r() * w;
        wrap(w, cx, 20, (px) => lolly(x, px, top(((px % w) + w) % w) + 3, h * (0.16 + r() * 0.08)));
      }
      x.fillStyle = css(0x7cc47a);
      x.fillRect(0, b - 0.5, w, h);
    });
  },
  props(g, res, L, frame) {
    return canvas(L.w, L.h, res, (x, w, h) => {
      const r = rng(53);
      const b = L.base;
      const u = h / 10;
      x.fillStyle = css(0x9fdc8f);
      x.fillRect(0, b - u * 0.3, w, h);
      for (const [s0, sw] of [[0.04, 0.4], [0.55, 0.4]]) {
        const sx = s0 * w;
        const ex = sx + sw * w;
        const roof = b - u * 6.6;
        for (let tier = 2; tier >= 0; tier--) {
          const ty = b - u * (1.2 + tier * 1.6);
          x.fillStyle = css(tier % 2 ? 0xffe3ea : 0xfff8f3);
          x.fillRect(sx, ty - u * 0.2, ex - sx, u * 1.8);
          const n = Math.floor((ex - sx) / (u * 1.05));
          for (let i = 0; i < n; i++) {
            if (r() < 0.12) continue;
            const cx = sx + (i + 0.5) * ((ex - sx) / n);
            const jump = frame && r() < 0.45 ? u * 0.3 : 0;
            const tint = [0xffffff, 0xffe0e8, 0xfff1c4, 0xd8f0ff, 0xe8dcff][Math.floor(r() * 5)];
            x.fillStyle = css(tint);
            x.beginPath();
            x.ellipse(cx, ty - u * 0.6 - jump, u * 0.42, u * 0.38, 0, 0, TAU);
            x.fill();
            x.fillStyle = css(M.berry);
            x.fillRect(cx - u * 0.14, ty - u * 0.62 - jump, u * 0.07, u * 0.07);
            x.fillRect(cx + u * 0.08, ty - u * 0.62 - jump, u * 0.07, u * 0.07);
            x.fillStyle = css(M.pink, 0.6);
            x.fillRect(cx - u * 0.26, ty - u * 0.5 - jump, u * 0.1, u * 0.06);
            x.fillRect(cx + u * 0.18, ty - u * 0.5 - jump, u * 0.1, u * 0.06);
            if (frame && r() < 0.3) {
              x.fillStyle = css(0xff6f9a);
              x.fill(heartPath(cx + u * 0.6, ty - u * 1.3 - jump, u * 0.3));
            }
          }
        }
        const stripes = 10;
        for (let k = 0; k < stripes; k++) {
          x.fillStyle = css(k % 2 ? 0xffffff : M.pink);
          x.beginPath();
          const a = sx + ((ex - sx) * k) / stripes;
          const c = sx + ((ex - sx) * (k + 1)) / stripes;
          x.moveTo(a, roof);
          x.lineTo(c, roof);
          x.lineTo(c, roof + u * 0.7);
          x.quadraticCurveTo((a + c) / 2, roof + u * 1.2, a, roof + u * 0.7);
          x.fill();
        }
        x.fillStyle = css(M.deep);
        x.fillRect(sx - u * 0.2, roof - u * 0.2, ex - sx + u * 0.4, u * 0.3);
        for (const px of [sx + u * 0.2, ex - u * 0.2]) {
          x.fillStyle = css(0xffffff);
          x.fillRect(px - u * 0.12, roof, u * 0.24, b - roof);
        }
        bunting(x, sx, roof - u * 0.4, ex, roof - u * 0.4, u * 0.8, [M.pink, 0xffffff, M.deep], u * 0.7);
      }
      for (let px = 0; px < w; px += u * 1.6) {
        x.fillStyle = css(((px / (u * 1.6)) | 0) % 2 ? 0xffffff : 0xffd0dc);
        x.fillRect(px, b - u * 1.1, u * 1.6, u * 0.9);
      }
      x.fillStyle = css(0xffffff);
      x.fillRect(0, b - u * 1.2, w, u * 0.18);
    });
  },
  ground(g, res, G) {
    return canvas(G.w, G.h, res, (x, w, h) => {
      const { row } = G;
      const { back, split, near } = g.D;
      const m = w / G.period;
      // Gingham verges: checks in metres across, depth bands down.
      const gingham = (d0, d1, step, cell) => {
        let k = 0;
        for (let d = d0; d > d1; d -= step, k++) {
          const y0 = row(d);
          const y1 = row(Math.max(d1, d - step));
          for (let i = 0; i < G.period / cell; i++) {
            const on = (i + k) % 2;
            x.fillStyle = css(on ? 0xffb3c7 : 0xffffff, on ? 1 : 0.95);
            x.fillRect(i * cell * m, y0, cell * m + 0.5, y1 - y0 + 0.5);
          }
          x.fillStyle = css(0xffd0dc, 0.5);
          x.fillRect(0, y0, w, (y1 - y0) / 2);
        }
      };
      gingham(2.4, back, 0.11, 0.5);
      x.fillStyle = grad(x, row(back), row(near), [[0, 0xf2799d], [0.4, 0xf7869f], [1, 0xe8678f]]);
      x.fillRect(0, row(back), w, row(near) - row(back));
      noise(x, w, h, res, 10, 7, 2);
      for (const d of [back, near]) {
        const t = Math.max(1.5, G.thick(d, 0.07));
        x.fillStyle = css(0xfff8f3);
        x.fillRect(0, row(d) - t / 2, w, t);
      }
      const t = Math.max(1.5, G.thick(split, 0.07));
      for (let i = 0; i < G.period; i += 1) {
        x.fillStyle = css(0xfff8f3);
        x.beginPath();
        x.roundRect(i * m, row(split) - t / 2, m * 0.55, t, t / 2);
        x.fill();
      }
      gingham(near, 0.6, 0.045, 0.5);
    });
  },
  fg(g, res, L) {
    return canvas(L.w, L.h, res, (x, w, h) => {
      const r = rng(59);
      const b = L.base;
      for (let i = 0; i < 40; i++) {
        const bx = r() * w;
        const bh = h * (0.25 + r() * 0.45);
        wrap(w, bx, bh * 0.5, (px) => {
          x.fillStyle = css(r() < 0.5 ? M.leaf : M.leafDark);
          x.beginPath();
          x.ellipse(px, b - bh * 0.5, bh * 0.14, bh * 0.5, (r() - 0.5) * 0.8, 0, TAU);
          x.fill();
        });
      }
      for (let i = 0; i < 9; i++) {
        const fx = r() * w;
        const fy = b - h * (0.25 + r() * 0.35);
        wrap(w, fx, 30, (px) => {
          if (i % 3) {
            for (let k = 0; k < 9; k++) {
              const a = (k / 9) * TAU;
              x.fillStyle = css(0xffffff);
              x.beginPath();
              x.ellipse(px + Math.cos(a) * 7, fy + Math.sin(a) * 7, 5, 2.4, a, 0, TAU);
              x.fill();
            }
            x.fillStyle = css(0xffd34a);
            x.beginPath();
            x.arc(px, fy, 3.6, 0, TAU);
            x.fill();
          } else strawberry(x, px, fy + 6, 13);
        });
      }
      x.fillStyle = css(M.leafDark);
      x.fillRect(0, b - 1, w, h);
    });
  },
  board(res, n) {
    return canvas(44, 92, res, (x, w) => {
      x.fillStyle = css(0xffffff);
      x.fillRect(w / 2 - 2, 30, 4, 62);
      x.fillStyle = css(M.pink);
      x.fill(heartPath(w / 2, 20, 24));
      x.fillStyle = css(0xffffff);
      x.font = `17px ${MILK_FONT}`;
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillText(String(n), w / 2, 17);
    });
  },
  gate(g, res) {
    const f = g.f;
    const post = canvas(Math.ceil(f * 0.5), Math.ceil(f * 7.4), res, (x, w, h) => {
      x.fillStyle = grad(x, 0, 0, [[0, 0xffffff]]);
      const gr = x.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, "#ffe3ea");
      gr.addColorStop(0.45, "#ffffff");
      gr.addColorStop(1, "#ffc8d6");
      x.fillStyle = gr;
      x.beginPath();
      x.roundRect(w * 0.1, 0, w * 0.8, h, w * 0.3);
      x.fill();
      for (let y = w; y < h; y += w * 1.1) {
        x.strokeStyle = css(M.pink);
        x.lineWidth = w * 0.18;
        x.beginPath();
        x.moveTo(w * 0.12, y);
        x.lineTo(w * 0.88, y + w * 0.5);
        x.stroke();
      }
    });
    const stake = canvas(Math.ceil(f * 0.16), Math.ceil(f * 2.5), res, (x, w, h) => { x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); });
    const banner = canvas(Math.ceil(f * 10.4), Math.ceil(f * 2.3), res, (x, w, h) => {
      x.fillStyle = css(M.pink);
      x.beginPath();
      x.roundRect(0, h * 0.1, w, h * 0.8, h * 0.4);
      x.fill();
      x.fillStyle = css(0xffffff);
      for (let i = 0; i < w / (h * 0.3); i++) {
        x.beginPath();
        x.arc(i * h * 0.3 + h * 0.15, h * 0.12, h * 0.1, 0, Math.PI);
        x.fill();
        x.beginPath();
        x.arc(i * h * 0.3 + h * 0.15, h * 0.88, h * 0.1, Math.PI, TAU);
        x.fill();
      }
      x.fillStyle = css(0xffffff);
      x.font = `${Math.round(h * 0.42)}px ${MILK_FONT}`;
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillText("FINISH", w / 2 - h * 0.25, h / 2 + 1);
      x.fillStyle = css(M.deep);
      x.fill(heartPath(w / 2 + h * 1.55, h / 2, h * 0.24));
      strawberry(x, h * 0.6, h / 2, h * 0.22);
      strawberry(x, w - h * 0.6, h / 2, h * 0.22);
    });
    const balloons = canvas(110, 150, res, (x) => {
      const spots = [[55, 46, 0xff6f9a], [30, 62, 0xffffff], [80, 60, 0xffb3c7]];
      for (const [bx, by] of spots) {
        x.strokeStyle = "rgba(255,255,255,.8)";
        x.lineWidth = 1;
        x.beginPath();
        x.moveTo(bx, by + 18);
        x.lineTo(55, 148);
        x.stroke();
      }
      for (const [bx, by, c] of spots) {
        x.fillStyle = css(c);
        x.fill(heartPath(bx, by, 26));
        x.fillStyle = css(0xffffff, 0.6);
        x.beginPath();
        x.ellipse(bx - 8, by - 6, 4, 6, -0.5, 0, TAU);
        x.fill();
      }
    });
    return { post, stake, banner, balloons, tape: 0xff4f79 };
  },
  starter(g, res) {
    const f = g.f;
    // A strawberry party popper on a little stool.
    return canvas(Math.ceil(f * 1.6), Math.ceil(f * 2.6), res, (x, w, h) => {
      x.fillStyle = css(0xffffff);
      x.fillRect(w * 0.25, h * 0.62, w * 0.5, h * 0.08);
      x.fillRect(w * 0.3, h * 0.7, w * 0.06, h * 0.3);
      x.fillRect(w * 0.64, h * 0.7, w * 0.06, h * 0.3);
      x.save();
      x.translate(w * 0.5, h * 0.6);
      x.rotate(-0.5);
      x.fillStyle = grad(x, -h * 0.5, 0, [[0, 0xffd34a], [1, 0xffb02e]]);
      x.beginPath();
      x.moveTo(-w * 0.08, 0);
      x.lineTo(-w * 0.28, -h * 0.5);
      x.lineTo(w * 0.28, -h * 0.5);
      x.lineTo(w * 0.08, 0);
      x.fill();
      strawberry(x, 0, -h * 0.5, w * 0.22);
      x.restore();
    });
  },
  sprites(res) {
    return {
      berry: canvas(24, 26, res, (x) => strawberry(x, 12, 14, 10)),
      splash: canvas(20, 28, res, (x) => {
        x.fillStyle = "#fff";
        x.fill(new Path2D("M10 1C10 1 2 13 2 19a8 8 0 0 0 16 0C18 13 10 1 10 1z"));
      }),
    };
  },
};

/* ---------- shared sprites ---------- */

export function sprites(res) {
  const make = (w, h, draw) => canvas(w, h, res, draw);
  return {
    glow: make(64, 64, (x) => glowDot(x, 32, 32, 32, 0xffffff, 1)),
    puff: make(48, 48, (x) => {
      const g = x.createRadialGradient(24, 24, 0, 24, 24, 24);
      g.addColorStop(0, "rgba(255,255,255,.95)");
      g.addColorStop(0.55, "rgba(255,255,255,.55)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = g;
      x.fillRect(0, 0, 48, 48);
    }),
    streak: make(96, 6, (x) => {
      const g = x.createLinearGradient(0, 0, 96, 0);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.7, "rgba(255,255,255,.9)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = g;
      x.fillRect(0, 2, 96, 2);
    }),
    spark: make(32, 32, (x) => {
      x.fillStyle = "#fff";
      x.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const r = i % 2 ? 3 : 16;
        x.lineTo(16 + Math.cos(a) * r, 16 + Math.sin(a) * r);
      }
      x.fill();
    }),
    confetti: make(8, 12, (x) => { x.fillStyle = "#fff"; x.fillRect(0, 0, 8, 12); }),
    pixel: make(2, 2, (x) => { x.fillStyle = "#fff"; x.fillRect(0, 0, 2, 2); }),
    drop: make(16, 22, (x) => {
      x.fillStyle = "#9fd8ff";
      x.fill(new Path2D("M8 1C8 1 2 9 2 14a6 6 0 0 0 12 0C14 9 8 1 8 1z"));
      x.fillStyle = "rgba(255,255,255,.85)";
      x.beginPath();
      x.ellipse(6, 14, 1.6, 2.6, -0.4, 0, TAU);
      x.fill();
    }),
    pixRing: make(32, 32, (x) => { x.fillStyle = "#fff"; x.fillRect(0, 0, 32, 4); x.fillRect(0, 28, 32, 4); x.fillRect(0, 0, 4, 32); x.fillRect(28, 0, 4, 32); }),
    ring: make(96, 96, (x) => { x.strokeStyle = "#fff"; x.lineWidth = 5; x.beginPath(); x.arc(48, 48, 44, 0, TAU); x.stroke(); }),
    heart: make(32, 30, (x) => {
      x.fillStyle = "#fff";
      x.fill(new Path2D("M16 28C6 21 1 15 1 9.2 1 4.6 4.6 1 9 1c3 0 5.6 1.6 7 4.2C17.4 2.6 20 1 23 1c4.4 0 8 3.6 8 8.2C31 15 26 21 16 28z"));
    }),
    rays: make(256, 256, (x) => {
      x.translate(128, 128);
      for (let i = 0; i < 14; i++) {
        x.rotate(TAU / 14);
        const g = x.createLinearGradient(0, 0, 0, -128);
        g.addColorStop(0, "rgba(255,255,255,.5)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        x.fillStyle = g;
        x.beginPath();
        x.moveTo(0, 0);
        x.lineTo(-12, -128);
        x.lineTo(12, -128);
        x.closePath();
        x.fill();
      }
    }),
    shadow: make(64, 24, (x) => {
      const g = x.createRadialGradient(32, 12, 0, 32, 12, 32);
      g.addColorStop(0, "rgba(0,0,0,.6)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      x.setTransform(res, 0, 0, res * 0.375, 0, 0);
      x.fillStyle = g;
      x.fillRect(0, 0, 64, 64);
    }),
  };
}

export const WORLD_ART = { classic, najeon, milk, "8bit": pixel };
