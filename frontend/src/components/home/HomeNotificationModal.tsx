/**
 * [편안하개 - PetWalk]
 * 홈 화면 안심 산책 스마트 알림 센터 모달 (HomeNotificationModal.tsx)
 *
 * 1. 실시간 지면열 골든타임 알림 (아스팔트 노면온도 및 화상 위험도 가이드)
 * 2. 주변 보행 안전 및 위험 제보 주의보 (반경 내 깨진 유리, 급경사, 공사 등)
 * 3. 반려견 맞춤 데일리 산책 권장 리마인더 (오늘 산책 달성 여부)
 * 4. 관절 안심 케어 맞춤 팁 및 연계 액션
 */

import React, { useMemo } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { AppText as Text } from '../common/AppText';
import { useAppTheme } from '../../theme/themeManager';
import { TYPOGRAPHY, TOKENS } from '../../theme/tokens';
import { HeatRiskResponse } from '../../types/weather';
import { DogProfile } from '../../types/dogProfile';
import { WeeklyWalkStats } from '../../services/walkStatisticsService';
import { NearbyHazardReport, HAZARD_TYPE_LABELS } from '../../services/hazardApi';

export interface SmartNotificationItem {
  readonly id: string;
  readonly type: 'thermal' | 'hazard' | 'walk_goal' | 'joint_tip';
  readonly icon: string;
  readonly badgeText: string;
  readonly badgeBg: string;
  readonly badgeColor: string;
  readonly title: string;
  readonly description: string;
  readonly timeLabel: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}

export interface HomeNotificationModalProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly weather: HeatRiskResponse | null;
  readonly dog: DogProfile;
  readonly weeklyStats: WeeklyWalkStats | null;
  readonly nearbyHazards?: readonly NearbyHazardReport[];
  readonly onOpenWeatherModal?: () => void;
  readonly onStartWalk?: () => void;
  readonly onOpenPlanner?: () => void;
}

