/* Dad demo: this browser's 말 or 양 from ?mascot=, and the admin panel's 12 animals. Persist localStorage+cookie. binding.js untouched. */
(function mascotDemoToggle() {
  const KEY = "pokkey-mascot";
  const MAX_AGE = String(400 * 24 * 60 * 60);
  const KINDS = (document.querySelector("script[data-mascots]")?.dataset.mascots || "").split(" ").filter(Boolean);

  function readKind() {
    const saved = document.querySelector('meta[name="pet-kind"]');
    if (saved) return saved.content;
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("mascot");
      if (KINDS.includes(q)) return q;
    } catch (_) { /* ignore */ }
    try {
      const ls = localStorage.getItem(KEY);
      if (KINDS.includes(ls)) return ls;
    } catch (_) { /* ignore */ }
    try {
      const m = document.cookie.match(/(?:^|; )mascot=([a-z]+)(?:;|$)/);
      if (m && KINDS.includes(m[1])) return m[1];
    } catch (_) { /* ignore */ }
    return document.documentElement.getAttribute("data-mascot");
  }

  function persist(kind) {
    // Only 말 or 양 is this phone's own; any other kind lives on the pet.
    if (KINDS.includes(kind)) {
      try { localStorage.setItem(KEY, kind); } catch (_) { /* ignore */ }
      try {
        document.cookie = "mascot=" + kind + ";path=/;max-age=" + MAX_AGE + ";samesite=lax";
      } catch (_) { /* ignore */ }
    }
    // Drop the one-time ?mascot= from the address; the choice now lives in localStorage and the cookie.
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
    return (img.getAttribute("src") || "").replace(/mascot-[a-z]+-/, `mascot-${kind}-`);
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

  // Only the owner's own page saves the animal on the server; anyone else's stays in this browser.
  function fillKind(next) {
    const dock = document.querySelector(".dock[data-care-uid]");
    if (!dock) return;
    fetch("/kind", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: dock.dataset.careUid, kind: next, fill: true }),
      credentials: "same-origin",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((reply) => {
        if (!reply?.ok) return;
        // A fill keeps an animal another page saved meanwhile, so show that one.
        if (kind === next && reply.kind !== next) {
          kind = reply.kind;
          applyArt(kind);
        }
        paintStats(reply.stats);
        const animal = document.querySelector("[data-stat-animal]");
        if (animal) animal.textContent = reply.name;
      })
      .catch(() => {});
  }

  // The admin panel saves any of the 12 on the pet, named or not; a refusal puts the old animal back.
  function saveDemoKind(next, was) {
    const back = () => {
      if (kind !== next) return;
      kind = was;
      applyArt(was);
    };
    fetch("/demo/kind", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: document.querySelector("[data-demo-panel] input[name=uid]")?.value, kind: next }),
      credentials: "same-origin",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((reply) => {
        if (!reply?.ok) return back();
        paintStats(reply.stats);
        const animal = document.querySelector("[data-stat-animal]");
        if (animal) animal.textContent = reply.name;
        const replay = document.querySelector("[data-reveal-replay]");
        if (replay) replay.hidden = !revealKind();
        armReveal();
      })
      .catch(back);
  }

  let kind = readKind();
  const choice = new URLSearchParams(window.location.search).get("mascot");
  if (KINDS.includes(choice)) persist(choice);
  applyArt(kind);
  // The server can't see localStorage, so the owner's page fills an unsaved pet's animal.
  if (!document.querySelector('meta[name="pet-kind"]')) fillKind(kind);

  let skipClick = false;

  function swapTo(btn) {
    const next = btn.getAttribute("data-mascot");
    if (next === kind) {
      bouncePet();
      return;
    }
    const was = kind;
    kind = next;
    applyArt(kind); // swap FIRST so the squash is of the new pet
    bouncePet(); // same tick — one continuous motion
    saveDemoKind(kind, was);
  }

  function onPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    skipClick = true;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch (_) { /* ignore */ }
    swapTo(event.currentTarget);
  }

  function onClick(event) {
    if (skipClick) {
      skipClick = false;
      event.preventDefault();
      return;
    }
    swapTo(event.currentTarget);
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
// Where the phone reads the plushie: iPhones at the top edge, Android phones on the back; a desk page wakes on a reload.
const TAP_SPOT = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1) ? "top"
  : /Android/.test(navigator.userAgent) || (navigator.maxTouchPoints > 0 && matchMedia("(pointer: coarse)").matches) ? "back" : "desk";
// On a phone only the plushie taps: the page marks its own address view=1, so a reload or a restored tab is a quiet visit; a desk drops the mark so F5 still taps.
if (window.location.pathname === "/t") {
  const url = new URL(window.location.href);
  const quiet = TAP_SPOT !== "desk";
  if (url.searchParams.has("uid") && (url.searchParams.get("view") === "1") !== quiet) {
    if (quiet) url.searchParams.set("view", "1");
    else url.searchParams.delete("view");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }
}
// Phones hide the browser bars on the pet's home. Browsers allow it only inside a touch, so any touch outside fullscreen asks again.
const immersive = (function immersive() {
  const root = document.documentElement;
  const asks = {};
  let asked = false;
  for (const name of ["nfc", "microphone"]) navigator.permissions?.query({ name }).then((s) => { asks[name] = s; }, () => {});
  if (TAP_SPOT !== "desk" && document.fullscreenEnabled && document.querySelector(".dock[data-care-uid]")) {
    window.addEventListener("click", (event) => {
      asked = false;
      if (!event.isTrusted || event.target.closest?.("a, input, textarea, select, [data-talk-bar], [data-talk-mic]")) return;
      // After the page's own handlers, so a permission prompt one of them opens keeps the touch.
      window.setTimeout(() => {
        if (asked || document.fullscreenElement || document.querySelector(".name-form")
          || root.classList.contains("has-reveal") || root.classList.contains("g-on")) return;
        root.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
      }, 0);
    }, true);
    // The keyboard needs the browser's own resizing, so typing leaves fullscreen.
    document.addEventListener("focusin", (event) => {
      if (document.fullscreenElement === root && event.target.matches?.("input, textarea")) document.exitFullscreen().catch(() => {});
    });
  }
  // A first permission prompt can wait unseen behind fullscreen, so it is asked with the bars showing.
  function beforeAsk(name) {
    if (asks[name]?.state !== "prompt") return;
    asked = true;
    if (document.fullscreenElement === root) document.exitFullscreen().catch(() => {});
  }
  return { beforeAsk };
})();
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

/* 우리 기록's 안심 코드: a new code when the owner asks, shown only until the sheet closes and never kept by the browser. */
const recovery = document.querySelector("[data-recovery]");
const recoveryDock = document.querySelector(".dock[data-care-uid]");
if (recovery && recoveryDock) {
  const sheet = recovery.closest("[data-sheet]");
  const [idle, confirming, shown, fail, ask, go, cancel, code, copy, share] = ["idle", "confirm", "shown", "fail", "ask", "go", "cancel", "code", "copy", "share"]
    .map((name) => recovery.querySelector(`[data-recovery-${name}]`));
  const copyLabel = copy.querySelector("span");
  let copied = 0;

  function step(state) {
    idle.hidden = state !== "idle";
    confirming.hidden = state !== "confirm";
    shown.hidden = state !== "shown";
  }

  function forget() {
    window.clearTimeout(copied);
    code.textContent = "";
    copy.classList.remove("is-done");
    copyLabel.textContent = "복사";
    fail.hidden = true;
    step("idle");
  }

  ask.addEventListener("click", () => {
    fail.hidden = true;
    step("confirm");
    go.focus();
  });
  cancel.addEventListener("click", () => {
    step("idle");
    ask.focus();
  });
  go.addEventListener("click", () => {
    if (recovery.getAttribute("aria-busy") === "true") return;
    recovery.setAttribute("aria-busy", "true");
    go.disabled = true;
    cancel.disabled = true;
    fetch("/recovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: recoveryDock.dataset.careUid }),
      credentials: "same-origin",
    })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((reply) => {
        recovery.removeAttribute("aria-busy");
        go.disabled = false;
        cancel.disabled = false;
        if (!reply?.ok || typeof reply.code !== "string") {
          step("idle");
          fail.hidden = false;
          ask.focus();
          return;
        }
        code.textContent = reply.code;
        step("shown");
        code.focus();
      });
  });
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(code.textContent);
    } catch (_) {
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    copy.classList.add("is-done");
    copyLabel.textContent = "복사했어요";
    window.clearTimeout(copied);
    copied = window.setTimeout(() => {
      copy.classList.remove("is-done");
      copyLabel.textContent = "복사";
    }, 2000);
  });
  share.hidden = typeof navigator.share !== "function";
  share.addEventListener("click", () => {
    navigator.share({ text: code.textContent }).catch(() => {});
  });
  new MutationObserver(() => {
    if (sheet.hidden) forget();
  }).observe(sheet, { attributes: true, attributeFilter: ["hidden"] });
}

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

