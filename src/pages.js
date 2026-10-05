import { GIFTS, GIFT_COUNT, GIFT_TIERS } from "./gifts.js";
import { seoulDayKey } from "./pet.js";

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

const ICONS = {
  feed: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 11.5h17c-.4 4.7-3.9 8-8.5 8s-8.1-3.3-8.5-8z"/><path d="M8.5 19.3h7"/><path d="M6.6 11.4c.5-2.9 2.9-4.8 5.4-4.8s4.9 1.9 5.4 4.8"/><path d="M15.5 3.2l-3 7.8M18.8 4.6l-4.6 6.6"/></svg>`,
  play: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M6.4 5.6c2.6 3.4 2.6 9.4 0 12.8M17.6 5.6c-2.6 3.4-2.6 9.4 0 12.8"/></svg>`,
  sleep: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.6 4.4A8 8 0 1 0 19.6 16 6.4 6.4 0 0 1 15.6 4.4z"/><path d="M17.2 3.6h3.4l-3.4 4h3.4"/></svg>`,
  gift: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="9.5" rx="1.6"/><rect x="3.2" y="7" width="17.6" height="3.5" rx="1.2"/><path d="M12 7v13M12 7C10.6 4 7 3.6 7 5.8 7 7 9.6 7 12 7zm0 0c1.4-3 5-3.4 5-1.2C17 7 14.4 7 12 7z"/></svg>`,
  farm: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20v-7"/><path d="M12 13c0-4-3-6-7-6 0 4 3 6 7 6z"/><path d="M12 11c0-3 2-5 6-5 0 3-2 5-6 5z"/><path d="M7 20h10"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.5-4.6-7.5-10A4 4 0 0 1 12 7.7a4 4 0 0 1 7.5 2.3c0 5.4-7.5 10-7.5 10z"/></svg>`,
  star: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6-4.4-4.2 6-.8z"/></svg>`,
  keyhole: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9.6" r="3.4"/><path d="M10.4 11.8 9.2 18.4h5.6l-1.2-6.6z"/></svg>`,
  close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2.2"/><path d="M15.5 8.5V6.7a2.2 2.2 0 0 0-2.2-2.2H6.7a2.2 2.2 0 0 0-2.2 2.2v6.6a2.2 2.2 0 0 0 2.2 2.2h1.8"/></svg>`,
  arcade: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.6 8.5h8.8a4.6 4.6 0 0 1 4.4 5.9l-.8 2.9a2.3 2.3 0 0 1-3.9 1L14.4 16H9.6l-1.7 2.3a2.3 2.3 0 0 1-3.9-1l-.8-2.9a4.6 4.6 0 0 1 4.4-5.9z"/><path d="M8 10.9v3.4M6.3 12.6h3.4M15.4 11.6h.01M17.4 13.6h.01"/></svg>`,
  mic: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/></svg>`,
  send: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19.5V5M6 10.5 12 4.5l6 6"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>`,
};

export const THEMES = [
  { id: "classic", name: "클래식", color: "#141B2B" },
  { id: "8bit", name: "8비트", color: "#1d2b53" },
  { id: "milk", name: "딸기우유", color: "#ffe3ea" },
  { id: "najeon", name: "자개", color: "#0f0e13" },
];

export function themeOf(value) {
  return THEMES.find((t) => t.id === value) || THEMES[0];
}

// Demo mascot: default horse. Pass mascot:"sheep" (or use ?mascot=sheep / cookie via public/app.js).
function mascotKind(mascot) {
  return mascot === "sheep" ? "sheep" : "horse";
}

