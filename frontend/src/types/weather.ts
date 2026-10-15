/**
 * [편안하개 - PetWalk]
 * 기상청 지면열 추정 및 골든타임 데이터 타입 정의 (US-F1)
 */

export type HeatRiskLevel = 'SAFE' | 'CAUTION' | 'DANGER';

export type GoldenTimeWindowDay = 'today' | 'tomorrow' | null;

/**
 * 시간대별 지면열 및 안심 산책 위험 지수 DTO
 */
export interface HeatRiskHourDTO {
  readonly hour: number;
  readonly air_temp_celsius: number;
  readonly estimated_surface_temp: number;
  readonly risk_level: HeatRiskLevel;
  readonly is_golden_time: boolean;
  readonly notice: string;
}

/**
 * 기상청 지면열 추정 API 응답 규격
 */
export interface HeatRiskResponse {
  readonly isLiveServer: boolean;
  readonly current_hour: number;
  readonly current_air_temp: number;
  readonly current_surface_temp: number;
  readonly current_risk_level: HeatRiskLevel;
  readonly is_current_golden: boolean;
  readonly golden_time_window: string;
  readonly golden_time_window_day?: GoldenTimeWindowDay;
  readonly hourly_forecast: readonly HeatRiskHourDTO[];
  readonly notice: string;
  readonly attribution?: string | null;
  readonly insolation_source?: string;
  readonly fetched_at: string;
}

/**
 * 단말기 GPS 위경도 좌표
 */
export interface WeatherCoordinates {
  readonly lat: number;
  readonly lon: number;
}
