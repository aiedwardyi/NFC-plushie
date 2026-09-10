export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

export function milestoneLine(count) {
  const n = Number(count);
  if (n === 10) return "벌써 열 번이야!";
  if (n === 25) return "스물다섯 번이야!";
  if (n === 50) return "오십 번이야!";
  if (n === 100) return "백 번 만났어!";
  if (n > 100 && n % 100 === 0) return `${n}번이야!`;
  return "";
}

function petMarkup({ waving = false, away = false, lonely = false } = {}) {
  if (away) {
    const awayAlt = "다정한 인형 친구가 등을 보이고 있어요";
    return `<div class="pet pet-away" data-pet="away" role="img" aria-label="${awayAlt}">
      <span class="pet-motion">
        <img class="pet-frame is-show" src="/mascot-duck-away-512.png" width="220" height="220" alt="" decoding="async" draggable="false">
      </span>
    </div>`;
  }
  const alt = "다정한 인형 친구가 방긋 웃어요";
  const enterClass = waving ? " enter" : "";
  const lonelyClass = lonely ? " is-lonely" : "";
  return `<div class="pet${enterClass}${lonelyClass}" data-pet="alive">
      <button type="button" class="pet-hit" aria-label="${alt}">
        <span class="pet-motion">
          <img class="pet-frame is-show" data-frame="canon" src="/mascot-duck-512.png" width="220" height="220" alt="${alt}" decoding="async" draggable="false">
          <img class="pet-frame" data-frame="blink" src="/mascot-duck-blink-512.png" width="220" height="220" alt="" aria-hidden="true" decoding="async" draggable="false">
          <img class="pet-frame" data-frame="react" src="/mascot-duck-react-512.png" width="220" height="220" alt="" aria-hidden="true" decoding="async" draggable="false">
          <img class="pet-frame" data-frame="sleepy" src="/mascot-duck-sleepy-512.png" width="220" height="220" alt="" aria-hidden="true" decoding="async" draggable="false">
        </span>
      </button>
    </div>`;
}

export function heartRow(mood, { animate = false, before = null } = {}) {
  const halves = Math.max(1, Math.min(10, Math.ceil(Number(mood) / 10) || 1));
  const start = animate && before !== null
    ? Math.max(1, Math.min(10, Math.ceil(Number(before) / 10) || 1))
    : halves;
  const shown = animate && before !== null ? start : halves;
  let hearts = "";
  for (let i = 1; i <= 5; i++) {
    const fill = Math.max(0, Math.min(2, shown - (i - 1) * 2));
    const begin = Math.max(0, Math.min(2, start - (i - 1) * 2));
    const cls = fill === 2 ? "is-full" : fill === 1 ? "is-half" : "is-empty";
    hearts += `<span class="heart ${cls}" data-heart="${i}" data-fill="${fill}" data-start="${begin}" aria-hidden="true"><svg viewBox="0 0 24 22"><path class="heart-bg" d="M12 20.5C6.4 16.9 2.5 13.4 2.5 9.3 2.5 6.4 4.8 4.5 7.4 4.5c1.9 0 3.5 1 4.6 2.7 1.1-1.7 2.7-2.7 4.6-2.7 2.6 0 4.9 1.9 4.9 4.8 0 4.1-3.9 7.6-9.5 11.2z"/><path class="heart-fill" d="M12 20.5C6.4 16.9 2.5 13.4 2.5 9.3 2.5 6.4 4.8 4.5 7.4 4.5c1.9 0 3.5 1 4.6 2.7 1.1-1.7 2.7-2.7 4.6-2.7 2.6 0 4.9 1.9 4.9 4.8 0 4.1-3.9 7.6-9.5 11.2z"/></svg></span>`;
  }
  const anim = animate ? ` data-hearts-animate="1" data-mood-before="${start}" data-mood-after="${halves}"` : "";
  return `<div class="hearts" role="img" aria-label="기분 ${halves}단계" data-hearts="${shown}"${anim}>${hearts}</div>`;
}