function petMarkup({ waving = false, away = false, lonely = false, mascot = "horse", faces = true } = {}) {
  const kind = mascotKind(mascot);
  const front = `/mascot-${kind}-512-v3.png`;
  const awaySrc = `/mascot-${kind}-away-512-v3.png`;
  if (away) {
    const awayAlt = "다정한 친구가 등을 보이고 있어요";
    return `<div class="pet pet-away" data-pet="away" role="img" aria-label="${awayAlt}">
      <span class="pet-motion">
        <img class="pet-frame is-show" src="${awaySrc}" width="220" height="220" alt="" decoding="async" draggable="false">
      </span>
    </div>`;
  }
  const alt = "다정한 친구가 방긋 웃어요";
  const enterClass = waving ? " enter" : "";
  const lonelyClass = lonely ? " is-lonely" : "";
  // Sync decoding: an async face paints a blank pet on its first swap.
  const face = (name, src) => `<img class="pet-frame" data-frame="${name}" src="${src}" width="220" height="220" alt="" aria-hidden="true" fetchpriority="low" decoding="sync" draggable="false">`;
  const frames = faces
    ? [face("blink", `/mascot-${kind}-closed-512.webp`), face("react", `/mascot-${kind}-happy-512.webp`), face("sleepy", front),
      face("munch", `/mascot-${kind}-munch-512.webp`), face("yawn", `/mascot-${kind}-yawn-512.webp`), face("away", awaySrc)]
    : ["blink", "react", "sleepy"].map((name) => `<img class="pet-frame" data-frame="${name}" src="${front}" width="220" height="220" alt="" aria-hidden="true" decoding="async" draggable="false">`);
  return `<div class="pet${enterClass}${lonelyClass}" data-pet="alive">
      <button type="button" class="pet-hit" aria-label="${alt}">
        <span class="pet-motion">
          <img class="pet-frame is-show" data-frame="canon" src="${front}" width="220" height="220" alt="${alt}" decoding="async" draggable="false">
          ${frames.join("\n          ")}
        </span>
      </button>
    </div>`;
}

const SKY = `<div class="sky" aria-hidden="true">
        <span class="stars">${"<i></i>".repeat(9)}</span>
        <span class="motes">${"<i></i>".repeat(6)}</span>
        <span class="floor"></span>
      </div>`;

const HEART_PATH = "M12 20.5C6.4 16.9 2.5 13.4 2.5 9.3 2.5 6.4 4.8 4.5 7.4 4.5c1.9 0 3.5 1 4.6 2.7 1.1-1.7 2.7-2.7 4.6-2.7 2.6 0 4.9 1.9 4.9 4.8 0 4.1-3.9 7.6-9.5 11.2z";

export function heartHalves(mood) {
  return Math.max(1, Math.min(10, Math.ceil(Number(mood) / 10) || 1));
}

export function heartRow(mood, { animate = false, before = null } = {}) {
  const halves = heartHalves(mood);
  const start = animate && before !== null ? heartHalves(before) : halves;
  let hearts = "";
  for (let i = 1; i <= 5; i++) {
    const fill = Math.max(0, Math.min(2, start - (i - 1) * 2));
    const cls = fill === 2 ? "is-full" : fill === 1 ? "is-half" : "is-empty";
    hearts += `<span class="heart ${cls}" data-heart="${i}" data-fill="${fill}" aria-hidden="true"><svg viewBox="0 0 24 22"><path class="heart-bg" d="${HEART_PATH}"/><path class="heart-fill" d="${HEART_PATH}"/><ellipse class="heart-shine" cx="7.6" cy="8.6" rx="2.1" ry="1.4" transform="rotate(-32 7.6 8.6)"/></svg></span>`;
  }
  const anim = animate ? ` data-hearts-animate="1" data-mood-before="${start}" data-mood-after="${halves}"` : "";
  return `<div class="hearts" role="img" aria-label="기분 ${halves}단계" data-hearts="${start}"${anim}>${hearts}</div>`;
}

function giftLabel(tier) {
  if (tier === "rare") return "반짝 선물";
  if (tier === "special") return "특별한 선물";
  return "오늘의 선물";
}

function tierClass(tier) {
  return tier === "rare" ? "is-rare" : tier === "special" ? "is-special" : "is-common";
}

function giftLineHtml(tier, line) {
  return `<p class="gift ${tierClass(tier)}" data-gift="${tier}"><span class="gift-label">${giftLabel(tier)}</span> <span class="gift-text">${escapeHtml(line)}</span></p>`;
}

function giftCardHtml(pet) {
  if (!pet?.gift) return "";
  return giftLineHtml(pet.gift.tier, pet.gift.gift.line);
}

function petMoments({ pet = null, milestone = "" } = {}) {
  const items = [];
  if (pet?.leveledUp && pet.levelUpLine) {
    items.push(`<p class="pet-line is-levelup">${escapeHtml(pet.levelUpLine)}</p>`);
  }
  if (pet?.reunionLine) {
    items.push(`<p class="pet-line is-reunion">${escapeHtml(pet.reunionLine)}</p>`);
  }
  if (milestone) {
    items.push(`<p class="milestone">${escapeHtml(milestone)}</p>`);
  }
  if (pet?.lonelyLine) {
    items.push(`<p class="pet-line is-lonely-line">${escapeHtml(pet.lonelyLine)}</p>`);
  }
  if (pet?.unrewardedLine) {
    items.push(`<p class="pet-line is-soft">${escapeHtml(pet.unrewardedLine)}</p>`);
  }
  if (!items.length) return "";
  return `<section class="pet-moments" aria-label="오늘의 순간">${items.join("")}</section>`;
}

