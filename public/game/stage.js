/* The scenes' one Pixi setup. A stage lives only while its scene is on screen: made on the way in, dropped on the way out,
   so the page holds one WebGL context at most. A frame that throws or a lost context ends the scene once, through `fault`.
   Everything a scene waits on before it shows has a deadline, so a stalled load can never hold the page. */

const IMAGE_MS = 8000;

// An image once it has arrived, by its load event: decode() rides the compositor and can stall on a phone under GPU
// pressure. Past `ms` the load fails instead.
export function loadImage(url, ms = IMAGE_MS) {
  return new Promise((resolve, reject) => {
    const i = new Image();
    const timer = setTimeout(() => {
      i.onload = i.onerror = null;
      reject(new Error(`${url} did not load in ${ms} ms`));
    }, ms);
    i.onload = () => {
      clearTimeout(timer);
      resolve(i);
    };
    i.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`${url} did not load`));
    };
    i.src = url;
  });
}

// Pixi reads the shader precision on a WebGL context of its own and keeps that context; read here first and dropped, it never sits beside a stage.
let probed = false;

export async function makeStage(P, { width, height, resolution = Math.min(2, window.devicePixelRatio || 1), roundPixels = false, background = null, fault }) {
  if (!probed) {
    probed = true;
    P.getMaxFragmentPrecision();
    P.getTestContext()?.getExtension("WEBGL_lose_context")?.loseContext();
  }
  const app = new P.Application();
  try {
    await app.init({ width, height, resolution, autoDensity: true, antialias: false, roundPixels, autoStart: false, preference: "webgl", ...(background === null ? { backgroundAlpha: 0 } : { background }) });
  } catch (error) {
    try { app.destroy(true); } catch {}
    throw error;
  }
  // No scene takes Pixi's pointer events; left on, they would keep Pixi's shared ticker running for the stage's life.
  app.renderer.events.setTargetElement(null);
  const gl = app.renderer.gl;
  let step = null;
  let drawn = null;
  let raf = 0;
  let last = 0;
  // Once faulted or dropped, the stage draws nothing more and faults no more; the scene's fault logs it.
  let over = false;
  let dropped = false;
  const fail = (error) => {
    if (over) return;
    over = true;
    cancelAnimationFrame(raf);
    raf = 0;
    fault(error);
  };
  const tick = (now) => {
    raf = 0;
    const ms = Math.max(0, now - last);
    last = now;
    try {
      step(ms, now);
      // The frame may have ended its scene.
      if (over || !step) return;
      app.renderer.render(app.stage);
      drawn?.();
    } catch (error) {
      fail(error);
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  const lost = () => fail(new Error("WebGL context lost"));
  app.canvas.addEventListener("webglcontextlost", lost);

  return {
    app,
    get live() {
      return !over;
    },
    // Calls fn(ms since the last frame, now), draws the stage, then calls after(), every animation frame until stop() or a fault.
    run(fn, after = null) {
      step = fn;
      drawn = after;
      if (raf || over) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    },
    stop() {
      step = null;
      drawn = null;
      cancelAnimationFrame(raf);
      raf = 0;
    },
    // One frame drawn now, outside the loop: its caller handles a throw.
    draw() {
      if (!over) app.renderer.render(app.stage);
    },
    resize(w, h) {
      app.renderer.resize(w, h);
    },
    drop() {
      if (dropped) return;
      dropped = over = true;
      this.stop();
      app.canvas.removeEventListener("webglcontextlost", lost);
      // Pixi loses its context as it goes; a context already lost is left alone, and one Pixi failed to drop is dropped here.
      if (gl?.isContextLost()) app.renderer.context.extensions.loseContext = null;
      try {
        app.destroy(true, { children: true });
      } catch (error) {
        console.error(error);
      }
      if (gl && !gl.isContextLost()) gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
