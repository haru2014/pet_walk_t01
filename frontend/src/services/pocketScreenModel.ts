/**
 * [편안하개 - PetWalk]
 * 다크 포켓 모드 화면 표시 규칙 (순수 함수)
 * 상단 방향 카드 상태, 음성 캡션, 하단 시트 문구를 입력값으로부터 결정한다.
 */

import type { PocketDirectionCardProps } from '../components/walk/PocketDirectionCard';
import type { FreeWalkSafetyStatus } from '../hooks/useWalkGuidance';
import type { PocketManeuver } from './pocketManeuver';

/** 회전 안내 문장은 방향 카드가 대신 보여주므로 캡션에서 제외한다. */
const TURN_MESSAGE_PATTERN = /좌회전|우회전|유턴|직진/;

const FREE_WALK_DEFAULT_MESSAGE = '위험 제보나 경사 정보가 아직 없어요. 발밑을 가볍게 살피며 이동해 볼까요?';

type CardTone = 'normal' | 'warning' | 'danger';

const FREE_WALK_TONES: Record<FreeWalkSafetyStatus, CardTone> = {
  checking: 'normal',
  unknown: 'normal',
  unavailable: 'warning',
  alert: 'danger',
};

export interface DirectionCardInput {
  readonly accent: string;
  readonly compact: boolean;
  readonly isFreeWalk: boolean;
  readonly freeWalkStatus?: FreeWalkSafetyStatus;
  readonly freeWalkMessage?: string;
  readonly hasPosition: boolean;
  readonly gpsWaitMessage: string;
  readonly isOffRoute: boolean;
  readonly regenerateLabel: string;
  readonly onRegenerate?: () => void;
  readonly maneuver: PocketManeuver | null;
  readonly guidanceMessage?: string;
}

function buildFreeWalkCard(input: DirectionCardInput): PocketDirectionCardProps {
  const tone = input.freeWalkStatus ? FREE_WALK_TONES[input.freeWalkStatus] : 'normal';
  return {
    variant: 'message',
    accent: input.accent,
    compact: input.compact,
    icon: tone === 'normal' ? 'shield' : 'alert',
    title: tone === 'danger' ? '주변 안전 알림' : '자유 산책 중',
    message: input.freeWalkMessage ?? FREE_WALK_DEFAULT_MESSAGE,
    tone,
  };
}

/** 상단 방향 카드가 보여줄 상태를 우선순위대로 결정한다. */
export function buildDirectionCard(input: DirectionCardInput): PocketDirectionCardProps {
  const { accent, compact } = input;
  if (input.isFreeWalk) return buildFreeWalkCard(input);
  if (!input.hasPosition) {
    return { variant: 'message', accent, compact, icon: 'location', title: '위치를 찾는 중', message: input.gpsWaitMessage };
  }
  if (input.isOffRoute) {
    return { variant: 'offRoute', accent, compact, actionLabel: input.regenerateLabel, onAction: input.onRegenerate };
  }
  if (input.maneuver) return { variant: 'navigate', accent, compact, maneuver: input.maneuver };
  return {
    variant: 'message',
    accent,
    compact,
    icon: 'paw',
    title: '산책 안내',
    message: input.guidanceMessage ?? '산책 경로를 따라 이동해 주세요.',
  };
}

/** 방향 카드가 보여주지 않는 음성 안내(위험 제보, 진행 안내 등)만 캡션으로 노출한다. */
export function resolveVoiceCaption(card: PocketDirectionCardProps, guidanceMessage?: string): string | null {
  if (card.variant !== 'navigate' || !guidanceMessage) return null;
  return TURN_MESSAGE_PATTERN.test(guidanceMessage) ? null : guidanceMessage;
}

export interface WalkGoalInput {
  readonly isFreeWalk: boolean;
  readonly targetMinutes?: number | null;
  readonly elapsedSec: number;
}

export interface WalkGoalState {
  readonly isOvertime: boolean;
  readonly overtimeMinutes: number;
  /** 하단 시트 경과 시간 아래 라벨 */
  readonly elapsedLabel: string;
  /** 시트를 펼쳤을 때 보이는 안내 문구 */
  readonly hint: string;
}

export function resolveWalkGoal({ isFreeWalk, targetMinutes, elapsedSec }: WalkGoalInput): WalkGoalState {
  if (isFreeWalk) {
    return { isOvertime: false, overtimeMinutes: 0, elapsedLabel: '경과 시간', hint: '자유 산책 모드 · 시간 제한 없이 안심 기록 중' };
  }
  if (!targetMinutes) {
    return { isOvertime: false, overtimeMinutes: 0, elapsedLabel: '경과 시간', hint: '화면이 꺼져도 음성으로 안내해요' };
  }
  const overtimeSec = elapsedSec - targetMinutes * 60;
  if (overtimeSec < 0) {
    return {
      isOvertime: false,
      overtimeMinutes: 0,
      elapsedLabel: `목표 ${targetMinutes}분`,
      hint: `목표 ${targetMinutes}분 · 화면이 꺼져도 음성으로 안내해요`,
    };
  }
  const overtimeMinutes = Math.floor(overtimeSec / 60);
  return {
    isOvertime: true,
    overtimeMinutes,
    elapsedLabel: `목표 +${overtimeMinutes}분`,
    hint: `목표 ${targetMinutes}분 달성 (+${overtimeMinutes}분) · 자유 산책 기록 지속 중`,
  };
}
