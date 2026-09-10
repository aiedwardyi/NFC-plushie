const toggle = document.querySelector("#claim-toggle");
const form = document.querySelector("#claim-form");

toggle?.addEventListener("click", () => {
  form.hidden = !form.hidden;
  toggle.setAttribute("aria-expanded", String(!form.hidden));
  if (!form.hidden) document.querySelector("#code").focus();
});

window.addEventListener("pagehide", () => document.querySelector(".recovery")?.remove());
window.addEventListener("pageshow", (event) => {
  if (event.persisted) window.location.reload();
});

const TIME_LINES = {
  morning: "아침 인사예요",
  day: "한낮의 안녕",
  evening: "저녁 인사예요",
  night: "잘 자요",
};

function currentBand(date = new Date()) {
  const h = date.getHours();
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 18) return "day";
  if (h >= 18 && h < 22) return "evening";
  return "night";
}

function applyTimeBand() {
  const band = currentBand();
  document.documentElement.dataset.time = band;
  document.body.dataset.time = band;
  const line = document.querySelector("[data-time-line]");
  if (line) line.textContent = TIME_LINES[band] || "";
  return band;
}

const pet = document.querySelector('[data-pet="alive"]');
if (pet) {
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reduceMotion = motionQuery.matches;
  const frames = {
    canon: pet.querySelector('[data-frame="canon"]'),
    blink: pet.querySelector('[data-frame="blink"]'),
    react: pet.querySelector('[data-frame="react"]'),
    sleepy: pet.querySelector('[data-frame="sleepy"]'),
  };
  let pressTimer = 0;
  let blinkTimer = 0;
  let band = applyTimeBand();

  function restingFrame() {
    return band === "night" ? "sleepy" : "canon";
  }

  function showFrame(name) {
    for (const [key, el] of Object.entries(frames)) {
      el?.classList.toggle("is-show", key === name);
    }
  }

  function scheduleBlink() {
    clearTimeout(blinkTimer);
    if (reduceMotion || band === "night") return;
    blinkTimer = window.setTimeout(() => {
      if (pet.classList.contains("is-press") || band === "night") {
        scheduleBlink();
        return;
      }
      showFrame("blink");
      window.setTimeout(() => {
        if (!pet.classList.contains("is-press")) showFrame(restingFrame());
        scheduleBlink();
      }, 120);
    }, 3000 + Math.random() * 4000);
  }

  function syncBand() {
    band = applyTimeBand();
    pet.classList.toggle("is-night", band === "night");
    if (!pet.classList.contains("is-press")) showFrame(restingFrame());
    scheduleBlink();
  }

  function onMotionChange() {
    reduceMotion = motionQuery.matches;
    scheduleBlink();
  }
  if (typeof motionQuery.addEventListener === "function") {
    motionQuery.addEventListener("change", onMotionChange);
  } else if (typeof motionQuery.addListener === "function") {
    motionQuery.addListener(onMotionChange);
  }

  if (pet.classList.contains("enter")) {
    const motion = pet.querySelector(".pet-motion");
    const clearEnter = () => pet.classList.remove("enter");
    const onEnterEnd = (event) => {
      if (event.animationName === "enter") {
        motion?.removeEventListener("animationend", onEnterEnd);
        clearEnter();
      }
    };
    motion?.addEventListener("animationend", onEnterEnd);
    window.setTimeout(clearEnter, 600);
  }

  syncBand();
  setInterval(syncBand, 60 * 1000);

  function react() {
    try {
      navigator.vibrate?.(10);
    } catch (_) {
      /* ignore */
    }
    clearTimeout(pressTimer);
    pet.classList.add("is-press");
    showFrame("react");
    pressTimer = window.setTimeout(() => {
      pet.classList.remove("is-press");
      showFrame(restingFrame());
    }, 700);
  }

  const hit = pet.querySelector(".pet-hit");
  let skipClick = false;
  hit?.addEventListener("pointerdown", (event) => {
    skipClick = true;
    try {
      hit.setPointerCapture(event.pointerId);
    } catch (_) {
      /* ignore */
    }
    react();
  });
  hit?.addEventListener("pointerup", () => {
    setTimeout(() => {
      skipClick = false;
    }, 0);
  });
  hit?.addEventListener("pointercancel", () => {
    skipClick = false;
  });
  hit?.addEventListener("click", (event) => {
    if (skipClick) {
      skipClick = false;
      event.preventDefault();
      return;
    }
    react();
  });
} else {
  applyTimeBand();
}


