export const COMBO = { windowMs: 12000, sameTapMs: 800, max: 3 };

const open = (state, now) => state.comboAt !== null && now - state.comboAt < COMBO.windowMs;

// One plushie tap's step: 1 hello, 2 trick, 3 secret, then a new chain.
export function comboTap(state, now) {
  const n = state.comboCount;
  if (n > 0 && state.comboAt !== null && now - state.comboAt < COMBO.sameTapMs) {
    return { combo: n, comboCount: n, comboAt: state.comboAt, same: true };
  }
  const combo = open(state, now) && n >= 1 && n < COMBO.max ? n + 1 : 1;
  return { combo, comboCount: combo, comboAt: now, same: false };
}

// A tap heard on the open page only continues an open chain; null means load a full tap instead.
export function comboNext(state, now) {
  if (!open(state, now) || state.comboCount < 1) return null;
  const out = comboTap(state, now);
  return out.same || out.combo > 1 ? out : null;
}
