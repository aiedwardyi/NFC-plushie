/* Dad demo: horse↔sheep corner toggle. Persist localStorage+cookie. binding.js untouched. */
(function mascotDemoToggle() {
  const KEY = "pokkey-mascot";
  const MAX_AGE = String(400 * 24 * 60 * 60);

  function readKind() {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("mascot");
      if (q === "sheep" || q === "horse") return q;
    } catch (_) { /* ignore */ }
    try {
      const ls = localStorage.getItem(KEY);
      if (ls === "sheep" || ls === "horse") return ls;
    } catch (_) { /* ignore */ }
    try {
      const m = document.cookie.match(/(?:^|; )mascot=(sheep|horse)(?:;|$)/);
      if (m) return m[1];
    } catch (_) { /* ignore */ }
    const htmlKind = document.documentElement.getAttribute("data-mascot");
    return htmlKind === "sheep" ? "sheep" : "horse";
  }

  function persist(kind) {
    try { localStorage.setItem(KEY, kind); } catch (_) { /* ignore */ }
    try {
      document.cookie = "mascot=" + kind + ";path=/;max-age=" + MAX_AGE + ";samesite=lax";
    } catch (_) { /* ignore */ }
    // Drop sticky ?mascot= so it can't fight the toggle on the next read/navigation.
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("mascot")) {
        url.searchParams.delete("mascot");
        const next = url.pathname + (url.search ? url.search : "") + url.hash;
        window.history.replaceState(null, "", next);
      }
    } catch (_) { /* ignore */ }
  }

  function frameSrc(img, kind) {
    const src = img.getAttribute("src") || "";
    const away = src.includes("-away-") || Boolean(img.closest(".pet-away"));
    return away ? `/mascot-${kind}-away-512-v3.png` : `/mascot-${kind}-512-v3.png`;
  }

  function applyArt(kind) {
    document.documentElement.setAttribute("data-mascot", kind);
    document.querySelectorAll("img.pet-frame").forEach((img) => {
      img.setAttribute("src", frameSrc(img, kind));
    });
    document.querySelectorAll(".mascot-tog").forEach((btn) => {
      const on = btn.getAttribute("data-mascot") === kind;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function bouncePet() {
    const pet = document.querySelector(".pet");
    if (!pet) return;
    try { navigator.vibrate?.(10); } catch (_) { /* ignore */ }
    pet.classList.remove("is-press");
    void pet.offsetWidth;
    const motion = pet.querySelector(".pet-motion");
    if (motion) {
      motion.style.animation = "none";
      void motion.offsetWidth;
      motion.style.animation = "";
    }
    pet.classList.add("is-press");
    window.setTimeout(() => pet.classList.remove("is-press"), 700);
  }

  let kind = readKind();
  persist(kind);
  applyArt(kind);

  let skipClick = false;

  function swapTo(next) {
    if (next !== "horse" && next !== "sheep") return;
    if (next === kind) {
      bouncePet();
      return;
    }
    kind = next;
    persist(kind);
    applyArt(kind); // swap FIRST so the squash is of the new pet
    bouncePet(); // same tick — one continuous motion
  }

  function onPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    skipClick = true;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch (_) { /* ignore */ }
    swapTo(event.currentTarget.getAttribute("data-mascot"));
  }

  function onClick(event) {
    if (skipClick) {
      skipClick = false;
      event.preventDefault();
      return;
    }
    swapTo(event.currentTarget.getAttribute("data-mascot"));
  }

  document.querySelectorAll(".mascot-tog").forEach((btn) => {
    btn.addEventListener("pointerdown", onPointerDown);
    btn.addEventListener("click", onClick);
  });
})();

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
  morning: "좋은 아침이에요",
  day: "즐거운 오후예요",
  evening: "좋은 저녁이에요",
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

let reactPet = () => {};
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
    // Restart squash even mid-animation (class reflow + iOS animation reset).
    pet.classList.remove("is-press");
    void pet.offsetWidth;
    const motion = pet.querySelector(".pet-motion");
    if (motion) {
      motion.style.animation = "none";
      void motion.offsetWidth;
      motion.style.animation = "";
    }
    pet.classList.add("is-press");
    showFrame("react");
    pressTimer = window.setTimeout(() => {
      pet.classList.remove("is-press");
      showFrame(restingFrame());
    }, 700);
  }

  reactPet = react;
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
    touchFx(event.clientX, event.clientY);
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
    touchFx();
  });
} else {
  applyTimeBand();
}

// Inline style attributes are blocked by the CSP, so the key bar width is applied here.
document.querySelectorAll(".xp-fill[data-xp]").forEach((fill) => {
  fill.style.width = `${Number(fill.dataset.xp) || 0}%`;
});

const nameplate = document.querySelector("[data-nameplate]");

function fitName() {
  if (!nameplate) return;
  nameplate.style.fontSize = "";
  const base = parseFloat(getComputedStyle(nameplate).fontSize);
  nameplate.style.whiteSpace = "nowrap";
  const need = nameplate.scrollWidth;
  const room = nameplate.clientWidth;
  nameplate.style.whiteSpace = "";
  if (need <= room || room <= 0) return;
  let size = (base * room) / need;
  // Too small on one line: two balanced lines read better.
  if (size < 22) size = Math.min(base, ((base * room * 2) / need) * 0.9);
  nameplate.style.fontSize = `${Math.max(16, Math.floor(size))}px`;
}