const CELEBRATE_COLORS = ["#3d6f94", "#f5d76e", "#f2a6b0", "#faf8f1", "#f0c84a", "#e8a0a0"];
const FRAME_MS = 1000 / 60;
const EVOLUTION_MS = 2900;
const FLICKER_ON_MS = 140;
// Milestone flash timeline (ms from start), counting every silhouette/color swap and the end flash:
// 500 silhouette on, 640 color, 1700 silhouette on, 1840 color, 2900 end flash.
// Claim flash timeline: 0 start flash only.
// Worst 1s window milestone: 2. Claim: 1.
const CLAIM_PARTICLES = 360;
const MILE_PARTICLES = 120;
const CLAIM_DURATION = 2500;
const MILE_DURATION = 1100;
const FLASH_OPACITY = 0.62;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function ensureCelebrateCanvas() {
  document.querySelectorAll("canvas.celebrate-layer").forEach((node) => {
    node.dispatchEvent(new Event("celebrate-stop"));
    node.remove();
  });
  const canvas = document.createElement("canvas");
  canvas.className = "celebrate-layer";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return null;
  }
  return { canvas, ctx };
}

function spawnCannonBurst(pieces, originX, originY, count, big) {
  for (let i = 0; i < count; i++) {
    const angle = big
      ? -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.95
      : Math.random() * Math.PI * 2;
    const speed = (big ? 7 : 4) + Math.random() * (big ? 9 : 5);
    pieces.push({
      x: originX + (Math.random() - 0.5) * 24,
      y: originY + (Math.random() - 0.5) * 16,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (big ? 5 : 2.5),
      w: 4 + Math.random() * 6,
      h: 6 + Math.random() * 8,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
      color: CELEBRATE_COLORS[(Math.random() * CELEBRATE_COLORS.length) | 0],
    });
  }
}

function burstConfetti({ mode = "claim", onStop } = {}) {
  if (prefersReducedMotion()) {
    onStop?.();
    return;
  }
  const layer = ensureCelebrateCanvas();
  if (!layer) {
    onStop?.();
    return;
  }
  const { canvas, ctx } = layer;
  const big = mode === "claim";
  const duration = big ? CLAIM_DURATION : MILE_DURATION;
  const gravity = big ? 0.16 : 0.12;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();

  const pieces = [];
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (big) {
    const corner = Math.floor(CLAIM_PARTICLES * 0.28);
    const center = CLAIM_PARTICLES - corner * 2;
    spawnCannonBurst(pieces, 24, h - 12, corner, true);
    spawnCannonBurst(pieces, w - 24, h - 12, corner, true);
    spawnCannonBurst(pieces, w / 2, h * 0.32, center, false);
  } else {
    spawnCannonBurst(pieces, w / 2, h * 0.28, MILE_PARTICLES, false);
  }

  const started = performance.now();
  let last = started;
  let frame = 0;
  let stopped = false;
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  function teardown() {
    if (stopped) return;
    stopped = true;
    window.cancelAnimationFrame(frame);
    frame = 0;
    window.removeEventListener("resize", onResize);
    canvas.removeEventListener("celebrate-stop", teardown);
    if (typeof motionQuery.removeEventListener === "function") {
      motionQuery.removeEventListener("change", onMotionChange);
    } else if (typeof motionQuery.removeListener === "function") {
      motionQuery.removeListener(onMotionChange);
    }
    canvas.remove();
    onStop?.();
  }

  function onResize() {
    resize();
  }

  function onMotionChange() {
    if (motionQuery.matches) teardown();
  }

  function tick(now) {
    if (stopped) return;
    const elapsed = now - started;
    const dt = Math.min(now - last, 50) / FRAME_MS;
    last = now;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of pieces) {
      p.vy += gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, 1 - elapsed / duration);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (elapsed < duration) {
      frame = window.requestAnimationFrame(tick);
    } else {
      teardown();
    }
  }

  window.addEventListener("resize", onResize);
  if (typeof motionQuery.addEventListener === "function") {
    motionQuery.addEventListener("change", onMotionChange);
  } else if (typeof motionQuery.addListener === "function") {
    motionQuery.addListener(onMotionChange);
  }
  canvas.addEventListener("celebrate-stop", teardown);
  frame = window.requestAnimationFrame(tick);
}

