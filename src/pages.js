export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

export function page(row, content, waving = false) {
  const title = escapeHtml(row?.pet_name || "새 친구");
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
    <div class="pet ${waving ? "waving" : "idle"}" role="img" aria-label="${waving ? "다정한 인형 친구가 손을 흔들어요" : "다정한 인형 친구가 방긋 웃어요"}">
      <div class="arm"></div><div class="blob"><span class="eyes"></span><span class="smile"></span></div>
    </div>
    ${content}
    <footer>작은 토닥임. 다정한 친구.</footer>
  </main>
</body>
</html>`;
}

export function petPage(row, code = null) {
  const greeting = row.pet_name ? `다시 만나서 반가워요, ${escapeHtml(row.pet_name)}!` : "안녕하세요! 날 찾아줘서 정말 기뻐요.";
  const recovery = code ? `<aside class="recovery"><h2>우리 안심 코드</h2>
    <p>꼭 적어두세요. 새 폰으로 나를 데려갈 때 꼭 필요해요.</p>
    <strong class="code">${escapeHtml(code)}</strong><p>지금만 볼 수 있어요. 이름을 짓거나 창을 닫기 전에 꼭 챙겨두세요.</p></aside>` : "";
  const prompt = row.pet_name ? "" : `<form action="/name" method="post">
    <input type="hidden" name="uid" value="${escapeHtml(row.uid)}">
    <label for="name">내 이름을 뭐라고 지어줄래요?</label>
    <input id="name" name="name" required maxlength="24" autocomplete="off" placeholder="친구 이름">
    <button type="submit">이 이름으로 지어줄게요!</button>
  </form>`;
  return page(row, `<p class="intro">${greeting}</p>${recovery}${prompt}<p class="count">우리 ${row.tap_count}번 토닥였어요!</p>`, Boolean(code));
}

export function strangerPage(row, message = "") {
  return page(row, `<p class="intro">이 작은 친구는 이미 주인이 있어요.</p>
    ${message ? `<p class="notice" role="alert">${escapeHtml(message)}</p>` : ""}
    <button type="button" id="claim-toggle" aria-expanded="${Boolean(message)}" aria-controls="claim-form">제가 주인이에요</button>
    <form action="/claim" method="post" id="claim-form" ${message ? "" : "hidden"}>
      <input type="hidden" name="uid" value="${escapeHtml(row.uid)}">
      <label for="code">우리 안심 코드</label>
      <input id="code" name="code" required autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="claim-help">
      <p id="claim-help">처음 만났을 때 적어둔 코드를 넣어주세요.</p>
      <button type="submit">내 친구 데려올래요!</button>
    </form>`);
}

export const fakeUids = ["04AAAAAAAAAAA1", "04BBBBBBBBBBB2", "04CCCCCCCCCCC3"];

export function devPage() {
  return page(null, `<p class="intro">연습용 친구들을 만나보세요</p>
    <nav aria-label="연습용 친구들">${fakeUids.map((uid, i) => `<a class="button" href="/t?uid=${uid}">인형 친구 ${String.fromCharCode(65 + i)} <small>${uid}</small></a>`).join("")}</nav>
    <form action="/dev/reset" method="post"><button class="secondary" type="submit">연습용 친구들 모두 처음으로 돌리기</button></form>`);
}
