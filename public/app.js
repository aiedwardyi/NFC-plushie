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
    return (img.getAttribute("src") || "").replace(/mascot-(?:horse|sheep)-/, `mascot-${kind}-`);
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
let facePet = () => {};
let syncPet = () => {};
// Care owns the pet's face and sky while it acts or sleeps, and may take a touch first.
const careHold = { busy: false, asleep: false, touch: null };
// Set only while talk is on: anything else taking the speech line drops the pet's pending answer.
let talkHook = null;
const pet = document.querySelector('[data-pet="alive"]');
if (pet) {
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reduceMotion = motionQuery.matches;
  const frames = Object.fromEntries(Array.from(pet.querySelectorAll("[data-frame]"), (el) => [el.dataset.frame, el]));
  let pressTimer = 0;
  let blinkTimer = 0;
  let band = applyTimeBand();

  function restingFrame() {
    if (careHold.asleep) return "blink";
    return band === "night" ? "sleepy" : "canon";
  }

  function showFrame(name) {
    for (const [key, el] of Object.entries(frames)) {
      el?.classList.toggle("is-show", key === name);
    }
  }

  function scheduleBlink() {
    clearTimeout(blinkTimer);
    if (reduceMotion || band === "night" || careHold.asleep) return;
    blinkTimer = window.setTimeout(() => {
      if (pet.classList.contains("is-press") || careHold.busy || band === "night") {
        scheduleBlink();
        return;
      }
      showFrame("blink");
      window.setTimeout(() => {
        if (!pet.classList.contains("is-press") && !careHold.busy) showFrame(restingFrame());
        scheduleBlink();
      }, 120);
    }, 3000 + Math.random() * 4000);
  }

  function syncBand() {
    if (careHold.asleep) return;
    band = applyTimeBand();
    pet.classList.toggle("is-night", band === "night");
    if (!pet.classList.contains("is-press") && !careHold.busy) showFrame(restingFrame());
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
    if (careHold.busy || careHold.asleep) return;
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
      if (!careHold.busy && !careHold.asleep) showFrame(restingFrame());
    }, 700);
  }

  reactPet = react;
  facePet = (name) => showFrame(name || restingFrame());
  syncPet = syncBand;
  const hit = pet.querySelector(".pet-hit");
  let skipClick = false;
  hit?.addEventListener("pointerdown", (event) => {
    skipClick = true;
    try {
      hit.setPointerCapture(event.pointerId);
    } catch (_) {
      /* ignore */
    }
    if (careHold.touch?.(event.clientX, event.clientY)) return;
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
    if (careHold.touch?.()) return;
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
  // A theme can swap the art with content:url, so read what is on screen.
  const art = shown ? /^url\("?(.+?)"?\)$/.exec(getComputedStyle(shown).content) : null;
  return art?.[1] || shown?.getAttribute("src") || "/mascot-horse-512-v3.png";
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
  const px = document.documentElement.dataset.theme === "8bit";
  osc.type = px ? "square" : "triangle";
  osc.frequency.setValueAtTime(820 + Math.random() * 90, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(px ? 0.1 : 0.14, t + 0.006);
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

function tick() {
  if (!audio || audio.state !== "running") return;
  const t = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(1500, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.09, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
  osc.connect(gain).connect(audio.destination);
  osc.start(t);
  osc.stop(t + 0.035);
}

function ensureAudio(then) {
  wakeAudio();
  if (!audio) return;
  if (audio.state === "running") then?.();
  else audio.resume?.().then(() => then?.(), () => {});
}

const SFX_V = 3;
const SFX_LATE_MS = 1500;
const sfx = new Map();

// Bytes load without a gesture; decoding waits for the AudioContext, which needs one.
function loadSfx(name) {
  if (!sfx.has(name)) {
    const bytes = fetch(`/sfx/${name}.mp3?v=${SFX_V}`).then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))));
    bytes.catch(() => sfx.delete(name));
    sfx.set(name, { bytes, buffer: null });
  }
  return sfx.get(name);
}

function sfxBuffer(name) {
  const clip = loadSfx(name);
  if (!clip.buffer) {
    clip.buffer = clip.bytes.then((bytes) => audio.decodeAudioData(bytes));
    clip.buffer.catch(() => sfx.delete(name));
  }
  return clip.buffer;
}

let sfxClip = null;

// Identity up to |x| = 0.8, then a tanh knee, so overlapping sounds never hard-clip.
function sfxOut() {
  if (!sfxClip) {
    sfxClip = audio.createWaveShaper();
    sfxClip.curve = Float32Array.from({ length: 4097 }, (_, i) => {
      const x = i / 2048 - 1;
      const a = Math.abs(x);
      return a <= 0.8 ? x : Math.sign(x) * (0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2));
    });
    sfxClip.oversample = "2x";
    sfxClip.connect(audio.destination);
  }
  return sfxClip;
}

function playSfx(name, { rate = 1, gain = 1 } = {}) {
  const asked = performance.now();
  ensureAudio(() => {
    sfxBuffer(name).then((buffer) => {
      if (performance.now() - asked > SFX_LATE_MS || audio.state !== "running") return;
      const source = audio.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = rate;
      let out = sfxOut();
      if (gain !== 1) {
        const level = audio.createGain();
        level.gain.value = gain;
        level.connect(out);
        out = level;
      }
      source.connect(out);
      source.start();
    }, () => {});
  });
}

function cryName(mood = "happy", theme = document.documentElement.dataset.theme || "classic") {
  return `cry-${theme}-${mood}`;
}

function cry(mood, theme) {
  playSfx(cryName(mood, theme), { rate: 0.96 + Math.random() * 0.08 });
}

const HEART_SVG = '<svg viewBox="0 0 24 22" aria-hidden="true"><path d="M12 20.5C6.4 16.9 2.5 13.4 2.5 9.3 2.5 6.4 4.8 4.5 7.4 4.5c1.9 0 3.5 1 4.6 2.7 1.1-1.7 2.7-2.7 4.6-2.7 2.6 0 4.9 1.9 4.9 4.8 0 4.1-3.9 7.6-9.5 11.2z"/></svg>';

function touchFx(clientX, clientY) {
  ensureAudio(boop);
  floatHearts(clientX, clientY);
}

function floatHearts(clientX, clientY) {
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
  return finish;
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
    cry();
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
  const token = sayToken;
  // Ready on the next task, so the tap that finished the typing can't also skip ahead.
  window.setTimeout(() => {
    if (token === sayToken) lineReady = true;
  }, 0);
  const last = index >= dialogLines.length - 1;
  dialogBox.classList.toggle("is-end", last);
  if (!last) lineTimer = window.setTimeout(() => sayLine(index + 1), AUTO_MS);
}

function sayLine(index, onTyped) {
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
    onTyped?.();
  }, index === 0 ? 520 : 160);
}