fitName();
document.fonts?.ready.then(fitName);
window.addEventListener("resize", fitName);

const nameInput = document.querySelector("[data-name-input]");
if (nameplate && nameInput) {
  const placeholder = nameplate.dataset.placeholder || nameplate.textContent;
  const syncName = () => {
    const value = nameInput.value.trim();
    nameplate.textContent = value || placeholder;
    nameplate.classList.toggle("is-placeholder", !value);
    nameplate.classList.toggle("is-typing", Boolean(value) && document.activeElement === nameInput);
    fitName();
  };
  const frameNaming = () => {
    const view = window.visualViewport?.height || window.innerHeight;
    const top = nameplate.getBoundingClientRect().top + window.scrollY;
    const bottom = nameInput.getBoundingClientRect().bottom + window.scrollY;
    if (bottom - top + 24 <= view) window.scrollTo({ top: Math.max(0, top - 12), behavior: prefersReducedMotion() ? "auto" : "smooth" });
    else nameInput.scrollIntoView({ block: "center" });
  };
  nameInput.addEventListener("input", syncName);
  nameInput.addEventListener("focus", () => {
    document.body.classList.add("is-naming");
    syncName();
    window.setTimeout(frameNaming, prefersReducedMotion() ? 0 : 380);
  });
  nameInput.addEventListener("blur", () => {
    syncName();
    // Late, so a tap on the submit button lands before the stage grows back.
    window.setTimeout(() => {
      if (document.activeElement !== nameInput) document.body.classList.remove("is-naming");
    }, 250);
  });
  window.visualViewport?.addEventListener("resize", () => {
    if (document.activeElement === nameInput) frameNaming();
  });
}

const copyButton = document.querySelector("[data-copy]");
copyButton?.addEventListener("click", async () => {
  const code = document.querySelector(".recovery .code");
  const label = copyButton.querySelector("[data-copy-label]");
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code.textContent.trim());
    copyButton.classList.add("is-done");
    if (label) label.textContent = "복사했어요";
  } catch (_) {
    const range = document.createRange();
    range.selectNodeContents(code);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
});


const CELEBRATE_COLORS = ["#d6a546", "#f1d68c", "#e8806b", "#f8f0e3", "#f4ded5", "#fff9f0"];
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

const stillCelebrateTimers = [];

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function clearStillCelebrate() {
  for (const id of stillCelebrateTimers) window.clearTimeout(id);
  stillCelebrateTimers.length = 0;
  document.querySelectorAll(".still-wash, .still-sparkles, .still-claim-card, .still-named-card").forEach((node) => {
    node.remove();
  });
  document.body.classList.remove(
    "is-still-celebrate",
    "is-still-fade",
    "is-still-claim",
    "is-still-milestone",
    "is-still-levelup",
  );
  document.querySelectorAll(".is-still-gold, .is-still-card").forEach((el) => {
    el.classList.remove("is-still-gold", "is-still-card");
  });
}

function showStillCelebrate(kind) {
  clearStillCelebrate();
  const holdMs = kind === "claim" ? 2200 : 2000;
  const visual = kind === "named" ? "milestone" : kind;
  document.body.classList.add("is-still-celebrate", `is-still-${visual}`);

  const wash = document.createElement("div");
  wash.className = "still-wash";
  wash.setAttribute("aria-hidden", "true");
  document.body.insertBefore(wash, document.body.firstChild);

  const sparks = document.createElement("div");
  sparks.className = "still-sparkles";
  sparks.setAttribute("aria-hidden", "true");
  // Fixed margin slots only (corners / side gutters). Never over the centered pet or copy.
  const claimSlots = [
    [5, 8], [95, 7], [4, 22], [96, 24], [3, 48], [97, 50],
    [5, 72], [95, 74], [8, 90], [92, 92], [2, 35], [98, 62],
  ];
  const smallSlots = [
    [5, 10], [95, 12], [4, 78], [96, 80], [3, 45], [97, 48],
  ];
  const slots = visual === "claim" ? claimSlots : smallSlots;
  for (const [left, top] of slots) {
    const star = document.createElement("span");
    star.className = "still-sparkle";
    if (visual === "claim") star.classList.add("is-claim-sparkle");
    star.style.left = `${left}%`;
    star.style.top = `${top}%`;
    sparks.appendChild(star);
  }
  document.body.insertBefore(sparks, wash.nextSibling);

  let claimCard = null;
  let namedCard = null;
  let mileCard = null;
  switch (kind) {
    case "claim": {
      claimCard = document.createElement("p");
      claimCard.className = "still-claim-card";
      claimCard.textContent = "오늘부터 우리 친구예요!";
      const main = document.querySelector("main");
      const intro = main?.querySelector("[data-dialog]") || main?.querySelector(".intro");
      if (intro) intro.insertAdjacentElement("afterend", claimCard);
      else main?.insertAdjacentElement("afterbegin", claimCard);
      break;
    }
    case "named": {
      namedCard = document.createElement("p");
      namedCard.className = "still-named-card";
      namedCard.textContent = "예쁜 이름 고마워요!";
      const main = document.querySelector("main");
      const intro = main?.querySelector("[data-dialog]") || main?.querySelector(".intro");
      if (intro) intro.insertAdjacentElement("afterend", namedCard);
      else main?.insertAdjacentElement("afterbegin", namedCard);
      break;
    }
    case "milestone": {
      mileCard = document.querySelector(".milestone");
      mileCard?.classList.add("is-still-card");
      break;
    }
    case "levelup": {
      const level = document.querySelector(".level-line") || document.querySelector(".level-badge");
      if (level) {
        mileCard = level;
        level.classList.add("is-still-card", "is-still-gold");
      }
      break;
    }
    default:
      break;
  }

  const goldTargets = [
    document.querySelector("[data-tap-count]"),
    document.querySelector(".level-line"),
    document.querySelector(".level-badge"),
    document.querySelector(".milestone"),
  ].filter(Boolean);
  for (const el of goldTargets) el.classList.add("is-still-gold");

  stillCelebrateTimers.push(window.setTimeout(() => {
    document.body.classList.add("is-still-fade");
    stillCelebrateTimers.push(window.setTimeout(() => {
      clearStillCelebrate();
    }, 450));
  }, holdMs));
}


