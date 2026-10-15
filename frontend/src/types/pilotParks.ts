/**
 * [편안하개 - PetWalk]
 * 대전 3대 공원 & 세종호수공원 4대 파일럿 실증 거점 메타데이터 (US-G1, US-13, US-A1)
 */

export interface PilotPark {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly badgeLabel: string;
  readonly region: '대전' | '세종';
  readonly center: {
    readonly lat: number;
    readonly lon: number;
  };
  readonly defaultParkingName: string;
  readonly description: string;
  readonly features: readonly string[];
}

export const PILOT_PARKS: readonly PilotPark[] = [
  {
    id: 'yurim',
    name: '대전 유림공원',
    shortName: '유림공원',
    badgeLabel: '🌿 유림공원',
    region: '대전',
    center: { lat: 36.3620608, lon: 127.3601379 },
    defaultParkingName: '유림공원 부설 공영주차장',
    description: '갑천변 둔치 흙길 산책로와 반도지 둘레길이 어우러진 완만한 안심 코스',
    features: ['폭신한 흙길', '갑천변 그늘', '계단 0개'],
  },
  {
    id: 'sejong',
    name: '세종호수공원',
    shortName: '세종호수',
    badgeLabel: '🏞️ 세종호수',
    region: '세종',
    center: { lat: 36.5020, lon: 127.2680 },
    defaultParkingName: '세종호수공원 제1주차장',
    description: '국내 최대 인공호수 수변 데크와 은빛해변을 따라 걷는 평탄한 산책로',
    features: ['호수변 완만데크', '수상무대섬', '넓은 보행폭'],
  },
  {
    id: 'songgang',
    name: '대전 송강근린공원',
    shortName: '송강공원',
    badgeLabel: '🌲 송강공원',
    region: '대전',
    center: { lat: 36.4353, lon: 127.3847 },
    defaultParkingName: '송강근린공원 공영주차장',
    description: '송강동 주택가와 맞닿은 울창한 소나무 숲길과 잔디마당 순환 코스',
    features: ['풍부한 솔잎 그늘', '조용한 숲길', '흙길 75%'],
  },
  {
    id: 'doan',
    name: '대전 도안호수공원',
    shortName: '도안호수',
    badgeLabel: '🌊 도안호수',
    region: '대전',
    center: { lat: 36.3450, lon: 127.3435 },
    defaultParkingName: '도안호수공원 임시 공영주차장',
    description: '갑천 생태습지와 수변 생태공원을 잇는 광폭 평탄 산책로',
    features: ['생태 수변길', '완만한 경사', '탁 트인 시야'],
  },
];

export const DEFAULT_PILOT_PARK = PILOT_PARKS[0]; // 기본: 대전 유림공원

export function getPilotParkById(id?: string): PilotPark {
  if (!id) return DEFAULT_PILOT_PARK;
  return PILOT_PARKS.find((p) => p.id === id) ?? DEFAULT_PILOT_PARK;
}