function xpPercent(pet) {
  return pet.xpSpan > 0 ? Math.max(0, Math.min(100, Math.round((pet.xpInto / pet.xpSpan) * 100))) : 100;
}

function keyBar({ level, pct, left }) {
  return `<p class="level-line"><span class="level-badge" aria-label="Lv. ${level}">${level}</span>
      <span class="xp-bar" role="img" aria-label="다음 단계까지 ${left}"><span class="xp-fill" data-xp="${pct}"></span></span></p>`;
}

function petStats(pet) {
  if (!pet) return "";
  return `<section class="pet-stats" aria-label="돌봄 상태">
    ${heartRow(pet.moodAfter, { animate: pet.rewarded, before: pet.moodBefore })}
    ${keyBar({ level: pet.level, pct: xpPercent(pet), left: pet.xpSpan - pet.xpInto })}
  </section>`;
}

const CARE_VERBS = [["feed", "밥"], ["play", "놀이"], ["sleep", "잠"]];

function dockHtml({ gift = false, want = "", meals = 0, plays = 0, uid = "", combo = 0, later = "", arcadeLeft = 0, giBest = 0, farmDot = false } = {}) {
  const owner = uid ? ` data-care-uid="${escapeHtml(uid)}"` : "";
  const after = later ? ` data-combo-later="${escapeHtml(later)}"` : "";
  const left = Number(arcadeLeft) || 0;
  return `<nav class="dock" aria-label="메뉴" data-want="${escapeHtml(want)}" data-meals="${Number(meals) || 0}" data-plays="${Number(plays) || 0}"${owner}${after} data-arcade-left="${left}" data-gi-best="${Number(giBest) || 0}" data-combo="${Number(combo) || 0}">
      <button type="button" class="dock-btn is-side${gift || left > 0 ? " has-new" : ""}" data-open="arcade" aria-haspopup="dialog"><span class="dock-cap">${ICONS.arcade}</span><span class="dock-label">오락실</span></button>
      ${CARE_VERBS.map(([id, label]) => `<button type="button" class="dock-btn is-verb" data-care="${id}"><span class="dock-cap">${ICONS[id]}</span><span class="dock-label">${label}</span></button>`).join("")}
      <button type="button" class="dock-btn is-side${farmDot ? " has-new" : ""}" data-farm><span class="dock-cap">${ICONS.farm}</span><span class="dock-label">텃밭</span></button>
    </nav>`;
}

function themeSheet(current) {
  const cards = THEMES.map((t) => `<li><button type="button" class="theme-card" data-pick="${t.id}" data-color="${t.color}" aria-pressed="${t.id === current ? "true" : "false"}"><span class="theme-thumb" aria-hidden="true"></span><span class="theme-name">${t.name}</span></button></li>`).join("");
  return sheetHtml("theme", "꾸미기", `<p class="theme-lede">어떤 세상에서 놀까요?</p>
      <ul class="theme-grid">${cards}</ul>`);
}

function sheetHtml(id, title, body) {
  return `<div class="sheet" data-sheet="${id}" role="dialog" aria-modal="true" aria-labelledby="sheet-${id}-title" hidden>
    <section class="sheet-card">
      <header class="sheet-head">
        <h2 id="sheet-${id}-title">${title}</h2>
        <button type="button" class="sheet-close" data-sheet-close aria-label="닫기">${ICONS.close}</button>
      </header>
      ${body}
    </section>
  </div>`;
}

const TILE_ICON = { common: ICONS.gift, special: ICONS.heart, rare: ICONS.star };

export function giftCollection(found = [], today = null) {
  const have = new Set(found);
  let tiles = "";
  for (const tier of GIFT_TIERS) {
    for (const gift of GIFTS[tier]) {
      if (have.has(gift.id)) {
        const isNew = today?.gift?.id === gift.id ? " is-new" : "";
        tiles += `<li><button type="button" class="tile ${tierClass(tier)}${isNew}" data-tile="${gift.id}" data-tier="${tier}" data-line="${escapeHtml(gift.line)}" aria-label="${escapeHtml(gift.line)}">${TILE_ICON[tier]}</button></li>`;
      } else {
        tiles += `<li><span class="tile is-locked" data-tile="${gift.id}" role="img" aria-label="아직 못 찾은 선물">${ICONS.keyhole}</span></li>`;
      }
    }
  }
  const count = GIFTS.common.concat(GIFTS.special, GIFTS.rare).filter((g) => have.has(g.id)).length;
  const reader = today
    ? `<p class="gift-reader ${tierClass(today.tier)}" data-gift-reader><span class="reader-label">${giftLabel(today.tier)}</span><span class="reader-text">${escapeHtml(today.gift.line)}</span></p>`
    : `<p class="gift-reader" data-gift-reader><span class="reader-text">${count ? "찾은 선물을 누르면 다시 읽을 수 있어요." : "아직 찾은 선물이 없어요."}</span></p>`;
  return `<p class="gift-tally">선물 ${count}/${GIFT_COUNT}</p>
      ${reader}
      <ul class="gift-grid" data-gift-grid>${tiles}</ul>`;
}

