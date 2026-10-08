// The guide's two tours: the home's, then the farm's own the first time it opens. Each resumes at its first unfinished step.
export const HOME_STEPS = ["care", "pet", "talk", "farm", "arcade", "race", "sleep", "bye"];
export const FARM_STEPS = ["crop", "send", "shop", "farm-bye", "farm-home"];

const KNOWN = new Set([...HOME_STEPS, ...FARM_STEPS]);
// A grow the pet waits out with the owner; anything longer goes on past the pick.
const WAIT_MS = 3 * 60 * 1000;

// Per pet and per meet: a demo fresh start is a new meet, so the next person gets the whole guide.
export const guideKey = (uid, met) => `pokkey-guide:${uid}:${met}`;

export function readGuide(raw) {
  let saved = null;
  try {
    saved = JSON.parse(raw || "null");
  } catch {
    return null;
  }
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return null;
  const done = Array.isArray(saved.done) ? [...new Set(saved.done.filter((step) => KNOWN.has(step)))] : [];
  return { done, skipped: saved.skipped === true };
}

// Only the first home after naming starts a guide; every other page just resumes one.
export function startGuide(raw, { named = false } = {}) {
  return readGuide(raw) || (named ? { done: [], skipped: false } : null);
}

// Only a pet with the mic gets the talk step, and only a night tour tucks the pet in before the goodbye.
export function nextStep(guide, steps, { talk = true, night = false } = {}) {
  if (!guide || guide.skipped || guide.done.includes("bye")) return null;
  return steps.find((step) => !guide.done.includes(step) && (talk || step !== "talk") && (night || step !== "sleep")) || null;
}

export function finishStep(guide, step) {
  if (guide.done.includes(step)) return guide;
  return { ...guide, done: [...guide.done, step] };
}

export const skipGuide = (guide) => ({ ...guide, skipped: true });

// The care step points at what the pet wants, else 밥: a sleepy pet at night eats first.
export const careVerb = (want) => (want === "play" ? "play" : "feed");

// The farm tour's first pick: a ripe crop, a short grow to wait out together, or on to the basket.
export function cropPhase({ ripe, basket, wait }) {
  if (ripe) return "pick";
  return !basket && wait <= WAIT_MS ? "wait" : "skip";
}
