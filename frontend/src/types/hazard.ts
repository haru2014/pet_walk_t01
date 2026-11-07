/**
 * [편안하개 - PetWalk]
 * 현장 위험 제보 및 보행로 동적 우회(Reroute) 타입 정의 (US-D2, US-C2)
 */

import { RouteFeatureCollection, RouteStepPin } from './route';

export type HazardType =
  | 'high_curb'       // 높은 턱
  | 'stairs'          // 야외 계단
  | 'construction'    // 공사/통제 구역
  | 'broken_glass'    // 유리 파편/날카로운 이물질
  | 'dog_danger'      // 들개/공격적인 맹견 출몰
  | 'none';

export type HazardSeverity = 'info' | 'warning' | 'danger';

export interface HazardReportPayload {
  readonly userId?: string;
  readonly lat: number;
  readonly lon: number;
  readonly hazardType: HazardType;
  readonly severity: HazardSeverity;
  readonly description?: string;
  readonly photoUrl?: string | null;
}

export interface RerouteRequestPayload {
  readonly currentLat: number;
  readonly currentLon: number;
  readonly destinationLat: number;
  readonly destinationLon: number;
  readonly hazardLat?: number;
  readonly hazardLon?: number;
  readonly hazardType?: HazardType;
  readonly severity?: HazardSeverity;
  readonly confidence?: number;
  readonly routeCoordinates?: readonly (readonly [number, number])[];
  readonly rerouteReason?: 'hazard' | 'deviation' | 'emergency_return';
}

export type RerouteOriginMode = 'current_location' | 'park' | 'parking_pnr';

export interface DeviationReroutePayload {
  readonly currentLat: number;
  readonly currentLon: number;
  readonly destinationLat: number;
  readonly destinationLon: number;
  readonly routeCoordinates?: readonly (readonly [number, number])[];
  /** 마지막으로 코스 위에 있던 지점의 진행 거리(m). 순환 코스에서 앞쪽 합류 지점을 고르는 데 쓴다. */
  readonly progressM?: number;
  /** 산책 출발 모드 ('current_location': 방법 A 현위치→출발지 재생성, 'park'/'parking_pnr': 방법 C 보행망 합류) */
  readonly originMode?: RerouteOriginMode;
  /** 지정 공원 식별자 ('yurim', 'sejong', 'songgang', 'doan', 'sejong_central') */
  readonly pilotParkId?: string;
  /** 남은 산책 시간/속도를 반영한 남은 목표 보행 거리(m) */
  readonly remainingDistanceM?: number;
}

export interface BlockedHazardInfo {
  readonly lat: number;
  readonly lon: number;
  readonly hazard_type: string;
  readonly severity: string;
  readonly blocked_radius_m: number;
}

export interface RerouteResult {
  readonly status: 'REROUTED' | 'KEEP_ROUTE';
  readonly needsReroute: boolean;
  readonly voiceAlert: string;
  readonly newRoute: RouteFeatureCollection;
  readonly stepPins: readonly RouteStepPin[];
  readonly newDistanceM?: number;
  readonly hazardClearanceM?: number;
  readonly isEmergencyReturn?: boolean;
  readonly rerouteStrategy?: 'regenerate_to_origin' | 'park_network_rejoin' | 'segment_rejoin';
  readonly routeSource?: string;
}
