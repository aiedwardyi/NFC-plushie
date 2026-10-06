import assert from "node:assert/strict";
import test from "node:test";
import { anthropicTalk, costOf, lastSentence, readReply, talkFromEnv } from "../src/talk.js";

const usage = (input = 900, output = 40, searches = 0) => ({
  input_tokens: input, output_tokens: output, cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
  ...(searches ? { server_tool_use: { web_search_requests: searches, web_fetch_requests: 0 } } : {}),
});
const msg = (content, stop_reason = "end_turn", u = usage()) => ({ id: "msg_x", type: "message", role: "assistant", content, stop_reason, usage: u });
const text = (t, citations) => ({ type: "text", text: t, ...(citations ? { citations } : {}) });
const thinking = { type: "thinking", thinking: "", signature: "sig" };
const searchUse = (id) => ({ type: "server_tool_use", id, name: "web_search", input: { query: "서울 날씨" } });
const searchResult = (id, content) => ({ type: "web_search_tool_result", tool_use_id: id, content });
const hit = (url, title) => ({ type: "web_search_result", url, title, encrypted_content: "e", page_age: null });
const cite = (url, title) => ({ type: "web_search_result_location", url, title, cited_text: "맑음", encrypted_index: "i" });
const routeUse = (id) => ({ type: "tool_use", id, name: "transit_route", input: { from: "암사역", to: "강남역" } });
const MAP = { title: "카카오맵 길찾기", url: "https://map.kakao.com/link/by/traffic/a/b" };

function transitStub(outs) {
  const asked = [];
  return { asked, route: async (q) => (asked.push(q), outs.shift()) };
}

// A client that answers from a script and keeps every request.
function scripted(responses) {
  const calls = [];
  let built = 0;
  class Client {
    constructor(options) {
      built += 1;
      this.options = options;
      this.messages = {
        create: async (body, opts) => {
          calls.push({ body: structuredClone(body), opts });
          const next = responses.shift();
          if (next instanceof Error) throw next;
          return next;
        },
      };
    }
  }
  return { Client, calls, built: () => built };
}

const ASK = { system: "persona", messages: [{ role: "user", content: "안녕?" }] };

