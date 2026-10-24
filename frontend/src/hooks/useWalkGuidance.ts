/**
 * [편안하개 - PetWalk]
 * 산책 세션 훅: GPS 수신 → 안내 판정 → TTS 발화 연결 (US-C2, US-E1, US-D2)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Vibration, Platform } from 'react-native';
import { RouteFeatureCollection, RouteStepPin } from '../types/route';
import { PoopEvent } from '../types/storage';
import {
  GpsPoint,
  getTrackBuffer,
  getPersistedTrackBuffer,
  startWalkTracking,
  stopWalkTracking,
  subscribeToGps,
  updateTrackingNotification,
} from '../services/locationService';
import { clearBackgroundGuidanceSession, saveBackgroundGuidanceSession } from '../services/backgroundWalkGuidance';
import {
  GuidanceEvent,
  GuidanceState,
  INITIAL_GUIDANCE_STATE,
  REROUTE_MESSAGE,
  evaluateGuidance,
  resetGuidanceForNewRoute,
  routeEnd,
} from '../services/guidanceEngine';
import { haversineMeters, polylineLengthMeters } from '../services/routeGeometry';
import { TTSNavigationService } from '../services/ttsNavigation';
import {
  getForwardHazardReports,
  getForwardSafetyAnalysis,
  getNearbyHazardReports,
  HAZARD_TYPE_LABELS,
  NearbyHazardReport,
  ForwardSafetyAnalysis,
  requestDeviationReroute,
} from '../services/hazardApi';

export type WalkSessionStatus = 'idle' | 'running' | 'permission_denied' | 'error';
export type WalkSessionMode = 'route' | 'free';
export type FreeWalkSafetyStatus = 'checking' | 'unknown' | 'unavailable' | 'alert';

export interface FreeWalkSafetyInfo {
  readonly status: FreeWalkSafetyStatus;
  readonly message: string;
}

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

/** 이탈·출발지 이동 안내는 진행 중인 발화 뒤 맨 앞 순번으로 올린다. */
export function speakGuidanceEvent(event: GuidanceEvent): void {
  if (event.category === 'turn') {
    TTSNavigationService.speakTurn(event.message);
    return;
  }
  const urgent = event.kind === 'off_route' || event.kind === 'to_start';
  TTSNavigationService.speak(event.message, undefined, false, urgent ? 'high' : 'normal');
}

const UNKNOWN_SAFETY_INFO: FreeWalkSafetyInfo = {
  status: 'unknown',
  message: '위험 제보나 경사 정보가 아직 없어요. 발밑을 가볍게 살피며 여유롭게 이동해 볼까요?',
};

