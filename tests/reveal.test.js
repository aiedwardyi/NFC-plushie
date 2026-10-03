import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";

const A = "04AAAAAAAAAAA1";
const B = "04BBBBBBBBBBB2";
// 01:30 on 3 Oct in Seoul, still 2 Oct in UTC.
const MET = Date.parse("2026-10-02T16:30:00.000Z");

function updateJar(jar, setCookies) {
  for (const sc of setCookies || []) {
    const m = /^([^=]+)=([^;]*)/.exec(sc);
    if (!m) continue;
    if (m[2] === "" || /Max-Age=0/i.test(sc) || /Expires=Thu, 01 Jan 1970/i.test(sc)) delete jar[m[1]];
    else jar[m[1]] = m[2];
  }
}

async function setup(t, options = {}) {
  const dir = mkdtempSync(join(process.cwd(), ".test-data-"));
  const db = openDatabase(dir);
  const server = createApp({ db, rng: () => 0, now: () => MET, demoUids: [A], ...options }).listen(0, "localhost");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    db.close();
    assert.equal(dirname(dir), process.cwd());
    rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://localhost:${server.address().port}`;
  async function request(path, { jar, body, headers = {} } = {}) {
    const pair = Object.entries(jar || {}).map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await fetch(`${base}${path}`, {
      method: body ? "POST" : "GET",
      redirect: "manual",
      headers: { ...headers, ...(pair ? { Cookie: pair } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const setCookies = res.headers.getSetCookie();
    updateJar(jar || {}, setCookies);
    return { status: res.status, headers: res.headers, html: await res.text() };
  }
  return { request };
}

async function namedChip(request, uid) {
  const jar = {};
  await request(`/t?uid=${uid}`, { jar });
  await request("/name", { jar, body: { uid, name: "구름이" } });
  return jar;
}

test("named demo chip offers the reveal replay with the Seoul first-meet day", async (t) => {
  const { request } = await setup(t);
  const jar = await namedChip(request, A);
  const home = await request(`/t?uid=${A}`, { jar });
  assert.match(home.html, /<button type="button" data-reveal-replay data-met="2026-10-03">영상 다시 보기<\/button>/);
});

test("unnamed demo chip and non-demo chips get no reveal replay", async (t) => {
  const { request } = await setup(t);
  const fresh = await request(`/t?uid=${A}`, { jar: {} });
  assert.match(fresh.html, /data-demo-panel/);
  assert.doesNotMatch(fresh.html, /data-reveal-replay/);
  const jar = await namedChip(request, B);
  const other = await request(`/t?uid=${B}`, { jar });
  assert.match(other.html, /만나서 반가워요, 구름이!/);
  assert.doesNotMatch(other.html, /data-reveal-replay/);
});

test("name form still posts natively for the no-script path", async (t) => {
  const { request } = await setup(t);
  const fresh = await request(`/t?uid=${A}`, { jar: {} });
  assert.match(fresh.html, /<form action="\/name" method="post" class="name-form"[^>]*>/);
});

test("first reveal uses the stored Seoul first-meet day, not the naming day", async (t) => {
  const { request } = await setup(t);
  const fresh = await request(`/t?uid=${A}`, { jar: {} });
  assert.match(fresh.html, /<form action="\/name" method="post" class="name-form" data-met="2026-10-03">/);
});

for (const kind of ["horse", "sheep"]) {
  test(`diamond ${kind} video is served with range support`, async (t) => {
    const { request } = await setup(t);
    const res = await request(`/reveal/diamond-${kind}.mp4`, { headers: { Range: "bytes=0-99" } });
    assert.equal(res.status, 206);
    assert.equal(res.headers.get("content-type"), "video/mp4");
    assert.equal(res.headers.get("content-length"), "100");
    assert.equal(res.headers.get("cache-control"), "public, max-age=86400");
  });
}