function claimSeenKey(uid) {
  return `nfc-claim-seen:${uid}`;
}

function hasClaimSeen(uid) {
  if (!uid) return false;
  try {
    return sessionStorage.getItem(claimSeenKey(uid)) === "1";
  } catch {
    return false;
  }
}

function markClaimSeen(uid) {
  if (!uid) return;
  try {
    sessionStorage.setItem(claimSeenKey(uid), "1");
  } catch {
    /* private mode */
  }
}

function pageUid() {
  return document.querySelector('input[name="uid"]')?.value
    || document.body.dataset.uid
    || "";
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
  countEl.setAttribute("aria-label", `${finalValue}번 토닥여 줬어요!`);

  if (prefersReducedMotion()) {
    finalNode.textContent = `${finalValue}번 토닥여 줬어요!`;
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
  finalNode.append(...strips, "번 토닥여 줬어요!");

  window.setTimeout(() => {
    if (goldPop) {
      countEl.classList.add("is-gold-pop");
      window.setTimeout(() => countEl.classList.remove("is-gold-pop"), 700);
    }
  }, duration);
}

function currentPetSrc(pet) {
  const shown = pet?.querySelector(".pet-frame.is-show");
  return shown?.getAttribute("src") || "/mascot-horse-512-v3.png";
}

function runEvolutionGlow({ onComplete } = {}) {
  const pet = document.querySelector('[data-pet="alive"]');
  const mileEl = document.querySelector(".milestone");
  if (!pet || prefersReducedMotion()) {
    onComplete?.();
    return;
  }

  const petSrc = currentPetSrc(pet);
  pet.style.setProperty("--pet-src", `url("${petSrc.replace(/["()]/g, encodeURIComponent)}")`);

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
      pet.style.removeProperty("--pet-src");
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
  paintHearts(hearts, before);
  const DURATION = 900;
  const started = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - started) / DURATION);
    paintHearts(hearts, Math.round(before + (after - before) * t));
    if (t < 1) {
      window.requestAnimationFrame(tick);
    }
  }
  window.requestAnimationFrame(tick);
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
  const colors = ["#e8806b", "#f4ded5", "#d9604b", "#f1d68c"];
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
  const gift = document.querySelector(".gift[data-gift]");
  if (!gift || prefersReducedMotion()) return;
  gift.classList.add("is-glow");
  window.setTimeout(() => gift.classList.remove("is-glow"), 1200);
}

function runCelebrate() {
  animateHearts();
  const kind = document.body.dataset.celebrate;
  if (kind !== "claim" && kind !== "named" && kind !== "levelup" && kind !== "reunion" && kind !== "milestone" && kind !== "rare" && kind !== "special") {
    if (document.querySelector("[data-tap-count]")) {
      enhanceRollingCounter({ duration: 400, goldPop: false });
    }
    return;
  }
  delete document.body.dataset.celebrate;

  if (kind === "claim") {
    const uid = pageUid();
    if (hasClaimSeen(uid)) return;
    markClaimSeen(uid);
    if (prefersReducedMotion()) {
      showStillCelebrate("claim");
      enhanceRollingCounter({ duration: 0, goldPop: false });
      return;
    }
    pulseFlash(FLASH_OPACITY, 150);
    shakeScreen(300);
    tryVibrate([30, 40, 30, 40, 80]);
    burstConfetti({ mode: "claim" });
    enhanceRollingCounter({ duration: 400, goldPop: false });
    return;
  }

  if (kind === "named") {
    if (prefersReducedMotion()) {
      showStillCelebrate("named");
      enhanceRollingCounter({ duration: 0, goldPop: false });
      return;
    }
    const mileEl = document.querySelector(".milestone");
    mileEl?.classList.add("is-glow");
    window.setTimeout(() => mileEl?.classList.remove("is-glow"), 1200);
    burstConfetti({ mode: "milestone" });
    enhanceRollingCounter({ duration: 1000, goldPop: true });
    return;
  }

  if (kind === "levelup") {
    if (prefersReducedMotion()) {
      showStillCelebrate("levelup");
      enhanceRollingCounter({ duration: 0, goldPop: false });
      return;
    }
    document.body.classList.add("is-levelup-glow");
    runEvolutionGlow({
      onComplete: () => document.body.classList.remove("is-levelup-glow"),
    });
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
      showStillCelebrate("milestone");
      enhanceRollingCounter({ duration: 0, goldPop: false });
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

const TYPE_MS = 55;
const PAUSE_MS = { "!": 260, ".": 260, "?": 260, ",": 140 };
let audio = null;
let introLine = null;
let waking = false;

function wakeAudio() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    audio.resume?.();
  } catch (_) {
    audio = null;
  }
}

