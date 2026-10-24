import { TYPOGRAPHY, TYPOGRAPHY_LINE_HEIGHT } from '../../theme/tokens';
/**
 * [편안하개 - PetWalk]
 * 현장 위험 제보 및 보행망 안전 우회 / 돌아가기 모달 컴포넌트 (US-D2, US-C2)
 */

import React, { useState } from 'react';
import { Modal, View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { AppText as Text } from '../common/AppText';
import { AppIcon } from '../common/AppIcon';
import { HazardReportPayload, HazardType, RerouteResult } from '../../types/hazard';
import {
  HAZARD_TYPE_LABELS,
  reportHazard,
  requestRerouteAroundHazard,
  createEmergencyReturnRoute,
} from '../../services/hazardApi';

export interface HazardReportModalProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly currentLat: number;
  readonly currentLon: number;
  readonly startLat?: number;
  readonly startLon?: number;
  readonly destinationLat?: number;
  readonly destinationLon?: number;
  readonly currentRouteCoords?: readonly (readonly [number, number])[];
  readonly onRerouteApplied: (result: RerouteResult) => void;
}

const HAZARD_OPTIONS: readonly { type: HazardType; iconName: string; desc: string }[] = [
  { type: 'construction', iconName: 'barrier', desc: '도로 파손·공사로 보행 불가' },
  { type: 'high_curb', iconName: 'stairs', desc: '관절에 무리 가는 높은 단차·계단' },
  { type: 'broken_glass', iconName: 'shield', desc: '발바닥을 다칠 수 있는 유리·파편' },
  { type: 'dog_danger', iconName: 'paw', desc: '공격적인 들개 또는 맹견 출몰' },
];

/**
 * 돌아가기 때 서버에 올릴 위험 제보. 사용자가 위험 종류를 직접 고르지 않았으면 올리지 않는다(null).
 * 예전에는 기본값(공사 구역)으로, 현재 위치에서 0.0002도 옮긴 곳에 danger 제보를 자동으로 올려
 * 돌아가기만 눌러도 가짜 공사 구역이 쌓였다 (10/22 신성동). 위치는 실제 현재 위치를 쓴다.
 */
export function buildEmergencyReturnReport(
  typeChosen: boolean,
  hazardType: HazardType,
  currentLat: number,
  currentLon: number,
): HazardReportPayload | null {
  if (!typeChosen) return null;
  return {
    lat: currentLat,
    lon: currentLon,
    hazardType,
    severity: 'danger',
    description: `돌아가기 요청 - 현장 위험 [${HAZARD_TYPE_LABELS[hazardType]}]`,
  };
}

