const PETS = { rat: "쥐", ox: "소", tiger: "호랑이", rabbit: "토끼", dragon: "용", snake: "뱀", horse: "말", sheep: "양", monkey: "원숭이", rooster: "닭", dog: "강아지", pig: "돼지" };
const CUPS = { classic: ["노을빛 트랙", "GOLDEN HOUR CUP"], "8bit": ["픽셀 그랑프리", "PIXEL GRAND PRIX"], milk: ["딸기우유 산책길", "STRAWBERRY SPRINT"], najeon: ["달빛 비단길", "MOONLIGHT RACE"] };
// Depth of each band: screen size scales with 1/(d - dolly), so near things grow fastest when the camera pushes in.
const D = { fg: 0.62, near: 0.88, me: 1, split: 1.216, rival: 1.55, back: 1.85, gate: 1.89, props: 2.3, mid: 5, far: 15, clouds: 40 };
const ROWS = 14;
const BEATS = [[0, "준비…"], [0.85, "3"], [1.6, "2"], [2.35, "1"], [3.1, "땅!"]];
// The banner faces the camera behind the far lane; thin stakes at both track edges hold the tape.
const GATE = { post: D.gate, back: D.back + 0.04, front: D.near - 0.02, span: 5.2, low: 5.0, tape: 2.1 };
const HIP = 0.6;
const STARTER_X = -3.4;
const HINT_ART = `<svg viewBox="0 0 40 56" aria-hidden="true"><rect x="6" y="2" width="28" height="52" rx="6" class="h-phone"/><circle cx="20" cy="22" r="7" class="h-spot"/><circle cx="12" cy="9" r="2.2" class="h-cam"/></svg>`;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
const rnd = (a, b) => a + Math.random() * (b - a);
const faceUrl = (kind, face, px) => px ? `/themes/px/${kind}${face === "canon" ? "" : face === "blink" ? "-closed" : "-happy"}-px.png` : `/mascot-${kind}-${face === "canon" ? "512-v3.png" : face === "blink" ? "closed-512.webp" : "happy-512.webp"}`;

async function image(url) {
  const i = new Image();
  i.src = url;
  await i.decode();
  return i;
}

// The drawn part of a 512 px frame, so the rig bends the plush and not its empty margin.
function cropOf(img) {
  const n = 64;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(img, 0, 0, n, n);
  const a = x.getImageData(0, 0, n, n).data;
  let x0 = n, y0 = n, x1 = 0, y1 = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (a[(y * n + x) * 4 + 3] > 24) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); }
  return { u0: x0 / n, v0: y0 / n, u1: x1 / n, v1: y1 / n, aspect: ((x1 - x0) * img.naturalWidth) / ((y1 - y0) * img.naturalHeight) };
}

