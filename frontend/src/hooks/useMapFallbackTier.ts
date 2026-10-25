/**
 * [편안하개 - PetWalk]
 * 지도 폴백 단계 상태 훅 (T-OFM-7)
 *
 * - 기본은 1차(OpenFreeMap). degrade() 호출 시 다음 단계로 전환합니다.
 * - 테마 변경 등으로 resetKey가 바뀌면 다시 1차부터 시도합니다.
 */

import { useCallback, useState } from 'react';
import { MapFallbackTier, getNextFallbackTier } from '../constants/mapFallback';

export function useMapFallbackTier(hasStaticRoute: boolean, resetKey: string) {
  const [tierState, setTierState] = useState({ resetKey, tier: 'openfreemap' as MapFallbackTier });
  const tier = tierState.resetKey === resetKey ? tierState.tier : 'openfreemap';

  const degrade = useCallback(() => {
    setTierState((currentState) => {
      const current = currentState.resetKey === resetKey ? currentState.tier : 'openfreemap';
      return {
        resetKey,
        tier: getNextFallbackTier(current, hasStaticRoute) ?? current,
      };
    });
  }, [hasStaticRoute, resetKey]);

  return { tier, degrade };
}
