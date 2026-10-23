/**
 * [편안하개 - PetWalk]
 * 초절전 다크 포켓 모드 화면 (US-C2, US-18, Phase 4)
 *
 * 1. True Black(#000000) OLED 배경 + 고대비 네온 그린 HUD(시간·거리·속도)
 * 2. 한 손 원터치 배변/소변 마킹 FAB 및 햅틱 로깅 (US-18)
 * 3. 실시간 경로 보기, 확인 후 산책 종료, 출발지 긴급 복귀
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Modal, StyleSheet, Text, View, TouchableOpacity, useWindowDimensions } from 'react-native';
import { TOKENS } from '../theme/tokens';
import { FreeWalkSafetyInfo, WalkStats } from '../hooks/useWalkGuidance';
import { formatElapsed } from '../services/walkFormat';
import { AppIcon } from '../components/common/AppIcon';
import { VoiceQuickControlBar } from '../components/voice/VoiceQuickControlBar';
import { AmbientNoiseMonitorService } from '../services/ambientNoiseMonitor';
import { BarkMuteState, SoundSettings } from '../types/voiceSettings';
import { TTSNavigationService } from '../services/ttsNavigation';
import { HazardReportModal } from '../components/walk/HazardReportModal';
import { createEmergencyReturnRoute } from '../services/hazardApi';
import { RerouteResult } from '../types/hazard';
import { RouteFeatureCollection, RouteStepPin } from '../types/route';
import { MapLibreMapView } from '../components/map/MapLibreMapView';

export interface DarkPocketScreenProps {
  readonly dogName: string;
  readonly stats: WalkStats;
  readonly onFinishWalk: () => void;
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
}

const HudItem: React.FC<{ value: string; unit: string; label: string; compact?: boolean }> = ({ value, unit, label, compact }) => (
  <View style={[styles.hudItem, compact && styles.hudItemCompact]}>
    <Text style={[styles.hudLabel, compact && styles.hudLabelCompact]}>{label}</Text>
    <Text style={[styles.hudValue, compact && styles.hudValueCompact]}>
      {value}
      <Text style={[styles.hudUnit, compact && styles.hudUnitCompact]}> {unit}</Text>
    </Text>
  </View>
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
}) => {
  const { height } = useWindowDimensions();
  // This screen intentionally does not scroll; use the dense layout before
  // route guidance and fixed action rows exceed shorter screens.
  const isCompactLayout = height < 900;
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [showHazardModal, setShowHazardModal] = useState(false);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [barkState, setBarkState] = useState<BarkMuteState>(() => AmbientNoiseMonitorService.getState());
  const [soundSettings, setSoundSettings] = useState<SoundSettings>(() => TTSNavigationService.getSettings());

  useEffect(() => {
    void AmbientNoiseMonitorService.startMonitoring();
    const unsubNoise = AmbientNoiseMonitorService.subscribe((next) => {
      setBarkState(next);
    });
    const unsubTTS = TTSNavigationService.subscribe((next) => {
      setSoundSettings(next);
    });
    return () => {
      unsubNoise();
      unsubTTS();
      AmbientNoiseMonitorService.stopMonitoring();
    };
  }, []);
  const isOvertime = !isFreeWalk && !!targetMinutes && stats.elapsedSec >= targetMinutes * 60;
  const overtimeMinutes = isOvertime ? Math.floor((stats.elapsedSec - targetMinutes! * 60) / 60) : 0;
  const mapDisplayPins = useMemo<readonly RouteStepPin[]>(() => currentCoords
    ? [...mapPins, {
        id: 'current-location-pin',
        kind: 'safe',
        position: [currentCoords.lon, currentCoords.lat],
        instruction: '현재 위치',
        icon: '📍',
      }]
    : mapPins, [currentCoords, mapPins]);

  const handlePressMark = (type: 'poop' | 'pee') => {
    if (onMarkPoop) onMarkPoop(type);
    const label = type === 'poop' ? '💩 대변' : '💧 소변';
    setToastMsg(`${label} 마킹 완료 (총 ${poopCount + 1}회)`);
    setTimeout(() => setToastMsg(null), 2500);
  };

  const handleEmergencyReturn = () => {
    if (!currentCoords || !startCoords || !onReroute) {
      setShowEmergencyModal(false);
      setToastMsg('GPS 출발 위치를 확인할 수 없어 긴급 복귀 경로를 만들지 못했어요.');
      setTimeout(() => setToastMsg(null), 3500);
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
    setToastMsg('출발지로 복귀하는 긴급 경로 안내를 시작했어요.');
    setTimeout(() => setToastMsg(null), 3500);
  };

  const getSubtitle = () => {
    if (isFreeWalk) return '자유 산책 모드 · 시간 제한 없이 안심 기록 중';
    if (isOvertime) return `목표 ${targetMinutes}분 달성 (+${overtimeMinutes}분) · 자유 산책 기록 지속 중`;
    if (targetMinutes) return `목표: ${targetMinutes}분 · 화면이 꺼져도 음성으로 안내해요`;
    return '화면이 꺼져도 음성으로 안내해요';
  };

  return (
    <View style={[styles.container, isCompactLayout && styles.containerCompact]}>
      <View style={styles.titleRow}>
        <AppIcon name="paw" size={20} color={TOKENS.colors.pocketHud} />
        <Text style={styles.title}>{dogName}와 안심 산책 중</Text>
      </View>
      <Text style={[styles.subtitle, isOvertime && styles.subtitleOvertime]}>
        {getSubtitle()}
      </Text>
      {isFreeWalk && (
        <View style={[
          styles.safetyInfoBanner,
          freeWalkSafety?.status === 'alert' ? styles.safetyInfoAlert : null,
          freeWalkSafety?.status === 'unavailable' ? styles.safetyInfoUnavailable : null,
        ]} accessibilityRole="alert">
          <Text style={styles.safetyInfoText}>
            {freeWalkSafety?.message ?? '전방 위험 제보와 계단·경사 정보가 확인되지 않았어요. 정보가 없다고 안전한 것은 아닙니다.'}
          </Text>
        </View>
      )}

      {!isFreeWalk && (
        <View style={[styles.guidanceCard, isCompactLayout && styles.guidanceCardCompact]} accessibilityRole="text">
          <View style={styles.guidanceIcon}><AppIcon name="location" size={22} color="#A7F3D0" /></View>
          <View style={styles.guidanceTextWrap}>
            <Text style={styles.guidanceLabel}>산책 안내</Text>
            <Text style={styles.guidanceText}>{guidanceMessage ?? '산책 경로를 따라 이동해 주세요.'}</Text>
          </View>
        </View>
      )}

      {/* US-C2, #37: 비상 상황 원터치 대형 퀵 음소거 제어 바 */}
      <VoiceQuickControlBar compact={isCompactLayout} variant="emergency" style={isCompactLayout ? styles.voiceBarCompact : undefined} />

      {/* 스마트 돌발 짖음 감지 상태 배너 & 토글 컨트롤 */}
      {barkState.isAutoMuted ? (
        <View style={styles.barkAlertBanner}>
          <AppIcon name="volumeMute" size={16} color="#EF4444" />
          <Text style={styles.barkAlertText}>
            🚨 돌발 짖음 감지({barkState.currentNoiseDb}dB) · 안내 일시 차단 중 ({barkState.cooldownRemainingSec.toFixed(1)}s 후 자동 복구)
          </Text>
        </View>
      ) : (
        <View style={[styles.smartMuteRow, isCompactLayout && styles.smartMuteRowCompact]}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              const next = !(soundSettings.smartBarkMuteEnabled ?? true);
              void TTSNavigationService.updateSettings({ smartBarkMuteEnabled: next });
            }}
            style={[
              styles.smartMuteToggleBtn,
              (soundSettings.smartBarkMuteEnabled ?? true) ? styles.smartMuteToggleActive : null,
            ]}
          >
            <Text style={styles.smartMuteToggleIcon}>
              {(soundSettings.smartBarkMuteEnabled ?? true) ? '🟢' : '⚪'}
            </Text>
            <Text
              style={[
                styles.smartMuteToggleText,
                (soundSettings.smartBarkMuteEnabled ?? true) ? styles.smartMuteToggleTextActive : null,
              ]}
            >
              스마트 짖음 감지 자동 음소거 {(soundSettings.smartBarkMuteEnabled ?? true) ? '켜짐 (73dB↑)' : '꺼짐'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => AmbientNoiseMonitorService.simulateNoise(82)}
            style={styles.testBarkChip}
          >
            <Text style={styles.testBarkChipText}>📢 짖음 테스트</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 중앙 HUD 수치 */}
      <View style={[styles.hud, isCompactLayout && styles.hudCompact]}>
        <HudItem label="경과 시간" value={formatElapsed(stats.elapsedSec)} unit="" compact={isCompactLayout} />
        <HudItem label="이동 거리" value={stats.distanceKm.toFixed(2)} unit="km" compact={isCompactLayout} />
        <HudItem label="현재 속도" value={stats.speedKmH.toFixed(1)} unit="km/h" compact={isCompactLayout} />
      </View>

      {/* US-18: 한 손 원터치 배변 마킹 FAB 영역 (Thumb Zone) */}
      <View style={[styles.poopMarkingZone, isCompactLayout && styles.poopMarkingZoneCompact]}>
        {toastMsg ? (
          <View style={styles.toastBadge}>
            <Text style={styles.toastText}>{toastMsg}</Text>
          </View>
        ) : (
          <View style={styles.poopStatusRow}>
            <Text style={styles.poopStatusText}>
              {poopCount > 0 ? `🐾 배변 ${poopCount}회 마킹됨` : '🐾 배변 시 아래 버튼을 탭하세요'}
            </Text>
          </View>
        )}

        <View style={styles.fabRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => handlePressMark('poop')}
            style={styles.poopFab}
          >
            <Text style={styles.poopFabIcon}>💩</Text>
            <Text style={styles.poopFabText}>대변 마킹</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => handlePressMark('pee')}
            style={styles.peeFab}
          >
            <Text style={styles.poopFabIcon}>💧</Text>
            <Text style={styles.poopFabText}>소변 마킹</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 4. 현장 위험 제보 & 안전 우회 버튼 */}
      <View style={[styles.hazardActionRow, isCompactLayout && styles.hazardActionRowCompact]}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setShowHazardModal(true)}
          style={styles.hazardBtn}
          accessibilityLabel="현장 위험 제보 및 안전 우회"
        >
          <Text style={styles.hazardBtnIcon}>⚠️</Text>
          <Text style={styles.hazardBtnText}>위험 제보 & 안전 우회</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.primaryActions, isCompactLayout && styles.primaryActionsCompact]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="산책 지도 보기" onPress={() => onMapVisibleChange(true)} style={[styles.primaryAction, styles.mapAction]}>
          <AppIcon name="map" size={20} color="#6EE7B7" />
          <Text style={[styles.primaryActionText, { color: '#A7F3D0' }]}>지도 보기</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="산책 종료" onPress={() => setShowFinishModal(true)} style={[styles.primaryAction, styles.finishAction]}>
          <Text style={styles.stopActionIcon}>■</Text>
          <Text style={[styles.primaryActionText, { color: '#FCA5A5' }]}>산책 종료</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="긴급 복귀" onPress={() => setShowEmergencyModal(true)} style={[styles.primaryAction, styles.emergencyAction]}>
          <AppIcon name="shield" size={20} color="#7DD3FC" />
          <Text style={[styles.primaryActionText, { color: '#7DD3FC' }]}>긴급 복귀</Text>
        </TouchableOpacity>
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
          setToastMsg(res.isEmergencyReturn ? '🚨 출발지 복귀 경로 안내 시작' : '✨ 안전 우회 경로 적용 완료');
          setTimeout(() => setToastMsg(null), 3500);
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
              maskingCenter={[currentCoords.lon, currentCoords.lat]}
              width="100%"
              height="100%"
              style={styles.mapView}
            />
          ) : (
            <View style={styles.mapEmpty}><Text style={styles.modalBody}>현재 GPS 위치를 확인하고 있어요.</Text></View>
          )}
        </View>
      </Modal>

      <Modal visible={showFinishModal} transparent animationType="fade" onRequestClose={() => setShowFinishModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.actionModal}>
            <Text style={styles.modalTitle}>산책을 종료할까요?</Text>
            <Text style={styles.modalBody}>현재까지 {formatElapsed(stats.elapsedSec)} · {stats.distanceKm.toFixed(2)}km를 기록했어요.</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={() => setShowFinishModal(false)} style={styles.secondaryModalButton}>
                <Text style={styles.secondaryModalButtonText}>계속 산책</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowFinishModal(false); onFinishWalk(); }} style={styles.confirmFinishButton}>
                <Text style={styles.confirmFinishText}>기록 저장 및 종료</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showEmergencyModal} transparent animationType="fade" onRequestClose={() => setShowEmergencyModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.actionModal}>
            <Text style={styles.modalTitle}>출발지로 긴급 복귀할까요?</Text>
            <Text style={styles.modalBody}>현재 위치와 기록한 산책 경로를 이용해 출발지 복귀 안내를 시작합니다.</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={() => setShowEmergencyModal(false)} style={styles.secondaryModalButton}>
                <Text style={styles.secondaryModalButtonText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleEmergencyReturn} style={styles.confirmEmergencyButton}>
                <Text style={styles.confirmFinishText}>긴급 복귀 시작</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TOKENS.colors.pocketBg, paddingHorizontal: 24, paddingTop: 40, paddingBottom: 28, justifyContent: 'space-between' },
  containerCompact: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  title: { color: TOKENS.colors.pocketHud, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  subtitle: { color: TOKENS.colors.pocketHudSubtle, opacity: 0.7, fontSize: 12, textAlign: 'center', marginTop: 4 },
  subtitleOvertime: { color: '#FBBF24', opacity: 0.95, fontWeight: '700' },
  safetyInfoBanner: {
    borderColor: 'rgba(245, 158, 11, 0.75)',
    borderWidth: 1,
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  safetyInfoAlert: { borderColor: '#F87171', backgroundColor: 'rgba(248, 113, 113, 0.18)' },
  safetyInfoUnavailable: { borderColor: '#FBBF24', backgroundColor: 'rgba(251, 191, 36, 0.14)' },
  safetyInfoText: { color: TOKENS.colors.pocketHudSubtle, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  guidanceCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#17241E', borderWidth: 1.5, borderColor: '#2B885B', borderRadius: 16, padding: 12 },
  guidanceCardCompact: { padding: 8, gap: 8 },
  guidanceIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#1D4432', alignItems: 'center', justifyContent: 'center' },
  guidanceTextWrap: { flex: 1 },
  guidanceLabel: { color: '#6EE7B7', fontSize: 11, fontWeight: '700', marginBottom: 3 },
  guidanceText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', lineHeight: 19 },
  voiceBarCompact: { marginVertical: 4 },
  smartMuteRowCompact: { marginVertical: 0 },
  hud: { flex: 1, justifyContent: 'space-evenly', gap: 16, paddingVertical: 8 },
  hudCompact: { minHeight: 0, gap: 0, paddingVertical: 0 },
  hudItem: { alignItems: 'center' },
  hudItemCompact: { flex: 1, justifyContent: 'center' },
  hudLabel: { color: TOKENS.colors.pocketHudSubtle, opacity: 0.7, fontSize: 12, marginBottom: 2 },
  hudLabelCompact: { fontSize: 10, marginBottom: 0 },
  hudValue: { color: TOKENS.colors.pocketHud, fontSize: 50, fontWeight: '800', fontVariant: ['tabular-nums'] },
  hudValueCompact: { fontSize: 34, lineHeight: 40 },
  hudUnit: { fontSize: 18, fontWeight: '600' },
  hudUnitCompact: { fontSize: 14 },

  poopMarkingZone: { alignItems: 'center', marginBottom: 12 },
  poopMarkingZoneCompact: { marginBottom: 2 },
  toastBadge: { backgroundColor: 'rgba(16, 185, 129, 0.25)', borderWidth: 1, borderColor: TOKENS.colors.pocketHud, paddingHorizontal: 14, paddingVertical: 4, borderRadius: 14, marginBottom: 8 },
  toastText: { color: TOKENS.colors.pocketHud, fontSize: 11, fontWeight: '700' },
  poopStatusRow: { marginBottom: 6 },
  poopStatusText: { color: TOKENS.colors.pocketHudSubtle, fontSize: 11, opacity: 0.8 },
  fabRow: { flexDirection: 'row', gap: 12, width: '100%', justifyContent: 'center' },
  poopFab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(245, 158, 11, 0.6)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
  },
  peeFab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(59, 130, 246, 0.6)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
  },
  poopFabIcon: { fontSize: 16 },
  poopFabText: { color: '#F8FAFC', fontSize: 12, fontWeight: '700' },
  primaryActions: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  primaryActionsCompact: { gap: 6, paddingBottom: 0 },
  primaryAction: { flex: 1, minHeight: 70, alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 16, borderWidth: 1.5 },
  mapAction: { backgroundColor: '#14231B', borderColor: '#2F7D54' },
  finishAction: { backgroundColor: '#2C1D1D', borderColor: '#9B3A3A' },
  emergencyAction: { backgroundColor: '#17202B', borderColor: '#376899' },
  primaryActionText: { fontSize: 12, fontWeight: '800' },
  stopActionIcon: { color: '#FCA5A5', fontSize: 20, fontWeight: '900' },
  mapModal: { flex: 1, backgroundColor: TOKENS.colors.pocketBg },
  modalHeader: { minHeight: 60, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: TOKENS.colors.border },
  modalTitle: { color: TOKENS.colors.textWhite, fontSize: 17, fontWeight: '800' },
  modalClose: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: '#26342C' },
  modalCloseText: { color: '#D1FAE5', fontSize: 13, fontWeight: '700' },
  mapView: { flex: 1 },
  mapEmpty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'center', padding: 22 },
  actionModal: { backgroundColor: '#19211C', borderColor: '#3B4C41', borderWidth: 1, borderRadius: 22, padding: 20 },
  modalBody: { color: TOKENS.colors.pocketHudSubtle, fontSize: 14, lineHeight: 21, marginTop: 10, marginBottom: 18 },
  modalButtons: { flexDirection: 'row', gap: 10 },
  secondaryModalButton: { flex: 1, minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2B332E' },
  secondaryModalButtonText: { color: '#E5E7EB', fontSize: 13, fontWeight: '700' },
  confirmFinishButton: { flex: 1.3, minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#9B3A3A' },
  confirmEmergencyButton: { flex: 1.3, minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#236846' },
  confirmFinishText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  barkAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1.5,
    borderColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginVertical: 4,
  },
  barkAlertText: {
    color: '#FCA5A5',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  smartMuteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginVertical: 4,
  },
  smartMuteToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  smartMuteToggleActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.5)',
  },
  smartMuteToggleIcon: { fontSize: 10 },
  smartMuteToggleText: {
    color: TOKENS.colors.pocketHudSubtle,
    fontSize: 10,
    fontWeight: '600',
  },
  smartMuteToggleTextActive: {
    color: TOKENS.colors.pocketHud,
    fontWeight: '700',
  },
  testBarkChip: {
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.5)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 14,
  },
  testBarkChipText: {
    color: '#FBBF24',
    fontSize: 10,
    fontWeight: '700',
  },
  hazardActionRow: {
    alignItems: 'center',
    marginBottom: 8,
  },
  hazardActionRowCompact: { marginBottom: 0 },
  hazardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(239, 68, 68, 0.6)',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 18,
  },
  hazardBtnIcon: {
    fontSize: 13,
  },
  hazardBtnText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '700',
  },
});
