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

const LANDMARK_CENTERS: readonly LandmarkCenter[] = [
  { code: 'LM_SEJONG', lat: 36.5020, lon: 127.2680, radiusM: 5000 },
  { code: 'LM_YURIM', lat: 36.3628, lon: 127.3592, radiusM: 5000 },
  { code: 'LM_CITY_HALL', lat: 37.5663, lon: 126.9784, radiusM: 2500 },
  { code: 'LM_SEOUL_FOREST', lat: 37.5445, lon: 127.0374, radiusM: 3000 },
  { code: 'LM_GANGNAM', lat: 37.4980, lon: 127.0276, radiusM: 2500 },
  { code: 'LM_SEONGSAN', lat: 37.5680, lon: 126.9050, radiusM: 3000 },
];

function haversineDistM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function extractFirstCoord(
  coordsOrRoute: readonly (readonly [number, number])[] | RouteFeatureCollection | undefined
): [number, number] | null {
  if (!coordsOrRoute) return null;

  if ('features' in coordsOrRoute && Array.isArray(coordsOrRoute.features)) {
    const firstFeature = coordsOrRoute.features[0];
    if (firstFeature?.geometry?.coordinates?.[0]) {
      const c = firstFeature.geometry.coordinates[0];
      return [c[0], c[1]];
    }
    return null;
  }

  if (Array.isArray(coordsOrRoute) && coordsOrRoute.length > 0) {
    const first = coordsOrRoute[0];
    if (Array.isArray(first) && first.length >= 2) {
      return [first[0], first[1]];
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
  if (titleHint) {
    if (titleHint.includes('세종') || titleHint.includes('호수공원') || titleHint.includes('은빛해변')) {
      return LANDMARK_DEFINITIONS.LM_SEJONG;
    }
    if (titleHint.includes('유림') || titleHint.includes('갑천') || titleHint.includes('반도지')) {
      return LANDMARK_DEFINITIONS.LM_YURIM;
    }
    if (titleHint.includes('시청') || titleHint.includes('덕수궁') || titleHint.includes('청계천')) {
      return LANDMARK_DEFINITIONS.LM_CITY_HALL;
    }
    if (titleHint.includes('서울숲') || titleHint.includes('뚝섬')) {
      return LANDMARK_DEFINITIONS.LM_SEOUL_FOREST;
    }
    if (titleHint.includes('강남') || titleHint.includes('테헤란')) {
      return LANDMARK_DEFINITIONS.LM_GANGNAM;
    }
    if (titleHint.includes('성산') || titleHint.includes('마포')) {
      return LANDMARK_DEFINITIONS.LM_SEONGSAN;
    }
  }

  const firstCoord = extractFirstCoord(coordsOrRoute);
  if (firstCoord) {
    const [lon, lat] = firstCoord;
    let closestCenter: LandmarkCenter | null = null;
    let minDistance = Infinity;

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
  }

  return LANDMARK_DEFINITIONS.LM_OTHER;
}