function pulseFlash(opacity = FLASH_OPACITY, ms = 160) {
  if (prefersReducedMotion()) return;
  const flash = document.createElement("div");
  flash.className = "celebrate-flash";
  flash.style.setProperty("--flash-opacity", String(opacity));
  flash.setAttribute("aria-hidden", "true");
  document.body.appendChild(flash);
  window.setTimeout(() => flash.remove(), ms);
}

function shakeScreen(ms = 280) {
  if (prefersReducedMotion()) return;
  document.body.classList.add("is-shake");
  window.setTimeout(() => document.body.classList.remove("is-shake"), ms);
}

function tryVibrate(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch (_) {
    /* ignore */
  }
}

function enhanceRollingCounter({ duration = 400, goldPop = false } = {}) {
  const countEl = document.querySelector("[data-tap-count]");
  if (!countEl) return;
  const finalValue = Number(countEl.getAttribute("data-tap-count"));
  if (!Number.isFinite(finalValue)) return;
  const finalNode = countEl.querySelector(".count-final") || countEl;
  countEl.setAttribute("aria-label", `우리 ${finalValue}번 토닥였어요!`);

  if (prefersReducedMotion()) {
    finalNode.textContent = `우리 ${finalValue}번 토닥였어요!`;
    return;
  }

  const digits = String(finalValue);
  const strips = digits.split("").map((digit) => {
    const strip = document.createElement("span");
    strip.className = "odometer-digit";
    strip.setAttribute("aria-hidden", "true");
    const track = document.createElement("span");
    track.className = "odometer-track";
    for (let n = 0; n <= 9; n++) {
      const cell = document.createElement("span");
      cell.className = "odometer-cell";
      cell.textContent = String(n);
      track.appendChild(cell);
    }
    strip.appendChild(track);
    track.style.transform = "translateY(0)";
    requestAnimationFrame(() => {
      track.style.transition = `transform ${duration}ms cubic-bezier(.2,.8,.2,1)`;
      track.style.transform = `translateY(-${Number(digit) * 10}%)`;
    });
    return strip;
  });

  finalNode.replaceChildren();
  finalNode.append("우리 ", ...strips, "번 토닥였어요!");

  window.setTimeout(() => {
    if (goldPop) {
      countEl.classList.add("is-gold-pop");
      window.setTimeout(() => countEl.classList.remove("is-gold-pop"), 700);
    }
  }, duration);
}

function currentDuckSrc(pet) {
  const shown = pet?.querySelector(".pet-frame.is-show");
  return shown?.getAttribute("src") || "/mascot-duck-512.png";
}

