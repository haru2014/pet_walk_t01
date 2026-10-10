/**
 * [편안하개 - PetWalk]
 * 반려견 프로필 타입 및 속도 모델 (US-A2, US-A3)
 */

export type JointCareLevel = 0 | 1 | 2; // 0: 일반, 1: 주의, 2: 적극보호

export interface DogProfile {
  id: string;
  name: string;
  breed: string;
  ageYears: number;
  weightKg: number;
  jointCareLevel: JointCareLevel;
  speedKmH: number;
  preference?: string;
  avatarUrl?: string;
  photoUri?: string;
  createdAt: string;
  updatedAt: string;
}

export function calculateRecommendedSpeedKmH(
  weightKg: number,
  ageYears: number,
  jointCareLevel: JointCareLevel
): number {
  let baseSpeed = 3.6; // 중형견 기본
  if (weightKg < 10) baseSpeed = 2.8;      // 소형견
  else if (weightKg >= 25) baseSpeed = 4.2; // 대형견

  // 노령견(8세 이상) 감속
  if (ageYears >= 8) baseSpeed *= 0.85;

  // 관절 안심 케어 수준에 따른 감속
  if (jointCareLevel === 1) baseSpeed *= 0.90;
  else if (jointCareLevel === 2) baseSpeed *= 0.80;

  return Math.round(baseSpeed * 10) / 10;
}

export function getJointCareLabel(level: JointCareLevel): string {
  switch (level) {
    case 0: return '일반 활력 보행';
    case 1: return '관절 안심 케어 (주의)';
    case 2: return '관절 집중 안심 케어 (적극보호)';
  }
}

export const DEFAULT_DOGS: readonly DogProfile[] = [
  {
    id: 'dog_choco',
    name: '초코',
    breed: '말티즈',
    ageYears: 3,
    weightKg: 4.2,
    jointCareLevel: 1,
    speedKmH: 2.5,
    preference: '30분 산책 선호',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'dog_kong',
    name: '콩이',
    breed: '푸들',
    ageYears: 5,
    weightKg: 5.8,
    jointCareLevel: 2,
    speedKmH: 2.2,
    preference: '천천히 걷는 산책 선호',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