function startDialog(onTyped) {
  if (!dialogLines.length || prefersReducedMotion()) {
    onTyped?.();
    return;
  }
  dialogBox.classList.add("is-seq");
  sayLine(0, onTyped);
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
  talkHook?.close(true);
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

const themeSheet = document.querySelector('[data-sheet="theme"]');
if (themeSheet) {
  const root = document.documentElement;
  const LINES = {
    classic: "다시 우리 방이에요!",
    "8bit": "어? 제가 픽셀이 됐어요!",
    milk: "딸기우유 냄새가 나요!",
    najeon: "어머, 반짝반짝해요.",
  };
  const FONTS = { "8bit": '700 16px "Galmuri11"', milk: '16px "Cafe24Ssurround"', najeon: '700 16px "Gowun Batang"' };
  const ART = {
    "8bit": (kind) => [`${kind}-px.png`, `${kind}-away-px.png`, "lock.svg", "cloud.svg", "heart-full.svg", "heart-half.svg", "heart-empty.svg", "feed.svg", "play.svg", "sleep.svg", `${kind}-closed-px.png`, `${kind}-happy-px.png`, "arcade.svg", "gift.svg", "record.svg", "close.svg", "star.svg", "lock-dim.svg"],
    milk: () => ["strawberry.svg"],
    najeon: () => ["najeon-scene.svg"],
  };
  const READY_CAP_MS = 1200;
  const SAY_MS = 650;
  const cards = Array.from(themeSheet.querySelectorAll("[data-pick]"));
  const links = new Map();
  const ready = new Map();
  let applied = root.dataset.theme || "classic";
  let switching = false;
  let say = null;
  let sayTimer = 0;

  const cryMood = (id) => (id === "8bit" ? "ask" : "happy");

  function sheetLink(href) {
    if (!links.has(href)) {
      let link = document.querySelector(`link[href="${href}"]`);
      if (!link) {
        link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        if (href.startsWith("/")) document.querySelector('link[href="/mascot-toggle.css"]').after(link);
        else document.head.appendChild(link);
      }
      links.set(href, link.sheet ? Promise.resolve(true) : new Promise((resolve) => {
        link.addEventListener("load", () => resolve(true), { once: true });
        // A failed link never loads again, so drop it and let the next pick retry.
        link.addEventListener("error", () => {
          link.remove();
          links.delete(href);
          resolve(false);
        }, { once: true });
      }));
    }
    return links.get(href);
  }

  function decodeArt(file) {
    const img = new Image();
    img.src = `/themes/px/${file}`;
    return img.decode().catch(() => {});
  }

  function prepare(id) {
    const kind = root.dataset.mascot === "sheep" ? "sheep" : "horse";
    const key = `${id}:${kind}`;
    if (!ready.has(key)) {
      const css = id === "classic" ? Promise.resolve(true) : sheetLink(`/themes/${id}.css`);
      const faces = id === "najeon" ? Promise.all(["400", "700"].map((w) => sheetLink(`https://cdn.jsdelivr.net/npm/@fontsource/gowun-batang@5.3.0/${w}.css`))) : css;
      const text = `${document.querySelector("main")?.textContent || ""}${LINES[id]}`;
      const done = Promise.all([
        css,
        ...(ART[id]?.(kind) || []).map(decodeArt),
        faces.then(() => FONTS[id] && document.fonts?.load(FONTS[id], text)).catch(() => {}),
      ]);
      ready.set(key, done);
      css.then((ok) => {
        if (!ok && ready.get(key) === done) ready.delete(key);
      });
    }
    return ready.get(key);
  }

  function preload() {
    for (const card of cards) {
      const id = card.dataset.pick;
      if (id !== applied) prepare(id);
      for (const name of [`switch-${id}`, cryName(cryMood(id), id)]) {
        if (audio) sfxBuffer(name);
        else loadSfx(name);
      }
    }
  }

  function speak(line, still) {
    say?.stop();
    const win = document.querySelector("[data-window]");
    if (!win) return;
    const bubble = document.createElement("p");
    bubble.className = "theme-say";
    win.appendChild(bubble);
    let timer = 0;
    let finish = null;
    const fade = () => {
      timer = window.setTimeout(() => {
        bubble.classList.add("is-gone");
        timer = window.setTimeout(() => bubble.remove(), 400);
      }, 1800);
    };
    if (still) {
      bubble.textContent = line;
      fade();
    } else {
      finish = typeLine(bubble, line, fade, 160);
    }
    say = {
      stop() {
        finish?.();
        window.clearTimeout(timer);
        bubble.remove();
      },
    };
  }

  function greet(id, { pop = false, still = false } = {}) {
    if (careHold.asleep) {
      cry("mumble", id);
      return;
    }
    reactPet();
    cry(cryMood(id), id);
    tryVibrate(id === "8bit" ? [30, 40, 30] : 18);
    const pet = document.querySelector(".pet");
    if (pop && pet) {
      pet.classList.remove("is-pop");
      void pet.offsetWidth;
      pet.classList.add("is-pop");
      window.setTimeout(() => pet.classList.remove("is-pop"), 520);
    }
    window.clearTimeout(sayTimer);
    if (still) speak(LINES[id], true);
    else sayTimer = window.setTimeout(() => speak(LINES[id], false), 260);
  }

  function apply(id) {
    if (id === "classic") delete root.dataset.theme;
    else root.dataset.theme = id;
    applied = id;
    care?.restyle();
    combo?.restyle();
    arcade?.restyle();
  }

  function flip(id, color) {
    playSfx(`switch-${id}`);
    document.cookie = id === "classic"
      ? "theme=;path=/;max-age=0;samesite=lax"
      : `theme=${id};path=/;max-age=${400 * 24 * 60 * 60};samesite=lax`;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
    const still = prefersReducedMotion();
    if (!document.startViewTransition) {
      apply(id);
      greet(id, { pop: !still, still });
      window.setTimeout(() => {
        switching = false;
      }, SAY_MS);
      return;
    }
    const pet = document.querySelector(".pet");
    if (pet && !still) {
      const box = pet.getBoundingClientRect();
      root.style.setProperty("--vt-x", `${box.left + box.width / 2}px`);
      root.style.setProperty("--vt-y", `${box.top + box.height * 0.45}px`);
      root.dataset.vt = id === "8bit" ? "px" : "on";
    }
    const vt = document.startViewTransition(() => apply(id));
    vt.ready.catch(() => {});
    const greeted = new Promise((resolve) => {
      window.setTimeout(() => {
        greet(id, { still });
        resolve();
      }, still ? 0 : SAY_MS);
    });
    Promise.all([vt.finished.catch(() => {}), greeted]).then(() => {
      delete root.dataset.vt;
      switching = false;
    });
  }

  function pick(card) {
    const id = card.dataset.pick;
    if (switching || id === applied) return;
    switching = true;
    cards.forEach((el) => el.setAttribute("aria-pressed", String(el === card)));
    ensureAudio(tick);
    const cap = new Promise((resolve) => window.setTimeout(resolve, READY_CAP_MS));
    Promise.race([prepare(id), cap]).then(() => flip(id, card.dataset.color));
  }

  document.querySelector('[data-open="theme"]')?.addEventListener("click", preload);
  themeSheet.querySelector(".theme-grid").addEventListener("click", (event) => {
    const card = event.target.closest("[data-pick]");
    if (card) pick(card);
  });
}

/* Care: 밥 · 놀이 · 잠 with a want bubble, lights out, and the wake on the next plushie tap. */
const care = (function careLoop() {
  const dock = document.querySelector(".dock[data-want]");
  const win = document.querySelector("[data-window]");
  const intro = dialogBox?.querySelector(".intro");
  if (!dock || !pet || !win || !intro) return null;
  const root = document.documentElement;
  const motion = pet.querySelector(".pet-motion");
  const hearts = document.querySelector(".pet-stats .hearts");
  const demo = document.querySelector("[data-demo-panel]");
  const owner = dock.dataset.careUid || "";
  const world = () => root.dataset.theme || "classic";
  const still = () => prefersReducedMotion();
  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  function pxsvg(rows, pal) {
    let rects = "";
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (pal[ch]) rects += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${pal[ch]}"/>`;
    }));
    return `<svg viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
  }
  const PX_PAL = { k: "#1d1d2b", r: "#ff004d", d: "#7e2553", w: "#fff1e8", g: "#00e436", G: "#008751", b: "#ab5236", y: "#ffec27", o: "#ffa300", p: "#ff77a8" };
  const PX_APPLE = [
    [
      "......kk....",
      ".....kbk....",
      "...kkkbGGk..",
      "..krrrkGGGk.",
      ".krwrrrrkk..",
      ".krwrrrrrrk.",
      ".krrrrrrrrk.",
      ".krrrrrrrrk.",
      ".kdrrrrrrdk.",
      "..kdrrrrdk..",
      "...kkddkk...",
      "....kkkk....",
    ],
    [
      "......kk....",
      ".....kbk....",
      "...kkkbGGk..",
      "..krrkkGGGk.",
      ".krwk..kk...",
      ".krwrk......",
      ".krrrrk.....",
      ".krrrrrkkkk.",
      ".kdrrrrrrdk.",
      "..kdrrrrdk..",
      "...kkddkk...",
      "....kkkk....",
    ],
    [
      "......kk....",
      ".....kbk....",
      "......bk....",
      "......k.....",
      ".....k......",
      "....kw......",
      "....kwk.....",
      "....krrkkkk.",
      "...kdrrrrdk.",
      "..kdrrrrdk..",
      "...kkddkk...",
      "....kkkk....",
    ],
  ];
  const PX_BALL = [
    "...kkkk...",
    ".kkrrrrkk.",
    ".krwwrrrk.",
    "krwwrrrrrk",
    "kwwwwwwwwk",
    "kwwwwwwwwk",
    "krrrrrrrrk",
    ".krrrrrdk.",
    ".kkdddkk..",
    "...kkkk...",
  ];
  const PX_MOON = [
    "...kkkk...",
    "..kyyyyk..",
    ".kyykk....",
    "kyyk......",
    "kyyk......",
    "kyyk......",
    "kyyyk.....",
    ".kyyykkkk.",
    "..kyyyyyk.",
    "...kkkkk..",
  ];

  const apple = (id) => `<svg viewBox="0 0 100 100" aria-hidden="true"><defs>
    <radialGradient id="ap${id}" cx="34%" cy="34%" r="75%"><stop offset="0" stop-color="#ff9b8a"/><stop offset=".42" stop-color="#e8453b"/><stop offset="1" stop-color="#9c1c22"/></radialGradient>
    <mask id="bm${id}"><rect x="-10" y="-10" width="120" height="120" fill="#fff"/><g fill="#000"><circle class="bite" cx="64" cy="27" r="0"/><circle class="bite" cx="38" cy="28" r="0"/><circle class="bite" cx="52" cy="46" r="0"/></g></mask></defs>
    <g mask="url(#bm${id})"><path d="M50 28C31 15 7 27 9 53c2 28 22 41 41 35 19 6 39-7 41-35 2-26-22-38-41-25z" fill="url(#ap${id})"/>
    <ellipse cx="31" cy="44" rx="7" ry="12" fill="#fff" opacity=".38" transform="rotate(-22 31 44)"/></g>
    <path d="M50 29c0-8 2-15 6-21" stroke="#6b3e22" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <path d="M55 15c9-10 25-9 30-3-8 8-23 9-30 3z" fill="#68b34f"/></svg>`;
  const ball = (id) => `<svg viewBox="0 0 100 100" aria-hidden="true"><defs>
    <radialGradient id="bl${id}" cx="36%" cy="30%" r="72%"><stop offset="0" stop-color="#fffdf8"/><stop offset=".58" stop-color="#f3e4cb"/><stop offset="1" stop-color="#c9ab83"/></radialGradient>
    <clipPath id="bc${id}"><circle cx="50" cy="50" r="44"/></clipPath></defs>
    <circle cx="50" cy="50" r="44" fill="url(#bl${id})"/>
    <g clip-path="url(#bc${id})" fill="none" stroke-width="10"><path d="M-6 38C24 18 76 18 106 38" stroke="#e8806b"/><path d="M-6 66C24 46 76 46 106 66" stroke="#d6a546"/></g>
    <circle cx="50" cy="50" r="44" fill="none" stroke="#8a6a44" stroke-opacity=".35" stroke-width="2"/></svg>`;
  const carton = (id) => `<svg viewBox="0 0 100 120" aria-hidden="true"><defs>
    <linearGradient id="ct${id}" x1="0" x2="1"><stop offset="0" stop-color="#ffd9e6"/><stop offset=".55" stop-color="#ffc2d6"/><stop offset="1" stop-color="#f29bbb"/></linearGradient></defs>
    <path d="M46 34 38 3" stroke="#fff" stroke-width="6" stroke-linecap="round"/><path d="M46 34 38 3" stroke="#ff8fb3" stroke-width="2.2" stroke-dasharray="4 5" stroke-linecap="round"/>
    <path d="M24 36 38 18h26l12 18z" fill="#ffe8f0" stroke="#e48aab" stroke-width="2.5" stroke-linejoin="round"/>
    <rect x="22" y="36" width="56" height="74" rx="7" fill="url(#ct${id})" stroke="#e48aab" stroke-width="2.5"/>
    <circle cx="50" cy="70" r="15" fill="#fff" opacity=".9"/>
    <path d="M50 62c-8-4-14 3-11 11 2 6 8 9 11 11 3-2 9-5 11-11 3-8-3-15-11-11z" fill="#ff4f7b"/>
    <path d="M44 61c3 2 9 2 12 0" stroke="#4fae55" stroke-width="3" fill="none" stroke-linecap="round"/>
    <g fill="#ffe4ec"><circle cx="46" cy="70" r="1.2"/><circle cx="54" cy="70" r="1.2"/><circle cx="50" cy="76" r="1.2"/></g>
    <text x="50" y="100" font-size="11" font-weight="900" text-anchor="middle" fill="#d0567f" font-family="sans-serif">딸기</text></svg>`;
  const berryBall = (id) => `<svg viewBox="0 0 100 100" aria-hidden="true"><defs>
    <radialGradient id="sb${id}" cx="36%" cy="32%" r="72%"><stop offset="0" stop-color="#ffb3c8"/><stop offset=".55" stop-color="#ff6f98"/><stop offset="1" stop-color="#d83c6b"/></radialGradient></defs>
    <circle cx="50" cy="52" r="42" fill="url(#sb${id})"/>
    <g fill="#fff6c9">${[[34, 40], [52, 34], [66, 46], [40, 60], [58, 62], [48, 76], [30, 56], [70, 64]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2.2" ry="3.2"/>`).join("")}</g>
    <path d="M36 14c6 8 10 10 14 10s8-2 14-10c-2 8-6 12-14 13-8-1-12-5-14-13z" fill="#54b35c"/></svg>`;
  const yakgwa = (id, plate = false) => {
    const petals = Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4;
      return `<circle cx="${50 + Math.cos(a) * 21}" cy="${46 + Math.sin(a) * 21}" r="15"/>`;
    }).join("");
    return `<svg viewBox="0 0 100 100" aria-hidden="true"><defs>
      <radialGradient id="yk${id}" cx="40%" cy="36%" r="70%"><stop offset="0" stop-color="#f3b45a"/><stop offset=".6" stop-color="#c46d22"/><stop offset="1" stop-color="#8a420f"/></radialGradient>
      <linearGradient id="pl${id}" x1="0" x2="1"><stop offset="0" stop-color="#dff1ff"/><stop offset=".35" stop-color="#f7e1ff"/><stop offset=".7" stop-color="#d9fff1"/><stop offset="1" stop-color="#fff"/></linearGradient>
      <mask id="bm${id}"><rect x="-10" y="-10" width="120" height="120" fill="#fff"/><g fill="#000"><circle class="bite" cx="64" cy="26" r="0"/><circle class="bite" cx="36" cy="27" r="0"/><circle class="bite" cx="50" cy="44" r="0"/></g></mask></defs>
      ${plate ? `<ellipse cx="50" cy="84" rx="44" ry="11" fill="#0d0c10" stroke="url(#pl${id})" stroke-width="3"/>` : ""}
      <g mask="url(#bm${id})"><g fill="url(#yk${id})">${petals}<circle cx="50" cy="46" r="24"/></g>
      <circle cx="50" cy="46" r="10" fill="#7a3a0c" opacity=".55"/>
      <g fill="#f8e7c4"><ellipse cx="46" cy="44" rx="2.4" ry="4" transform="rotate(-30 46 44)"/><ellipse cx="54" cy="45" rx="2.4" ry="4" transform="rotate(30 54 45)"/><ellipse cx="50" cy="51" rx="2.4" ry="4"/></g>
      <path d="M30 34c8-8 22-10 30-6" stroke="#fff4d6" stroke-width="3" fill="none" stroke-linecap="round" opacity=".55"/></g></svg>`;
  };
  const jegi = () => `<svg viewBox="0 0 100 110" aria-hidden="true"><g stroke-linecap="round" stroke-width="7" fill="none">
    <path d="M50 66C46 46 30 30 16 18" stroke="#d94141"/><path d="M50 66C48 42 42 22 38 6" stroke="#2f6fd6"/><path d="M50 66C52 42 58 22 62 6" stroke="#f2c230"/><path d="M50 66C54 46 70 30 84 18" stroke="#f4f1ea"/><path d="M50 66C50 44 50 24 50 8" stroke="#3aa65a"/></g>
    <ellipse cx="50" cy="78" rx="22" ry="12" fill="#b88a3a" stroke="#6e5020" stroke-width="2.5"/><rect x="45" y="73" width="10" height="10" fill="#4a3412"/></svg>`;
  const goldMoon = (id) => `<svg viewBox="0 0 100 100" aria-hidden="true"><defs><radialGradient id="mg${id}" cx="40%" cy="40%" r="60%"><stop offset="0" stop-color="#fff3c4"/><stop offset="1" stop-color="#e8b84c"/></radialGradient></defs>
    <circle cx="50" cy="50" r="46" fill="#f1d68c" opacity=".16"/><path d="M62 12a40 40 0 1 0 26 58A32 32 0 0 1 62 12z" fill="url(#mg${id})"/></svg>`;
  const pinkMoon = () => `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="#ffd1e6" opacity=".22"/><path d="M62 12a40 40 0 1 0 26 58A32 32 0 0 1 62 12z" fill="#fff0f7"/>
    <path d="M78 22c-3-3-8-1-6 4 1 2 4 4 6 5 2-1 5-3 6-5 2-5-3-7-6-4z" fill="#ff8fb3"/></svg>`;
  const crescent = (fill, glow) => `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" fill="${glow}" opacity=".25"/><path d="M62 12a40 40 0 1 0 26 58A32 32 0 0 1 62 12z" fill="${fill}"/></svg>`;
  const pearlGlow = (id) => `<svg viewBox="0 0 100 100" aria-hidden="true"><defs><radialGradient id="pg${id}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffffff" stop-opacity=".9"/><stop offset=".45" stop-color="#dbe9ff" stop-opacity=".45"/><stop offset="1" stop-color="#dbe9ff" stop-opacity="0"/></radialGradient></defs><circle cx="50" cy="50" r="50" fill="url(#pg${id})"/></svg>`;

  // Gradient, mask and clip ids must be unique in the page.
  let svgId = 0;
  const ART = {
    classic: { food: () => apple(++svgId), toy: () => ball(++svgId), moon: () => goldMoon(++svgId), bite: "mask", crumbs: ["#fff4e0", "#e8453b"] },
    "8bit": { food: () => pxsvg(PX_APPLE[0], PX_PAL), toy: () => pxsvg(PX_BALL, PX_PAL), moon: () => pxsvg(PX_MOON, PX_PAL), bite: "px", crumbs: ["#ff004d", "#fff1e8"] },
    milk: { food: () => carton(++svgId), toy: () => berryBall(++svgId), moon: pinkMoon, wantMoon: () => crescent("#ff7aa8", "#ffc2d6"), bite: "sip" },
    najeon: { food: () => yakgwa(++svgId), icon: () => yakgwa(++svgId, true), toy: jegi, moon: () => pearlGlow(++svgId), wantMoon: () => crescent("#eef3ff", "#bfe3ff"), bite: "mask", crumbs: ["#c46d22", "#f3b45a"] },
  };
  const art = () => ART[world()] || ART.classic;

  const LINES = {
    classic: { feed: "냠냠! 사과가 아삭아삭 맛있어요!", nibble: "한 입만 더 먹을게요!", stash: "배불러요! 이건 나중에 먹을게요.", play: "와아, 신나요!", again: "헤헤, 진짜 재밌어요!", tired: "헥헥… 숨차요! 조금 쉬었다 놀아요.", content: "배부르고 신나요! 인형을 한 번 더 톡 해 볼래요?", sleep: "잘 자요… 인형을 톡 하면 깨어날게요.", morning: "잘 잤어요! 좋은 아침이에요!", wake: "잘 잤어요! 몸이 가뿐해요!" },
    "8bit": { feed: "냠냠! HP가 가득 찼어요!", nibble: "한 입만 더! 냠!", stash: "HP가 꽉 찼어요! 이건 저장해 둘게요.", play: "점프! 점프! 최고 기록이에요!", again: "보너스 스테이지! 헤헤, 재밌어요!", tired: "헥헥… 스태미나 바닥! 조금 쉬었다 놀아요.", content: "HP도 기분도 MAX! 인형을 한 번 더 톡 해 볼래요?", sleep: "세이브 완료… 인형을 톡 하면 이어서 해요.", morning: "새 게임 시작! 좋은 아침이에요!", wake: "이어서 하기! 체력이 가득해요!" },
    milk: { feed: "쪼옥~ 달콤한 딸기우유 최고예요!", nibble: "한 모금만 더 마실게요!", stash: "배불러요! 이건 나중에 마실게요.", play: "말랑말랑 딸기공 받아라!", again: "헤헤, 딸기공 또 잡았어요!", tired: "헥헥… 몸이 말랑말랑 녹았어요! 조금 쉬었다 놀아요.", content: "배부르고 달콤해요! 인형을 한 번 더 톡 해 볼래요?", sleep: "달콤한 꿈 꿀게요… 인형을 톡 하면 깨어날게요.", morning: "잘 잤어요! 딸기처럼 상큼한 아침이에요!", wake: "잘 잤어요! 딸기처럼 상큼해요!" },
    najeon: { feed: "약과가 달콤하고 쫀득해요!", nibble: "한 입만 더 먹을게요!", stash: "배불러요! 약과는 나중에 먹을게요.", play: "제기차기 열 번 성공!", again: "이번엔 스무 번! 헤헤, 재밌어요!", tired: "헥헥… 다리가 후들후들해요. 조금 쉬었다 놀아요.", content: "배도 마음도 든든해요! 인형을 한 번 더 톡 해 볼래요?", sleep: "달빛 아래 잘 자요… 인형을 톡 하면 깨어날게요.", morning: "잘 잤어요! 해님이 떴어요!", wake: "잘 잤어요! 마음이 반짝반짝해요." },
  };
  const MUMBLE = "음냐… 인형을 톡 해 주면 일어날게요…";
  const WANTS = { feed: "배고파요", play: "놀고 싶어요", sleep: "졸려요" };
  const line = (key) => (LINES[world()] || LINES.classic)[key];

  const MOODS = ["happy", "ask", "excited", "sleepy", "munch", "wake", "mumble"];
  const SOUNDS = ["press", "want", "drop", "land", "chomp-0", "chomp-1", "chomp-2", "chomp-3", "sip", "gulp", "sparkle", "boing", "bonk", "whistle-up", "whoosh", "trail", "click", "dim", "lullaby", "birds", "wake"];
  const kit = (id = world()) => (id === "8bit" ? "chip" : "soft");

  function sound(name, at = 0, options) {
    const file = `care-${kit()}-${name}`;
    if (at) window.setTimeout(() => playSfx(file, options), at);
    else playSfx(file, options);
  }

  function voice(mood, at = 0) {
    const id = world();
    if (at) window.setTimeout(() => cry(mood, id), at);
    else cry(mood, id);
  }

  function preload(id) {
    for (const mood of MOODS) loadSfx(cryName(mood, id));
    for (const name of SOUNDS) loadSfx(`care-${kit(id)}-${name}`);
  }

  const veil = document.createElement("div");
  veil.className = "night-veil";
  const layer = document.createElement("div");
  layer.className = "prop-layer";
  for (const el of [veil, layer]) el.setAttribute("aria-hidden", "true");
  win.append(veil, layer);

  function box() {
    const w = win.getBoundingClientRect();
    const p = pet.getBoundingClientRect();
    return { x: p.left - w.left, y: p.top - w.top, w: p.width, h: p.height, W: w.width, H: w.height };
  }

  function prop(svg, size, x, y, ratio = 1) {
    const el = document.createElement("div");
    el.className = "prop";
    el.style.width = `${size}px`;
    el.style.height = `${size * ratio}px`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.innerHTML = svg;
    layer.appendChild(el);
    return el;
  }

  function burst(x, y, colors) {
    if (still()) return;
    for (let i = 0; i < 4; i++) {
      const crumb = document.createElement("span");
      crumb.className = "crumb";
      crumb.style.left = `${x}px`;
      crumb.style.top = `${y}px`;
      crumb.style.background = colors[i % colors.length];
      win.appendChild(crumb);
      const dx = (Math.random() - 0.5) * 90;
      const dy = -20 - Math.random() * 40;
      crumb.animate([
        { transform: "translate(0,0) rotate(0)", opacity: 1 },
        { transform: `translate(${dx * 0.6}px, ${dy}px) rotate(${dx * 4}deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx}px, ${dy + 70}px) rotate(${dx * 8}deg)`, opacity: 0 },
      ], { duration: 650, easing: "cubic-bezier(.2,.7,.5,1)", fill: "forwards" }).finished.finally(() => crumb.remove()).catch(() => {});
    }
  }

  function sparkles(x, y, n, spread) {
    if (still()) return;
    for (let i = 0; i < n; i++) {
      const spark = document.createElement("span");
      spark.className = "sparkle";
      spark.style.left = `${x + (Math.random() - 0.5) * spread}px`;
      spark.style.top = `${y + (Math.random() - 0.5) * spread * 0.7}px`;
      spark.style.animationDelay = `${i * 45}ms`;
      spark.style.setProperty("--sx", `${(Math.random() - 0.5) * 30}px`);
      win.appendChild(spark);
      window.setTimeout(() => spark.remove(), 900 + i * 45);
    }
  }

  function cheer() {
    const p = pet.getBoundingClientRect();
    floatHearts(p.left + p.width / 2, p.top + p.height * 0.25);
  }

  function floatZ() {
    const z = document.createElement("span");
    z.className = "zzz";
    z.textContent = "Z";
    z.setAttribute("aria-hidden", "true");
    z.style.fontSize = `${20 + Math.random() * 10}px`;
    win.appendChild(z);
    window.setTimeout(() => z.remove(), 2700);
  }

  const FACES = { closed: "blink", happy: "react" };
  const face = (name) => facePet(FACES[name] || name);

  // Poses hold their last frame until the action ends; reduced motion keeps only the timing.
  function move(el, frames, options) {
    if (still()) return wait(options.duration);
    return el.animate(frames, { fill: "forwards", ...options }).finished.catch(() => {});
  }

  let wantEl = null;
  let wantTimer = 0;

  function wantArt(id) {
    const a = art();
    if (id === "feed") return (a.icon || a.food)();
    if (id === "play") return a.toy();
    return (a.wantMoon || a.moon)();
  }

  function setWant(id) {
    window.clearTimeout(wantTimer);
    dock.querySelectorAll(".is-want").forEach((btn) => btn.classList.remove("is-want"));
    if (wantEl) {
      const old = wantEl;
      wantEl = null;
      old.classList.add("is-gone");
      window.setTimeout(() => old.remove(), 320);
    }
    if (!id) return;
    dock.querySelector(`[data-care="${id}"]`)?.classList.add("is-want");
    wantEl = document.createElement("div");
    wantEl.className = "want";
    wantEl.dataset.want = id;
    wantEl.setAttribute("role", "img");
    wantEl.setAttribute("aria-label", WANTS[id]);
    wantEl.innerHTML = `<i></i><i></i><span class="want-cloud">${wantArt(id)}</span>`;
    win.appendChild(wantEl);
    sound("want");
  }

  function screenBusy() {
    return Boolean(sheetOpen || waking || (demo && !demo.hidden) || root.classList.contains("has-reveal") || root.classList.contains("g-on")
      || document.querySelector("canvas.celebrate-layer, .is-evolving, .is-still-celebrate, .is-reunion-jump, .gift.is-glow, .combo-key"));
  }

  // Waits for ms of quiet: no sheet, reveal or celebration on screen.
  function whenCalm(ms, fn) {
    window.clearTimeout(wantTimer);
    let calm = 0;
    wantTimer = window.setTimeout(function check() {
      if (careHold.busy || careHold.asleep) return;
      calm = screenBusy() ? 0 : calm + 100;
      if (calm >= ms) fn();
      else wantTimer = window.setTimeout(check, 100);
    }, 100);
  }

  function wantLater(id, ms) {
    window.clearTimeout(wantTimer);
    if (id) whenCalm(ms, () => setWant(id));
  }

  function hush() {
    talkHook?.taken();
    sayToken += 1;
    window.clearTimeout(lineTimer);
    lineReady = false;
  }

  function say(text) {
    hush();
    if (!dialogBox.classList.contains("is-seq")) {
      intro.textContent = text;
      return;
    }
    showLine(0);
    dialogBox.classList.add("is-end");
    typeLine(intro, text, () => {}, 60);
  }

  let meals = Number(dock.dataset.meals) || 0;
  let plays = Number(dock.dataset.plays) || 0;
  let heartsFrame = 0;

  function tweenHearts(to) {
    if (!hearts) return;
    hearts.setAttribute("aria-label", `기분 ${to}단계`);
    window.cancelAnimationFrame(heartsFrame);
    const from = Number(hearts.dataset.hearts) || to;
    if (from === to || still()) {
      paintHearts(hearts, to);
      return;
    }
    const started = performance.now();
    heartsFrame = window.requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - started) / 900);
      paintHearts(hearts, Math.round(from + (to - from) * t));
      if (t < 1) heartsFrame = window.requestAnimationFrame(step);
    });
  }

  function settle(reply) {
    if (!reply) {
      meals = Number(dock.dataset.meals) || 0;
      plays = Number(dock.dataset.plays) || 0;
      return;
    }
    tweenHearts(reply.hearts);
    pet.classList.toggle("is-lonely", Boolean(reply.lonely));
    dock.dataset.want = reply.want || "";
    dock.dataset.meals = String(reply.meals);
    meals = reply.meals;
    dock.dataset.plays = String(reply.plays);
    plays = reply.plays;
  }

  function post(act) {
    if (!owner) return Promise.resolve(null);
    return fetch("/care", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: owner, act }),
      credentials: "same-origin",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((reply) => (reply?.ok ? reply : null))
      .catch(() => null)
      .then((reply) => {
        settle(reply);
        return reply;
      });
  }

  let actions = 0;

  function begin() {
    actions += 1;
    careHold.busy = true;
    setWant(null);
    hush();
    pet.classList.add("is-care");
    motion.getAnimations().forEach((a) => a.cancel());
  }

  function end() {
    motion.getAnimations().forEach((a) => a.cancel());
    layer.replaceChildren();
    pet.classList.remove("is-care");
    careHold.busy = false;
    face();
  }

  async function feed(beat) {
    const a = art();
    const b = box();
    const sip = a.bite === "sip";
    const s = b.w * (sip ? 0.3 : 0.27);
    // Food tops out just under the mouth so the munch face stays visible; the carton's straw tip sits in it.
    const x = sip ? b.x + b.w / 2 - s * 0.38 : b.x + b.w / 2 - s / 2;
    const y = sip ? b.y + b.h * 0.5 - s * 0.03 : b.y + b.h * (world() === "8bit" ? 0.56 : 0.535);
    const el = prop(a.food(), s, x, y, sip ? 1.2 : 1);
    const fall = b.y + b.h * 0.6;
    sound("drop");
    await move(el, [
      { transform: `translateY(${-fall}px) rotate(-18deg)`, opacity: 0 },
      { transform: `translateY(${-fall * 0.8}px) rotate(-14deg)`, opacity: 1, offset: 0.12 },
      { transform: "translateY(0) rotate(0)", offset: 0.72, easing: "ease-out" },
      { transform: "translateY(-7%) rotate(3deg)", offset: 0.86, easing: "ease-in" },
      { transform: "translateY(0) rotate(0)" },
    ], { duration: 560, easing: "cubic-bezier(.5,0,1,.6)" });
    sound("land");
    if (beat === "stash") {
      face("canon");
      voice("ask");
      move(motion, [{ transform: "translateY(0)" }, { transform: "translateY(-2%) rotate(-3deg)" }, { transform: "translateY(0) rotate(3deg)" }, { transform: "translateY(0) rotate(0)" }], { duration: 700, easing: "ease-in-out" });
      await wait(500);
      await move(el, [{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: `translate(${b.w * 0.75}px, ${b.h * 0.2}px) scale(.55) rotate(25deg)`, opacity: 0 }], { duration: 650, easing: "cubic-bezier(.5,0,.3,1)" });
      el.remove();
      say(line("stash"));
      return 300;
    }
    move(motion, [{ transform: "translateY(0) scale(1)" }, { transform: "translateY(2%) scale(1.035, .975)" }], { duration: 160, easing: "ease-out" });
    await wait(120);
    const chomps = beat === "full" ? 3 : 1;
    const bites = el.querySelectorAll(".bite");
    for (let i = 0; i < chomps; i++) {
      face("munch");
      await wait(150);
      face("happy");
      move(motion, [{ transform: "translateY(2%) scale(1.035, .975)" }, { transform: "translateY(3.5%) scale(1.07, .93)" }, { transform: "translateY(2%) scale(1.035, .975)" }], { duration: 170, easing: "ease-out" });
      sound(sip ? "sip" : `chomp-${i % 4}`);
      if (i === 1 || chomps === 1) voice("munch");
      tryVibrate(14);
      const bite = beat === "full" ? i : 2;
      if (a.bite === "mask") bites[bite]?.setAttribute("r", "17");
      if (a.bite === "px") el.innerHTML = pxsvg(PX_APPLE[Math.min(bite + 1, 2)], PX_PAL);
      if (sip) {
        if (!still()) el.animate([{ transform: `scale(${1 - i * 0.06}, ${1 - i * 0.04})` }, { transform: `scale(${0.95 - i * 0.07}, ${0.97 - i * 0.05})` }], { duration: 160, fill: "forwards" });
        sparkles(x + s * 0.7, y, 2, 20);
      } else {
        burst(x + s / 2, y + s * 0.2, a.crumbs);
      }
      await wait(150);
    }
    sound("gulp");
    sound("sparkle", 150);
    await move(el, [{ transform: "scale(1)", opacity: 1 }, { transform: "scale(.2) translateY(-30%)", opacity: 0 }], { duration: 220, easing: "ease-in" });
    el.remove();
    sparkles(b.x + b.w / 2, b.y + b.h * 0.42, 5, b.w * 0.5);
    voice("happy", 40);
    tryVibrate([20, 60, 30]);
    await move(motion, [
      { transform: "translateY(2%) scale(1.035, .975)" },
      { transform: "translateY(4%) scale(1.08, .9)", offset: 0.2 },
      { transform: "translateY(-9%) scale(.96, 1.05)", offset: 0.55, easing: "ease-in" },
      { transform: "translateY(0) scale(1.05, .95)", offset: 0.85 },
      { transform: "translateY(0) scale(1)" },
    ], { duration: 620, easing: "ease-out" });
    cheer();
    say(line(beat === "full" ? "feed" : "nibble"));
    await wait(700);
    return 700;
  }

  async function play(beat) {
    const a = art();
    const b = box();
    const s = b.w * 0.26;
    const floor = b.y + b.h - s * 0.92;
    const head = b.y - s * 0.62;
    const cx = b.x + b.w / 2 - s / 2;
    const el = prop(a.toy(), s, cx, floor);
    const isJegi = world() === "najeon";
    const start = b.W + s;
    face("happy");
    sound("boing", 300, { rate: 1.1, gain: 0.8 });
    sound("boing", 600, { rate: 1.2, gain: 0.6 });
    // Bounce in from the right edge.
    await move(el, [
      { transform: `translate(${start - cx}px, ${-b.h * 0.25}px) rotate(0deg)` },
      { transform: `translate(${(start - cx) * 0.55}px, 0) rotate(-120deg)`, offset: 0.4, easing: "ease-out" },
      { transform: `translate(${(start - cx) * 0.32}px, ${-b.h * 0.16}px) rotate(-200deg)`, offset: 0.6, easing: "ease-in" },
      { transform: `translate(${(start - cx) * 0.12}px, 0) rotate(-280deg)`, offset: 0.8, easing: "ease-out" },
      { transform: `translate(0, ${-(floor - head) * 0.45}px) rotate(-340deg)` },
    ], { duration: 760, easing: "linear" });
    sound("boing", 0, { gain: 0.7 });
    // Jump and head-bump.
    move(motion, [
      { transform: "translateY(0) scale(1)" },
      { transform: "translateY(3%) scale(1.08, .9)", offset: 0.25 },
      { transform: "translateY(-16%) scale(.95, 1.06)", offset: 0.6, easing: "ease-out" },
      { transform: "translateY(-18%) scale(1)", offset: 0.7, easing: "ease-in" },
      { transform: "translateY(0) scale(1.07, .93)", offset: 0.92 },
      { transform: "translateY(0) scale(1)" },
    ], { duration: 640 });
    await move(el, [
      { transform: `translate(0, ${-(floor - head) * 0.45}px) rotate(-340deg)` },
      { transform: `translate(0, ${-(floor - head) * 0.92}px) rotate(-360deg)`, easing: "ease-out" },
    ], { duration: 230 });
    sound("bonk");
    sound("whistle-up", 40);
    voice("excited");
    tryVibrate(22);
    sparkles(b.x + b.w / 2, head + s, 4, 40);
    const up = move(el, [
      { transform: `translate(0, ${-(floor - head) * 0.92}px) rotate(-360deg)` },
      { transform: `translate(0, ${-(floor + s * 1.4)}px) rotate(${isJegi ? -380 : -560}deg)`, easing: "ease-in" },
      { transform: `translate(0, ${-(floor - head) * 0.98}px) rotate(${isJegi ? -360 : -760}deg)` },
    ], { duration: 1150, easing: "cubic-bezier(.2,.6,.5,1)" });
    await wait(420);
    // Spin: front, back, front.
    sound("whoosh");
    const spin = (from, to) => move(motion, [{ transform: `scaleX(${from})` }, { transform: `scaleX(${to})` }], { duration: 110, easing: "ease-in-out" });
    await spin(1, 0);
    if (!still()) face("away");
    await spin(0, 1);
    await spin(1, 0);
    face("happy");
    await spin(0, 1);
    await up;
    // The second bump sends it off with a trail.
    move(motion, [
      { transform: "translateY(0) scale(1)" },
      { transform: "translateY(-14%) scale(.96, 1.05)", offset: 0.45, easing: "ease-in" },
      { transform: "translateY(0) scale(1.07, .93)", offset: 0.85 },
      { transform: "translateY(0) scale(1)" },
    ], { duration: 520 });
    sound("bonk");
    sound("trail", 40);
    tryVibrate(22);
    const trail = window.setInterval(() => {
      const r = el.getBoundingClientRect();
      const w = win.getBoundingClientRect();
      sparkles(r.left - w.left + r.width / 2, r.top - w.top + r.height / 2, 1, 6);
    }, 70);
    await move(el, [
      { transform: `translate(0, ${-(floor - head) * 0.98}px) rotate(-760deg)` },
      { transform: `translate(${b.W * 0.7}px, ${-(floor + s * 1.6)}px) rotate(-1100deg)` },
    ], { duration: 700, easing: "cubic-bezier(.25,.5,.4,1)" });
    window.clearInterval(trail);
    el.remove();
    if (beat === "tired") {
      face("yawn");
      voice("sleepy", 40);
    } else {
      voice("happy", 40);
      cheer();
    }
    say(line(beat));
    await wait(800);
    return 800;
  }

  let moonEl = null;
  let zTimer = 0;

  function placeMoon() {
    moonEl?.remove();
    moonEl = document.createElement("div");
    moonEl.className = "moon";
    moonEl.setAttribute("aria-hidden", "true");
    moonEl.innerHTML = art().moon();
    win.appendChild(moonEl);
  }

  function lightsOff() {
    careHold.asleep = true;
    root.dataset.time = "night";
    document.body.dataset.time = "night";
    win.classList.add("is-asleep");
    document.body.classList.add("is-asleep-page");
  }

  function lightsOn() {
    careHold.asleep = false;
    win.classList.remove("is-asleep");
    document.body.classList.remove("is-asleep-page");
    syncPet();
    const moon = moonEl;
    moonEl = null;
    window.setTimeout(() => moon?.remove(), 1600);
  }

  function snore() {
    window.clearInterval(zTimer);
    if (still()) return;
    floatZ();
    zTimer = window.setInterval(floatZ, 1300);
  }

  async function sleep() {
    face("yawn");
    voice("sleepy");
    await move(motion, [
      { transform: "translateY(0) scale(1)" },
      { transform: "translateY(-3%) scale(.97, 1.07)", offset: 0.45, easing: "ease-out" },
      { transform: "translateY(-3%) scale(.97, 1.07)", offset: 0.7 },
      { transform: "translateY(3%) scale(1.01, .975)" },
    ], { duration: 900, easing: "ease-in-out" });
    face("closed");
    placeMoon();
    sound("click");
    await wait(60);
    sound("dim");
    if (still()) {
      lightsOff();
    } else {
      win.classList.add("is-dimming");
      await wait(700);
      lightsOff();
      await wait(350);
      win.classList.remove("is-dimming");
    }
    pet.classList.add("is-sleeping");
    sound("lullaby", 200);
    say(line("sleep"));
    snore();
    return 0;
  }

  async function mumble() {
    if (careHold.busy) return;
    careHold.busy = true;
    hush();
    pet.classList.add("is-care");
    voice("mumble");
    await move(motion, [{ transform: "translateY(3%) scale(1)" }, { transform: "translateY(3%) scale(1.04, .96)" }, { transform: "translateY(3%) scale(1)" }], { duration: 420 });
    if (!still()) floatZ();
    say(MUMBLE);
    end();
  }

  async function run(action, reply, wanted) {
    begin();
    const mine = actions;
    sound("press");
    let next = 0;
    try {
      next = await action();
    } finally {
      end();
    }
    reply.then((r) => {
      if (mine !== actions || careHold.busy) return;
      // Meeting the last want sends the owner back to the plushie.
      if (wanted && r && !r.want) whenCalm(1800, () => say(line("content")));
      else wantLater(r ? r.want : dock.dataset.want, next);
    });
  }

  function press(id) {
    if (careHold.busy || waking || greeting || pet.classList.contains("is-evolving") || root.classList.contains("has-reveal")) return;
    if (careHold.asleep) {
      mumble();
      return;
    }
    const btn = dock.querySelector(`[data-care="${id}"]`);
    btn.classList.add("is-pressed");
    window.setTimeout(() => btn.classList.remove("is-pressed"), 140);
    const beat = id === "feed" ? (meals >= 2 ? "stash" : meals === 1 ? "nibble" : "full")
      : id === "play" ? (plays >= 2 ? "tired" : plays === 1 ? "again" : "play")
      : id;
    if (beat === "full" || beat === "nibble") meals += 1;
    if (id === "play") plays += 1;
    const wanted = id !== "sleep" && dock.dataset.want;
    const reply = post(id);
    run(id === "feed" ? () => feed(beat) : id === "play" ? () => play(beat) : sleep, reply, wanted);
  }

  let lastHappy = -Infinity;
  careHold.touch = (x, y) => {
    if (careHold.asleep) {
      mumble();
      return true;
    }
    if (greeting) return true;
    if (careHold.busy) {
      touchFx(x, y);
      return true;
    }
    // A first-greeting replay already cries on its wake touch.
    if (!waking && performance.now() - lastHappy >= 3000) {
      lastHappy = performance.now();
      voice("happy");
    }
    return false;
  };

  let opened = false;
  // The morning greeting runs until its line is done; taps meanwhile only hurry the line.
  let greeting = false;

  function open() {
    if (opened) return;
    opened = true;
    wantLater(dock.dataset.want, 900);
  }

  async function wake(key, call, onDone) {
    careHold.busy = true;
    greeting = true;
    window.clearInterval(zTimer);
    call.classList.add("is-gone");
    window.setTimeout(() => call.remove(), 320);
    sound("wake");
    voice("wake");
    sound("sparkle", 600, { gain: 0.8 });
    sound("birds", 900);
    tryVibrate([20, 60, 40]);
    delete document.body.dataset.morning;
    pet.classList.remove("is-sleeping");
    pet.classList.add("is-care");
    motion.getAnimations().forEach((a) => a.cancel());
    const flash = document.createElement("div");
    flash.className = "sun-flash";
    flash.setAttribute("aria-hidden", "true");
    win.appendChild(flash);
    window.setTimeout(() => flash.remove(), 900);
    lightsOn();
    face("canon");
    await move(motion, [
      { transform: "translateY(3%) scale(1)" },
      { transform: "translateY(-12%) scale(.94, 1.08)", offset: 0.35, easing: "ease-in" },
      { transform: "translateY(0) scale(1.06, .94)", offset: 0.75 },
      { transform: "translateY(0) scale(1)" },
    ], { duration: 520 });
    face("yawn");
    await move(motion, [{ transform: "scale(1)" }, { transform: "translateY(-3%) scale(.97, 1.08)", offset: 0.6 }, { transform: "scale(1)" }], { duration: 700, easing: "ease-in-out" });
    face("happy");
    const b = box();
    sparkles(b.x + b.w / 2, b.y + b.h * 0.3, 7, b.w * 0.8);
    cheer();
    const text = line(key);
    hush();
    const token = sayToken;
    showLine(0);
    intro.dataset.say = text;
    // Then the opening carries on: the rest of the dialog, any celebration, the first want.
    typeLine(intro, text, () => window.setTimeout(() => {
      greeting = false;
      if (token === sayToken) settleLine(0);
      onDone();
      open();
    }, 650), 60);
    await wait(900);
    end();
  }

  function morning(onDone) {
    const key = () => (currentBand() === "morning" ? "morning" : "wake");
    if (still()) {
      const text = line(key());
      intro.textContent = text;
      intro.dataset.say = text;
      onDone();
      open();
      return;
    }
    dialogBox.classList.add("is-seq");
    showLine(0);
    lightsOff();
    face();
    placeMoon();
    pet.classList.add("is-sleeping");
    snore();
    const call = document.createElement("p");
    call.className = "wake-tap";
    call.textContent = "톡! 깨워 주세요";
    win.appendChild(call);
    function onWake(event) {
      if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
      document.removeEventListener("pointerdown", onWake, true);
      document.removeEventListener("keydown", onWake, true);
      wakeAudio();
      wake(key(), call, onDone);
    }
    window.setTimeout(() => {
      document.addEventListener("pointerdown", onWake, true);
      document.addEventListener("keydown", onWake, true);
    }, 0);
  }

  // A tap combo stage holds the pet like an action, but leaves the opening dialog running.
  function hold() {
    careHold.busy = true;
    setWant(null);
    pet.classList.add("is-care");
    motion.getAnimations().forEach((a) => a.cancel());
  }

  function release() {
    motion.getAnimations().forEach((a) => a.cancel());
    pet.classList.remove("is-care");
    careHold.busy = false;
    face();
    if (opened) wantLater(dock.dataset.want, 800);
  }

  function restyle() {
    if (wantEl) wantEl.querySelector(".want-cloud").innerHTML = wantArt(wantEl.dataset.want);
    if (moonEl) moonEl.innerHTML = art().moon();
    if (owner) preload(world());
  }

  dock.addEventListener("click", (event) => {
    const id = event.target.closest("[data-care]")?.dataset.care;
    if (id) press(id);
  });
  if (owner) window.addEventListener("load", () => preload(world()), { once: true });
  return { morning, opened: open, restyle, hold, release, busy: screenBusy, hearts: tweenHearts, fx: { say, sparkles, cheer, box, move, sound, voice } };
})();