const LOCKED_GAMES = ["낚시", "풍선 사냥"];

function arcadeSheet(pet, found = [], mascot = "horse") {
  const left = Number(pet?.arcadeLeft) || 0;
  const pips = Array.from({ length: 3 }, (_, i) => `<i class="g-pip${i < 3 - left ? " is-used" : ""}"></i>`).join("");
  const have = new Set(found);
  const count = GIFTS.common.concat(GIFTS.special, GIFTS.rare).filter((g) => have.has(g.id)).length;
  const locked = LOCKED_GAMES.map((name) => `<li class="g-card is-locked"><span class="g-thumb">${ICONS.lock}</span><span class="g-txt"><b>${name}</b><small>곧 만나요</small></span></li>`).join("");
  return sheetHtml("arcade", "오락실", `<p class="g-today" data-arcade-today><span>오늘 XP 놀이</span>${pips}<b>${left ? `${left}번 남았어요` : "다 했어요!"}</b></p>
      <ul class="g-list">
        <li class="g-card is-ready"><span class="g-thumb"><span class="g-thumb-aura"></span><img class="g-thumb-pet" src="/mascot-${mascotKind(mascot)}-512-v3.png" alt=""></span><span class="g-txt"><b>기 모으기</b><small>인형을 톡톡! 하늘 끝까지 날아가요</small></span><button type="button" class="g-start" data-game="gi">시작</button></li>
        ${locked}
      </ul>
      <button type="button" class="g-gifts${pet?.gift ? " has-new" : ""}" data-open-gifts><span class="g-gift-ic">${ICONS.gift}</span>모은 선물 <b>${count}/${GIFT_COUNT}</b><span class="g-chev" aria-hidden="true">›</span></button>`);
}

function miniHearts(mood) {
  const halves = heartHalves(mood);
  let out = "";
  for (let i = 0; i < 5; i++) {
    const fill = Math.max(0, Math.min(2, halves - i * 2));
    out += `<span class="mini-heart${fill === 2 ? " is-full" : fill === 1 ? " is-half" : ""}" aria-hidden="true">${ICONS.heart}</span>`;
  }
  return `<span class="mini-hearts" role="img" aria-label="기분 ${halves}단계">${out}</span>`;
}

export function recordSheet(row, pet = null) {
  const rows = [`<div><dt>토닥인 횟수</dt><dd>${Number(row.tap_count) || 0}번</dd></div>`];
  if (pet) {
    rows.push(`<div><dt>레벨</dt><dd>Lv. ${pet.level}</dd></div>`);
    rows.push(`<div><dt>다음 레벨까지</dt><dd>${pet.xpSpan - pet.xpInto} XP</dd></div>`);
    rows.push(`<div><dt>기분</dt><dd>${miniHearts(pet.moodAfter)}</dd></div>`);
  }
  const days = pet ? pet.days : (row.days_together ?? 1);
  return `<p class="record-hero">함께한 지 ${days}일</p>
      <dl class="record-list">${rows.join("")}</dl>`;
}

function metDay(row) {
  const t = Date.parse(row?.created_at || "");
  return Number.isFinite(t) ? seoulDayKey(t) : "";
}

