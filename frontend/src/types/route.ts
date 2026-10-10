/**
 * [편안하개 - PetWalk]
 * 모바일 경로 GeoJSON 및 스텝 핀 타입 (Phase 3, US-C1)
 * 좌표 규격: GeoJSON [lon, lat] 순서
 */

export type SegmentType = 'safe' | 'normal' | 'caution';
export type LonLat = readonly [number, number];

export interface RouteSegmentProperties {
  readonly segmentType: SegmentType;
  readonly maxSlopePercent: number;
  readonly shaded: boolean;
}

export interface RouteSegmentFeature {
  readonly type: 'Feature';
  readonly properties: RouteSegmentProperties;
  readonly geometry: {
    readonly type: 'LineString';
    readonly coordinates: readonly LonLat[];
  };
}

export interface RouteFeatureCollection {
  readonly type: 'FeatureCollection';
  readonly features: readonly RouteSegmentFeature[];
}

export interface RouteStepPin {
  readonly id: string;
  readonly kind: 'turn' | 'caution';
  readonly position: LonLat;
  readonly instruction: string;
}

export interface CourseSummary {
  readonly totalDistanceKm: number;
  readonly estimatedMinutes: number;
  readonly maxSlopePercent: number;
  readonly shadeRatioPercent: number;
}
