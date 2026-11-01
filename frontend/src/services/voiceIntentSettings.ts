import type { EnvironmentId } from '../types/walkSettings';
import type { VoiceWalkIntent } from './voiceIntentApi';

/** 다른 칩은 보존하고 음성 분석의 세 조건을 적용한다. */
export function resolveAiEnvironments(prev: EnvironmentId[], intent: VoiceWalkIntent): EnvironmentId[] {
  const selected = new Set(prev);
  const conditions: [EnvironmentId, boolean][] = [
    ['shade', intent.prefer_shade], ['soft', intent.prefer_cushion], ['stairs', intent.avoid_stairs],
  ];
  for (const [chip, enabled] of conditions) {
    if (enabled) selected.add(chip);
    else selected.delete(chip);
  }
  return [...selected];
}
