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

const pet = document.querySelector("[data-pet]");
if (pet) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const frames = {
    canon: pet.querySelector('[data-frame="canon"]'),
    blink: pet.querySelector('[data-frame="blink"]'),
    react: pet.querySelector('[data-frame="react"]'),
  };
  let pressTimer = 0;
  let blinkTimer = 0;

  function showFrame(name) {
    for (const [key, el] of Object.entries(frames)) {
      el?.classList.toggle("is-show", key === name);
    }
  }

  function scheduleBlink() {
    if (reduceMotion) return;
    clearTimeout(blinkTimer);
    blinkTimer = window.setTimeout(() => {
      if (pet.classList.contains("is-press")) {
        scheduleBlink();
        return;
      }
      showFrame("blink");
      window.setTimeout(() => {
        if (!pet.classList.contains("is-press")) showFrame("canon");
        scheduleBlink();
      }, 120);
    }, 3000 + Math.random() * 4000);
  }

  pet.querySelector(".pet-hit")?.addEventListener("pointerdown", () => {
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
      showFrame("canon");
    }, 700);
  });

  scheduleBlink();
}