function percent(r) {
  return r.xpSpan > 0 ? Math.max(0, Math.min(100, Math.round((r.xpInto / r.xpSpan) * 100))) : 100;
}

function recordRow(label) {
  const dt = Array.from(document.querySelectorAll('[data-sheet="record"] dt')).find((el) => el.textContent === label);
  return dt?.nextElementSibling || null;
}

// Level, XP bar and record sheet as a reload would draw them, with the bar's grow pulse.
function paintLevel(r) {
  const left = r.xpSpan - r.xpInto;
  const pin = document.querySelector(".level-pin");
  if (pin) pin.textContent = `Lv. ${r.level}`;
  const badge = document.querySelector(".level-badge");
  if (badge) {
    badge.textContent = String(r.level);
    badge.setAttribute("aria-label", `Lv. ${r.level}`);
  }
  const fill = document.querySelector(".xp-fill");
  if (fill) {
    const pct = percent(r);
    fill.dataset.xp = String(pct);
    fill.style.width = `${pct}%`;
  }
  document.querySelector(".xp-bar")?.setAttribute("aria-label", `다음 단계까지 ${left}`);
  const level = recordRow("레벨");
  if (level) level.textContent = `Lv. ${r.level}`;
  const next = recordRow("다음 레벨까지");
  if (next) next.textContent = `${left} XP`;
  const line = document.querySelector(".level-line");
  if (line) {
    line.classList.remove("is-growing");
    void line.offsetWidth;
    line.classList.add("is-growing");
  }
}

