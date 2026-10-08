/* Diagnostics for the pet page: errors, a lost WebGL stage, a stalled page and a home pet gone missing after a scene go to POST /diag in small batches. It only listens; nothing on screen changes. */

const MAX_EVENTS = 30;
const DETAIL_CHARS = 300;
const FLUSH_MS = 2000;
// Losing one of these classes means a scene just closed; while f-on, g-on or a reveal is on, the pet is meant to be away.
const SCENES = ["f-on", "f-layout", "g-on"];
const AWAY = ["f-on", "g-on", "has-reveal"];
const CHECK_MS = [1500, 6000];
// Fainter than this, the pet does not read as drawn.
const FAINT = 0.1;

const cut = (text) => Array.from(String(text)).slice(0, DETAIL_CHARS).join("");
const two = (n) => Math.round(n * 100) / 100;

// Why the pet in the snapshot is not drawn, in check order; "" when it is.
function petFault(s) {
  if (s.gone) return "pet gone";
  if (!s.frame) return "no frame shown";
  if (s.display) return `display none at ${s.display}`;
  const { x, y, w, h } = s.rect;
  if (w < 1 || h < 1) return "zero size";
  if (x + w <= 0 || y + h <= 0 || x >= s.view.w || y >= s.view.h) return "off screen";
  if (s.visibility !== "visible") return `visibility ${s.visibility} at ${s.hiddenAt}`;
  const held = s.anims.find((a) => a.opacity !== null && a.opacity < FAINT);
  if (held) return `animation on ${held.on} holds opacity ${two(held.opacity)} (${held.name}, ${held.state})`;
  const alpha = s.opacity.reduce((n, o) => n * o.value, 1);
  if (alpha < FAINT) return `opacity ${two(alpha)}`;
  if (!s.frame.complete) return "frame still loading";
  if (!s.frame.width) return "frame image broken";
  if (s.hit && !s.hit.pet && !s.hit.ui) return `covered by ${s.hit.name}`;
  return "";
}

// Everything the snapshot saw, after the failed check.
function petSeen(s) {
  const seen = [`box ${s.rect.x},${s.rect.y} ${s.rect.w}x${s.rect.h}`];
  if (s.opacity.length) seen.push(`opacity ${s.opacity.map((o) => `${o.at} ${two(o.value)}`).join(", ")}`);
  if (s.visibility !== "visible") seen.push(`visibility ${s.visibility} at ${s.hiddenAt}`);
  if (s.display) seen.push(`display none at ${s.display}`);
  if (s.anims.length) seen.push(`anims ${s.anims.map((a) => `${a.on} ${a.name} ${a.state}${a.opacity === null ? "" : ` ${two(a.opacity)}`}`).join(", ")}`);
  if (s.style.pet) seen.push(`pet style ${s.style.pet}`);
  if (s.style.motion) seen.push(`motion style ${s.style.motion}`);
  seen.push(s.frame ? `frame ${s.frame.name} ${s.frame.src} ${s.frame.complete ? "loaded" : "loading"} ${s.frame.width}w` : "no frame");
  seen.push(`hit ${s.hit ? s.hit.name : "none"}`);
  return seen.join(" | ");
}

// The home pet check over a plain snapshot: "" when the pet is visibly drawn, else which check failed, when, and what was seen.
export function petCheck(s) {
  const fault = petFault(s);
  if (!fault) return "";
  const when = `${s.wait / 1000}s after ${s.scene}`;
  return cut(s.gone ? `${fault} ${when}` : `${fault} ${when} | ${petSeen(s)}`);
}

// Tests import petCheck; only a page starts the beacon.
if (typeof document === "object") beacon();

