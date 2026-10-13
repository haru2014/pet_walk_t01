/**
 * [편안하개 - PetWalk]
 * 출발 거점 연계 공영주차장(P&R) 데이터 타입 정의 (US-G1)
 *
 * - 대전 3대 공원(유림공원, 송강근린공원, 도안호수공원) & 세종호수공원 4대 파일럿 실증 거점 지원
 * - 실제 보행 출입구 좌표(entrance_lat, entrance_lon) 기반 보행로 스냅 보장
 */

export interface ParkingLotDTO {
  readonly parking_id: string;
  readonly name: string;
  readonly distance_m: number;
  readonly entrance_lat: number;
  readonly entrance_lon: number;
  readonly is_public: boolean;
  readonly fee_type: 'free' | 'paid';
  readonly fee_info?: string;
  readonly capacity?: number;
  readonly park_zone?: string; // 예: "유림공원", "세종호수공원", "송강근린공원", "도안호수공원"
  readonly address?: string;
}

export interface NearbyParkingResponse {
  readonly isLiveServer: boolean;
  readonly total_count: number;
  readonly parking_lots: readonly ParkingLotDTO[];
  readonly search_radius_m: number;
  readonly query_center: {
    readonly lat: number;
    readonly lon: number;
  };
  readonly fetched_at: string;
}

export interface ParkingSearchOptions {
  readonly radius_m?: number;
  readonly forceRefresh?: boolean;
}
