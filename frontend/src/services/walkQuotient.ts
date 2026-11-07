/**
 * [편안하개 - PetWalk]
 * 산책 지수(점수·상태) 계산 단일 소스 (SSOT)
 *
 * 홈 '산책 정보' 위젯(HomeTrailInfoCardN2)과 상세보기 모달(WeatherDetailModal)은
 * 반드시 computeWalkQuotient() 하나로 점수를 구한다. 화면마다 계산식을 따로 두면
 * 같은 날씨에서도 점수가 어긋난다 (홈 92점 / 상세 100점 등).
 */
import { AirQualityDTO, HeatRiskLevel, HeatRiskResponse } from '../types/weather';

export function resolveRiskLevel(currentTemp: number, serverRiskLevel?: HeatRiskLevel): HeatRiskLevel {
  if (serverRiskLevel) return serverRiskLevel;
  if (currentTemp <= 35) return 'SAFE';
  if (currentTemp <= 45) return 'CAUTION';
  return 'DANGER';
}

export interface WalkQuotientScore {
  score: number;
  statusLabel: string;
  statusTitle: string;
  badgeBg: string;
  badgeColor: string;
  ringColor: string;
}

function calculateWalkQuotient(
  surfaceTemp: number,
  riskLevel: HeatRiskLevel,
  pop?: number,
  airQuality?: AirQualityDTO | null,
  condition?: string,
  pty?: number
): WalkQuotientScore {
  // 1. 강설(눈)이 내리는 중
  if (pty === 2 || pty === 3 || pty === 6 || pty === 7 || condition === 'snowy') {
    return {
      score: 38,
      statusLabel: '강설 주의',
      statusTitle: '눈 때문에 길이 미끄러워요.',
      badgeBg: '#EFF6FF',
      badgeColor: '#1E40AF',
      ringColor: '#3B82F6',
    };
  }

  // 2. 강우(비)가 내리는 중
  if (pty === 1 || pty === 4 || pty === 5 || condition === 'rainy') {
    return {
      score: 42,
      statusLabel: '우천 주의',
      statusTitle: '비가 와서 길이 젖어 있어요. 실내 놀이를 추천해요.',
      badgeBg: '#EFF6FF',
      badgeColor: '#1E40AF',
      ringColor: '#3B82F6',
    };
  }

  // 3. 지면 고열 위험 (45°C 초과)
  if (riskLevel === 'DANGER' || surfaceTemp > 45) {
    return {
      score: 35,
      statusLabel: '고열 주의',
      statusTitle: '한낮에는 노면이 매우 뜨거워요.',
      badgeBg: '#FEE2E2',
      badgeColor: '#B91C1C',
      ringColor: '#EF4444',
    };
  }

  // 4. 강수확률 매우 높음 (80% 이상)
  if (typeof pop === 'number' && pop >= 80) {
    return {
      score: 55,
      statusLabel: '비 예보 높음',
      statusTitle: '비가 올 가능성이 매우 높아요. 짧게 다녀오세요.',
      badgeBg: '#EEF2FF',
      badgeColor: '#4338CA',
      ringColor: '#6366F1',
    };
  }

  // 5. 강수확률 높음 (60% 이상 - 비 예보 공식 구간)
  if (typeof pop === 'number' && pop >= 60) {
    return {
      score: 65,
      statusLabel: '비 예보',
      statusTitle: '비 예보(우산 필수)가 있어요. 서두르거나 우비를 챙기세요.',
      badgeBg: '#FEF3C7',
      badgeColor: '#B45309',
      ringColor: '#F59E0B',
    };
  }

  // 6. 미세먼지 매우나쁨
  if (airQuality?.grade_label === '매우나쁨') {
    return {
      score: 45,
      statusLabel: '미세먼지 매우나쁨',
      statusTitle: '대기질이 매우 나빠요. 실내 활동을 권장해요.',
      badgeBg: '#FEE2E2',
      badgeColor: '#B91C1C',
      ringColor: '#EF4444',
    };
  }

  // 7. 지면온도 다소 높음 (35°C 초과)
  if (riskLevel === 'CAUTION' || surfaceTemp > 35) {
    return {
      score: 65,
      statusLabel: '주의',
      statusTitle: '그늘길 위주 산책이 필요해요.',
      badgeBg: '#FEF3C7',
      badgeColor: '#B45309',
      ringColor: '#F59E0B',
    };
  }

  // 8. 강수확률 다소 있음 (40% 이상)
  if (typeof pop === 'number' && pop >= 40) {
    return {
      score: 80,
      statusLabel: '비 가능성',
      statusTitle: '비가 올 수 있어요. 가까운 코스를 추천해요.',
      badgeBg: '#FEF3C7',
      badgeColor: '#B45309',
      ringColor: '#F59E0B',
    };
  }

  // 9. 미세먼지 나쁨
  if (airQuality?.grade_label === '나쁨') {
    return {
      score: 75,
      statusLabel: '미세먼지 나쁨',
      statusTitle: '미세먼지가 나빠요. 짧은 산책을 권장해요.',
      badgeBg: '#FEF3C7',
      badgeColor: '#B45309',
      ringColor: '#F59E0B',
    };
  }

  // 10. 지면온도 28°C 이하 안전
  if (surfaceTemp <= 28) {
    return {
      score: 100,
      statusLabel: '좋음',
      statusTitle: '산책하기 편한 시간이 있어요.',
      badgeBg: '#DCFCE7',
      badgeColor: '#166534',
      ringColor: '#10B981',
    };
  }

  // 11. 지면온도 28~35°C 적정
  return {
    score: 88,
    statusLabel: '좋음',
    statusTitle: '산책하기 편한 시간이 있어요.',
    badgeBg: '#DCFCE7',
    badgeColor: '#166534',
    ringColor: '#10B981',
  };
}

export const DEFAULT_SURFACE_TEMP = 23.0;
const DEFAULT_POP_PERCENT = 20;

export function resolvePopPercent(weather?: HeatRiskResponse | null): number {
  return typeof weather?.pop === 'number' ? weather.pop : DEFAULT_POP_PERCENT;
}

/**
 * 산책 지수(점수·상태)의 단일 계산 진입점 (SSOT).
 * 홈 '산책 정보' 위젯과 상세 모달(WeatherDetailModal)이 반드시 이 함수 하나로 점수를 구해야
 * 두 화면의 점수가 어긋나지 않는다.
 */
export function computeWalkQuotient(weather?: HeatRiskResponse | null): WalkQuotientScore {
  const surfaceTemp = weather?.current_surface_temp ?? DEFAULT_SURFACE_TEMP;
  return calculateWalkQuotient(
    surfaceTemp,
    resolveRiskLevel(surfaceTemp, weather?.current_risk_level),
    resolvePopPercent(weather),
    weather?.air_quality,
    weather?.condition,
    weather?.pty,
  );
}
