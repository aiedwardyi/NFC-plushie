import Anthropic from "@anthropic-ai/sdk";

// Everything provider-specific lives here; callers see plain { ok, text, sources, stop, usage, ms } and { ok, changes } shapes.

export const MODELS = {
  "claude-haiku-4-5": { input: 1, output: 5, params: {} },
  "claude-sonnet-5-5": { input: 2, output: 10, params: { thinking: { type: "between_tools" }, output_config: { effort: "low" } } },
};
export const NOTEBOOK_MODEL = "claude-haiku-4-5";
export const SEARCH_USD = 0.01;
const REPLY_TOKENS = 300;
const NOTEBOOK_TOKENS = 1024;
const SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 2,
  user_location: { type: "approximate", city: "Seoul", region: "Seoul", country: "KR", timezone: "Asia/Seoul" },
};

export function costOf(model, usage) {
  const price = MODELS[model] || MODELS[NOTEBOOK_MODEL];
  return (usage.input * price.input + usage.output * price.output) / 1e6 + usage.searches * SEARCH_USD;
}

function usageOf(u) {
  return {
    input: (u?.input_tokens || 0) + (u?.cache_creation_input_tokens || 0) + (u?.cache_read_input_tokens || 0),
    output: u?.output_tokens || 0,
    searches: u?.server_tool_use?.web_search_requests || 0,
  };
}

const addUsage = (a, b) => ({ input: a.input + b.input, output: a.output + b.output, searches: a.searches + b.searches });
const ZERO = { input: 0, output: 0, searches: 0 };

const httpUrl = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch {
    return "";
  }
};

