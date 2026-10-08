// 우리 동네: the 17 시·도 an owner can pick, in their usual order; the one list the server and the pages read.
export const CITIES = [
  { id: "seoul", name: "서울" },
  { id: "busan", name: "부산" },
  { id: "daegu", name: "대구" },
  { id: "incheon", name: "인천" },
  { id: "gwangju", name: "광주" },
  { id: "daejeon", name: "대전" },
  { id: "ulsan", name: "울산" },
  { id: "sejong", name: "세종" },
  { id: "gyeonggi", name: "경기" },
  { id: "gangwon", name: "강원" },
  { id: "chungbuk", name: "충북" },
  { id: "chungnam", name: "충남" },
  { id: "jeonbuk", name: "전북" },
  { id: "jeonnam", name: "전남" },
  { id: "gyeongbuk", name: "경북" },
  { id: "gyeongnam", name: "경남" },
  { id: "jeju", name: "제주" },
];

export const CITY_IDS = CITIES.map((c) => c.id);

export const cityName = (id) => CITIES.find((c) => c.id === id)?.name || "";
