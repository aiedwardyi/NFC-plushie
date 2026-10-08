// The 12 POKKEY plushies in zodiac order: the one list the server, the pages and the games read.
// rival: its 달리기 시합 opponent; toggle: a browser can keep it as its own (?mascot=); reveal: has its own opening video.
export const KINDS = [
  { id: "rat", name: "쥐", rival: "ox", reveal: true },
  { id: "ox", name: "소", rival: "rat", reveal: true },
  { id: "tiger", name: "호랑이", rival: "rabbit", reveal: true },
  { id: "rabbit", name: "토끼", rival: "tiger", reveal: true },
  { id: "dragon", name: "용", rival: "snake", reveal: true },
  { id: "snake", name: "뱀", rival: "dragon", reveal: true },
  { id: "horse", name: "말", rival: "sheep", toggle: true, reveal: true },
  { id: "sheep", name: "양", rival: "horse", toggle: true, reveal: true },
  { id: "monkey", name: "원숭이", rival: "rooster", reveal: true },
  { id: "rooster", name: "닭", rival: "monkey", reveal: true },
  { id: "dog", name: "강아지", rival: "pig", reveal: true },
  { id: "pig", name: "돼지", rival: "dog", reveal: true },
];

export const KIND_IDS = KINDS.map((k) => k.id);
export const DEFAULT_KIND = "horse";

export const kindOf = (id) => KINDS.find((k) => k.id === id) || KINDS.find((k) => k.id === DEFAULT_KIND);

// Every file a kind needs, by public path.
export function kindFiles({ id, reveal }, worlds) {
  return [
    ...["", "-away", "-blink", "-react", "-sleepy"].map((pose) => `/mascot-${id}${pose}-512-v3.png`),
    ...["closed", "happy", "munch", "yawn"].map((face) => `/mascot-${id}-${face}-512.webp`),
    ...["", "-away", "-closed", "-happy", "-munch", "-yawn"].map((pose) => `/themes/px/${id}${pose}-px.png`),
    ...worlds.map((world) => `/themes/thumbs/${world}-${id}.webp`),
    `/game/art/race/${id}.webp`,
    `/game/art/race/${id}-locked.webp`,
    ...(reveal ? [`/reveal/diamond-${id}.mp4`] : []),
  ];
}