export const HomeNotificationModal: React.FC<HomeNotificationModalProps> = ({
  visible,
  onClose,
  weather,
  dog,
  weeklyStats,
  nearbyHazards = [],
  onOpenWeatherModal,
  onStartWalk,
  onOpenPlanner,
}) => {
  const { colors, isDark } = useAppTheme();

  const notifications = useMemo<SmartNotificationItem[]>(() => {
    const list: SmartNotificationItem[] = [];

    // 1. 지면열 골든타임 알림
    if (weather) {
      const surfaceTemp = Math.round(weather.surface_temperature_c);
      const isHighRisk = weather.risk_level === '위험' || weather.risk_level === '주의';
      list.push({
        id: 'noti_thermal',
        type: 'thermal',
        icon: isHighRisk ? '🔥' : '🌿',
        badgeText: `지면열 ${weather.risk_level}`,
        badgeBg: isHighRisk ? '#FEE2E2' : '#DCFCE7',
        badgeColor: isHighRisk ? '#DC2626' : '#166534',
        title: isHighRisk
          ? `지면 온도가 ${surfaceTemp}℃로 높습니다`
          : `현재 지면 온도는 ${surfaceTemp}℃로 안전해요`,
        description: isHighRisk
          ? '아스팔트 노면이 뜨거워 발바닥 화상 위험이 있습니다. 그늘길이나 해질녘 골든타임 산책을 권장합니다.'
          : '발바닥 화상 위험 없이 쾌적하게 산책할 수 있는 안심 노면 상태입니다. 즐거운 산책 다녀오세요!',
        timeLabel: '실시간 예보',
        actionLabel: '골든타임 상세 보기 →',
        onAction: onOpenWeatherModal,
      });
    }

    // 2. 오늘의 산책 리마인더
    const todayStats = weeklyStats?.dailyStats.find((d) => d.isToday);
    const todayWalkCount = todayStats?.walkCount ?? 0;
    if (todayWalkCount === 0) {
      list.push({
        id: 'noti_walk_goal',
        type: 'walk_goal',
        icon: '🐾',
        badgeText: '산책 리마인더',
        badgeBg: '#FEF3C7',
        badgeColor: '#B45309',
        title: `오늘 ${dog.name}와의 산책이 아직 없어요`,
        description: `규칙적인 산책은 ${dog.name}의 스트레스 해소와 관절 건강에 필수입니다. 가벼운 안심 산책을 시작해보세요!`,
        timeLabel: '오늘',
        actionLabel: '지금 바로 산책하기 →',
        onAction: onStartWalk,
      });
    } else {
      list.push({
        id: 'noti_walk_goal_done',
        type: 'walk_goal',
        icon: '🎉',
        badgeText: '산책 완주 완료',
        badgeBg: '#E0F2FE',
        badgeColor: '#0369A1',
        title: `오늘 산책 ${todayWalkCount}회 달성!`,
        description: `${dog.name}와 함께 활기찬 산책을 완주하셨네요. 쾌적한 휴식과 수분 보충을 챙겨주세요!`,
        timeLabel: '오늘 완료',
      });
    }

    // 3. 주변 보행 안전 및 위험 제보 주의보
    if (nearbyHazards.length > 0) {
      const topHazard = nearbyHazards[0];
      const hazardLabel = HAZARD_TYPE_LABELS[topHazard.hazard_type] ?? topHazard.description;
      list.push({
        id: 'noti_hazard',
        type: 'hazard',
        icon: '⚠️',
        badgeText: `주의보 ${nearbyHazards.length}건`,
        badgeBg: '#FEE2E2',
        badgeColor: '#991B1B',
        title: `주변 반경 내 주의 구간 등록`,
        description: `인근 300m 이내에 "${hazardLabel}" 등 ${nearbyHazards.length}건의 주의 제보가 있습니다. 보행 시 발밑을 조심하세요.`,
        timeLabel: '최신 제보',
      });
    } else {
      list.push({
        id: 'noti_hazard_safe',
        type: 'hazard',
        icon: '🛡️',
        badgeText: '위험 제보 없음',
        badgeBg: '#F3F4F6',
        badgeColor: '#4B5563',
        title: '주변 보행 안전 확인',
        description: '현재 인근 300m 이내에 등록된 위험 구간 제보가 없습니다. 안전하게 산책로를 이용하세요.',
        timeLabel: '실시간',
      });
    }

    // 4. 관절 안심 케어 맞춤 팁
    const isCareDog = dog.jointCareLevel === 'caution' || dog.jointCareLevel === 'strict';
    list.push({
      id: 'noti_joint_tip',
      type: 'joint_tip',
      icon: '💡',
      badgeText: '관절 안심 케어',
      badgeBg: '#EDE9FE',
      badgeColor: '#6D28D9',
      title: isCareDog
        ? `${dog.name}를 위한 계단·급경사 주의 안내`
        : `${dog.name}의 편안한 노면 보행 가이드`,
      description: isCareDog
        ? '슬개골 및 관절 보호를 위해 아스팔트나 높은 계단 대신, 경사도 3.5% 이하 완만한 흙길/공원길 코스를 추천합니다.'
        : '발바닥 충격을 흡수해 주는 흙길, 잔디길 비중이 높은 안심 코스를 둘러보세요.',
      timeLabel: '맞춤 케어 팁',
      actionLabel: '안심 코스 찾기 →',
      onAction: onOpenPlanner,
    });

    return list;
  }, [weather, dog, weeklyStats, nearbyHazards, onOpenWeatherModal, onStartWalk, onOpenPlanner]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          {/* 헤더 */}
          <View style={[styles.headerRow, { borderBottomColor: colors.border }]}>
            <View style={styles.headerTitleGroup}>
              <Text style={[styles.headerTitle, { color: colors.textMain }]}>
                🔔 안심 산책 스마트 알림
              </Text>
              <View
                style={[
                  styles.countBadge,
                  { backgroundColor: colors.primaryLight, borderColor: colors.primary },
                ]}
              >
                <Text style={[styles.countBadgeText, { color: colors.primaryDark }]}>
                  {notifications.length}건
                </Text>
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onClose}
              style={[styles.closeButton, { backgroundColor: isDark ? '#374151' : '#F3F4F6' }]}
              accessibilityRole="button"
              accessibilityLabel="알림창 닫기"
            >
              <Text style={[styles.closeButtonText, { color: colors.textMain }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 알림 카드 목록 스크롤 */}
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {notifications.map((item) => (
              <View
                key={item.id}
                style={[
                  styles.notificationCard,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
              >
                {/* 상단 뱃지 및 시간 */}
                <View style={styles.cardTopRow}>
                  <View style={styles.cardBadgeRow}>
                    <Text style={styles.cardIcon}>{item.icon}</Text>
                    <View style={[styles.itemBadge, { backgroundColor: item.badgeBg }]}>
                      <Text style={[styles.itemBadgeText, { color: item.badgeColor }]}>
                        {item.badgeText}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.timeText, { color: colors.textMuted }]}>
                    {item.timeLabel}
                  </Text>
                </View>

                {/* 제목 및 내용 */}
                <Text style={[styles.itemTitle, { color: colors.textMain }]}>
                  {item.title}
                </Text>
                <Text style={[styles.itemDesc, { color: colors.textMuted }]}>
                  {item.description}
                </Text>

                {/* 관련 바로가기 액션 버튼 */}
                {item.actionLabel && item.onAction && (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      onClose();
                      item.onAction?.();
                    }}
                    style={[
                      styles.actionButton,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={item.actionLabel}
                  >
                    <Text style={[styles.actionButtonText, { color: colors.primaryDark }]}>
                      {item.actionLabel}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </ScrollView>

          {/* 하단 닫기/확인 버튼 */}
          <View style={[styles.footerRow, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onClose}
              style={[styles.confirmButton, { backgroundColor: colors.primaryDark }]}
              accessibilityRole="button"
              accessibilityLabel="모두 확인 완료"
            >
              <Text style={styles.confirmButtonText}>확인 완료</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.16,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
      web: {
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.2)',
      },
    }),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: TYPOGRAPHY.cardTitle,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
  },
  countBadgeText: {
    fontSize: TYPOGRAPHY.caption,
    fontWeight: '700',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  scrollArea: {
    maxHeight: 460,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  notificationCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  cardBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardIcon: {
    fontSize: 16,
  },
  itemBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  itemBadgeText: {
    fontSize: TYPOGRAPHY.caption,
    fontWeight: '700',
  },
  timeText: {
    fontSize: TYPOGRAPHY.support,
    fontWeight: '500',
  },
  itemTitle: {
    fontSize: TYPOGRAPHY.body,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  itemDesc: {
    fontSize: TYPOGRAPHY.label,
    lineHeight: 18,
  },
  actionButton: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionButtonText: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '700',
  },
  footerRow: {
    padding: 16,
    borderTopWidth: 1,
  },
  confirmButton: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: TYPOGRAPHY.body,
    fontWeight: '800',
  },
});