export const HazardReportModal: React.FC<HazardReportModalProps> = ({
  visible,
  onClose,
  currentLat,
  currentLon,
  startLat,
  startLon,
  destinationLat,
  destinationLon,
  currentRouteCoords,
  onRerouteApplied,
}) => {
  const [selectedType, setSelectedType] = useState<HazardType>('construction');
  // 사용자가 이번에 위험 종류를 직접 눌러 골랐는지 (돌아가기 때 제보 여부를 정한다)
  const [typeChosen, setTypeChosen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // 닫을 때 '직접 고름' 표시를 지워, 다음에 열었을 때 이전 선택으로 제보되지 않게 한다
  const close = () => {
    setTypeChosen(false);
    onClose();
  };

  const handleReroute = async () => {
    setIsLoading(true);
    try {
      // 위험 지점 좌표: 현재 진행 전방 약 40m 가상의 위치
      const hazardLat = currentLat + 0.0003;
      const hazardLon = currentLon + 0.0003;
      const destLat = destinationLat ?? (startLat ?? currentLat);
      const destLon = destinationLon ?? (startLon ?? currentLon);

      // 1. 서버에 위험 제보 비동기 적재
      void reportHazard({
        lat: hazardLat,
        lon: hazardLon,
        hazardType: selectedType,
        severity: 'danger',
        description: `현장 돌발 위험 [${HAZARD_TYPE_LABELS[selectedType]}] 사용자 제보`,
      });

      // 2. 우회 경로 요청
      const result = await requestRerouteAroundHazard({
        currentLat,
        currentLon,
        destinationLat: destLat,
        destinationLon: destLon,
        hazardLat,
        hazardLon,
        hazardType: selectedType,
        severity: 'danger',
        confidence: 0.95,
        routeCoordinates: currentRouteCoords,
      });

      onRerouteApplied(result);
      close();
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmergencyReturn = () => {
    setIsLoading(true);
    try {
      const sLat = startLat ?? currentLat;
      const sLon = startLon ?? currentLon;
      // 복귀 경로 계산에만 쓰는 전방 가상 지점 (서버에 저장하지 않는다)
      const hazardLat = currentLat + 0.0002;
      const hazardLon = currentLon + 0.0002;

      // 1. 위험 종류를 직접 고른 경우에만 실제 현재 위치로 제보
      const report = buildEmergencyReturnReport(typeChosen, selectedType, currentLat, currentLon);
      if (report) void reportHazard(report);

      // 2. 출발지 돌아가기 경로 생성
      const result = createEmergencyReturnRoute(
        currentLat,
        currentLon,
        sLat,
        sLon,
        currentRouteCoords,
        { lat: hazardLat, lon: hazardLon }
      );

      onRerouteApplied(result);
      close();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* 헤더 */}
          <View style={styles.headerRow}>
            <View style={styles.titleGroup}>
              <Text style={styles.warningIcon}>⚠️</Text>
              <Text style={styles.title}>현장 위험 제보 & 안전 우회</Text>
            </View>
            <TouchableOpacity onPress={close} style={styles.closeBtn} accessibilityLabel="닫기">
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>
            감지된 위험 요소를 선택하시면 3초 이내에 안전한 우회 경로를 새로 안내합니다.
          </Text>

          {/* 위험 유형 선택 목록 */}
          <View style={styles.optionsList}>
            {HAZARD_OPTIONS.map((item) => {
              const isSelected = selectedType === item.type;
              return (
                <TouchableOpacity
                  key={item.type}
                  activeOpacity={0.7}
                  onPress={() => {
                    setSelectedType(item.type);
                    setTypeChosen(true);
                  }}
                  style={[styles.optionItem, isSelected && styles.optionItemSelected]}
                >
                  <View style={styles.optionLeft}>
                    <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                      {HAZARD_TYPE_LABELS[item.type]}
                    </Text>
                    <Text style={styles.optionDesc}>{item.desc}</Text>
                  </View>
                  <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                    {isSelected && <View style={styles.radioInner} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 액션 버튼 그룹 */}
          {isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color="#10B981" />
              <Text style={styles.loadingText}>안전한 우회 보행망을 계산하고 있어요...</Text>
            </View>
          ) : (
            <View style={styles.actionColumn}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleReroute}
                style={styles.rerouteBtn}
              >
                <AppIcon name="sparkle" size={16} color="#FFFFFF" />
                <Text style={styles.rerouteBtnText}>새로운 길로 안전 우회하기</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleEmergencyReturn}
                style={styles.emergencyReturnBtn}
              >
                <AppIcon name="back" size={15} color="#EF4444" />
                <Text style={styles.emergencyReturnBtnText}>출발지로 즉시 안전 복귀하기</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    width: '100%',
    maxWidth: 420,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  warningIcon: {
    fontSize: 20,
  },
  title: {
    fontSize: TYPOGRAPHY.cardTitle,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    color: '#94A3B8',
    fontSize: TYPOGRAPHY.button,
    fontWeight: '600',
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: TYPOGRAPHY.support,
    lineHeight: TYPOGRAPHY_LINE_HEIGHT.support,
    marginBottom: 16,
  },
  optionsList: {
    gap: 10,
    marginBottom: 20,
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    borderWidth: 1.5,
    borderColor: '#334155',
  },
  optionItemSelected: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  optionLeft: {
    flex: 1,
  },
  optionLabel: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '700',
    color: '#E2E8F0',
    marginBottom: 2,
  },
  optionLabelSelected: {
    color: '#10B981',
  },
  optionDesc: {
    fontSize: TYPOGRAPHY.support,
    color: '#64748B',
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#475569',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleSelected: {
    borderColor: '#10B981',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
  },
  actionColumn: {
    gap: 10,
  },
  rerouteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 14,
  },
  rerouteBtnText: {
    color: '#FFFFFF',
    fontSize: TYPOGRAPHY.button,
    fontWeight: '800',
  },
  emergencyReturnBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    paddingVertical: 12,
    borderRadius: 14,
  },
  emergencyReturnBtnText: {
    color: '#F87171',
    fontSize: TYPOGRAPHY.button,
    fontWeight: '700',
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 20,
  },
  loadingText: {
    color: '#10B981',
    fontSize: TYPOGRAPHY.label,
    fontWeight: '600',
  },
});
