export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

export function milestoneLine(count) {
  const n = Number(count);
  if (n === 10) return "벌써 열 번이에요!";
  if (n === 25) return "스물다섯 번이에요!";
  if (n === 50) return "오십 번이에요!";
  if (n === 100) return "백 번 만났어요!";
  if (n > 100 && n % 100 === 0) return `${n}번이에요!`;
  return "";
}

function petMarkup({ waving = false, away = false } = {}) {
  if (away) {
    const awayAlt = "다정한 인형 친구가 등을 보이고 있어요";
    return `<div class="pet pet-away" data-pet="away" role="img" aria-label="${awayAlt}">
      <span class="pet-motion">
        <img class="pet-frame is-show" src="/mascot-duck-away-512.png" width="220" height="220" alt="${awayAlt}" decoding="async">
      </span>
    </div>`;
  }
  const alt = waving ? "다정한 인형 친구가 손을 흔들어요" : "다정한 인형 친구가 방긋 웃어요";
  const enterClass = waving ? " enter" : "";
  return `<div class="pet ${waving ? "waving" : "idle"}${enterClass}" data-pet="alive">
      <button type="button" class="pet-hit" aria-label="${alt}">
        <span class="pet-motion">
          <img class="pet-frame is-show" data-frame="canon" src="/mascot-duck-512.png" width="220" height="220" alt="${alt}" decoding="async">
          <img class="pet-frame" data-frame="blink" src="/mascot-duck-blink-512.png" width="220" height="220" alt="" aria-hidden="true" decoding="async">
          <img class="pet-frame" data-frame="react" src="/mascot-duck-react-512.png" width="220" height="220" alt="" aria-hidden="true" decoding="async">
          <img class="pet-frame" data-frame="sleepy" src="/mascot-duck-sleepy-512.png" width="220" height="220" alt="" aria-hidden="true" decoding="async">
        </span>
      </button>
    </div>`;
}

export function page(row, content, { waving = false, away = false, timeLine = false } = {}) {
  const title = escapeHtml(row?.pet_name || "새 친구");
  const timeEl = timeLine ? `<p class="time-line" data-time-line></p>` : "";
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} | 인형 친구</title>
  <link rel="stylesheet" href="/style.css">
  <script src="/app.js" defer></script>
</head>
<body>
  <main>
    <p class="eyebrow">살포시 전하는 안녕</p>
    <h1>${title}</h1>
    ${timeEl}
    ${petMarkup({ waving, away })}
    ${content}
    <footer>작은 토닥임. 다정한 친구.</footer>
  </main>
</body>
</html>`;
}

export function petPage(row, code = null) {
  const greeting = row.pet_name ? `다시 만나서 반가워요, ${escapeHtml(row.pet_name)}!` : "안녕하세요! 나를 찾아줘서 정말 기뻐요.";
  const recovery = code ? `<aside class="recovery"><h2>우리 안심 코드</h2>
    <p>꼭 적어두세요. 새 폰으로 나를 데려갈 때 꼭 필요해요.</p>
    <strong class="code">${escapeHtml(code)}</strong><p>지금만 볼 수 있어요. 이름을 짓거나 창을 닫기 전에 꼭 챙겨두세요.</p></aside>` : "";
  const prompt = row.pet_name ? "" : `<form action="/name" method="post">
    <input type="hidden" name="uid" value="${escapeHtml(row.uid)}">
    <label for="name">내 이름을 뭐라고 지어줄래요?</label>
    <input id="name" name="name" required maxlength="24" autocomplete="off" placeholder="친구 이름">
    <button type="submit">이 이름으로 지어줄게요!</button>
  </form>`;
  const returning = Boolean(row.pet_name) && !code;
  const mile = returning ? milestoneLine(row.tap_count) : "";
  const mileHtml = mile ? `<p class="milestone">${escapeHtml(mile)}</p>` : "";
  return page(
    row,
    `<p class="intro">${greeting}</p>${recovery}${prompt}<p class="count">우리 ${row.tap_count}번 토닥였어요!</p>${mileHtml}`,
    { waving: Boolean(code), timeLine: true },
  );
}

export function strangerPage(row, message = "") {
  return page(row, `<p class="intro">이 작은 친구는 이미 주인이 있어요.</p>
    ${message ? `<p class="notice" role="alert">${escapeHtml(message)}</p>` : ""}
    <button type="button" id="claim-toggle" aria-expanded="${Boolean(message)}" aria-controls="claim-form">제가 주인이에요</button>
    <form action="/claim" method="post" id="claim-form" ${message ? "" : "hidden"}>
      <input type="hidden" name="uid" value="${escapeHtml(row.uid)}">
      <label for="code">안심 코드</label>
      <input id="code" name="code" required autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="claim-help">
      <p id="claim-help">처음 만났을 때 적어둔 안심 코드를 넣어주세요.</p>
      <button type="submit">내 친구를 데려올래요!</button>
    </form>`, { away: true });
}

export const fakeUids = ["04AAAAAAAAAAA1", "04BBBBBBBBBBB2", "04CCCCCCCCCCC3"];

export function devPage() {
  return page(null, `<p class="intro">연습용 친구들을 만나보세요</p>
    <nav aria-label="연습용 친구들">${fakeUids.map((uid, i) => `<a class="button" href="/t?uid=${uid}">인형 친구 ${String.fromCharCode(65 + i)} <small>${uid}</small></a>`).join("")}</nav>
    <form action="/dev/reset" method="post"><button class="secondary" type="submit">연습용 친구들을 모두 처음으로 돌리기</button></form>`);
}
