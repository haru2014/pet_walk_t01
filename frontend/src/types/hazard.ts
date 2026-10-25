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

export interface DeviationReroutePayload {
  readonly currentLat: number;
  readonly currentLon: number;
  readonly destinationLat: number;
  readonly destinationLon: number;
  readonly routeCoordinates?: readonly (readonly [number, number])[];
  /** 마지막으로 코스 위에 있던 지점의 진행 거리(m). 순환 코스에서 앞쪽 합류 지점을 고르는 데 쓴다. */
  readonly progressM?: number;
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
}
