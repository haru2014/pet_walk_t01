import { describe, expect, it } from 'vitest';
import { buildDirectionCard, DirectionCardInput, resolveVoiceCaption, resolveWalkGoal } from './pocketScreenModel';

const BASE: DirectionCardInput = {
  accent: '#10B981',
  compact: false,
  isFreeWalk: false,
  hasPosition: true,
  gpsWaitMessage: 'GPS 신호를 찾고 있어요',
  isOffRoute: false,
  regenerateLabel: '현위치 경로 재생성',
  maneuver: null,
};

const MANEUVER = {
  current: { direction: 'right' as const, distanceM: 40, title: '우회전', detail: '', pinId: 'a' },
  following: null,
  progressRatio: 0.5,
};

describe('pocketScreenModel', () => {
  it('prioritises free walk, then GPS wait, then off-route, then navigation', () => {
    expect(buildDirectionCard({ ...BASE, isFreeWalk: true, isOffRoute: true }).variant).toBe('message');
    expect(buildDirectionCard({ ...BASE, hasPosition: false, isOffRoute: true }).variant).toBe('message');
    expect(buildDirectionCard({ ...BASE, isOffRoute: true, maneuver: MANEUVER }).variant).toBe('offRoute');
    expect(buildDirectionCard({ ...BASE, maneuver: MANEUVER }).variant).toBe('navigate');
  });

  it('maps free walk safety status to card tone', () => {
    const alert = buildDirectionCard({ ...BASE, isFreeWalk: true, freeWalkStatus: 'alert', freeWalkMessage: '전방 제보' });
    expect(alert.variant === 'message' && alert.tone).toBe('danger');
    const unavailable = buildDirectionCard({ ...BASE, isFreeWalk: true, freeWalkStatus: 'unavailable' });
    expect(unavailable.variant === 'message' && unavailable.tone).toBe('warning');
  });

  it('shows only non-turn voice guidance as a caption on the navigate card', () => {
    const card = buildDirectionCard({ ...BASE, maneuver: MANEUVER });
    expect(resolveVoiceCaption(card, '30미터 앞 우회전입니다')).toBeNull();
    expect(resolveVoiceCaption(card, '전방 약 30미터에 턱 제보가 있습니다.')).toBe('전방 약 30미터에 턱 제보가 있습니다.');
    expect(resolveVoiceCaption(buildDirectionCard(BASE), '전방 제보')).toBeNull();
  });

  it('labels the walk goal before and after the target time', () => {
    expect(resolveWalkGoal({ isFreeWalk: false, targetMinutes: 30, elapsedSec: 600 }).elapsedLabel).toBe('목표 30분');
    const over = resolveWalkGoal({ isFreeWalk: false, targetMinutes: 30, elapsedSec: 30 * 60 + 130 });
    expect(over.isOvertime).toBe(true);
    expect(over.elapsedLabel).toBe('목표 +2분');
    expect(resolveWalkGoal({ isFreeWalk: true, targetMinutes: 30, elapsedSec: 9999 }).isOvertime).toBe(false);
  });
});
