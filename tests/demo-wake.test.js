import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db.js";

const A = "04AAAAAAAAAAA1";
const B = "04BBBBBBBBBBB2";

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

async function setup(t, options = {}) {
  const dir = mkdtempSync(join(process.cwd(), ".test-data-"));
  const db = openDatabase(dir);
  const server = createApp({ db, rng: () => 0, demoUids: [], ...options }).listen(0, "localhost");
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
  const hasRow = (uid) => Boolean(db.prepare("SELECT uid FROM plushies WHERE uid = ?").get(uid));
  return { request, hasRow };
}

test("NEW page carries the wake and dialog hooks; owner and stranger pages do not", async (t) => {
  const { request } = await setup(t);
  const jar = {};
  const first = await request(`/t?uid=${A}`, { jar });
  updateJar(jar, first.setCookies);
  assert.match(first.html, /<body[^>]* data-wake>/);
  assert.match(first.html, /<p class="intro">안녕하세요! 찾아와 줘서 정말 기뻐요.<\/p>/);
  assert.match(first.html, /제 이름을 뭐라고 지어 줄래요/);
  const owner = await request(`/t?uid=${A}`, { jar });
  assert.doesNotMatch(owner.html, /data-wake/);
  const stranger = await request(`/t?uid=${A}`);
  assert.match(stranger.html, /이미 주인이 있어요/);
  assert.doesNotMatch(stranger.html, /data-wake/);
});

test("wake hides the form and recovery code only while app.js runs", () => {
  const css = readFileSync(new URL("../public/style.css", import.meta.url), "utf8");
  const hiding = css.match(/^.*body\[data-wake\].*$/gm);
  assert.ok(hiding.length > 5);
  for (const line of hiding) assert.match(line, /^\s*\.has-app body\[data-wake\]/);
  const boot = readFileSync(new URL("../public/mascot-boot.js", import.meta.url), "utf8");
  assert.match(boot, /classList\.add\("has-app"\)/);
  assert.match(boot, /DOMContentLoaded[\s\S]*if \(!root\.hasAttribute\("data-app"\)\) root\.classList\.remove\("has-app"\)/);
  const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(app, /setAttribute\("data-app", ""\);\s*$/);
});

test("demo off: no demo markup and fresh start is not routed", async (t) => {
  const { request, hasRow } = await setup(t);
  const first = await request(`/t?uid=${A}`);
  assert.doesNotMatch(first.html, /data-demo/);
  const res = await request("/demo/fresh-start", { body: { uid: A } });
  assert.equal(res.status, 404);
  assert.ok(hasRow(A));
});

test("demo on: only listed chips get the panel", async (t) => {
  const { request } = await setup(t, { demoUids: [A] });
  const demo = await request(`/t?uid=${A}`);
  assert.match(demo.html, /data-demo-panel/);
  assert.match(demo.html, /<footer data-demo-hold>/);
  assert.match(demo.html, /name="uid" value="04AAAAAAAAAAA1"/);
  const other = await request(`/t?uid=${B}`);
  assert.doesNotMatch(other.html, /data-demo/);
});

test("demo fresh start deletes only that chip and keeps the owner cookie", async (t) => {
  const { request, hasRow } = await setup(t, { demoUids: [A] });
  const jar = {};
  updateJar(jar, (await request(`/t?uid=${A}`, { jar })).setCookies);
  updateJar(jar, (await request(`/t?uid=${B}`, { jar })).setCookies);
  updateJar(jar, (await request("/name", { jar, body: { uid: A, name: "Mochi" } })).setCookies);
  assert.ok(jar.celebrate && jar.pet_skip && jar.owner_token);
  const res = await request("/demo/fresh-start", { jar, body: { uid: A } });
  assert.equal(res.status, 303);
  assert.equal(res.location, `/t?uid=${A}`);
  updateJar(jar, res.setCookies);
  assert.ok(jar.owner_token);
  assert.equal(jar.celebrate, undefined);
  assert.equal(jar.pet_skip, undefined);
  assert.equal(hasRow(A), false);
  assert.ok(hasRow(B));
  const again = await request(`/t?uid=${A}`, { jar });
  assert.match(again.html, /data-wake/);
  assert.match(again.html, /우리 안심 코드/);
  const mine = await request(`/t?uid=${B}`, { jar });
  assert.doesNotMatch(mine.html, /id="claim-form"/);
});

test("wrong recovery code on a demo chip keeps the demo controls", async (t) => {
  const { request } = await setup(t, { demoUids: [A] });
  await request(`/t?uid=${A}`);
  const wrong = await request("/claim", { body: { uid: A, code: "WRONG0" } });
  assert.equal(wrong.status, 403);
  assert.match(wrong.html, /안심 코드가 맞지 않아요/);
  assert.match(wrong.html, /data-demo-panel/);
  assert.match(wrong.html, /<footer data-demo-hold>/);
  await request(`/t?uid=${B}`);
  const other = await request("/claim", { body: { uid: B, code: "WRONG0" } });
  assert.doesNotMatch(other.html, /data-demo/);
});

test("demo fresh start refuses a chip not in the list", async (t) => {
  const { request, hasRow } = await setup(t, { demoUids: [A] });
  await request(`/t?uid=${B}`);
  const res = await request("/demo/fresh-start", { body: { uid: B } });
  assert.equal(res.status, 403);
  assert.ok(hasRow(B));
});

test("DEMO_UIDS env is parsed when no list is passed", async (t) => {
  const before = process.env.DEMO_UIDS;
  process.env.DEMO_UIDS = ` ${A.toLowerCase()} , nope`;
  t.after(() => {
    if (before === undefined) delete process.env.DEMO_UIDS;
    else process.env.DEMO_UIDS = before;
  });
  const { request } = await setup(t, { demoUids: undefined });
  const demo = await request(`/t?uid=${A}`);
  assert.match(demo.html, /data-demo-panel/);
});