// A buzz before the page's first touch is blocked, so a celebration's buzz waits for that touch while the celebration still shows.
function celebrateBuzz(pattern, showing) {
  if (navigator.userActivation?.hasBeenActive === false) firstTouch.push(() => showing() && tryVibrate(pattern));
  else tryVibrate(pattern);
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
  return art?.[1] || shown?.getAttribute("src") || `/mascot-${document.documentElement.dataset.mascot}-512-v3.png`;
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
  celebrateBuzz([40, 60, 40], () => pet.classList.contains("is-reunion-jump"));
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
    celebrateBuzz([30, 40, 30, 40, 80], () => document.querySelector("canvas.celebrate-layer"));
    burstConfetti({ mode: "claim" });
    enhanceRollingCounter({ duration: 400, goldPop: false });
    return;
  }

  if (kind === "named") {
    if (prefersReducedMotion()) {
      // The lines show at once, so the edition they name goes on at once.
      revealEdition();
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
// Runs at the page's first touch: before it a phone plays no sound and blocks a buzz.
const firstTouch = [];

function wakeAudio() {
  try {
    if (!audio) {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      // A call or the lock screen stops sound (an iPhone says interrupted), so it is asked back while the page shows.
      ctx.addEventListener("statechange", () => {
        if (!document.hidden && (ctx.state === "suspended" || ctx.state === "interrupted")) ctx.resume().catch(() => {});
      });
      audio = ctx;
    }
    audio.resume?.();
  } catch (_) {
    audio = null;
  }
}

// Hidden pages stay silent: leaving mid-game still types the pet's goodbye line.
function blip() {
  if (!audio || audio.state !== "running" || document.hidden) return;
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
  if (!audio || audio.state !== "running" || document.hidden) return;
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
  if (!audio || audio.state !== "running" || document.hidden) return;
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
  if (document.hidden) return;
  const asked = performance.now();
  ensureAudio(() => {
    sfxBuffer(name).then((buffer) => {
      if (performance.now() - asked > SFX_LATE_MS || audio.state !== "running" || document.hidden) return;
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
    // Another line took the box: an unseen typing stops before its blips pile onto the new one.
    if (!text.isConnected) {
      finish();
      return;
    }
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
  if (dialogLines[index]?.classList.contains("is-edition")) revealEdition();
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

function sayLine(index, onTyped, delay = index === 0 ? 520 : 160) {
  const token = ++sayToken;
  const el = dialogLines[index];
  window.clearTimeout(lineTimer);
  lineReady = false;
  dialogBox.classList.remove("is-end");
  const text = lineText(el);
  showLine(index);
  if (el.classList.contains("gift")) glowGift();
  return typeLine(lineTarget(el), text, () => {
    if (token === sayToken) settleLine(index);
    onTyped?.();
  }, delay);
}

function startDialog(onTyped) {
  if (!dialogLines.length || prefersReducedMotion()) {
    onTyped?.();
    return;
  }
  dialogBox.classList.add("is-seq");
  if (navigator.userActivation?.hasBeenActive) {
    sayLine(0, onTyped);
    return;
  }
  // A plushie tap opens the page untouched, and an untouched phone stays silent, so the first line waits behind a typing bubble.
  const target = lineTarget(dialogLines[0]);
  const text = lineText(dialogLines[0]);
  const dots = document.createElement("span");
  const spoken = document.createElement("span");
  dots.className = "dialog-dots";
  dots.setAttribute("aria-hidden", "true");
  dots.innerHTML = "<i></i><i></i><i></i>";
  spoken.className = "visually-hidden";
  spoken.textContent = text;
  target.replaceChildren(dots, spoken);
  showLine(0);
  const token = sayToken;
  firstTouch.push((event) => {
    const control = event.target.closest?.("a, button, input, select, textarea, label");
    // On the next task, so the touch that starts the line can't also finish it.
    window.setTimeout(() => {
      if (token !== sayToken) {
        if (dots.isConnected) target.textContent = text;
        onTyped?.();
      } else if (control || prefersReducedMotion() || document.querySelector(".sheet.is-open, .demo-sheet.is-open, .has-reveal, .g-on, .f-on")) {
        // The touch started something that talks for itself, so the line shows at once, unspoken.
        sayLine(0, onTyped)();
      } else {
        sayLine(0, onTyped, 60);
      }
    }, 0);
  });
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
  // A sheet waiting on the server stays up, so the reply lands where the owner can see it.
  if (!sheet || sheet.querySelector('[aria-busy="true"]')) return;
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
function wireSheet(sheet) {
  sheet.addEventListener("click", (event) => {
    if (event.target === sheet) closeSheet();
  });
  sheet.querySelector("[data-sheet-close]")?.addEventListener("click", closeSheet);
}
document.querySelectorAll("[data-sheet]").forEach(wireSheet);
document.addEventListener("keydown", (event) => {
  if (!sheetOpen) return;
  if (event.key === "Escape") {
    closeSheet();
    return;
  }
  if (event.key !== "Tab") return;
  const items = Array.from(sheetOpen.querySelectorAll("button, [href], input")).filter((el) => !el.disabled && el.getClientRects().length);
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

// The 꾸미기 sheet's 창틀과 이름 tiles; the sheet fills it in, and the edition calls it whenever it changes.
let syncLooks = () => {};
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
    "8bit": (kind) => [`${kind}-px.png`, `${kind}-away-px.png`, "lock.svg", "cloud.svg", "heart-full.svg", "heart-half.svg", "heart-empty.svg", "feed.svg", "play.svg", "sleep.svg", `${kind}-closed-px.png`, `${kind}-happy-px.png`, "arcade.svg", "gift.svg", "farm.svg", "home.svg", "close.svg", "star.svg", "lock-dim.svg"],
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
    const kind = root.dataset.mascot;
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
    racing?.restyle();
    farm?.restyle();
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

  // 창틀과 이름: any frame up to the plushie's edition, stored like the world; the ones above only say which plushie is their key.
  const lookGrid = themeSheet.querySelector("[data-look-grid]");
  if (lookGrid) {
    const RANK = { classic: 0, rare: 1, legendary: 2 };
    const LOOK_LINES = { classic: "포근하게 돌아왔어요!", rare: "금실이 반짝반짝해요!", legendary: "별밤처럼 빛나요!" };
    const LOCK_LINES = { rare: "금실 레어 인형이 열쇠예요!", legendary: "별밤 레전더리 인형이 열쇠예요!" };
    const looks = Array.from(themeSheet.querySelectorAll("[data-look]"));
    const plush = () => root.dataset.edition || "classic";
    const worn = () => root.dataset.look || "classic";

    syncLooks = () => {
      for (const el of looks) {
        const locked = RANK[el.dataset.look] > RANK[plush()];
        el.classList.toggle("is-locked", locked);
        el.setAttribute("aria-disabled", String(locked));
        el.setAttribute("aria-pressed", String(el.dataset.look === worn()));
        el.setAttribute("aria-label", locked ? el.dataset.lockLabel : el.dataset.label);
        el.querySelector(".look-note").hidden = !locked;
      }
      const lede = themeSheet.querySelector("[data-look-lede]");
      lede.textContent = lede.dataset[plush()];
    };

    function pickLook(card) {
      const id = card.dataset.look;
      const still = prefersReducedMotion();
      if (RANK[id] > RANK[plush()]) {
        card.classList.remove("is-shake");
        void card.offsetWidth;
        card.classList.add("is-shake");
        speak(LOCK_LINES[id], still);
        return;
      }
      if (id === worn()) return;
      // The plushie's own edition needs no cookie, so the cookie only ever holds a lower frame.
      document.cookie = id === plush()
        ? "look=;path=/;max-age=0;samesite=lax"
        : `look=${id};path=/;max-age=${400 * 24 * 60 * 60};samesite=lax`;
      if (id === "classic") delete root.dataset.look;
      else root.dataset.look = id;
      root.classList.add("is-look-on");
      window.setTimeout(() => root.classList.remove("is-look-on"), 600);
      playSfx(`care-${root.dataset.theme === "8bit" ? "chip" : "soft"}-press`);
      tryVibrate(18);
      speak(LOOK_LINES[id], still);
      syncLooks();
    }

    lookGrid.addEventListener("click", (event) => {
      const card = event.target.closest("[data-look]");
      if (card) pickLook(card);
    });
  }
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

  const WAKE_IF = TAP_SPOT === "desk" ? "새로고침하면" : "폰에 인형을 톡 하면";
  const LINES = {
    classic: { feed: "냠냠! 사과가 아삭아삭 맛있어요!", nibble: "한 입만 더 먹을게요!", stash: "배불러요! 이건 나중에 먹을게요.", play: "와아, 신나요!", again: "헤헤, 진짜 재밌어요!", tired: "헥헥… 숨차요! 조금 쉬었다 놀아요.", content: "배부르고 신나요! 인형을 한 번 더 톡 해 볼래요?", sleep: `잘 자요… ${WAKE_IF} 깨어날게요.`, morning: "잘 잤어요! 좋은 아침이에요!", wake: "잘 잤어요! 몸이 가뿐해요!" },
    "8bit": { feed: "냠냠! HP가 가득 찼어요!", nibble: "한 입만 더! 냠!", stash: "HP가 꽉 찼어요! 이건 저장해 둘게요.", play: "점프! 점프! 최고 기록이에요!", again: "보너스 스테이지! 헤헤, 재밌어요!", tired: "헥헥… 스태미나 바닥! 조금 쉬었다 놀아요.", content: "HP도 기분도 MAX! 인형을 한 번 더 톡 해 볼래요?", sleep: `세이브 완료… ${WAKE_IF} 이어서 해요.`, morning: "새 게임 시작! 좋은 아침이에요!", wake: "이어서 하기! 체력이 가득해요!" },
    milk: { feed: "쪼옥~ 달콤한 딸기우유 최고예요!", nibble: "한 모금만 더 마실게요!", stash: "배불러요! 이건 나중에 마실게요.", play: "말랑말랑 딸기공 받아라!", again: "헤헤, 딸기공 또 잡았어요!", tired: "헥헥… 몸이 말랑말랑 녹았어요! 조금 쉬었다 놀아요.", content: "배부르고 달콤해요! 인형을 한 번 더 톡 해 볼래요?", sleep: `달콤한 꿈 꿀게요… ${WAKE_IF} 깨어날게요.`, morning: "잘 잤어요! 딸기처럼 상큼한 아침이에요!", wake: "잘 잤어요! 딸기처럼 상큼해요!" },
    najeon: { feed: "약과가 달콤하고 쫀득해요!", nibble: "한 입만 더 먹을게요!", stash: "배불러요! 약과는 나중에 먹을게요.", play: "제기차기 열 번 성공!", again: "이번엔 스무 번! 헤헤, 재밌어요!", tired: "헥헥… 다리가 후들후들해요. 조금 쉬었다 놀아요.", content: "배도 마음도 든든해요! 인형을 한 번 더 톡 해 볼래요?", sleep: `달빛 아래 잘 자요… ${WAKE_IF} 깨어날게요.`, morning: "잘 잤어요! 해님이 떴어요!", wake: "잘 잤어요! 마음이 반짝반짝해요." },
  };
  const MUMBLE = TAP_SPOT === "desk" ? "음냐… 새로고침하면 깨어날게요…" : "음냐… 화면 말고 진짜 인형으로 깨워 주세요…";
  const RELOAD_KEY = /Mac/.test(navigator.userAgent) ? "⌘R" : "F5";
  const WAKE_HINT = { top: "폰 윗부분에 인형을 톡!", back: "폰 뒷면에 인형을 톡!", desk: `새로고침(${RELOAD_KEY})하면 깨어나요` };
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
    // A touch in the 별밤 레전더리 frame also sends one small shooting star.
    if (document.documentElement.dataset.look !== "legendary") return;
    const shoot = document.createElement("span");
    shoot.className = "sparkle is-shoot";
    shoot.style.left = `${x - 10}px`;
    shoot.style.top = `${y - spread * 0.3}px`;
    win.appendChild(shoot);
    window.setTimeout(() => shoot.remove(), 900);
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

  // Each element's one pose, kept to be cancelled by hand: a finished one only forgotten stays drawn once collected (Chromium 141 and older), out of getAnimations().
  const poses = new WeakMap();

  // Poses hold their last frame until the action ends; reduced motion keeps only the timing.
  function move(el, frames, options) {
    if (still()) return wait(options.duration);
    poses.get(el)?.cancel();
    const pose = el.animate(frames, { fill: "forwards", ...options });
    poses.set(el, pose);
    return pose.finished.catch(() => {});
  }

  // Back at rest: its pose cancelled by hand, then any CSS animation on it (getAnimations() is only the fallback for those).
  function rest(el) {
    poses.get(el)?.cancel();
    poses.delete(el);
    el.getAnimations().forEach((a) => a.cancel());
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
    const verb = dock.querySelector(`[data-care="${id}"]`);
    verb?.classList.add("is-want");
    wantEl = document.createElement("button");
    wantEl.type = "button";
    wantEl.className = "want";
    wantEl.dataset.want = id;
    wantEl.setAttribute("aria-label", `${WANTS[id]}, ${verb?.textContent.trim() || ""}`);
    wantEl.innerHTML = `<i></i><i></i><span class="want-cloud">${wantArt(id)}</span>`;
    wantEl.addEventListener("click", () => press(id));
    win.appendChild(wantEl);
    // Before the page's first touch the sound is lost, so that touch plays it once if this bubble still shows.
    const shown = wantEl;
    if (navigator.userActivation?.hasBeenActive === false) firstTouch.push(() => wantEl === shown && sound("want"));
    else sound("want");
  }

  // Loose skips a tap's after-glow (combo key, gift glow), which talk can share the screen with.
  function screenBusy(loose = false) {
    return Boolean(sheetOpen || waking || (demo && !demo.hidden) || root.classList.contains("has-reveal") || root.classList.contains("g-on")
      || document.querySelector(`canvas.celebrate-layer, .is-evolving, .is-still-celebrate, .is-reunion-jump${loose ? "" : ", .gift.is-glow, .combo-key"}`));
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
    // The opening may stop before its edition line, so the edition goes on now.
    revealEdition();
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
    paintStats(reply.stats);
    // After the beat's own line, so the two never talk over each other.
    trainedPop(reply.trained, 1600);
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
    rest(motion);
  }

  let danceAsked = -Infinity;

  function end() {
    rest(motion);
    layer.replaceChildren();
    pet.classList.remove("is-care");
    careHold.busy = false;
    face();
    if (performance.now() - danceAsked < 5000) {
      danceAsked = -Infinity;
      dance();
    }
  }

  async function feed(beat) {
    // The kind's mouth from /kinds.css, or the 말's where the page has none.
    const mouth = Number(getComputedStyle(root).getPropertyValue("--mouth")) || 0.52;
    const a = art();
    const b = box();
    const sip = a.bite === "sip";
    const s = b.w * (sip ? 0.3 : 0.27);
    // Food tops out just under the kind's mouth so the munch face stays visible; the carton's straw tip sits in it.
    const x = sip ? b.x + b.w / 2 - s * 0.38 : b.x + b.w / 2 - s / 2;
    const y = sip ? b.y + b.h * (mouth - 0.02) - s * 0.03 : b.y + b.h * (mouth + (world() === "8bit" ? 0.04 : 0.015));
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

  const NOTES = { classic: ["♪", "♫", "✦"], "8bit": ["♪", "♫"], milk: ["♥", "♪", "♫"], najeon: ["♪", "✿", "♫"] };

  // A funnel of wind rings around the pet: the far half of each ring goes behind it, the near half over it.
  function windRings(b) {
    const cx = b.x + b.w / 2;
    const rings = [[1.02, 0.34], [0.74, 0.48], [0.44, 0.62], [0.14, 0.76]];
    const arcs = (far) => rings.map(([fy, fr]) => {
      const y = b.y + b.h * fy;
      const rx = b.w * fr;
      return `<path class="dw-arc" d="M${cx - rx} ${y} A${rx} ${rx * 0.24} 0 0 ${far ? 1 : 0} ${cx + rx} ${y}" pathLength="96"/>`;
    }).join("");
    const make = (far) => {
      const el = document.createElement("div");
      el.className = `dance-wind ${far ? "is-far" : "is-near"}`;
      el.setAttribute("aria-hidden", "true");
      el.innerHTML = `<svg viewBox="0 0 ${b.W} ${b.H}" width="${b.W}" height="${b.H}">${arcs(far)}</svg>`;
      // Inline style attributes are blocked by the CSP, so each ring's index is set here.
      el.querySelectorAll(".dw-arc").forEach((arc, i) => arc.style.setProperty("--i", String(i)));
      el.style.transformOrigin = `${cx}px ${b.y + b.h * 0.6}px`;
      return el;
    };
    const far = make(true);
    const near = make(false);
    win.insertBefore(far, pet);
    layer.appendChild(near);
    return [far, near];
  }

  // Notes ride a helix up around the pet; smaller and dimmer on the far side.
  function notes(b) {
    const cx = b.x + b.w / 2;
    const glyphs = NOTES[world()] || NOTES.classic;
    for (let i = 0; i < 8; i++) {
      const note = document.createElement("span");
      note.className = "dance-note";
      note.textContent = glyphs[i % glyphs.length];
      const a0 = Math.random() * Math.PI * 2;
      const frames = [];
      for (let k = 0; k <= 12; k++) {
        const t = k / 12;
        const a = a0 + t * Math.PI * 2.4;
        const r = b.w * (0.58 - 0.16 * t);
        const near = (Math.sin(a) + 1) / 2;
        const fade = t < 0.12 ? t / 0.12 : t > 0.82 ? (1 - t) / 0.18 : 1;
        frames.push({
          transform: `translate(${cx + Math.cos(a) * r}px, ${b.y + b.h * (0.95 - 1.1 * t) + Math.sin(a) * r * 0.24}px) translate(-50%, -50%) scale(${0.55 + 0.55 * near})`,
          opacity: fade * (0.35 + 0.65 * near),
        });
      }
      layer.appendChild(note);
      note.animate(frames, { duration: 1500 + Math.random() * 400, delay: i * 110, fill: "both" }).finished.finally(() => note.remove()).catch(() => {});
    }
  }

  // Talk's dance: two spinning hops, a whirlwind spin, a finishing leap. Hops ride the pet, turns its motion layer.
  let dancing = false;
  async function dance() {
    if (dancing || careHold.asleep || still()) return;
    // A dance asked for mid-action starts when that action ends.
    if (careHold.busy) {
      danceAsked = performance.now();
      return;
    }
    dancing = true;
    careHold.busy = true;
    setWant(null);
    pet.classList.add("is-care");
    rest(motion);
    const b = box();
    let wind = [];
    pet.style.transformOrigin = "50% 100%";
    const quarter = (from, to, ms) => move(motion, [{ transform: `scaleX(${from})` }, { transform: `scaleX(${to})` }], { duration: ms, easing: "ease-in-out" });
    // Edge-on the pet stays a sliver, so it never blinks out mid-turn.
    async function turn(ms) {
      await quarter(1, 0.06, ms / 4);
      face("away");
      await quarter(0.06, 1, ms / 4);
      await quarter(1, 0.06, ms / 4);
      face("happy");
      await quarter(0.06, 1, ms / 4);
    }
    const hop = (up, ms) => move(pet, [
      { transform: "translateY(0) scale(1)" },
      { transform: "translateY(0) scale(1.1, .88)", offset: 0.16, easing: "ease-out" },
      { transform: `translateY(${-up}%) scale(.94, 1.08)`, offset: 0.5, easing: "ease-in" },
      { transform: `translateY(${-up}%) scale(1)`, offset: 0.58, easing: "ease-in" },
      { transform: "translateY(0) scale(1.08, .9)", offset: 0.86, easing: "ease-out" },
      { transform: "translateY(0) scale(1)" },
    ], { duration: ms });
    try {
      face("happy");
      for (const rate of [1, 1.12]) {
        // The wind gathers under the second hop.
        if (rate > 1) {
          wind = windRings(b);
          for (const el of wind) el.animate([{ opacity: 0, transform: "scale(.4)" }, { opacity: 0.55, transform: "scale(.8)", offset: 0.6 }, { opacity: 1, transform: "scale(1)" }], { duration: 760, easing: "ease-out", fill: "forwards" });
        }
        const h = hop(16, 640);
        sound("boing", 60, { rate, gain: 0.7 });
        await wait(120);
        sound("whoosh", 0, { gain: 0.5 });
        await turn(400);
        await h;
      }
      // The whirlwind: notes ride it while the pet hovers and twirls.
      notes(b);
      sound("whoosh", 0, { rate: 1.2, gain: 0.8 });
      const hover = move(pet, [
        { transform: "translateY(0)" },
        { transform: "translateY(-13%)", offset: 0.25, easing: "ease-out" },
        { transform: "translateY(-16%)", offset: 0.75 },
        { transform: "translateY(0)" },
      ], { duration: 1260, easing: "ease-in-out" });
      for (const ms of [440, 360, 320]) await turn(ms);
      await hover;
      // Finale: a big leap, the wind bursts out, hearts on the landing.
      const leap = hop(24, 760);
      sound("whistle-up", 60, { gain: 0.7 });
      for (const el of wind) el.animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(1.5)" }], { duration: 520, delay: 120, easing: "ease-out", fill: "forwards" });
      await wait(140);
      await turn(300);
      sparkles(b.x + b.w / 2, b.y + b.h * 0.2, 8, b.w * 0.9);
      sound("sparkle");
      await leap;
      cheer();
      tryVibrate(18);
      await move(pet, [
        { transform: "rotate(0)" },
        { transform: "rotate(-7deg)", offset: 0.25 },
        { transform: "rotate(7deg)", offset: 0.55 },
        { transform: "rotate(-4deg)", offset: 0.8 },
        { transform: "rotate(0)" },
      ], { duration: 640, easing: "ease-in-out" });
    } finally {
      for (const el of wind) el.remove();
      rest(pet);
      pet.style.transformOrigin = "";
      end();
      dancing = false;
      if (opened) wantLater(dock.dataset.want, 1200);
    }
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

  let hintEl = null;
  let hintTimer = 0;
  let pokes = 0;

  // People tried to wake the pet with a finger on the screen; this shows the real move.
  function wakeHint(ms = 5200) {
    window.clearTimeout(hintTimer);
    if (hintEl) {
      hintEl.classList.remove("is-nudge");
      void hintEl.offsetWidth;
      hintEl.classList.add("is-nudge");
    } else {
      hintEl = document.createElement("div");
      hintEl.className = "wake-hint";
      hintEl.dataset.spot = TAP_SPOT;
      hintEl.setAttribute("role", "status");
      const art = document.createElement("span");
      art.className = "wh-art";
      art.setAttribute("aria-hidden", "true");
      if (TAP_SPOT === "desk") {
        art.innerHTML = `<span class="wh-key">${RELOAD_KEY}</span>`;
      } else {
        art.innerHTML = '<span class="wh-phone"><i class="wh-spot"></i></span>';
        const src = pet.querySelector('[data-frame="canon"]')?.getAttribute("src");
        if (src) {
          const plush = document.createElement("img");
          plush.className = "wh-plush";
          plush.alt = "";
          plush.src = src;
          art.appendChild(plush);
        }
      }
      const text = document.createElement("span");
      text.className = "wh-text";
      text.innerHTML = `<b>${WAKE_HINT[TAP_SPOT]}</b><small>화면을 눌러서는 깨지 않아요</small>`;
      hintEl.append(art, text);
      win.appendChild(hintEl);
    }
    hintTimer = window.setTimeout(hideHint, ms);
  }

  function hideHint() {
    window.clearTimeout(hintTimer);
    const h = hintEl;
    hintEl = null;
    if (!h) return;
    h.classList.add("is-gone");
    window.setTimeout(() => h.remove(), 320);
  }

  function lightsOn() {
    careHold.asleep = false;
    pokes = 0;
    hideHint();
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
    // One poke only stirs the pet; every second one shows how to really wake it.
    pokes += 1;
    if (pokes % 2 === 0) wakeHint();
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
    if (waking || greeting || pet.classList.contains("is-evolving") || root.classList.contains("has-reveal")) return;
    if (careHold.asleep) {
      mumble();
      return;
    }
    if (careHold.busy) return;
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
    rest(motion);
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

  // A reload finds the pet still asleep: no wake call, since only the plushie wakes it.
  function doze() {
    dialogBox.classList.add("is-seq");
    showLine(0);
    lightsOff();
    face("closed");
    placeMoon();
    pet.classList.add("is-sleeping");
    snore();
  }

  // A tap combo stage holds the pet like an action, but leaves the opening dialog running.
  function hold() {
    careHold.busy = true;
    setWant(null);
    pet.classList.add("is-care");
    rest(motion);
  }

  function release() {
    rest(motion);
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
  return { morning, doze, opened: open, restyle, hold, release, dance, busy: screenBusy, blocked: () => screenBusy(true), hearts: tweenHearts, sync: settle, fx: { say, sparkles, cheer, box, move, sound, voice } };
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
  document.querySelector(".level-open")?.setAttribute("aria-label", `능력치 보기, Lv. ${r.level}`);
  const caption = document.querySelector("[data-stat-level]");
  if (caption) caption.textContent = String(r.level);
  const unlock = document.querySelector("[data-level-next]");
  if (unlock) {
    let next = "";
    try { next = JSON.parse(unlock.dataset.unlocks || "{}")[r.level] || ""; } catch { /* keep it empty */ }
    unlock.textContent = next;
    unlock.hidden = !next;
  }
}

/* Stats: the card from the level line, the bonuses the games read, and the little lines when a stat grows. */
const STAT_WORDS = { str: "힘", int: "지능", agi: "민첩", cha: "매력" };

function petStats() {
  try {
    return JSON.parse(document.querySelector(".pet[data-stats]")?.dataset.stats || "null");
  } catch {
    return null;
  }
}

const statBonus = (key) => Number(petStats()?.[key]?.bonus) || 0;

// One bar: its fill as a share of the card's bar, its stops as % of the fill (base, then training, then the edition's gold at the tip), and 8비트's 18 cells.
function statBar({ base = 0, plus = 0, trained = 0 }, max = 120, cells = 18) {
  const total = Math.max(1, base + plus + trained);
  const g = (base / total) * 100;
  const s = ((base + trained) / total) * 100;
  // Each change of material blends over 8% of the fill, so no part ends in an edge.
  const h = 4;
  const stops = [["var(--st)", 0]];
  if (plus > 0) {
    // Stat and gold meet through the stat's own highlight: a glint, never a muddy band.
    stops.push(["var(--st-light)", (trained > 0 ? g : s) - h]);
    if (trained > 0 && s - g >= 2 * h) stops.push(["var(--st-hi)", g + h]);
    stops.push(["var(--st-hi)", s], ["var(--tier-gold-2)", s + h], ["var(--tier-gold-1)", s + (100 - s) * 0.55], ["var(--tier-gold-3)", 100]);
  } else if (trained > 0) {
    stops.push(["var(--st-light)", g - h], ["var(--st-hi)", Math.min(100, g + h)], ["var(--st-hi)", 100]);
  } else {
    stops.push(["var(--st-light)", 100]);
  }
  const gold = plus > 0 ? Math.max(1, Math.round((plus / max) * cells)) : 0;
  const grown = Math.round((trained / max) * cells);
  const at = (v) => Math.round(Math.max(0, Math.min(100, v)) * 10) / 10;
  return {
    fill: Math.min(1, total / max),
    base: at(g),
    seam: at(s),
    stops: stops.map(([color, p]) => `${color} ${at(p)}%`).join(", "),
    cells: { base: Math.min(cells - gold - grown, Math.floor((base / max) * cells)), grown, gold },
  };
}

function paintBar(bar, max) {
  const b = statBar({ base: Number(bar.dataset.base) || 0, plus: Number(bar.dataset.plus) || 0, trained: Number(bar.dataset.trained) || 0 }, max);
  const fill = bar.querySelector(".st-fill");
  const n = b.cells.base + b.cells.grown + b.cells.gold;
  fill.style.setProperty("--fill", String(b.fill));
  fill.style.setProperty("--stops", b.stops);
  fill.style.setProperty("--seam", `${b.seam}%`);
  fill.style.setProperty("--base-w", `${b.base}%`);
  fill.style.setProperty("--cells", String(n));
  fill.style.setProperty("--px-g", `${(b.cells.base / n) * 100}%`);
  fill.style.setProperty("--px-s", `${((b.cells.base + b.cells.grown) / n) * 100}%`);
}

function paintBars() {
  const list = document.querySelector(".st-list");
  if (!list) return;
  const max = Number(list.dataset.max) || 120;
  list.querySelectorAll(".st-bar").forEach((bar) => paintBar(bar, max));
}

// A reply's stat sheet repaints the card and the stats the games and popups read.
function paintStats(sheet) {
  if (!sheet?.str) return;
  const holder = document.querySelector(".pet[data-stats]");
  if (holder) holder.dataset.stats = JSON.stringify(Object.fromEntries(Object.entries(sheet).map(([k, s]) => [k, { total: s.total, bonus: s.bonus, boost: s.boost }])));
  for (const [k, s] of Object.entries(sheet)) {
    const row = document.querySelector(`.st-row[data-stat="${k}"]`);
    if (!row) continue;
    row.querySelector(".st-total").textContent = String(s.total);
    const bar = row.querySelector(".st-bar");
    bar.dataset.base = String(s.base);
    bar.dataset.plus = String(s.plus);
    bar.dataset.trained = String(s.trained);
    bar.setAttribute("aria-label", `${STAT_WORDS[k]} ${s.total}`);
    const tag = row.querySelector(".st-boost");
    tag.textContent = `+${s.boost}`;
    tag.hidden = !s.boost;
    const mix = row.querySelector(".st-mix");
    mix.querySelector("b").textContent = String(s.base);
    for (const [part, value] of [[".is-tier", s.plus], [".is-grow", s.trained]]) {
      const el = mix.querySelector(part);
      el.textContent = `+${value}`;
      el.hidden = !value;
    }
    mix.hidden = !s.plus && !s.trained;
  }
  paintBars();
}

// The admin's edition dresses the page at once: the finish, the pill and the bars; an unnamed pet waits for its naming.
function showEdition(edition, name, stats) {
  const root = document.documentElement;
  if (!document.querySelector("[data-name-input]")) {
    if (edition === "rare" || edition === "legendary") {
      root.dataset.edition = edition;
      root.dataset.look = edition;
    } else {
      delete root.dataset.edition;
      delete root.dataset.look;
    }
    delete root.dataset.editionReveal;
    syncLooks();
  }
  const pill = document.querySelector(".st-edition > span");
  if (pill && name) pill.textContent = name;
  paintStats(stats);
}

const STAT_BUZZ = { classic: 10, rare: [10, 50, 14], legendary: [10, 50, 14, 70, 22] };

// The naming page puts the edition on as the pet says which one it is.
function revealEdition() {
  const root = document.documentElement;
  const edition = root.dataset.editionReveal;
  if (!edition) return;
  delete root.dataset.editionReveal;
  root.dataset.edition = edition;
  root.dataset.look = edition;
  syncLooks();
  if (prefersReducedMotion()) return;
  root.classList.add("is-edition-lit");
  window.setTimeout(() => root.classList.remove("is-edition-lit"), 1800);
  tryVibrate(STAT_BUZZ[edition]);
}

let statOpen = 0;

// Every open replays the card: rows rise, one loop grows each bar and counts its total in step, then the tip settles and shines.
function openStats() {
  const sheet = document.querySelector('[data-sheet="stats"]');
  if (!sheet?.classList.contains("is-open")) return;
  const token = ++statOpen;
  const root = document.documentElement;
  const px = root.dataset.theme === "8bit";
  const rows = Array.from(sheet.querySelectorAll(".st-row")).map((row) => ({
    fill: row.querySelector(".st-fill"),
    total: row.querySelector(".st-total"),
    value: Number(petStats()?.[row.dataset.stat]?.total) || Number(row.querySelector(".st-total").textContent) || 0,
    cells: Number(row.querySelector(".st-fill").style.getPropertyValue("--cells")) || 0,
  }));
  sheet.classList.remove("is-opening");
  void sheet.offsetWidth;
  sheet.classList.add("is-opening");
  window.setTimeout(() => {
    if (token === statOpen && sheet.classList.contains("is-open")) tryVibrate(px ? 10 : STAT_BUZZ[root.dataset.edition] || STAT_BUZZ.classic);
  }, px ? 300 + 70 * (rows.length - 1) + 35 * 18 : 1270);
  if (prefersReducedMotion()) {
    for (const r of rows) {
      r.fill.style.removeProperty("--grow");
      r.total.textContent = String(r.value);
    }
    return;
  }
  const t0 = performance.now();
  const ease = (t) => 1 - (1 - t) ** 3;
  function tick(now) {
    if (token !== statOpen) return;
    let busy = false;
    rows.forEach((r, i) => {
      const t = Math.min(1, Math.max(0, (now - t0 - 300 - 70 * i) / (px ? 35 * Math.max(1, r.cells) : 720)));
      // 8비트 lights one cell at a time and steps its total with it.
      const e = px ? Math.floor(t * r.cells + 1e-6) / Math.max(1, r.cells) : ease(t);
      r.fill.style.setProperty("--grow", String(e));
      r.total.textContent = String(Math.round(e * r.value));
      if (t < 1) busy = true;
    });
    if (busy) requestAnimationFrame(tick);
  }
  tick(t0);
}

// Short lines that float up over the window one at a time; a game on screen holds them until the pet is home.
const pops = [];
function statPop(text, near = null) {
  pops.push({ text, near });
  if (pops.length === 1) nextPop();
}
function nextPop() {
  const pop = pops[0];
  if (!pop) return;
  if (document.documentElement.classList.contains("g-on") || document.hidden) {
    window.setTimeout(nextPop, 400);
    return;
  }
  const box = (pop.near?.isConnected && pop.near.getClientRects().length ? pop.near : document.querySelector("[data-window]"))?.getBoundingClientRect();
  const el = document.createElement("p");
  el.className = "stat-pop";
  el.setAttribute("role", "status");
  el.textContent = pop.text;
  el.style.left = `${box ? box.left + box.width / 2 : window.innerWidth / 2}px`;
  el.style.top = `${box ? (pop.near ? box.top : box.top + box.height * 0.28) : window.innerHeight / 3}px`;
  document.body.appendChild(el);
  const done = () => {
    el.remove();
    pops.shift();
    nextPop();
  };
  const frames = prefersReducedMotion()
    ? [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }]
    : [{ transform: "translate(-50%, 6px) scale(.6)", opacity: 0 }, { transform: "translate(-50%, -6px) scale(1.12)", opacity: 1, offset: 0.18 }, { transform: "translate(-50%, -12px) scale(1)", opacity: 1, offset: 0.75 }, { transform: "translate(-50%, -30px) scale(1)", opacity: 0 }];
  el.animate(frames, { duration: 1500, easing: "ease-out" }).finished.then(done, done);
}

function trainedPop(trained, delay = 0) {
  if (!trained?.gained || !STAT_WORDS[trained.stat]) return;
  window.setTimeout(() => statPop(`${STAT_WORDS[trained.stat]} +1!`), delay);
}

paintBars();
document.querySelectorAll('[data-open="stats"]').forEach((button) => button.addEventListener("click", openStats));

// The 능력치 sheet closes first, so the card sheet hands focus back to what opened 능력치, not to this hidden button.
const shareCard = document.querySelector("[data-share-card]");
if (shareCard) {
  let retry = 0;
  shareCard.addEventListener("click", () => {
    import(retry ? `/share-card.js?retry=${retry}` : "/share-card.js")
      .catch((error) => {
        retry += 1;
        throw error;
      })
      .then((m) => {
        if (!shareCard.closest(".sheet.is-open")) return;
        const opener = sheetOpener;
        closeSheet();
        return m.showShareCard(document, { wire: wireSheet, open: () => openSheet("share", opener) });
      })
      .catch(() => {});
  });
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
      immersive.beforeAsk("nfc");
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

  // A desk's plushie is F5: while a game or the farm takes taps, the key is a read of this plushie, not a reload.
  if (TAP_SPOT === "desk") {
    window.addEventListener("keydown", (event) => {
      if (event.key !== "F5" || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey || !sinkFn) return;
      event.preventDefault();
      // A held key repeats; only its first press is a tap.
      if (!event.repeat) heard({ serialNumber: uid });
    }, true);
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

const VENDOR = ["/vendor/pixi-8.22.0.min.js", "/vendor/pixi-unsafe-eval-8.22.0.min.js", "/vendor/pixi-filters-6.1.5.js"];
const vendorScripts = new Map();

// Each vendor script loads once per page, whichever room asks first; a second copy would swap window.PIXI under a live stage.
// A failed one is dropped so the next ask retries it.
function vendorScript(src) {
  if (!vendorScripts.has(src)) {
    vendorScripts.set(src, new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.addEventListener("load", resolve, { once: true });
      el.addEventListener("error", () => {
        el.remove();
        vendorScripts.delete(src);
        reject(new Error(src));
      }, { once: true });
      document.head.appendChild(el);
    }));
  }
  return vendorScripts.get(src);
}

function loadPixi() {
  return VENDOR.reduce((done, src) => done.then(() => vendorScript(src)), Promise.resolve());
}

// How long 시작 or 텃밭 waits for its scene to be ready to show; past that it comes back with a retry line.
const START_MS = 10000;
const FAILED = "지금은 열 수 없어요. 잠시 후에 다시 해 볼까요?";

// A wait that gives up after `ms`: nothing a room waits on before its scene shows may hold the page.
function inTime(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("timed out")), ms);
    promise.then((value) => {
      window.clearTimeout(timer);
      resolve(value);
    }, (error) => {
      window.clearTimeout(timer);
      reject(error);
    });
  });
}

function petBusy() {
  return Boolean(careHold.busy || waking || document.documentElement.classList.contains("has-reveal")
    || document.querySelector("canvas.celebrate-layer, .is-evolving, .is-still-celebrate, .is-reunion-jump"));
}

// 시작 gives the NFC reader this long, then plays on screen taps: an unanswered permission prompt must not hold the game.
const NFC_WAIT_MS = 600;

/* 오락실: 기 모으기 on a WebGL stage made for each game, its code and art loaded when the room first opens; the first 3 plays a day give XP. */
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
  const SOUNDS = ["count", "go", "note-c5", "note-c6", "note-c7", "tier", "rocket", "ding", "chime", "chime-low", "fall", "result", "best", "wind-2", "wind-3", "wind-4"];
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
    paintStats(r.stats);
    trainedPop(r.trained);
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
    bonus: statBonus,
    onLaunch: (height) => post(height),
  };

  function prepare() {
    if (!game) {
      const made = loadPixi()
        // A failed import stays failed for its URL, so a retry asks for a new one.
        .then(() => import(retry ? `/game/gimo.js?retry=${retry}` : "/game/gimo.js").catch((error) => {
          retry += 1;
          throw error;
        }))
        .then((m) => m.createGimo(api));
      game = made;
      made.then((g) => {
        if (game === made) ready = g;
        else g.dispose();
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
    // The engine and the art load behind a live 시작, the stage only once a game starts; a tap meanwhile waits for them.
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
    if ((ready?.phase !== "charge" && ready?.phase !== "paused") || event.target.closest?.("button")) return;
    ready.tap("screen");
  }

  // The game is on screen in the same task the home is taken: its open() settled before this runs.
  async function run(g, mode) {
    closeSheet();
    combo.end();
    care.hold();
    root.classList.add("g-on");
    combo.sink(() => g.tap("nfc"));
    document.addEventListener("pointerdown", onScreen, true);
    let out = "again";
    try {
      out = await g.play(mode, Number(dock.dataset.giBest) || 0);
      // A round again keeps its stage; a window that changed size meanwhile gets a new one first, within the same bound.
      while (out === "again") {
        await inTime(g.open(), START_MS);
        out = await g.play(mode, Number(dock.dataset.giBest) || 0);
      }
    } catch (error) {
      console.error(error);
      g.exit();
      out = "aborted";
    } finally {
      combo.sink(null);
      document.removeEventListener("pointerdown", onScreen, true);
      root.classList.remove("g-on");
      care.release();
      playing = false;
    }
    if (out === "quit") care.fx.say("재밌었어요! 또 놀아요!");
    else if (out === "aborted") care.fx.say(FAILED);
  }

  // A tap is held while the engine, the art and the stage get ready and the NFC reader has its moment; the home is
  // taken only once the game can show. Closing the sheet first drops the tap, and a wait past START_MS gives 시작 back.
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
    const opened = prepare().then((g) => (held === tap ? g.open().then(() => g) : g));
    Promise.all([inTime(opened, START_MS), reader]).then(([g, nfc]) => {
      const mine = held === tap;
      if (mine) {
        held = null;
        paintStart();
      }
      // While it waited, the sheet may have closed, the page hidden, the stage been rebuilt or a combo begun: a stage
      // made for nothing goes, unless a newer tap waits on it.
      if (!mine || sheetOpen !== sheet || document.hidden || ready !== g || careHold.asleep || petBusy()) {
        if (!held && !playing) g.exit();
        return;
      }
      playing = true;
      run(g, nfc ? "nfc" : "screen");
    }, () => {
      if (held === tap) {
        held = null;
        start.textContent = "시작";
        start.disabled = false;
        blurb.textContent = FAILED;
      }
      if (!held && !playing) ready?.exit();
    });
  }

  function restyle() {
    if (!game) return;
    const old = game;
    game = null;
    ready = null;
    old.then((g) => g.dispose(), () => {});
  }

  button.addEventListener("click", open);
  start.addEventListener("click", begin);
  giftRow.addEventListener("click", () => {
    closeSheet();
    window.setTimeout(() => openSheet("gifts", button), prefersReducedMotion() ? 0 : 300);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) ready?.pause();
  });
  window.addEventListener("pagehide", () => {
    ready?.dispose();
    game = null;
    ready = null;
  });
  return { restyle };
})();

/* 오락실: 달리기 시합 on its own full-screen stage made for each game, its code and art loaded when the room first opens; a finished race uses one of the day's 3 XP plays. */
const racing = (function raceRoom() {
  const dock = document.querySelector(".dock[data-care-uid]");
  const sheet = document.querySelector('[data-sheet="arcade"]');
  const start = sheet?.querySelector('[data-game="race"]');
  if (!dock || !start || !care || !combo) return null;
  const root = document.documentElement;
  const blurb = start.closest(".g-card").querySelector("small");
  const thumb = start.closest(".g-card").querySelector(".g-thumb-pet");
  const label = blurb.textContent;
  const button = dock.querySelector('[data-open="arcade"]');
  let state = JSON.parse(start.dataset.race || "{}");
  // The rival raced last stays picked for the rest of this visit, across themes too.
  let raced = null;
  let game = null;
  let ready = null;
  let held = null;
  let playing = false;
  let retry = 0;
  let posted = 0;
  const sounds = ["count", "go", "ding", "tier", "race-hop", "race-dash", "race-crowd", "race-shutter", "race-win", "race-lose", "race-pop", "race-drum"];
  const api = {
    still: () => prefersReducedMotion(),
    sfx: (name, options) => playSfx(name, options),
    buzz: (pattern) => tryVibrate(pattern),
    bonus: statBonus,
    async finish(rival, won) {
      raced = rival;
      const run = ++posted;
      try {
        const res = await fetch("/arcade", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
          body: JSON.stringify({ uid: dock.dataset.careUid, game: "race", rival, won }) });
        if (!res.ok) return null;
        const r = await res.json();
        if (!r.ok) return null;
        // A slow reply from an earlier race must not roll back a newer one.
        if (run !== posted) return r;
        state = r.race;
        dock.dataset.arcadeLeft = String(r.xpLeft);
        sheet.querySelectorAll(".g-pip").forEach((pip, i) => pip.classList.toggle("is-used", i < 3 - r.xpLeft));
        sheet.querySelector("[data-arcade-today] b").textContent = r.xpLeft ? `${r.xpLeft}번 남았어요` : "다 했어요!";
        button.classList.toggle("has-new", sheet.querySelector("[data-open-gifts]").classList.contains("has-new") || r.xpLeft > 0);
        paintLevel(r);
        paintStats(r.stats);
        trainedPop(r.trained);
        return r;
      } catch { return null; }
    },
  };
  function prepare() {
    if (!game) {
      const made = loadPixi().then(() => import(`/game/race.js${retry ? `?retry=${retry}` : ""}`)).then((m) => m.createRace(api));
      game = made;
      made.then((g) => { if (game === made) ready = g; else g.dispose(); }, () => { if (game === made) { game = null; retry++; } });
    }
    return game;
  }
  function paint() {
    start.disabled = careHold.asleep || Boolean(held);
    start.textContent = held ? "준비 중…" : "시작";
    blurb.textContent = careHold.asleep ? "쿨쿨 자는 중이에요" : label;
  }
  // The race is on screen in the same task the home is taken: its open() settled before this runs.
  async function run(g, mode) {
    playing = true;
    closeSheet();
    combo.end();
    care.hold();
    root.classList.add("g-on", "r-on");
    combo.sink(() => g.tap("nfc"));
    let out = "quit";
    try { out = await g.play(mode); }
    finally {
      combo.sink(null);
      combo.end();
      root.classList.remove("g-on", "r-on");
      care.release();
      playing = false;
      button.focus({ preventScroll: true });
    }
    if (out === "quit") care.fx.say("재밌었어요! 또 달려요!");
    else if (out === "aborted") care.fx.say(FAILED);
  }
  // As in 기 모으기: the home is taken only once the race can show, and a wait past START_MS gives 시작 back.
  function begin() {
    if (held || playing || careHold.asleep || petBusy()) return;
    const tap = {};
    held = tap;
    paint();
    playSfx(`care-${root.dataset.theme === "8bit" ? "chip" : "soft"}-press`);
    tryVibrate(12);
    const listening = "NDEFReader" in window ? combo.listen() : null;
    const reader = listening && Promise.race([listening, new Promise((done) => setTimeout(() => done(null), NFC_WAIT_MS))]);
    const opened = prepare().then((g) => (held === tap ? g.open(state, root.dataset.mascot, raced).then(() => g) : g));
    Promise.all([inTime(opened, START_MS), reader]).then(([g, nfc]) => {
      const mine = held === tap;
      if (mine) {
        held = null;
        paint();
      }
      if (!mine || sheetOpen !== sheet || document.hidden || ready !== g || careHold.asleep || petBusy()) {
        if (!held && !playing) g.exit();
        return;
      }
      run(g, nfc ? "nfc" : "screen");
    }, () => {
      if (held === tap) {
        held = null;
        paint();
        blurb.textContent = FAILED;
      }
      if (!held && !playing) ready?.exit();
    });
  }
  function restyle() {
    held = null;
    const old = game;
    game = null;
    ready = null;
    old?.then((g) => g.dispose(), () => {});
  }
  button.addEventListener("click", () => {
    held = null;
    paint();
    const canon = pet?.querySelector('[data-frame="canon"]');
    if (canon) thumb.src = canon.getAttribute("src");
    const kit = root.dataset.theme === "8bit" ? "chip" : "soft";
    sounds.forEach((name) => loadSfx(`game-${kit}-${name}`));
    if (!careHold.asleep) prepare().catch(() => {});
  });
  start.addEventListener("click", begin);
  // A hidden page pauses the race wherever it is: its clock runs on animation frames.
  document.addEventListener("visibilitychange", () => { if (document.hidden) { held = null; paint(); } });
  window.addEventListener("pagehide", restyle);
  return { restyle };
})();

/* 텃밭: the pet's farm on a WebGL stage; one plushie tap harvests every ripe crop, a tap on a plot picks that one. */
const farm = (function farmRoom() {
  const dock = document.querySelector(".dock[data-care-uid]");
  const button = dock?.querySelector("[data-farm]");
  const win = document.querySelector("[data-window]");
  if (!dock || !button || !care || !combo || !win) return null;
  const root = document.documentElement;
  const body = document.body;
  const uid = dock.dataset.careUid;
  const label = button.querySelector(".dock-label");
  const cap = button.querySelector(".dock-cap");
  const FARM_ICON = cap.innerHTML;
  const HOME_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/></svg>';
  const ASLEEP = `쿨쿨 자는 중이에요. ${TAP_SPOT === "desk" ? "새로고침해서" : "폰에 인형을 톡 해서"} 깨워 주세요`;
  const COOKIE_MS = 60 * 1000;
  const CALM_MS = 400;
  const SOUNDS = {
    care: ["press", "sparkle", "drop", "land", "bonk", "sip", "whoosh", "want", "whistle-up", "chomp-0", "chomp-1", "chomp-2", "gulp"],
    game: ["ding", "result", "best", "note-c6"],
    tap: ["unlock", "fanfare"],
    farm: ["pop", "ripple", "honk", "patter", "splash", "twinkle", "fanfare"],
  };
  const world = () => root.dataset.theme || "classic";
  const kit = () => (world() === "8bit" ? "chip" : "soft");
  // The basket row under the field, there before the stage is measured: the stage fills its crops, the coins open the shop.
  const row = document.createElement("div");
  row.className = "f-basket";
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", "바구니");
  row.innerHTML = '<div class="fb-list"></div><button type="button" class="fb-coins" aria-haspopup="dialog"><i class="f-coin-ic" aria-hidden="true"></i><b>0</b><span class="fb-shop" hidden>가게</span></button>';
  win.after(row);
  const coinsBtn = row.querySelector(".fb-coins");
  const shop = document.querySelector('[data-sheet="shop"]');
  let art = (name) => `/game/art/farm/${name}.svg`;
  let game = null;
  let ready = null;
  let retry = 0;
  let opening = false;
  let isOpen = false;
  let harvesting = false;
  let tapped = 0;
  let arriving = false;
  let buying = false;
  let acting = Promise.resolve();
  let cookieTimer = 0;
  let dotTimer = 0;
  let view = null;
  let visit = null;
  // The first open's reply: the server planted the starter packet, so its show is kept until it plays to the end.
  let first = null;
  let stale = false;
  let fitTimer = 0;
  const picking = new Set();
  // The server clock: count from its last word, never from the phone's clock alone.
  let clock = { server: Number(body.dataset.farmNow) || Date.now(), at: performance.getEntriesByType?.("navigation")[0]?.responseStart || performance.now() };
  const serverNow = () => clock.server + (performance.now() - clock.at);

  function buzz(pattern) {
    if (navigator.userActivation?.hasBeenActive === false) return;
    tryVibrate(pattern);
  }

  const api = {
    win,
    pet,
    // The open farm's size even while it is shut, so the art is painted ahead at the size the stage will have.
    size() {
      const shut = !root.classList.contains("f-layout");
      if (shut) root.classList.add("f-layout");
      const out = { W: win.clientWidth, H: win.clientHeight };
      if (shut) root.classList.remove("f-layout");
      return out;
    },
    picking: () => picking.size > 0 || harvesting,
    fail: (error) => broken(error),
    uid,
    say: (text) => care.fx.say(text),
    sfx: (name, { rate, gain } = {}) => playSfx(name, { rate, gain }),
    buzz,
    still: () => prefersReducedMotion(),
    level(r) {
      if (r.painted) return;
      r.painted = true;
      paintLevel(r);
    },
    hearts: (n) => care.hearts(n),
    levelPop() {
      if (prefersReducedMotion()) return;
      for (const el of document.querySelectorAll(".level-badge")) {
        el.animate([{ transform: "scale(1)" }, { transform: "scale(1.45)" }, { transform: "scale(1)" }], { duration: 480, easing: "cubic-bezier(.3,1.4,.5,1)" });
      }
    },
    basket: row,
    coinBox: () => coinsBtn,
    coins(n, gain = 0) {
      coinsBtn.querySelector("b").textContent = String(n);
      coinsBtn.setAttribute("aria-label", `코인 ${n}개${view?.shopOpen ? ", 씨앗 가게 열기" : ""}`);
      if (gain <= 0) return;
      statPop(`+${gain} 코인`, coinsBtn);
      if (!prefersReducedMotion()) coinsBtn.animate([{ transform: "scale(1)" }, { transform: "scale(1.18)" }, { transform: "scale(1)" }], { duration: 420, easing: "cubic-bezier(.3,1.4,.5,1)" });
    },
    act: (act, body) => pantry(act, body),
    // A snack or a bus that leveled the pet up: an open plants the new plots with the usual show.
    acted(r) {
      if (!r.leveledUp) return;
      acting = acting.then(() => post("open")).then(({ reply }) => {
        if (reply) after(reply);
        if (reply && isOpen && ready) ready.grew(reply);
      }).catch(() => {});
    },
  };

  function prepare() {
    if (!game) {
      const made = loadPixi()
        // A failed import stays failed for its URL, so a retry asks for a new one.
        .then(() => import(retry ? `/game/farm.js?retry=${retry}` : "/game/farm.js").catch((error) => {
          retry += 1;
          throw error;
        }))
        .then((m) => {
          art = m.artUrl;
          return m.createFarm(api);
        });
      game = made;
      made.then((g) => {
        if (game === made) ready = g;
        else g.dispose();
      }, () => {
        if (game === made) game = null;
      });
    }
    return game;
  }

  function preload() {
    for (const [set, names] of Object.entries(SOUNDS)) for (const name of names) loadSfx(`${set}-${kit()}-${name}`);
    if (kit() === "soft") loadSfx("game-soft-thump");
    for (const mood of ["happy", "excited", "ask", "munch"]) loadSfx(cryName(mood, world()));
  }

  function post(act, extra = {}) {
    return fetch("/farm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, act, ...extra }),
      credentials: "same-origin",
    })
      .then((res) => res.json().catch(() => null).then((reply) => ({ status: res.status, reply: reply?.ok ? reply : null })))
      .catch(() => ({ status: 0, reply: null }))
      .then((out) => {
        if (out.reply) {
          view = out.reply.farm;
          clock = { server: view.now, at: performance.now() };
          coinsBtn.querySelector(".fb-shop").hidden = !view.shopOpen;
          coinsBtn.classList.toggle("is-shop", Boolean(view.shopOpen));
        }
        return out;
      });
  }

  // Every farm reply carries the pet's stats; a snack eaten as 밥 also carries the dock's care state.
  function after(r) {
    paintStats(r.stats);
    trainedPop(r.trained);
    if (r.want !== undefined) care.sync(r);
  }

  // 먹이기, 버스로 보내기 and 사기 wait their turn behind any pick; a refusal redraws the farm from the server.
  function pantry(act, body) {
    const next = acting.then(() => post(act, body));
    acting = next.catch(() => {});
    return next.then((out) => {
      if (out.reply) after(out.reply);
      else resync(out.status);
      return out;
    });
  }

  function resync(status) {
    acting = acting.then(() => post("open")).then(({ status: again, reply }) => {
      if (!reply) {
        failed(again || status);
        return;
      }
      after(reply);
      if (isOpen && ready) ready.redraw(reply.farm);
      if (sheetOpen === shop) paintShop();
      care.fx.say("앗, 바구니가 바뀌었어요. 다시 해 볼까요?");
    }).catch(() => {});
  }

  function paintShop() {
    if (!shop || !view?.shop) return;
    shop.querySelector("[data-shop-coins]").innerHTML = `<i class="f-coin-ic" aria-hidden="true"></i><b>${view.coins}</b> 코인`;
    shop.querySelector("[data-shop-bag]").textContent = `씨앗 주머니 ${view.bag.length}개`;
    shop.querySelector("[data-shop-list]").innerHTML = view.shop.map((s) => `<li class="shop-row${s.locked ? " is-locked" : ""}">
          <img src="${art(`item-${s.crop}`)}" alt="">
          <span class="shop-name"><b>${s.name} 씨앗</b><small>${s.locked ? s.reason : "심으면 쑥쑥 자라요"}</small></span>
          <button type="button" class="shop-buy" data-buy="${s.crop}" aria-label="${s.name} 씨앗, ${s.price}코인${s.locked ? `, ${s.reason}` : ""}"${s.locked ? " disabled" : ""}><i class="f-coin-ic" aria-hidden="true"></i>${s.price}</button>
        </li>`).join("");
  }

  // The bought seed hops out of its row and drops into the 씨앗 주머니.
  function dropSeed(from, crop) {
    const bag = shop.querySelector("[data-shop-bag]");
    const a = from.getBoundingClientRect();
    const b = bag.getBoundingClientRect();
    const seed = document.createElement("img");
    seed.className = "shop-drop";
    seed.src = art(`item-${crop}`);
    seed.alt = "";
    seed.style.left = `${a.left + a.width / 2}px`;
    seed.style.top = `${a.top + a.height / 2}px`;
    document.body.appendChild(seed);
    playSfx(`farm-${kit()}-pop`);
    const dx = b.left + 12 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const frames = prefersReducedMotion()
      ? [{ opacity: 1 }, { opacity: 0 }]
      : [{ transform: "translate(-50%, -50%) scale(1)" }, { transform: `translate(calc(-50% + ${dx * 0.55}px), calc(-50% + ${dy - 46}px)) scale(1.2)`, offset: 0.5 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.45)`, opacity: 0.85 }];
    return seed.animate(frames, { duration: 700, easing: "ease-in-out" }).finished.catch(() => {}).then(() => {
      seed.remove();
      playSfx(`care-${kit()}-drop`, { gain: 0.7 });
      if (!prefersReducedMotion()) bag.animate([{ transform: "scale(1)" }, { transform: "scale(1.16)" }, { transform: "scale(1)" }], { duration: 320 });
    });
  }

  // The page-load harvest finds this cookie on the next plushie tap; every /t clears it.
  function setCookie(on) {
    const secure = window.location.protocol === "https:" ? ";secure" : "";
    document.cookie = on ? `farm_at=${uid};path=/;max-age=600;samesite=lax${secure}` : `farm_at=;path=/;max-age=0;samesite=lax${secure}`;
  }

  function paintButton(open) {
    label.textContent = open ? "집으로" : "텃밭";
    cap.innerHTML = open ? HOME_ICON : FARM_ICON;
    if (open) button.classList.remove("has-new");
  }

  // Lights the dot when the next crop ripens on a page left open.
  function scheduleDot(next) {
    window.clearTimeout(dotTimer);
    if (!next) return;
    dotTimer = window.setTimeout(() => {
      if (!isOpen) button.classList.add("has-new");
    }, Math.max(0, next - serverNow()) + 500);
  }

  function paintDot() {
    if (!view || isOpen) return;
    const now = serverNow();
    const grown = view.plots.filter((p) => p.crop && p.ripeAt);
    button.classList.toggle("has-new", grown.some((p) => p.ripeAt <= now));
    scheduleDot(grown.map((p) => p.ripeAt).filter((t) => t > now).sort((a, b) => a - b)[0]);
  }

  function flush(r) {
    if (r.xpGain > 0) api.level(r);
    care.hearts(r.hearts);
  }

  // A stage that throws mid-show closes the farm; the server already holds the truth, so the page paints it.
  function broken(error, r) {
    console.error(error);
    if (r) flush(r);
    close();
    care.fx.say(FAILED);
  }

  function failed(status) {
    if (status === 409) {
      close();
      care.fx.say(ASLEEP);
      return;
    }
    care.fx.say(FAILED);
    if (view && isOpen) ready?.redraw(view);
  }

  let drag = null;
  function screenAt(x, y, swipe = false) {
    const hit = ready.plotAt(x, y);
    if (!hit) return;
    if (hit.kind === "ripe") pick(hit.plot);
    else if (!swipe && (hit.kind === "growing" || hit.kind === "locked")) ready.wiggle(hit.plot);
  }
  function onScreen(event) {
    if (!ready || !isOpen || event.target.closest?.("button, .f-card")) return;
    const box = win.getBoundingClientRect();
    drag = { id: event.pointerId, x: event.clientX - box.left, y: event.clientY - box.top, moved: false };
    win.setPointerCapture(event.pointerId);
    screenAt(drag.x, drag.y, true);
  }
  function onMove(event) {
    if (!drag || drag.id !== event.pointerId || !ready || !isOpen) return;
    const box = win.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    const distance = Math.hypot(x - drag.x, y - drag.y);
    if (distance < 4) return;
    drag.moved = true;
    const steps = Math.ceil(distance / 12);
    for (let i = 1; i <= steps; i++) screenAt(drag.x + (x - drag.x) * i / steps, drag.y + (y - drag.y) * i / steps, true);
    ready.trail(x, y);
    drag.x = x;
    drag.y = y;
  }
  function onUp(event) {
    if (!drag || drag.id !== event.pointerId) return;
    if (!drag.moved && event.type !== "pointercancel") screenAt(drag.x, drag.y);
    drag = null;
  }

  // Only ripe plots come here: a growing one just wiggles on the stage.
  function pick(plot) {
    if (picking.has(plot) || harvesting) return;
    picking.add(plot);
    acting = acting.then(() => post("pick", { plot })).then(({ status, reply }) => {
      picking.delete(plot);
      if (reply) after(reply);
      if (!isOpen || !ready) {
        if (reply) flush(reply);
        return;
      }
      if (!reply) {
        failed(status);
        return;
      }
      ready.picked(reply);
    }).catch((error) => broken(error));
  }

  function onPlushie() {
    if (!isOpen || !ready || ready.busy || harvesting) return;
    harvesting = true;
    ready.knock();
    acting = acting.then(() => post("harvest")).then(({ status, reply }) => {
      harvesting = false;
      if (reply) after(reply);
      if (reply?.picked.length) tapped += 1;
      if (!isOpen || !ready) {
        if (reply) flush(reply);
        return;
      }
      if (!reply) {
        failed(status);
        return;
      }
      ready.harvest(reply, { knocked: true }).then(() => flush(reply), (error) => broken(error, reply));
    }).catch((error) => broken(error));
  }

  function enter(st, reply, how) {
    isOpen = true;
    talkHook?.close(true);
    combo.end();
    care.hold();
    root.classList.add("f-on", "f-layout");
    combo.sink(onPlushie);
    setCookie(true);
    window.clearInterval(cookieTimer);
    cookieTimer = window.setInterval(() => setCookie(true), COOKIE_MS);
    window.clearTimeout(dotTimer);
    paintButton(true);
    win.addEventListener("pointerdown", onScreen);
    win.addEventListener("pointermove", onMove);
    win.addEventListener("pointerup", onUp);
    win.addEventListener("pointercancel", onUp);
    return st.play(reply, how);
  }

  // The home is back at once; the farm's slide-out is decoration over it and never holds the page.
  function close() {
    if (!isOpen) return;
    isOpen = false;
    combo.sink(null);
    setCookie(false);
    window.clearInterval(cookieTimer);
    win.removeEventListener("pointerdown", onScreen);
    win.removeEventListener("pointermove", onMove);
    win.removeEventListener("pointerup", onUp);
    win.removeEventListener("pointercancel", onUp);
    drag = null;
    root.classList.remove("f-on", "f-layout");
    care.release();
    care.fx.say("재밌었어요! 또 놀아요!");
    paintButton(false);
    playSfx(`care-${kit()}-press`);
    buzz(10);
    try {
      ready?.exit();
    } finally {
      if (stale) restyle();
      paintDot();
    }
  }

  function openFailed() {
    opening = false;
    button.classList.remove("is-loading");
    care.fx.say(FAILED);
  }

  // The page wears the farm from its first paint (style.css, on data-farm-visit) until the farm is in or the visit gives up.
  const uncover = () => { arriving = false; delete body.dataset.farmVisit; };

  function openVisit(r) {
    opening = true;
    arriving = true;
    if (r.picked.length) tapped += 1;
    preload();
    // The stage is made under the visit's cover: the farm takes the home only once it can be drawn, or the cover goes.
    inTime(prepare().then((st) => st.open().then(() => st)), START_MS).then((st) => {
      opening = false;
      if (isOpen || careHold.asleep || st !== ready) {
        uncover();
        if (!isOpen) st.exit();
        return undefined;
      }
      return enter(st, r, "visit").finally(uncover).then(() => {
        if (!r.picked.length || !isOpen || st !== ready) return undefined;
        // A page opened by a plushie tap stays silent until it is touched, so the show waits for that touch.
        return st.promptTouch().then(() => {
          if (!isOpen || st !== ready) return undefined;
          trainedPop(r.trained);
          return st.harvest(r).then(() => flush(r));
        });
      }).catch((error) => broken(error, r));
    }, () => {
      uncover();
      if (!isOpen) ready?.exit();
      // The visit already harvested, so its XP and hearts show even without the farm.
      openFailed();
      flush(r);
    });
  }

  function open() {
    if (isOpen) {
      close();
      return;
    }
    if (opening) return;
    if (visit) {
      const r = visit;
      visit = null;
      openVisit(r);
      return;
    }
    if (careHold.asleep) {
      care.fx.say(ASLEEP);
      return;
    }
    if (petBusy() || sheetOpen) return;
    playSfx(`care-${kit()}-press`);
    buzz(10);
    // scan() must run inside the click: that is what shows Chrome's permission prompt, and the reader is the path with sound.
    if ("NDEFReader" in window) combo.listen();
    preload();
    opening = true;
    button.classList.add("is-loading");
    // The engine first: a farm made for an engine that never loaded would lose its first-open show. The stage is made
    // while the open request is out, before the farm takes the home; a wait past START_MS gives 텃밭 back, a late reply still counts.
    const made = prepare().then((st) => {
      const asked = post("open");
      const staged = opening ? st.open() : null;
      staged?.catch(() => {});
      return asked.then(({ status, reply }) => {
        if (reply?.created) first = reply;
        if (reply) after(reply);
        if (!reply || !opening) return { st, status, reply };
        return (staged || st.open()).then(() => ({ st, status, reply }));
      });
    });
    inTime(made, START_MS).then(({ st, status, reply }) => {
      opening = false;
      button.classList.remove("is-loading");
      if (!reply) {
        if (!isOpen) st.exit();
        care.fx.say(status === 409 ? ASLEEP : FAILED);
        return;
      }
      if (isOpen || document.hidden || careHold.asleep || petBusy() || sheetOpen || st !== ready) {
        if (!isOpen) st.exit();
        return;
      }
      const r = first ? { ...first, farm: reply.farm, hearts: reply.hearts } : reply;
      enter(st, r, first ? "tutorial" : "open").then(() => {
        // Still open means the tutorial played through; 집으로 mid-show keeps it for the next open.
        if (isOpen) first = null;
        flush(r);
      }, (error) => broken(error, r));
    }, () => {
      if (!isOpen) ready?.exit();
      openFailed();
    });
  }

  // The visit's own celebration plays first; the farm takes the window once the screen has been quiet a moment.
  function whenCalm(fn) {
    let calm = 0;
    (function check() {
      calm = petBusy() || document.querySelector(".gift.is-glow") ? 0 : calm + 100;
      if (calm >= CALM_MS) fn();
      else window.setTimeout(check, 100);
    })();
  }

  // Read before runCelebrate drops it: a celebrating visit has no cover, so it must not get one once the mark is gone.
  const celebrating = body.hasAttribute("data-celebrate");

  function start() {
    if (body.dataset.farmNext) scheduleDot(Number(body.dataset.farmNext));
    const raw = body.dataset.farmVisit;
    if (!raw) return;
    if (celebrating) uncover();
    try {
      visit = JSON.parse(raw);
    } catch {
      uncover();
      return;
    }
    prepare().catch(() => {});
    const go = () => {
      if (!visit || isOpen || opening) return;
      const r = visit;
      visit = null;
      openVisit(r);
    };
    if (celebrating) whenCalm(go);
    else go();
  }

  // A world picked while the farm is open rebuilds it once it closes.
  function restyle() {
    stale = isOpen;
    if (isOpen || !game) return;
    const old = game;
    game = null;
    ready = null;
    old.then((g) => g.dispose(), () => {});
  }

  button.addEventListener("click", open);
  coinsBtn.addEventListener("click", () => {
    if (!isOpen || !view) return;
    playSfx(`care-${kit()}-press`);
    buzz(10);
    if (!view.shopOpen) {
      care.fx.say("씨앗 가게는 Lv 3부터 열려요");
      return;
    }
    if (ready?.busy || sheetOpen) return;
    paintShop();
    openSheet("shop", coinsBtn);
  });
  shop?.addEventListener("click", (event) => {
    const buy = event.target.closest("[data-buy]");
    if (!buy || buy.disabled || buying || !isOpen) return;
    buying = true;
    buy.disabled = true;
    playSfx(`care-${kit()}-press`);
    pantry("buy", { crop: buy.dataset.buy }).then(({ reply }) => {
      buying = false;
      if (!reply) {
        paintShop();
        return;
      }
      ready?.bought(reply);
      dropSeed(buy, reply.crop);
      paintShop();
    });
  });
  // The card's 텃밭에서 간식 주기 goes straight to the basket.
  document.querySelector("[data-stat-farm]")?.addEventListener("click", () => {
    closeSheet();
    window.setTimeout(() => {
      if (!isOpen) open();
    }, prefersReducedMotion() ? 0 : 320);
  });
  // The stage fits itself into a new size at once, undistorted; it is built again at that size once nothing shows.
  window.addEventListener("resize", () => {
    window.clearTimeout(fitTimer);
    fitTimer = window.setTimeout(function fit() {
      if (!isOpen || !ready) return;
      if (ready.busy) fitTimer = window.setTimeout(fit, 500);
      else ready.refit().catch((error) => broken(error));
    }, 300);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (isOpen) setCookie(true);
    else paintDot();
  });
  window.addEventListener("pagehide", () => {
    window.clearInterval(cookieTimer);
    window.clearTimeout(dotTimer);
    ready?.dispose();
    game = null;
    ready = null;
  });
  // The guide reads these: the open farm with nothing playing, where a ripe crop sits, a visit still on its way in, and a plushie harvest's picks.
  const calm = () => Boolean(isOpen && ready && !ready.busy && !opening && !harvesting && !picking.size);
  return { start, restyle, calm, cropRect: () => (isOpen && ready ? ready.cropRect() : null), growRect: () => (isOpen && ready ? ready.growRect() : null), coming: () => Boolean(visit) || arriving, tapped: () => tapped };
})();

/* Talk: a small mic at the speech line opens a slim bar; the pet answers in its own line. */
(function talkBar() {
  const mic = dialogBox?.querySelector("[data-talk-mic]");
  const bar = document.querySelector("[data-talk-bar]");
  const dock = document.querySelector(".dock[data-care-uid]");
  const intro = dialogBox?.querySelector(".intro");
  if (!mic || !bar || !dock || !intro || !care) return;
  const input = bar.querySelector("[data-talk-input]");
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
  let buttons = null;
  let linked = null;
  let rec = null;

  function setHint(text, tap = false) {
    hint.textContent = text;
    hint.hidden = !text;
    hint.classList.toggle("is-tap", tap);
    // The hint changes the bar's height, so the speech line is placed again.
    place();
  }

  function checkLength() {
    const n = count(input.value);
    if (n > MAX) setHint(`${MAX}자까지 보낼 수 있어요 (${n}/${MAX})`);
    else if (!hint.classList.contains("is-tap")) setHint("");
    sendBtn.disabled = inflight || Boolean(rec) || n === 0 || n > MAX;
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
    buttons?.remove();
    buttons = null;
    linked = null;
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
    // Like hush(): the opening's edition line may never come.
    revealEdition();
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

  // Only the Naver links the server built get a button.
  function showLinks(list) {
    const shown = (list || []).map((l) => {
      try {
        const url = new URL(l.url);
        return url.protocol === "https:" && /(^|\.)naver\.com$/.test(url.hostname) ? { url, title: String(l.title || ""), map: l.kind === "map" } : null;
      } catch {
        return null;
      }
    }).filter(Boolean).slice(0, 2);
    if (!shown.length) return;
    buttons = document.createElement("p");
    buttons.className = "talk-links";
    for (const l of shown) {
      const a = document.createElement("a");
      const name = document.createElement("span");
      const site = document.createElement("span");
      a.href = l.url.href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      name.textContent = `${l.map ? "📍" : "🔎"} ${l.title}`;
      site.textContent = l.map ? "네이버 지도" : "네이버";
      a.append(name, site);
      buttons.append(a);
    }
    mic.before(buttons);
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
        showLinks(linked);
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

  function answer(text, list, links) {
    intro.classList.remove("is-thinking");
    bubbles = split(text);
    cited = list;
    linked = links;
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
        if (reply?.ok && typeof reply.text === "string" && reply.text) {
          answer(reply.text, reply.sources, reply.links);
          if (reply.action === "dance") care?.dance();
        } else {
          answer(typeof reply?.line === "string" ? reply.line : ERROR_LINE, null);
        }
      });
  }

  function stopVoice(abort) {
    if (!rec) return;
    const r = rec;
    rec = null;
    mic.classList.remove("is-listening");
    mic.setAttribute("aria-pressed", "false");
    checkLength();
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
    mic.classList.add("is-listening");
    mic.setAttribute("aria-pressed", "true");
    checkLength();
    immersive.beforeAsk("microphone");
    try {
      r.start();
    } catch {
      stopVoice(true);
      setHint(KEYBOARD_HINT, true);
    }
  }

  function busy() {
    return Boolean(careHold.busy || careHold.asleep || waking || care.blocked());
  }

  function sync() {
    const hide = busy();
    if (mic.hidden !== hide) mic.hidden = hide;
  }

  mic.addEventListener("pointerdown", (event) => event.stopPropagation());
  // The only mic: opens the bar and listens; a press while listening ends the utterance.
  mic.addEventListener("click", () => {
    ensureAudio();
    openBar();
    listen();
  });
  dialogBox.addEventListener("pointerdown", (event) => {
    if (!ready || !bubbles.length || bubble >= bubbles.length - 1 || event.target.closest?.("a")) return;
    say(bubble + 1, cited);
  });
  bar.addEventListener("submit", (event) => event.preventDefault());
  sendBtn.addEventListener("click", () => send(input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    send(input.value);
  });
  input.addEventListener("input", () => {
    if (hint.classList.contains("is-tap")) setHint("");
    // Typing takes over from listening.
    stopVoice(true);
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
// Every touch wakes sound that is not running. A finger only unlocks it once it lifts, so its pointerdown waits for the pointerup.
function rewake(event) {
  if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
  if (navigator.userActivation?.hasBeenActive === false) return;
  if (!audio) wakeAudio();
  else if (audio.state !== "running") audio.resume?.().catch(() => {});
  for (const fn of firstTouch.splice(0)) fn(event);
}
for (const type of ["pointerdown", "pointerup", "keydown"]) document.addEventListener(type, rewake, true);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && audio && audio.state !== "running" && navigator.userActivation?.hasBeenActive !== false) audio.resume?.().catch(() => {});
});

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
  let nameGlow = null;
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
    nameGlow = document.createElement("span");
    nameGlow.className = "reveal-name-glow";
    nameGlow.setAttribute("aria-hidden", "true");
    nameEl.append(nameGlow, nameEdge, nameGold);
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

  // The overlay's own box: iOS shrinks innerHeight under the keyboard without a resize event.
  function layout() {
    const vw = overlay.clientWidth || window.innerWidth;
    const vh = overlay.clientHeight || window.innerHeight;
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
    nameGlow.textContent = text;
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
      // Opacity only: a per-frame filter re-rasterizes the whole name at full size every frame.
      nameGlow.style.opacity = String(glow);
      nameEl.style.transform = `scale(${scale * (1 + 0.1 * land)}, ${scale * (1 - 0.15 * land)})`;
      nameEl.style.opacity = String(Math.min(1, drop * 2.5));
    }
    overlay.classList.toggle("is-named", f >= NAME_AT);
    const dateP = span(f, DATE_AT, DATE_AT + 20);
    dateEl.style.opacity = String(0.85 * dateP);
    dateEl.style.transform = `translateY(${lerp(12, 0, outCubic(dateP))}px)`;
  }

  function exitFullscreen() {
    if (document.fullscreenElement === overlay) document.exitFullscreen?.().catch(() => {});
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
      window.visualViewport?.removeEventListener("resize", layout);
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
    window.visualViewport?.addEventListener("resize", layout);
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

// The kinds with their own opening video, as the server listed them; the rest name their pet without one.
const REVEALS = (document.querySelector("script[data-reveals]")?.dataset.reveals || "").split(" ");

function revealKind() {
  const kind = document.documentElement.dataset.mascot;
  return REVEALS.includes(kind) ? kind : "";
}

const nameForm = document.querySelector(".name-form");

function armReveal() {
  if (nameForm && revealKind() && !prefersReducedMotion()) reveal.prepare(revealKind());
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
  if (!size || size > 24 || prefersReducedMotion() || !revealKind()) return;
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

  // Pinch zoom would leave this fixed sheet half off screen: pin it to the visible part.
  function pinDemo() {
    const vv = window.visualViewport;
    const pin = Boolean(vv) && (Math.abs(vv.scale - 1) > 0.01 || vv.offsetLeft !== 0 || vv.offsetTop !== 0 || vv.height < window.innerHeight - 1);
    demoSheet.style.transformOrigin = pin ? "0 0" : "";
    demoSheet.style.width = pin ? `${vv.width * vv.scale}px` : "";
    demoSheet.style.height = pin ? `${vv.height * vv.scale}px` : "";
    demoSheet.style.transform = pin ? `translate(${vv.offsetLeft}px, ${vv.offsetTop}px) scale(${1 / vv.scale})` : "";
  }

  function openDemo() {
    tryVibrate(15);
    loadSfx(cryName());
    if (replayReveal && revealKind()) reveal.prepare(revealKind());
    pinDemo();
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
    if (document.documentElement.classList.contains("g-on") || document.documentElement.classList.contains("f-on")) return;
    // The picker's art loads while the finger holds.
    demoSheet.querySelectorAll('img[loading="lazy"]').forEach((img) => { img.loading = "eager"; });
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
  for (const type of ["resize", "scroll"]) {
    window.visualViewport?.addEventListener(type, () => {
      if (!demoSheet.hidden) pinDemo();
    });
  }

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
  // The edition row saves on the pet and repaints the stat card in place.
  const editions = demoSheet.querySelectorAll("[data-edition]");
  editions.forEach((btn) => btn.addEventListener("click", () => {
    fetch("/demo/edition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: demoSheet.querySelector("input[name=uid]")?.value, edition: btn.dataset.edition }),
      credentials: "same-origin",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((reply) => {
        if (!reply?.ok) return;
        editions.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
        showEdition(reply.edition, reply.name, reply.stats);
      })
      .catch(() => {});
  }));
  demoSheet.querySelector("[data-demo-fresh]")?.addEventListener("submit", () => {
    try {
      sessionStorage.removeItem(claimSeenKey(pageUid()));
    } catch {
      /* private mode */
    }
  });
}

/* Coach: a soft scrim with one spotlight, a ring hugging the target and a finger pointing at it. The guide picks the target. */
const coach = (function coachLayer() {
  const root = document.documentElement;
  const HAND = '<svg viewBox="0 0 80 88" aria-hidden="true"><path d="M25 43V13c0-10 13-10 13 0v23c3-8 13-5 13 2 5-6 13-2 13 5 8-3 13 2 11 11l-5 19c-2 8-9 11-21 11-13 0-21-4-27-12L8 53c-5-8 4-16 11-9l9 9"/></svg>';
  const PX_HAND = [
    "....kk..........",
    "...kwwk.........",
    "...kwwk.........",
    "...kwwk.........",
    "...kwwkkk.......",
    "...kwwkwwkkk....",
    "...kwwkwwkwwkk..",
    "kk.kwwkwwkwwkwk.",
    "kwkkwwwwwwwwwwk.",
    "kwwkwwwwwwwwwwk.",
    ".kwwwwwwwwwwwwk.",
    "..kwwwwwwwwwwwk.",
    "..kwwwwwwwwwwk..",
    "...kwwwwwwwwwk..",
    "....kwwwwwwwk...",
    "....kkkkkkkkk...",
  ];
  const PAD = 8;
  const MOVE_MS = 250;
  const layer = (name, tag = "div") => {
    const el = document.createElement(tag);
    el.className = name;
    if (tag === "div") el.setAttribute("aria-hidden", "true");
    return el;
  };
  let hole = null;
  let ring = null;
  let finger = null;
  let hand = null;
  let tag = null;
  let skip = null;
  let onSkip = null;
  let measure = null;
  let label = null;
  let box = null;
  let from = null;
  let started = 0;
  let frame = 0;
  let drawn = "";
  let art = "";

  function pixelHand() {
    let rects = "";
    PX_HAND.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch !== ".") rects += `<rect class="px-${ch}" x="${x}" y="${y}" width="1.02" height="1.02"/>`;
    }));
    return `<svg viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
  }

  function dress() {
    const px = root.dataset.theme === "8bit";
    if (art === String(px)) return;
    art = String(px);
    hand.innerHTML = px ? pixelHand() : HAND;
  }

  // Follows the target every frame: a sheet sliding up or a resize moves the spotlight with it.
  function place(now) {
    frame = window.requestAnimationFrame(place);
    const r = measure?.();
    if (!r?.width) return;
    let next = { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 };
    const t = from && !prefersReducedMotion() ? Math.min(1, (now - started) / MOVE_MS) : 1;
    if (t < 1) {
      const k = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      next = Object.fromEntries(Object.keys(next).map((key) => [key, from[key] + (next[key] - from[key]) * k]));
    } else {
      from = null;
    }
    box = next;
    const dialog = dialogBox?.getBoundingClientRect();
    const side = dialog && r.top >= dialog.bottom;
    // The tip rests on the target's near edge, so the hand never covers what it points at; a big target takes it inside.
    const down = !side && r.top + r.height / 2 > window.innerHeight * 0.5;
    const reach = r.height > 120 ? r.height * 0.38 : 7;
    const tipX = r.left + r.width * 0.58;
    const tipY = side ? r.top + r.height / 2 : down ? r.top + reach : r.top + r.height - reach;
    const text = label?.() || "";
    const key = [box.x, box.y, box.w, box.h, tipX, tipY, down, side, dialog?.top, dialog?.bottom, text].map((v) => (typeof v === "number" ? v.toFixed(1) : v)).join();
    if (key === drawn) return;
    drawn = key;
    const radius = `${Math.min(box.w, box.h) / 2}px`;
    for (const el of [hole, ring]) {
      el.style.left = `${box.x}px`;
      el.style.top = `${box.y}px`;
      el.style.width = `${box.w}px`;
      el.style.height = `${box.h}px`;
      el.style.setProperty("--coach-r", radius);
    }
    finger.style.left = `${tipX}px`;
    finger.style.top = `${tipY}px`;
    finger.classList.toggle("is-down", down);
    hand.style.transform = side ? `rotate(${tipX > window.innerWidth / 2 ? 90 : -90}deg)` : "";
    if (dialog?.width) {
      const h = hand.getBoundingClientRect();
      // Reserve the full tap travel, including the SVG stroke, outside the dialog.
      const gap = 18;
      if (h.right + gap > dialog.left && h.left - gap < dialog.right && h.bottom + gap > dialog.top && h.top - gap < dialog.bottom) {
        const above = dialog.top - gap - h.bottom;
        const below = dialog.bottom + gap - h.top;
        finger.style.top = `${tipY + (Math.abs(above) < Math.abs(below) ? above : below)}px`;
      }
    }
    tag.textContent = text;
    tag.style.left = `${box.x + box.w / 2}px`;
    tag.style.top = `${box.y - 6}px`;
  }

  // Built on the first step, so a page without a guide never carries it.
  function build() {
    hole = layer("coach-hole");
    ring = layer("coach-ring");
    finger = layer("coach-finger");
    hand = layer("coach-hand", "span");
    tag = layer("coach-tag");
    skip = layer("coach-skip", "button");
    skip.type = "button";
    skip.textContent = "건너뛰기";
    skip.addEventListener("click", () => onSkip?.());
    ring.addEventListener("animationend", (event) => {
      if (event.animationName === "coach-pulse" || event.animationName === "coach-flash") ring.classList.remove("is-pulse");
    });
    finger.append(hand);
    document.body.append(hole, ring, finger, tag, skip);
  }

  // Soft: a quiet ring with no scrim or finger, for a wait; tag labels it.
  function show(target, { soft = false, tag: words = null } = {}) {
    if (!hole) build();
    dress();
    from = box && root.classList.contains("has-coach") ? box : null;
    started = performance.now();
    measure = target;
    label = words;
    drawn = "";
    root.classList.toggle("coach-soft", soft);
    if (!from) {
      drawn = "";
      ring.classList.remove("is-pulse");
    }
    root.classList.add("has-coach");
    if (!frame) frame = window.requestAnimationFrame(place);
  }

  function hide() {
    root.classList.remove("has-coach", "coach-soft");
    window.cancelAnimationFrame(frame);
    frame = 0;
    measure = null;
    box = null;
  }

  // A tap anywhere else: the ring bumps once, never dismissing the step.
  function pulse() {
    tryVibrate(10);
    ring.classList.remove("is-pulse");
    void ring.offsetWidth;
    ring.classList.add("is-pulse");
  }

  return { show, hide, pulse, owns: (el) => Boolean(skip?.contains(el)), skipped: (fn) => { onSkip = fn; } };
})();

/* Guide: from the first home after naming, the pet walks its owner through one button at a time. */
(function guideTour() {
  const dock = document.querySelector(".dock[data-care-uid]");
  const win = document.querySelector("[data-window]");
  const met = document.body.dataset.met;
  if (!care || !pet || !dock || !win || !met || !dialogBox) return;
  // Read before the opening's celebration clears it.
  const named = document.body.dataset.celebrate === "named";
  const uid = dock.dataset.careUid;
  const root = document.documentElement;
  const mic = dialogBox.querySelector("[data-talk-mic]");
  const talkBar = document.querySelector("[data-talk-bar]");
  const arcadeSheet = document.querySelector('[data-sheet="arcade"]');
  const TICK_MS = 100;
  const CALM_MS = 700;
  const TALK_IDLE_MS = 1500;
  const LINE_BACK_MS = 1800;
  const PLAY = { classic: "공놀이", "8bit": "공놀이", milk: "딸기공 놀이", najeon: "제기차기" };
  const CARE_LINES = {
    feed: () => (night() ? "자기 전에 밥 먹을래요! 밥을 눌러 줘요" : "배고파요! 밥을 눌러줘요"),
    play: () => `${PLAY[root.dataset.theme] || PLAY.classic} 하고 싶어요! 아래 놀이를 눌러줘요`,
    sleep: () => "졸려요! 잠을 눌러줘요",
  };
  let m = null;
  let key = "";
  let guide = null;
  let shown = null;
  let calm = 0;
  let idle = 0;
  let said = "";
  let drift = 0;
  let talked = 0;
  let timer = 0;
  let finished = 0;
  let tapBase = 0;
  // The farm's own first-time hint gives way to the farm tour; a skip before its first pick hands it back.
  const FARM_HINT = `farm-guide:${uid}`;

  const verb = () => m.careVerb(dock.dataset.want);
  // The pet wants 잠 only between 22 and 05 in Seoul.
  const night = () => dock.dataset.want === "sleep";
  // target: what the spotlight hugs and the only thing a touch reaches; done: the event on it that finishes the step.
  const STEPS = {
    care: {
      target: () => dock.querySelector(`[data-care="${verb()}"]`),
      // The want bubble counts when it does the verb's job; at night it would put the pet to bed instead.
      also: () => win.querySelector(`.want[data-want="${verb()}"]:not(.is-gone)`),
      line: () => CARE_LINES[verb()](),
      done: "click",
    },
    pet: { target: () => pet.querySelector(".pet-hit"), line: () => "나를 톡톡 쓰다듬어 줄래요?", done: "pointerdown" },
    talk: { target: () => mic, line: () => "마이크를 누르고 말을 걸어봐요. 대답하고 기억도 해요!", done: "click" },
    // Finishes once the farm is open, however it opened.
    farm: { target: () => dock.querySelector("[data-farm]"), line: () => "텃밭에서 간식을 길러요! 가볼래요?" },
    arcade: { target: () => dock.querySelector('[data-open="arcade"]'), line: () => "오락실에서 같이 놀아요!", done: "click" },
    race: {
      target: () => arcadeSheet?.querySelector('[data-game="race"]'),
      sheet: () => arcadeSheet,
      // Closing the room by its × or its backdrop ends the step too, so nobody waits on a sheet they shut.
      hits: (event) => {
        const hit = event.target.closest?.('[data-game="race"], [data-sheet-close]');
        return event.target === arcadeSheet || Boolean(hit && arcadeSheet.contains(hit));
      },
      done: "click",
    },
    sleep: { target: () => dock.querySelector('[data-care="sleep"]'), line: () => "이제 졸려요… 잠을 눌러 재워 줄래요?", done: "click" },
    bye: { line: () => "언제든 인형을 폰에 톡 대면 내가 깨어나요!", asleep: true },
    // The farm tour: crops are drawn on the stage, so the crop step lights the plot a tap there picks.
    crop: {
      rect: () => farm?.cropRect(),
      hits: (event) => win.contains(event.target) && within(farm?.cropRect(), event),
      line: () => "다 자란 채소를 톡 눌러서 따요",
      done: "pointerdown",
      farm: true,
      // A plushie harvest already filled the basket, or nothing ripens soon.
      skip: () => cropPhase() === "skip",
    },
    // Not a step of its own: the crop step's wait, a soft ring on the growing plot until it ripens.
    grow: {
      rect: () => farm?.growRect(),
      line: () => "쑥쑥 자라는 중! 다 자라면 알려 줄게요",
      farm: true,
      soft: true,
      tag: () => {
        const left = farm?.growRect();
        if (!left) return "";
        return left.ms < 60000 ? `${Math.max(1, Math.ceil(left.ms / 1000))}초 남았어요` : left.words;
      },
    },
    send: {
      target: () => document.querySelector(".f-basket .fb-act.is-all, .f-basket .fb-act.is-bus"),
      line: () => "바구니에 모였어요! 버스로 보내면 코인을 받아요",
      done: "click",
      farm: true,
      // The picks settle into the basket a moment after the last one.
      after: 3000,
      skip: () => Boolean(document.querySelector(".f-basket .fb-empty")),
    },
    // Before Lv 3 the coins only say when the shop opens, so the line says it too.
    shop: {
      target: () => document.querySelector(".f-basket .fb-coins"),
      line: () => (document.querySelector(".f-basket .fb-coins.is-shop") ? "코인으로 새 씨앗을 사요" : "코인을 모아 둬요! Lv 3부터 새 씨앗을 살 수 있어요"),
      done: "click",
      farm: true,
    },
    "farm-bye": { line: () => "인형을 폰에 톡 대면 한 번에 다 거둬요!", farm: true, after: 2500 },
    "farm-home": { target: () => dock.querySelector("[data-farm]"), line: () => "집으로 가서 오락실도 구경해요!", done: "click", farm: true, after: 2500 },
  };

  // A plushie harvest that picked since the tour began (a tap, a desk F5, a farm visit) is the pick, whatever is still ripe or growing.
  const cropPhase = () => ((farm?.tapped() || 0) > tapBase ? "skip" : m.cropPhase({ ripe: Boolean(farm?.cropRect()), basket: Boolean(document.querySelector(".f-basket .fb-crop")), wait: farm?.growRect()?.ms ?? Infinity }));

  const within = (r, event) => Boolean(r) && event.clientX >= r.left && event.clientX <= r.left + r.width && event.clientY >= r.top && event.clientY <= r.top + r.height;

  // The spotlight's box this frame, or null while the target is gone.
  function where(spec) {
    if (spec.rect) return spec.rect() || null;
    const el = spec.target?.();
    return visible(el) ? el.getBoundingClientRect() : null;
  }

  function load() {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function save() {
    try {
      localStorage.setItem(key, JSON.stringify(guide));
    } catch {
      /* private mode: this page still runs it */
    }
  }

  // A new meet clears the older meets' records for this pet.
  function forget() {
    try {
      const prefix = m.guideKey(uid, "");
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const old = localStorage.key(i);
        if (old?.startsWith(prefix) && old !== key) localStorage.removeItem(old);
      }
    } catch {
      /* private mode */
    }
  }

  // Anything the pet is busy with, or a sheet, panel or game on top, pauses the guide; a step may live in its own sheet.
  // The open farm holds the pet, so farm steps wait for the farm's own shows instead; a naming's edition reveal and a farm visit on its way in pause both.
  function blocked(spec) {
    const field = Boolean(spec.farm);
    return Boolean(waking || (careHold.asleep && !spec.asleep) || (!field && careHold.busy) || (field && !farm?.calm())
      || root.classList.contains("f-on") !== field || (sheetOpen && sheetOpen !== spec.sheet?.()) || (demoSheet && !demoSheet.hidden)
      || root.classList.contains("has-reveal") || root.classList.contains("g-on") || performance.now() - finished < (spec.after || 0)
      || "editionReveal" in root.dataset || root.classList.contains("is-edition-lit") || farm?.coming()
      || document.querySelector("canvas.celebrate-layer, .is-evolving, .is-still-celebrate, .is-reunion-jump, .gift.is-glow, .combo-key, .talk-bar.is-open, .f-prompt"));
  }

  // The pet has said its piece: no typing bubble, no line mid-type, the last line of the opening reached.
  function quiet() {
    return !dialogBox.querySelector(".dialog-dots, .dialog-cursor:not(.is-done), .is-thinking")
      && (!dialogBox.classList.contains("is-seq") || dialogBox.classList.contains("is-end"));
  }

  const visible = (el) => Boolean(el?.isConnected && !el.hidden && el.getClientRects().length);

  function current() {
    if (root.classList.contains("f-on")) {
      const step = m.nextStep(guide, m.FARM_STEPS);
      return step === "crop" && cropPhase() === "wait" ? "grow" : step;
    }
    const step = m.nextStep(guide, m.HOME_STEPS, { talk: Boolean(mic), night: night() });
    // Back from a closed 오락실, the race step first points at the room again.
    return step === "race" && sheetOpen !== arcadeSheet ? "arcade" : step;
  }

  // The talk step only shows the bar: once nobody speaks or types, the guide puts away the bar that step opened.
  function settleTalk() {
    if (!talked) return;
    if (!talkBar?.classList.contains("is-open")) {
      idle = 0;
      if (talked > 1) talked = 0;
      return;
    }
    talked = 2;
    const input = talkBar.querySelector("[data-talk-input]");
    const still = !mic?.classList.contains("is-listening") && !input?.value.trim() && document.activeElement !== input && quiet();
    idle = still ? idle + TICK_MS : 0;
    if (idle < TALK_IDLE_MS) return;
    idle = 0;
    talked = 0;
    talkHook?.close();
  }

  function show(step) {
    shown = step;
    root.dataset.coach = step;
    const spec = STEPS[step];
    spec.target?.()?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    coach.show(() => where(spec), { soft: spec.soft, tag: spec.tag });
    said = spec.line?.() || "";
    if (said) care.fx.say(said);
  }

  // Another line took the speech box mid-step (the farm's own news, say): once it has been read, the step's line comes back.
  function keepLine() {
    const intro = dialogBox.querySelector(".intro");
    const now = (intro?.querySelector(".visually-hidden") || intro)?.textContent.trim() || "";
    drift = said && now !== said && quiet() ? drift + TICK_MS : 0;
    if (drift < LINE_BACK_MS) return;
    drift = 0;
    care.fx.say(said);
  }

  function hide() {
    shown = null;
    said = "";
    delete root.dataset.coach;
    coach.hide();
  }

  function finish(step) {
    guide = m.finishStep(guide, step);
    finished = performance.now();
    if (step === "talk") talked = 1;
    save();
    if (shown) hide();
  }

  function end() {
    guide = m.skipGuide(guide);
    save();
    hide();
    window.clearTimeout(timer);
    if (guide.done.includes("crop")) return;
    try {
      if (localStorage.getItem(FARM_HINT) === "tour") localStorage.removeItem(FARM_HINT);
    } catch {
      /* private mode */
    }
  }

  function tick() {
    if (!m.nextStep(guide, m.HOME_STEPS, { talk: Boolean(mic), night: night() }) && !m.nextStep(guide, m.FARM_STEPS)) return;
    timer = window.setTimeout(tick, TICK_MS);
    if (root.classList.contains("f-on") && !guide.done.includes("farm")) finish("farm");
    settleTalk();
    const step = current();
    const spec = step && STEPS[step];
    const spot = (spec?.target || spec?.rect) && !spec.skip?.();
    if (!spec || blocked(spec) || (spot && !where(spec))) {
      calm = 0;
      if (shown) hide();
      return;
    }
    if (shown === step) {
      // A plushie harvest can do the lit step's job while it shows.
      if (spec.skip?.()) finish(step);
      else keepLine();
      return;
    }
    calm = quiet() ? calm + TICK_MS : 0;
    if (calm < CALM_MS) return;
    calm = 0;
    if (spec.skip?.()) {
      finish(step);
      return;
    }
    if (spot) {
      show(step);
      return;
    }
    // A line with no spotlight closes the tour.
    care.fx.say(spec.line());
    finish(step);
  }

  // While a step shows, only its target (and 건너뛰기) takes a touch; anything else bumps the ring. A soft wait takes none.
  function guard(event) {
    if (!shown || !event.isTrusted || coach.owns(event.target) || event.target.closest?.("[data-demo-hold]")) return;
    const spec = STEPS[shown];
    if (spec.soft) return;
    if (spec.hits ? spec.hits(event) : [spec.target(), spec.also?.()].some((el) => el?.contains(event.target))) {
      if (event.type === spec.done) finish(shown);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.type === "pointerdown") coach.pulse();
  }

  let begun = false;
  function begin() {
    if (m.nextStep(guide, m.FARM_STEPS) && !guide.done.includes("crop")) {
      try {
        // "tour" marks a hint the tour holds, so a later page can still hand it back.
        if (localStorage.getItem(FARM_HINT) === null) localStorage.setItem(FARM_HINT, "tour");
      } catch {
        /* private mode */
      }
    }
    window.clearTimeout(timer);
    if (!begun) {
      begun = true;
      for (const type of ["pointerdown", "pointerup", "click", "dblclick", "contextmenu"]) window.addEventListener(type, guard, true);
      window.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || !shown) return;
        // Esc on the step's own sheet shuts it like its ×, which ends that step, not the tour.
        if (sheetOpen && STEPS[shown].sheet?.() === sheetOpen) {
          finish(shown);
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        end();
      }, true);
      coach.skipped(end);
    }
    tick();
  }

  // 가이드 다시 보기 in 우리 기록: this meet's record starts over at step 1, the farm tour on the next farm open.
  function replay() {
    closeSheet();
    hide();
    guide = m.startGuide(null, { named: true });
    tapBase = farm?.tapped() || 0;
    save();
    begin();
  }

  import("/guide-model.js").then((model) => {
    m = model;
    key = m.guideKey(uid, met);
    document.querySelector("[data-guide-replay]")?.addEventListener("click", replay);
    const saved = load();
    guide = m.startGuide(saved, { named });
    if (!guide || guide.skipped) return;
    if (!saved) forget();
    save();
    begin();
  }, () => {});
})();

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
    farm?.start();
  });
} else if (care && document.body.hasAttribute("data-asleep")) {
  care.doze();
  combo?.start();
  farm?.start();
} else {
  runCelebrate();
  startDialog(() => care?.opened());
  combo?.start();
  farm?.start();
  armReveal();
}
document.documentElement.setAttribute("data-app", "");
