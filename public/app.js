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
const EVOLUTION_MS = 2800;
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
      vx: Math.cos(angle) * speed * (big ? 1 : 1),
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
  pet.style.setProperty("--duck-src", `url("${duckSrc}")`);

  const overlay = document.createElement("div");
  overlay.className = "evo-overlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <div class="evo-rays"></div>
    <div class="evo-silhouette"></div>
    <div class="evo-sweep"></div>
  `;
  pet.appendChild(overlay);
  pet.classList.add("is-evolving");
  document.body.classList.add("is-evo-dim");

  const started = performance.now();
  let finished = false;
  let frame = 0;
  // Three silhouette pulses, accelerating, spaced so any 1s window has <=3 flashes.
  const flickerAt = [380, 780, 1080];
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
      const idx = flickerIndex;
      window.setTimeout(() => {
        if (!finished) overlay.classList.remove("is-silhouette");
      }, 140);
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

function runCelebrate() {
  const kind = document.body.dataset.celebrate;
  if (kind !== "claim" && kind !== "milestone") {
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

  if (prefersReducedMotion()) {
    enhanceRollingCounter({ duration: 0, goldPop: false });
    const mileEl = document.querySelector(".milestone");
    mileEl?.classList.add("is-glow");
    window.setTimeout(() => mileEl?.classList.remove("is-glow"), 400);
    return;
  }

  runEvolutionGlow();
}

runCelebrate();
