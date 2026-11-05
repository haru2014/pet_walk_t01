/**
 * [편안하개 - PetWalk]
 * 초절전 다크 포켓 모드 화면 (US-C2, US-18, Phase 4)
 *
 * 현재 위치를 따라가며 진행 방향이 위로 오게 회전하는 전체 화면 지도 위에 3개 층을 겹친다.
 * 1. 상단 방향 카드: 다음 회전까지 남은 거리·방향, 그다음 안내 (30m 이내 강조 + 햅틱)
 * 2. 우측 보조 버튼: 음성 음소거, 위험 제보, 경로 재생성, 확대 지도
 * 3. 하단 시트: 경과 시간·거리·속도, 원터치 배변/소변 마킹, 산책 종료 (펼치면 부가 설정)
 * 이 파일은 조립만 담당하고, 계산은 hooks/usePocket*·services/pocketScreenModel 에 있다.
 */

import React, { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { PocketBottomSheet } from '../components/pocket/PocketBottomSheet';
import { PocketFloatingActions, PocketStatusChips, PocketToast } from '../components/pocket/PocketControls';
import { PocketMapLayer } from '../components/pocket/PocketMapLayer';
import { EmergencyReturnModal, FinishWalkModal, PocketMapModal } from '../components/pocket/PocketModals';
import { HazardReportModal } from '../components/walk/HazardReportModal';
import { PocketDirectionCard } from '../components/walk/PocketDirectionCard';
import { usePocketFollowCamera, usePocketLayout, usePocketManeuver } from '../hooks/usePocketCamera';
import { usePocketActions, usePocketToast, usePocketVoiceState } from '../hooks/usePocketSession';
import { FreeWalkSafetyInfo, WalkStats } from '../hooks/useWalkGuidance';
import { AmbientNoiseMonitorService } from '../services/ambientNoiseMonitor';
import { buildDirectionCard, resolveVoiceCaption, resolveWalkGoal } from '../services/pocketScreenModel';
import { resolvePrivacyMaskCenter } from '../services/privacyMask';
import { TTSNavigationService } from '../services/ttsNavigation';
import { formatGpsWaitMessage } from '../services/walkFormat';
import { TOKENS } from '../theme/tokens';
import { RerouteResult } from '../types/hazard';
import { LonLat, RouteFeatureCollection, RouteStepPin } from '../types/route';

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

type Panel = 'none' | 'hazard' | 'finish' | 'return';

const COMPACT_HEIGHT = 760;
const OVERLAY_GAP = 16;
const DEFAULT_LAT = 36.3628;
const DEFAULT_LON = 127.3592;

/** 화면 상태와 하위 훅을 한곳에서 묶는다. */
function useDarkPocketState(props: DarkPocketScreenProps) {
  const { height } = useWindowDimensions();
  const compact = height < COMPACT_HEIGHT;
  const [panel, setPanel] = useState<Panel>('none');
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const layout = usePocketLayout(compact ? 12 : 40, sheetExpanded);
  const { toastMsg, showToast } = usePocketToast();
  const voice = usePocketVoiceState();
  const camera = usePocketFollowCamera({
    currentCoords: props.currentCoords,
    walkedCoords: props.walkedCoords,
    speedKmH: props.stats.speedKmH,
    mapRoute: props.mapRoute,
    mapPins: props.mapPins,
    layout,
    viewportHeight: height,
  });
  const maneuver = usePocketManeuver({
    isFreeWalk: !!props.isFreeWalk,
    isOffRoute: !!props.isOffRoute,
    currentCoords: props.currentCoords,
    mapRoute: props.mapRoute,
    mapPins: props.mapPins,
  });
  const actions = usePocketActions({
    ...props,
    isFreeWalk: !!props.isFreeWalk,
    originMode: props.originMode ?? 'current_location',
    poopCount: props.poopCount ?? 0,
    showToast,
    onReturnHandled: () => { setPanel('none'); setSheetExpanded(false); },
  });
  return { compact, panel, setPanel, sheetExpanded, setSheetExpanded, layout, toastMsg, voice, camera, maneuver, actions };
}

type PocketState = ReturnType<typeof useDarkPocketState>;

function buildScreenCard(props: DarkPocketScreenProps, s: PocketState, accent: string, gpsWaitMessage: string) {
  return buildDirectionCard({
    accent,
    compact: s.compact,
    isFreeWalk: !!props.isFreeWalk,
    freeWalkStatus: props.freeWalkSafety?.status,
    freeWalkMessage: props.freeWalkSafety?.message,
    hasPosition: !!props.currentCoords,
    gpsWaitMessage,
    isOffRoute: !!props.isOffRoute,
    regenerateLabel: s.actions.regenerateLabel,
    onRegenerate: s.actions.canRegenerate ? () => { void s.actions.regenerateRoute(); } : undefined,
    maneuver: s.maneuver,
    guidanceMessage: props.guidanceMessage,
  });
}

export const DarkPocketScreen: React.FC<DarkPocketScreenProps> = (props) => {
  const s = useDarkPocketState(props);
  const accent = TOKENS.colors.pocketHud;
  const gpsWaitMessage = formatGpsWaitMessage(props.stats.elapsedSec);
  const card = buildScreenCard(props, s, accent, gpsWaitMessage);
  const maskingCenter = props.currentCoords ? resolvePrivacyMaskCenter(props.startCoords, props.currentCoords) : undefined;
  const overlayBottom = s.layout.sheetHeight + OVERLAY_GAP;

  return (
    <View style={styles.container}>
      <PocketMapLayer
        hasPosition={!!props.currentCoords}
        ready={s.layout.layoutReady}
        route={props.mapRoute}
        pins={s.camera.mapDisplayPins}
        maskingCenter={maskingCenter}
        fitPadding={s.layout.fitPadding}
        follow={s.camera.followCamera}
      />
      <View style={[styles.topOverlay, { top: s.compact ? 12 : 40 }]} pointerEvents="box-none" onLayout={s.layout.onTopLayout}>
        <PocketDirectionCard {...card} />
        <PocketStatusChips
          isSimulatedLocation={!!props.isSimulatedLocation}
          barkState={s.voice.barkState}
          voiceMuted={s.voice.soundSettings.isMuted}
          voiceCaption={resolveVoiceCaption(card, props.guidanceMessage)}
        />
      </View>
      <DarkPocketFab props={props} state={s} bottom={overlayBottom} />
      <PocketToast message={s.toastMsg} bottom={overlayBottom} accent={accent} />
      <DarkPocketSheet props={props} state={s} accent={accent} />
      <DarkPocketModals props={props} state={s} maskingCenter={maskingCenter} gpsWaitMessage={gpsWaitMessage} />
    </View>
  );
};

const DarkPocketFab: React.FC<{ props: DarkPocketScreenProps; state: PocketState; bottom: number }> = ({ props, state, bottom }) => (
  <PocketFloatingActions
    bottom={bottom}
    voiceMuted={state.voice.soundSettings.isMuted}
    onToggleVoice={() => { void TTSNavigationService.toggleMute(); }}
    onReportHazard={() => state.setPanel('hazard')}
    regenerate={state.actions.canRegenerate && !props.isOffRoute
      ? { label: state.actions.regenerateLabel, onPress: () => { void state.actions.regenerateRoute(); } }
      : undefined}
    onExpandMap={() => props.onMapVisibleChange(true)}
  />
);

const DarkPocketSheet: React.FC<{ props: DarkPocketScreenProps; state: PocketState; accent: string }> = ({ props, state, accent }) => {
  const smartBarkEnabled = state.voice.soundSettings.smartBarkMuteEnabled ?? true;
  return (
    <PocketBottomSheet
      dogName={props.dogName}
      accent={accent}
      compact={state.compact}
      stats={props.stats}
      goal={resolveWalkGoal({ isFreeWalk: !!props.isFreeWalk, targetMinutes: props.targetMinutes, elapsedSec: props.stats.elapsedSec })}
      poopCount={props.poopCount ?? 0}
      expanded={state.sheetExpanded}
      smartBarkEnabled={smartBarkEnabled}
      onToggleExpanded={() => state.setSheetExpanded((prev) => !prev)}
      onMark={state.actions.markPoop}
      onFinish={() => state.setPanel('finish')}
      onToggleSmartBark={() => { void TTSNavigationService.updateSettings({ smartBarkMuteEnabled: !smartBarkEnabled }); }}
      onSimulateBark={__DEV__ ? () => AmbientNoiseMonitorService.simulateNoise(82) : undefined}
      onReturnToStart={() => state.setPanel('return')}
      onLayout={state.layout.onSheetLayout}
    />
  );
};

const DarkPocketModals: React.FC<{
  props: DarkPocketScreenProps;
  state: PocketState;
  maskingCenter?: LonLat;
  gpsWaitMessage: string;
}> = ({ props, state, maskingCenter, gpsWaitMessage }) => {
  const close = () => state.setPanel('none');
  return (
    <>
      <HazardReportModal
        visible={state.panel === 'hazard'}
        onClose={close}
        currentLat={props.currentCoords?.lat ?? DEFAULT_LAT}
        currentLon={props.currentCoords?.lon ?? DEFAULT_LON}
        startLat={props.startCoords?.lat}
        startLon={props.startCoords?.lon}
        currentRouteCoords={props.routeCoords}
        onRerouteApplied={state.actions.applyReroute}
      />
      <PocketMapModal
        visible={props.mapVisible}
        onClose={() => props.onMapVisibleChange(false)}
        route={props.mapRoute}
        pins={state.camera.mapDisplayPins}
        maskingCenter={maskingCenter}
        hasPosition={!!props.currentCoords}
        gpsWaitMessage={gpsWaitMessage}
      />
      <FinishWalkModal visible={state.panel === 'finish'} stats={props.stats} onClose={close} onFinishWalk={props.onFinishWalk} />
      <EmergencyReturnModal visible={state.panel === 'return'} onClose={close} onConfirm={state.actions.returnToStart} />
    </>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TOKENS.colors.pocketBg, overflow: 'hidden' },
  topOverlay: { position: 'absolute', left: 12, right: 12, gap: 8 },
});