/* Tap combo: plushie taps in a row play a hello, the world's trick, then the secret move; the key counts them. */
const combo = (function tapCombo() {
  const dock = document.querySelector(".dock[data-care-uid]");
  const win = document.querySelector("[data-window]");
  if (!dock || !care || !win) return null;
  const root = document.documentElement;
  const motion = pet.querySelector(".pet-motion");
  const { say, sparkles, cheer, box, sound, voice } = care.fx;
  const world = () => root.dataset.theme || "classic";
  const kit = () => (world() === "8bit" ? "chip" : "soft");
  const still = () => prefersReducedMotion();
  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  // The server keeps a chain for 12 s; the extra 2 s cover the trip from the tap to the drawn ring.
  const WINDOW_MS = 10000;
  const SAME_TAP_MS = 800;
  // A game counts every plushie tap, so its reads only merge when they come this close.
  const SINK_SAME_MS = 250;
  const TAP_UID = /^[0-9A-F]{14}(x[0-9A-F]{6})?$/;
  const uid = dock.dataset.careUid;
  const loaded = performance.getEntriesByType?.("navigation")[0]?.responseStart || 0;
  const PROMPTS = ["한 번 더 톡!", "마지막 한 번!"];
  const TRICK_LINES = { classic: "빙글빙글~ 멋있죠?", "8bit": "픽셀 댄스! 삐빅 삐빅!", milk: "말랑말랑 젤리 댄스~", najeon: "공손하게 인사드려요!" };
  const SECRET_LINES = { classic: "짜잔! 우리만 아는 비밀 동작이에요!", "8bit": "히든 커맨드 발동! 비밀 기술이에요!", milk: "딸기 별똥별! 우리만의 비밀이에요!", najeon: "보름달까지 훌쩍! 우리만 아는 비밀이에요." };

  // Chrome logs an intervention for a buzz before the page's first touch.
  function buzz(pattern) {
    if (navigator.userActivation?.hasBeenActive === false) return;
    tryVibrate(pattern);
  }

  function cryAt(mood, rate, at = 0) {
    const name = cryName(mood, world());
    if (at) window.setTimeout(() => playSfx(name, { rate }), at);
    else playSfx(name, { rate });
  }

  function chime(name, at = 0) {
    const file = `tap-${kit()}-${name}`;
    if (at) window.setTimeout(() => playSfx(file), at);
    else playSfx(file);
  }

  function preload() {
    for (const name of ["unlock", "fanfare"]) loadSfx(`tap-${kit()}-${name}`);
  }

  function add(className, x, y) {
    const el = document.createElement("div");
    el.className = className;
    el.setAttribute("aria-hidden", "true");
    if (x !== undefined) {
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    }
    win.appendChild(el);
    return el;
  }

  // Like care's move, but starting now: a held pet's moves otherwise each start a frame late, slowing chained steps.
  function step(el, frames, options) {
    if (still()) return wait(options.duration);
    const a = el.animate(frames, { fill: "forwards", ...options });
    if (document.timeline.currentTime !== null) a.startTime = document.timeline.currentTime;
    return a.finished.catch(() => {});
  }

  function once(el, frames, options) {
    return el.animate(frames, { fill: "forwards", ...options }).finished.catch(() => {}).then(() => el.remove());
  }

  // The bow carries the countdown, then one tooth per tap; colors come from the world's --k-* properties.
  function keySvg() {
    if (world() === "8bit") {
      let px = "";
      const R = (x, y, w, h, c) => {
        px += `<rect class="${c}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
      };
      for (let y = 0; y < 13; y++) {
        for (let x = 0; x < 13; x++) {
          const d = Math.hypot(x - 6, y - 6);
          if (d <= 6.4 && d > 5.3) R(x, y, 1.02, 1.02, "k-edge");
          else if (d <= 5.3 && d > 2.3) R(x, y, 1.02, 1.02, d > 4.4 && x + y > 12 ? "k-fill2" : "k-fill");
          else if (d <= 2.3 && d > 1.3) R(x, y, 1.02, 1.02, "k-edge");
        }
      }
      R(12, 4, 22, 1, "k-edge");
      R(12, 5, 21, 2, "k-fill");
      R(12, 7, 21, 1, "k-fill2");
      R(12, 8, 22, 1, "k-edge");
      R(33, 5, 1, 3, "k-edge");
      const teeth = [[17, 4], [23, 3], [29, 5]].map(([x, h], i) => `<rect class="tooth" data-tooth="${i + 1}" x="${x}" y="9" width="3" height="${h}"/>`).join("");
      const timer = Array.from({ length: 10 }, (_, i) => `<rect data-tick="${i}" x="${12 + i * 2.2}" y="15.4" width="1.6" height="1.6"/>`).join("");
      return `<svg viewBox="-1 -1 37 19" shape-rendering="crispEdges" aria-hidden="true">${px}${teeth}<g class="px-timer">${timer}</g></svg>`;
    }
    return `<svg viewBox="0 0 132 56" aria-hidden="true"><defs><linearGradient id="combo-grad" x1="0" y1="0" x2="0" y2="1"><stop class="k-stop" offset="0"/><stop class="k-stop2" offset="1"/></linearGradient></defs>
      <circle class="ring-bg" cx="26" cy="28" r="23"/>
      <circle class="ring" cx="26" cy="28" r="23" pathLength="100" stroke-dasharray="100 100" transform="rotate(-90 26 28)"/>
      <rect class="k-body" x="40" y="22" width="86" height="11" rx="3.5" fill="url(#combo-grad)" stroke-width="2.2"/>
      <circle class="k-body" cx="26" cy="28" r="17" fill="url(#combo-grad)" stroke-width="2.4"/>
      <circle class="k-hole" cx="26" cy="28" r="6"/>
      <path d="M14 22c3-6 9-8 14-7" stroke="#fff" stroke-opacity=".7" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      ${[[60, 16], [81, 11], [102, 19]].map(([x, h], i) => `<rect class="tooth" data-tooth="${i + 1}" x="${x}" y="32" width="13" height="${h}" rx="2.5" fill="url(#combo-grad)"/>`).join("")}</svg>`;
  }

  let key = null;
  let leaving = null;
  let lit = 0;
  let from = 0;
  // The step the server last accepted; its key can wait behind another stage.
  let accepted = null;
  let ring = null;
  let tickTimer = 0;
  let endTimer = 0;
  const left = () => WINDOW_MS - (performance.now() - from);

  function stopCountdown() {
    window.clearTimeout(endTimer);
    window.clearTimeout(tickTimer);
    ring?.cancel();
    ring = null;
  }

  function countdown() {
    stopCountdown();
    const ms = left();
    if (ms <= 0) return;
    endTimer = window.setTimeout(expire, ms);
    if (still()) return;
    const arc = key.querySelector(".ring");
    if (arc) {
      ring = arc.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: 100 }], { duration: WINDOW_MS, fill: "forwards" });
      ring.currentTime = WINDOW_MS - ms;
    }
    const ticks = Array.from(key.querySelectorAll("[data-tick]"));
    if (!ticks.length) return;
    (function paint() {
      const gone = WINDOW_MS - left();
      ticks.forEach((el, i) => el.classList.toggle("off", i >= ticks.length - Math.floor(gone / 1000)));
      tickTimer = window.setTimeout(paint, 1000 - (gone % 1000));
    })();
  }

  // Tells the next tap that the key ran out on screen, so the server starts a new chain.
  function ended(on) {
    document.cookie = `combo_done=${on ? uid : ""};path=/;max-age=${on ? 30 : 0};samesite=lax`;
  }

  // The cooldown line waits for the key: next to 한 번 더 톡! it would say the opposite.
  function sayLater() {
    const line = dock.dataset.comboLater;
    if (!line || careHold.busy || careHold.asleep || root.classList.contains("has-reveal")) return;
    delete dock.dataset.comboLater;
    say(line);
  }

  function expire() {
    stopCountdown();
    if (!key) return;
    ended(true);
    const old = key;
    key = null;
    lit = 0;
    sayLater();
    if (still()) {
      old.remove();
      return;
    }
    leaving = old;
    once(old, [{ transform: "translateY(0) scale(1)", opacity: 1 }, { transform: "translateY(-30px) scale(.4)", opacity: 0 }], { duration: 420, easing: "ease-in" });
  }

  function build() {
    leaving?.remove();
    leaving = null;
    const el = document.createElement("div");
    el.className = "combo-key";
    el.innerHTML = `${keySvg()}<p class="combo-pill" role="status"></p>`;
    win.appendChild(el);
    return el;
  }

  function paintKey(n) {
    key.querySelectorAll(".tooth").forEach((el) => el.classList.toggle("on", Number(el.dataset.tooth) <= n));
    const pill = key.querySelector(".combo-pill");
    pill.textContent = PROMPTS[n - 1] || "";
    pill.hidden = n >= 3;
  }

  // A new key drops in from the keyhole with the earlier teeth lit; tooth n pops with its chime.
  function showKey(n, start) {
    let drop = Promise.resolve();
    ended(false);
    if (!key) {
      key = build();
      if (!still()) {
        drop = key.animate([
          { transform: "translateY(-34px) scale(.3)", opacity: 0 },
          { transform: "translateY(4px) scale(1.06)", opacity: 1, offset: 0.7 },
          { transform: "translateY(0) scale(1)", opacity: 1 },
        ], { duration: 420, easing: "cubic-bezier(.3,1.4,.5,1)", fill: "forwards" }).finished.catch(() => {});
      }
    }
    lit = n;
    paintKey(n);
    if (!still()) key.querySelector(`[data-tooth="${n}"]`).classList.add("is-pop");
    sound("sparkle", 60, { rate: [1, 1.12, 1.26][n - 1], gain: 0.9 });
    if (n < 3) {
      from = start;
      countdown();
    } else {
      window.clearTimeout(endTimer);
      window.clearTimeout(tickTimer);
      ring?.pause();
      if (!still()) key.classList.add("is-full");
    }
    return drop;
  }

  // The plushie's tap landing on the phone.
  function tapFx() {
    sound("press");
    buzz(18);
    if (still()) return;
    const b = box();
    const cx = b.x + b.w / 2;
    const ripple = add("tap-ripple", cx, b.y + b.h * 0.42);
    const word = add("tap-word", cx + b.w * 0.2, b.y + b.h * 0.02);
    word.textContent = "톡!";
    window.setTimeout(() => {
      ripple.remove();
      word.remove();
    }, 950);
  }

  async function hello() {
    facePet("react");
    voice("happy", 80);
    await step(motion, [
      { transform: "translateY(0) scale(1)" },
      { transform: "translateY(3%) scale(1.06,.92)", offset: 0.2 },
      { transform: "translateY(-12%) scale(.96,1.05)", offset: 0.55, easing: "ease-out" },
      { transform: "translateY(0) scale(1.05,.95)", offset: 0.88 },
      { transform: "translateY(0) scale(1)" },
    ], { duration: 620 });
    cheer();
    await wait(500);
    facePet();
  }

  async function trick() {
    const b = box();
    const w = world();
    voice("excited", 60);
    if (w === "8bit") {
      const steps = [-9, 9, -9, 9, 0];
      for (let i = 0; i < steps.length; i++) {
        sound("click", 0, { rate: 1 + (i % 2) * 0.25, gain: 0.8 });
        if (!still()) {
          motion.style.transform = `translateX(${steps[i]}%) scaleX(${i % 2 ? -1 : 1})${i % 2 ? "" : " translateY(-4%)"}`;
          const note = add("px-note", b.x + b.w * (i % 2 ? 0.85 : 0.1), b.y + b.h * 0.2);
          note.textContent = i % 2 ? "♪" : "♫";
          once(note, [{ transform: "translateY(0)", opacity: 1 }, { transform: "translateY(-50px)", opacity: 0 }], { duration: 800, easing: "steps(5)" });
        }
        await wait(230);
      }
      motion.style.transform = "";
      facePet("react");
    } else if (w === "milk") {
      facePet("react");
      sound("boing", 0, { rate: 1.3 });
      sound("boing", 380, { rate: 1.1 });
      sound("boing", 760, { rate: 1.45 });
      await step(motion, [
        { transform: "scale(1)" },
        { transform: "scale(1.22,.78) translateY(10%)", offset: 0.12 },
        { transform: "scale(.82,1.2) translateY(-8%)", offset: 0.26 },
        { transform: "scale(1.14,.88)", offset: 0.4 },
        { transform: "scale(.9,1.1) translateY(-14%)", offset: 0.55 },
        { transform: "scale(1.1,.9)", offset: 0.7 },
        { transform: "scale(.97,1.03)", offset: 0.85 },
        { transform: "scale(1)" },
      ], { duration: 1150, easing: "ease-in-out" });
      const p = pet.getBoundingClientRect();
      floatHearts(p.left + p.width / 2, p.top + p.height * 0.3);
    } else if (w === "najeon") {
      motion.style.transformOrigin = "50% 100%";
      facePet("blink");
      sound("dim", 0, { rate: 1.2, gain: 0.7 });
      await step(motion, [{ transform: "scale(1) translateY(0)" }, { transform: "scale(1.04,.8) translateY(4%)" }], { duration: 520, easing: "ease-in-out" });
      await wait(450);
      facePet("react");
      sound("sparkle", 0, { rate: 0.8 });
      await step(motion, [
        { transform: "scale(1.04,.8) translateY(4%)" },
        { transform: "scale(.98,1.04) translateY(-4%)", offset: 0.6 },
        { transform: "scale(1) translateY(0)" },
      ], { duration: 480, easing: "ease-out" });
      sparkles(b.x + b.w / 2, b.y + b.h * 0.3, 7, b.w * 0.8);
    } else {
      sound("whoosh");
      const spin = (a, z, f) => step(motion, [{ transform: `translateY(-14%) scaleX(${a})` }, { transform: `translateY(-14%) scaleX(${z})` }], { duration: 95, easing: "ease-in-out" })
        .then(() => f && facePet(f));
      await step(motion, [{ transform: "translateY(0)" }, { transform: "translateY(-14%)" }], { duration: 200, easing: "ease-out" });
      // Without the spin, the back of the head would only flash.
      for (let i = 0; i < 2; i++) {
        await spin(1, 0, still() ? "" : "away");
        await spin(0, 1);
        await spin(1, 0, "react");
        await spin(0, 1);
      }
      await step(motion, [
        { transform: "translateY(-14%)" },
        { transform: "translateY(0) scale(1.07,.93)", offset: 0.8 },
        { transform: "translateY(0) scale(1)" },
      ], { duration: 300, easing: "ease-in" });
      sound("land");
      sparkles(b.x + b.w / 2, b.y + b.h * 0.35, 6, b.w * 0.9);
    }
    say(TRICK_LINES[w]);
    buzz([16, 40, 16]);
    await wait(600);
    facePet();
  }

  function showerArt(w, i) {
    if (w === "8bit") return `<svg viewBox="0 0 5 5" shape-rendering="crispEdges"><path d="M2 0h1v2h2v1H3v2H2V3H0V2h2z" fill="${i % 2 ? "#ffec27" : "#ff77a8"}"/></svg>`;
    if (w === "milk") {
      return i % 3 === 0
        ? `<svg viewBox="0 0 24 24"><path d="M12 6c-5-4-11 1-8 8 2 4 6 6 8 8 2-2 6-4 8-8 3-7-3-12-8-8z" fill="#ff4f7b"/><path d="M8 5c2 2 6 2 8 0" stroke="#4fae55" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>`
        : `<svg viewBox="0 0 24 22"><path d="M12 20.5C6.4 16.9 2.5 13.4 2.5 9.3 2.5 6.4 4.8 4.5 7.4 4.5c1.9 0 3.5 1 4.6 2.7 1.1-1.7 2.7-2.7 4.6-2.7 2.6 0 4.9 1.9 4.9 4.8 0 4.1-3.9 7.6-9.5 11.2z" fill="${i % 2 ? "#ff8fb3" : "#fff"}"/></svg>`;
    }
    if (w === "najeon") return `<svg viewBox="0 0 24 24"><g fill="${["#eef3ff", "#dff6ff", "#f6e8ff"][i % 3]}" opacity=".95">${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="12" cy="6" rx="3.6" ry="5.4" transform="rotate(${a} 12 12)"/>`).join("")}</g><circle cx="12" cy="12" r="2.4" fill="#ffd98a"/></svg>`;
    return `<svg viewBox="0 0 24 24"><path d="M12 1l3 7.5 8 .6-6.1 5.2 1.9 7.8L12 17.8 5.2 22.1l1.9-7.8L1 9.1l8-.6z" fill="${i % 2 ? "#ffe38a" : "#fff6d6"}" stroke="#c9932e" stroke-width="1"/></svg>`;
  }

  async function secret(drop) {
    const w = world();
    const k = key;
    key = null;
    lit = 0;
    await drop;
    await wait(350);
    const b = box();
    // The finished key turns upright, slides its tip into the window's keyhole and turns.
    const kb = k.getBoundingClientRect();
    const wb = win.getBoundingClientRect();
    const dx = wb.width / 2 - (kb.left - wb.left + kb.width * 0.955);
    const dy = 10 - (kb.top - wb.top + kb.height * 0.5);
    const inHole = `translate(${dx}px, ${dy}px) rotate(-90deg) scale(.7)`;
    k.style.transformOrigin = "95.5% 50%";
    sound("whoosh", 0, { rate: 1.1 });
    await step(k, [
      { transform: "translate(0,0) rotate(0) scale(1)" },
      { transform: `translate(${dx}px, ${dy + 40}px) rotate(-90deg) scale(.7)`, offset: 0.7 },
      { transform: inHole },
    ], { duration: 560, easing: "cubic-bezier(.45,0,.4,1)" });
    sound("click", 0, { rate: 0.85 });
    buzz(30);
    await step(k, [{ transform: `${inHole} scaleY(1)` }, { transform: `${inHole} scaleY(.12)` }], { duration: 220, easing: w === "8bit" ? "steps(3)" : "cubic-bezier(.5,1.6,.6,1)" });
    // Unlock: a flash and rays pour from the keyhole.
    if (still()) {
      k.remove();
    } else {
      once(add("keyhole-flash"), [{ transform: "scale(.2)", opacity: 1 }, { transform: "scale(4)", opacity: 0 }], { duration: 650, easing: "ease-out" });
      once(k, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: 150 });
    }
    pulseFlash(0.5, 200);
    chime("unlock");
    sound("whistle-up", 120);
    if (!still()) {
      const rays = add("unlock-rays");
      rays.innerHTML = "<i></i>";
      once(rays.firstChild, [
        { opacity: 0, transform: "rotate(0)" },
        { opacity: 1, transform: "rotate(25deg)", offset: 0.15 },
        { opacity: 0.9, transform: "rotate(70deg)", offset: 0.8 },
        { opacity: 0, transform: "rotate(90deg)" },
      ], { duration: 4200, easing: "linear" }).then(() => rays.remove());
    }
    // Charge, then launch out of the top of the window.
    await wait(250);
    facePet("blink");
    await step(motion, [{ transform: "translateY(0) scale(1)" }, { transform: "translateY(6%) scale(1.14,.82)" }], { duration: 300, easing: "ease-in" });
    facePet("react");
    voice("excited");
    sound("trail");
    buzz(24);
    const trail = still() ? 0 : window.setInterval(() => {
      const p = box();
      sparkles(p.x + p.w / 2, p.y + p.h * 0.85, 2, 30);
    }, 60);
    await step(motion, [
      { transform: "translateY(6%) scale(1.14,.82)" },
      { transform: "translateY(-30%) scale(.9,1.16)", offset: 0.3 },
      { transform: "translateY(-170%) scale(.9,1.12)" },
    ], { duration: 520, easing: "cubic-bezier(.3,.1,.5,1)" });
    window.clearInterval(trail);
    // The world's shower falls while the pet is up there.
    for (let i = 0; i < (still() ? 0 : 22); i++) {
      const s = 16 + Math.random() * 16;
      const drift = (Math.random() - 0.5) * 60;
      const bit = add("shower", Math.random() * (b.W - s), -s);
      bit.style.width = `${s}px`;
      bit.style.height = `${s}px`;
      bit.innerHTML = showerArt(w, i);
      once(bit, [{ transform: "translate(0,0) rotate(0)" }, { transform: `translate(${drift}px, ${b.H + s * 2}px) rotate(${(Math.random() - 0.5) * 540}deg)` }],
        { duration: 1500 + Math.random() * 900, delay: i * 55, easing: w === "8bit" ? "steps(14)" : "cubic-bezier(.4,.1,.7,1)" });
    }
    sound("sparkle", 100, { rate: 1.3 });
    sound("sparkle", 420, { rate: 1.5 });
    sound("sparkle", 760, { rate: 1.2 });
    // Wiggles up top so the wait never reads as a freeze.
    await step(motion, [
      { transform: "translateY(-170%) rotate(0)" },
      { transform: "translateY(-165%) rotate(-10deg)", offset: 0.25 },
      { transform: "translateY(-172%) rotate(10deg)", offset: 0.75 },
      { transform: "translateY(-170%) rotate(0)" },
    ], { duration: 900, easing: "ease-in-out" });
    // Spins back down and lands to a fanfare.
    sound("whistle-up", 0, { rate: 0.7 });
    await step(motion, [{ transform: "translateY(-170%) rotate(0) scale(1)" }, { transform: "translateY(0) rotate(720deg) scale(1)" }], { duration: 620, easing: "cubic-bezier(.5,0,.8,.6)" });
    await step(motion, [
      { transform: "translateY(0) scale(1.18,.8)" },
      { transform: "translateY(-6%) scale(.95,1.06)", offset: 0.5 },
      { transform: "translateY(0) scale(1)" },
    ], { duration: 380, easing: "ease-out" });
    sound("land");
    if (!still()) {
      const floor = add("floor-ring", b.x + b.w * 0.2, b.y + b.h * 0.9);
      floor.style.width = `${b.w * 0.6}px`;
      once(floor, [{ transform: "scale(.4)", opacity: 1 }, { transform: "scale(2.2)", opacity: 0 }], { duration: 700, easing: "ease-out" });
    }
    cryAt("excited", 1);
    cryAt("happy", 1.12, 420);
    chime("fanfare", 60);
    buzz([40, 60, 40, 60, 160]);
    sparkles(b.x + b.w / 2, b.y + b.h * 0.3, 10, b.w);
    const p = pet.getBoundingClientRect();
    floatHearts(p.left + p.width / 2, p.top + p.height * 0.2);
    say(SECRET_LINES[w]);
    await wait(1400);
    facePet();
  }

  let queue = Promise.resolve();
  let asked = 0;
  let secretOn = false;

  async function run(n, start) {
    while (careHold.busy) await wait(100);
    // A reply that lands after 잠 or during the reveal must not pull the pet into a stage.
    if (careHold.asleep || root.classList.contains("has-reveal")) return;
    care.hold();
    try {
      tapFx();
      const drop = showKey(n, start);
      if (n === 1) await hello();
      else if (n === 2) await trick();
      else await secret(drop);
    } finally {
      motion.style.transform = "";
      motion.style.transformOrigin = "";
      if (n === 3) secretOn = false;
      care.release();
    }
    if (key && left() <= 0) expire();
  }

  // A stage asked for mid-stage plays right after it.
  function play(n, start) {
    talkHook?.taken();
    asked = n;
    if (n === 3) secretOn = true;
    queue = queue.catch(() => {}).then(() => run(n, start));
    return queue;
  }

  // Web NFC (Android Chrome): while the page listens, a plushie tap reaches it without a reload.
  const nfcButton = document.querySelector("[data-demo-nfc]");
  const demo = document.querySelector("[data-demo-panel]");
  // The tag that opened this page; read again with the same counter, it is still that tap.
  const pageTag = new URLSearchParams(window.location.search).get("uid") || "";
  let ready = false;
  let listening = null;
  let lastRead = -Infinity;
  let sending = Promise.resolve();
  let settled = -Infinity;
  let away = false;
  let sinkFn = null;
  let handoff = 0;

  function nfcState(on) {
    if (!nfcButton) return;
    nfcButton.textContent = on ? "NFC 바로 인식 켜짐" : "NFC 권한을 허용해 주세요";
    nfcButton.disabled = on;
  }

  async function granted() {
    try {
      return (await navigator.permissions.query({ name: "nfc" })).state === "granted";
    } catch {
      return false;
    }
  }

  function listen() {
    if (!listening) {
      const controller = new AbortController();
      try {
        const reader = new NDEFReader();
        reader.addEventListener("reading", heard);
        listening = reader.scan({ signal: controller.signal }).then(() => controller, () => null);
      } catch {
        listening = Promise.resolve(null);
      }
      // A tag still on the phone is read again as soon as a fresh page listens, so the same-tap window opens here.
      listening.then((controller) => {
        if (controller) lastRead = Math.max(lastRead, performance.now());
        else listening = null;
        nfcState(Boolean(controller));
      });
    }
    return listening;
  }

  function identify(event) {
    for (const record of event.message?.records || []) {
      if (record.recordType !== "url" && record.recordType !== "absolute-url") continue;
      try {
        const url = new URL(new TextDecoder().decode(record.data), window.location.href);
        const raw = url.searchParams.get("uid") || "";
        if (url.origin === window.location.origin && url.pathname === "/t" && TAP_UID.test(raw)) return { serial: raw.slice(0, 14), raw, url: url.href };
      } catch {
        /* not a URL */
      }
    }
    return { serial: String(event.serialNumber || "").replaceAll(":", "").toUpperCase(), raw: "", url: "" };
  }

  // Only a chain the key still shows continues in place; anything else loads a full tap.
  function heard(event) {
    const now = performance.now();
    // While a game holds the reader, this plushie's taps go to it and nothing navigates.
    if (sinkFn) {
      const twice = now - lastRead < SINK_SAME_MS;
      lastRead = now;
      if (!twice && identify(event).serial === uid) sinkFn();
      return;
    }
    const again = now - lastRead < SAME_TAP_MS;
    lastRead = now;
    if (again) return;
    const tag = identify(event);
    if (tag.serial !== uid) {
      if (tag.url) window.location.replace(tag.url);
      return;
    }
    const raw = tag.raw || uid;
    if (raw.includes("x") && raw === pageTag) return;
    talkHook?.close(true);
    if (!ready || away || secretOn || waking || root.classList.contains("has-reveal")
      || document.querySelector("canvas.celebrate-layer, .is-evolving, .is-still-celebrate, .is-reunion-jump")) return;
    if (careHold.asleep) {
      window.location.replace(`/t?uid=${raw}`);
      return;
    }
    closeSheet();
    if (demo && !demo.hidden) demo.querySelector("[data-demo-close]")?.click();
    // Taps go out one at a time, so each one sees the chain the reply before it opened.
    const turn = handoff;
    sending = sending.catch(() => {}).then(() => send(raw, turn));
  }

  const chained = () => (key ? lit < 3 : Boolean(accepted) && accepted.n < 3 && performance.now() - accepted.at < WINDOW_MS);

  async function send(raw, turn) {
    // The server takes a tap within SAME_TAP_MS of the last as the same tap, so a tap queued behind a slow reply keeps that gap.
    const gap = settled + SAME_TAP_MS - performance.now();
    if (gap > 0) await wait(gap);
    // A tap queued behind a reload, the secret or a game that took the reader is dropped.
    if (away || secretOn || turn !== handoff) return;
    // A reload would drop the page's touch, and Chrome lets only a touched page play sound and buzz.
    const fresh = !chained();
    const sent = performance.now();
    const reply = await fetch("/combo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fresh ? { uid: raw, start: true } : { uid: raw }),
      credentials: "same-origin",
    })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);
    settled = performance.now();
    // A reply that lands after a game took the reader belongs to the page before it.
    if (turn !== handoff) return;
    if (reply?.ok && (reply.same || (reply.combo > 1 && reply.combo <= asked))) {
      // A start the server took as the same tap as a step it already holds (another tab's) continues from that step.
      if (fresh && reply.same) accepted = { n: reply.combo, at: sent };
      return;
    }
    if (!reply?.ok || (fresh ? reply.combo !== 1 : !(reply.combo >= 2 && reply.combo <= 3))) {
      if (!secretOn) {
        away = true;
        window.location.replace(`/t?uid=${raw}`);
      }
      return;
    }
    accepted = { n: reply.combo, at: sent };
    const count = document.querySelector("[data-tap-count]");
    if (count) {
      count.dataset.tapCount = String(reply.tapCount);
      enhanceRollingCounter({ duration: 400 });
    }
    if (fresh) {
      care.hearts(reply.hearts);
      if (reply.rewarded) paintLevel(reply);
      if (reply.later) dock.dataset.comboLater = reply.later;
      else delete dock.dataset.comboLater;
    }
    play(reply.combo, sent);
  }

  if (nfcButton && "NDEFReader" in window) {
    nfcButton.hidden = false;
    granted().then((yes) => yes && nfcState(true));
    // scan() must run inside the click: that is what shows Chrome's permission prompt.
    nfcButton.addEventListener("click", () => listen());
  }

  // Called once the opening is over: the page's own stage, then listening when NFC is already allowed.
  function start() {
    ready = true;
    if ("NDEFReader" in window) granted().then((yes) => yes && listen());
    const n = Number(dock.dataset.combo) || 0;
    if (n < 1 || n > 3) return;
    const at = loaded || performance.now();
    accepted = { n, at };
    window.requestAnimationFrame(() => play(n, at));
  }

  function restyle() {
    preload();
    if (!key) return;
    if (left() <= 0) {
      expire();
      return;
    }
    const old = key;
    key = build();
    old.remove();
    paintKey(lit);
    countdown();
  }

  window.addEventListener("pagehide", () => {
    listening?.then((controller) => controller?.abort());
    listening = null;
  });
  function sink(fn) {
    sinkFn = fn || null;
    if (fn) handoff += 1;
  }

  function end() {
    accepted = null;
    if (key) expire();
  }

  window.addEventListener("load", preload, { once: true });
  return { start, restyle, listen, sink, end };
})();