function deriveHeading(point: GpsPoint, previous: GpsPoint | null): number | null {
  if (point.accuracyM == null || point.accuracyM > 35) return null;
  if (point.headingDeg != null && point.headingDeg >= 0 && point.headingDeg < 360
    && (point.speedMps ?? 0) >= 0.5) return point.headingDeg;
  if (!previous || point.accuracyM == null || point.accuracyM > 25) return null;
  const distance = haversineMeters(
    [previous.latitude, previous.longitude],
    [point.latitude, point.longitude],
  );
  if (distance < 8) return null;
  const lat1 = (previous.latitude * Math.PI) / 180;
  const lat2 = (point.latitude * Math.PI) / 180;
  const deltaLon = ((point.longitude - previous.longitude) * Math.PI) / 180;
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function formatHazardDistance(meters: number): number {
  return Math.max(10, Math.round(meters / 10) * 10);
}

function formatHazardAlert(report: NearbyHazardReport, distanceM: number): string {
  return `전방 약 ${formatHazardDistance(distanceM)}미터에 ${HAZARD_TYPE_LABELS[report.hazard_type]} 제보가 있습니다. 주의해서 이동해 주세요.`;
}

function formatForwardSafetyMessage(analysis: ForwardSafetyAnalysis): string | null {
  const messages: string[] = [];
  if (analysis.slope.status === 'warning') {
    const distance = analysis.slope.warning_distance_m == null ? '' : ` 약 ${formatHazardDistance(analysis.slope.warning_distance_m)}미터 앞에`;
    const direction = analysis.slope.direction ?? '급경사';
    messages.push(`전방${distance} ${direction} 구간이 있습니다. 주의해서 이동해 주세요.`);
  }
  if (analysis.stairs.status === 'warning' && (analysis.stairs.count ?? 0) > 0) {
    messages.push(`전방 보행 경로에 OSM에 등록된 계단 ${analysis.stairs.count}곳이 있습니다. 주변을 살펴 이동해 주세요.`);
  }
  return messages.length ? messages.join(' ') : null;
}

/**
 * GPS 점 수신 시 안내 평가 및 이탈 시 서버 재탐색 파이프라인
 */
export async function handleGuidancePoint(
  point: GpsPoint,
  currentRoute: RouteFeatureCollection,
  activePins: readonly RouteStepPin[],
  guidanceState: GuidanceState,
  callbacks: {
    speak?: (event: GuidanceEvent) => void;
    applyReroute: (newRoute: RouteFeatureCollection, newPins?: readonly RouteStepPin[], voiceAlert?: string) => void;
    requestReroute?: typeof requestDeviationReroute;
  },
  isRerouting = false,
): Promise<{ nextState: GuidanceState; triggeredReroute: boolean; guidanceMessage: string | null }> {
  const result = evaluateGuidance([point.longitude, point.latitude], currentRoute, activePins, guidanceState);
  const nextState = result.nextState;
  const speak = callbacks.speak ?? speakGuidanceEvent;
  const requestReroute = callbacks.requestReroute ?? requestDeviationReroute;

  result.events.forEach((event) => speak(event));

  const hasOffRoute = result.events.some((e) => e.kind === 'off_route');
  let triggeredReroute = false;

  if (hasOffRoute && !isRerouting) {
    triggeredReroute = true;
    const end = routeEnd(currentRoute);
    const destinationLon = end ? end[0] : point.longitude;
    const destinationLat = end ? end[1] : point.latitude;
    const coords = currentRoute.features[0]?.geometry?.coordinates as [number, number][] | undefined;

    try {
      const rerouteRes = await requestReroute({
        currentLat: point.latitude,
        currentLon: point.longitude,
        destinationLat,
        destinationLon,
        routeCoordinates: coords,
      });

      if (rerouteRes.needsReroute && rerouteRes.newRoute) {
        callbacks.applyReroute(rerouteRes.newRoute, rerouteRes.stepPins, rerouteRes.voiceAlert);
      }
    } catch (err) {
      console.warn('[handleGuidancePoint] 이탈 재탐색 요청 처리 중 오류:', err);
    }
  }

  return { nextState, triggeredReroute, guidanceMessage: result.events.at(-1)?.message ?? null };
}

export function useWalkGuidance(initialRoute: RouteFeatureCollection, pins: readonly RouteStepPin[]) {
  const [route, setRoute] = useState(initialRoute);
  const [activePins, setActivePins] = useState<readonly RouteStepPin[]>(pins);
  const [status, setStatus] = useState<WalkSessionStatus>('idle');
  const [stats, setStats] = useState<WalkStats>(EMPTY_STATS);
  const [mode, setMode] = useState<WalkSessionMode>('route');
  const [currentPoint, setCurrentPoint] = useState<GpsPoint | null>(null);
  const [guidanceMessage, setGuidanceMessage] = useState('경로 안내를 준비하고 있어요.');
  const [freeWalkSafety, setFreeWalkSafety] = useState<FreeWalkSafetyInfo>(UNKNOWN_SAFETY_INFO);
  const modeRef = useRef<WalkSessionMode>('route');
  const guidanceRef = useRef<GuidanceState>(INITIAL_GUIDANCE_STATE);
  const startedAtRef = useRef<number | null>(null);
  const routeRef = useRef(route);
  const activePinsRef = useRef(activePins);
  useEffect(() => {
    routeRef.current = route;
  }, [route]);
  useEffect(() => {
    activePinsRef.current = activePins;
  }, [activePins]);

  const [poopEvents, setPoopEvents] = useState<PoopEvent[]>([]);
  const lastPointRef = useRef<GpsPoint | null>(null);
  const isReroutingRef = useRef(false);
  const nearbyHazardsRef = useRef<readonly NearbyHazardReport[]>([]);
  const announcedHazardIdsRef = useRef<Set<string>>(new Set());
  const lastSafetyQueryRef = useRef<{ timestamp: number; lat: number; lon: number } | null>(null);
  const safetyQueryInFlightRef = useRef(false);

  /** 우회/재탐색 경로 수신 시 지도 경로를 교체하고 음성으로 안내한다 (US-D2). */
  const applyReroute = useCallback(
    (newRoute: RouteFeatureCollection, newPins?: readonly RouteStepPin[], voiceAlert?: string, activateRouteGuidance = false) => {
      setRoute(newRoute);
      routeRef.current = newRoute;
      if (activateRouteGuidance) {
        modeRef.current = 'route';
        setMode('route');
      }
      if (voiceAlert) setGuidanceMessage(voiceAlert);
      if (newPins && newPins.length > 0) {
        setActivePins(newPins);
        activePinsRef.current = newPins;
      }
      const resetState = resetGuidanceForNewRoute(guidanceRef.current);
      guidanceRef.current = {
        ...resetState,
        // 재탐색 음성에서 첫 합류 지점을 이미 안내했으므로 바로 반복 발화하지 않는다.
        announcedPinIds: voiceAlert && newPins?.[0] ? [newPins[0].id] : resetState.announcedPinIds,
      };
      void saveBackgroundGuidanceSession(newRoute, newPins ?? activePinsRef.current, guidanceRef.current);
      TTSNavigationService.speak(voiceAlert ?? REROUTE_MESSAGE);
    },
    [],
  );

  const handlePoint = useCallback(
    (point: GpsPoint) => {
      setCurrentPoint(point);
      const previousPoint = lastPointRef.current;
      lastPointRef.current = point;
      if (modeRef.current === 'free') {
        const heading = deriveHeading(point, previousPoint);
        const canLocate = point.accuracyM != null && point.accuracyM <= 35;
        if (!canLocate || heading == null) {
          setFreeWalkSafety({
            status: 'unknown',
            message: !canLocate
              ? 'GPS 정확도가 낮아 전방 안전 정보를 확인할 수 없어요.'
              : '이동 방향을 확인하면 등록된 전방 위험 제보를 확인해요.',
          });
        } else {
          const frontHazards = getForwardHazardReports(
            nearbyHazardsRef.current,
            point.latitude,
            point.longitude,
            heading,
          ).filter((report) => report.severity !== 'info');
          const nearestHazard = frontHazards[0];
          if (nearestHazard) {
            const shouldAnnounce = !announcedHazardIdsRef.current.has(nearestHazard.report_id);
            announcedHazardIdsRef.current.add(nearestHazard.report_id);
            const distance = haversineMeters([point.latitude, point.longitude], [nearestHazard.lat, nearestHazard.lon]);
            const message = formatHazardAlert(nearestHazard, distance);
            setFreeWalkSafety({ status: 'alert', message });
            if (shouldAnnounce) TTSNavigationService.speak(message, undefined, false, 'high');
          } else {
            setFreeWalkSafety(UNKNOWN_SAFETY_INFO);
          }

          const lastQuery = lastSafetyQueryRef.current;
          const movedSinceQuery = lastQuery
            ? haversineMeters([lastQuery.lat, lastQuery.lon], [point.latitude, point.longitude])
            : Number.POSITIVE_INFINITY;
          const shouldQuery = !lastQuery || point.timestamp - lastQuery.timestamp >= 30000 || movedSinceQuery >= 80;
          if (shouldQuery && !safetyQueryInFlightRef.current) {
            safetyQueryInFlightRef.current = true;
            lastSafetyQueryRef.current = { timestamp: point.timestamp, lat: point.latitude, lon: point.longitude };
            setFreeWalkSafety({ status: 'checking', message: '전방 보행로의 계단·경사와 등록된 위험 제보를 확인하고 있어요.' });
            void Promise.allSettled([
              getNearbyHazardReports(point.latitude, point.longitude),
              getForwardSafetyAnalysis(point.latitude, point.longitude, heading),
            ]).then((results) => {
              if (modeRef.current !== 'free') return;
              const [hazardResult, safetyResult] = results;
              const reports = hazardResult.status === 'fulfilled' ? hazardResult.value : [];
              if (hazardResult.status === 'fulfilled') nearbyHazardsRef.current = reports;
              const latestPoint = lastPointRef.current ?? point;
              const currentHeading = deriveHeading(latestPoint, point);
              const ahead = currentHeading == null ? [] : getForwardHazardReports(
                reports,
                latestPoint.latitude,
                latestPoint.longitude,
                currentHeading,
              ).filter((report) => report.severity !== 'info');
              const nearestHazard = ahead[0];
              const safetyAlert = safetyResult.status === 'fulfilled'
                ? formatForwardSafetyMessage(safetyResult.value) : null;
              if (nearestHazard) {
                const shouldAnnounce = !announcedHazardIdsRef.current.has(nearestHazard.report_id);
                announcedHazardIdsRef.current.add(nearestHazard.report_id);
                const distance = haversineMeters(
                  [latestPoint.latitude, latestPoint.longitude],
                  [nearestHazard.lat, nearestHazard.lon],
                );
                const message = [formatHazardAlert(nearestHazard, distance), safetyAlert].filter(Boolean).join(' ');
                setFreeWalkSafety({ status: 'alert', message });
                if (shouldAnnounce) TTSNavigationService.speak(message, undefined, false, 'high');
              } else if (safetyAlert) {
                const key = safetyAlert;
                const shouldAnnounce = !announcedHazardIdsRef.current.has(key);
                announcedHazardIdsRef.current.add(key);
                setFreeWalkSafety({ status: 'alert', message: safetyAlert });
                if (shouldAnnounce) TTSNavigationService.speak(safetyAlert, undefined, false, 'high');
              } else {
                const checks: string[] = [];
                if (safetyResult.status === 'rejected' || safetyResult.value?.slope.status === 'unknown') checks.push('경사 DEM 자료 미확인');
                if (safetyResult.status === 'rejected' || safetyResult.value?.stairs.status === 'unknown') checks.push('계단 OSM 자료 미확인');
                if (safetyResult.status === 'fulfilled' && safetyResult.value.route_status === 'unknown') checks.push('전방 보행로 분석 불가');
                if (hazardResult.status === 'rejected') checks.push('위험 제보 서버 미응답');
                setFreeWalkSafety({
                  status: 'unknown', message: checks.length
                    ? `${checks.join(' · ')}. 자료가 없다고 안전한 것은 아닙니다.`
                    : UNKNOWN_SAFETY_INFO.message
                });
              }
            })
              .catch((error) => {
                console.warn('[useWalkGuidance] 자유 산책 안전정보 조회 실패:', error);
                setFreeWalkSafety({
                  status: 'unavailable',
                  message: '서버에서 위험 제보를 확인하지 못했어요. 주변 안전 정보는 미확인입니다.',
                });
              })
              .finally(() => {
                safetyQueryInFlightRef.current = false;
              });
          }
        }
      }
      const rerouting = isReroutingRef.current;

      if (modeRef.current === 'route') void handleGuidancePoint(
        point,
        routeRef.current,
        activePins,
        guidanceRef.current,
        {
          speak: speakGuidanceEvent,
          applyReroute,
          requestReroute: requestDeviationReroute,
        },
        rerouting,
      )
        .then((res) => {
          guidanceRef.current = res.nextState;
          void saveBackgroundGuidanceSession(routeRef.current, activePins, guidanceRef.current);
          if (res.guidanceMessage) setGuidanceMessage(res.guidanceMessage);
          if (res.triggeredReroute) {
            isReroutingRef.current = true;
          }
        })
        .finally(() => {
          isReroutingRef.current = false;
        });

      setStats((prev) => ({
        ...prev,
        distanceKm: computeDistanceKm(getTrackBuffer()),
        speedKmH: Math.round((point.speedMps ?? 0) * MPS_TO_KMH * 10) / 10,
      }));
    },
    [activePins, applyReroute],
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

  const start = useCallback(async (nextMode: WalkSessionMode = 'route'): Promise<WalkSessionStatus> => {
    guidanceRef.current = INITIAL_GUIDANCE_STATE;
    await saveBackgroundGuidanceSession(routeRef.current, activePinsRef.current, guidanceRef.current);
    const result = await startWalkTracking();
    const next: WalkSessionStatus = result.ok ? 'running' : result.reason;
    if (result.ok) {
      modeRef.current = nextMode;
      setMode(nextMode);
      lastPointRef.current = null;
      nearbyHazardsRef.current = [];
      announcedHazardIdsRef.current = new Set();
      lastSafetyQueryRef.current = null;
      safetyQueryInFlightRef.current = false;
      setCurrentPoint(null);
      setGuidanceMessage('경로 안내를 준비하고 있어요.');
      setFreeWalkSafety(UNKNOWN_SAFETY_INFO);
      guidanceRef.current = INITIAL_GUIDANCE_STATE;
      startedAtRef.current = Date.now();
      setStats(EMPTY_STATS);
      setPoopEvents([]);
    }
    if (!result.ok) await clearBackgroundGuidanceSession();
    setStatus(next);
    return next;
  }, []);

  const stop = useCallback(async () => {
    await stopWalkTracking();
    await clearBackgroundGuidanceSession();
    modeRef.current = 'route';
    setMode('route');
    setStatus('idle');
  }, []);

  /** US-18 산책 중 한 손 원터치 배변/소변 마킹 및 햅틱 피드백 */
  const markPoop = useCallback((type: 'poop' | 'pee' = 'poop'): PoopEvent => {
    try {
      if (Platform.OS !== 'web') {
        Vibration.vibrate(60);
      }
    } catch {
      // ignore
    }

    const newEvent: PoopEvent = {
      id: `poop_${Date.now()}`,
      timestamp: Date.now(),
      type,
      lat: lastPointRef.current?.latitude,
      lon: lastPointRef.current?.longitude,
    };

    setPoopEvents((prev) => [...prev, newEvent]);
    TTSNavigationService.speak(type === 'pee' ? '소변이 기록되었습니다.' : '배변이 기록되었습니다.');
    return newEvent;
  }, []);

  /** 저장된(즐겨찾기) 경로와 스텝 핀을 서버 재탐색 없이 그대로 주입한다 (US-29). */
  const loadCourse = useCallback((newRoute: RouteFeatureCollection, newPins: readonly RouteStepPin[]) => {
    setRoute(newRoute);
    routeRef.current = newRoute;
    setActivePins(newPins);
    activePinsRef.current = newPins;
    modeRef.current = 'route';
    setMode('route');
    guidanceRef.current = INITIAL_GUIDANCE_STATE;
    if (status === 'running') void saveBackgroundGuidanceSession(newRoute, newPins, guidanceRef.current);
  }, [status]);

  return {
    route,
    activePins,
    mode,
    status,
    stats,
    currentPoint,
    guidanceMessage,
    freeWalkSafety,
    poopEvents,
    poopCount: poopEvents.length,
    markPoop,
    start,
    stop,
    applyReroute,
    loadCourse,
    getTrackBuffer,
    getPersistedTrackBuffer,
  };
}