for (const model of ["claude-haiku-4-5", "claude-sonnet-5-5"]) {
  const sonnet = model === "claude-sonnet-5-5";
  const lead = sonnet ? [thinking] : [];

  test(`${model}: request shape`, async () => {
    const s = scripted([msg([...lead, text("안녕하세요!")])]);
    const talk = anthropicTalk({ apiKey: "k", model, Client: s.Client });
    const signal = AbortSignal.timeout(20000);
    const out = await talk.reply({ ...ASK, signal });
    assert.equal(out.ok, true);
    const { body, opts } = s.calls[0];
    assert.equal(opts.signal, signal);
    assert.equal(body.model, model);
    assert.equal(body.max_tokens, 300);
    assert.deepEqual(body.tools, [{ type: "web_search_20250305", name: "web_search", max_uses: 2, user_location: { type: "approximate", city: "Seoul", region: "Seoul", country: "KR", timezone: "Asia/Seoul" } }]);
    assert.equal(body.tool_choice, undefined);
    assert.equal(body.temperature, undefined);
    if (sonnet) {
      assert.deepEqual(body.thinking, { type: "between_tools" });
      assert.deepEqual(body.output_config, { effort: "low" });
    } else {
      assert.equal(body.thinking, undefined);
      assert.equal(body.output_config, undefined);
    }
  });

  test(`${model}: plain reply`, async () => {
    const s = scripted([msg([...lead, text("안녕하세요! 오늘도 반가워요.")], "end_turn", usage(1000, 30))]);
    const out = await anthropicTalk({ apiKey: "k", model, Client: s.Client }).reply(ASK);
    assert.equal(out.text, "안녕하세요! 오늘도 반가워요.");
    assert.deepEqual(out.sources, []);
    assert.deepEqual(out.usage, { input: 1000, output: 30, searches: 0 });
    assert.equal(out.stop, "end_turn");
    assert.equal(typeof out.ms, "number");
  });

  test(`${model}: search with citations feeds 출처, preamble is not shown`, async () => {
    const s = scripted([msg([
      ...lead,
      text("날씨를 찾아볼게요."),
      searchUse("s1"),
      searchResult("s1", [hit("https://www.weather.example.kr/seoul", "서울 날씨"), hit("https://news.example.com/a", "뉴스")]),
      ...lead,
      text("오늘 서울은 ", null),
      text("맑고 쌀쌀해요", [cite("https://www.weather.example.kr/seoul", "서울 날씨"), cite("https://www.weather.example.kr/seoul", "서울 날씨")]),
      text(". 겉옷 챙겨요!", [cite("https://news.example.com/a", "뉴스"), cite("https://third.example.org/x", "셋째")]),
    ], "end_turn", usage(3000, 60, 1))]);
    const out = await anthropicTalk({ apiKey: "k", model, Client: s.Client }).reply(ASK);
    assert.equal(out.text, "오늘 서울은 맑고 쌀쌀해요. 겉옷 챙겨요!");
    assert.deepEqual(out.sources, [
      { title: "서울 날씨", url: "https://www.weather.example.kr/seoul" },
      { title: "뉴스", url: "https://news.example.com/a" },
    ]);
    assert.equal(out.usage.searches, 1);
  });

  test(`${model}: a pause continues once with the response as received`, async () => {
    const paused = msg([...lead, text("찾아볼게요."), searchUse("s1")], "pause_turn", usage(500, 20, 1));
    const s = scripted([paused, msg([searchResult("s1", [hit("https://a.example.com/", "A")]), text("맑아요!", [cite("https://a.example.com/", "A")])], "end_turn", usage(800, 10, 0))]);
    const out = await anthropicTalk({ apiKey: "k", model, Client: s.Client }).reply(ASK);
    assert.equal(out.ok, true);
    assert.equal(out.text, "맑아요!");
    assert.deepEqual(out.usage, { input: 1300, output: 30, searches: 1 });
    assert.equal(s.calls.length, 2);
    assert.equal(out.calls, 2);
    const [first, second] = s.calls.map((c) => c.body);
    assert.deepEqual(second.messages, [...ASK.messages, { role: "assistant", content: paused.content }]);
    assert.deepEqual({ ...second, messages: null }, { ...first, messages: null });
  });

  test(`${model}: a route question runs the tool, answers after it and links the map`, async () => {
    const used = msg([...lead, text("찾아볼게요."), routeUse("r1")], "tool_use", usage(900, 30));
    const s = scripted([used, msg([...lead, text("8호선 타고 잠실에서 2호선으로 갈아타요!")], "end_turn", usage(1200, 20))]);
    const transit = transitStub([{ ok: true, text: "1) 지하철 25분", link: MAP }]);
    const signal = AbortSignal.timeout(20000);
    const out = await anthropicTalk({ apiKey: "k", model, Client: s.Client, transit }).reply({ ...ASK, signal });
    assert.equal(out.text, "8호선 타고 잠실에서 2호선으로 갈아타요!");
    assert.deepEqual(out.sources, [MAP]);
    assert.deepEqual(out.usage, { input: 2100, output: 50, searches: 0 });
    assert.equal(out.calls, 2);
    assert.deepEqual(transit.asked, [{ from: "암사역", to: "강남역", signal }]);
    const [first, second] = s.calls.map((c) => c.body);
    assert.deepEqual(first.tools.map((t) => t.name), ["web_search", "transit_route"]);
    assert.deepEqual(second.messages, [
      ...ASK.messages,
      { role: "assistant", content: used.content },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "r1", content: "1) 지하철 25분" }] },
    ]);
  });

  test(`${model}: paused twice is a failure`, async () => {
    const s = scripted([msg([searchUse("s1")], "pause_turn"), msg([searchUse("s2")], "pause_turn")]);
    const out = await anthropicTalk({ apiKey: "k", model, Client: s.Client }).reply(ASK);
    assert.equal(out.ok, false);
    assert.equal(out.stop, "pause_turn");
    assert.equal(s.calls.length, 2);
  });

  test(`${model}: refusal`, async () => {
    const s = scripted([msg([], "refusal")]);
    const out = await anthropicTalk({ apiKey: "k", model, Client: s.Client }).reply(ASK);
    assert.deepEqual([out.ok, out.stop], [false, "refusal"]);
  });

  test(`${model}: max_tokens keeps the last whole sentence`, async () => {
    const s = scripted([msg([...lead, text("좋아요! 그런데 오늘은 정말로 하고 싶은 말이 많")], "max_tokens")]);
    const out = await anthropicTalk({ apiKey: "k", model, Client: s.Client }).reply(ASK);
    assert.deepEqual([out.ok, out.text], [true, "좋아요!"]);
    const none = await anthropicTalk({ apiKey: "k", model, Client: scripted([msg([text("하고 싶은 말이 많")], "max_tokens")]).Client }).reply(ASK);
    assert.equal(none.ok, false);
  });

  test(`${model}: a search error block is not a failure by itself`, async () => {
    const s = scripted([msg([...lead, searchUse("s1"), searchResult("s1", { type: "web_search_tool_result_error", error_code: "unavailable" }), text("지금은 잘 모르겠어요.")], "end_turn", usage(900, 20, 1))]);
    const out = await anthropicTalk({ apiKey: "k", model, Client: s.Client }).reply(ASK);
    assert.deepEqual([out.ok, out.text, out.sources], [true, "지금은 잘 모르겠어요.", []]);
  });

  test(`${model}: empty text is a failure`, async () => {
    const s = scripted([msg([...lead, text("  ")])]);
    const out = await anthropicTalk({ apiKey: "k", model, Client: s.Client }).reply(ASK);
    assert.deepEqual([out.ok, out.stop], [false, "end_turn"]);
  });
}