/* 오락실: 기 모으기 on a WebGL stage, loaded when the room first opens; the first 3 plays a day give XP. */
const arcade = (function arcadeRoom() {
  const dock = document.querySelector(".dock[data-care-uid]");
  const sheet = document.querySelector('[data-sheet="arcade"]');
  const win = document.querySelector("[data-window]");
  if (!dock || !care || !combo || !sheet || !win) return null;
  const root = document.documentElement;
  const button = dock.querySelector('[data-open="arcade"]');
  const start = sheet.querySelector('[data-game="gi"]');
  const blurb = start.closest(".g-card").querySelector("small");
  const giftRow = sheet.querySelector("[data-open-gifts]");
  const thumb = sheet.querySelector(".g-thumb-pet");
  const uid = dock.dataset.careUid;
  const world = () => root.dataset.theme || "classic";
  const kit = () => (world() === "8bit" ? "chip" : "soft");
  const BLURB = blurb.textContent;
  const FAILED = "지금은 열 수 없어요. 잠시 후에 다시 해 볼까요?";
  const VENDOR = ["/vendor/pixi-8.22.0.min.js", "/vendor/pixi-unsafe-eval-8.22.0.min.js", "/vendor/pixi-filters-6.1.5.js"];
  const NFC_WAIT_MS = 15000;
  const SOUNDS = ["count", "go", "note-c5", "note-c6", "note-c7", "tier", "rocket", "ding", "chime", "chime-low", "fall", "result", "best", "wind-2", "wind-3", "wind-4"];
  const scripts = new Map();
  let retry = 0;
  let posted = 0;
  let game = null;
  let ready = null;
  let playing = false;
  let held = null;

  function buzz(pattern) {
    if (navigator.userActivation?.hasBeenActive === false) return;
    tryVibrate(pattern);
  }

  // The hum under the charge: one oscillator through the app's limiter, its pitch and level following the gauge.
  const drone = (function chargeHum() {
    let osc = null;
    let level = null;
    let fade = null;
    let chip = false;
    const loud = (c) => (chip ? 1.3 * (0.02 + 0.04 * c) : 0.03 + 0.07 * c);
    return {
      start(isChip) {
        this.stop();
        if (!audio || audio.state !== "running") return;
        chip = isChip;
        const t = audio.currentTime;
        osc = audio.createOscillator();
        level = audio.createGain();
        fade = audio.createGain();
        if (chip) {
          osc.type = "square";
          const lowpass = audio.createBiquadFilter();
          lowpass.type = "lowpass";
          lowpass.frequency.value = 5000;
          osc.connect(lowpass).connect(level);
        } else {
          osc.setPeriodicWave(audio.createPeriodicWave(new Float32Array(4), new Float32Array([0, 1, 0.5, 0.2]), { disableNormalization: true }));
          osc.connect(level);
        }
        osc.frequency.value = 98;
        level.gain.value = loud(0);
        fade.gain.setValueAtTime(0, t);
        fade.gain.linearRampToValueAtTime(1, t + 0.2);
        level.connect(fade).connect(sfxOut());
        osc.start(t);
      },
      set(charge) {
        if (!osc) return;
        const t = audio.currentTime;
        osc.frequency.setTargetAtTime(98 * 2 ** (0.9 * charge), t, 0.03);
        level.gain.setTargetAtTime(loud(charge), t, 0.03);
      },
      stop() {
        if (!osc) return;
        const t = audio.currentTime;
        fade.gain.cancelScheduledValues(t);
        fade.gain.setValueAtTime(fade.gain.value, t);
        fade.gain.linearRampToValueAtTime(0, t + 0.04);
        osc.stop(t + 0.05);
        osc = null;
      },
    };
  })();

  function paintLeft(left) {
    dock.dataset.arcadeLeft = String(left);
    sheet.querySelectorAll(".g-pip").forEach((pip, i) => pip.classList.toggle("is-used", i < 3 - left));
    sheet.querySelector("[data-arcade-today] b").textContent = left ? `${left}번 남았어요` : "다 했어요!";
    button.classList.toggle("has-new", giftRow.classList.contains("has-new") || left > 0);
  }

  // The reply updates everything a reload would show.
  function settle(r) {
    paintLeft(r.xpLeft);
    dock.dataset.giBest = String(r.best);
    paintLevel(r);
  }

  function post(height) {
    const run = ++posted;
    return fetch("/arcade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, game: "gi", height }),
      credentials: "same-origin",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((reply) => (reply?.ok ? reply : null))
      .catch(() => null)
      .then((reply) => {
        // A slow reply from an earlier run must not roll back a newer one.
        if (reply && run === posted) settle(reply);
        return reply;
      });
  }

  const api = {
    win,
    pet,
    say: (text) => care.fx.say(text),
    sfx(name, { rate, gain, at = 0 } = {}) {
      if (at) window.setTimeout(() => playSfx(name, { rate, gain }), at);
      else playSfx(name, { rate, gain });
    },
    buzz,
    still: () => prefersReducedMotion(),
    drone,
    onLaunch: (height) => post(height),
  };

  // Each vendor script loads once per page; a failed one is dropped so the next open retries it.
  function script(src) {
    if (!scripts.has(src)) {
      scripts.set(src, new Promise((resolve, reject) => {
        const el = document.createElement("script");
        el.src = src;
        el.addEventListener("load", resolve, { once: true });
        el.addEventListener("error", () => {
          el.remove();
          scripts.delete(src);
          reject(new Error(src));
        }, { once: true });
        document.head.appendChild(el);
      }));
    }
    return scripts.get(src);
  }

  function prepare() {
    if (!game) {
      const made = VENDOR.reduce((done, src) => done.then(() => script(src)), Promise.resolve())
        // A failed import stays failed for its URL, so a retry asks for a new one.
        .then(() => import(retry ? `/game/gimo.js?retry=${retry}` : "/game/gimo.js").catch((error) => {
          retry += 1;
          throw error;
        }))
        .then((m) => m.createGimo(api));
      game = made;
      made.then((g) => {
        if (game === made) ready = g;
        else g.destroy();
      }, () => {
        if (game === made) game = null;
      });
    }
    return game;
  }

  function paintStart() {
    start.textContent = "시작";
    start.disabled = false;
    blurb.textContent = BLURB;
    if (careHold.asleep) {
      blurb.textContent = "쿨쿨 자는 중이에요";
      start.disabled = true;
      return;
    }
    // The engine loads behind a live 시작; a tap meanwhile waits for it.
    if (!ready) prepare().catch(() => {
      if (!held && sheetOpen === sheet) blurb.textContent = FAILED;
    });
  }

  function open() {
    playSfx(`care-${kit()}-press`);
    buzz(10);
    const canon = pet.querySelector('[data-frame="canon"]');
    if (canon) thumb.src = canon.getAttribute("src");
    for (const name of SOUNDS) loadSfx(`game-${kit()}-${name}`);
    if (kit() === "soft") loadSfx("game-soft-thump");
    held = null;
    paintStart();
  }

  function onScreen(event) {
    if (ready?.phase !== "charge" || event.target.closest?.("button")) return;
    ready.tap("screen");
  }

  async function run(g, mode) {
    closeSheet();
    combo.end();
    care.hold();
    root.classList.add("g-on");
    combo.sink(() => g.tap("nfc"));
    document.addEventListener("pointerdown", onScreen, true);
    let out = "again";
    try {
      while (out === "again") out = await g.play(mode, Number(dock.dataset.giBest) || 0);
    } finally {
      combo.sink(null);
      document.removeEventListener("pointerdown", onScreen, true);
      root.classList.remove("g-on");
      care.release();
      playing = false;
    }
    if (out === "quit") care.fx.say("재밌었어요! 또 놀아요!");
  }

  function petBusy() {
    return Boolean(careHold.busy || waking || root.classList.contains("has-reveal")
      || document.querySelector("canvas.celebrate-layer, .is-evolving, .is-still-celebrate, .is-reunion-jump"));
  }

  // A tap is held until the engine and the NFC reader are up; closing the sheet first drops it.
  function begin() {
    if (playing || held || careHold.asleep || petBusy()) return;
    const tap = {};
    held = tap;
    start.textContent = "준비 중…";
    start.disabled = true;
    playSfx(`care-${kit()}-press`);
    buzz(12);
    // scan() must run inside the click: that is what shows Chrome's permission prompt.
    const listening = "NDEFReader" in window ? combo.listen() : null;
    const reader = listening && Promise.race([listening, new Promise((resolve) => window.setTimeout(() => resolve(null), NFC_WAIT_MS))]);
    // After a failed load, this tap tries again.
    Promise.all([prepare(), reader]).then(([g, nfc]) => {
      if (held !== tap) return;
      held = null;
      paintStart();
      // While it waited, the sheet may have closed, the page hidden, the stage been rebuilt or a combo begun.
      if (sheetOpen !== sheet || document.hidden || ready !== g || careHold.asleep || petBusy()) return;
      playing = true;
      run(g, nfc ? "nfc" : "screen");
    }, () => {
      if (held !== tap) return;
      held = null;
      start.textContent = "시작";
      start.disabled = false;
      blurb.textContent = FAILED;
    });
  }

  function restyle() {
    if (!game) return;
    const old = game;
    game = null;
    ready = null;
    old.then((g) => g.destroy(), () => {});
  }

  button.addEventListener("click", open);
  start.addEventListener("click", begin);
  giftRow.addEventListener("click", () => {
    closeSheet();
    window.setTimeout(() => openSheet("gifts", button), prefersReducedMotion() ? 0 : 300);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && (ready?.phase === "ready" || ready?.phase === "charge")) ready.abort();
  });
  window.addEventListener("pagehide", () => {
    ready?.destroy();
    game = null;
    ready = null;
  });
  return { restyle };
})();

