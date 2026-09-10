export const GIFT_TIERS = ["common", "special", "rare"];

export const GIFTS = {
  common: [
    { id: "c01", line: "오늘도 와줘서 고마워요!" },
    { id: "c02", line: "토닥토닥, 신나요!" },
    { id: "c03", line: "같이 있으니까 포근해요!" },
    { id: "c04", line: "오늘 하루도 수고했어요!" },
    { id: "c05", line: "웃는 얼굴이 최고예요!" },
    { id: "c06", line: "심심할 땐 언제든 와 주세요!" },
    { id: "c07", line: "오늘 날씨 어때요? 저는 행복해요!" },
    { id: "c08", line: "꿈에서도 같이 놀았어요!" },
    { id: "c09", line: "밥은 꼭 챙겨 먹어요!" },
    { id: "c10", line: "오늘은 왠지 특별한 날이에요!" },
    { id: "c11", line: "조금만 더 있다 가면 안 돼요?" },
    { id: "c12", line: "우리 마음은 늘 같이예요!" },
    { id: "c13", line: "힘들 땐 쉬엄쉬엄 해요!" },
    { id: "c14", line: "오늘도 반짝이는 하루예요!" },
    { id: "c15", line: "오는 소리 들리면 콩닥콩닥해요!" },
    { id: "c16", line: "같이 산책하고 싶어요!" },
    { id: "c17", line: "우리 최고예요!" },
    { id: "c18", line: "내일도 꼭 만나요! 약속이에요!" },
    { id: "c19", line: "으쌰으쌰, 힘이 불끈 나요!" },
    { id: "c20", line: "같이 놀면 시간이 순식간이에요!" },
    { id: "c21", line: "오늘 기분은 맑음이에요!" },
    { id: "c22", line: "헤헤, 또 보고 싶었어요!" },
  ],
  special: [
    { id: "s01", line: "같이 온 게 최고의 모험이에요!" },
    { id: "s02", line: "외로운 밤엔 생각나면 따뜻해져요!" },
    { id: "s03", line: "우리 만난 건 정말 다행이에요!" },
    { id: "s04", line: "오늘이 어제보다 더 행복하길 바라요!" },
    { id: "s05", line: "고마움이 가득가득 넘쳐요!" },
    { id: "s06", line: "만나면 마음이 몽글몽글해요!" },
  ],
  rare: [
    { id: "r01", line: "별빛이 반짝여요. 오늘 선물이에요!" },
    { id: "r02", line: "황금빛 조약돌을 찾았어요! 우리 거예요!" },
  ],
};

export const GIFT_COUNT = GIFTS.common.length + GIFTS.special.length + GIFTS.rare.length;
