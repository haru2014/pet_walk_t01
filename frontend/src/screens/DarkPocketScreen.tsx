/**
 * [편안하개 - PetWalk]
 * 초절전 다크 포켓 모드 화면 (US-C2, US-18, Phase 4)
 *
 * 레이아웃: 현재 위치를 따라가며 진행 방향이 위로 오게 회전하는 전체 화면 지도 위에
 * 3개 층을 오버레이한다.
 * 1. 상단 방향 카드: 다음 회전까지 남은 거리·방향, 그다음 안내 (30m 이내 강조 + 햅틱)
 * 2. 우측 보조 버튼: 음성 음소거, 위험 제보, 경로 재생성, 확대 지도
 * 3. 하단 시트: 경과 시간·거리·속도, 원터치 배변/소변 마킹(US-18), 산책 종료
 *    시트를 펼치면 목표 안내, 스마트 짖음 감지, 출발지로 돌아가기
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  Modal,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { AppText as Text } from '../components/common/AppText';
import { TOKENS, TYPOGRAPHY, TYPOGRAPHY_LINE_HEIGHT } from '../theme/tokens';
import { FreeWalkSafetyInfo, WalkStats } from '../hooks/useWalkGuidance';
import { formatElapsed, formatGpsWaitMessage } from '../services/walkFormat';
import { AppIcon, AppIconName } from '../components/common/AppIcon';
import { AmbientNoiseMonitorService } from '../services/ambientNoiseMonitor';
import { BarkMuteState, SoundSettings } from '../types/voiceSettings';
import { TTSNavigationService } from '../services/ttsNavigation';
import { HazardReportModal } from '../components/walk/HazardReportModal';
import { PocketDirectionCard, PocketDirectionCardProps } from '../components/walk/PocketDirectionCard';
import { createEmergencyReturnRoute } from '../services/hazardApi';
import { computePocketManeuver, MANEUVER_IMMINENT_DISTANCE_M, routeBearingAt } from '../services/pocketManeuver';
import {
  bearingFromRecentPath,
  normalizeDeg,
  resolveFollowTargetHeading,
  smoothHeading,
} from '../services/followHeading';
import { hapticTurnApproach } from '../services/haptics';
import { RerouteResult } from '../types/hazard';
import { RouteFeatureCollection, RouteStepPin } from '../types/route';
import { MapLibreMapView } from '../components/map/MapLibreMapView';
import { MapFitPadding, MapFollowCamera } from '../components/map/maplibreWebTemplate';
import { resolvePrivacyMaskCenter } from '../services/privacyMask';

export interface DarkPocketScreenProps {
  readonly dogName: string;
  readonly stats: WalkStats;
  readonly onFinishWalk: (saveRecord: boolean) => void;
  readonly mapVisible: boolean;
  readonly onMapVisibleChange: (visible: boolean) => void;
  readonly targetMinutes?: number | null;
  readonly isFreeWalk?: boolean;
  readonly freeWalkSafety?: FreeWalkSafetyInfo;
  readonly guidanceMessage?: string;
  readonly onMarkPoop?: (type: 'poop' | 'pee') => void;
  readonly poopCount?: number;
  readonly currentCoords?: { lat: number; lon: number } | null;
  readonly startCoords?: { lat: number; lon: number } | null;
  readonly routeCoords?: readonly (readonly [number, number])[];
  readonly walkedCoords?: readonly (readonly [number, number])[];
  readonly mapRoute: RouteFeatureCollection;
  readonly mapPins: readonly RouteStepPin[];
  readonly onReroute?: (result: RerouteResult) => void;
  readonly originMode?: 'current_location' | 'park' | 'parking_pnr';
  readonly isOffRoute?: boolean;
  /** 웹 데모 가상 보행 중 (실제 위치 아님, #297) */
  readonly isSimulatedLocation?: boolean;
  readonly onRegenerateRoute?: () => Promise<boolean> | boolean | void;
}

/** 오버레이 공통 색 (OLED 절전을 위해 거의 검정 + 헤어라인) */
const OVERLAY_SURFACE = '#0E1311';
const OVERLAY_HAIRLINE = 'rgba(255,255,255,0.08)';
const TEXT_PRIMARY = '#F4F5F2';
const TEXT_SECONDARY = '#A3AAA4';
const TEXT_MUTED = '#6F7771';
const WARN = '#F5B544';
const DANGER = '#F38B8B';
const POOP_COLOR = '#E7A962';
const PEE_COLOR = '#8EC1EE';