export async function createRace(api) {
  // A retry's query reaches the parts too: a failed module import stays failed for its URL.
  const v = new URL(import.meta.url).search;
  const [{ RACE, eta, newRace, raceTap, stepRace }, { WORLD_ART, canvas, sprites }] = await Promise.all([import(`./race-model.js${v}`), import(`./race-art.js${v}`)]);
  const P = window.PIXI;
  const FX = P.filters;
  const world = document.documentElement.dataset.theme in CUPS ? document.documentElement.dataset.theme : "classic";
  const px = world === "8bit";
  const art = WORLD_ART[world] || WORLD_ART.classic;
  const look = art.look;
  const kit = px ? "chip" : "soft";
  const [venue, cup] = CUPS[world];
  const sound = (name, gain = 0.7, rate = 1) => api.sfx(`game-${kit}-${name}`, { gain, rate });
  const owned = [];

  /* ---------- shell ---------- */
  const shell = document.createElement("section");
  shell.className = `r-game r-${world}`;
  shell.setAttribute("role", "dialog");
  shell.setAttribute("aria-label", "달리기 시합");
  shell.setAttribute("aria-modal", "true");
  shell.hidden = true;
  shell.innerHTML = `<div class="r-stage"></div>
    <header class="r-top"><p class="r-cup">${cup}</p><button type="button" class="r-close" aria-label="달리기 그만하기">×</button></header>
    <div class="r-hud" aria-hidden="true"><div class="r-strip"><i class="r-fill"></i><span class="r-flag"></span><img class="r-head is-rival" alt=""><img class="r-head is-me" alt=""></div><p class="r-clock"><b>0.00</b><small>초</small></p><p class="r-lv"></p></div>
    <p class="r-tag is-me" aria-hidden="true"></p><p class="r-tag is-rival" aria-hidden="true"></p>
    <p class="r-edge" aria-hidden="true"></p>
    <div class="r-big" aria-live="assertive"></div>
    <p class="r-hint" hidden></p>
    <figure class="r-photo" hidden><div class="r-shot"></div><figcaption><span>사진 판독</span><b></b></figcaption></figure>
    <div class="r-pick" hidden></div>
    <div class="g-result r-card" role="status" hidden></div>`;
  document.body.append(shell);
  const $ = (s) => shell.querySelector(s);
  const big = $(".r-big");
  const clockEl = $(".r-clock b");
  const heads = [$(".r-head.is-me"), $(".r-head.is-rival")];
  const fill = $(".r-fill");
  let stripW = 300;

  /* ---------- textures ---------- */
  let app;
  const faces = {};
  try {
    await Promise.all(["horse", "sheep"].map(async (kind) => {
      const imgs = await Promise.all(["canon", "blink", "react"].map((f) => image(faceUrl(kind, f, px))));
      const tex = imgs.map((i) => {
        const t = P.Texture.from(i);
        if (px) t.source.scaleMode = "nearest";
        owned.push(t);
        return t;
      });
      faces[kind] = { canon: tex[0], blink: tex[1], react: tex[2], crop: cropOf(imgs[0]), texels: imgs[0].naturalHeight, url: faceUrl(kind, "canon", px) };
    }));
    app = new P.Application();
    await app.init({ width: 393, height: 700, resolution: px ? 0.5 : Math.min(2, devicePixelRatio || 1), autoDensity: true, antialias: !px, preference: "webgl", roundPixels: px, autoStart: false, background: 0x000000 });
  } catch (error) {
    owned.forEach((t) => t.destroy(true));
    if (app?.renderer) app.destroy(true);
    shell.remove();
    throw error;
  }
  app.ticker.stop();
  $(".r-stage").append(app.canvas);
  let S = null;
  let built = "";
  // Painted canvases carry their own pixels-per-CSS-pixel, so 8-bit's half-size art lands 1:1 on its grid.
  const tex = (c, nearest = px, wrap = false) => {
    const t = new P.Texture({ source: new P.CanvasSource({ resource: c, resolution: c.res ?? 1 }) });
    if (nearest) t.source.scaleMode = "nearest";
    if (wrap) { t.source.style.addressModeU = "repeat"; t.source.style.addressModeV = wrap === "both" ? "repeat" : "clamp-to-edge"; }
    (S?.tex || owned).push(t);
    return t;
  };
  const T = {};
  const fxRes = px ? 1 : 2;
  for (const [k, c] of Object.entries({ ...sprites(fxRes), ...art.sprites?.(fxRes) })) T[k] = Array.isArray(c) ? c.map((one) => tex(one)) : tex(c);

  /* ---------- layout and camera ---------- */
  let W = 393;
  let H = 700;
  const L = {};
  const cam = { x: 0, vx: 0, dz: 0, dzv: 0, roll: 0, rv: 0, shake: 0, lift: 0, liftV: 0, zoom: 1, vp: 0.62, run: 0.4 };
  // 8-bit is a flat side-scroller: lanes scroll as one plane, the far lane steps right, the camera pans instead of craning.
  const flat = (d) => px && d >= 0.8 && d < D.props;
  const shear = (d) => (px ? (1 - 1 / d) * L.ch * L.f * 0.36 : 0);
  const sOf = (d) => (flat(d) ? L.f : px ? L.f / d : (L.f * cam.zoom) / Math.max(0.12, d - cam.dz));
  const X = (x, d) => W * cam.vp + (x - cam.x) * sOf(d) + shear(d);
  const Y = (d, h = 0) => (px ? L.hy + (L.ch * L.f) / d - cam.lift * L.f - h * sOf(d) : L.hy + (L.ch - h - cam.lift) * sOf(d));
  const Y0 = (d) => L.hy + L.ch * L.f / d;
  // The camera sits ahead of the pair, so lines across the track always lean like a 3/4 view.
  const lens = () => ((cam.vp - cam.run) * W) / L.f;

  function measure() {
    W = shell.clientWidth || 393;
    H = shell.clientHeight || 700;
    L.f = W / 11;
    L.hy = H * 0.33;
    L.ch = (H * 0.46) / L.f;
    const crop = faces.horse.crop;
    L.size = px ? (crop.v1 - crop.v0) * faces.horse.texels * 2 / L.f : Math.min(H * 0.16, W * 0.36) / L.f;
    L.over = Math.ceil(W * 0.08);
  }

  /* ---------- scene ---------- */
  const root = new P.Container();
  const overlay = new P.Container();
  app.stage.addChild(root, overlay);

  function layer(canvasEl, d, base, h) {
    const t = tex(canvasEl, px, true);
    const tile = new P.TilingSprite({ texture: t, width: W + 2 * L.over, height: h });
    return { tile, d, base, h, s0: L.f / d };
  }

  function quad(texture, cols, rows) {
    const n = cols * rows;
    const idx = [];
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i;
      idx.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
    }
    const geometry = new P.MeshGeometry({ positions: new Float32Array(n * 2), uvs: new Float32Array(n * 2), indices: new Uint32Array(idx) });
    const mesh = new P.Mesh({ geometry, texture });
    return { mesh, geometry, pos: geometry.getBuffer("aPosition"), uv: geometry.getBuffer("aUV"), cols, rows };
  }

  function build() {
    measure();
    const key = `${W}x${H}`;
    if (built === key) return;
    teardownScene();
    built = key;
    const res = px ? 0.5 : Math.min(2, devicePixelRatio || 1);
    const g = { W, H, res, f: L.f, hy: L.hy, ch: L.ch, D, over: L.over, Y: Y0 };
    S = { layers: [], tex: [] };
    app.renderer.background.color = look.base;
    S.sky = new P.Sprite(tex(art.sky(g, res)));
    S.sky.position.set(-L.over, -L.over);
    S.sky.width = W + 2 * L.over;
    S.sky.height = H + 2 * L.over;
    root.addChild(S.sky);
    S.discs = (art.discs || []).map((o) => {
      const glow = new P.Sprite(T.glow);
      glow.tint = o.glow;
      glow.blendMode = px ? "normal" : "add";
      const rays = new P.Sprite(T.rays);
      rays.tint = o.glow;
      rays.blendMode = "add";
      rays.visible = !px && Boolean(o.rays);
      const face = new P.Sprite(tex(o.paint ? o.paint(2) : canvas(64, 64, 2, (x) => {
        const gr = x.createRadialGradient(32, 26, 2, 32, 32, 32);
        gr.addColorStop(0, `#${o.core.toString(16).padStart(6, "0")}`);
        gr.addColorStop(1, `#${o.edge.toString(16).padStart(6, "0")}`);
        x.fillStyle = gr;
        x.beginPath();
        x.arc(32, 32, 31, 0, TAU);
        x.fill();
      })));
      for (const s of [glow, rays, face]) s.anchor.set(0.5);
      root.addChild(glow, rays, face);
      return { o, glow, rays, face };
    });
    if (art.clouds) {
      const c = art.clouds(g, res);
      S.clouds = layer(c, D.clouds, 0, c.height / c.res);
      S.clouds.y = H * 0.08;
      root.addChild(S.clouds.tile);
    }
    S.skyFx = new P.Container();
    root.addChild(S.skyFx);
    const band = (d, up, down) => {
      const top = Y0(d) - H * up;
      return { w: Math.round(W * 1.7), h: Math.round(H * (up + down)), base: Y0(d) - top };
    };
    for (const [name, up, down] of [["far", 0.18, 0.09], ["mid", 0.1, 0.13], ["props", 0.105, 0.06]]) {
      const B = band(D[name], ...(art.bands?.[name] || [up, down]));
      const two = name === "props" || look.shimmer;
      const made = two ? [art[name](g, res, B, 0), art[name](g, res, B, 1)] : [art[name](g, res, B)];
      const lay = layer(made[0], D[name], B.base, B.h);
      S[name] = lay;
      S.layers.push(lay);
      root.addChild(lay.tile);
      if (made[1] && name === "props") lay.frames = [lay.tile.texture, tex(made[1], px, true)];
      // Mother-of-pearl: a second palette fades in and out over the first as the camera travels.
      else if (made[1]) root.addChild((lay.sheen = new P.TilingSprite({ texture: tex(made[1], px, true), width: W + 2 * L.over, height: B.h })));
    }
    // Ground: one perspective mesh from the stands to below the screen, texture columns in metres.
    const far = D.props;
    const near = 0.6;
    const gh = Y0(near) - Y0(far);
    const period = 8;
    const gw = Math.round(period * L.f / near);
    const G = { w: gw, h: Math.round(gh), period, row: (d) => Y0(d) - Y0(far), thick: (d, m) => L.ch * L.f * (m / 3.4) / (d * d) };
    const groundTex = tex(art.ground(g, res, G), px, true);
    // Texture rows are base-camera screen rows; past the near edge the last row clamps for the crane shot.
    S.groundRows = [...Array.from({ length: 72 }, (_, j) => (L.ch * L.f) / (Y0(far) + (gh * j) / 71 - L.hy)), 0.56, 0.52, 0.48, 0.44, 0.4, 0.36, 0.32, 0.28, 0.25, 0.22, 0.2].map((d) => ({ d, v: (Y0(d) - Y0(far)) / gh }));
    S.ground = quad(groundTex, 2, S.groundRows.length);
    S.groundPeriod = period;
    // Under the ground's near edge (the picker's crane lifts it on short screens) the world's base shows, not the sky.
    S.floor = new P.Sprite(P.Texture.WHITE);
    S.floor.tint = look.base;
    root.addChild(S.floor, S.ground.mesh);
    const white = tex(canvas(4, 4, 1, (x) => { x.fillStyle = "#fff"; x.fillRect(0, 0, 4, 4); }), false);
    S.startLine = quad(white, 2, 8);
    S.startLine.mesh.tint = look.line;
    S.startLine.mesh.alpha = 0.95;
    const checker = tex(canvas(16, 16, 1, (x) => { x.fillStyle = "#fff"; x.fillRect(0, 0, 16, 16); x.fillStyle = "#1b1d2a"; x.fillRect(0, 0, 8, 8); x.fillRect(8, 8, 8, 8); }), true, "both");
    S.finishLine = quad(checker, 2, 10);
    root.addChild(S.startLine.mesh, S.finishLine.mesh);
    S.back = new P.Container();
    S.lanes = [new P.Container(), new P.Container()];
    S.front = new P.Container();
    root.addChild(S.back, S.lanes[1], S.lanes[0], S.front);
    const sprite = (c, layerC, ax = 0.5, ay = 1) => {
      const sp = new P.Sprite(tex(c));
      sp.anchor.set(ax, ay);
      layerC.addChild(sp);
      return sp;
    };
    S.boards = [];
    for (let m = 10; m < RACE.meters; m += 10) S.boards.push({ m, sp: sprite(art.board(res, m), S.back) });
    S.starter = sprite(art.starter(g, res), S.back);
    const gate = art.gate(g, res);
    S.posts = [sprite(gate.post, S.back), sprite(gate.post, S.back)];
    S.banner = sprite(gate.banner, S.back);
    S.balloons = [sprite(gate.balloons, S.back), sprite(gate.balloons, S.back)];
    S.stakes = [sprite(gate.stake, S.back), sprite(gate.stake, S.front)];
    S.tape = new P.Graphics();
    S.front.addChildAt(S.tape, 0);
    S.tapeColor = gate.tape;
    const fgB = { w: Math.round(W * 1.5), h: Math.round(H * 0.2), base: Math.round(H * 0.2) - 2 };
    S.fg = layer(art.fg(g, res, fgB), D.fg, fgB.base, fgB.h);
    if (look.starter === "flag") {
      S.flag = new P.Sprite(T.flag[0]);
      S.flag.anchor.set(0.2, 1);
      S.back.addChild(S.flag);
    }
    root.addChild(S.fg.tile);
    S.blur = px ? null : new FX.MotionBlurFilter({ velocity: { x: 0, y: 0 }, kernelSize: 7 });
    S.zoom = px ? null : new FX.ZoomBlurFilter({ strength: 0, innerRadius: W * 0.18, radius: -1 });
    S.vignette = new P.Sprite(tex(canvas(64, 128, 1, (x) => {
      const gr = x.createRadialGradient(32, 60, 10, 32, 64, 80);
      gr.addColorStop(0.55, "rgba(0,0,0,0)");
      gr.addColorStop(1, `rgba(${look.shadow >> 16},${(look.shadow >> 8) & 255},${look.shadow & 255},.55)`);
      x.fillStyle = gr;
      x.fillRect(0, 0, 64, 128);
    }), false));
    S.vignette.width = W;
    S.vignette.height = H;
    S.flash = new P.Sprite(P.Texture.WHITE);
    S.flash.width = W;
    S.flash.height = H;
    S.flash.alpha = 0;
    S.flash.tint = look.flash;
    S.fxTop = new P.Container();
    overlay.addChild(S.fxTop, S.vignette, S.flash);
    S.lines = new P.Graphics();
    S.front.addChild(S.lines);
    for (const r of runners) attach(r);
    warm();
  }

  // One throwaway frame with every filter on and every texture drawn, so nothing compiles or uploads mid-race.
  function warm() {
    const bin = new P.Container();
    for (const t of [...Object.values(T).flat(), ...Object.values(faces).flatMap((f) => [f.canon, f.blink, f.react])]) {
      const s = new P.Sprite(t);
      s.alpha = 0.01;
      s.position.set(-400, -400);
      bin.addChild(s);
    }
    app.stage.addChild(bin);
    const shock = S.zoom ? new FX.ShockwaveFilter({ center: { x: W / 2, y: H / 2 }, amplitude: 1, wavelength: 50, radius: 10 }) : null;
    root.filters = S.zoom ? [S.zoom, shock] : null;
    S.fg.tile.filters = S.blur ? [S.blur] : null;
    app.renderer.render(app.stage);
    root.filters = null;
    S.fg.tile.filters = null;
    shock?.destroy();
    bin.destroy();
  }

  function teardownScene() {
    if (!S) return;
    for (const p of parts.splice(0)) p.s.destroy();
    for (const s of pool.splice(0)) s.destroy();
    for (const r of runners) detach(r);
    for (const c of [...root.children, ...overlay.children]) c.destroy({ children: true });
    root.filters = null;
    S.blur?.destroy();
    S.zoom?.destroy();
    S.shock?.destroy();
    for (const t of S.tex) t.destroy(true);
    S = null;
    built = "";
  }

  /* ---------- runners ---------- */
  function makeRunner(id) {
    return { id, kind: "horse", d: id ? D.rival : D.me, phase: 0.3, contact: false, tipX: 0, theta: 0, thetaTo: 0, thetaV: 0, lastTheta: 0, sq: 0, sqv: 0, lean: 0, leanV: 0, bend: 0, bendV: 0, hipH: 0, airH: 0, glide: 0, face: "canon", blinkAt: rnd(1, 3), react: 0, flip: 0, mood: "idle", trail: [], x: 0, pose: 0, catchup: 0 };
  }
  const runners = [makeRunner(0), makeRunner(1)];

  function attach(r) {
    r.face = "canon";
    r.shadow = new P.Sprite(T.shadow);
    r.shadow.anchor.set(0.5);
    r.shadow.tint = look.shadow;
    r.body = quad(faces[r.kind].canon, 2, ROWS);
    r.ghosts = [0, 1, 2, 3].map(() => {
      const q = quad(faces[r.kind].react, 2, ROWS);
      q.mesh.visible = false;
      q.mesh.tint = look.ghost;
      return q;
    });
    const c = faces[r.kind].crop;
    for (const q of [r.body, ...r.ghosts]) {
      const uv = q.uv.data;
      for (let k = 0; k < ROWS; k++) {
        const v = lerp(c.v0, c.v1, k / (ROWS - 1));
        uv.set([c.u0, v, c.u1, v], k * 4);
      }
      q.uv.update();
    }
    S.lanes[r.id].addChild(r.shadow, ...r.ghosts.map((q) => q.mesh), r.body.mesh);
  }
  function detach(r) {
    r.body = null;
    r.ghosts = [];
  }

  // A pogo hop on the key shaft: the tip plants and the hip vaults over it, the head leans and squashes,
  // the shaft trails its swing; past top speed the hops flatten into a glide.
  function gait(r, v, dt, mode) {
    const Hm = L.size;
    const leg = Hm * (1 - HIP);
    const dash = mode === "dash" ? 1 : 0;
    r.glide += (clamp(smooth((v - 12.5) / 3.5) + dash, 0, 1) - r.glide) * (1 - Math.exp(-dt * 7));
    const gl = r.glide;
    let hipH = leg;
    let theta = 0;
    let lean = 0;
    let sqGoal = 0;
    let touch = false;
    if (mode === "run" || mode === "dash") {
      const hz = 1.9 + 0.17 * v;
      const c = 0.26;
      const before = r.phase;
      r.phase += hz * dt;
      const half = Math.min(0.85, (v * c) / hz / 2 / leg);
      const reach = Math.asin(half);
      if (r.phase >= 1) {
        r.phase %= 1;
        r.contact = true;
        r.tipX = r.x + leg * Math.sin(reach);
        touch = true;
      }
      if (before < c && r.phase >= c) { r.contact = false; r.thetaTo = r.theta; r.sqv -= 6.5 * (1 - gl); }
      const amp = Hm * 0.36 * (1 - gl) * clamp(v / 7, 0.35, 1.15);
      if (r.phase < c && r.contact) {
        theta = Math.asin(clamp((r.tipX - r.x) / leg, -0.95, 0.95));
        hipH = leg * Math.cos(theta) * (1 - 0.1 * Math.sin((Math.PI * r.phase) / c));
        sqGoal = 0.1;
      } else {
        const u = clamp((r.phase - c) / (1 - c), 0, 1);
        const e = u * u * (3 - 2 * u);
        theta = lerp(r.contact ? -reach : r.thetaTo, reach, e) - 0.95 * Math.sin(Math.PI * u) * reach;
        hipH = leg * Math.cos(theta) + amp * 4 * u * (1 - u);
        lean = -0.1 * (1 - 2 * u) * (1 - gl);
      }
      const hover = leg * 0.86 + Hm * 0.09 + Math.sin(r.x * 2.3) * Hm * 0.02;
      hipH = lerp(hipH, hover, gl);
      theta = lerp(theta, -0.62, gl);
      lean += 0.07 + 0.019 * v + gl * 0.14;
    } else if (mode === "crouch") {
      sqGoal = 0.2;
      hipH = leg * 0.9;
      lean = -0.08 + Math.sin(clock * 31) * 0.035;
      theta = 0.05;
    } else if (mode === "win") {
      r.phase += dt * 1.8;
      if (r.phase >= 1) { r.phase %= 1; touch = true; r.flip = r.flip ? 0 : 1; }
      const u = r.phase;
      const air = u > 0.25 ? (u - 0.25) / 0.75 : 0;
      hipH = leg + Hm * 0.5 * 4 * air * (1 - air);
      sqGoal = u < 0.25 ? 0.15 : 0;
      lean = Math.sin(u * TAU) * 0.06;
    } else if (mode === "tired") {
      sqGoal = 0.08 + Math.sin(clock * 20) * 0.05;
      hipH = leg * 0.96;
      lean = 0.16;
      theta = -0.05;
    } else {
      sqGoal = 0.02 + Math.sin(clock * 3.4 + r.id) * 0.025;
      lean = Math.sin(clock * 1.7 + r.id * 2) * 0.03;
      r.pose += dt;
      if (r.pose > 2.6 + r.id) {
        const k = (r.pose - 2.6 - r.id) / 0.5;
        hipH = leg + Hm * 0.18 * Math.sin(Math.PI * Math.min(1, k));
        if (k >= 1) { r.pose = 0; touch = true; }
      }
    }
    if (touch) {
      r.sqv += 7 * (1 - gl);
      if (mode !== "dash") r.land = true;
    }
    r.thetaV = (theta - r.lastTheta) / Math.max(dt, 1e-4);
    r.lastTheta = theta;
    r.theta = theta;
    r.hipH = hipH;
    r.sqv += (300 * (sqGoal - r.sq) - 15 * r.sqv) * dt;
    r.sq = clamp(r.sq + r.sqv * dt, -0.22, 0.3);
    r.leanV += (160 * (lean - r.lean) - 13 * r.leanV) * dt;
    r.lean += r.leanV * dt;
    const bendGoal = clamp(r.thetaV * 0.09, -0.6, 0.6) + gl * 0.38 + (gl ? Math.sin(clock * 37 + r.id) * 0.06 * gl : 0);
    r.bendV += (220 * (bendGoal - r.bend) - 15 * r.bendV) * dt;
    r.bend += r.bendV * dt;
  }

  function pose(r, q, alpha = 1, shift = 0) {
    const s = sOf(r.d);
    const Hm = L.size;
    const size = Hm * s;
    const w = size * faces[r.kind].crop.aspect;
    const hx = X(r.x - shift, r.d);
    const hy = Y(r.d, r.hipH);
    const sy = 1 - r.sq;
    const sx = 1 + r.sq * 0.75;
    const legScale = 1 - Math.max(0, r.sq) * 0.35;
    const p = q.pos.data;
    const ang = (v) => {
      if (v <= HIP - 0.1) return r.lean;
      const leg = -r.theta + r.bend * ((v - HIP) / (1 - HIP)) ** 2;
      return lerp(r.lean, leg, smooth((v - HIP + 0.1) / 0.22));
    };
    const hipRow = HIP * (ROWS - 1);
    const at = [];
    // Walk up from the hip for the head, down for the shaft, each row turned by its own angle.
    let cx = hx;
    let cy = hy;
    for (let k = Math.floor(hipRow); k >= 0; k--) {
      const v0 = k === Math.floor(hipRow) ? HIP : (k + 1) / (ROWS - 1);
      const v = k / (ROWS - 1);
      const a = ang(v);
      const step = (v0 - v) * size * sy;
      cx += Math.sin(a) * step;
      cy -= Math.cos(a) * step;
      at[k] = [cx, cy, a, sx];
    }
    cx = hx;
    cy = hy;
    for (let k = Math.floor(hipRow) + 1; k < ROWS; k++) {
      const v0 = k === Math.floor(hipRow) + 1 ? HIP : (k - 1) / (ROWS - 1);
      const v = k / (ROWS - 1);
      const a = ang(v);
      const step = (v - v0) * size * legScale;
      cx -= Math.sin(a) * step;
      cy += Math.cos(a) * step;
      at[k] = [cx, cy, a, 1 / Math.sqrt(legScale)];
    }
    let spin = 0;
    let pivot = null;
    if (r.flip && r.mood === "win") {
      const u = r.phase > 0.25 ? (r.phase - 0.25) / 0.75 : 0;
      spin = TAU * (u * u * (3 - 2 * u));
      pivot = at[Math.round(hipRow * 0.55)];
    }
    for (let k = 0; k < ROWS; k++) {
      let [x, y, a, wide] = at[k];
      const hw = (w / 2) * wide;
      let lx = x - Math.cos(a) * hw;
      let ly = y - Math.sin(a) * hw;
      let rx = x + Math.cos(a) * hw;
      let ry = y + Math.sin(a) * hw;
      if (spin) {
        const c = Math.cos(spin);
        const n = Math.sin(spin);
        const [ox, oy] = pivot;
        [lx, ly] = [ox + (lx - ox) * c - (ly - oy) * n, oy + (lx - ox) * n + (ly - oy) * c];
        [rx, ry] = [ox + (rx - ox) * c - (ry - oy) * n, oy + (rx - ox) * n + (ry - oy) * c];
      }
      p[k * 4] = lx;
      p[k * 4 + 1] = ly;
      p[k * 4 + 2] = rx;
      p[k * 4 + 3] = ry;
    }
    q.pos.update();
    q.mesh.alpha = alpha;
    if (q === r.body) {
      const gy = Y(r.d);
      r.shadow.position.set(X(r.x, r.d) + size * 0.04, gy);
      const lift = clamp((r.hipH - Hm * (1 - HIP)) / Hm, 0, 1);
      r.shadow.width = size * 0.62 * (1 - lift * 0.45);
      r.shadow.height = size * 0.13 * (1 - lift * 0.3);
      r.shadow.alpha = 0.55 * (1 - lift * 0.6);
      r.tip = [at[ROWS - 1][0], at[ROWS - 1][1]];
      r.head = [at[0][0], at[0][1]];
    }
  }

  function faceFor(r, dt) {
    r.blinkAt -= dt;
    if (r.blinkAt < -0.12) r.blinkAt = rnd(2.2, 4.6);
    r.react = Math.max(0, r.react - dt);
    const f = r.mood === "win" || r.react > 0 || r.glide > 0.6 ? "react" : r.mood === "tired" || r.blinkAt < 0 ? "blink" : "canon";
    if (f !== r.face) { r.face = f; r.body.mesh.texture = faces[r.kind][f]; }
  }

  /* ---------- particles ---------- */
  const parts = [];
  const pool = [];
  function emit(texture, o) {
    const s = pool.pop() || new P.Sprite(texture);
    s.texture = texture;
    s.anchor.set(0.5);
    s.blendMode = o.blend || "normal";
    s.tint = o.tint ?? 0xffffff;
    s.rotation = o.rot || 0;
    s.visible = true;
    (o.layer || S.fxTop).addChild(s);
    const p = { s, x: o.x, y: o.y, h: o.h || 0, d: o.d, vx: o.vx || 0, vy: o.vy || 0, vh: o.vh || 0, ay: o.ay || 0, g: o.g || 0, drag: o.drag || 0, life: o.life || 1, age: 0, s0: o.s0 ?? 1, s1: o.s1 ?? 0, a0: o.a0 ?? 1, a1: o.a1 ?? 0, spin: o.spin || 0, sx: o.sx || 1, flutter: o.flutter || 0, slow: o.slow ?? true, frames: o.frames, fps: o.fps || 8, align: o.align, twinkle: o.twinkle, trail: o.trail };
    parts.push(p);
    return p;
  }
  function stepParts(dt, wdt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      const t = p.slow ? wdt : dt;
      p.age += t;
      const k = p.age / p.life;
      if (k >= 1) { p.done?.(); p.s.visible = false; p.s.removeFromParent(); pool.push(p.s); parts.splice(i, 1); continue; }
      const drag = Math.pow(1 - p.drag, t * 60);
      p.vx *= drag;
      p.vy = p.vy * drag + p.ay * t;
      p.vh = p.vh * drag - p.g * t;
      p.x += p.vx * t;
      p.y += p.vy * t;
      p.h = Math.max(0, p.h + p.vh * t);
      if (p.frames) p.s.texture = p.frames[Math.floor(p.age * p.fps) % p.frames.length];
      const sc = lerp(p.s0, p.s1, k);
      if (p.d) {
        const s = sOf(p.d) / L.f;
        p.s.position.set(X(p.x, p.d), Y(p.d, p.h));
        p.s.scale.set(sc * s * p.sx, sc * s);
      } else {
        p.s.position.set(p.x + (p.flutter ? Math.sin(p.age * 5 + p.flutter) * 12 : 0), p.y);
        p.s.scale.set(sc * p.sx * (p.flutter ? Math.abs(Math.cos(p.age * 7 + p.flutter)) : 1), sc);
      }
      p.s.rotation += p.spin * t;
      if (p.align) {
        p.s.rotation = Math.atan2(p.vy, p.vx);
        p.s.scale.x *= 0.6 + Math.hypot(p.vx, p.vy) / 260;
      }
      if (p.trail && Math.random() < 0.7) emit(T.glow, { layer: p.s.parent, x: p.s.x, y: p.s.y, life: 0.3, s0: 0.1, s1: 0.02, a0: 0.8, a1: 0, tint: 0xffd98a, blend: "add", slow: false });
      p.s.alpha = lerp(p.a0, p.a1, k) * (p.twinkle && k > 0.4 ? 0.4 + 0.6 * Math.abs(Math.sin(p.age * 31 + i)) : 1);
      if (px) { p.s.x = Math.round(p.s.x / 2) * 2; p.s.y = Math.round(p.s.y / 2) * 2; }
    }
  }
  // Puffs and grit kicked back off the planted tip.
  function dust(r, n, power) {
    const x = r.tipX ? Math.min(r.tipX, r.x + 0.4) : r.x;
    for (let i = 0; i < n; i++) {
      emit(T.puff, { layer: S.lanes[r.id], d: r.d + rnd(-0.02, 0.04), x: x - rnd(0, 0.3), h: rnd(0, 0.1), vx: -rnd(0.6, 2.2) * power, vh: rnd(0.4, 1.2) * power, drag: 0.07, life: rnd(0.35, 0.65), s0: rnd(0.1, 0.16) * power, s1: rnd(0.32, 0.5) * power, a0: 0.5, a1: 0, tint: look.dust });
    }
    for (let i = 0; i < n; i++) {
      emit(T.pixel, { layer: S.lanes[r.id], d: r.d, x: x - rnd(0, 0.2), h: 0.05, vx: -rnd(1.5, 4) * power, vh: rnd(1.5, 3.5), g: 16, drag: 0.02, life: rnd(0.3, 0.45), s0: px ? 1 : rnd(1.2, 2), s1: px ? 1 : 0.6, a0: 0.9, a1: 0.2, tint: look.grit ?? look.dust });
    }
  }

  /* ---------- state ---------- */
  let phase = "idle";
  let mode = "screen";
  let still = false;
  let state = {};
  let own = "horse";
  let rival = "sheep";
  let level = 1;
  // The pet's 민첩 bonus in percent, read as the picker opens.
  let agi = 0;
  let model = null;
  let resolve = null;
  let raf = 0;
  let last = 0;
  let clock = 0;
  let phaseAt = 0;
  let scale = 1;
  let slowUntil = 0;
  let leader = null;
  let leadAt = -9;
  let spurt = false;
  let photo = null;
  let result = null;
  let saved = null;
  let generation = 0;
  let lowFx = false;
  let samples = [];
  let beat = 0;
  let tape = null;
  let party = null;
  let flexAt = 0;
  let drumHit = 0;
  let quick = false;
  const timers = new Set();
  let sweatAt = 0;
  let punch = 0;
  const confettiTex = (i) => (px ? T.pixel : world === "milk" && i % 3 === 0 ? T.heart : T.confetti);
  let hintSeen = false;
  try { hintSeen = localStorage.getItem("pokkey-race-hint") === "1"; } catch {}

  function say(text, cls = "") {
    big.textContent = text;
    big.className = `r-big ${cls}`;
    big.getAnimations().forEach((a) => a.cancel());
    const pop = px ? "steps(3)" : "cubic-bezier(.2,1.5,.4,1)";
    const frames = still ? [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.82 }, { opacity: 0 }]
      : [{ transform: "scale(.2) rotate(-12deg)", opacity: 0, easing: pop }, { transform: "scale(1) rotate(-4deg)", opacity: 1, offset: 0.24, easing: "linear" }, { transform: "scale(1.04) rotate(-4deg)", opacity: 1, offset: 0.8, easing: px ? "steps(2)" : "cubic-bezier(.5,0,.9,.5)" }, { transform: "scale(1.5) rotate(-4deg)", opacity: 0 }];
    big.animate(frames, { duration: cls === "is-count" ? 720 : cls === "is-go" ? 900 : 1150, fill: "forwards" });
  }

  function setPhase(p) {
    phase = p;
    phaseAt = clock;
    shell.dataset.phase = p;
  }

  function kinds() {
    for (const r of runners) {
      const k = r.id ? rival : own;
      if (r.kind !== k) {
        r.kind = k;
        if (S) { r.shadow.destroy(); r.body.mesh.destroy(); r.ghosts.forEach((q) => q.mesh.destroy()); attach(r); }
      }
    }
  }

  function placeAtStart() {
    runners.forEach((r) => {
      r.x = -1.1;
      r.phase = 0.3 + r.id * 0.35;
      r.glide = 0;
      r.sq = 0;
      r.sqv = 0;
      r.mood = "idle";
      r.react = 0;
      r.catchup = 0;
      r.trail.length = 0;
    });
    cam.vp = 0.88;
    cam.run = 0.3;
    cam.x = -1.1 + lens();
    cam.vx = 0;
    cam.dz = -0.12;
    cam.dzv = 0;
    cam.roll = 0;
    cam.rv = 0;
    cam.liftV = 0;
  }

  function pick(again = false) {
    setPhase("pick");
    quick = again;
    model = null;
    result = null;
    photo = null;
    level = state[rival]?.level || 1;
    kinds();
    placeAtStart();
    $(".r-hud").hidden = true;
    $(".r-card").hidden = true;
    $(".r-photo").hidden = true;
    $(".r-hint").hidden = true;
    big.textContent = "";
    const best = state[rival]?.best || 0;
    agi = Math.max(0, Number(api.bonus?.("agi")) || 0);
    $(".r-pick").innerHTML = `<p class="r-eyebrow">${venue}</p><h2>달리기 시합</h2>
      <ul class="r-roster">${Object.keys(PETS).filter((p) => p !== own).map((p) => `<li class="${p === rival ? "is-open" : "is-locked"}"><img src="/game/art/race/${p}.webp" alt=""><b>${PETS[p]}</b><small>${p === rival ? `Lv.${level}` : "곧 만나요"}</small></li>`).join("")}</ul>
      <p class="r-versus"><b>${PETS[rival]} 친구</b><span>Lv.${level}</span><small>${best ? `최고 기록 Lv.${best} 승리` : "첫 승리를 기다려요"}</small></p>
      ${agi > 0 ? `<p class="r-bonus">민첩 +${agi >= 1 ? Math.round(agi) : agi}%</p>` : ""}
      <button type="button" class="r-go">시작</button>`;
    $(".r-pick").getAnimations().forEach((a) => a.cancel());
    $(".r-pick").style.pointerEvents = "";
    $(".r-pick").hidden = false;
    cam.lift = crane();
    if (!again) motion($(".r-pick"), [{ transform: "translateY(115%)" }, { transform: "none" }], 520, 140);
    $(".r-edge").hidden = true;
    $(".r-tag.is-me").textContent = "나";
    $(".r-tag.is-rival").textContent = `${PETS[rival]} Lv.${level}`;
    $(".r-tag.is-rival").classList.remove("is-flex");
    $(".r-pick .r-go").focus({ preventScroll: true });
  }

  function start() {
    if (phase !== "pick") return;
    setPhase("count");
    beat = 0;
    tape = null;
    party = null;
    flexAt = 0;
    if (S?.flag) S.flag.texture = T.flag[0];
    model = newRace(level, agi);
    leader = null;
    leadAt = -9;
    spurt = false;
    scale = 1;
    slowUntil = 0;
    samples = [];
    // The picker drops away while the HUD slides in from the top.
    const sheet = $(".r-pick");
    if (quick) sheet.hidden = true;
    else {
      sheet.style.pointerEvents = "none";
      sheet.animate(still ? [{ opacity: 1 }, { opacity: 0 }] : [{ transform: "none" }, { transform: "translateY(115%)" }], { duration: still ? 140 : 300, easing: "cubic-bezier(.5,0,.8,.4)", fill: "forwards" });
      after(320, () => { if (phase !== "pick") sheet.hidden = true; });
    }
    $(".r-hud").hidden = false;
    motion($(".r-hud"), [{ transform: "translateY(-46px)", opacity: 0 }, { transform: "none", opacity: 1 }], 520, 120);
    stripW = $(".r-strip").clientWidth;
    $(".r-lv").textContent = `${PETS[rival]} Lv.${level}`;
    $(".r-head.is-me").src = faces[own].url;
    $(".r-head.is-rival").src = faces[rival].url;
    if (!hintSeen) {
      const fine = matchMedia("(pointer: fine)").matches;
      $(".r-hint").innerHTML = mode === "nfc" ? `${HINT_ART}화면을 톡톡! 인형을 톡 하면 부스터!` : `화면을 톡톡 눌러서 달려요!${fine ? " 스페이스바도 돼요" : ""}`;
      $(".r-hint").getAnimations().forEach((a) => a.cancel());
      $(".r-hint").hidden = false;
      hintSeen = true;
      try { localStorage.setItem("pokkey-race-hint", "1"); } catch {}
    }
    $(".r-close").focus({ preventScroll: true });
  }

  function countdown() {
    const age = clock - phaseAt;
    while (beat < BEATS.length && age >= BEATS[beat][0]) {
      const text = BEATS[beat++][1];
      if (text === "땅!") go();
      else {
        say(text, text === "준비…" ? "is-ready" : "is-count");
        if (text !== "준비…") { sound("count", 0.8); api.buzz(8); cam.dzv += 0.25; runners.forEach((r) => { r.sqv += 2.5; }); }
      }
    }
  }

  function go() {
    say("땅!", "is-go");
    sound("go", 0.9);
    api.buzz([20, 40, 20]);
    setPhase("run");
    runners.forEach((r) => { r.sqv -= 7; r.phase = 0.26; r.contact = false; r.thetaTo = 0; r.react = 0.5; });
    cam.shake = 7;
    cam.dzv -= 0.9;
    const m = samples.sort((a, b) => a - b);
    if (m.length > 8 && m[Math.floor(m.length / 2)] > 22) degrade();
    starter();
  }

  function starter() {
    sound(look.starter === "drum" ? "race-drum" : "race-pop", 0.9);
    if (look.starter === "drum") drum();
    else if (look.starter === "flag") flagDrop();
    else if (look.starter === "popper") popper();
    else pistol();
    for (const r of runners) dust(r, 8, 1.5);
  }

  // A pixel flag snaps down with a two-frame drop and a burst of pixels.
  function flagDrop() {
    S.flag.texture = T.flag[1];
    const d = D.back + 0.3;
    for (let i = 0; i < 18; i++) {
      const a = rnd(0, TAU);
      emit(T.pixel, { layer: S.back, d, x: STARTER_X + 0.4, h: 3, vx: Math.cos(a) * rnd(2, 6), vh: Math.sin(a) * rnd(2, 6) + 2, g: 10, life: rnd(0.5, 0.9), s0: 2, s1: 2, a0: 1, a1: 1, tint: look.confetti[i % look.confetti.length] });
    }
    emit(T.pixRing, { layer: S.back, d, x: STARTER_X + 0.4, h: 3, life: 0.4, s0: 0.5, s1: 2.6, a0: 1, a1: 0, tint: look.accent });
  }

  // The strawberry popper bangs: hearts, ribbons and berries spray over the line.
  function popper() {
    const d = D.back + 0.3;
    const x = STARTER_X + 0.3;
    const h = 2.2;
    emit(T.ring, { layer: S.back, d, x, h, life: 0.4, s0: 0.3, s1: 2.4, a0: 0.9, a1: 0, tint: look.accent, blend: "add" });
    for (let i = 0; i < 30; i++) {
      const a = rnd(-1.5, -0.2);
      const v = rnd(4, 9);
      emit(i % 5 ? (i % 2 ? T.heart : T.confetti) : T.berry, { layer: S.back, d, x, h, vx: Math.cos(a) * v, vh: -Math.sin(a) * v, g: 7, drag: 0.03, life: rnd(1, 1.6), s0: i % 5 ? rnd(0.5, 0.8) : 1, s1: 0.5, a0: 1, a1: 0, spin: rnd(-8, 8), tint: i % 5 ? look.confetti[i % look.confetti.length] : 0xffffff });
    }
  }

  // The 북 booms: the drum jumps, rings run out across the screen and pearl sparks fly.
  function drum() {
    const d = D.back + 0.25;
    const h = 1.2;
    S.starter.scale.y *= 0.82;
    drumHit = 1;
    for (let k = 0; k < 3; k++) emit(T.ring, { layer: S.back, d, x: STARTER_X, h, life: 0.7 + k * 0.2, s0: 0.3, s1: 3 + k * 1.4, a0: 0.9 - k * 0.2, a1: 0, tint: k % 2 ? 0xd6efec : 0xf4f2f8, blend: "add" });
    for (let i = 0; i < 16; i++) {
      const a = rnd(0, TAU);
      emit(T.petal, { layer: S.back, d, x: STARTER_X + Math.cos(a) * 0.3, h: h + Math.sin(a) * 0.3, vx: Math.cos(a) * rnd(2, 5), vh: Math.sin(a) * rnd(2, 5) + 1, g: 4, drag: 0.04, life: rnd(0.8, 1.3), s0: 1, s1: 0.6, a0: 1, a1: 0, spin: rnd(-8, 8) });
    }
    if (!still && !lowFx && S.zoom) S.shock = new FX.ShockwaveFilter({ center: { x: X(STARTER_X, d), y: Y(d, h) }, amplitude: 18, wavelength: 120, speed: 520, brightness: 1.1, radius: -1 });
  }

  // The starter's pistol puffs above the line: a flash, a ring and a cloud that drifts off.
  function pistol() {
    const x = 0.6;
    const d = D.back;
    const h = 6.2;
    for (let i = 0; i < 18; i++) {
      const a = rnd(0, TAU);
      emit(T.puff, { layer: S.front, d, x: x + Math.cos(a) * 0.3, h: h + Math.sin(a) * 0.3, vx: Math.cos(a) * rnd(1, 3.2) + 0.8, vh: Math.sin(a) * rnd(0.8, 2.6) + 0.4, drag: 0.07, life: rnd(1.1, 1.8), s0: rnd(0.9, 1.4), s1: rnd(2.6, 3.8), a0: 0.95, a1: 0, tint: i % 4 ? 0xffffff : look.accent, spin: rnd(-1, 1) });
    }
    emit(T.spark, { layer: S.front, d, x, h, life: 0.2, s0: 5, s1: 1, a0: 1, a1: 0, tint: 0xffffff, blend: px ? "normal" : "add" });
    emit(T.ring, { layer: S.front, d, x, h, life: 0.5, s0: 0.4, s1: 3.6, a0: 0.9, a1: 0, tint: look.accent, blend: px ? "normal" : "add" });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      emit(T.streak, { layer: S.front, d, x: x + Math.cos(a) * 0.5, h: h - Math.sin(a) * 0.5, vx: Math.cos(a) * 9, vh: -Math.sin(a) * 9, rot: a, life: 0.28, s0: 1.4, s1: 0.4, sx: 2, a0: 1, a1: 0, tint: 0xfff6dc, blend: px ? "normal" : "add" });
    }
  }

  // A slow countdown means a slow phone: drop the filters and render at 1x for as long as this stage lives.
  function degrade() {
    if (lowFx) return;
    lowFx = true;
    if (S) S.fg.tile.filters = null;
    if (!px && app.renderer.resolution > 1) {
      app.renderer.resolution = 1;
      app.renderer.resize(W, H);
    }
  }

  function tap(kind) {
    if (phase !== "run" || !model || !raceTap(model, kind, scale)) return;
    const me = runners[0];
    if (kind === "nfc") {
      me.react = 1.2;
      say("부스터!", "is-boost");
      sound("race-dash", 0.85);
      api.buzz([30, 25, 50]);
      if (!still) { cam.dzv += 1.4; cam.shake = Math.max(cam.shake, 5); punch = 1; }
      for (let i = 0; i < (still ? 0 : 14); i++) {
        const a = rnd(0, TAU);
        emit(T.streak, { x: W / 2 + Math.cos(a) * W * 0.2, y: H * 0.6 + Math.sin(a) * H * 0.15, vx: Math.cos(a) * 900, vy: Math.sin(a) * 900, rot: a, life: 0.35, s0: 1.2, s1: 2, sx: 1.6, a0: 0.9, a1: 0, tint: look.speed, blend: px ? "normal" : "add", slow: false });
      }
    } else {
      me.leanV += 0.8;
    }
  }

  /* ---------- race flow ---------- */
  function run(dt) {
    const gap = model.distance[0] - model.distance[1];
    const lead = Math.abs(gap) > 0.25 ? gap > 0 : leader;
    if (leader === null && model.time > 0.4) leader = lead;
    else if (lead !== leader && model.time > 1.4 && clock - leadAt > 1.6) {
      leader = lead;
      leadAt = clock;
      say("역전!", "is-swap");
      sound("ding", 0.7);
      sound("race-crowd", 0.35);
      runners[lead ? 0 : 1].react = 1;
      if (!still) { slowUntil = clock + 0.55; cam.rv += lead ? 0.5 : -0.5; }
    }
    const hint = $(".r-hint");
    if (!hint.hidden && model.time > 3.5 && !hint.getAnimations().length) {
      hint.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(8px)" }], { duration: 400, easing: "ease-in", fill: "forwards" });
      after(420, () => { hint.hidden = true; });
    }
    if (!spurt && Math.max(...model.distance) >= 80) {
      spurt = true;
      say("막판 스퍼트!", "is-spurt");
      sound("race-crowd", 0.5);
    }
    // A close finish slows to a crawl for the last metres.
    const close = !still && Math.max(...model.distance) > 96.5 && Math.abs(eta(model, 0) - eta(model, 1)) < 0.35;
    const goal = close ? 0.2 : clock < slowUntil ? 0.35 : 1;
    scale += (goal - scale) * (1 - Math.exp(-dt * (goal < scale ? 14 : 6)));
    if (still) scale = 1;
    const wdt = dt * scale;
    if (stepRace(model, wdt)) finish(close);
    return wdt;
  }

  function finish(close) {
    setPhase("finish");
    const won = model.finish[0] < model.finish[1];
    result = { won, time: model.finish[0], gap: Math.abs(model.finish[0] - model.finish[1]), level, close };
    big.textContent = "";
    $(".r-hint").hidden = true;
    const token = generation;
    saved = null;
    Promise.resolve(api.finish(rival, won)).then((reply) => {
      if (token !== generation) return;
      saved = reply || false;
      if (reply?.race) state = reply.race;
      if (phase === "result") fillCard();
    }, () => { if (token === generation) { saved = false; if (phase === "result") fillCard(); } });
    // Reduced motion keeps the photo and drops only its slow-mo and flash.
    if (result.gap < 0.35) {
      photo = { at: clock, shot: "now" };
      sound("race-shutter", 0.9);
    }
    sound(won ? "race-win" : "race-lose", 0.8, 1);
    if (won) sound("race-crowd", 0.55);
    runners[0].react = won ? 2 : 0;
    party = won ? { at: clock, shots: 0, confetti: false } : null;
  }

  /* ---------- celebrations ---------- */
  // Two shells and a flash: streaks that stretch with speed, an inner ring of glitter that twinkles out.
  function firework(x, y, tint) {
    const k = H / 852;
    const n = lowFx ? 20 : 40;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rnd(-0.08, 0.08);
      const v = rnd(190, 250) * k;
      emit(px ? T.pixel : T.streak, { layer: S.skyFx, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ay: 55, drag: 0.04, life: rnd(1.1, 1.6), s0: px ? 3 : 0.5, s1: px ? 2 : 0.18, sx: px ? 1 : 1.6, a0: 1, a1: 0, tint: i % 5 ? tint : 0xffffff, blend: px ? "normal" : "add", align: !px, slow: false });
    }
    for (let i = 0; i < n / 2; i++) {
      const a = (i / (n / 2)) * TAU;
      const v = rnd(80, 115) * k;
      emit(px ? T.pixel : T.glow, { layer: S.skyFx, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ay: 40, drag: 0.05, life: rnd(1.2, 1.8), s0: px ? 2 : 0.14, s1: px ? 2 : 0.05, a0: 1, a1: 0, tint: 0xfff6dc, blend: px ? "normal" : "add", twinkle: true, slow: false });
    }
    emit(px ? T.pixRing : T.glow, { layer: S.skyFx, x, y, life: px ? 0.3 : 0.35, s0: px ? 0.6 : 1.2, s1: px ? 2.4 : 3.2, a0: px ? 1 : 0.9, a1: 0, tint, blend: px ? "normal" : "add", slow: false });
  }

  function rocket(tint, i) {
    const x = W * (0.18 + ((i * 0.37) % 0.66)) + rnd(-20, 20);
    const top = rnd(H * 0.1, H * 0.24);
    const p = emit(px ? T.pixel : T.glow, { layer: S.skyFx, x, y: Y0(D.mid), vx: rnd(-15, 15), vy: -(Y0(D.mid) - top) / 0.65, life: 0.65, s0: px ? 2 : 0.2, s1: px ? 2 : 0.12, a0: 1, a1: 0.8, tint: 0xfff3c4, blend: px ? "normal" : "add", trail: px ? 0 : 1, slow: false });
    p.done = () => firework(p.s.x, p.s.y, tint);
    sound("race-pop", 0.25, 0.7 + rnd(0, 0.3));
  }

  // Cranes cross the moon in a loose V while pearl petals drift down.
  function cranes(age) {
    if (party.shots < 7 && age > 0.05 + party.shots * 0.12) {
      const i = party.shots++;
      // A V: the lead crane highest and furthest along, the rest trailing behind it.
      const row = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
      const y = H * 0.15 + Math.abs(row) * H * 0.028 + row * H * 0.012;
      emit(T.crane[0], { layer: S.skyFx, x: -20 - Math.abs(row) * 46, y, vx: W * 0.42, vy: -10, life: 3.6, s0: 1.05 - Math.abs(row) * 0.08, s1: 1.05 - Math.abs(row) * 0.08, a0: 1, a1: 0.9, frames: T.crane, fps: 3.5 + (i % 3) * 0.4, slow: false });
    }
    if (!party.confetti && age > 0.2) {
      party.confetti = true;
      for (let i = 0; i < (lowFx ? 36 : 80); i++) emit(T.petal, { x: rnd(-0.1, 1.1) * W, y: rnd(-0.4, -0.02) * H, vx: rnd(-30, 30), vy: rnd(40, 110), ay: 12, drag: 0.01, life: rnd(3, 4.6), s0: rnd(0.8, 1.3), s1: rnd(0.7, 1), a0: 1, a1: 0.8, spin: rnd(-4, 4), flutter: rnd(1, 6), slow: false });
    }
  }

  // Hearts burst like fireworks and strawberries rain down with the hearts.
  function hearts(age) {
    if (party.shots < 6 && age > 0.1 + party.shots * 0.35) {
      party.shots++;
      const cx = rnd(W * 0.15, W * 0.85);
      const cy = rnd(H * 0.12, H * 0.3);
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU;
        // Particles laid out on a heart curve, so each burst blooms into a heart.
        const hx = 16 * Math.sin(a) ** 3;
        const hy = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
        emit(T.heart, { layer: S.skyFx, x: cx, y: cy, vx: hx * 9, vy: hy * 9, ay: 30, drag: 0.05, life: 1.4, s0: 0.7, s1: 0.25, a0: 1, a1: 0, tint: look.confetti[i % look.confetti.length], slow: false });
      }
      emit(T.glow, { layer: S.skyFx, x: cx, y: cy, life: 0.35, s0: 1, s1: 2.6, a0: 0.8, a1: 0, tint: 0xffffff, blend: "add", slow: false });
    }
    if (!party.confetti && age > 0.2) {
      party.confetti = true;
      for (let i = 0; i < (lowFx ? 36 : 80); i++) emit(i % 4 ? T.heart : T.berry, { x: rnd(-0.1, 1.1) * W, y: rnd(-0.4, -0.02) * H, vx: rnd(-30, 30), vy: rnd(60, 150), ay: 20, drag: 0.01, life: rnd(2.6, 4), s0: i % 4 ? rnd(0.35, 0.6) : rnd(0.7, 1), s1: 0.4, a0: 1, a1: 0.85, tint: i % 4 ? look.confetti[i % look.confetti.length] : 0xffffff, spin: rnd(-3, 3), flutter: i % 4 ? rnd(1, 6) : 0, slow: false });
    }
  }

  function celebrate() {
    if (!party || still) return;
    const age = clock - party.at;
    if (look.party === "cranes") return cranes(age);
    if (look.party === "hearts") return hearts(age);
    const colors = look.confetti;
    if (party.shots < 7 && age > 0.1 + party.shots * (party.shots < 4 ? 0.3 : 0.7)) {
      rocket(colors[party.shots % colors.length], party.shots);
      party.shots++;
    }
    if (!party.confetti && age > 0.25) {
      party.confetti = true;
      for (let i = 0; i < (lowFx ? 40 : 90); i++) {
        emit(confettiTex(i), { x: rnd(-0.1, 1.1) * W, y: rnd(-0.35, -0.02) * H, vx: rnd(-40, 40), vy: rnd(60, 160), ay: 25, drag: 0.01, life: rnd(2.6, 4), s0: rnd(0.7, 1.1), s1: rnd(0.6, 0.9), a0: 1, a1: 0.85, tint: colors[i % colors.length], spin: rnd(-6, 6), flutter: rnd(1, 6), slow: false });
      }
    }
  }

  function card() {
    setPhase("result");
    $(".r-hud").hidden = true;
    $(".r-edge").hidden = true;
    // The finish photo lifts off the scene before the card lands.
    const shot = $(".r-photo");
    if (!shot.hidden) {
      shot.animate(still ? [{ opacity: 0 }] : [{ transform: "translateY(-70px) rotate(-7deg) scale(.88)", opacity: 0 }], { duration: 260, easing: "cubic-bezier(.5,0,.9,.4)", fill: "forwards" });
      after(280, () => { if (phase === "result") shot.hidden = true; });
    }
    $(".r-card").innerHTML = `<div class="g-badge r-medal${result.won ? " is-win" : ""}">${result.won ? "1등" : "2등"}</div>
      <p class="g-place">${result.won ? "멋지게 달렸어요!" : "끝까지 달렸어요!"}</p>
      <p class="g-meters r-time"><b>${result.time.toFixed(2)}</b>초</p>
      <p class="g-prev">${result.gap.toFixed(2)}초 차이 · 상대 Lv.${level}</p>
      <p class="r-flex"></p><div class="r-saved"></div>
      <div class="g-actions"><button type="button" class="g-again" data-choice="again">한 번 더</button></div>
      <div class="g-actions r-more"><button type="button" class="g-quit" data-choice="pick">상대 바꾸기</button><button type="button" class="g-quit" data-choice="quit">그만할래요</button></div>`;
    fillCard();
    $(".r-card").hidden = false;
    if (!still) $(".r-card").animate([{ transform: "translateY(24px) scale(.85)", opacity: 0 }, { transform: "translateY(-4px) scale(1.03)", opacity: 1, offset: 0.65 }, { transform: "none", opacity: 1 }], { duration: 420, easing: "cubic-bezier(.3,1.3,.5,1)" });
    ($(".r-card .g-again:not([disabled])") || $(".r-card [data-choice=quit]")).focus({ preventScroll: true });
  }

  // The server's reply fills in the level-up line, XP and the buttons that need a saved record.
  function fillCard() {
    const next = state[rival]?.level || level;
    $(".r-flex").textContent = !result.won ? "다음엔 꼭 이길 거예요!" : saved && level < RACE.cap ? `${PETS[rival]} 친구가 더 빨라졌어요! Lv.${level} → Lv.${next}` : level >= RACE.cap ? "최고 레벨에서 이겼어요!" : "";
    $(".r-saved").innerHTML = saved === null ? '<p class="g-xp">기록을 남기는 중이에요…</p>'
      : !saved ? '<p class="g-xp">기록을 못 남겼어요</p>'
      : `${saved.xpGain > 0 ? `<p class="g-xp"><b>+${saved.xpGain} XP</b><span>오늘 ${3 - saved.xpLeft}/3</span></p>` : '<p class="g-xp">오늘 XP는 다 받았어요</p>'}${saved.leveledUp ? `<p class="g-level">쑥쑥 컸어요! 이제 Lv. ${saved.level}!</p>` : ""}`;
    for (const b of shell.querySelectorAll(".r-card [data-choice=again], .r-card [data-choice=pick]")) b.disabled = !saved;
    if (saved && result.won && level < RACE.cap && !flexAt) flexAt = clock;
  }

  /* ---------- frame ---------- */
  // How far the camera sinks on the picker so the pair's feet land just above the sheet, whatever its height.
  function crane() {
    const sheet = $(".r-pick");
    const feet = Math.min(H * 0.55, (sheet.hidden ? H : sheet.offsetTop) - 16);
    return L.ch - ((feet - L.hy) * (px ? 1 : 1.12)) / L.f;
  }

  function follow(dt) {
    let focus;
    let speed = 0;
    if (model && phase !== "pick") {
      const [a, b] = model.distance;
      focus = a + clamp((b - a) * 0.4, -2.2, 2.2);
      speed = model.speed[0] * scale;
      if (phase === "finish") focus = runners[0].x + 1.2;
      if (phase === "result") focus = (runners[0].x + clamp(runners[1].x, runners[0].x - 4, runners[0].x + 4)) / 2 + 1.1;
    } else focus = -1.1;
    const lineup = phase === "pick" || (phase === "count" && clock - phaseAt < 0.6 && !still);
    const ease = 1 - Math.exp(-dt * 2.2);
    cam.vp += ((lineup ? 0.88 : 0.62) - cam.vp) * ease;
    cam.run += ((lineup ? 0.3 : 0.4) - cam.run) * ease;
    const target = focus + lens() + speed * 0.07;
    const k = phase === "finish" && result?.close ? 90 : 38;
    cam.vx += (k * (target - cam.x) + 2 * Math.sqrt(k) * (speed - cam.vx)) * dt;
    cam.x += cam.vx * dt;
    let dzGoal = -0.12;
    if (phase === "count") dzGoal = lerp(-0.12, 0.06, smooth((clock - phaseAt) / 3));
    else if (phase === "run" && model) {
      const g = Math.abs(model.distance[0] - model.distance[1]);
      dzGoal = g < 1.4 ? 0.07 : g > 6 ? -0.14 : 0;
      if (scale < 0.5) dzGoal = 0.2;
    } else if (phase === "finish") dzGoal = result?.close ? 0.22 : 0.05;
    else if (phase === "result") dzGoal = 0.04;
    cam.dzv += (40 * (dzGoal - cam.dz) - 11 * cam.dzv) * dt;
    cam.dz = still ? 0 : clamp(cam.dz + cam.dzv * dt, -0.4, 0.26);
    cam.rv += (-60 * cam.roll - 9 * cam.rv) * dt;
    cam.roll += cam.rv * dt;
    const me = runners[0];
    // On the picker the camera sinks so the pair stands clear of the sheet, then settles into the race.
    let lift = 0;
    if (phase === "pick") lift = crane();
    else if (phase === "count") lift = still ? 0 : crane() * (1 - smooth((clock - phaseAt) / 2.4));
    else if (phase === "run" && !still) lift = (me.hipH - L.size * (1 - HIP)) * 0.25;
    // Under the card the pair sits low in frame so the rival's level-up tag clears it.
    else if (phase === "result") lift = -L.size * 0.45;
    cam.liftV += (30 * (lift - cam.lift) - 11 * cam.liftV) * dt;
    cam.lift += cam.liftV * dt;
    cam.shake *= Math.pow(0.004, dt);
    // Reduced motion cuts between framings instead of craning and dollying.
    if (still) {
      cam.roll = 0;
      cam.shake = 0;
      cam.lift = phase === "pick" ? crane() : lift;
      cam.vp = lineup ? 0.88 : 0.62;
      cam.run = lineup ? 0.3 : 0.4;
    }
  }

  function paint(dt, wdt) {
    const sx = (Math.random() - 0.5) * 2 * cam.shake;
    const sy = (Math.random() - 0.5) * 2 * cam.shake;
    root.pivot.set(W / 2, H * 0.6);
    root.position.set(W / 2 + (px ? Math.round(sx / 2) * 2 : sx), H * 0.6 + (px ? Math.round(sy / 2) * 2 : sy));
    root.rotation = px ? 0 : cam.roll * 0.05;
    for (const { o, glow, rays, face } of S.discs) {
      const dx = W * o.x - cam.x * 0.15;
      const dy = Y0(D.far) + H * o.y - cam.lift * 2;
      face.position.set(dx, dy);
      face.width = face.height = W * o.r * 2;
      glow.position.set(dx, dy);
      glow.width = glow.height = W * o.r * 9;
      glow.alpha = o.glowA ?? 0.5;
      rays.position.set(dx, dy);
      rays.width = rays.height = W * 1.4;
      rays.rotation = clock * 0.03;
      rays.alpha = 0.12;
    }
    if (S.clouds) {
      const c = S.clouds;
      c.tile.tilePosition.x = -cam.x * sOf(c.d) - clock * 6;
      c.tile.y = c.y;
    }
    for (const lay of S.layers) {
      const s = sOf(lay.d);
      const k = px ? 1 : s / lay.s0;
      lay.tile.tileScale.set(k);
      lay.tile.x = -L.over;
      lay.tile.width = W + 2 * L.over;
      lay.tile.height = lay.h * k;
      lay.tile.y = Y(lay.d) - lay.base * k;
      const shift = W * cam.vp + L.over - cam.x * s;
      lay.tile.tilePosition.x = px ? Math.round(shift / 2) * 2 : shift;
      if (lay.sheen) {
        const t = lay.sheen;
        t.tileScale.set(k);
        t.position.copyFrom(lay.tile.position);
        t.width = lay.tile.width;
        t.height = lay.tile.height;
        t.tilePosition.x = lay.tile.tilePosition.x;
        t.alpha = 0.5 + 0.5 * Math.sin(clock * 0.8 + cam.x * 0.06 + lay.d);
      }
    }
    if (S.props.frames) {
      const rate = phase === "run" && spurt ? 9 : phase === "result" && result?.won ? 7 : 2.5;
      S.props.tile.texture = S.props.frames[Math.floor(clock * rate) % 2];
    }
    {
      const q = S.ground;
      const p = q.pos.data;
      const uv = q.uv.data;
      S.groundRows.forEach((row, j) => {
        const s = px ? L.f : sOf(row.d);
        const y = Y(row.d);
        const xl = -L.over;
        const xr = W + L.over;
        const camX = px ? Math.round(cam.x * L.f / 2) * 2 / L.f : cam.x;
        p.set([xl, y, xr, y], j * 4);
        const sh = shear(row.d);
        uv.set([(camX + (xl - W * cam.vp - sh) / s) / S.groundPeriod, row.v, (camX + (xr - W * cam.vp - sh) / s) / S.groundPeriod, row.v], j * 4);
      });
      q.pos.update();
      q.uv.update();
      const edge = Y(S.groundRows[S.groundRows.length - 1].d);
      S.floor.position.set(-L.over, edge - 1);
      S.floor.width = W + 2 * L.over;
      S.floor.height = Math.max(0, H + 2 * L.over - edge);
    }
    furniture(wdt);
    decal(S.startLine, 0, 0.12, 1);
    decal(S.finishLine, RACE.meters, 0.7, 6);
    const fgs = sOf(D.fg);
    const fk = px ? 1 : fgs / S.fg.s0;
    S.fg.tile.tileScale.set(fk);
    S.fg.tile.x = -L.over;
    S.fg.tile.width = W + 2 * L.over;
    S.fg.tile.height = S.fg.h * fk;
    S.fg.tile.y = Y(D.fg) - S.fg.base * fk;
    S.fg.tile.tilePosition.x = W * cam.vp + L.over - cam.x * fgs;
    if (S.blur) {
      const v = Math.abs(cam.vx) * fgs * (1 / 60);
      S.blur.velocity = { x: clamp(v * 1.1, 0, 40), y: 0 };
      S.fg.tile.filters = !lowFx && !still && v > 1.5 ? [S.blur] : null;
    }
    S.lines.clear();
    for (const r of runners) {
      pose(r, r.body);
      const ghostOn = !still && r.glide > 0.4 && r.id === 0;
      if (ghostOn) r.trail.unshift(r.x);
      else r.trail.length = 0;
      r.trail.length = Math.min(r.trail.length, 17);
      r.ghosts.forEach((q, i) => {
        const back = r.trail[(i + 1) * 4];
        q.mesh.visible = ghostOn && back !== undefined;
        if (q.mesh.visible) { q.mesh.texture = faces[r.kind].react; pose(r, q, [0.42, 0.26, 0.15, 0.08][i] * r.glide, r.x - back); }
      });
      if (r.land && phase === "run") {
        r.land = false;
        dust(r, r.id ? 2 : 3, 0.7 + model.speed[r.id] / 14);
        if (!r.id) sound("race-hop", 0.32 + Math.random() * 0.1, 0.88 + Math.random() * 0.24);
      }
      r.land = false;
      const v = model ? model.speed[r.id] : 0;
      if (phase === "run" && v > 9.5 && !still) {
        const s = sOf(r.d);
        const a = clamp((v - 9.5) / 5, 0, 0.7) * (r.id ? 0.6 : 1);
        for (let i = 0; i < 5; i++) {
          const ly = Y(r.d, L.size * (0.25 + i * 0.13));
          const len = (40 + i * 13) * (s / L.f) * (1 + r.glide);
          const off = ((clock * 900 * (1 + i * 0.13) + i * 97) % (W * 0.9));
          const lx = X(r.x, r.d) - L.size * s * 0.4 - off * 0.35;
          S.lines.rect(lx - len, ly, len, px ? 2 : 1.3).fill({ color: look.speed, alpha: a * (1 - off / (W * 0.9)) });
        }
      }
    }
    S.flash.alpha *= Math.pow(0.002, dt);
    punch *= Math.pow(0.0015, dt);
    if (S.zoom) {
      const zoom = punch > 0.02 && !lowFx && !still;
      if (zoom) {
        S.zoom.strength = punch * 0.16;
        S.zoom.center = { x: runners[0].head?.[0] ?? W / 2, y: (runners[0].head?.[1] ?? H / 2) + L.size * L.f * 0.4 };
      }
      if (S.shock) {
        S.shock.time += dt;
        if (S.shock.time > 1.2) { S.shock.destroy(); S.shock = null; }
      }
      const list = [zoom && S.zoom, S.shock].filter(Boolean);
      root.filters = list.length ? list : null;
    }
    stepParts(dt, wdt);
  }

  function place(sp, x, d, h = 0, k = 1) {
    sp.position.set(X(x, d), Y(d, h));
    sp.scale.set((sOf(d) / L.f) * k);
    sp.visible = sp.x > -W * 0.6 && sp.x < W * 1.6;
  }

  function furniture(wdt) {
    for (const b of S.boards) place(b.sp, b.m, D.back + 0.14);
    drumHit *= Math.pow(0.02, wdt);
    place(S.starter, STARTER_X, D.back + 0.3);
    if (S.flag) place(S.flag, STARTER_X - 0.2, D.back + 0.3, 2.9);
    if (drumHit > 0.01) S.starter.scale.y *= 1 - Math.sin(drumHit * Math.PI) * 0.12;
    const bob = Math.sin(clock * 2.1) * 0.05;
    [-1, 1].forEach((side, i) => {
      place(S.posts[i], RACE.meters + side * GATE.span, GATE.post);
      place(S.balloons[i], RACE.meters + side * GATE.span, GATE.post, 7.2, 1.05);
      S.balloons[i].rotation = bob * side;
    });
    place(S.banner, RACE.meters, GATE.post, GATE.low);
    place(S.stakes[0], RACE.meters, GATE.back);
    place(S.stakes[1], RACE.meters, GATE.front);
    const g = S.tape.clear();
    if (!tape) {
      for (let i = 0; i <= 10; i++) {
        const d = lerp(GATE.back, GATE.front, i / 10);
        const xy = [X(RACE.meters, d), Y(d, GATE.tape - Math.sin((Math.PI * i) / 10) * 0.12)];
        if (i) g.lineTo(...xy);
        else g.moveTo(...xy);
      }
      g.stroke({ width: px ? 2 : 2.4, color: S.tapeColor, cap: "round" });
      return;
    }
    const t = Math.min(wdt, 1 / 30);
    for (const rope of tape) {
      for (let i = 1; i < rope.length; i++) {
        const n = rope[i];
        const vx = (n.x - n.ox) * 0.96;
        const vd = (n.d - n.od) * 0.96;
        const vh = (n.h - n.oh) * 0.96;
        n.ox = n.x;
        n.od = n.d;
        n.oh = n.h;
        n.x += vx + Math.sin(clock * 9 + i) * 0.004;
        n.d += vd;
        n.h = Math.max(0.02, n.h + vh - 3.2 * t * t);
      }
      for (let k = 0; k < 4; k++) for (let i = 1; i < rope.length; i++) {
        const a = rope[i - 1];
        const b = rope[i];
        const dx = b.x - a.x;
        const dd = (b.d - a.d) * 3.4;
        const dh = b.h - a.h;
        const len = Math.hypot(dx, dd, dh) || 1e-6;
        const k2 = (len - rope.seg) / len;
        const w = i === 1 ? 1 : 0.5;
        b.x -= dx * k2 * w;
        b.d -= (dd * k2 * w) / 3.4;
        b.h -= dh * k2 * w;
        if (i > 1) { a.x += dx * k2 * 0.5; a.d += (dd * k2 * 0.5) / 3.4; a.h += dh * k2 * 0.5; }
      }
      rope.forEach((n, i) => (i ? g.lineTo(X(n.x, n.d), Y(n.d, n.h)) : g.moveTo(X(n.x, n.d), Y(n.d, n.h))));
      g.stroke({ width: px ? 2 : 2.4, color: S.tapeColor, cap: "round", join: "round" });
    }
  }

  // The winner snaps the tape; each half flies forward off its post.
  function snapTape(d, speed) {
    if (look.party === "hearts" && !still) {
      for (let i = 0; i < 22; i++) emit(T.splash, { layer: S.front, d, x: RACE.meters + rnd(-0.2, 0.4), h: rnd(0.2, 1.4), vx: rnd(-1, 4), vh: rnd(3, 8), g: 18, drag: 0.02, life: rnd(0.5, 0.9), s0: rnd(0.5, 0.9), s1: 0.3, a0: 1, a1: 0, spin: rnd(-3, 3) });
    }
    tape = [GATE.back, GATE.front].map((post) => {
      const n = 7;
      const rope = Array.from({ length: n }, (_, i) => {
        const k = i / (n - 1);
        const node = { x: RACE.meters, d: lerp(post, d, k), h: GATE.tape };
        const push = k * k * speed * 0.022;
        return { ...node, ox: node.x - push, od: node.d, oh: node.h - k * 0.02 };
      });
      rope.seg = (Math.abs(d - post) * 3.4) / (n - 1);
      return rope;
    });
  }

  // A strip painted on the track across both lanes at metre x, `wide` metres long.
  function decal(q, x, wide, reps) {
    const p = q.pos.data;
    const uv = q.uv.data;
    for (let j = 0; j < q.rows; j++) {
      const d = lerp(D.near, D.back, j / (q.rows - 1));
      const y = Y(d);
      p.set([X(x, d), y, X(x + wide, d), y], j * 4);
      uv.set([0, (j / (q.rows - 1)) * reps, 1, (j / (q.rows - 1)) * reps], j * 4);
    }
    q.pos.update();
    q.uv.update();
  }

  function tick(now) {
    const raw = Math.max(0, (now - last) / 1000);
    last = now;
    const dt = Math.min(0.05, raw);
    clock += dt;
    if (phase === "count") samples.push(raw * 1000);
    let wdt = dt;
    if (phase === "count") countdown();
    if (phase === "run") wdt = run(dt);
    else if (phase === "finish") {
      const age = clock - phaseAt;
      const hold = photo ? 2.6 : result.won ? 2.1 : 1.5;
      scale = photo && age < 1.7 ? 0 : 1;
      wdt = dt * scale;
      stepRace(model, wdt);
      if (age > hold) card();
    } else if (phase === "result" && model) stepRace(model, dt);
    if (model && !tape && Math.max(...model.distance) >= RACE.meters && S) {
      const w = model.distance[0] >= model.distance[1] ? 0 : 1;
      snapTape(runners[w].d, model.speed[w]);
    }
    for (const r of runners) {
      let v = model && (phase === "run" || phase === "finish" || phase === "result") ? model.speed[r.id] : 0;
      if (model && phase !== "pick" && phase !== "count") {
        // A far-behind loser jogs in fast after the card, so both end up in the result shot.
        const lead = runners[result?.won === false ? 1 : 0];
        const want = phase === "result" && r !== lead ? Math.max(0, lead.x - 2.6 - (model.distance[r.id] - 1.1)) : 0;
        const ease = (want - r.catchup) * (1 - Math.exp(-dt * 1.6));
        r.catchup += ease;
        v += ease / Math.max(dt, 1e-3);
        r.x = model.distance[r.id] - 1.1 + r.catchup;
      }
      const won = result && (r.id ? !result.won : result.won);
      r.mood = phase === "result" && v < 1 ? (won ? "win" : "tired") : r.mood === "win" || r.mood === "tired" ? r.mood : "idle";
      const m = phase === "count" ? "crouch" : v > 1.2 ? (r.id === 0 && model && model.boost > model.time && phase === "run" ? "dash" : "run") : r.mood;
      gait(r, v, phase === "count" ? dt : wdt, m);
      faceFor(r, dt);
    }
    celebrate();
    aftermath();
    follow(dt);
    hud();
    paint(dt, wdt);
    app.renderer.render(app.stage);
    if (photo?.shot === "now") {
      photo.shot = true;
      grab();
      if (!still) {
        S.flash.tint = look.flash;
        S.flash.alpha = 1;
      }
    }
    if (phase !== "idle") raf = requestAnimationFrame(tick);
  }

  function grab() {
    const shot = $(".r-shot");
    shot.replaceChildren();
    // The frame the leader crossed, cropped to the pair, with the line marked like a finish camera.
    const k = app.canvas.width / W;
    const top = Math.max(0, Y(D.rival, L.size * 1.5));
    const bottom = Math.min(H, Y(D.near) + 6);
    const c = document.createElement("canvas");
    c.width = Math.round(W * k);
    c.height = Math.round((bottom - top) * k);
    const x = c.getContext("2d");
    x.drawImage(app.canvas, 0, top * k, c.width, c.height, 0, 0, c.width, c.height);
    x.strokeStyle = "rgba(255,64,64,.85)";
    x.lineWidth = 2 * k;
    x.beginPath();
    x.moveTo(X(RACE.meters, D.near) * k, (Y(D.near) - top) * k);
    x.lineTo(X(RACE.meters, D.back) * k, (Y(D.back) - top) * k);
    x.stroke();
    shot.append(c);
    $(".r-photo figcaption b").textContent = `${result.gap.toFixed(2)}초 차이`;
    $(".r-photo").hidden = false;
    const tilt = world === "milk" ? -4 : px ? 0 : -1.5;
    $(".r-photo").getAnimations().forEach((a) => a.cancel());
    if (!still) $(".r-photo").animate([{ transform: "scale(1.15) rotate(0deg)", opacity: 0 }, { transform: `scale(.97) rotate(${tilt}deg)`, opacity: 1, offset: 0.45 }, { transform: `scale(1) rotate(${tilt}deg)`, opacity: 1 }], { duration: 560, easing: px ? "steps(5)" : "cubic-bezier(.2,1.2,.4,1)", fill: "forwards" });
  }

  function hud() {
    tags();
    if (!model || phase === "pick") return;
    // finish[0] is projected the moment either pet crosses; hold it back until ours does.
    const t = (model.finish[0] !== null && model.time >= model.finish[0] ? model.finish[0] : model.time).toFixed(2);
    if (clockEl.textContent !== t) clockEl.textContent = t;
    // Transforms only: moving the heads with left would lay the HUD out again every frame.
    const k = model.distance.map((m) => Math.min(1, m / RACE.meters));
    heads[0].style.transform = `translate(${(k[0] * stripW).toFixed(1)}px, 0) translate(-50%, -62%)`;
    heads[1].style.transform = `translate(${(k[1] * stripW).toFixed(1)}px, 0) translate(-50%, -125%)`;
    fill.style.transform = `scaleX(${k[0].toFixed(4)})`;
    // A rival out of frame shows as a chip on the edge it would run in from.
    const edge = $(".r-edge");
    const rx = runners[1].head?.[0] ?? W / 2;
    const out = (phase === "run" || phase === "finish") && (rx < -10 || rx > W + 10);
    edge.hidden = !out;
    if (out) {
      const gap = Math.abs(model.distance[1] - model.distance[0]).toFixed(1);
      const text = rx < 0 ? `◀ ${PETS[rival]} ${gap}m` : `${PETS[rival]} ${gap}m ▶`;
      if (edge.textContent !== text) edge.textContent = text;
      edge.classList.toggle("is-right", rx > 0);
      edge.style.top = `${Math.round(Y(D.rival, L.size * 0.7))}px`;
    }
  }

  function tags() {
    const flex = phase === "result" && flexAt && runners[1].head;
    for (const r of runners) {
      const el = $(r.id ? ".r-tag.is-rival" : ".r-tag.is-me");
      const on = (phase === "pick" || (flex && r.id)) && r.head;
      el.hidden = !on;
      // Left/top, not transform: the flex pop scales the tag, and a scaled translate would throw it off the head.
      if (on) {
        // 8-bit lanes stack straight up, so the owner's chip goes beside the head instead of into the rival's lane.
        const side = px && phase === "pick" && !r.id;
        const s = L.size * sOf(r.d);
        el.style.translate = side ? "-100% -50%" : "";
        el.style.left = `${Math.round(r.head[0] + (side ? -s * 0.42 : phase === "pick" ? (r.id ? 16 : -18) : 0))}px`;
        el.style.top = `${Math.round(r.head[1] + (side ? s * 0.3 : -10))}px`;
      }
    }
  }

  // The rival takes the loss and levels up on the spot; a lost owner pants with a sweat drop.
  function aftermath() {
    if (phase !== "result" || !result) return;
    const tag = $(".r-tag.is-rival");
    if (flexAt && !tag.classList.contains("is-flex") && clock - flexAt > 0.5) {
      tag.textContent = `Lv.${state[rival]?.level || level + 1}!`;
      tag.classList.add("is-flex");
      const r = runners[1];
      r.react = 1.5;
      r.sqv -= 6;
      emit(px ? T.pixRing : T.ring, { layer: S.lanes[1], d: r.d, x: r.x, h: L.size * 0.5, life: 0.6, s0: 0.3, s1: 2.4, a0: 0.9, a1: 0, tint: look.accent, blend: px ? "normal" : "add" });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        emit(px ? T.pixel : T.spark, { layer: S.lanes[1], d: r.d, x: r.x + Math.cos(a) * 0.4, h: L.size * 0.5 + Math.sin(a) * 0.4, vx: Math.cos(a) * 3, vh: Math.sin(a) * 3, drag: 0.06, life: 0.7, s0: px ? 2 : 0.5, s1: 0, a0: 1, a1: 0, tint: look.accent, blend: px ? "normal" : "add" });
      }
      sound("tier", 0.6);
    }
    const loser = runners[result.won ? 1 : 0];
    if (!result.won && loser.head && clock - sweatAt > 1.1) {
      sweatAt = clock;
      emit(T.drop, { layer: S.lanes[0], d: loser.d, x: loser.x + L.size * 0.34, h: L.size * 0.92, vh: 0.6, g: 3, life: 1, s0: 1.3, s1: 1.1, a0: 1, a1: 0, tint: 0xffffff });
    }
  }

  /* ---------- input and api ---------- */
  // Leaving by choice fades the race away; the page hiding or a teardown cuts at once.
  function abort(fade = false) {
    const token = ++generation;
    const done = () => {
      if (token !== generation) return;
      setPhase("idle");
      shell.hidden = true;
      cancelAnimationFrame(raf);
      for (const p of parts.splice(0)) { p.s.visible = false; p.s.removeFromParent(); pool.push(p.s); }
      resolve?.("quit");
      resolve = null;
    };
    if (!fade || shell.hidden) return done();
    shell.animate([{ opacity: 1 }, { opacity: 0, transform: still ? "none" : "scale(1.04)" }], { duration: 240, easing: "ease-in", fill: "forwards" });
    after(260, done);
  }

  // State changes ride timers, not animation promises: a finished promise is not guaranteed to settle.
  function after(ms, fn) {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
  }

  const motion = (el, frames, duration, delay = 0) => el.animate(still ? [{ opacity: 0 }, { opacity: 1 }] : frames, { duration: still ? 160 : duration, delay: still ? 0 : delay, easing: still ? "linear" : "cubic-bezier(.2,.9,.3,1.12)", fill: "backwards" });

  // The race opens as an iris on the pair, then the picker rises into it.
  function enter() {
    if (still) shell.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    else shell.animate([{ clipPath: "circle(0% at 50% 42%)" }, { clipPath: "circle(120% at 50% 42%)" }], { duration: 560, easing: "cubic-bezier(.6,0,.2,1)" });
  }
  function pointer(event) {
    if (event.target.closest("button, .r-pick, .r-card")) return;
    event.preventDefault();
    if (phase === "run" && S && event.clientX) {
      const box = shell.getBoundingClientRect();
      emit(px ? T.pixRing : T.ring, { x: event.clientX - box.left, y: event.clientY - box.top, life: 0.3, s0: 0.12, s1: 0.5, a0: 0.55, a1: 0, tint: look.accent, blend: px ? "normal" : "add", slow: false });
    }
    tap("screen");
  }
  function key(event) {
    if (shell.hidden) return;
    if (event.code === "Escape") { if (phase !== "finish") abort(true); }
    else if (event.code === "Space" && phase === "run") { event.preventDefault(); if (!event.repeat) tap("screen"); }
    else if (event.code === "Tab") {
      const buttons = [...shell.querySelectorAll("button")].filter((b) => !b.disabled && b.getClientRects().length);
      const i = buttons.indexOf(document.activeElement);
      event.preventDefault();
      buttons[(i + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus();
    }
  }
  shell.addEventListener("pointerdown", pointer);
  document.addEventListener("keydown", key);
  // Not during the finish hold: the save is already in flight and the card is a second away.
  $(".r-close").addEventListener("click", () => { if (phase !== "finish") abort(true); });
  $(".r-pick").addEventListener("click", (event) => { if (event.target.closest(".r-go")) start(); });
  $(".r-card").addEventListener("click", (event) => {
    const choice = event.target.closest("[data-choice]")?.dataset.choice;
    if (choice === "quit") abort(true);
    else if (choice && saved) {
      // The camera cuts back to the start line under a quick dip to the world's shade.
      S.flash.tint = look.shadow;
      if (!still) S.flash.alpha = 1;
      pick(choice === "again");
      if (choice === "again") start();
    }
  });
  // A new size repaints the world for it, mid-race too (phone browser bars come and go).
  const observer = new ResizeObserver(() => {
    if (shell.hidden) return;
    measure();
    app.renderer.resize(W, H);
    build();
    stripW = $(".r-strip").clientWidth || stripW;
  });
  observer.observe(shell);

  return {
    get phase() { return phase; },
    tap,
    abort,
    play(input, race, kind) {
      generation++;
      state = race || {};
      own = kind === "sheep" ? "sheep" : "horse";
      rival = own === "horse" ? "sheep" : "horse";
      mode = input;
      still = Boolean(api.still());
      shell.classList.toggle("r-still", still);
      shell.hidden = false;
      shell.getAnimations().forEach((a) => a.cancel());
      measure();
      app.renderer.resize(W, H);
      build();
      pick();
      enter();
      last = performance.now();
      raf = requestAnimationFrame(tick);
      return new Promise((done) => { resolve = done; });
    },
    destroy() {
      abort();
      for (const id of timers) clearTimeout(id);
      observer.disconnect();
      document.removeEventListener("keydown", key);
      teardownScene();
      for (const s of pool.splice(0)) s.destroy();
      app.destroy(true, { children: true });
      owned.forEach((t) => t.destroy(true));
      shell.remove();
    },
  };
}
