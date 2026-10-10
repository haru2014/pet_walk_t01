/**
 * [편안하개 - PetWalk]
 * 경로(Route) GeoJSON 타입 정의 (Phase 3, US-C1)
 *
 * 서버 응답 GeoJSON FeatureCollection 내 각 세그먼트의 `properties.segmentType`을
 * 기준으로 지도 Polyline 색상을 분기한다.
 * 좌표 규격: GeoJSON 표준 [경도(lon), 위도(lat)] 순서.
 */

/** 구간 속성: safe(완만/그늘), normal(일반 보도), caution(급경사/턱 주의) */
export type SegmentType = 'safe' | 'normal' | 'caution';

/** GeoJSON 좌표 [lon, lat] */
export type LonLat = readonly [number, number];

/** 노선 스텝 핀 종류 */
export type StepPinKind = 'turn' | 'caution';

export interface RouteSegmentProperties {
  readonly segmentType: SegmentType;
  /** 구간 최대 경사도 (%) */
  readonly maxSlopePercent: number;
  /** 구간 그늘 여부 */
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

/** 회전/위험 안내 스텝 핀 */
export interface RouteStepPin {
  readonly id: string;
  readonly kind: StepPinKind;
  readonly position: LonLat;
  readonly instruction: string;
}

/** 코스 요약 지표 */
export interface CourseSummary {
  readonly totalDistanceKm: number;
  readonly estimatedMinutes: number;
  readonly maxSlopePercent: number;
  readonly shadeRatioPercent: number;
}
