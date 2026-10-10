/**
 * [편안하개 - PetWalk]
 * 산책 세션 훅: GPS 수신 → 안내 판정 → TTS 발화 연결 (US-C2, US-E1, US-D2)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { RouteFeatureCollection, RouteStepPin } from '../types/route';
import {
  GpsPoint,
  getTrackBuffer,
  startWalkTracking,
  stopWalkTracking,
  subscribeToGps,
  updateTrackingNotification,
} from '../services/locationService';
import {
  GuidanceState,
  INITIAL_GUIDANCE_STATE,
  REROUTE_MESSAGE,
  evaluateGuidance,
} from '../services/guidanceEngine';
import { polylineLengthMeters } from '../services/routeGeometry';
import { TTSNavigationService } from '../services/ttsNavigation';

export type WalkSessionStatus = 'idle' | 'running' | 'permission_denied' | 'error';

export interface WalkStats {
  readonly distanceKm: number;
  readonly elapsedSec: number;
  readonly speedKmH: number;
}

const EMPTY_STATS: WalkStats = { distanceKm: 0, elapsedSec: 0, speedKmH: 0 };
const MPS_TO_KMH = 3.6;

function computeDistanceKm(track: readonly GpsPoint[]): number {
  const coords = track.map((p) => [p.longitude, p.latitude] as const);
  return Math.round((polylineLengthMeters(coords) / 1000) * 100) / 100;
}

export function useWalkGuidance(initialRoute: RouteFeatureCollection, pins: readonly RouteStepPin[]) {
  const [route, setRoute] = useState(initialRoute);
  const [status, setStatus] = useState<WalkSessionStatus>('idle');
  const [stats, setStats] = useState<WalkStats>(EMPTY_STATS);
  const guidanceRef = useRef<GuidanceState>(INITIAL_GUIDANCE_STATE);
  const startedAtRef = useRef<number | null>(null);
  const routeRef = useRef(route);
  routeRef.current = route;

  const handlePoint = useCallback(
    (point: GpsPoint) => {
      const result = evaluateGuidance([point.longitude, point.latitude], routeRef.current, pins, guidanceRef.current);
      guidanceRef.current = result.nextState;
      result.events.forEach((event) => TTSNavigationService.speak(event.message));
      setStats((prev) => ({
        ...prev,
        distanceKm: computeDistanceKm(getTrackBuffer()),
        speedKmH: Math.round((point.speedMps ?? 0) * MPS_TO_KMH * 10) / 10,
      }));
    },
    [pins],
  );

  const lastNotifSecRef = useRef<number>(0);

  useEffect(() => {
    if (status !== 'running') return undefined;
    const unsubscribe = subscribeToGps(handlePoint);
    const timer = setInterval(() => {
      const startedAt = startedAtRef.current ?? Date.now();
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setStats((prev) => {
        // 30초마다 또는 0초 시작 시 노티피케이션 업데이트 ({distance}km / {duration}분)
        if (elapsed - lastNotifSecRef.current >= 30) {
          lastNotifSecRef.current = elapsed;
          void updateTrackingNotification(prev.distanceKm, Math.floor(elapsed / 60));
        }
        return { ...prev, elapsedSec: elapsed };
      });
    }, 1000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [status, handlePoint]);

  const start = useCallback(async (): Promise<WalkSessionStatus> => {
    const result = await startWalkTracking();
    const next: WalkSessionStatus = result.ok ? 'running' : result.reason;
    if (result.ok) {
      guidanceRef.current = INITIAL_GUIDANCE_STATE;
      startedAtRef.current = Date.now();
      setStats(EMPTY_STATS);
    }
    setStatus(next);
    return next;
  }, []);

  const stop = useCallback(async () => {
    await stopWalkTracking();
    setStatus('idle');
  }, []);

  /** 우회 경로 수신 시 지도 경로를 교체하고 음성으로 안내한다 (US-D2). */
  const applyReroute = useCallback((newRoute: RouteFeatureCollection) => {
    setRoute(newRoute);
    guidanceRef.current = INITIAL_GUIDANCE_STATE;
    TTSNavigationService.speak(REROUTE_MESSAGE);
  }, []);

  return { route, status, stats, start, stop, applyReroute };
}
