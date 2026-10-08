// The 12 POKKEY plushies in zodiac order: the one list the server, the pages and the games read.
// rival: its 달리기 시합 opponent; toggle: a browser can keep it as its own (?mascot=); reveal: has its own opening video.
// mouth: where its munch mouth ends; lift, shift: how far its want bubble rises and steps right to clear the ears. Measured from the art, as fractions of the frame.
export const KINDS = [
  { id: "rat", name: "쥐", rival: "ox", reveal: true, mouth: 0.55, lift: 0.24, shift: 0.23 },
  { id: "ox", name: "소", rival: "rat", reveal: true, mouth: 0.54, lift: 0.22, shift: 0.23 },
  { id: "tiger", name: "호랑이", rival: "rabbit", reveal: true, mouth: 0.52, lift: 0.24, shift: 0.15 },
  { id: "rabbit", name: "토끼", rival: "tiger", reveal: true, mouth: 0.57, lift: 0, shift: 0.02 },
  { id: "dragon", name: "용", rival: "snake", reveal: true, mouth: 0.55, lift: 0.1, shift: 0.06 },
  { id: "snake", name: "뱀", rival: "dragon", reveal: true, mouth: 0.45, lift: 0.13, shift: 0.07 },
  { id: "horse", name: "말", rival: "sheep", toggle: true, reveal: true, mouth: 0.52, lift: 0, shift: 0 },
  { id: "sheep", name: "양", rival: "horse", toggle: true, reveal: true, mouth: 0.54, lift: 0.15, shift: 0.1 },
  { id: "monkey", name: "원숭이", rival: "rooster", reveal: true, mouth: 0.53, lift: 0.15, shift: 0.21 },
  { id: "rooster", name: "닭", rival: "monkey", reveal: true, mouth: 0.58, lift: 0, shift: 0.02 },
  { id: "dog", name: "강아지", rival: "pig", reveal: true, mouth: 0.52, lift: 0.19, shift: 0.2 },
  { id: "pig", name: "돼지", rival: "dog", reveal: true, mouth: 0.54, lift: 0.23, shift: 0.16 },
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
    ...(reveal ? [`/reveal/diamond-${id}.mp4`] : []),
  ];
}