/** 회전 안내 문장은 방향 카드가 대신 보여주므로 캡션에서 제외한다. */
const TURN_MESSAGE_PATTERN = /좌회전|우회전|유턴|직진/;
/** 걷기용 따라가기 줌 */
const FOLLOW_ZOOM = 17;
/** 위치 마커 위쪽(진행 방향)으로 보이는 지도 영역 비율 */
const FOLLOW_LOOK_AHEAD_RATIO = 0.35;

function computeWalkBearing(walkedCoords?: readonly (readonly [number, number])[]): number | undefined {
  if (!walkedCoords || walkedCoords.length < 2) return undefined;
  const [previous, current] = walkedCoords.slice(-2);
  const [lon1, lat1] = previous;
  const [lon2, lat2] = current;
  const toRadians = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * toRadians) * Math.cos(lat2 * toRadians);
  const x = Math.cos(lat1 * toRadians) * Math.sin(lat2 * toRadians)
    - Math.sin(lat1 * toRadians) * Math.cos(lat2 * toRadians) * Math.cos((lon2 - lon1) * toRadians);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function formatPocketHint(options: { isFreeWalk?: boolean; isOvertime: boolean; targetMinutes?: number | null; overtimeMinutes: number }): string {
  if (options.isFreeWalk) return '자유 산책 모드 · 시간 제한 없이 안심 기록 중';
  if (options.isOvertime) return `목표 ${options.targetMinutes}분 달성 (+${options.overtimeMinutes}분) · 자유 산책 기록 지속 중`;
  if (options.targetMinutes) return `목표 ${options.targetMinutes}분 · 화면이 꺼져도 음성으로 안내해요`;
  return '화면이 꺼져도 음성으로 안내해요';
}

const StatusChip: React.FC<{ icon: AppIconName; label: string; color: string }> = ({ icon, label, color }) => (
  <View style={styles.statusChip}>
    <AppIcon name={icon} size={13} color={color} strokeWidth={2.2} />
    <Text style={[styles.statusChipText, { color }]} numberOfLines={1}>{label}</Text>
  </View>
);

const FloatingButton: React.FC<{
  icon: AppIconName;
  label: string;
  color?: string;
  highlighted?: boolean;
  onPress: () => void;
}> = ({ icon, label, color = '#D5DAD6', highlighted, onPress }) => (
  <TouchableOpacity
    accessibilityRole="button"
    accessibilityLabel={label}
    activeOpacity={0.75}
    onPress={onPress}
    style={[styles.fab, highlighted && { borderColor: color }]}
  >
    <AppIcon name={icon} size={20} color={color} strokeWidth={2.1} />
  </TouchableOpacity>
);

const StatCell: React.FC<{ label: string; value: string; unit?: string; valueColor?: string; labelColor?: string; compact?: boolean }> = ({
  label, value, unit, valueColor = TEXT_PRIMARY, labelColor = TEXT_MUTED, compact,
}) => (
  <View style={styles.statCell}>
    <Text style={[styles.statValue, compact && styles.statValueCompact, { color: valueColor }]} numberOfLines={1}>
      {value}
      {unit ? <Text style={styles.statUnit}> {unit}</Text> : null}
    </Text>
    <Text style={[styles.statLabel, { color: labelColor }]} numberOfLines={1}>{label}</Text>
  </View>
);

const FinishWalkModal: React.FC<{
  visible: boolean;
  stats: WalkStats;
  onClose: () => void;
  onFinishWalk: (saveRecord: boolean) => void;
}> = ({ visible, stats, onClose, onFinishWalk }) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.modalOverlay}>
      <View style={styles.actionModal}>
        <Text style={styles.modalTitle}>산책을 종료할까요?</Text>
        <View style={styles.finishModalButtons}>
          <View style={styles.finishSummary}>
            <Text style={styles.finishSummaryLabel}>산책 요약</Text>
            <Text style={styles.finishSummaryText}>
              경과 시간 {formatElapsed(stats.elapsedSec)} · 이동 거리 {stats.distanceKm.toFixed(2)}km
            </Text>
            <Text style={styles.finishSummaryHint}>저장하지 않으면 산책 기록과 경로가 남지 않습니다.</Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => { onClose(); onFinishWalk(true); }}
            style={styles.finishSaveButton}
          >
            <Text style={styles.finishSaveButtonText}>기록 저장 후 종료</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => { onClose(); onFinishWalk(false); }}
            style={styles.finishDiscardButton}
          >
            <Text style={styles.finishDiscardButtonText}>저장 없이 종료</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={onClose}
            style={styles.finishContinueButton}
          >
            <Text style={styles.finishContinueButtonText}>계속 산책</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

const EmergencyReturnModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
}> = ({ visible, onClose, onConfirm }) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.modalOverlay}>
      <View style={styles.actionModal}>
        <Text style={styles.modalTitle}>출발지로 돌아가기할까요?</Text>
        <Text style={styles.modalBody}>현재 위치와 기록한 산책 경로를 이용해 출발지 복귀 안내를 시작합니다.</Text>
        <View style={styles.modalButtons}>
          <TouchableOpacity onPress={onClose} style={styles.secondaryModalButton}>
            <Text style={styles.secondaryModalButtonText}>취소</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onConfirm} style={styles.confirmEmergencyButton}>
            <Text style={styles.confirmFinishText}>돌아가기 시작</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

export const DarkPocketScreen: React.FC<DarkPocketScreenProps> = ({
  dogName,
  stats,
  onFinishWalk,
  mapVisible,
  onMapVisibleChange,
  targetMinutes,
  isFreeWalk,
  freeWalkSafety,
  guidanceMessage,
  onMarkPoop,
  poopCount = 0,
  currentCoords,
  startCoords,
  routeCoords,
  walkedCoords,
  mapRoute,
  mapPins,
  onReroute,
  originMode = 'current_location',
  isOffRoute = false,
  isSimulatedLocation = false,
  onRegenerateRoute,
}) => {
  const { height } = useWindowDimensions();
  const isCompactLayout = height < 760;
  const accent = TOKENS.colors.pocketHud;
  const overlayTop = isCompactLayout ? 12 : 40;

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [showHazardModal, setShowHazardModal] = useState(false);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [barkState, setBarkState] = useState<BarkMuteState>(() => AmbientNoiseMonitorService.getState());
  const [soundSettings, setSoundSettings] = useState<SoundSettings>(() => TTSNavigationService.getSettings());
  const [topOverlayHeight, setTopOverlayHeight] = useState(0);
  const [sheetHeight, setSheetHeight] = useState(0);
  // 접힌 시트 높이를 기준으로 지도 여백을 잡는다 (펼칠 때마다 지도가 다시 맞춰지지 않도록)
  const [collapsedSheetHeight, setCollapsedSheetHeight] = useState(0);

  useEffect(() => {
    void AmbientNoiseMonitorService.startMonitoring();
    const unsubNoise = AmbientNoiseMonitorService.subscribe((next) => setBarkState(next));
    const unsubTTS = TTSNavigationService.subscribe((next) => setSoundSettings(next));
    return () => {
      unsubNoise();
      unsubTTS();
      AmbientNoiseMonitorService.stopMonitoring();
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showToast = useCallback((message: string, durationMs = 2500) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMsg(message);
    toastTimerRef.current = setTimeout(() => setToastMsg(null), durationMs);
  }, []);

  const isOvertime = !isFreeWalk && !!targetMinutes && stats.elapsedSec >= targetMinutes * 60;
  const overtimeMinutes = isOvertime ? Math.floor((stats.elapsedSec - targetMinutes! * 60) / 60) : 0;
  const currentBearing = useMemo(
    () => bearingFromRecentPath(walkedCoords) ?? computeWalkBearing(walkedCoords),
    [walkedCoords],
  );

  // 따라가기 카메라 방향: 걷는 방향을 부드럽게 반영하고, 멈추면 유지한다
  const [cameraHeading, setCameraHeading] = useState<number | null>(null);
  const currentLon = currentCoords?.lon;
  const currentLat = currentCoords?.lat;
  useEffect(() => {
    if (currentLon == null || currentLat == null) return undefined;
    const routeBearing = routeBearingAt([currentLon, currentLat], mapRoute);
    const frameId = requestAnimationFrame(() => {
      setCameraHeading((prev) => smoothHeading(prev, resolveFollowTargetHeading({
        walkedCoords,
        speedKmH: stats.speedKmH,
        routeBearing,
        hasHeading: prev != null,
      })));
    });
    return () => cancelAnimationFrame(frameId);
  }, [currentLon, currentLat, walkedCoords, stats.speedKmH, mapRoute]);

  const mapDisplayPins = useMemo<readonly RouteStepPin[]>(() => (currentCoords
    ? [...mapPins, {
      id: 'current-location-pin',
      kind: 'safe',
      position: [currentCoords.lon, currentCoords.lat],
      instruction: '현재 위치',
      icon: '➤',
      // 지도가 회전한 만큼 빼서 화면 기준 방향으로 표시한다
      bearingDeg: currentBearing != null && cameraHeading != null
        ? normalizeDeg(currentBearing - cameraHeading)
        : currentBearing ?? undefined,
    }]
    : mapPins), [currentCoords, currentBearing, cameraHeading, mapPins]);

  const maneuver = useMemo(() => (isFreeWalk || !currentCoords
    ? null
    : computePocketManeuver([currentCoords.lon, currentCoords.lat], mapRoute, mapPins)),
  [isFreeWalk, currentCoords, mapRoute, mapPins]);

  // 회전 지점 30m 이내에 처음 들어오면 한 번 진동 (주머니 속에서도 알 수 있도록)
  const buzzedPinIdRef = useRef<string | null>(null);
  useEffect(() => {
    const step = maneuver?.current;
    if (!step?.pinId || isOffRoute) return;
    if (step.distanceM <= MANEUVER_IMMINENT_DISTANCE_M && buzzedPinIdRef.current !== step.pinId) {
      buzzedPinIdRef.current = step.pinId;
      void hapticTurnApproach();
    }
  }, [maneuver, isOffRoute]);

  const handlePressMark = (type: 'poop' | 'pee') => {
    if (onMarkPoop) onMarkPoop(type);
    const label = type === 'poop' ? '대변' : '소변';
    showToast(`${label} 마킹 완료 · 총 ${poopCount + 1}회`);
  };

  const handleEmergencyReturn = () => {
    if (!currentCoords || !startCoords || !onReroute) {
      setShowEmergencyModal(false);
      showToast('GPS 출발 위치를 확인할 수 없어 돌아가기 경로를 만들지 못했어요.', 3500);
      return;
    }
    const path = walkedCoords && walkedCoords.length > 1 ? walkedCoords : routeCoords;
    const result = createEmergencyReturnRoute(
      currentCoords.lat,
      currentCoords.lon,
      startCoords.lat,
      startCoords.lon,
      path,
    );
    onReroute(result);
    setShowEmergencyModal(false);
    setSheetExpanded(false);
    showToast('출발지로 복귀하는 경로 안내를 시작했어요.', 3500);
  };

  const isParkMode = originMode === 'park' || originMode === 'parking_pnr';
  const regenerateBtnLabel = isParkMode ? '현위치 코스 합류' : '현위치 경로 재생성';
  const canRegenerate = !isFreeWalk && !!onRegenerateRoute;

  const handleRegenerateRoute = async () => {
    if (!onRegenerateRoute) return;
    const ok = await onRegenerateRoute();
    if (ok === false) {
      showToast('현재 GPS 위치를 확인한 뒤 다시 시도해 주세요.', 3500);
    } else {
      showToast(
        isParkMode
          ? '공원 산책로를 따라 코스에 다시 합류해요.'
          : '현재 위치에서 출발지로 돌아오는 새 경로를 안내해요.',
        3500,
      );
    }
  };

  const gpsWaitMessage = formatGpsWaitMessage(stats.elapsedSec);
  const hint = formatPocketHint({ isFreeWalk, isOvertime, targetMinutes, overtimeMinutes });
  const smartBarkEnabled = soundSettings.smartBarkMuteEnabled ?? true;

  // 상단 방향 카드
  let directionCard: PocketDirectionCardProps;
  if (isFreeWalk) {
    const tone = freeWalkSafety?.status === 'alert'
      ? 'danger'
      : freeWalkSafety?.status === 'unavailable' ? 'warning' : 'normal';
    directionCard = {
      variant: 'message',
      accent,
      icon: tone === 'normal' ? 'shield' : 'alert',
      title: tone === 'danger' ? '주변 안전 알림' : '자유 산책 중',
      message: freeWalkSafety?.message ?? '위험 제보나 경사 정보가 아직 없어요. 발밑을 가볍게 살피며 이동해 볼까요?',
      tone,
      compact: isCompactLayout,
    };
  } else if (!currentCoords) {
    directionCard = { variant: 'message', accent, icon: 'location', title: '위치를 찾는 중', message: gpsWaitMessage, compact: isCompactLayout };
  } else if (isOffRoute) {
    directionCard = {
      variant: 'offRoute',
      accent,
      actionLabel: regenerateBtnLabel,
      onAction: canRegenerate ? () => { void handleRegenerateRoute(); } : undefined,
      compact: isCompactLayout,
    };
  } else if (maneuver) {
    directionCard = { variant: 'navigate', accent, maneuver, compact: isCompactLayout };
  } else {
    directionCard = {
      variant: 'message',
      accent,
      icon: 'paw',
      title: '산책 안내',
      message: guidanceMessage ?? '산책 경로를 따라 이동해 주세요.',
      compact: isCompactLayout,
    };
  }

  // 방향 카드가 보여주지 않는 음성 안내(위험 제보, 진행 안내 등)만 한 줄 캡션으로
  const isNavigateCard = !isFreeWalk && Boolean(currentCoords) && !isOffRoute && Boolean(maneuver);
  const voiceCaption = isNavigateCard && guidanceMessage
    && !TURN_MESSAGE_PATTERN.test(guidanceMessage)
    ? guidanceMessage
    : null;

  // 지도 여백: 오버레이가 경로를 가리지 않도록 측정된 높이만큼 비운다
  const layoutReady = topOverlayHeight > 0 && collapsedSheetHeight > 0;
  const fitPadding = useMemo<MapFitPadding>(() => ({
    top: Math.round(overlayTop + topOverlayHeight + 16),
    bottom: Math.round(collapsedSheetHeight + 16),
    left: 28,
    right: 72,
  }), [overlayTop, topOverlayHeight, collapsedSheetHeight]);

  // 따라가기 카메라: 위치 마커를 시트 바로 위쪽에 두어 앞길이 더 많이 보이게 한다
  const followCamera = useMemo<MapFollowCamera | null>(() => {
    if (currentLon == null || currentLat == null || !layoutReady) return null;
    const pad = fitPadding as Exclude<MapFitPadding, number>;
    const visibleHeight = Math.max(0, height - pad.top - pad.bottom);
    return {
      center: [currentLon, currentLat],
      bearing: cameraHeading ?? 0,
      zoom: FOLLOW_ZOOM,
      padding: {
        top: Math.round(pad.top + visibleHeight * FOLLOW_LOOK_AHEAD_RATIO),
        bottom: pad.bottom,
        left: pad.left,
        right: pad.right,
      },
    };
  }, [currentLon, currentLat, layoutReady, fitPadding, height, cameraHeading]);

  const handleTopLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.height);
    // 첫 측정만 지도 여백에 쓴다 (안내 문구 길이 변화로 지도가 계속 흔들리지 않도록)
    setTopOverlayHeight((prev) => (prev > 0 ? prev : next));
  };
  const handleSheetLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.height);
    setSheetHeight(next);
    if (!sheetExpanded) setCollapsedSheetHeight((prev) => (prev > 0 ? prev : next));
  };

  const voiceMuted = soundSettings.isMuted;
  const statusChips: React.ReactNode[] = [];
  if (isSimulatedLocation) statusChips.push(<StatusChip key="sim" icon="globe" label="웹 데모 · 가상 위치" color={WARN} />);
  if (barkState.isAutoMuted) {
    statusChips.push(
      <StatusChip
        key="bark"
        icon="volumeMute"
        label={`짖음 감지 · 안내 일시 차단 ${barkState.cooldownRemainingSec.toFixed(0)}초`}
        color={DANGER}
      />,
    );
  } else if (voiceMuted) {
    statusChips.push(<StatusChip key="mute" icon="volumeMute" label="음성 안내 꺼짐" color={WARN} />);
  }

  return (
    <View style={styles.container}>
      {/* 1. 전체 화면 지도 */}
      <View style={StyleSheet.absoluteFill} accessibilityLabel="현재 위치와 진행 경로 지도">
        {currentCoords && layoutReady ? (
          <MapLibreMapView
            route={mapRoute}
            stepPins={mapDisplayPins}
            maskingCenter={resolvePrivacyMaskCenter(startCoords, currentCoords)}
            width="100%"
            height="100%"
            style={styles.backgroundMap}
            interactive={false}
            fitPadding={fitPadding}
            follow={followCamera}
          />
        ) : !currentCoords ? (
          <View style={styles.mapEmptyBackground}>
            <AppIcon name="location" size={28} color={TEXT_MUTED} />
          </View>
        ) : null}
      </View>

      {/* 2. 상단 방향 카드 + 상태 칩 */}
      <View style={[styles.topOverlay, { top: overlayTop }]} pointerEvents="box-none" onLayout={handleTopLayout}>
        <PocketDirectionCard {...directionCard} />
        {statusChips.length > 0 || voiceCaption ? (
          <View style={styles.chipRow} pointerEvents="none">
            {statusChips}
            {voiceCaption ? <StatusChip icon="volume" label={voiceCaption} color={TEXT_SECONDARY} /> : null}
          </View>
        ) : null}
      </View>

      {/* 3. 우측 보조 버튼 */}
      <View style={[styles.fabColumn, { bottom: sheetHeight + 16 }]} pointerEvents="box-none">
        <FloatingButton
          icon={voiceMuted ? 'volumeMute' : 'volume'}
          label={voiceMuted ? '음성 안내 다시 켜기' : '음성 안내 즉시 음소거'}
          color={voiceMuted ? WARN : undefined}
          highlighted={voiceMuted}
          onPress={() => { void TTSNavigationService.toggleMute(); }}
        />
        <FloatingButton
          icon="alert"
          label="현장 위험 제보 및 안전 우회"
          color={WARN}
          onPress={() => setShowHazardModal(true)}
        />
        {canRegenerate && !isOffRoute ? (
          <FloatingButton icon="refresh" label={regenerateBtnLabel} onPress={() => { void handleRegenerateRoute(); }} />
        ) : null}
        <FloatingButton icon="expand" label="산책 지도 크게 보기" onPress={() => onMapVisibleChange(true)} />
      </View>

      {toastMsg ? (
        <View style={[styles.toast, { bottom: sheetHeight + 16 }]} pointerEvents="none" accessibilityLiveRegion="polite">
          <AppIcon name="paw" size={14} color={accent} />
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      ) : null}

      {/* 4. 하단 시트 */}
      <View style={[styles.sheet, isCompactLayout && styles.sheetCompact]} onLayout={handleSheetLayout}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={sheetExpanded ? '산책 메뉴 접기' : '산책 메뉴 펼치기'}
          activeOpacity={0.7}
          onPress={() => setSheetExpanded((prev) => !prev)}
          style={styles.sheetHeader}
        >
          <View style={styles.sheetHandle} />
          <View style={styles.sheetTitleRow}>
            <AppIcon name="paw" size={14} color={accent} />
            <Text style={styles.sheetTitle} numberOfLines={1}>{dogName}와 안심 산책 중</Text>
            <View style={{ transform: [{ rotate: sheetExpanded ? '90deg' : '-90deg' }] }}>
              <AppIcon name="chevronRight" size={16} color={TEXT_MUTED} />
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.statsRow}>
          <StatCell
            label={isOvertime ? `목표 +${overtimeMinutes}분` : targetMinutes && !isFreeWalk ? `목표 ${targetMinutes}분` : '경과 시간'}
            labelColor={isOvertime ? WARN : TEXT_MUTED}
            value={formatElapsed(stats.elapsedSec)}
            valueColor={accent}
            compact={isCompactLayout}
          />
          <StatCell label="이동 거리" value={stats.distanceKm.toFixed(2)} unit="km" compact={isCompactLayout} />
          <StatCell label="현재 속도" value={stats.speedKmH.toFixed(1)} unit="km/h" compact={isCompactLayout} />
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="대변 마킹"
            activeOpacity={0.8}
            onPress={() => handlePressMark('poop')}
            style={styles.markButton}
          >
            <AppIcon name="paw" size={18} color={POOP_COLOR} />
            <Text style={styles.markButtonText}>대변</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="소변 마킹"
            activeOpacity={0.8}
            onPress={() => handlePressMark('pee')}
            style={styles.markButton}
          >
            <AppIcon name="water" size={18} color={PEE_COLOR} />
            <Text style={styles.markButtonText}>소변</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="산책 종료"
            activeOpacity={0.8}
            onPress={() => setShowFinishModal(true)}
            style={styles.stopButton}
          >
            <AppIcon name="stop" size={20} color={DANGER} strokeWidth={2.4} />
          </TouchableOpacity>
        </View>

        {sheetExpanded ? (
          <View style={styles.sheetExpanded}>
            <Text style={[styles.hintText, isOvertime && { color: WARN }]}>{hint}</Text>
            <Text style={styles.hintText}>
              {poopCount > 0 ? `배변 기록 ${poopCount}회` : '배변 시 위 버튼을 한 번 탭하면 위치와 함께 기록돼요'}
            </Text>

            <TouchableOpacity
              accessibilityRole="switch"
              accessibilityState={{ checked: smartBarkEnabled }}
              activeOpacity={0.75}
              onPress={() => { void TTSNavigationService.updateSettings({ smartBarkMuteEnabled: !smartBarkEnabled }); }}
              style={styles.settingRow}
            >
              <View style={styles.settingTextWrap}>
                <Text style={styles.settingTitle}>스마트 짖음 감지</Text>
                <Text style={styles.settingDesc}>짖음·돌발 소음(73dB 이상) 시 안내를 잠시 멈춰요</Text>
              </View>
              <View style={[styles.switchTrack, smartBarkEnabled && { backgroundColor: accent }]}>
                <View style={[styles.switchThumb, smartBarkEnabled && styles.switchThumbOn]} />
              </View>
            </TouchableOpacity>

            {__DEV__ ? (
              <TouchableOpacity onPress={() => AmbientNoiseMonitorService.simulateNoise(82)} style={styles.devChip}>
                <Text style={styles.devChipText}>개발용 · 짖음 테스트</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="출발지로 돌아가기"
              activeOpacity={0.8}
              onPress={() => setShowEmergencyModal(true)}
              style={styles.returnButton}
            >
              <AppIcon name="shield" size={18} color="#8CC8F0" />
              <Text style={styles.returnButtonText}>출발지로 돌아가기</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      <HazardReportModal
        visible={showHazardModal}
        onClose={() => setShowHazardModal(false)}
        currentLat={currentCoords?.lat ?? 36.3628}
        currentLon={currentCoords?.lon ?? 127.3592}
        startLat={startCoords?.lat}
        startLon={startCoords?.lon}
        currentRouteCoords={routeCoords}
        onRerouteApplied={(res) => {
          if (onReroute) onReroute(res);
          showToast(res.isEmergencyReturn ? '출발지 복귀 경로 안내를 시작했어요' : '안전 우회 경로를 적용했어요', 3500);
        }}
      />

      <Modal visible={mapVisible} animationType="slide" onRequestClose={() => onMapVisibleChange(false)}>
        <View style={styles.mapModal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>실시간 산책 경로</Text>
            <TouchableOpacity onPress={() => onMapVisibleChange(false)} accessibilityLabel="지도 닫기" style={styles.modalClose}>
              <Text style={styles.modalCloseText}>닫기</Text>
            </TouchableOpacity>
          </View>
          {currentCoords ? (
            <MapLibreMapView
              route={mapRoute}
              stepPins={mapDisplayPins}
              maskingCenter={resolvePrivacyMaskCenter(startCoords, currentCoords)}
              width="100%"
              height="100%"
              style={styles.mapView}
            />
          ) : (
            <View style={styles.mapEmpty}><Text style={[styles.modalBody, styles.mapEmptyText]}>{gpsWaitMessage}</Text></View>
          )}
        </View>
      </Modal>

      <FinishWalkModal
        visible={showFinishModal}
        stats={stats}
        onClose={() => setShowFinishModal(false)}
        onFinishWalk={onFinishWalk}
      />

      <EmergencyReturnModal
        visible={showEmergencyModal}
        onClose={() => setShowEmergencyModal(false)}
        onConfirm={handleEmergencyReturn}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TOKENS.colors.pocketBg, overflow: 'hidden' },
  backgroundMap: { borderRadius: 0, borderWidth: 0, backgroundColor: '#0B0F0D' },
  mapEmptyBackground: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B0F0D' },

  topOverlay: { position: 'absolute', left: 12, right: 12, gap: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 2 },
  statusChip: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(14, 19, 17, 0.92)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusChipText: { flexShrink: 1, fontSize: TYPOGRAPHY.caption, fontWeight: '600' },

  fabColumn: { position: 'absolute', right: 12, gap: 10 },
  fab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(14, 19, 17, 0.94)',
    borderWidth: 1,
    borderColor: OVERLAY_HAIRLINE,
  },

  toast: {
    position: 'absolute',
    left: 24,
    right: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(14, 19, 17, 0.96)',
    borderWidth: 1,
    borderColor: OVERLAY_HAIRLINE,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  toastText: { flexShrink: 1, color: TEXT_PRIMARY, fontSize: TYPOGRAPHY.caption, lineHeight: TYPOGRAPHY_LINE_HEIGHT.caption, fontWeight: '600' },

  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: OVERLAY_SURFACE,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    borderColor: OVERLAY_HAIRLINE,
    paddingHorizontal: 18,
    paddingBottom: 22,
  },
  sheetCompact: { paddingHorizontal: 14, paddingBottom: 14 },
  sheetHeader: { paddingTop: 8, paddingBottom: 10 },
  sheetHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', marginBottom: 10 },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sheetTitle: { flex: 1, color: TEXT_SECONDARY, fontSize: TYPOGRAPHY.caption, fontWeight: '600' },

  statsRow: { flexDirection: 'row', marginBottom: 14 },
  statCell: { flex: 1, minWidth: 0 },
  statValue: { fontSize: 24, lineHeight: 30, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  statValueCompact: { fontSize: TYPOGRAPHY.metricValue, lineHeight: TYPOGRAPHY_LINE_HEIGHT.metricValue },
  statUnit: { color: TEXT_MUTED, fontSize: TYPOGRAPHY.caption, fontWeight: '600' },
  statLabel: { fontSize: TYPOGRAPHY.micro, lineHeight: TYPOGRAPHY_LINE_HEIGHT.micro, marginTop: 2 },

  actionRow: { flexDirection: 'row', gap: 8 },
  markButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#1A201D',
  },
  markButtonText: { color: TEXT_PRIMARY, fontSize: TYPOGRAPHY.button, fontWeight: '700' },
  stopButton: {
    width: 52,
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2A1C1C',
  },

  sheetExpanded: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: OVERLAY_HAIRLINE, gap: 10 },
  hintText: { color: TEXT_SECONDARY, fontSize: TYPOGRAPHY.caption, lineHeight: TYPOGRAPHY_LINE_HEIGHT.caption },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  settingTextWrap: { flex: 1 },
  settingTitle: { color: TEXT_PRIMARY, fontSize: TYPOGRAPHY.label, fontWeight: '700' },
  settingDesc: { color: TEXT_MUTED, fontSize: TYPOGRAPHY.caption, lineHeight: TYPOGRAPHY_LINE_HEIGHT.caption, marginTop: 1 },
  switchTrack: { width: 44, height: 26, borderRadius: 13, backgroundColor: '#2C332F', padding: 3 },
  switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#F4F5F2' },
  switchThumbOn: { alignSelf: 'flex-end' },
  devChip: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: 'rgba(245, 181, 68, 0.14)' },
  devChipText: { color: WARN, fontSize: TYPOGRAPHY.caption, fontWeight: '600' },
  returnButton: {
    minHeight: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#17202B',
  },
  returnButtonText: { color: '#8CC8F0', fontSize: TYPOGRAPHY.button, fontWeight: '700' },

  mapModal: { flex: 1, backgroundColor: TOKENS.colors.pocketBg },
  modalHeader: { minHeight: 60, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: TOKENS.colors.border },
  modalTitle: { color: TOKENS.colors.textWhite, fontSize: TYPOGRAPHY.cardTitle, fontWeight: '800' },
  modalClose: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: '#26342C' },
  modalCloseText: { color: '#D1FAE5', fontSize: TYPOGRAPHY.label, fontWeight: '700' },
  mapView: { flex: 1 },
  mapEmpty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mapEmptyText: { textAlign: 'center', paddingHorizontal: 24 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'center', padding: 22 },
  actionModal: { width: '100%', maxWidth: 420, alignSelf: 'center', backgroundColor: '#19211C', borderColor: '#3B4C41', borderWidth: 1, borderRadius: 22, padding: 20 },
  modalBody: { color: TOKENS.colors.pocketHudSubtle, fontSize: TYPOGRAPHY.support, lineHeight: TYPOGRAPHY_LINE_HEIGHT.support, marginTop: 10, marginBottom: 18 },
  modalButtons: { flexDirection: 'row', gap: 10 },
  secondaryModalButton: { flex: 1, minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2B332E' },
  secondaryModalButtonText: { color: '#E5E7EB', fontSize: TYPOGRAPHY.button, fontWeight: '700' },
  confirmEmergencyButton: { flex: 1.3, minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#236846' },
  confirmFinishText: { color: '#FFFFFF', fontSize: TYPOGRAPHY.button, fontWeight: '800' },
  finishSummary: { width: '100%', marginBottom: 4, padding: 12, borderRadius: 13, backgroundColor: '#202B24' },
  finishModalButtons: { width: '100%', flexDirection: 'column', alignItems: 'stretch', gap: 8, marginTop: 12 },
  finishSummaryLabel: { color: '#6EE7B7', fontSize: TYPOGRAPHY.label, fontWeight: '800', marginBottom: 5 },
  finishSummaryText: { color: '#F8FAFC', fontSize: TYPOGRAPHY.support, fontWeight: '700', lineHeight: TYPOGRAPHY_LINE_HEIGHT.support },
  finishSummaryHint: { color: TOKENS.colors.pocketHudSubtle, fontSize: TYPOGRAPHY.caption, lineHeight: TYPOGRAPHY_LINE_HEIGHT.caption, marginTop: 5 },
  finishSaveButton: { width: '100%', minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#236846' },
  finishSaveButtonText: { color: '#FFFFFF', fontSize: TYPOGRAPHY.button, fontWeight: '800' },
  finishDiscardButton: { width: '100%', minHeight: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2C1D1D', borderWidth: 1, borderColor: '#9B3A3A' },
  finishDiscardButtonText: { color: '#FCA5A5', fontSize: TYPOGRAPHY.button, fontWeight: '800' },
  finishContinueButton: { width: '100%', minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  finishContinueButtonText: { color: '#D1D5DB', fontSize: TYPOGRAPHY.button, fontWeight: '700' },
});