test("API errors and the deadline come back as plain failures", async () => {
  const s = scripted([new Error("boom")]);
  const out = await anthropicTalk({ apiKey: "k", model: "claude-haiku-4-5", Client: s.Client }).reply(ASK);
  assert.deepEqual([out.ok, out.stop], [false, "error"]);
});

test("the client never retries", () => {
  let options = null;
  class Client {
    constructor(o) {
      options = o;
    }
  }
  anthropicTalk({ apiKey: "k", model: "claude-haiku-4-5", Client });
  assert.equal(options.maxRetries, 0);
});

test("a failed route goes back marked as an error and the answer still comes through", async () => {
  const s = scripted([msg([routeUse("r1")], "tool_use"), msg([text("지금은 길을 못 찾겠어요.")])]);
  const transit = transitStub([{ ok: false, text: "길찾기가 지금 대답하지 않아요." }]);
  const out = await anthropicTalk({ apiKey: "k", model: "claude-haiku-4-5", Client: s.Client, transit }).reply(ASK);
  assert.deepEqual([out.ok, out.text, out.sources], [true, "지금은 길을 못 찾겠어요.", []]);
  assert.deepEqual(s.calls[1].body.messages.at(-1).content, [{ type: "tool_result", tool_use_id: "r1", content: "길찾기가 지금 대답하지 않아요.", is_error: true }]);
});

test("route calls stop after two rounds", async () => {
  const s = scripted([msg([routeUse("r1")], "tool_use"), msg([routeUse("r2")], "tool_use"), msg([routeUse("r3")], "tool_use")]);
  const transit = transitStub([{ ok: true, text: "a", link: MAP }, { ok: true, text: "b", link: MAP }]);
  const out = await anthropicTalk({ apiKey: "k", model: "claude-haiku-4-5", Client: s.Client, transit }).reply(ASK);
  assert.deepEqual([out.ok, out.stop, out.calls, transit.asked.length], [false, "tool_use", 3, 2]);
});

test("the route tool is offered only with a Kakao key", async () => {
  for (const [env, tools] of [[{}, ["web_search"]], [{ KAKAO_REST_KEY: "rest" }, ["web_search", "transit_route"]]]) {
    const s = scripted([msg([text("안녕하세요!")])]);
    await talkFromEnv({ ANTHROPIC_API_KEY: "k", TALK_UIDS: "04AAAAAAAAAAA1", ...env }, true, { Client: s.Client }).provider.reply(ASK);
    assert.deepEqual(s.calls[0].body.tools.map((t) => t.name), tools);
  }
});

test("links, markdown and non-http citations never reach the line", () => {
  const out = readReply([
    searchResult("s1", []),
    text("[여기](https://x.example.com) 보면 **맑아요** https://y.example.com 정말요!", [cite("javascript:alert(1)", "x"), cite("ftp://f.example.com", "f")]),
  ], "end_turn");
  assert.equal(out.text, "여기 보면 맑아요 정말요!");
  assert.deepEqual(out.sources, []);
});

