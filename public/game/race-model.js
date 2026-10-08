// 100 m, pet (0) vs rival (1). Taps carry the slow-motion scale so a slowed clock never pays more per real second.
export const RACE = { meters: 100, step: 1 / 240, cap: 20 };

export const rivalTime = (level) => 13.6 * 0.972 ** (level - 1);

const smooth = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

// A quick start, a breathing pace and a late kick, so leads change and the end stays close.
function pace(top, t, d, level) {
  return top * (1 - Math.exp(-t / 0.45)) * (1 + 0.04 * Math.sin(d / 8.5 + level * 1.7)) * (1 + 0.07 * smooth((d - 72) / 16));
}

function track(top, level, keep) {
  const out = keep ? [0] : null;
  let d = 0;
  let t = 0;
  for (;;) {
    const next = d + pace(top, t, d, level) * RACE.step;
    t += RACE.step;
    out?.push(next);
    if (next >= RACE.meters) return { time: t - (next - RACE.meters) / (next - d) * RACE.step, out };
    d = next;
  }
}

// `agi` is the pet's 민첩 bonus in percent: it lifts the pet's top speed, never the rival's.
export function newRace(level, agi = 0) {
  const goal = rivalTime(level);
  let lo = 4;
  let hi = 40;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (track(mid, level).time > goal) lo = mid;
    else hi = mid;
  }
  const { time, out } = track(hi, level, true);
  return { level, agi, time: 0, energy: 0, boost: 0, lastTap: -1, lastNfc: -1, distance: [0, 0], speed: [0, 0], finish: [null, null], held: null, rival: Float64Array.from(out), goal: time };
}

export const decided = (race) => race.held !== null;

export function raceTap(race, kind, scale = 1) {
  if (decided(race)) return false;
  if (kind === "nfc") {
    if (race.time - race.lastNfc < 0.25 * scale) return false;
    race.lastNfc = race.time;
    race.boost = Math.max(race.time, race.boost) + 1.2;
  } else {
    if (race.time - race.lastTap < 0.07 * scale) return false;
    race.lastTap = race.time;
    race.energy = Math.min(11, race.energy + scale);
  }
  return true;
}

function rivalAt(race, t) {
  const r = race.rival;
  const i = t / RACE.step;
  const k = Math.floor(i);
  if (k + 1 < r.length) return r[k] + (r[k + 1] - r[k]) * (i - k);
  const end = r.length - 1;
  return r[end] + (r[end] - r[end - 1]) / RACE.step * (t - end * RACE.step);
}

// Seconds each runner still needs at its current speed.
export const eta = (race, i) => Math.max(0, RACE.meters - race.distance[i]) / Math.max(0.1, race.speed[i]);

export function stepRace(race, dt) {
  const t0 = race.time;
  const t1 = t0 + dt;
  const before = [...race.distance];
  if (race.held) {
    // Past the decision both keep their speed to the line, then ease to a jog.
    for (let i = 0; i < 2; i++) {
      const v = race.held[i] * (t1 > race.finish[i] ? Math.max(0.3, 1 - (t1 - race.finish[i]) * 0.5) : 1);
      race.speed[i] = v;
      race.distance[i] += v * dt;
    }
    race.time = t1;
    return true;
  }
  if (!(dt > 0)) return false;
  const fade = Math.exp(-dt);
  const energy = race.energy * (1 - fade) / dt;
  race.energy *= fade;
  const boost = Math.max(0, Math.min(dt, race.boost - t0)) / dt;
  const goal = (3.5 + 1.15 * energy) * (1 + 0.6 * boost) * (1 + (race.agi || 0) / 100);
  const ease = Math.exp(-dt / 0.15);
  const v0 = race.speed[0];
  race.speed[0] = goal + (v0 - goal) * ease;
  race.distance[0] += goal * dt + (v0 - goal) * 0.15 * (1 - ease);
  race.distance[1] = rivalAt(race, t1);
  race.speed[1] = (race.distance[1] - before[1]) / dt;
  race.time = t1;
  if (race.distance[0] < RACE.meters && race.distance[1] < RACE.meters) return false;
  race.held = [0, 1].map((i) => Math.max(0.1, (race.distance[i] - before[i]) / dt));
  race.held.forEach((v, i) => { race.finish[i] = t0 + (RACE.meters - before[i]) / v; });
  if (race.distance[1] >= RACE.meters) race.finish[1] = race.goal;
  return true;
}
