/**
 * [편안하개 - PetWalk]
 * 좌표 기반 랜드마크 및 행정구역 자동 태거 (Auto-Tagger)
 */

import {
  LandmarkCategoryCode,
  LandmarkMetadata,
  LANDMARK_DEFINITIONS,
} from '../types/landmarkCategory';
import { RouteFeatureCollection } from '../types/route';

interface LandmarkCenter {
  readonly code: Exclude<LandmarkCategoryCode, 'ALL' | 'LM_OTHER'>;
  readonly lat: number;
  readonly lon: number;
  readonly radiusM: number;
}

interface RegionBounds {
  readonly minLat: number;
  readonly maxLat: number;
  readonly minLon: number;
  readonly maxLon: number;
  readonly code: string;
  readonly name: string;
}

const EARTH_RADIUS_M = 6_371_000;

const LANDMARK_CENTERS: readonly LandmarkCenter[] = [
  { code: 'LM_SEJONG', lat: 36.5020, lon: 127.2680, radiusM: 5000 },
  { code: 'LM_YURIM', lat: 36.3628, lon: 127.3592, radiusM: 5000 },
  { code: 'LM_CITY_HALL', lat: 37.5663, lon: 126.9784, radiusM: 2500 },
  { code: 'LM_SEOUL_FOREST', lat: 37.5445, lon: 127.0374, radiusM: 3000 },
  { code: 'LM_GANGNAM', lat: 37.4980, lon: 127.0276, radiusM: 2500 },
  { code: 'LM_SEONGSAN', lat: 37.5680, lon: 126.9050, radiusM: 3000 },
];

// 도시 단위의 대략적인 커버리지 경계다. 특정 공원 반경 밖에서도
// 서울로 잘못 고정하지 않도록 하며, 구/동 단위 정확도는 주장하지 않는다.
const REGION_BOUNDS: readonly RegionBounds[] = [
  { minLat: 36.1, maxLat: 36.45, minLon: 127.2, maxLon: 127.6, code: 'DAEJEON', name: '대전광역시' },
  { minLat: 36.45, maxLat: 36.7, minLon: 127.1, maxLon: 127.4, code: 'SEJONG', name: '세종특별자치시' },
  { minLat: 37.4, maxLat: 37.7, minLon: 126.8, maxLon: 127.2, code: 'SEOUL', name: '서울특별시' },
];

const TITLE_HINT_PATTERNS: readonly [RegExp, LandmarkMetadata][] = [
  [/세종|호수공원|은빛해변/, LANDMARK_DEFINITIONS.LM_SEJONG],
  [/유림|갑천|반도지/, LANDMARK_DEFINITIONS.LM_YURIM],
  [/시청|덕수궁|청계천/, LANDMARK_DEFINITIONS.LM_CITY_HALL],
  [/서울숲|뚝섬/, LANDMARK_DEFINITIONS.LM_SEOUL_FOREST],
  [/강남|테헤란/, LANDMARK_DEFINITIONS.LM_GANGNAM],
  [/성산|마포/, LANDMARK_DEFINITIONS.LM_SEONGSAN],
];

function haversineDistM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

function extractFirstCoord(
  coordsOrRoute: readonly (readonly [number, number])[] | RouteFeatureCollection | undefined
): [number, number] | null {
  if (!coordsOrRoute) return null;

  if ('features' in coordsOrRoute && Array.isArray(coordsOrRoute.features)) {
    const firstFeature = coordsOrRoute.features.at(0);
    const coord = firstFeature?.geometry?.coordinates?.at(0);
    if (coord && Array.isArray(coord) && coord.length >= 2) {
      return [coord[0], coord[1]];
    }
    return null;
  }

  if (Array.isArray(coordsOrRoute) && coordsOrRoute.length > 0) {
    const first = coordsOrRoute.at(0);
    if (Array.isArray(first) && first.length >= 2) {
      return [first[0], first[1]];
    }
  }

  return null;
}

function matchTitleHint(titleHint?: string): LandmarkMetadata | null {
  if (!titleHint) return null;
  for (const [pattern, definition] of TITLE_HINT_PATTERNS) {
    if (pattern.test(titleHint)) {
      return definition;
    }
  }
  return null;
}

/**
 * 주어진 경로 좌표 또는 GeoJSON으로부터 가장 가까운 랜드마크 및 행정구역 분류 코드를 자동 판별한다.
 */
export function detectLandmarkCategory(
  coordsOrRoute: readonly (readonly [number, number])[] | RouteFeatureCollection | undefined,
  titleHint?: string
): LandmarkMetadata {
  const firstCoord = extractFirstCoord(coordsOrRoute);
  if (firstCoord) {
    const [lon, lat] = firstCoord;
    let closestCenter: LandmarkCenter | null = null;
    let minDistance = Number.POSITIVE_INFINITY;

    for (const center of LANDMARK_CENTERS) {
      const dist = haversineDistM(lat, lon, center.lat, center.lon);
      if (dist <= center.radiusM && dist < minDistance) {
        minDistance = dist;
        closestCenter = center;
      }
    }

    if (closestCenter) {
      return LANDMARK_DEFINITIONS[closestCenter.code];
    }

    const region = REGION_BOUNDS.find(({ minLat, maxLat, minLon, maxLon }) =>
      lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon
    );
    if (region) {
      return {
        ...LANDMARK_DEFINITIONS.LM_OTHER,
        regionCode: region.code,
        regionName: region.name,
      };
    }

    // 좌표가 있으면 제목보다 실제 위치를 우선한다. 제목의 장소명이
    // 다른 지역으로 잘못 분류되는 일을 방지한다.
    return LANDMARK_DEFINITIONS.LM_OTHER;
  }

  // 경로 좌표가 없을 때만 제목으로 보조 분류한다.
  return matchTitleHint(titleHint) ?? LANDMARK_DEFINITIONS.LM_OTHER;
}
