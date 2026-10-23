/**
 * [편안하개 - PetWalk]
 * 현장 위험 제보 및 보행망 안전 우회 / 긴급 복귀 모달 컴포넌트 (US-D2, US-C2)
 */

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { AppIcon } from '../common/AppIcon';
import { HazardType, RerouteResult } from '../../types/hazard';
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
  const [isLoading, setIsLoading] = useState(false);

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
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmergencyReturn = () => {
    setIsLoading(true);
    try {
      const sLat = startLat ?? currentLat;
      const sLon = startLon ?? currentLon;
      const hazardLat = currentLat + 0.0002;
      const hazardLon = currentLon + 0.0002;

      // 1. 위험 제보 적재
      void reportHazard({
        lat: hazardLat,
        lon: hazardLon,
        hazardType: selectedType,
        severity: 'danger',
        description: `긴급 복귀 요청 - 현장 위험 [${HAZARD_TYPE_LABELS[selectedType]}]`,
      });

      // 2. 출발지 긴급 복귀 경로 생성
      const result = createEmergencyReturnRoute(
        currentLat,
        currentLon,
        sLat,
        sLon,
        currentRouteCoords,
        { lat: hazardLat, lon: hazardLon }
      );

      onRerouteApplied(result);
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* 헤더 */}
          <View style={styles.headerRow}>
            <View style={styles.titleGroup}>
              <Text style={styles.warningIcon}>⚠️</Text>
              <Text style={styles.title}>현장 위험 제보 & 안전 우회</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="닫기">
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
                  onPress={() => setSelectedType(item.type)}
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
    fontSize: 17,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    color: '#94A3B8',
    fontSize: 18,
    fontWeight: '600',
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 17,
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
    fontSize: 14,
    fontWeight: '700',
    color: '#E2E8F0',
    marginBottom: 2,
  },
  optionLabelSelected: {
    color: '#10B981',
  },
  optionDesc: {
    fontSize: 11,
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
    fontSize: 14,
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
    fontSize: 13,
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
    fontSize: 13,
    fontWeight: '600',
  },
});
