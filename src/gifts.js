export const GIFT_TIERS = ["common", "special", "rare"];

export const GIFTS = {
  common: [
    { id: "c01", line: "오늘도 와줘서 고마워!" },
    { id: "c02", line: "토닥토닥, 신나!" },
    { id: "c03", line: "같이 있으니까 포근해!" },
    { id: "c04", line: "오늘 하루도 수고했어!" },
    { id: "c05", line: "웃는 얼굴이 최고야!" },
    { id: "c06", line: "심심할 땐 언제든 와줘!" },
    { id: "c07", line: "오늘 날씨 어때? 난 행복해!" },
    { id: "c08", line: "꿈에서도 같이 놀았어!" },
    { id: "c09", line: "밥은 꼭 챙겨 먹어!" },
    { id: "c10", line: "오늘은 왠지 특별한 날이야!" },
    { id: "c11", line: "조금만 더 있다 가면 안 돼?" },
    { id: "c12", line: "우리 마음은 항상 붙어 있어!" },
    { id: "c13", line: "힘들 땐 쉬엄쉬엄 해!" },
    { id: "c14", line: "오늘도 반짝이는 하루야!" },
    { id: "c15", line: "오는 소리 들리면 콩닥콩닥해!" },
    { id: "c16", line: "같이 산책하고 싶어!" },
    { id: "c17", line: "우리 최고야!" },
    { id: "c18", line: "내일도 꼭 만나자! 약속!" },
    { id: "c19", line: "쿵짝쿵짝, 힘이 불끈 나!" },
    { id: "c20", line: "같이 놀면 시간이 순식간이야!" },
    { id: "c21", line: "오늘 기분은 맑음이야!" },
    { id: "c22", line: "헤헤, 또 보고 싶었어!" },
  ],
  special: [
    { id: "s01", line: "같이 온 게 최고의 모험이야!" },
    { id: "s02", line: "외로운 밤엔 생각나서 따뜻해져!" },
    { id: "s03", line: "백 번 태어나도 다시 만나자!" },
    { id: "s04", line: "오늘이 어제보다 더 행복하길 바라!" },
    { id: "s05", line: "고마움이 가득가득 넘쳐!" },
    { id: "s06", line: "만나면 마음이 몽글몽글해!" },
  ],
  rare: [
    { id: "r01", line: "별들이 속삭였어. 우린 짝꿍이래!" },
    { id: "r02", line: "황금빛 조약돌 찾았다! 우리 거야!" },
  ],
};

export const GIFT_COUNT = GIFTS.common.length + GIFTS.special.length + GIFTS.rare.length;
