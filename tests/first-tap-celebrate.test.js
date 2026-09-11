import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";

const A = "04AAAAAAAAAAA1";

function updateJar(jar, setCookies) {
  for (const sc of setCookies || []) {
    const m = /^([^=]+)=([^;]*)/.exec(sc);
    if (!m) continue;
    const k = m[1].trim();
    const v = m[2].trim();
    if (v === "" || /Expires=Thu, 01 Jan 1970/i.test(sc) || /Max-Age=0/i.test(sc)) delete jar[k];
    else jar[k] = v;
  }
}

async function setup(t) {
  const dir = mkdtempSync(join(process.cwd(), ".test-data-"));
  const db = openDatabase(dir);
  let time = Date.parse("2026-05-01T00:00:00+09:00");
  const server = createApp({ db, now: () => time, rng: () => 0 }).listen(0, "localhost");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    db.close();
    assert.equal(dirname(dir), process.cwd());
    rmSync(dir, { recursive: true, force: true });
  });
  async function request(path, { jar, body } = {}) {
    const headers = {};
    if (jar) {
      const pair = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
      if (pair) headers.Cookie = pair;
    }
    if (body) headers["Content-Type"] = "application/json";
    const res = await fetch(`http://localhost:${server.address().port}${path}`, {
      method: body ? "POST" : "GET",
      redirect: "manual",
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    return { status: res.status, html: await res.text(), setCookies, location: res.headers.get("location") };
  }
  return { request, db };
}

test("NEW claim render carries the big claim celebrate marker", async (t) => {
  const { request } = await setup(t);
  const jar = {};
  const first = await request(`/t?uid=${A}`, { jar });
  updateJar(jar, first.setCookies);
  assert.match(first.html, /data-celebrate="claim"/);
  assert.match(first.html, /우리 안심 코드/);
  assert.match(first.html, /제 이름을 뭐라고 지어 줄래요/);
  assert.doesNotMatch(first.html, /data-tap-count/);
});

test("unnamed OWNER reload does not re-fire claim celebrate", async (t) => {
  const { request } = await setup(t);
  const jar = {};
  const first = await request(`/t?uid=${A}`, { jar });
  updateJar(jar, first.setCookies);
  assert.match(first.html, /data-celebrate="claim"/);
  const reload = await request(`/t?uid=${A}`, { jar });
  updateJar(jar, reload.setCookies);
  assert.doesNotMatch(reload.html, /data-celebrate/);
  assert.match(reload.html, /제 이름을 뭐라고 지어 줄래요/);
});

test("first naming sets a gentler named celebrate, not claim again", async (t) => {
  const { request } = await setup(t);
  const jar = {};
  const first = await request(`/t?uid=${A}`, { jar });
  updateJar(jar, first.setCookies);
  const named = await request("/name", { jar, body: { uid: A, name: "Mochi" } });
  assert.equal(named.status, 303);
  assert.match(named.setCookies.join("\n"), /celebrate=named/);
  assert.doesNotMatch(named.setCookies.join("\n"), /celebrate=claim/);
  updateJar(jar, named.setCookies);
  const skip = await request(`/t?uid=${A}`, { jar });
  assert.match(skip.html, /data-celebrate="named"/);
  assert.match(skip.html, /만나서 반가워요, Mochi!/);
  assert.doesNotMatch(skip.html, /다시 만나서 반가워요/);
  assert.doesNotMatch(skip.html, /data-celebrate="claim"/);
});

test("client claim path stays loud; named uses milestone-size burst; claim is once-only", async (t) => {
  const client = readFileSync(new URL("../public/app.js", import.meta.url), "utf-8");
  const claim = client.match(/if \(kind === "claim"\) \{[\s\S]*?\n  \}/);
  assert.ok(claim, "claim handler exists");
  assert.match(claim[0], /burstConfetti\(\{ mode: "claim" \}\)/);
  assert.match(claim[0], /sessionStorage|hasClaimSeen|claim-seen/);
  assert.match(client, /pageshow/);
  assert.match(client, /persisted/);
  const named = client.match(/if \(kind === "named"\) \{[\s\S]*?\n  \}/);
  assert.ok(named, "named handler exists");
  assert.match(named[0], /mode: "milestone"/);
  assert.doesNotMatch(named[0], /mode: "claim"/);
});
