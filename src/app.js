import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";
import * as binding from "./binding.js";
import { hash, ownerToken, recoveryCode } from "./secrets.js";
import { devPage, page, petPage, strangerPage } from "./pages.js";

const cookieAge = 400 * 24 * 60 * 60 * 1000;
const cooldown = 15 * 60 * 1000;
const validUid = (uid) => typeof uid === "string" && /^[0-9A-F]{14}$/.test(uid);

export function createApp({ db, decisions = binding, production = process.env.NODE_ENV === "production", now = Date.now }) {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    });
    next();
  });
  app.use(express.urlencoded({ extended: false, limit: "4kb" }));
  app.use(express.json({ limit: "4kb" }));
  app.use(cookieParser());
  app.use(express.static(fileURLToPath(new URL("../public", import.meta.url))));

  const getRow = (uid) => db.prepare("SELECT * FROM plushies WHERE uid = ?").get(uid) || null;
  const setOwner = (res, token) => res.cookie("owner_token", token, {
    httpOnly: true, sameSite: "lax", secure: production, maxAge: cookieAge, path: "/",
  });
  const invalidUid = (res) => res.status(400).send(page(null, "<p>This tap link is not quite right. Please try the link on your plushie.</p>"));

  app.get("/health", (req, res) => res.type("text").send("ok"));
  app.get("/t", (req, res) => {
    const uid = req.query.uid;
    if (!validUid(uid)) return invalidUid(res);
    const result = db.transaction(() => {
      const row = getRow(uid);
      const state = decisions.resolveTap(row, req.cookies.owner_token || null, hash);
      const stamp = new Date(now()).toISOString();
      if (state === "NEW") {
        const token = ownerToken();
        const code = recoveryCode();
        db.prepare(`INSERT INTO plushies (uid, owner_token_hash, recovery_code_hash, tap_count, created_at, last_tap_at)
          VALUES (?, ?, ?, 1, ?, ?)`).run(uid, hash(token), hash(code), stamp, stamp);
        return { html: petPage(getRow(uid), code), token };
      }
      if (state === "OWNER") {
        db.prepare("UPDATE plushies SET tap_count = tap_count + 1, last_tap_at = ? WHERE uid = ?").run(stamp, uid);
        return { html: petPage(getRow(uid)) };
      }
      if (state === "STRANGER") return { html: strangerPage(row) };
      throw new Error("Invalid binding result");
    })();
    if (result.token) setOwner(res, result.token);
    res.send(result.html);
  });

  app.post("/name", (req, res) => {
    const { uid, name } = req.body || {};
    if (!validUid(uid)) return invalidUid(res);
    const row = getRow(uid);
    if (!decisions.canRename(row, req.cookies.owner_token || null, hash)) {
      return res.status(403).send(row ? strangerPage(row) : page(null, "<p>Meet your plushie with its tap link first.</p>"));
    }
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (!trimmed || Array.from(trimmed).length > 24) {
      return res.status(400).send(page(row, `<p>Please choose a name with 1 to 24 characters.</p><a class="button" href="/t?uid=${uid}">Try again</a>`));
    }
    db.prepare("UPDATE plushies SET pet_name = ? WHERE uid = ?").run(trimmed, uid);
    res.redirect(303, `/t?uid=${uid}`);
  });

  app.post("/claim", (req, res) => {
    const { uid, code } = req.body || {};
    if (!validUid(uid)) return invalidUid(res);
    const result = db.transaction(() => {
      const row = getRow(uid);
      const time = now();
      const attempt = db.prepare("SELECT * FROM claim_attempts WHERE uid = ?").get(uid);
      const active = attempt && time - attempt.window_start < cooldown;
      if (active && attempt.attempts >= 5) return { status: 429, row, message: "Too many tries. Please wait 15 minutes from your first attempt, then try again." };
      if (decisions.verifyClaim(row, code, hash)) {
        const token = ownerToken();
        db.prepare("UPDATE plushies SET owner_token_hash = ? WHERE uid = ?").run(hash(token), uid);
        db.prepare("DELETE FROM claim_attempts WHERE uid = ?").run(uid);
        return { token };
      }
      if (!row) return { status: 404 };
      const count = active ? attempt.attempts + 1 : 1;
      db.prepare(`INSERT INTO claim_attempts (uid, attempts, window_start) VALUES (?, ?, ?)
        ON CONFLICT(uid) DO UPDATE SET attempts = excluded.attempts, window_start = excluded.window_start`).run(uid, count, active ? attempt.window_start : time);
      return { status: count >= 5 ? 429 : 403, row, message: count >= 5
        ? "Too many tries. Please wait 15 minutes from your first attempt, then try again."
        : "that code did not match" };
    })();
    if (result.token) {
      setOwner(res, result.token);
      return res.redirect(303, `/t?uid=${uid}`);
    }
    res.status(result.status).send(result.row ? strangerPage(result.row, result.message) : page(null, "<p>Meet your plushie with its tap link first.</p>"));
  });

  if (!production) {
    app.get("/dev", (req, res) => res.send(devPage()));
    app.post("/dev/reset", (req, res) => {
      db.prepare("DELETE FROM plushies").run();
      res.clearCookie("owner_token", { path: "/", httpOnly: true, sameSite: "lax" });
      res.redirect(303, "/dev");
    });
  }
  app.use((req, res) => res.status(404).send(page(null, "<p>This friend is waiting at the link on your plushie.</p>")));
  app.use((error, req, res, next) => {
    const status = error.status >= 400 && error.status < 500 ? error.status : 500;
    res.status(status).send(page(null, status === 500
      ? "<p>Your friend cannot wake up just yet. Please try again later.</p>"
      : "<p>That request could not be read. Please try again.</p>"));
  });
  return app;
}
