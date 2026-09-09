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
    <p class="eyebrow">너를 위한 작은 안녕</p>
    <h1>${title}</h1>
    <div class="pet ${waving ? "waving" : "idle"}" role="img" aria-label="${waving ? "손을 흔들며 인사하는 다정한 인형 친구" : "방긋 웃고 있는 다정한 인형 친구"}">
      <div class="arm"></div><div class="blob"><span class="eyes"></span><span class="smile"></span></div>
    </div>
    ${content}
    <footer>작은 토닥임. 다정한 친구.</footer>
  </main>
</body>
</html>`;
}

export function petPage(row, code = null) {
  const greeting = row.pet_name ? `다시 만나서 반가워요, ${escapeHtml(row.pet_name)}!` : "안녕! 나를 찾아줘서 정말 기뻐요.";
  const recovery = code ? `<aside class="recovery"><h2>우리만의 소중한 안심 코드</h2>
    <p>꼭 적어두세요. 새 휴대폰으로 나를 데려올 수 있는 유일한 방법이에요.</p>
    <strong class="code">${escapeHtml(code)}</strong><p>이 코드는 지금만 보여요. 내 이름을 지어주거나 이 페이지를 떠나기 전에 꼭 저장해 두세요.</p></aside>` : "";
  const prompt = row.pet_name ? "" : `<form action="/name" method="post">
    <input type="hidden" name="uid" value="${escapeHtml(row.uid)}">
    <label for="name">내 이름을 뭐라고 지어줄래요?</label>
    <input id="name" name="name" required maxlength="24" autocomplete="off" placeholder="친구의 이름">
    <button type="submit">이 이름으로 지어줄게요!</button>
  </form>`;
  return page(row, `<p class="intro">${greeting}</p>${recovery}${prompt}<p class="count">행복한 토닥임 ${row.tap_count}번</p>`, Boolean(code));
}

export function strangerPage(row, message = "") {
  return page(row, `<p class="intro">이 작은 친구는 이미 주인이 있어요.</p>
    ${message ? `<p class="notice" role="alert">${escapeHtml(message)}</p>` : ""}
    <button type="button" id="claim-toggle" aria-expanded="${Boolean(message)}" aria-controls="claim-form">제가 주인이에요</button>
    <form action="/claim" method="post" id="claim-form" ${message ? "" : "hidden"}>
      <input type="hidden" name="uid" value="${escapeHtml(row.uid)}">
      <label for="code">안심 복구 코드</label>
      <input id="code" name="code" required autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="claim-help">
      <p id="claim-help">처음 만났을 때 저장해 둔 코드를 입력해 주세요.</p>
      <button type="submit">내 친구 집으로 데려오기</button>
    </form>`);
}

export const fakeUids = ["04AAAAAAAAAAA1", "04BBBBBBBBBBB2", "04CCCCCCCCCCC3"];

export function devPage() {
  return page(null, `<p class="intro">연습용 인형 친구 만나보기</p>
    <nav aria-label="연습용 인형 친구들">${fakeUids.map((uid, i) => `<a class="button" href="/t?uid=${uid}">인형 친구 ${String.fromCharCode(65 + i)} <small>${uid}</small></a>`).join("")}</nav>
    <form action="/dev/reset" method="post"><button class="secondary" type="submit">모든 연습용 인형 친구 초기화하기</button></form>`);
}
