/**
 * [편안하개 - PetWalk]
 * 다크 포켓 모드 세션 훅
 * - usePocketToast: 잠깐 보였다 사라지는 안내 (언마운트 시 타이머 정리)
 * - usePocketVoiceState: 음성 안내·짖음 감지 상태 구독 (언마운트 시 해제)
 * - usePocketActions: 배변 마킹, 출발지 복귀, 경로 재생성 처리
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AmbientNoiseMonitorService } from '../services/ambientNoiseMonitor';
import { createEmergencyReturnRoute } from '../services/hazardApi';
import { TTSNavigationService } from '../services/ttsNavigation';
import { RerouteResult } from '../types/hazard';
import { BarkMuteState, SoundSettings } from '../types/voiceSettings';

type Coords = { lat: number; lon: number } | null | undefined;
type Path = readonly (readonly [number, number])[] | undefined;

const TOAST_SHORT_MS = 2500;
const TOAST_LONG_MS = 3500;

export function usePocketToast() {
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const showToast = useCallback((message: string, durationMs = TOAST_SHORT_MS) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToastMsg(message);
    timerRef.current = setTimeout(() => setToastMsg(null), durationMs);
  }, []);

  return { toastMsg, showToast };
}

export function usePocketVoiceState() {
  const [barkState, setBarkState] = useState<BarkMuteState>(() => AmbientNoiseMonitorService.getState());
  const [soundSettings, setSoundSettings] = useState<SoundSettings>(() => TTSNavigationService.getSettings());

  useEffect(() => {
    void AmbientNoiseMonitorService.startMonitoring();
    const unsubNoise = AmbientNoiseMonitorService.subscribe(setBarkState);
    const unsubTTS = TTSNavigationService.subscribe(setSoundSettings);
    return () => {
      unsubNoise();
      unsubTTS();
      AmbientNoiseMonitorService.stopMonitoring();
    };
  }, []);

  return { barkState, soundSettings };
}

export interface PocketActionsInput {
  readonly isFreeWalk: boolean;
  readonly originMode: 'current_location' | 'park' | 'parking_pnr';
  readonly poopCount: number;
  readonly currentCoords?: Coords;
  readonly startCoords?: Coords;
  readonly walkedCoords?: Path;
  readonly routeCoords?: Path;
  readonly onMarkPoop?: (type: 'poop' | 'pee') => void;
  readonly onReroute?: (result: RerouteResult) => void;
  readonly onRegenerateRoute?: () => Promise<boolean> | boolean | void;
  readonly showToast: (message: string, durationMs?: number) => void;
  /** 복귀 안내를 시작하거나 실패했을 때 모달·시트를 닫는다 */
  readonly onReturnHandled: () => void;
}

export function usePocketActions(input: PocketActionsInput) {
  const { showToast } = input;
  const isParkMode = input.originMode === 'park' || input.originMode === 'parking_pnr';
  const regenerateLabel = isParkMode ? '현위치 코스 합류' : '현위치 경로 재생성';
  const canRegenerate = !input.isFreeWalk && !!input.onRegenerateRoute;

  const markPoop = (type: 'poop' | 'pee') => {
    input.onMarkPoop?.(type);
    const label = type === 'poop' ? '대변' : '소변';
    showToast(`${label} 마킹 완료 · 총 ${input.poopCount + 1}회`);
  };

  const returnToStart = () => {
    const { currentCoords, startCoords, onReroute } = input;
    input.onReturnHandled();
    if (!currentCoords || !startCoords || !onReroute) {
      showToast('GPS 출발 위치를 확인할 수 없어 돌아가기 경로를 만들지 못했어요.', TOAST_LONG_MS);
      return;
    }
    const path = input.walkedCoords && input.walkedCoords.length > 1 ? input.walkedCoords : input.routeCoords;
    onReroute(createEmergencyReturnRoute(currentCoords.lat, currentCoords.lon, startCoords.lat, startCoords.lon, path));
    showToast('출발지로 복귀하는 경로 안내를 시작했어요.', TOAST_LONG_MS);
  };

  const regenerateRoute = async () => {
    if (!input.onRegenerateRoute) return;
    try {
      const ok = await input.onRegenerateRoute();
      if (ok === false) {
        showToast('현재 GPS 위치를 확인한 뒤 다시 시도해 주세요.', TOAST_LONG_MS);
        return;
      }
      showToast(isParkMode ? '공원 산책로를 따라 코스에 다시 합류해요.' : '현재 위치에서 출발지로 돌아오는 새 경로를 안내해요.', TOAST_LONG_MS);
    } catch {
      showToast('경로를 다시 만들지 못했어요. 잠시 후 다시 시도해 주세요.', TOAST_LONG_MS);
    }
  };

  const applyReroute = (result: RerouteResult) => {
    input.onReroute?.(result);
    showToast(result.isEmergencyReturn ? '출발지 복귀 경로 안내를 시작했어요' : '안전 우회 경로를 적용했어요', TOAST_LONG_MS);
  };

  return { regenerateLabel, canRegenerate, markPoop, returnToStart, regenerateRoute, applyReroute };
}
