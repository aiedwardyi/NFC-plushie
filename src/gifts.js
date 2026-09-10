export const GIFT_TIERS = ["common", "special", "rare"];

export const GIFTS = {
  common: [
    { id: "c01", line: "오늘도 와줘서 고마워요!" },
    { id: "c02", line: "당신 냄새가 제일 좋아요." },
    { id: "c03", line: "토닥토닥, 저도 토닥여드릴게요." },
    { id: "c04", line: "같이 있으니까 포근해요." },
    { id: "c05", line: "오늘 하루도 수고했어요!" },
    { id: "c06", line: "당신 웃는 얼굴이 좋아요." },
    { id: "c07", line: "심심할 땐 언제든 와주세요." },
    { id: "c08", line: "따뜻한 손이에요. 히히." },
    { id: "c09", line: "오늘 날씨 어때요? 저는 행복해요." },
    { id: "c10", line: "꿈에서도 당신을 만났어요." },
    { id: "c11", line: "밥은 꼭 챙겨 먹어요!" },
    { id: "c12", line: "당신 덕분에 오늘이 특별해요." },
    { id: "c13", line: "조금만 더 있다 가면 안 돼요?" },
    { id: "c14", line: "제 마음은 항상 당신 곁에 있어요." },
    { id: "c15", line: "힘들 땐 저를 꼭 안아주세요." },
    { id: "c16", line: "오늘도 반짝이는 하루예요!" },
    { id: "c17", line: "당신 발소리가 들리면 심장이 콩닥거려요." },
    { id: "c18", line: "같이 산책하고 싶어요." },
    { id: "c19", line: "당신이 최고예요!" },
    { id: "c20", line: "내일도 꼭 만나요. 약속!" },
    { id: "c21", line: "포옹 한 번에 힘이 불끈 나요." },
    { id: "c22", line: "사랑해요, 진심으로!" },
  ],
  special: [
    { id: "s01", line: "당신을 만나러 온 건 제 인생 최고의 모험이에요." },
    { id: "s02", line: "외로운 밤마다 당신을 떠올리면 따뜻해져요." },
    { id: "s03", line: "백 번을 태어나도 당신 인형이 되고 싶어요." },
    { id: "s04", line: "당신의 오늘이 어제보다 조금 더 행복하길 바라요." },
    { id: "s05", line: "고마운 마음이 몸보다 커져서 터질 것 같아요!" },
    { id: "s06", line: "운명은 당신 손바닥 온도였나 봐요." },
  ],
  rare: [
    { id: "r01", line: "별들이 속삭였어요. 당신이 제 사람이라고." },
    { id: "r02", line: "이 마음, 영원히 당신 거예요. 황금빛 약속!" },
  ],
};

export const GIFT_COUNT = GIFTS.common.length + GIFTS.special.length + GIFTS.rare.length;
