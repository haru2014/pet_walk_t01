/**
 * [편안하개 - PetWalk]
 * 위치 정보 수집 동의 제어 훅 (US-23)
 *
 * 산책 시작 직전 위치 동의 여부를 확인하고 필요 시 투명 고지 모달을 노출
 */

import { useState, useRef, useCallback } from 'react';
import { ConsentService } from '../services/consentService';

export interface LocationConsentController {
  visible: boolean;
  ensureConsent: () => Promise<boolean>;
  agree: () => Promise<void>;
  decline: () => void;
}

export function useLocationConsent(): LocationConsentController {
  const [visible, setVisible] = useState(false);
  const resolverRef = useRef<((agreed: boolean) => void) | null>(null);

  const ensureConsent = useCallback(async (): Promise<boolean> => {
    const alreadyAgreed = await ConsentService.hasAgreed();
    if (alreadyAgreed) return true;

    setVisible(true);
    return new Promise<boolean>((resolve) => {
      if (resolverRef.current) {
        resolverRef.current(false);
      }
      resolverRef.current = resolve;
    });
  }, []);

  const agree = useCallback(async () => {
    await ConsentService.saveAgreement();
    setVisible(false);
    if (resolverRef.current) {
      resolverRef.current(true);
      resolverRef.current = null;
    }
  }, []);

  const decline = useCallback(() => {
    setVisible(false);
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
  }, []);

  return {
    visible,
    ensureConsent,
    agree,
    decline,
  };
}