function runEvolutionGlow({ onComplete } = {}) {
  const pet = document.querySelector('[data-pet="alive"]');
  const mileEl = document.querySelector(".milestone");
  if (!pet || prefersReducedMotion()) {
    onComplete?.();
    return;
  }

  const duckSrc = currentDuckSrc(pet);
  pet.style.setProperty("--duck-src", `url("${duckSrc.replace(/["()]/g, encodeURIComponent)}")`);

  const overlay = document.createElement("div");
  overlay.className = "evo-overlay";
  overlay.setAttribute("aria-hidden", "true");
  const rays = document.createElement("div");
  rays.className = "evo-rays";
  rays.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 10; i++) {
    const ray = document.createElement("span");
    ray.className = "evo-ray";
    ray.style.setProperty("--ray-rot", i * 36 + "deg");
    rays.appendChild(ray);
  }
  const silhouette = document.createElement("div");
  silhouette.className = "evo-silhouette";
  const sweep = document.createElement("div");
  sweep.className = "evo-sweep";
  overlay.append(silhouette, sweep);
  pet.append(rays, overlay);
  pet.classList.add("is-evolving");
  document.body.classList.add("is-evo-dim");

  const started = performance.now();
  let finished = false;
  let frame = 0;
  // Two silhouette pulses (drop one) so every swap + end flash stays under 3 per 1s window.
  // Events: 500 on, 640 off, 1700 on, 1840 off, 2900 end flash. Worst 1s window: 2.
  const flickerAt = [500, 1700];
  let flickerIndex = 0;

  function endState() {
    if (finished) return;
    finished = true;
    window.cancelAnimationFrame(frame);
    document.body.removeEventListener("pointerdown", skip, true);
    document.body.removeEventListener("keydown", skipKey, true);
    overlay.classList.remove("is-silhouette");
    pulseFlash(0.58, 180);
    pet.classList.add("is-evo-bounce");
    mileEl?.classList.add("is-glow");
    burstConfetti({ mode: "milestone" });
    enhanceRollingCounter({ duration: 1000, goldPop: true });
    window.setTimeout(() => {
      overlay.remove();
      rays.remove();
      pet.classList.remove("is-evolving", "is-evo-bounce");
      pet.style.removeProperty("--duck-src");
      document.body.classList.remove("is-evo-dim");
      mileEl?.classList.remove("is-glow");
      onComplete?.();
    }, 650);
  }

  function skip() {
    endState();
  }
  function skipKey(event) {
    if (event.key === "Enter" || event.key === " " || event.key === "Escape") endState();
  }

  document.body.addEventListener("pointerdown", skip, true);
  document.body.addEventListener("keydown", skipKey, true);

  function tick(now) {
    if (finished) return;
    const elapsed = now - started;
    while (flickerIndex < flickerAt.length && elapsed >= flickerAt[flickerIndex]) {
      overlay.classList.add("is-silhouette");
      window.setTimeout(() => {
        if (!finished) overlay.classList.remove("is-silhouette");
      }, FLICKER_ON_MS);
      flickerIndex += 1;
    }
    if (elapsed >= EVOLUTION_MS) {
      endState();
      return;
    }
    frame = window.requestAnimationFrame(tick);
  }
  frame = window.requestAnimationFrame(tick);
  window.setTimeout(() => overlay.classList.add("is-sweeping"), 180);
}

function paintHearts(container, halves) {
  const kids = container.querySelectorAll(".heart");
  kids.forEach((el, i) => {
    const fill = Math.max(0, Math.min(2, halves - i * 2));
    el.dataset.fill = String(fill);
    el.classList.toggle("is-full", fill === 2);
    el.classList.toggle("is-half", fill === 1);
    el.classList.toggle("is-empty", fill === 0);
  });
  container.dataset.hearts = String(halves);
}

function animateHearts() {
  const hearts = document.querySelector("[data-hearts-animate]");
  if (!hearts) return;
  const before = Number(hearts.dataset.moodBefore);
  const after = Number(hearts.dataset.moodAfter);
  if (!Number.isFinite(before) || !Number.isFinite(after) || before >= after || prefersReducedMotion()) {
    paintHearts(hearts, Number.isFinite(after) ? after : before);
    return;
  }
  const DURATION = 900;
  const started = performance.now();
  let frame = 0;
  function tick(now) {
    const t = Math.min(1, (now - started) / DURATION);
    paintHearts(hearts, Math.round(before + (after - before) * t));
    if (t < 1) {
      frame = window.requestAnimationFrame(tick);
    } else {
      window.cancelAnimationFrame(frame);
    }
  }
  frame = window.requestAnimationFrame(tick);
}