function blip() {
  if (!audio || audio.state !== "running") return;
  const t = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(820 + Math.random() * 90, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.14, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
  osc.connect(gain).connect(audio.destination);
  osc.start(t);
  osc.stop(t + 0.06);
}

function boop() {
  if (!audio || audio.state !== "running") return;
  const t = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(620 + Math.random() * 60, t);
  osc.frequency.exponentialRampToValueAtTime(330, t + 0.14);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.2, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  osc.connect(gain).connect(audio.destination);
  osc.start(t);
  osc.stop(t + 0.22);
}

function ensureAudio(then) {
  wakeAudio();
  if (!audio) return;
  if (audio.state === "running") then?.();
  else audio.resume?.().then(() => then?.(), () => {});
}

const HEART_SVG = '<svg viewBox="0 0 24 22" aria-hidden="true"><path d="M12 20.5C6.4 16.9 2.5 13.4 2.5 9.3 2.5 6.4 4.8 4.5 7.4 4.5c1.9 0 3.5 1 4.6 2.7 1.1-1.7 2.7-2.7 4.6-2.7 2.6 0 4.9 1.9 4.9 4.8 0 4.1-3.9 7.6-9.5 11.2z"/></svg>';

function touchFx(clientX, clientY) {
  ensureAudio(boop);
  const win = document.querySelector("[data-window]");
  if (!win || prefersReducedMotion()) return;
  const box = win.getBoundingClientRect();
  let x = clientX;
  let y = clientY;
  if (x === undefined) {
    const spot = document.querySelector('[data-pet="alive"]')?.getBoundingClientRect() || box;
    x = spot.left + spot.width / 2;
    y = spot.top + spot.height * 0.35;
  }
  const old = win.querySelectorAll(".touch-heart");
  for (let i = 0; i < old.length - 12; i++) old[i].remove();
  for (let i = 0; i < 3; i++) {
    const heart = document.createElement("span");
    heart.className = "touch-heart";
    heart.setAttribute("aria-hidden", "true");
    heart.innerHTML = HEART_SVG;
    heart.style.setProperty("--x", `${x - box.left}px`);
    heart.style.setProperty("--y", `${y - box.top}px`);
    heart.style.setProperty("--dx", `${(i - 1) * 22 + (Math.random() - 0.5) * 14}px`);
    heart.style.setProperty("--r", `${(i - 1) * 14}deg`);
    heart.style.setProperty("--d", `${i * 70}ms`);
    win.appendChild(heart);
    window.setTimeout(() => heart.remove(), 1300);
  }
}

function typeLine(intro, line, onDone, delay = 520) {
  const chars = Array.from(line);
  const text = document.createElement("span");
  const cursor = document.createElement("span");
  const spoken = document.createElement("span");
  text.setAttribute("aria-hidden", "true");
  cursor.className = "dialog-cursor";
  cursor.setAttribute("aria-hidden", "true");
  spoken.className = "visually-hidden";
  spoken.textContent = line;
  intro.replaceChildren(text, cursor, spoken);
  intro.classList.add("is-dialog");
  let i = 0;
  let timer = 0;
  let done = false;
  function finish() {
    if (done) return;
    done = true;
    window.clearTimeout(timer);
    document.removeEventListener("pointerdown", finish, true);
    text.textContent = line;
    cursor.classList.add("is-done");
    onDone(cursor);
  }
  function step() {
    const ch = chars[i++];
    text.textContent += ch;
    cursor.style.animation = "none";
    void cursor.offsetWidth;
    cursor.style.animation = "";
    if (ch.trim()) blip();
    if (i >= chars.length) {
      finish();
      return;
    }
    timer = window.setTimeout(step, PAUSE_MS[ch] || TYPE_MS);
  }
  document.addEventListener("pointerdown", finish, true);
  timer = window.setTimeout(step, delay);
}

function startWake(onDone) {
  const intro = document.querySelector("[data-dialog] .intro");
  if (!intro || waking || prefersReducedMotion()) {
    onDone?.();
    return;
  }
  waking = true;
  introLine = introLine ?? lineText(intro);
  sayToken += 1;
  window.clearTimeout(lineTimer);
  lineReady = false;
  showLine(0);
  const body = document.body;
  body.classList.remove("is-awake", "is-revealed");
  body.dataset.wake = "";
  intro.classList.remove("is-dialog");
  intro.textContent = introLine;
  const call = document.createElement("p");
  call.className = "wake-call";
  call.textContent = "저를 토닥여 주세요";
  document.querySelector("[data-window]")?.appendChild(call);

  function wake(event) {
    if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
    document.removeEventListener("pointerdown", wake, true);
    document.removeEventListener("keydown", wake, true);
    wakeAudio();
    reactPet();
    tryVibrate(12);
    call.classList.add("is-gone");
    window.setTimeout(() => call.remove(), 400);
    body.classList.add("is-awake");
    typeLine(intro, introLine, (cursor) => {
      window.setTimeout(() => {
        cursor.remove();
        body.classList.add("is-revealed");
        window.setTimeout(() => {
          delete body.dataset.wake;
          body.classList.remove("is-awake", "is-revealed");
          waking = false;
        }, 700);
        if (dialogBox?.classList.contains("is-seq")) settleLine(0);
        onDone?.();
      }, 650);
    });
  }
  // Deferred so the tap that opened a replay can't also wake it.
  window.setTimeout(() => {
    document.addEventListener("pointerdown", wake, true);
    document.addEventListener("keydown", wake, true);
  }, 0);
}

const AUTO_MS = 2200;
const dialogBox = document.querySelector("[data-dialog]");
const dialogLines = dialogBox
  ? Array.from(dialogBox.querySelectorAll(":scope > .intro, :scope > .pet-moments > p, :scope > .gift"))
  : [];
let lineIndex = 0;
let lineReady = false;
let lineTimer = 0;
let sayToken = 0;

function lineTarget(el) {
  return el.querySelector(".gift-text") || el;
}

function lineText(el) {
  const target = lineTarget(el);
  target.dataset.say ??= target.textContent.trim();
  return target.dataset.say;
}

function showLine(index) {
  lineIndex = index;
  dialogLines.forEach((el, i) => el.classList.toggle("is-current", i === index));
}

function settleLine(index) {
  // Ready on the next task, so the tap that finished the typing can't also skip ahead.
  window.setTimeout(() => {
    lineReady = true;
  }, 0);
  const last = index >= dialogLines.length - 1;
  dialogBox.classList.toggle("is-end", last);
  if (!last) lineTimer = window.setTimeout(() => sayLine(index + 1), AUTO_MS);
}

function sayLine(index) {
  const token = ++sayToken;
  const el = dialogLines[index];
  window.clearTimeout(lineTimer);
  lineReady = false;
  dialogBox.classList.remove("is-end");
  const text = lineText(el);
  showLine(index);
  if (el.classList.contains("gift")) glowGift();
  typeLine(lineTarget(el), text, () => {
    if (token === sayToken) settleLine(index);
  }, index === 0 ? 520 : 160);
}

function startDialog() {
  if (!dialogLines.length || prefersReducedMotion()) return;
  dialogBox.classList.add("is-seq");
  sayLine(0);
}

dialogBox?.addEventListener("pointerdown", () => {
  if (!dialogBox.classList.contains("is-seq") || !lineReady || waking) return;
  sayLine(dialogBox.classList.contains("is-end") ? 0 : lineIndex + 1);
});

let sheetOpen = null;
let sheetOpener = null;

function openSheet(id, opener) {
  const sheet = document.querySelector(`[data-sheet="${id}"]`);
  if (!sheet || sheetOpen) return;
  sheetOpen = sheet;
  sheetOpener = opener || null;
  sheet.hidden = false;
  void sheet.offsetWidth;
  sheet.classList.add("is-open");
  document.body.classList.add("has-sheet");
  sheet.querySelector("[data-sheet-close]")?.focus({ preventScroll: true });
}

function closeSheet() {
  const sheet = sheetOpen;
  if (!sheet) return;
  sheetOpen = null;
  sheet.classList.remove("is-open");
  document.body.classList.remove("has-sheet");
  window.setTimeout(() => {
    sheet.hidden = true;
  }, prefersReducedMotion() ? 0 : 300);
  sheetOpener?.focus({ preventScroll: true });
}

document.querySelectorAll("[data-open]").forEach((button) => {
  button.addEventListener("click", () => openSheet(button.dataset.open, button));
});
document.querySelectorAll("[data-sheet]").forEach((sheet) => {
  sheet.addEventListener("click", (event) => {
    if (event.target === sheet) closeSheet();
  });
  sheet.querySelector("[data-sheet-close]")?.addEventListener("click", closeSheet);
});
document.addEventListener("keydown", (event) => {
  if (!sheetOpen) return;
  if (event.key === "Escape") {
    closeSheet();
    return;
  }
  if (event.key !== "Tab") return;
  const items = Array.from(sheetOpen.querySelectorAll("button, [href], input"));
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

const TIER_WORDS = { special: "특별한 선물", rare: "반짝 선물" };
const giftReader = document.querySelector("[data-gift-reader]");
document.querySelector("[data-gift-grid]")?.addEventListener("click", (event) => {
  const tile = event.target.closest("button.tile");
  if (!tile || !giftReader) return;
  document.querySelectorAll(".tile.is-picked").forEach((el) => el.classList.remove("is-picked"));
  tile.classList.add("is-picked");
  const tier = tile.dataset.tier;
  const parts = [];
  if (TIER_WORDS[tier]) {
    const label = document.createElement("span");
    label.className = "reader-label";
    label.textContent = TIER_WORDS[tier];
    parts.push(label);
  }
  const text = document.createElement("span");
  text.className = "reader-text";
  parts.push(text);
  giftReader.className = `gift-reader is-${tier}`;
  giftReader.replaceChildren(...parts);
  if (prefersReducedMotion()) {
    text.textContent = tile.dataset.line;
    return;
  }
  ensureAudio();
  typeLine(text, tile.dataset.line, () => {}, 120);
});

document.querySelector("[data-dock-pat]")?.addEventListener("click", () => {
  reactPet();
  touchFx();
});

if (document.querySelector('[data-rewarded="1"]')) document.querySelector(".level-line")?.classList.add("is-growing");
document.addEventListener("pointerdown", wakeAudio, { once: true, capture: true });

/* Legendary reveal: 15s video, the owner's name and first-meet date drawn live over it. */
const reveal = (function legendaryReveal() {
  const W = 1080;
  const H = 1920;
  const FPS = 60;
  const SAFE = { left: 100, right: 980, top: 200, bottom: 1830 };
  const NAME_PX = 228;
  const NAME_BOX = NAME_PX * 1.05;
  const NAME_ROOM = 940;
  const NAME_MIN = 110;
  // Frames from the legendary cue sheet.
  const NAME_AT = 720;
  const DATE_AT = 806;
  const BEAT = [30, 90, 22];
  const FAST_BEAT = [24, 60, 16];
  const BUZZ = [
    [8, BEAT], [44, BEAT], [190, 22], [202, 10], [209, 10], [216, 10], [223, 10], [240, 70], [330, 45], [420, 90],
    [436, FAST_BEAT], [458, FAST_BEAT], [476, FAST_BEAT], [491, FAST_BEAT], [503, FAST_BEAT], [510, 0],
    [570, 420], [660, 60], [690, 140], [720, 180], [738, 16], [750, 16], [762, 16], [774, 16], [786, 16],
  ];
  const GOLD = "linear-gradient(180deg, #FFFBEA 0%, #FBE3A0 40%, #E2AC48 72%, #B47A22 100%)";

  const lerp = (a, b, t) => a + (b - a) * t;
  const span = (f, a, b) => Math.min(1, Math.max(0, (f - a) / (b - a)));
  const inQuad = (t) => t * t;
  const outCubic = (t) => 1 - Math.pow(1 - t, 3);
  const hitAt = (f, f0, decay) => (f < f0 ? 0 : Math.exp((-decay * (f - f0)) / FPS));
  function spring(f, f0, hz, zeta) {
    const t = (f - f0) / FPS;
    if (t <= 0) return 0;
    const w = 2 * Math.PI * hz;
    const wd = w * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t));
  }

  let overlay = null;
  let stage = null;
  let video = null;
  let nameEl = null;
  let nameEdge = null;
  let nameGold = null;
  let dateEl = null;
  let skip = null;
  let kind = "";
  let nameText = "";
  let room = NAME_ROOM;
  let run = null;

  function build() {
    overlay = document.createElement("div");
    overlay.className = "reveal";
    overlay.hidden = true;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "이름 공개 영상");
    stage = document.createElement("div");
    stage.className = "reveal-stage";
    video = document.createElement("video");
    video.className = "reveal-video";
    video.preload = "auto";
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("disablepictureinpicture", "");
    video.setAttribute("disableremoteplayback", "");
    const owner = document.createElement("div");
    owner.className = "reveal-owner";
    nameEl = document.createElement("span");
    nameEl.className = "reveal-name";
    nameEdge = document.createElement("span");
    nameEdge.className = "reveal-name-edge";
    nameEdge.setAttribute("aria-hidden", "true");
    nameGold = document.createElement("span");
    nameGold.className = "reveal-name-gold";
    nameEl.append(nameEdge, nameGold);
    owner.appendChild(nameEl);
    dateEl = document.createElement("div");
    dateEl.className = "reveal-date";
    skip = document.createElement("button");
    skip.type = "button";
    skip.className = "reveal-skip";
    skip.textContent = "건너뛰기";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "reveal-retry";
    retry.textContent = "다시 시도";
    const actions = document.createElement("div");
    actions.className = "reveal-actions";
    actions.append(retry, skip);
    stage.append(video, owner, dateEl);
    overlay.append(stage, actions);
    document.body.appendChild(overlay);
    skip.addEventListener("click", () => run?.finish());
    retry.addEventListener("click", () => run?.retry());
    video.addEventListener("ended", () => run?.hold());
    video.addEventListener("error", () => run?.fail());
    video.addEventListener("waiting", () => run?.waiting());
    video.addEventListener("playing", () => run?.playing());
    video.addEventListener("seeked", () => run?.seeked());
  }

  function load() {
    video.src = `/reveal/diamond-${kind}.mp4`;
    video.load();
  }

  function prepare(next) {
    if (!overlay) build();
    // A failed preload keeps its kind, so reload it rather than replay the error.
    if (kind === next && !video.error && video.networkState !== video.NETWORK_NO_SOURCE) return;
    kind = next;
    load();
  }

  function layout() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const s = Math.min(Math.max(vw / W, vh / H), vw / (SAFE.right - SAFE.left), vh / (SAFE.bottom - SAFE.top));
    const place = (view, size, center) => (size > view
      ? Math.min(0, Math.max(view - size, view / 2 - center * s))
      : (view - size) / 2);
    const x = place(vw, W * s, (SAFE.left + SAFE.right) / 2);
    const y = place(vh, H * s, (SAFE.top + SAFE.bottom) / 2);
    stage.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    overlay.classList.toggle("is-pillar", W * s < vw - 0.5);
    overlay.classList.toggle("is-letter", H * s < vh - 0.5);
    // A 940 wide name would still clip on a phone that crops the stage sides.
    room = Math.min(NAME_ROOM, Math.min(W, vw / s) - 24);
    fitName();
  }

  function twoLines(text) {
    const chars = Array.from(text);
    const mid = chars.length / 2;
    let cut = -1;
    chars.forEach((ch, i) => {
      if (ch === " " && (cut < 0 || Math.abs(i - mid) < Math.abs(cut - mid))) cut = i;
    });
    if (cut > 0) return `${chars.slice(0, cut).join("")}\n${chars.slice(cut + 1).join("")}`;
    const half = Math.ceil(mid);
    return `${chars.slice(0, half).join("")}\n${chars.slice(half).join("")}`;
  }

  function setName(text) {
    nameEdge.textContent = text;
    nameGold.textContent = text;
  }

  function fitName() {
    setName(nameText);
    nameEl.style.fontSize = "";
    nameEl.style.lineHeight = "";
    const wide = nameEl.offsetWidth;
    if (!wide || wide <= room) return;
    const one = (NAME_PX * room) / wide;
    if (one >= NAME_MIN) {
      nameEl.style.fontSize = `${one}px`;
      nameEl.style.lineHeight = `${NAME_BOX}px`;
      return;
    }
    setName(twoLines(nameText));
    const size = Math.min(NAME_BOX / 2 / 1.05, (NAME_PX * room) / nameEl.offsetWidth);
    nameEl.style.fontSize = `${size}px`;
    nameEl.style.lineHeight = `${NAME_BOX / 2}px`;
  }

  function paint(f) {
    const drop = span(f, NAME_AT - 7, NAME_AT);
    nameEl.style.visibility = drop > 0 ? "visible" : "hidden";
    if (drop > 0) {
      const land = f >= NAME_AT ? 1 - spring(f, NAME_AT, 3.6, 0.3) : 0;
      const sweep = lerp(-30, 110, span(f, NAME_AT + 14, NAME_AT + 50));
      const glow = hitAt(f, NAME_AT, 4);
      const scale = lerp(1.9, 1, inQuad(drop));
      nameGold.style.backgroundImage = `linear-gradient(105deg, transparent ${sweep - 12}%, rgba(255,255,255,0.95) ${sweep}%, transparent ${sweep + 12}%), ${GOLD}`;
      nameEl.style.filter = `blur(${lerp(14, 0, inQuad(drop))}px) drop-shadow(0 10px 0 #070A16) drop-shadow(0 0 ${34 + 50 * glow}px rgba(255,206,110,${0.4 + 0.5 * glow}))`;
      nameEl.style.transform = `scale(${scale * (1 + 0.1 * land)}, ${scale * (1 - 0.15 * land)})`;
      nameEl.style.opacity = String(Math.min(1, drop * 2.5));
    }
    overlay.classList.toggle("is-named", f >= NAME_AT);
    const dateP = span(f, DATE_AT, DATE_AT + 20);
    dateEl.style.opacity = String(0.85 * dateP);
    dateEl.style.transform = `translateY(${lerp(12, 0, outCubic(dateP))}px)`;
  }

  function exitFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }

  function close() {
    run?.stop();
    run = null;
    video.pause();
    exitFullscreen();
    overlay.hidden = true;
    overlay.classList.remove("is-out", "is-skippable", "is-loading", "is-failed");
    document.documentElement.classList.remove("has-reveal");
  }

  // Must run inside the tap's handler: play() with sound and fullscreen both need that gesture.
  function play({ kind: next, name, date, onEnd }) {
    prepare(next);
    run?.stop();
    nameText = name;
    dateEl.textContent = `${date} · 첫 만남`;
    overlay.hidden = false;
    overlay.classList.remove("is-out", "is-skippable", "is-failed");
    overlay.classList.add("is-loading");
    document.documentElement.classList.add("has-reveal");
    document.activeElement?.blur?.();
    layout();
    paint(0);

    const fired = new Set();
    let last = 0;
    let done = false;
    let frame = 0;
    let stall = 0;
    let attempt = 0;
    const timers = [];
    const later = (fn, ms) => timers.push(window.setTimeout(fn, ms));

    function buzz(f) {
      if (f > last && f - last < 30) {
        for (const [at, pattern] of BUZZ) {
          if (at > last && at <= f && !fired.has(at)) {
            fired.add(at);
            if (navigator.vibrate) tryVibrate(pattern);
          }
        }
      }
      last = f;
    }
    function tick(time) {
      const f = time * FPS;
      paint(f);
      if (video.seeking) last = f;
      else buzz(f);
    }
    function loop() {
      if (done) return;
      if (video.requestVideoFrameCallback) {
        frame = video.requestVideoFrameCallback((now, meta) => {
          tick(meta.mediaTime);
          loop();
        });
      } else {
        frame = window.requestAnimationFrame(() => {
          tick(video.currentTime);
          loop();
        });
      }
    }
    function stop() {
      done = true;
      window.clearTimeout(stall);
      timers.forEach((id) => window.clearTimeout(id));
      if (video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(frame);
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", layout);
      document.removeEventListener("fullscreenchange", layout);
      if (fired.size && navigator.vibrate) tryVibrate(0);
    }
    function end() {
      if (done) return;
      stop();
      video.pause();
      exitFullscreen();
      overlay.classList.add("is-out");
      window.setTimeout(onEnd, 450);
    }
    function fail() {
      if (done) return;
      if (video.error) overlay.classList.remove("is-loading");
      overlay.classList.add("is-skippable", "is-failed");
    }
    function start() {
      const id = ++attempt;
      window.clearTimeout(stall);
      stall = window.setTimeout(fail, 15000);
      video.muted = false;
      if (video.currentTime) video.currentTime = 0;
      Promise.resolve(video.play()).catch(() => {
        if (id === attempt) fail();
      });
    }
    const self = {
      stop,
      fail,
      finish: end,
      hold: () => later(end, 1000),
      waiting: () => overlay.classList.add("is-loading"),
      playing: () => {
        window.clearTimeout(stall);
        overlay.classList.remove("is-loading", "is-failed");
      },
      // Runs in the retry tap, so play() keeps the gesture.
      retry: () => {
        overlay.classList.remove("is-failed");
        overlay.classList.add("is-loading");
        load();
        start();
      },
      seeked: () => {
        paint(video.currentTime * FPS);
        last = video.currentTime * FPS;
      },
    };
    run = self;

    window.addEventListener("resize", layout);
    document.addEventListener("fullscreenchange", layout);
    document.fonts?.load(`900 ${NAME_PX}px "Pretendard Variable"`, name).then(() => {
      if (!done) fitName();
    }, () => {});
    later(() => overlay.classList.add("is-skippable"), 1500);

    start();
    loop();
    if (overlay.requestFullscreen) overlay.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    return true;
  }

  return { prepare, play, close };
})();