function beacon() {
  const root = document.documentElement;
  const load = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");
  const queue = [];
  let context = null;
  let noted = 0;
  let flushTimer = 0;

  const place = (url) => String(url || "").replace(window.location.origin, "") || "?";
  const nameOf = (el) => el.tagName.toLowerCase() + [...el.classList].slice(0, 2).map((c) => `.${c}`).join("");
  const classesOf = (text) => String(text || "").split(/\s+/);

  // The page as it stood at the batch's first event.
  function pageNow() {
    return {
      id: load,
      uid: document.querySelector(".dock[data-care-uid]")?.dataset.careUid || document.querySelector('input[name="uid"]')?.value || "",
      theme: root.dataset.theme || "classic",
      kind: root.dataset.mascot || "",
      view: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`,
      fullscreen: Boolean(document.fullscreenElement),
      visibility: document.visibilityState,
      classes: root.className,
      ua: navigator.userAgent,
    };
  }

  function note(name, detail) {
    if (noted >= MAX_EVENTS) return;
    noted += 1;
    if (!queue.length) context = pageNow();
    queue.push({ name, detail: cut(detail), ms: Math.round(performance.now()) });
    window.clearTimeout(flushTimer);
    flushTimer = window.setTimeout(flush, FLUSH_MS);
  }

  function flush() {
    window.clearTimeout(flushTimer);
    if (!queue.length) return;
    const body = JSON.stringify({ ...context, events: queue.splice(0) });
    try {
      navigator.sendBeacon?.("/diag", new Blob([body], { type: "application/json" }));
    } catch {
      /* best effort */
    }
  }

  // Plain words for anything thrown or logged.
  function said(value) {
    try {
      if (value instanceof Error) return `${value.name}: ${value.message}`;
      if (typeof value === "string") return value;
      return JSON.stringify(value) ?? String(value);
    } catch {
      return Object.prototype.toString.call(value);
    }
  }

  // The first stack line that points into a file, outside this one.
  function frameOf(stack) {
    const at = String(stack || "").split("\n").map((l) => l.trim()).find((l) => /:\d+:\d+\)?$/.test(l) && !l.includes("/diag.js"));
    return at ? ` @ ${place(at.replace(/^at /, ""))}` : "";
  }

  window.addEventListener("error", (event) => {
    note("error", `${event.message || "error"} ${place(event.filename)}:${event.lineno || 0}:${event.colno || 0}`);
  });
  window.addEventListener("unhandledrejection", (event) => {
    note("error", `unhandled rejection: ${said(event.reason)}${frameOf(event.reason?.stack)}`);
  });

  // console.error still logs as before; a copy of its first argument and where it came from goes along.
  const logError = console.error;
  console.error = function error(...args) {
    try {
      const thrown = args.find((a) => a instanceof Error);
      note("console", `${said(args[0])}${frameOf(thrown ? thrown.stack : new Error().stack)}`);
    } catch {
      /* never in the console's way */
    }
    return logError.apply(this, args);
  };

  // A lost context never bubbles, so the document hears it on the way down.
  document.addEventListener("webglcontextlost", (event) => {
    const canvas = event.target;
    note("gl-lost", `${canvas.parentElement ? nameOf(canvas.parentElement) : "detached"} ${canvas.width}x${canvas.height}`);
  }, true);

  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) flush();
  });

  // A stalled page: the 1 s timer finds a gap, or the frame asked for every 2 s comes late. Both rest while the page is hidden.
  function watchClocks() {
    let timer = 0;
    let last = 0;
    let asked = 0;
    let ping = null;
    let shown = 0;

    function beat() {
      if (document.hidden) return;
      const t = performance.now();
      if (t - last > 3000) note("stall", `timer gap ${Math.round(t - last)}ms`);
      last = t;
      if (ping && !ping.told && t - ping.at > 2000) {
        ping.told = true;
        note("stall", `frame gap ${Math.round(t - ping.at)}ms, still waiting`);
      }
      if (ping || t - asked < 2000) return;
      const p = { at: t, told: false, shown };
      ping = p;
      asked = t;
      window.requestAnimationFrame(() => {
        if (ping === p) ping = null;
        const gap = performance.now() - p.at;
        // A frame held back by a hidden page is no stall.
        if (gap > 2000 && p.shown === shown && !document.hidden) note("stall", `frame gap ${Math.round(gap)}ms${p.told ? ", came at last" : ""}`);
      });
    }

    function wake() {
      window.clearInterval(timer);
      shown += 1;
      ping = null;
      if (document.hidden) return;
      last = performance.now();
      asked = 0;
      timer = window.setInterval(beat, 1000);
    }
    document.addEventListener("visibilitychange", wake);
    wake();
  }

  // What the snapshot check reads: the shown frame's box, the styles up its ancestors, the pet's animations and what a tap at its center would hit.
  function petNow(scene, wait) {
    const pet = document.querySelector("[data-pet]");
    if (!pet) return { scene, wait, gone: true };
    const motion = pet.querySelector(".pet-motion");
    const frame = pet.querySelector(".pet-frame.is-show");
    const chain = [];
    for (let el = frame || motion || pet; el; el = el.parentElement) chain.push(el);
    const css = chain.map((el) => getComputedStyle(el));
    // Visibility is inherited: walk up to where the hidden run starts.
    let top = 0;
    while (top + 1 < chain.length && css[top + 1].visibility !== "visible") top += 1;
    const none = chain.findLast((el, i) => css[i].display === "none");
    const box = (frame || pet).getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const hit = x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight ? document.elementFromPoint(x, y) : null;
    const anims = (el, on) => (el?.getAnimations() || []).map((a) => ({
      on,
      name: a.animationName || (a.transitionProperty ? `transition ${a.transitionProperty}` : keysOf(a.effect)),
      state: a.playState,
      opacity: opacityOf(a.effect),
    }));
    return {
      scene,
      wait,
      rect: { x: Math.round(box.left), y: Math.round(box.top), w: Math.round(box.width), h: Math.round(box.height) },
      view: { w: window.innerWidth, h: window.innerHeight },
      display: none ? nameOf(none) : "",
      visibility: css[0].visibility,
      hiddenAt: css[0].visibility === "visible" ? "" : nameOf(chain[top]),
      opacity: chain.map((el, i) => ({ at: nameOf(el), value: Number(css[i].opacity) })).filter((o) => o.value < 1),
      anims: [...anims(pet, "pet"), ...anims(motion, "motion")],
      style: { pet: pet.getAttribute("style") || "", motion: motion?.getAttribute("style") || "" },
      frame: frame && { name: frame.dataset.frame || "", src: place(frame.currentSrc || frame.src), complete: frame.complete, width: frame.naturalWidth },
      // An open sheet or panel over the pet is the page's own, not a vanished pet.
      hit: hit && { name: nameOf(hit), pet: pet.contains(hit), ui: Boolean(hit.closest('[role="dialog"]')) },
    };
  }

  // A script animation's properties, with its opacity steps.
  function keysOf(effect) {
    const frames = effect?.getKeyframes?.() || [];
    const props = [...new Set(frames.flatMap((f) => Object.keys(f)))].filter((p) => !["offset", "computedOffset", "easing", "composite"].includes(p));
    return props.map((p) => (p === "opacity" ? `opacity ${frames.filter((f) => f.opacity !== undefined).map((f) => f.opacity).join(">")}` : p)).join("+") || "keyframes";
  }

  // Where an animation holds opacity right now, read off its keyframes; null when it doesn't touch opacity.
  function opacityOf(effect) {
    const frames = (effect?.getKeyframes?.() || []).filter((f) => f.opacity !== undefined && f.opacity !== "");
    const p = effect?.getComputedTiming?.().progress;
    if (!frames.length || p === null || p === undefined) return null;
    const i = frames.findIndex((f) => f.computedOffset >= p);
    if (i <= 0) return Number(frames[i === -1 ? frames.length - 1 : 0].opacity);
    const a = frames[i - 1];
    const b = frames[i];
    const k = (p - a.computedOffset) / (b.computedOffset - a.computedOffset || 1);
    return Number(a.opacity) + (Number(b.opacity) - Number(a.opacity)) * k;
  }

  function checkPet(scene, wait) {
    if (document.hidden || AWAY.some((c) => root.classList.contains(c))) return;
    const detail = petCheck(petNow(scene, wait));
    if (detail) note("pet-hidden", detail);
  }

  // A scene that closes hands the window back to the home pet; 1.5 s and 6 s after its last class goes, the pet must be drawn.
  function watchPet() {
    let checks = [];
    new MutationObserver((records) => {
      const was = records.map((r) => classesOf(r.oldValue)).find((old) => SCENES.some((c) => old.includes(c) && !root.classList.contains(c)));
      if (!was) return;
      const scene = was.includes("r-on") ? "race" : was.includes("g-on") ? "gimo" : "farm";
      checks.forEach((id) => window.clearTimeout(id));
      checks = CHECK_MS.map((ms) => window.setTimeout(() => checkPet(scene, ms), ms));
    }).observe(root, { attributeFilter: ["class"], attributeOldValue: true });
  }

  // Only a page with a pet watches its clocks and its pet.
  if (document.querySelector("[data-pet]")) {
    watchClocks();
    watchPet();
  }
}