function demoPanel(uid, row) {
  const reveal = row?.pet_name
    ? `<button type="button" data-reveal-replay data-met="${metDay(row)}">영상 다시 보기</button>`
    : "";
  return `<div class="demo-sheet" data-demo-panel role="dialog" aria-modal="true" aria-label="데모" hidden>
    <div class="demo-card">
      <aside class="mascot-toggle" data-demo-switch role="group" aria-label="친구 바꾸기">
        <button type="button" class="mascot-tog" data-mascot="horse" aria-label="말 친구" aria-pressed="false">
          <img src="/mascot-horse-512-v3.png" width="56" height="56" alt="" decoding="async" draggable="false">
        </button>
        <button type="button" class="mascot-tog" data-mascot="sheep" aria-label="양 친구" aria-pressed="false">
          <img src="/mascot-sheep-512-v3.png" width="56" height="56" alt="" decoding="async" draggable="false">
        </button>
      </aside>
      <button type="button" data-demo-replay>처음 인사 다시 보기</button>
      ${reveal}${row?.pet_name ? `
      <form action="/demo/care-reset" method="post" data-demo-care>
        <input type="hidden" name="uid" value="${escapeHtml(uid)}">
        <button type="submit" class="secondary">돌봄 처음으로 돌리기</button>
      </form>
      <button type="button" class="secondary" data-demo-nfc hidden>NFC 바로 인식 켜기</button>` : ""}
      <form action="/demo/fresh-start" method="post" data-demo-fresh>
        <input type="hidden" name="uid" value="${escapeHtml(uid)}">
        <button type="submit" class="secondary">처음 만나는 날로 돌아가기</button>
      </form>
      <button type="button" class="demo-close" data-demo-close>닫기</button>
    </div>
  </div>`;
}

function nameSize(name) {
  const n = Array.from(String(name || "")).length;
  if (n > 14) return " is-longer";
  if (n > 7) return " is-long";
  return "";
}

function farmAttrs(farm) {
  if (!farm) return "";
  const next = farm.next ? ` data-farm-next="${farm.next}"` : "";
  const visit = farm.visit ? ` data-farm-visit="${escapeHtml(JSON.stringify(farm.visit))}"` : "";
  return ` data-farm-dot="${farm.dot ? 1 : 0}" data-farm-now="${farm.now}"${next}${visit}`;
}

export function page(row, content, { waving = false, away = false, lonely = false, timeLine = false, celebrate = "", countHtml = "", pet = null, mascot = "horse", wake = false, morning = false, demo = "", dialog = "", speaker = "", stats = "", dock = "", sheets = "", level = null, meet = false, theme = "classic", farm = null } = {}) {
  const look = themeOf(theme);
  const title = escapeHtml(row?.pet_name || "새 친구");
  const timeEl = timeLine ? `<p class="time-line" data-time-line></p>` : "";
  const celebrateAttr = celebrate === "claim" || celebrate === "named" || celebrate === "milestone" || celebrate === "levelup" || celebrate === "reunion" || celebrate === "rare" || celebrate === "special"
    ? ` data-celebrate="${celebrate}"`
    : "";
  const kind = mascot === "sheep" ? "sheep" : "horse";
  const horsePressed = kind === "horse" ? "true" : "false";
  const sheepPressed = kind === "sheep" ? "true" : "false";
  const horseActive = kind === "horse" ? " is-active" : "";
  const sheepActive = kind === "sheep" ? " is-active" : "";
  const toggle = `<aside class="mascot-toggle" data-mascot-toggle role="group" aria-label="친구 바꾸기">
    <button type="button" class="mascot-tog${horseActive}" data-mascot="horse" aria-label="말 친구" aria-pressed="${horsePressed}">
      <img src="/mascot-horse-512-v3.png" width="32" height="32" alt="" decoding="async" draggable="false">
    </button>
    <button type="button" class="mascot-tog${sheepActive}" data-mascot="sheep" aria-label="양 친구" aria-pressed="${sheepPressed}">
      <img src="/mascot-sheep-512-v3.png" width="32" height="32" alt="" decoding="async" draggable="false">
    </button>
  </aside>`;
  const pin = level ? `<span class="level-pin">Lv. ${level}</span>` : "";
  const topEnd = dock
    ? `<span class="topbar-end"><button type="button" class="theme-btn" data-open="theme" aria-haspopup="dialog" aria-label="꾸미기"><span class="swatch" aria-hidden="true"></span></button>${level ? `<button type="button" class="level-pin" data-open="record" aria-haspopup="dialog" aria-label="우리 기록, Lv. ${level}">Lv. ${level}</button>` : ""}</span>`
    : pin;
  const themed = look.id !== "classic";
  const unnamed = meet && !row?.pet_name;
  const nameplate = unnamed
    ? `<h1 class="nameplate is-placeholder" data-nameplate data-placeholder="${title}">${title}</h1>`
    : `<h1 class="nameplate${nameSize(row?.pet_name)}" data-nameplate>${title}</h1>`;
  const dialogBox = dialog
    ? `<section class="dialog" data-dialog aria-live="polite">${speaker ? `<span class="dialog-name">${escapeHtml(speaker)}</span>` : ""}${dialog}</section>`
    : "";
  const bodyClass = dock ? "is-home" : meet ? "is-meet" : away ? "is-stranger" : "";
  return `<!doctype html>
<html lang="ko" data-mascot="${kind}"${themed ? ` data-theme="${look.id}"` : ""}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="${look.color}">
  <meta name="color-scheme" content="light dark">
  <title>${title} | 인형 친구</title>
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
  <noscript><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"></noscript>
  <link rel="stylesheet" href="/style.css">
  <link rel="stylesheet" href="/mascot-toggle.css">${themed ? `
  <link rel="stylesheet" href="/themes/${look.id}.css">` : ""}
  <script src="/mascot-boot.js"></script>
  <script src="/app.js" defer></script>
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ""}${farmAttrs(farm)}${celebrateAttr}${wake ? " data-wake" : ""}${morning ? " data-morning" : ""}>
  <main>
    <header class="topbar">
      <span class="wordmark">POKKEY</span>
      ${toggle}
      ${topEnd}
    </header>
    <section class="plate">
      ${timeEl}
      ${nameplate}
      ${countHtml}
    </section>
    <div class="window${away ? " is-away" : ""}" data-window>
      ${SKY}
      ${petMarkup({ waving, away, lonely, mascot: kind, faces: Boolean(row) })}
    </div>
    ${dialogBox}
    ${stats}
    ${content}
    ${dock}
    <footer${demo ? " data-demo-hold" : ""}>토닥이면 깨어나는 작은 친구</footer>
  </main>
  ${sheets}${dock ? themeSheet(look.id) : ""}
  ${demo ? demoPanel(demo, row) : ""}
</body>
</html>`;
}