function petStats(pet) {
  if (!pet) return "";
  const pct = pet.xpSpan > 0 ? Math.max(0, Math.min(100, Math.round((pet.xpInto / pet.xpSpan) * 100))) : 100;
  const lines = [];
  if (pet.reunionLine) lines.push(`<p class="pet-line is-reunion">${escapeHtml(pet.reunionLine)}</p>`);
  if (pet.lonelyLine) lines.push(`<p class="pet-line is-lonely-line">${escapeHtml(pet.lonelyLine)}</p>`);
  if (pet.unrewardedLine) lines.push(`<p class="pet-line is-soft">${escapeHtml(pet.unrewardedLine)}</p>`);
  let giftHtml = "";
  if (pet.gift) {
    const tierClass = pet.gift.tier === "rare" ? "is-rare" : pet.gift.tier === "special" ? "is-special" : "is-common";
    giftHtml = `<p class="gift ${tierClass}" data-gift="${pet.gift.tier}"><span class="gift-label">오늘의 선물</span> ${escapeHtml(pet.gift.gift.line)}</p>`;
  }
  return `<section class="pet-stats" aria-label="돌봄 상태">
    ${heartRow(pet.moodAfter, { animate: pet.rewarded, before: pet.moodBefore })}
    ${pet.lonely ? `<p class="mood-word">외로워</p>` : ""}
    <p class="level-line"><span class="level-badge">Lv. ${pet.level}</span>
      <span class="xp-bar" role="img" aria-label="다음 단계까지 ${pet.xpSpan - pet.xpInto}"><span class="xp-fill" style="width:${pct}%"></span></span></p>
    <p class="days-line">함께한 지 ${pet.days}일</p>
    <p class="gift-count">선물 ${pet.giftFound}/${pet.giftTotal}</p>
    ${lines.join("")}${giftHtml}
  </section>`;
}

export function page(row, content, { waving = false, away = false, lonely = false, timeLine = false, celebrate = "", countHtml = "", pet = null } = {}) {
  const title = escapeHtml(row?.pet_name || "새 친구");
  const timeEl = timeLine ? `<p class="time-line" data-time-line></p>` : "";
  const celebrateAttr = celebrate === "claim" || celebrate === "milestone" || celebrate === "levelup" || celebrate === "reunion" || celebrate === "rare" || celebrate === "special"
    ? ` data-celebrate="${celebrate}"`
    : "";
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} | 인형 친구</title>
  <link rel="stylesheet" href="/style.css">
  <script src="/app.js" defer></script>
</head>
<body${celebrateAttr}>
  <main>
    <p class="eyebrow">살포시 전하는 안녕</p>
    <h1>${title}</h1>
    ${timeEl}
    ${petMarkup({ waving, away, lonely })}
    ${countHtml}
    ${content}
    <footer>작은 토닥임. 다정한 친구.</footer>
  </main>
