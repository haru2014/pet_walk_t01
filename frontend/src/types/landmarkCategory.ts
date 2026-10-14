/**
 * [편안하개 - PetWalk]
 * 행정구역 및 주요 랜드마크/공원 분류 코드 정의
 */

export type LandmarkCategoryCode =
  | 'ALL'
  | 'LM_SEJONG'
  | 'LM_YURIM'
  | 'LM_CITY_HALL'
  | 'LM_SEOUL_FOREST'
  | 'LM_GANGNAM'
  | 'LM_SEONGSAN'
  | 'LM_OTHER';

export interface LandmarkMetadata {
  readonly landmarkCode: LandmarkCategoryCode;
  readonly landmarkName: string;
  readonly regionCode: string;
  readonly regionName: string;
  readonly badgeLabel: string;
  readonly icon: string;
}

export const LANDMARK_DEFINITIONS: Record<Exclude<LandmarkCategoryCode, 'ALL'>, LandmarkMetadata> = {
  LM_SEJONG: {
    landmarkCode: 'LM_SEJONG',
    landmarkName: '세종호수공원',
    regionCode: 'SEJONG',
    regionName: '세종특별자치시',
    badgeLabel: '세종호수공원',
    icon: '🏞️',
  },
  LM_YURIM: {
    landmarkCode: 'LM_YURIM',
    landmarkName: '대전 유림공원',
    regionCode: 'DAEJEON_YUSEONG',
    regionName: '대전시 유성구',
    badgeLabel: '유림공원 · 대전',
    icon: '🌿',
  },
  LM_CITY_HALL: {
    landmarkCode: 'LM_CITY_HALL',
    landmarkName: '서울시청 · 청계천',
    regionCode: 'SEOUL_JUNG',
    regionName: '서울시 중구',
    badgeLabel: '서울시청 · 중구',
    icon: '🏛️',
  },
  LM_SEOUL_FOREST: {
    landmarkCode: 'LM_SEOUL_FOREST',
    landmarkName: '서울숲 공원',
    regionCode: 'SEOUL_SEONGDONG',
    regionName: '서울시 성동구',
    badgeLabel: '서울숲 · 성동구',
    icon: '🌳',
  },
  LM_GANGNAM: {
    landmarkCode: 'LM_GANGNAM',
    landmarkName: '강남역 일대',
    regionCode: 'SEOUL_GANGNAM',
    regionName: '서울시 강남구',
    badgeLabel: '강남역 · 강남구',
    icon: '🏙️',
  },
  LM_SEONGSAN: {
    landmarkCode: 'LM_SEONGSAN',
    landmarkName: '성산근린공원',
    regionCode: 'SEOUL_MAPO',
    regionName: '서울시 마포구',
    badgeLabel: '성산공원 · 마포구',
    icon: '🌲',
  },
  LM_OTHER: {
    landmarkCode: 'LM_OTHER',
    landmarkName: '동네 안심 보행로',
    regionCode: 'SEOUL_OTHER',
    regionName: '서울시',
    badgeLabel: '동네 산책로',
    icon: '🐾',
  },
};