function keyCard(code) {
  return `<aside class="recovery">
    <h2>우리 안심 코드</h2>
    <p>꼭 적어두세요. 새 폰으로 저를 데려갈 때 꼭 필요해요.</p>
    <div class="code-row"><strong class="code">${escapeHtml(code)}</strong><button type="button" class="copy" data-copy>${ICONS.copy}<span data-copy-label>복사</span></button></div>
    <p>지금만 볼 수 있어요. 이름을 짓거나 창을 닫기 전에 꼭 챙겨두세요.</p>
  </aside>`;
}

function talkBar(name) {
  const label = `${escapeHtml(name)}에게 말 걸기`;
  return `<form class="talk-bar" data-talk-bar hidden>
    <p class="talk-hint" data-talk-hint aria-live="polite" hidden></p>
    <div class="talk-row">
      <input class="talk-input" data-talk-input type="text" enterkeyhint="send" autocomplete="off" placeholder="${label}" aria-label="${label}">
      <button type="button" class="talk-send" data-talk-send aria-label="보내기">${ICONS.send}</button>
      <button type="button" class="talk-voice" data-talk-voice aria-label="목소리로 말하기" aria-pressed="false">${ICONS.mic}</button>
    </div>
  </form>`;
}

function homeExtras(row, pet, found, mascot, talk) {
  return {
    dock: dockHtml({ gift: Boolean(pet?.gift), want: pet?.want, meals: pet?.meals, plays: pet?.plays, uid: row.uid, combo: pet?.combo, later: pet?.comboLaterLine, arcadeLeft: pet?.arcadeLeft, giBest: pet?.giBest, farmDot: Boolean(pet?.farm?.dot) }),
    sheets: arcadeSheet(pet, found, mascot)
      + sheetHtml("gifts", "선물함", giftCollection(found, pet?.gift || null))
      + sheetHtml("record", "우리 기록", recordSheet(row, pet))
      + (talk ? talkBar(row.pet_name) : ""),
  };
}