// The model is told not to, but a stray link or markdown must never reach the speech line.
function clean(text) {
  return text
    .replace(/\[([^\]]*)\]\((?:https?:)?[^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

// Cut at the last finished sentence; "" when there is none.
export function lastSentence(text) {
  const m = /^[\s\S]*[.!?…~](?=["'”’)\s]|$)["'”’)]?/.exec(text.trim());
  return m ? m[0].trim() : "";
}

// Text after the last search result is the answer; anything before it is preamble.
export function readReply(content, stop) {
  if (stop === "refusal") return { ok: false, stop, text: "", sources: [] };
  if (stop !== "end_turn" && stop !== "max_tokens") return { ok: false, stop, text: "", sources: [] };
  const last = content.map((b) => b.type).lastIndexOf("web_search_tool_result");
  const blocks = content.slice(last + 1).filter((b) => b.type === "text");
  let text = clean(blocks.map((b) => b.text).join(""));
  if (stop === "max_tokens") text = lastSentence(text);
  if (!text) return { ok: false, stop, text: "", sources: [] };
  const sources = [];
  if (last >= 0) {
    for (const c of blocks.flatMap((b) => b.citations || [])) {
      const url = c.type === "web_search_result_location" ? httpUrl(c.url) : "";
      if (url && !sources.some((s) => s.url === url)) sources.push({ title: String(c.title || ""), url });
    }
  }
  return { ok: true, stop, text, sources: sources.slice(0, 2) };
}

export function readNotebook(response) {
  if (response.stop_reason !== "end_turn") return { ok: false, stop: response.stop_reason, changes: null };
  try {
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    return { ok: true, stop: response.stop_reason, changes: JSON.parse(text) };
  } catch {
    return { ok: false, stop: "bad_json", changes: null };
  }
}

const NOTEBOOK_SCHEMA = {
  type: "object",
  properties: {
    add: { type: "array", items: { type: "string" } },
    drop: { type: "array", items: { type: "integer" } },
    plans: {
      type: "array",
      items: {
        type: "object",
        properties: { ask_on: { type: "string", format: "date" }, question: { type: "string" } },
        required: ["ask_on", "question"],
        additionalProperties: false,
      },
    },
  },
  required: ["add", "drop", "plans"],
  additionalProperties: false,
};

const failure = (error) => (error instanceof Anthropic.APIUserAbortError ? "timeout" : error instanceof Anthropic.APIError ? `api_${error.status ?? "conn"}` : "error");

export function anthropicTalk({ apiKey, model, Client = Anthropic }) {
  const client = new Client({ apiKey, maxRetries: 0 });
  const params = MODELS[model].params;
  return {
    model,
    async reply({ system, messages, signal }) {
      const started = performance.now();
      const body = { model, max_tokens: REPLY_TOKENS, system, messages, tools: [SEARCH_TOOL], ...params };
      let usage = ZERO;
      let calls = 1;
      try {
        const first = await client.messages.create(body, { signal });
        usage = usageOf(first.usage);
        let content = first.content;
        let stop = first.stop_reason;
        if (stop === "pause_turn") {
          calls = 2;
          const next = await client.messages.create({ ...body, messages: [...messages, { role: "assistant", content: first.content }] }, { signal });
          usage = addUsage(usage, usageOf(next.usage));
          content = [...content, ...next.content];
          stop = next.stop_reason;
        }
        return { ...readReply(content, stop), usage, calls, ms: Math.round(performance.now() - started) };
      } catch (error) {
        return { ok: false, stop: failure(error), text: "", sources: [], usage, calls, ms: Math.round(performance.now() - started) };
      }
    },
    async notebook({ system, prompt, signal }) {
      const started = performance.now();
      try {
        const res = await client.messages.create({
          model: NOTEBOOK_MODEL,
          max_tokens: NOTEBOOK_TOKENS,
          system,
          messages: [{ role: "user", content: prompt }],
          output_config: { format: { type: "json_schema", schema: NOTEBOOK_SCHEMA } },
        }, { signal });
        return { ...readNotebook(res), usage: usageOf(res.usage), ms: Math.round(performance.now() - started) };
      } catch (error) {
        return { ok: false, stop: failure(error), changes: null, usage: ZERO, ms: Math.round(performance.now() - started) };
      }
    },
  };
}

const wait = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => {
    clearTimeout(timer);
    reject(new Error("aborted"));
  }, { once: true });
});

const FAKE_LONG = "오늘은 하늘이 정말 맑아서 기분이 좋아요! 창밖에서 새들이 노래하는 소리가 들려서 저도 같이 흥얼흥얼 따라 불렀어요. 우리 이따가 같이 산책 가는 상상을 해 볼까요? 저는 벌써 신나요!";

// Canned lines for browser checks; a keyword picks the case.
export function fakeTalk({ delayMs = 600 } = {}) {
  const usage = { input: 0, output: 0, searches: 0 };
  return {
    model: "fake",
    async reply({ messages, signal }) {
      const said = String(messages.at(-1)?.content || "");
      const started = performance.now();
      const done = (out) => ({ ok: true, sources: [], usage, ms: Math.round(performance.now() - started), stop: "end_turn", ...out });
      try {
        await wait(/느리게/.test(said) ? 6000 : delayMs, signal);
      } catch {
        return done({ ok: false, stop: "timeout", text: "" });
      }
      if (/에러/.test(said)) return done({ ok: false, stop: "api_500", text: "" });
      if (/거절/.test(said)) return done({ ok: false, stop: "refusal", text: "" });
      if (/날씨/.test(said)) {
        return done({ text: "오늘 서울은 맑고 조금 쌀쌀해요. 겉옷 꼭 챙겨요!", usage: { ...usage, searches: 1 }, sources: [
          { title: "서울 날씨", url: "https://www.weather.example.kr/seoul" },
          { title: "기상 뉴스", url: "https://news.example.com/today" },
        ] });
      }
      if (/길게/.test(said)) return done({ text: FAKE_LONG });
      if (/img|<|>/.test(said)) return done({ text: `${said} 라고 했어요?` });
      if (/\?|뭐|어때/.test(said)) return done({ text: "음, 저는 토닥토닥이 제일 좋아요. 당신은요?" });
      return done({ text: "우와, 그랬어요? 이야기해 줘서 고마워요!" });
    },
    async notebook({ prompt }) {
      const today = /Today: (\d{4}-\d{2}-\d{2})/.exec(prompt)?.[1];
      const said = /Owner: (.*)/.exec(prompt)?.[1] || "";
      const changes = { add: [], drop: [], plans: [] };
      if (/좋아/.test(said)) changes.add.push("딸기를 좋아함");
      if (/시험/.test(said) && today) {
        const next = new Date(Date.parse(`${today}T00:00:00Z`) + 2 * 86400000).toISOString().slice(0, 10);
        changes.plans.push({ ask_on: next, question: "시험 잘 봤어요?" });
      }
      return { ok: true, stop: "end_turn", changes, usage, ms: 1 };
    },
  };
}

// null keeps talk off: no mic, no route, the page as it was.
export function talkFromEnv(env, production, { Client = Anthropic } = {}) {
  const uids = String(env.TALK_UIDS || "").split(",").map((s) => s.trim().toUpperCase()).filter((s) => /^[0-9A-F]{14}$/.test(s));
  if (!uids.length) return null;
  if (!production && env.TALK_FAKE === "1") {
    const ms = Number.parseInt(env.TALK_FAKE_MS, 10);
    return { provider: fakeTalk({ delayMs: ms >= 0 ? ms : 600 }), uids };
  }
  const model = env.TALK_MODEL || "claude-haiku-4-5";
  if (!env.ANTHROPIC_API_KEY || !MODELS[model]) return null;
  return { provider: anthropicTalk({ apiKey: env.ANTHROPIC_API_KEY, model, Client }), uids };
}
