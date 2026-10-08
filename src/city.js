import { randomBytes } from "node:crypto";
import { kindOf } from "../public/kinds.js";
import { PET, seoulDayKey } from "./pet.js";

const DAY = 24 * 60 * 60 * 1000;

// tickets: what the day's first plushie tap gives; inbox: records kept per defender; boardMin: joined pets before a city ranks.
export const CITY = { tickets: 3, inbox: 20, boardMin: 5, board: 3, roster: 30, matchMs: 10 * 60 * 1000 };

export const cityPid = () => randomBytes(9).toString("base64url");
export const matchId = () => randomBytes(12).toString("base64url");
export const validPid = (id) => typeof id === "string" && /^[A-Za-z0-9_-]{12}$/.test(id);
export const validMatch = (id) => typeof id === "string" && /^[A-Za-z0-9_-]{16}$/.test(id);

// Picking a city: a move keeps the public id, a pet joining again gets a new one; this week's wins stay with the city that saw them.
export function joinCity(state, city, pid) {
  return state.city === city ? null : { city, cityPid: state.cityPid || pid, cityWeek: null, cityWins: null };
}

export const leaveCity = () => ({ city: null, cityPid: null, cityWeek: null, cityWins: null });

// What a defender's records lose past the cap, from a newest-first list.
export const pastInbox = (newestFirst) => newestFirst.slice(CITY.inbox);

export function ticketsLeft(state, now) {
  return state.cityDay === seoulDayKey(now) ? state.cityTickets : 0;
}

// The day's first rewarded tap fills the day's tickets; unused ones end with the Seoul day.
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

// Folds look-alikes so 씨 발, f.u.c.k and ｆｕｃｋ all read the same; anything that isn't a letter goes.
const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", "@": "a", $: "s", "!": "i" };
const fold = (text) => String(text).normalize("NFKC").toLowerCase().replace(/[013457@$!]/g, (c) => LEET[c]).replace(/[^\p{L}]/gu, "");
const BAD_WORDS = [
  "시발", "씨발", "씨빨", "시빨", "씨팔", "시팔", "씨바", "ㅅㅂ", "ㅆㅂ", "병신", "븅신", "ㅂㅅ", "개새끼", "개새기", "개색기", "새끼", "좆", "존나", "ㅈㄴ",
  "지랄", "ㅈㄹ", "미친놈", "미친년", "또라이", "꺼져", "닥쳐", "엿먹", "썅", "쌍년", "쌍놈", "걸레", "창녀", "니애미", "느금", "섹스", "야동", "보지", "자지",
  "fuck", "fuk", "fvck", "shit", "bitch", "cunt", "dick", "pussy", "asshole", "bastard", "slut", "whore", "nigger", "nigga", "faggot", "retard", "porn", "penis", "vagina", "sex",
].map(fold);

// The name other owners see: a bad word anywhere in it shows the animal's name instead.
export function shownName(name, kind) {
  const folded = fold(name || "");
  return folded && !BAD_WORDS.some((word) => folded.includes(word)) ? String(name) : kindOf(kind).name;
}

// What the pet says about the races run against it while its owner was away.
export function newsLine(news) {
  const held = news.filter((n) => n.held).length;
  if (news.length === 1) return `자리 비운 사이에 도전받았어요! ${held ? "제가 이겼어요" : "아깝게 졌어요"}`;
  return `자리 비운 사이에 ${news.length}번 도전받았어요! ${held === news.length ? "다 이겼어요" : held ? `${held}번 이겼어요` : "다 졌어요"}`;
}