test("lastSentence", () => {
  assert.equal(lastSentence("안녕! 반가워요. 그런데"), "안녕! 반가워요.");
  assert.equal(lastSentence("반가워요~ 우리"), "반가워요~");
  assert.equal(lastSentence("끝이 없"), "");
});

test("notebook call: Haiku, no tools, JSON schema, 1024 tokens", async () => {
  for (const model of ["claude-haiku-4-5", "claude-sonnet-5-5"]) {
    const s = scripted([msg([text('{"add":["딸기를 좋아함"],"drop":[],"plans":[]}')], "end_turn", usage(700, 20))]);
    const out = await anthropicTalk({ apiKey: "k", model, Client: s.Client }).notebook({ system: "sys", prompt: "p" });
    assert.deepEqual(out.changes, { add: ["딸기를 좋아함"], drop: [], plans: [] });
    const { body } = s.calls[0];
    assert.equal(body.model, "claude-haiku-4-5");
    assert.equal(body.max_tokens, 1024);
    assert.equal(body.tools, undefined);
    assert.equal(body.thinking, undefined);
    assert.equal(body.output_config.format.type, "json_schema");
    assert.equal(JSON.stringify(body.output_config.format.schema).includes("maxLength"), false);
  }
});

test("notebook call: refusal, max_tokens and bad JSON change nothing", async () => {
  for (const res of [msg([], "refusal"), msg([text('{"add":["')], "max_tokens"), msg([text("not json")])]) {
    const out = await anthropicTalk({ apiKey: "k", model: "claude-haiku-4-5", Client: scripted([res]).Client }).notebook({ system: "s", prompt: "p" });
    assert.equal(out.ok, false);
    assert.equal(out.changes, null);
  }
});

test("cost at list price plus searches", () => {
  assert.equal(costOf("claude-haiku-4-5", { input: 1e6, output: 1e6, searches: 0 }), 6);
  assert.equal(costOf("claude-sonnet-5-5", { input: 1e6, output: 1e6, searches: 2 }), 12.02);
});

test("gate: talk is off unless configured", () => {
  const s = scripted([]);
  const opts = { Client: s.Client };
  const uids = "04AAAAAAAAAAA1";
  assert.equal(talkFromEnv({}, true, opts), null);
  assert.equal(talkFromEnv({ ANTHROPIC_API_KEY: "k" }, true, opts), null);
  assert.equal(talkFromEnv({ ANTHROPIC_API_KEY: "k", TALK_UIDS: " , zz" }, true, opts), null);
  assert.equal(talkFromEnv({ TALK_UIDS: uids }, true, opts), null);
  assert.equal(talkFromEnv({ ANTHROPIC_API_KEY: "k", TALK_UIDS: uids, TALK_MODEL: "gpt" }, true, opts), null);
  assert.equal(s.built(), 0);
  const on = talkFromEnv({ ANTHROPIC_API_KEY: "k", TALK_UIDS: `${uids}, 04bbbbbbbbbbb2` }, true, opts);
  assert.deepEqual(on.uids, [uids, "04BBBBBBBBBBB2"]);
  assert.equal(on.provider.model, "claude-haiku-4-5");
  assert.equal(s.built(), 1);
});

test("gate: TALK_FAKE is ignored in production and never builds the SDK client", () => {
  const s = scripted([]);
  const opts = { Client: s.Client };
  const env = { TALK_FAKE: "1", TALK_UIDS: "04AAAAAAAAAAA1" };
  assert.equal(talkFromEnv(env, true, opts), null);
  const real = talkFromEnv({ ...env, ANTHROPIC_API_KEY: "k" }, true, opts);
  assert.equal(real.provider.model, "claude-haiku-4-5");
  assert.equal(s.built(), 1);
  const fake = talkFromEnv({ ...env, ANTHROPIC_API_KEY: "k", TALK_MODEL: "claude-sonnet-5-5" }, false, opts);
  assert.equal(fake.provider.model, "fake");
  assert.equal(talkFromEnv(env, false, opts).provider.model, "fake");
  assert.equal(s.built(), 1);
  assert.equal(talkFromEnv({ ...env, TALK_FAKE: "" }, false, opts), null);
});