</body>
</html>`;
}

export function petPage(row, code = null, { celebrate = "", pet = null } = {}) {
  const greeting = row.pet_name ? `다시 만나서 반가워, ${escapeHtml(row.pet_name)}!` : "안녕! 나를 찾아줘서 정말 기뻐.";
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
  const countHtml = returning
    ? `<p class="count" data-tap-count="${row.tap_count}"><span class="count-final">우리 ${row.tap_count}번 토닥였어!</span></p>`
    : "";
  const petAttr = pet
    ? ` data-pet-state="1" data-rewarded="${pet.rewarded ? 1 : 0}" data-reason="${escapeHtml(pet.reason)}" data-mood-before="${pet.moodBefore}" data-mood-after="${pet.moodAfter}" data-lonely="${pet.lonely ? 1 : 0}" data-reunion="${pet.reunion ? 1 : 0}" data-gift="${pet.gift ? escapeHtml(pet.gift.tier) : ""}"`
    : "";
  const stats = returning && pet ? petStats(pet) : "";
  let kind = celebrate;
  if (!kind && mile) kind = "milestone";
  const body = `<p class="intro"${pet ? petAttr : ""}>${greeting}</p>${recovery}${prompt}${mileHtml}${stats}`;
  return page(
    row,
    body,
    { waving: Boolean(code), lonely: Boolean(pet?.lonely), timeLine: true, celebrate: kind, countHtml, pet },
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

const PREVIEW_KINDS = new Set(["claim", "levelup", "reunion", "milestone", "gift", "lonely"]);
const PREVIEW_TIERS = new Set(["common", "special", "rare"]);
const PREVIEW_REASONS = new Set(["cooldown", "cap", "stale"]);

export function previewPetPage({ kind, count, tier = "common", reason = "" }) {
  const n = Number(count);
  const row = {
    uid: "04PREVIEW00001",
    pet_name: "미리보기",
    tap_count: n,
  };
  const mile = kind === "milestone" ? milestoneLine(n) : "";
  const mileHtml = mile ? `<p class="milestone">${escapeHtml(mile)}</p>` : "";
  const countHtml = `<p class="count" data-tap-count="${n}"><span class="count-final">우리 ${n}번 토닥였어!</span></p>`;
  const giftLine = tier === "rare" ? "별들이 속삭였어. 우린 짝꿍이래!"
    : tier === "special" ? "고마움이 가득가득 넘쳐!"
    : "오늘도 와줘서 고마워!";
  const tierClass = tier === "rare" ? "is-rare" : tier === "special" ? "is-special" : "is-common";
  const unrewarded = {
    cooldown: "행복이 가득 찼어! 잠깐 있다 다시 토닥여줘.",
    cap: "오늘은 실컷 놀았어! 내일 또 만나자!",
    stale: "폰으로 진짜 나를 톡 해줘!",
  };
  const stats = heartRow(kind === "lonely" ? 20 : kind === "reunion" ? 70 : 80, { animate: kind === "reunion", before: kind === "reunion" ? 20 : null })
    + `<p class="level-line"><span class="level-badge">Lv. ${kind === "levelup" ? 2 : 1}</span>`
    + `<span class="xp-bar"><span class="xp-fill" style="width:${kind === "levelup" ? 5 : 40}%"></span></span></p>`
    + `<p class="days-line">함께한 지 12일</p><p class="gift-count">선물 7/30</p>`
    + (kind === "reunion" ? `<p class="pet-line is-reunion">보고 싶었어! 진짜로!</p>` : "")
    + (kind === "lonely" ? `<p class="pet-line is-lonely-line">혼자 있어서 심심했어...</p><p class="mood-word">외로워</p>` : "")
    + (kind === "gift" ? `<p class="gift ${tierClass}" data-gift="${tier}"><span class="gift-label">오늘의 선물</span> ${escapeHtml(giftLine)}</p>` : "")
    + (reason ? `<p class="pet-line is-soft">${escapeHtml(unrewarded[reason] || "")}</p>` : "");
  const visual = kind === "gift" ? (tier === "rare" ? "rare" : tier === "special" ? "special" : "") : kind === "lonely" ? "" : kind;
  return page(
    row,
    `<p class="intro">다시 만나서 반가워, ${escapeHtml(row.pet_name)}!</p>${mileHtml}<section class="pet-stats" aria-label="돌봄 상태">${stats}</section>`,
    { timeLine: true, celebrate: visual, countHtml, lonely: kind === "lonely" },
  );
}

previewPetPage.validate = ({ kind, count, tier = "common", reason = "" }) => {
  const n = Number(count);
  if (!PREVIEW_KINDS.has(kind) || !Number.isFinite(n)) return false;
  const allowedCount = n === 10 || n === 100;
  if ((kind === "claim" || kind === "milestone" || kind === "levelup") && !allowedCount) return false;
  if (kind === "gift" && !PREVIEW_TIERS.has(tier)) return false;
  if (reason && !PREVIEW_REASONS.has(reason)) return false;
  return true;
};

export function devPage(uids = fakeUids) {
  return page(null, `<p class="intro">연습용 친구들을 만나보세요</p>
    <nav aria-label="연습용 친구들">${uids.map((uid, i) => `<a class="button" href="/t?uid=${uid}">인형 친구 ${String.fromCharCode(65 + i)} <small>${uid}</small></a>`).join("")}</nav>
    <nav aria-label="축하 미리보기" class="dev-preview">
      <a class="button secondary" href="/dev/preview?kind=claim&count=10">이름 짓기 축하 미리보기</a>
      <a class="button secondary" href="/dev/preview?kind=levelup&count=10">레벨업 미리보기</a>
      <a class="button secondary" href="/dev/preview?kind=reunion&count=10">재회 미리보기</a>
      <a class="button secondary" href="/dev/preview?kind=milestone&count=10">10번 이정표 미리보기</a>
      <a class="button secondary" href="/dev/preview?kind=milestone&count=100">100번 이정표 미리보기</a>
      <a class="button secondary" href="/dev/preview?kind=gift&count=10&tier=common">선물 미리보기</a>
      <a class="button secondary" href="/dev/preview?kind=gift&count=10&tier=rare">진귀한 선물 미리보기</a>
      <a class="button secondary" href="/dev/preview?kind=lonely&count=10">외로움 미리보기</a>
      <a class="button secondary" href="/dev/preview?kind=gift&count=10&reason=cooldown">쿨다운 미리보기</a>
      <a class="button secondary" href="/dev/preview?kind=gift&count=10&reason=cap">하루 상한 미리보기</a>
      <a class="button secondary" href="/dev/preview?kind=gift&count=10&reason=stale">낡은 기록 미리보기</a>
    </nav>
    <form action="/dev/prime" method="post">
      <label for="prime-uid">돌봄 상태 만들기</label>
      <input id="prime-uid" name="uid" required autocomplete="off" placeholder="14자리 일련번호">
      <label for="prime-preset">상태</label>
      <input id="prime-preset" name="preset" autocomplete="off" placeholder="lonely, levelup, fresh">
      <label for="prime-tier">다음 선물 등급</label>
      <input id="prime-tier" name="tier" autocomplete="off" placeholder="common, special, rare, none">
      <button class="secondary" type="submit">상태 만들기</button>
    </form>
    <form action="/dev/reset" method="post"><button class="secondary" type="submit">연습용 친구들을 모두 처음으로 돌리기</button></form>`);
}