export function petPage(row, code = null, { celebrate = "", pet = null, mascot = "horse", demo = "", found = [], theme = "classic", talk = false, ask = "", guest = false } = {}) {
  const firstMeet = celebrate === "claim" || celebrate === "named";
  let greeting = row.pet_name
    ? (firstMeet
      ? `만나서 반가워요, ${escapeHtml(row.pet_name)}!`
      : `다시 만나서 반가워요, ${escapeHtml(row.pet_name)}!`)
    : "안녕하세요! 찾아와 줘서 정말 기뻐요.";
  if (pet?.morning) greeting = "쿨쿨… 쿨쿨…";
  else if (ask) greeting = escapeHtml(ask);
  const recovery = code && !guest ? keyCard(code) : "";
  const prompt = row.pet_name ? "" : `<form action="/name" method="post" class="name-form" data-met="${metDay(row)}">
    <input type="hidden" name="uid" value="${escapeHtml(row.uid)}">
    <label for="name">제 이름을 뭐라고 지어 줄래요?</label>
    <input id="name" name="name" required maxlength="24" autocomplete="off" placeholder="친구 이름" data-name-input>
    <button type="submit" class="primary">이 이름으로 지어줄게요!</button>
  </form>`;
  const returning = Boolean(row.pet_name) && !code;
  const mile = returning ? milestoneLine(row.tap_count) : "";
  const countHtml = returning
    ? `<p class="count" data-tap-count="${row.tap_count}"><span class="count-final">${row.tap_count}번 토닥여 줬어요!</span></p>`
    : "";
  const petAttr = pet
    ? ` data-pet-state="1" data-rewarded="${pet.rewarded ? 1 : 0}" data-reason="${escapeHtml(pet.reason)}" data-mood-before="${pet.moodBefore}" data-mood-after="${pet.moodAfter}" data-lonely="${pet.lonely ? 1 : 0}" data-reunion="${pet.reunion ? 1 : 0}" data-gift="${pet.gift ? escapeHtml(pet.gift.tier) : ""}"`
    : "";
  const moments = returning ? petMoments({ pet, milestone: mile }) : "";
  const giftHtml = returning && pet ? giftCardHtml(pet) : "";
  const stats = returning && pet ? petStats(pet) : "";
  let kind = celebrate;
  if (!kind && mile) kind = "milestone";
  const talking = talk && Boolean(row.pet_name);
  const mic = talking ? `<button type="button" class="talk-mic" data-talk-mic aria-label="말 걸기" aria-expanded="false" hidden>${ICONS.mic}</button>` : "";
  const dialog = `<p class="intro"${pet ? petAttr : ""}>${greeting}</p>${moments}${giftHtml}${mic}`;
  const extras = row.pet_name ? homeExtras(row, pet, found, mascot, talking) : { dock: "", sheets: "" };
  return page(
    row,
    `${recovery}${prompt}`,
    {
      waving: Boolean(code), lonely: Boolean(pet?.lonely), timeLine: true, celebrate: kind, countHtml, pet, mascot, wake: Boolean(code), morning: Boolean(pet?.morning), demo,
      dialog, speaker: row.pet_name || "", stats, level: pet ? pet.level : null, meet: !row.pet_name, theme, farm: row.pet_name ? pet?.farm : null, ...extras,
    },
  );
}

export function strangerPage(row, message = "", { mascot = "horse", demo = "", theme = "classic" } = {}) {
  return page(row, `${message ? `<p class="notice" role="alert">${escapeHtml(message)}</p>` : ""}
    <button type="button" id="claim-toggle" class="ghost" aria-expanded="${Boolean(message)}" aria-controls="claim-form">제가 주인이에요</button>
    <form action="/claim" method="post" id="claim-form" ${message ? "" : "hidden"}>
      <input type="hidden" name="uid" value="${escapeHtml(row.uid)}">
      <label for="code">안심 코드</label>
      <input id="code" name="code" required autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="claim-help">
      <p id="claim-help">처음 만났을 때 적어둔 안심 코드를 넣어주세요.</p>
      <button type="submit" class="primary">내 친구를 데려올래요!</button>
    </form>`, { away: true, mascot, demo, theme, dialog: `<p class="intro">이 작은 친구는 이미 주인이 있어요.</p>` });
}

export const fakeUids = ["04AAAAAAAAAAA1", "04BBBBBBBBBBB2", "04CCCCCCCCCCC3"];

const PREVIEW_KINDS = new Set(["claim", "levelup", "reunion", "milestone", "gift", "lonely"]);
const PREVIEW_TIERS = new Set(["common", "special", "rare"]);
const PREVIEW_REASONS = new Set(["cooldown", "cap", "stale"]);

