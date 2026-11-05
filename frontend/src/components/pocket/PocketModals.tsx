/**
 * [편안하개 - PetWalk]
 * 다크 포켓 모드 모달: 산책 종료 확인, 출발지 복귀 확인, 실시간 경로 확대 지도
 */

import React from 'react';
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText as Text } from '../common/AppText';
import { MapLibreMapView } from '../map/MapLibreMapView';
import { WalkStats } from '../../hooks/useWalkGuidance';
import { formatElapsed } from '../../services/walkFormat';
import { TOKENS, TYPOGRAPHY, TYPOGRAPHY_LINE_HEIGHT } from '../../theme/tokens';
import { LonLat, RouteFeatureCollection, RouteStepPin } from '../../types/route';

const FinishSummary: React.FC<{ stats: WalkStats }> = ({ stats }) => (
  <View style={styles.finishSummary}>
    <Text style={styles.finishSummaryLabel}>산책 요약</Text>
    <Text style={styles.finishSummaryText}>
      경과 시간 {formatElapsed(stats.elapsedSec)} · 이동 거리 {stats.distanceKm.toFixed(2)}km
    </Text>
    <Text style={styles.finishSummaryHint}>저장하지 않으면 산책 기록과 경로가 남지 않습니다.</Text>
  </View>
);

export const FinishWalkModal: React.FC<{
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
          <FinishSummary stats={stats} />
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

export const EmergencyReturnModal: React.FC<{
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

export const PocketMapModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  route: RouteFeatureCollection;
  pins: readonly RouteStepPin[];
  maskingCenter?: LonLat;
  hasPosition: boolean;
  gpsWaitMessage: string;
}> = ({ visible, onClose, route, pins, maskingCenter, hasPosition, gpsWaitMessage }) => (
  <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <View style={styles.mapModal}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>실시간 산책 경로</Text>
        <TouchableOpacity onPress={onClose} accessibilityLabel="지도 닫기" style={styles.modalClose}>
          <Text style={styles.modalCloseText}>닫기</Text>
        </TouchableOpacity>
      </View>
      {hasPosition ? (
        <MapLibreMapView route={route} stepPins={pins} maskingCenter={maskingCenter} width="100%" height="100%" style={styles.mapView} />
      ) : (
        <View style={styles.mapEmpty}><Text style={[styles.modalBody, styles.mapEmptyText]}>{gpsWaitMessage}</Text></View>
      )}
    </View>
  </Modal>
);

const styles = StyleSheet.create({
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