function heartBurst() {
  if (prefersReducedMotion()) return;
  const layer = ensureCelebrateCanvas();
  if (!layer) return;
  const { canvas, ctx } = layer;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pet = document.querySelector('[data-pet="alive"]');
  const rect = pet?.getBoundingClientRect();
  const ox = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const oy = rect ? rect.top + rect.height * 0.3 : window.innerHeight * 0.3;
  const pieces = [];
  const colors = ["#e86a8a", "#f2a6b0", "#d94f70", "#f5d76e"];
  for (let i = 0; i < 26; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
    const speed = 4 + Math.random() * 6;
    pieces.push({
      x: ox, y: oy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 4,
      size: 8 + Math.random() * 10,
      rot: (Math.random() - 0.5) * 0.8,
      vr: (Math.random() - 0.5) * 0.1,
      color: colors[(Math.random() * colors.length) | 0],
    });
  }
  const DURATION = 1400;
  const started = performance.now();
  let last = started;
  let frame = 0;
  let stopped = false;
  function teardown() {
    if (stopped) return;
    stopped = true;
    window.cancelAnimationFrame(frame);
    canvas.remove();
  }
  canvas.addEventListener("celebrate-stop", teardown);
  function drawHeart(s) {
    ctx.save();
    ctx.translate(0, 0);
    ctx.scale(s / 24, s / 24);
    ctx.beginPath();
    ctx.moveTo(12, 21);
    ctx.bezierCurveTo(4, 15, 1, 11, 1, 7);
    ctx.bezierCurveTo(1, 3, 4, 1, 7, 1);
    ctx.bezierCurveTo(9.5, 1, 11, 2.5, 12, 4.5);
    ctx.bezierCurveTo(13, 2.5, 14.5, 1, 17, 1);
    ctx.bezierCurveTo(20, 1, 23, 3, 23, 7);
    ctx.bezierCurveTo(23, 11, 20, 15, 12, 21);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  function tick(now) {
    if (stopped) return;
    const elapsed = now - started;
    const dt = Math.min(now - last, 50) / FRAME_MS;
    last = now;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of pieces) {
      p.vy += 0.14 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, 1 - elapsed / DURATION);
      ctx.fillStyle = p.color;
      drawHeart(p.size);
      ctx.restore();
    }
    if (elapsed < DURATION) {
      frame = window.requestAnimationFrame(tick);
    } else {
      teardown();
    }
  }
  frame = window.requestAnimationFrame(tick);
}

function reunionJump() {
  const pet = document.querySelector('[data-pet="alive"]');
  if (!pet || prefersReducedMotion()) return;
  pet.classList.add("is-reunion-jump");
  tryVibrate([40, 60, 40]);
  window.setTimeout(() => pet.classList.remove("is-reunion-jump"), 900);
}

function glowGift() {
  const gift = document.querySelector("[data-gift]");
  if (!gift || prefersReducedMotion()) return;
  gift.classList.add("is-glow");
  window.setTimeout(() => gift.classList.remove("is-glow"), 1200);
}

function runCelebrate() {
  animateHearts();
  const kind = document.body.dataset.celebrate;
  if (kind !== "claim" && kind !== "levelup" && kind !== "reunion" && kind !== "milestone" && kind !== "rare" && kind !== "special") {
    if (document.querySelector("[data-tap-count]")) {
      enhanceRollingCounter({ duration: 400, goldPop: false });
    }
    return;
  }
  delete document.body.dataset.celebrate;

  if (kind === "claim") {
    pulseFlash(FLASH_OPACITY, 150);
    shakeScreen(300);
    tryVibrate([30, 40, 30, 40, 80]);
    burstConfetti({ mode: "claim" });
    enhanceRollingCounter({ duration: 400, goldPop: false });
    return;
  }

  if (kind === "levelup") {
    if (prefersReducedMotion()) {
      enhanceRollingCounter({ duration: 0, goldPop: false });
      return;
    }
    runEvolutionGlow();
    return;
  }

  if (kind === "reunion") {
    reunionJump();
    heartBurst();
    enhanceRollingCounter({ duration: 400, goldPop: false });
    return;
  }

  if (kind === "milestone") {
    if (prefersReducedMotion()) {
      enhanceRollingCounter({ duration: 0, goldPop: false });
      const mileEl = document.querySelector(".milestone");
      mileEl?.classList.add("is-glow");
      window.setTimeout(() => mileEl?.classList.remove("is-glow"), 400);
      return;
    }
    const mileEl = document.querySelector(".milestone");
    mileEl?.classList.add("is-glow");
    window.setTimeout(() => mileEl?.classList.remove("is-glow"), 1200);
    burstConfetti({ mode: "milestone" });
    enhanceRollingCounter({ duration: 1000, goldPop: true });
    return;
  }

  if (kind === "rare") {
    glowGift();
    burstConfetti({ mode: "milestone" });
    enhanceRollingCounter({ duration: 400, goldPop: false });
    return;
  }

  if (kind === "special") {
    glowGift();
    enhanceRollingCounter({ duration: 400, goldPop: false });
  }
}

runCelebrate();
