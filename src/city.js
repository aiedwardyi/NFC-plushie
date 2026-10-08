import { randomBytes } from "node:crypto";
import { kindOf } from "../public/kinds.js";
import { PET, seoulDayKey } from "./pet.js";

const DAY = 24 * 60 * 60 * 1000;

// tickets: what the day's first plushie tap gives; inbox: records kept per defender; boardMin: joined pets before a city ranks; revengeMs: how long a loss is owed a 복수전.
export const CITY = { tickets: 3, inbox: 20, boardMin: 5, board: 3, roster: 30, matchMs: 10 * 60 * 1000, revengeMs: 7 * DAY };

export const cityPid = () => randomBytes(9).toString("base64url");
export const matchId = () => randomBytes(12).toString("base64url");
export const validPid = (id) => typeof id === "string" && /^[A-Za-z0-9_-]{12}$/.test(id);
export const validMatch = (id) => typeof id === "string" && /^[A-Za-z0-9_-]{16}$/.test(id);

// Picking a city: a move keeps the public id and starts this week's wins over; a pet joining again gets a new id.
export function joinCity(state, city, pid) {
  return state.city === city ? null : { city, cityPid: state.cityPid || pid, cityWeek: null, cityWins: null };
}

export const leaveCity = () => ({ city: null, cityPid: null, cityWeek: null, cityWins: null });

// What a defender's records lose past the cap, from a newest-first list.
export const pastInbox = (newestFirst) => newestFirst.slice(CITY.inbox);

export function ticketsLeft(state, now) {
  return state.cityDay === seoulDayKey(now) ? state.cityTickets : 0;
}

// The day's first real plushie tap fills the day's tickets, XP or not; unused ones end with the Seoul day.
export function dayTickets(now) {
  return { cityDay: seoulDayKey(now), cityTickets: CITY.tickets };
}

export function spendTicket(state, now) {
  const left = ticketsLeft(state, now);
  return left > 0 ? { cityDay: state.cityDay, cityTickets: left - 1 } : null;
}

// The Monday that starts this Seoul week.
export function weekOf(now) {
  const back = (new Date(now + PET.seoulOffsetMs).getUTCDay() + 6) % 7;
  return seoulDayKey(now - back * DAY);
}

export function winsThisWeek(state, now) {
  return state.cityWeek === weekOf(now) ? state.cityWins : 0;
}

export function addWin(state, now) {
  return { cityWeek: weekOf(now), cityWins: winsThisWeek(state, now) + 1 };
}

// Why a reported result can't land, or "" when it can: one result per issued match, from its challenger, before it expires.
export function matchRefusal(match, uid, now) {
  if (!match || match.challenger !== uid) return "unknown";
  if (match.done_at !== null) return "used";
  return now >= match.expires ? "expired" : "";
}

export const boardShown = (joined) => joined >= CITY.boardMin;

// Folds look-alikes so 씨 발, f.u.c.k, ｆｕｃｋ and a fuck spelled in Cyrillic all read the same; anything that isn't a letter goes.
const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", "@": "a", $: "s", "!": "i" };
// Cyrillic, then Greek letters that look Latin, small then capital: a Greek capital nu reads n where its small nu reads v.
const LOOKS = Object.fromEntries([..."\u0430\u0432\u0441\u0435\u04BB\u0456\u0458\u043A\u043C\u043D\u043E\u0440\u0455\u0442\u0443\u0445\u0410\u0412\u0421\u0415\u04BA\u0406\u0408\u041A\u041C\u041D\u041E\u0420\u0405\u0422\u0423\u0425\u03B1\u03B5\u03B9\u03BA\u03BD\u03BF\u03C1\u03C4\u03C5\u03C7\u0391\u0395\u0399\u039A\u039D\u039F\u03A1\u03A4\u03A5\u03A7"].map((c, i) => [c, "abcehijkmhopstyxabcehijkmhopstyxaeikvoptuxaeiknoptyx"[i]]));
const fold = (text) => String(text).normalize("NFKC").replace(/[\u0370-\u04FF]/g, (c) => LOOKS[c] || c).toLowerCase().replace(/[013457@$!]/g, (c) => LEET[c]).replace(/[^\p{L}]/gu, "");
const BAD_WORDS = [
  "시발", "씨발", "씨빨", "시빨", "씨팔", "시팔", "씨바", "ㅅㅂ", "ㅆㅂ", "ㅆ발", "ㅅ발", "병신", "븅신", "ㅂㅅ", "ㅄ", "씹", "ㅗ", "개새끼", "개새기", "개색기", "새끼", "좆", "존나", "ㅈㄴ",
  "지랄", "ㅈㄹ", "미친놈", "미친년", "또라이", "꺼져", "닥쳐", "엿먹", "썅", "쌍년", "쌍놈", "걸레", "창녀", "니애미", "느금", "섹스", "야동", "보지", "자지",
  "fuck", "fuk", "fvck", "fck", "phuck", "shit", "bitch", "cunt", "dick", "pussy", "asshole", "bastard", "slut", "whore", "nigger", "nigga", "faggot", "retard", "porn", "penis", "vagina", "sex", "hitler", "nazi",
].map(fold);

// Bidi controls draw a name in another order than it's stored, so a reversed bad word would read right on others' screens.
export const noBidi = (text) => String(text).replace(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "");

// The name other owners see: a bad word anywhere in it shows the animal's name instead.
export function shownName(name, kind) {
  const plain = noBidi(name || "");
  const folded = fold(plain);
  return folded && !BAD_WORDS.some((word) => folded.includes(word)) ? plain : kindOf(kind).name;
}

// What the pet says about the races run against it while its owner was away.
export function newsLine(news) {
  const held = news.filter((n) => n.held).length;
  if (news.length === 1) return `자리 비운 사이에 도전받았어요! ${held ? "제가 이겼어요" : "아깝게 졌어요"}`;
  return `자리 비운 사이에 ${news.length}번 도전받았어요! ${held === news.length ? "다 이겼어요" : held ? `${held}번 이겼어요` : "다 졌어요"}`;
}