/* Talk: a small mic at the speech line opens a slim bar; the pet answers in its own line. */
(function talkBar() {
  const mic = dialogBox?.querySelector("[data-talk-mic]");
  const bar = document.querySelector("[data-talk-bar]");
  const dock = document.querySelector(".dock[data-care-uid]");
  const intro = dialogBox?.querySelector(".intro");
  if (!mic || !bar || !dock || !intro || !care) return;
  const input = bar.querySelector("[data-talk-input]");
  const voiceBtn = bar.querySelector("[data-talk-voice]");
  const sendBtn = bar.querySelector("[data-talk-send]");
  const hint = bar.querySelector("[data-talk-hint]");
  const uid = dock.dataset.careUid;
  const MAX = 200;
  const BUBBLE = 60;
  const GIVE_UP_MS = 25000;
  const ERROR_LINE = "음… 머리가 빙글빙글해요. 조금 있다 다시 말해 줄래요?";
  const REFUSAL_LINE = "음… 그건 잘 모르겠어요. 다른 얘기 해 줄래요?";
  const KEYBOARD_HINT = "키보드의 마이크 버튼으로 말해도 돼요";
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const count = (text) => Array.from(text.trim()).length;
  let open = false;
  let inflight = false;
  // The answer still owed to the speech line; anything else speaking clears it.
  let pending = null;
  let bubbles = [];
  let bubble = 0;
  let ready = false;
  let seq = 0;
  let sources = null;
  let cited = null;
  let rec = null;

  function setHint(text, tap = false) {
    hint.textContent = text;
    hint.hidden = !text;
    hint.classList.toggle("is-tap", tap);
  }

  function checkLength() {
    const n = count(input.value);
    if (n > MAX) setHint(`${MAX}자까지 보낼 수 있어요 (${n}/${MAX})`);
    else if (!hint.classList.contains("is-tap")) setHint("");
    sendBtn.disabled = inflight || n > MAX;
  }

  // Keeps the bar above the phone keyboard and the speech line in view above the bar.
  function place() {
    if (!open) return;
    const vv = window.visualViewport;
    const lift = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    bar.style.bottom = `${lift}px`;
    bar.classList.toggle("is-lifted", lift > 0);
    document.body.style.paddingBottom = `${bar.offsetHeight + lift}px`;
    const top = vv ? vv.offsetTop : 0;
    const bottom = top + (vv ? vv.height : window.innerHeight) - bar.offsetHeight - 8;
    const box = dialogBox.getBoundingClientRect();
    if (box.bottom > bottom) window.scrollBy(0, Math.min(box.bottom - bottom, box.top - top - 8));
    else if (box.top < top + 8) window.scrollBy(0, box.top - top - 8);
  }

  function watch(on) {
    const vv = window.visualViewport;
    const fn = on ? "addEventListener" : "removeEventListener";
    vv?.[fn]("resize", place);
    vv?.[fn]("scroll", place);
    window[fn]("resize", place);
    document[fn]("pointerdown", outside, true);
    document[fn]("keydown", escape, true);
  }

  function outside(event) {
    if (bar.contains(event.target) || dialogBox.contains(event.target)) return;
    close();
  }

  function escape(event) {
    if (event.key === "Escape") close();
  }

  function openBar() {
    if (open) return;
    open = true;
    bar.hidden = false;
    void bar.offsetWidth;
    bar.classList.add("is-open");
    mic.setAttribute("aria-expanded", "true");
    watch(true);
    place();
    checkLength();
  }

  // The draft stays until reload; a reply already sent still lands unless drop is set.
  function close(drop = false) {
    if (drop) taken();
    stopVoice(true);
    if (!open) return;
    open = false;
    watch(false);
    bar.classList.remove("is-open");
    bar.style.bottom = "";
    document.body.style.paddingBottom = "";
    mic.setAttribute("aria-expanded", "false");
    if (bar.contains(document.activeElement)) document.activeElement.blur();
    window.setTimeout(() => {
      if (!open) bar.hidden = true;
    }, prefersReducedMotion() ? 0 : 220);
  }

  function clearSources() {
    sources?.remove();
    sources = null;
  }

  // Someone else has the speech line now.
  function taken() {
    seq += 1;
    ready = false;
    bubbles = [];
    clearSources();
    if (pending?.thinking) {
      intro.classList.remove("is-thinking");
      intro.textContent = pending.before;
    }
    pending = null;
  }

  function takeLine() {
    seq += 1;
    sayToken += 1;
    window.clearTimeout(lineTimer);
    lineReady = false;
    ready = false;
    bubbles = [];
    clearSources();
    dialogBox.classList.add("is-seq");
    dialogBox.classList.remove("is-end");
    showLine(0);
  }

  function split(text) {
    // Only punctuation before a space ends a sentence, so 3.5°C stays whole.
    const parts = text.split(/(?<=[.!?]["'”’)]*)\s+/);
    const sentences = [];
    for (const raw of parts) {
      const part = raw.trim();
      if (!part) continue;
      // A trailing emoji rides with its sentence.
      if (sentences.length && !/[\p{L}\p{N}]/u.test(part)) sentences[sentences.length - 1] += ` ${part}`;
      else sentences.push(part);
    }
    const pieces = [];
    for (const s of sentences) {
      if (count(s) <= BUBBLE) {
        pieces.push(s);
        continue;
      }
      let line = "";
      for (const word of s.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (count(next) <= BUBBLE) {
          line = next;
          continue;
        }
        if (line) pieces.push(line);
        let rest = Array.from(word);
        while (rest.length > BUBBLE) {
          pieces.push(rest.slice(0, BUBBLE).join(""));
          rest = rest.slice(BUBBLE);
        }
        line = rest.join("");
      }
      if (line) pieces.push(line);
    }
    const out = [];
    let cur = [];
    for (const p of pieces) {
      if (cur.length && (cur.length >= 2 || count([...cur, p].join(" ")) > BUBBLE)) {
        out.push(cur.join(" "));
        cur = [];
      }
      cur.push(p);
    }
    if (cur.length) out.push(cur.join(" "));
    return out;
  }

  function stillLine(text) {
    const shown = document.createElement("span");
    const cursor = document.createElement("span");
    const spoken = document.createElement("span");
    shown.setAttribute("aria-hidden", "true");
    shown.textContent = text;
    cursor.className = "dialog-cursor is-done";
    cursor.setAttribute("aria-hidden", "true");
    spoken.className = "visually-hidden";
    spoken.textContent = text;
    intro.replaceChildren(shown, cursor, spoken);
    intro.classList.add("is-dialog");
  }

  function showSources(list) {
    const links = (list || []).map((s) => {
      try {
        const url = new URL(s.url);
        return url.protocol === "https:" || url.protocol === "http:" ? url : null;
      } catch {
        return null;
      }
    }).filter(Boolean).slice(0, 2);
    if (!links.length) return;
    sources = document.createElement("p");
    sources.className = "talk-src";
    const label = document.createElement("span");
    label.textContent = "출처";
    sources.append(label);
    for (const url of links) {
      const a = document.createElement("a");
      a.href = url.href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = url.hostname.replace(/^www\./, "");
      sources.append(a);
    }
    mic.before(sources);
  }

  function say(i, list) {
    const mine = seq;
    bubble = i;
    ready = false;
    const last = i >= bubbles.length - 1;
    dialogBox.classList.remove("is-end");
    const done = () => {
      if (mine !== seq) return;
      if (last) {
        dialogBox.classList.add("is-end");
        showSources(list);
      }
      // Ready on the next task, so the tap that finished the typing can't also advance.
      window.setTimeout(() => {
        if (mine === seq) ready = true;
      }, 0);
    };
    if (prefersReducedMotion()) {
      stillLine(bubbles[i]);
      done();
    } else {
      typeLine(intro, bubbles[i], done, i === 0 ? 120 : 60);
    }
  }

  function answer(text, list) {
    intro.classList.remove("is-thinking");
    bubbles = split(text);
    cited = list;
    say(0, list);
  }

  function send(text) {
    const said = text.trim();
    if (!said || inflight) return;
    if (count(said) > MAX) {
      checkLength();
      return;
    }
    ensureAudio();
    stopVoice(true);
    inflight = true;
    input.value = "";
    setHint("");
    checkLength();
    const before = intro.querySelector(".visually-hidden")?.textContent ?? intro.textContent;
    takeLine();
    const mine = { thinking: true, before };
    pending = mine;
    const line = sayToken;
    intro.classList.add("is-thinking");
    const dots = document.createElement("span");
    dots.className = "talk-dots";
    dots.textContent = "…";
    dots.setAttribute("aria-label", "생각하는 중");
    intro.replaceChildren(dots);
    const quit = new AbortController();
    const timer = window.setTimeout(() => quit.abort(), GIVE_UP_MS);
    fetch("/talk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, text: said }),
      credentials: "same-origin",
      signal: quit.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((reply) => {
        window.clearTimeout(timer);
        inflight = false;
        checkLength();
        const failed = !reply || (!reply.ok && reply.line !== REFUSAL_LINE);
        // A failed send gives the words back, unless new ones were typed meanwhile.
        if (failed && !input.value.trim()) {
          input.value = said;
          checkLength();
        }
        if (pending !== mine || sayToken !== line) return;
        pending = null;
        if (reply?.ok && typeof reply.text === "string" && reply.text) answer(reply.text, reply.sources);
        else answer(typeof reply?.line === "string" ? reply.line : ERROR_LINE, null);
      });
  }

  function stopVoice(abort) {
    if (!rec) return;
    const r = rec;
    rec = null;
    voiceBtn.classList.remove("is-listening");
    voiceBtn.setAttribute("aria-pressed", "false");
    try {
      if (abort) r.abort();
      else r.stop();
    } catch {
      /* already ended */
    }
  }

  function listen() {
    ensureAudio();
    if (rec) {
      // A second press ends the utterance; its final result still sends.
      const r = rec;
      try {
        r.stop();
      } catch {
        /* already ended */
      }
      return;
    }
    if (!Recognition || inflight) {
      if (!Recognition) setHint(KEYBOARD_HINT, true);
      return;
    }
    const r = new Recognition();
    r.lang = "ko-KR";
    r.continuous = false;
    r.interimResults = true;
    let heard = false;
    let failed = false;
    const mine = () => rec === r;
    r.onresult = (event) => {
      if (!mine() || heard) return;
      let text = "";
      let final = false;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
        if (event.results[i].isFinal) final = true;
      }
      input.value = text;
      checkLength();
      if (!final) return;
      heard = true;
      stopVoice(false);
      if (count(text) <= MAX) send(text);
    };
    r.onerror = () => {
      if (mine()) failed = true;
    };
    r.onend = () => {
      if (!mine()) return;
      stopVoice(true);
      if (failed || !heard) setHint(KEYBOARD_HINT, true);
    };
    rec = r;
    setHint("");
    voiceBtn.classList.add("is-listening");
    voiceBtn.setAttribute("aria-pressed", "true");
    try {
      r.start();
    } catch {
      stopVoice(true);
      setHint(KEYBOARD_HINT, true);
    }
  }

  function busy() {
    return Boolean(careHold.busy || careHold.asleep || waking || care.busy());
  }

  function sync() {
    const hide = busy();
    if (mic.hidden !== hide) mic.hidden = hide;
  }

  mic.addEventListener("pointerdown", (event) => event.stopPropagation());
  mic.addEventListener("click", () => {
    ensureAudio();
    if (open) close();
    else openBar();
  });
  dialogBox.addEventListener("pointerdown", (event) => {
    if (!ready || !bubbles.length || bubble >= bubbles.length - 1 || event.target.closest?.("a")) return;
    say(bubble + 1, cited);
  });
  bar.addEventListener("submit", (event) => event.preventDefault());
  sendBtn.addEventListener("click", () => send(input.value));
  voiceBtn.addEventListener("click", listen);
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    send(input.value);
  });
  input.addEventListener("input", () => {
    if (hint.classList.contains("is-tap")) setHint("");
    checkLength();
  });
  input.addEventListener("focus", () => window.setTimeout(place, 300));
  hint.addEventListener("click", () => {
    if (hint.classList.contains("is-tap")) input.focus();
  });
  window.addEventListener("pagehide", () => close(true));
  window.setInterval(sync, 250);
  // After the startup at the end of this file, so a celebration it begins keeps the mic hidden.
  window.setTimeout(sync, 0);
  talkHook = { taken, close };
})();

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
    loadSfx(cryName());
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
    // The panel's replays would land on top of a game.
    if (document.documentElement.classList.contains("g-on")) return;
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
  if (!prefersReducedMotion()) window.addEventListener("load", () => loadSfx(cryName()), { once: true });
  startWake(() => {
    runCelebrate();
    armReveal();
    frameNameForm();
  });
} else if (care && document.body.hasAttribute("data-morning")) {
  care.morning(() => {
    runCelebrate();
    armReveal();
    combo?.start();
  });
} else {
  runCelebrate();
  startDialog(() => care?.opened());
  combo?.start();
  armReveal();
}
document.documentElement.setAttribute("data-app", "");
