import { timingSafeEqual } from "node:crypto";
import express from "express";
import { hash } from "./secrets.js";

// What the pet page's beacon may report from a real phone, and how much of it the server keeps.
export const DIAG = {
  events: ["error", "console", "gl-lost", "stall", "pet-hidden"],
  batch: 30,
  detail: 300,
  bytes: "64kb",
  keep: 2000,
  read: 500,
  windowMs: 60 * 1000,
  perWindow: 120,
};

const UID = /^[0-9A-F]{14}$/;
const LOAD = /^[0-9a-f]{12}$/;

// One line of plain text: no control characters, so a log line stays one line.
const line = (value, max) => (typeof value === "string"
  ? Array.from(value.replace(/[\s\u0000-\u001f\u007f-\u009f]+/g, " ").trim()).slice(0, max).join("")
  : "");

// A beacon body as stored, or null when it is not one; unknown events are dropped and every text is capped.
function readBatch(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body.events) || typeof body.id !== "string" || !LOAD.test(body.id)) return null;
  const events = body.events.slice(0, DIAG.batch)
    .filter((e) => e && typeof e === "object" && DIAG.events.includes(e.name))
    .map((e) => ({ name: e.name, detail: line(e.detail, DIAG.detail), ms: Number.isFinite(e.ms) && e.ms >= 0 ? Math.round(Math.min(e.ms, 1e10)) : null }));
  return {
    load: body.id,
    uid: typeof body.uid === "string" && UID.test(body.uid) ? body.uid : null,
    context: {
      theme: line(body.theme, 16),
      kind: line(body.kind, 16),
      view: line(body.view, 40),
      fullscreen: body.fullscreen === true,
      visibility: line(body.visibility, 16),
      classes: line(body.classes, 300),
      ua: line(body.ua, 300),
    },
    events,
  };
}

// Render's proxy adds the caller's address last; a local run has no proxy.
const ipOf = (req) => String(req.headers["x-forwarded-for"] || "").split(",").pop().trim() || req.socket.remoteAddress || "";

export function mountDiag(app, { db, key, now }) {
  const spent = new Map();

  // Each address gets so many events a minute, so one runaway page can't push everyone else's rows out.
  function spend(ip, cost, t) {
    const slot = spent.get(ip);
    if (slot && t - slot.at < DIAG.windowMs) {
      if (slot.used + cost > DIAG.perWindow) return false;
      slot.used += cost;
      return true;
    }
    if (spent.size >= 1000) {
      for (const [k, s] of spent) if (t - s.at >= DIAG.windowMs) spent.delete(k);
    }
    spent.set(ip, { at: t, used: cost });
    return cost <= DIAG.perWindow;
  }

  // Any body up to the cap is read as bytes and parsed here; a sendBeacon never reads the answer, so it is always 204.
  app.post("/diag", express.raw({ type: () => true, limit: DIAG.bytes }), (req, res) => {
    try {
      let body = null;
      try {
        body = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "");
      } catch {}
      const batch = readBatch(body);
      const t = now();
      if (batch?.events.length && spend(ipOf(req), batch.events.length, t)) {
        db.transaction(() => {
          const insert = db.prepare("INSERT INTO diag_log (at, load, uid, event, detail, context) VALUES (?, ?, ?, ?, ?, ?)");
          for (const e of batch.events) insert.run(t, batch.load, batch.uid, e.name, e.detail, JSON.stringify({ ms: e.ms, ...batch.context }));
          db.prepare("DELETE FROM diag_log WHERE id NOT IN (SELECT id FROM diag_log ORDER BY id DESC LIMIT ?)").run(DIAG.keep);
        })();
        for (const e of batch.events) console.log(`diag ${e.name} ${batch.uid || "-"} ${batch.load} ${e.ms ?? "-"}ms ${e.detail}`);
      }
    } catch {
      // A bad body or a full disk still gets its 204.
      console.log("diag write failed");
    }
    res.status(204).end();
  }, (error, req, res, next) => res.status(204).end());

  // Without DIAG_KEY there is nothing to read: the request falls through to the page's 404.
  if (!key) return;
  // The key comes as a Bearer header, never in the URL, where access logs and history would keep it.
  app.get("/diag", (req, res) => {
    const given = /^Bearer (.+)$/.exec(req.get("authorization") || "")?.[1] || "";
    if (!timingSafeEqual(Buffer.from(hash(given)), Buffer.from(hash(key)))) return res.status(403).json({ ok: false });
    const { since, uid } = req.query;
    const from = since === undefined ? 0 : typeof since === "string" ? Date.parse(since) : NaN;
    const who = uid === undefined ? null : typeof uid === "string" ? uid.toUpperCase() : "";
    if (Number.isNaN(from) || (who !== null && !UID.test(who))) return res.status(400).json({ ok: false });
    const rows = db.prepare("SELECT * FROM diag_log WHERE at >= ? AND (? IS NULL OR uid = ?) ORDER BY id DESC LIMIT ?").all(from, who, who, DIAG.read);
    res.json({
      ok: true,
      rows: rows.map((r) => ({ id: r.id, at: new Date(r.at).toISOString(), load: r.load, uid: r.uid, event: r.event, detail: r.detail, context: JSON.parse(r.context) })),
    });
  });
}
