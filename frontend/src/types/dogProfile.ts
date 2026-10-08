/**
 * [편안하개 - PetWalk]
 * 반려견 프로필 모델 및 보행 속도 상수 엔진 (US-A2, US-A3)
 * 
 * 웰니스 카피라이팅 원칙 준수:
 * - '슬개골 탈구', '관절염' 등 질병 용어 원천 배제
 * - '관절 안심 케어 수준 (0: 일반, 1: 안심케어, 2: 적극보호)'으로 긍정적 순화
 */

export type JointCareLevel = 0 | 1 | 2; // 0: 일반 활성견, 1: 안심 케어, 2: 적극 보호

export interface DogProfile {
  id: string;
  name: string;                    // 반려견 이름 (예: '초코')
  breed: string;                   // 견종 (예: '말티즈')
  ageYears: number;                // 나이 (예: 9)
  weightKg: number;                // 체중 (kg) (예: 4.2)
  jointCareLevel: JointCareLevel;  // 관절 안심 케어 등급
  speedKmH: number;                // 권장 보행 속도 (km/h)
  photoUri?: string;               // 프로필 이미지 URL/URI
  createdAt: string;
  updatedAt: string;
}

/** 체급 및 연령에 따른 표준 보행 속도 계산 모델 (US-A3 스펙) */
export function calculateRecommendedSpeedKmH(
  weightKg: number,
  ageYears: number,
  jointCareLevel: JointCareLevel = 0
): number {
  // 1. 노령견(8세 이상) 또는 적극보호(레벨 2)인 경우
  if (ageYears >= 8 || jointCareLevel === 2) {
    return 2.2; // 노령견/적극보호: 2.2 km/h
  }

  // 2. 체급별 기준
  if (weightKg < 7.0) {
    return 2.8; // 소형견: 2.8 km/h
  } else if (weightKg <= 18.0) {
    return 3.6; // 중형견: 3.6 km/h
  } else {
    return 4.2; // 대형견: 4.2 km/h
  }
}

/** 웰니스 카피라이팅 라벨 변환 헬퍼 */
export function getJointCareLabel(level: JointCareLevel): string {
  switch (level) {
    case 2:
      return '적극 보호 (폭신한 평지 위주)';
    case 1:
      return '관절 안심 케어 (완만길 추천)';
    case 0:
    default:
      return '일반 활성견 (자유 보행)';
  }
}
