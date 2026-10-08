// 우리 동네 for any game: a rival's card as the plushie showroom (its portrait in this world's window, the edition's
// frame round it, the name in the frame's material, its level and city), the 시·도 picker, the day's tickets and the
// week's best. Plain strings, so every room draws them alike; names are other owners' words and always go in escaped.
import { CITIES, cityName } from "../cities.js";

export const esc = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const EDITIONS = { classic: "포근 클래식", rare: "금실 레어", legendary: "별밤 레전더리" };
const editionOf = (id) => (Object.hasOwn(EDITIONS, id) ? id : "classic");

// The portrait comes from /kinds.css by data-mascot; `still` draws a card that only shows, not one to pick.
export function cardHtml(card, { attrs = "", tag = "", pressed = null, still = false } = {}) {
  const edition = editionOf(card.edition);
  const label = `${card.name}, ${EDITIONS[edition]}, Lv.${card.level}, ${cityName(card.city)}${tag ? `, ${tag}` : ""}`;
  const el = still ? "span" : "button";
  const role = still ? ' role="img"' : ' type="button"';
  const press = pressed === null ? "" : ` aria-pressed="${pressed}"`;
  return `<${el}${role} class="c-card look-card" data-look="${edition}" data-mascot="${esc(card.kind)}"${attrs}${press} aria-label="${esc(label)}">
    <span class="look-frame" aria-hidden="true"></span><b class="look-name" aria-hidden="true">${esc(card.name)}</b><small class="c-meta" aria-hidden="true">Lv.${Number(card.level) || 1} · ${esc(cityName(card.city))}</small>${tag ? `<i class="c-tag" aria-hidden="true">${esc(tag)}</i>` : ""}
  </${el}>`;
}

export function cityPicker(picked = "") {
  return `<ul class="c-cities" role="group" aria-label="우리 동네 고르기">${CITIES.map((c) => `<li><button type="button" class="c-city" data-city="${c.id}" aria-pressed="${c.id === picked}">${c.name}</button></li>`).join("")}</ul>`;
}

// The day's tickets as pips, the spent ones dimmed.
export function ticketPips(left, total = 3) {
  return `<span class="c-pips" aria-hidden="true">${Array.from({ length: total }, (_, i) => `<i class="c-pip${i < left ? "" : " is-used"}"></i>`).join("")}</span>`;
}

// This week's wins, best first, on one line; a city that hasn't raced yet says so.
export function boardHtml(best) {
  const rows = best.length
    ? best.map((b, i) => `<li${b.me ? ' class="is-me"' : ""}><i>${i + 1}등</i><b>${esc(b.name)}</b><span>${b.wins}승</span></li>`).join("")
    : '<li class="is-none">첫 승리를 기다려요</li>';
  return `<div class="c-best"><b class="c-week">이번 주</b><ol aria-label="이번 주 우리 동네 순위">${rows}</ol></div>`;
}

// The town's rivals to pick from, the 복수전 the server still owes first; a news card alone never makes one.
export const townRivals = (town) => (town?.city ? [...(town.revenge || []), ...(town.rivals || [])] : []);
export const owed = (town, card) => Boolean(card && town?.revenge?.some((r) => r.id === card.id));
// A won 복수전 is settled: its rival stays in town untagged, as the server's next roster will have it.
export const avenge = (town, id) => ({ ...town, revenge: town.revenge.filter((r) => r.id !== id), rivals: [...town.revenge.filter((r) => r.id === id), ...(town.rivals || [])] });

// The pet's own line, under its name like the home's dialog.
export const sayHtml = (name, line) => `<p class="c-say"><b>${esc(name)}</b>${esc(line)}</p>`;