function seoulDay(ms = Date.now()) {
  return new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function revealDate(day) {
  return day.replaceAll("-", ". ");
}

function revealKind() {
  return document.documentElement.dataset.mascot === "sheep" ? "sheep" : "horse";
}

const nameForm = document.querySelector(".name-form");

function armReveal() {
  if (nameForm && !prefersReducedMotion()) reveal.prepare(revealKind());
}

// The key card pushes the form below the fold; bring it up under the code unless the user already scrolled.
function frameNameForm() {
  if (!nameForm || window.scrollY > 0) return;
  const view = window.visualViewport?.height || window.innerHeight;
  const bottom = nameForm.getBoundingClientRect().bottom + 12;
  if (bottom <= view) return;
  const code = document.querySelector(".recovery .code");
  const top = code ? Math.min(bottom - view, code.getBoundingClientRect().top - 12) : bottom - view;
  window.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

nameForm?.addEventListener("submit", (event) => {
  const name = nameForm.elements.name.value.trim();
  const size = Array.from(name).length;
  if (!size || size > 24 || prefersReducedMotion()) return;
  event.preventDefault();
  const uid = nameForm.elements.uid.value;
  const saved = fetch("/name", {
    method: "POST",
    body: new URLSearchParams(new FormData(nameForm)),
    redirect: "manual",
    credentials: "same-origin",
  }).then((res) => res.type === "opaqueredirect", () => false);
  reveal.play({
    kind: revealKind(),
    name,
    date: revealDate(nameForm.dataset.met || seoulDay()),
    onEnd: () => {
      const cap = new Promise((resolve) => window.setTimeout(() => resolve(false), 10000));
      Promise.race([saved, cap]).then((ok) => {
        if (ok) window.location.replace(`/t?uid=${encodeURIComponent(uid)}`);
        else nameForm.submit();
      });
    },
  });
});

const demoSheet = document.querySelector("[data-demo-panel]");
const demoHold = document.querySelector("[data-demo-hold]");
if (demoSheet && demoHold) {
  const HOLD_MS = 1500;
  const replayReveal = demoSheet.querySelector("[data-reveal-replay]");
  let holdTimer = 0;
  let holdAt = null;

  function openDemo() {
    tryVibrate(15);
    if (replayReveal) reveal.prepare(revealKind());
    demoSheet.hidden = false;
    void demoSheet.offsetWidth;
    demoSheet.classList.add("is-open");
  }
  function closeDemo(then) {
    demoSheet.classList.remove("is-open");
    window.setTimeout(() => {
      demoSheet.hidden = true;
      then?.();
    }, prefersReducedMotion() ? 0 : 260);
  }
  function cancelHold() {
    window.clearTimeout(holdTimer);
    holdAt = null;
  }

  demoHold.addEventListener("pointerdown", (event) => {
    holdAt = [event.clientX, event.clientY];
    window.clearTimeout(holdTimer);
    holdTimer = window.setTimeout(() => {
      holdAt = null;
      openDemo();
    }, HOLD_MS);
  });
  demoHold.addEventListener("pointermove", (event) => {
    if (holdAt && Math.hypot(event.clientX - holdAt[0], event.clientY - holdAt[1]) > 12) cancelHold();
  });
  demoHold.addEventListener("pointerup", cancelHold);
  demoHold.addEventListener("pointercancel", cancelHold);
  demoHold.addEventListener("contextmenu", (event) => event.preventDefault());

  demoSheet.addEventListener("click", (event) => {
    if (event.target === demoSheet) closeDemo();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !demoSheet.hidden) closeDemo();
  });
  demoSheet.querySelector("[data-demo-close]")?.addEventListener("click", () => closeDemo());
  demoSheet.querySelector("[data-demo-replay]")?.addEventListener("click", () => {
    closeDemo(() => {
      window.scrollTo(0, 0);
      startWake();
    });
  });
  replayReveal?.addEventListener("click", () => {
    closeDemo();
    reveal.play({
      kind: revealKind(),
      name: nameplate?.textContent.trim() || "",
      date: revealDate(replayReveal.dataset.met || seoulDay()),
      onEnd: () => reveal.close(),
    });
  });
  demoSheet.querySelector("[data-demo-fresh]")?.addEventListener("submit", () => {
    try {
      sessionStorage.removeItem(claimSeenKey(pageUid()));
    } catch {
      /* private mode */
    }
  });
}

if (document.body.hasAttribute("data-wake")) {
  startWake(() => {
    runCelebrate();
    armReveal();
    frameNameForm();
  });
} else {
  runCelebrate();
  startDialog();
  armReveal();
}
document.documentElement.setAttribute("data-app", "");