export function previewPetPage({ kind, count, tier = "common", reason = "", mascot = "horse", theme = "classic" } = {}) {
  const n = Number(count);
  const row = {
    uid: "04PREVIEW00001",
    pet_name: "미리보기",
    tap_count: n,
  };
  const mile = kind === "milestone" ? milestoneLine(n) : "";
  const countHtml = `<p class="count" data-tap-count="${n}"><span class="count-final">${n}번 토닥여 줬어요!</span></p>`;
  const giftLine = tier === "rare" ? "별똥별을 주웠어요! 소원 하나 빌어요!"
    : tier === "special" ? "고마움이 가득가득 넘쳐요!"
    : "오늘도 와줘서 고마워요!";
  const unrewarded = {
    cooldown: "방금 토닥여 줘서 기분 좋아요! 조금 있다가 또 토닥여 주세요.",
    cap: "오늘은 실컷 놀았어요! 내일 또 만나요!",
    stale: "폰을 진짜 저한테 톡 대 주세요!",
  };
  const moments = [];
  if (kind === "levelup") moments.push(`<p class="pet-line is-levelup">쑥쑥 컸어요! 이제 Lv. 2!</p>`);
  if (kind === "reunion") moments.push(`<p class="pet-line is-reunion">보고 싶었어요! 진짜로요!</p>`);
  if (mile) moments.push(`<p class="milestone">${escapeHtml(mile)}</p>`);
  if (kind === "lonely") moments.push(`<p class="pet-line is-lonely-line">혼자 있어서 심심했어요...</p>`);
  if (reason) moments.push(`<p class="pet-line is-soft">${escapeHtml(unrewarded[reason] || "")}</p>`);
  const momentsHtml = moments.length
    ? `<section class="pet-moments" aria-label="오늘의 순간">${moments.join("")}</section>`
    : "";
  const showGift = kind === "gift" && !reason;
  const giftHtml = showGift ? giftLineHtml(tier, giftLine) : "";
  const level = kind === "levelup" ? 2 : 1;
  const stats = heartRow(kind === "lonely" ? 20 : kind === "reunion" ? 70 : 80, { animate: kind === "reunion", before: kind === "reunion" ? 20 : null })
    + keyBar({ level, pct: kind === "levelup" ? 0 : 40, left: kind === "levelup" ? 100 : 30 });
  const visual = kind === "gift" ? (tier === "rare" ? "rare" : tier === "special" ? "special" : "") : kind === "lonely" ? "" : kind;
  const greeting = kind === "claim"
    ? `만나서 반가워요, ${escapeHtml(row.pet_name)}!`
    : `다시 만나서 반가워요, ${escapeHtml(row.pet_name)}!`;
  const previewGift = showGift ? { tier, gift: { id: "", line: giftLine } } : null;
  const previewPet = { level, xpInto: kind === "levelup" ? 0 : 20, xpSpan: kind === "levelup" ? 100 : 50, moodAfter: kind === "lonely" ? 20 : 80, days: 12 };
  const previewFound = ["c01", "c02", "c05", "c09", "c14", "s05", "r01"];
  return page(
    row,
    "",
    {
      timeLine: true, celebrate: visual, countHtml, lonely: kind === "lonely", mascot, theme,
      dialog: `<p class="intro">${greeting}</p>${momentsHtml}${giftHtml}`, speaker: row.pet_name,
      stats: `<section class="pet-stats" aria-label="돌봄 상태">${stats}</section>`, level,
      dock: dockHtml({ gift: showGift, arcadeLeft: 3 }),
      sheets: arcadeSheet({ arcadeLeft: 3, gift: previewGift }, previewFound, mascot)
        + sheetHtml("gifts", "선물함", giftCollection(previewFound, previewGift))
        + sheetHtml("record", "우리 기록", recordSheet(row, previewPet)),
    },
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

export function devPage(uids = fakeUids, { theme = "classic" } = {}) {
  return page(null, `<p class="intro">연습용 친구들을 만나보세요</p>
    <nav aria-label="연습용 친구들">${uids.map((uid, i) => `<a class="button" href="/t?uid=${uid}">인형 친구 ${String.fromCharCode(65 + i)} <small>${uid}</small></a>`).join("")}</nav>
    <nav aria-label="축하 미리보기" class="dev-preview">
      <a class="button secondary" href="/dev/preview?kind=claim&count=10">이름 짓기 축하 미리보기</a>
      <a class="button secondary" href="/dev/preview?kind=claim&count=10&mascot=sheep">양(sheep) 데모 미리보기</a>
      <a class="button secondary" href="/dev/preview?kind=levelup&count=10">레벨업 미리보기</a>
      <a class="button secondary" href="/dev/preview?kind=reunion&count=10">재회 미리보기</a>
      <a class="button secondary" href="/dev/preview?kind=milestone&count=10">10번 이정표 미리보기</a>
      <a class="button secondary" href="/dev/preview?kind=milestone&count=100">100번 이정표 미리보기</a>
      <a class="button secondary" href="/dev/preview?kind=gift&count=10&tier=common">선물 미리보기</a>
      <a class="button secondary" href="/dev/preview?kind=gift&count=10&tier=special">특별한 선물 미리보기</a>
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
    <form action="/dev/reset" method="post"><button class="secondary" type="submit">연습용 친구들을 모두 처음으로 돌리기</button></form>`, { theme });
}
