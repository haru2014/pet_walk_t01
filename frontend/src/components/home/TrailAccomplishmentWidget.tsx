/**
 * [편안하개 - PetWalk]
 * 이번 주 산책 달성도 위젯 (TrailAccomplishmentWidget.tsx)
 *
 * reference: docs/reference/trail_ accomplishment.png
 * - 상단: 귀여운 강아지 아바타(초록 빛나는 스파클) + "이번 주 산책 달성도" 볼드 타이틀
 * - 하단: 주간 목표 달성을 직관적으로 보여주는 6개의 발자국(Paw) 게이지 바
 *   - 달성된 산책: 싱그러운 잔디 그린 (#58B273)
 *   - 미달성 슬롯: 부드러운 소프트 그레이 (#E2E8F0)
 * - 터치 시 마이페이지 "활동" 탭의 상세 산책 통계로 원터치 이동
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ViewStyle,
} from 'react-native';
import NativeSvg, {
  Circle as NativeCircle,
  Ellipse as NativeEllipse,
  G as NativeG,
  Line as NativeLine,
  Path as NativePath,
} from 'react-native-svg';
import { useAppTheme } from '../../theme/themeManager';
import { WeeklyWalkStats } from '../../services/walkStatisticsService';

const isWeb = Platform.OS === 'web';

const cleanWebProps = ({ accessible, style, ...props }: any) => {
  const flat = Array.isArray(style) ? StyleSheet.flatten(style) : style;
  return flat ? { style: flat, ...props } : props;
};

const Svg: React.ComponentType<any> = isWeb ? (props: any) => <svg {...cleanWebProps(props)} /> : NativeSvg;
const G: React.ComponentType<any> = isWeb ? (props: any) => <g {...cleanWebProps(props)} /> : NativeG;
const Path: React.ComponentType<any> = isWeb ? (props: any) => <path {...cleanWebProps(props)} /> : NativePath;
const Circle: React.ComponentType<any> = isWeb ? (props: any) => <circle {...cleanWebProps(props)} /> : NativeCircle;
const Ellipse: React.ComponentType<any> = isWeb ? (props: any) => <ellipse {...cleanWebProps(props)} /> : NativeEllipse;
const Line: React.ComponentType<any> = isWeb ? (props: any) => <line {...cleanWebProps(props)} /> : NativeLine;

/** 귀여운 강아지 아바타 (docs/reference/trail_ accomplishment.png 원형 복원 - 컴팩트 34px) */
const PuppyAccomplishmentAvatar: React.FC = () => {
  return (
    <View style={styles.avatarWrap}>
      <Svg width={34} height={34} viewBox="0 0 54 54" fill="none">
        {/* 상단 우측 3개의 생기 넘치는 초록 스파클 대시 */}
        <Line x1="42" y1="12" x2="49" y2="8" stroke="#52B773" strokeWidth="2.4" strokeLinecap="round" />
        <Line x1="39" y1="6" x2="42" y2="1.5" stroke="#52B773" strokeWidth="2.4" strokeLinecap="round" />
        <Line x1="46" y1="17" x2="52" y2="17" stroke="#52B773" strokeWidth="2.4" strokeLinecap="round" />

        {/* 연한 민트 원형 배경 */}
        <Circle cx="25" cy="29" r="22" fill="#EBF8F2" />

        {/* 강아지 귀 (좌/우 탄색) */}
        <Path
          d="M12 21 C8 21 5 25 5 30 C5 35 8 39 11 38 C14 37 14 30 14 26 C14 23 13 21 12 21 Z"
          fill="#F5B263"
        />
        <Path
          d="M38 21 C42 21 45 25 45 30 C45 35 42 39 39 38 C36 37 36 30 36 26 C36 23 37 21 38 21 Z"
          fill="#F5B263"
        />

        {/* 강아지 머리 기본 베이스 (골든) */}
        <Path
          d="M15 22 C15 15 35 15 35 22 C37 28 37 35 34 38 C31 41 19 41 16 38 C13 35 13 28 15 22 Z"
          fill="#F5B263"
        />

        {/* 흰색 이마 스트라이프 & 주둥이 볼살 */}
        <Path d="M22 17 h6 v12 h-6 Z" fill="#FFFFFF" />
        <Path
          d="M17 28 C15 33 19 40 25 40 C31 40 35 33 33 28 C30 29 28 28 25 28 C22 28 20 29 17 28 Z"
          fill="#FFFFFF"
        />

        {/* 행복한 눈 웃음 (^ ^) */}
        <Path
          d="M18.5 26.5 Q20.5 24 22.5 26.5"
          stroke="#1E293B"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d="M27.5 26.5 Q29.5 24 31.5 26.5"
          stroke="#1E293B"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
        />

        {/* 작고 둥근 까만 코 */}
        <Ellipse cx="25" cy="30" rx="2.4" ry="1.7" fill="#1E293B" />

        {/* 미소짓는 입과 귀여운 핑크 혀 */}
        <Path
          d="M22.5 32 Q23.8 34.2 25 34.2 Q26.2 34.2 27.5 32"
          stroke="#1E293B"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d="M23.8 33.6 C23.8 37.5 26.2 37.5 26.2 33.6 Z"
          fill="#FF859F"
        />
      </Svg>
    </View>
  );
};

interface AccomplishmentPawProps {
  filled: boolean;
  activeColor?: string;
  inactiveColor?: string;
}

/** 4개의 발가락 + 메인 패드로 구성된 둥근 강아지 발자국 아이콘 (컴팩트 28x25) */
const AccomplishmentPaw: React.FC<AccomplishmentPawProps> = ({
  filled,
  activeColor = '#58B273',
  inactiveColor = '#E2E8F0',
}) => {
  const color = filled ? activeColor : inactiveColor;

  return (
    <View style={styles.pawWrap}>
      <Svg width={28} height={25} viewBox="0 0 42 38" fill="none">
        <G fill={color}>
          {/* 발가락 1 (좌측 외곽) */}
          <Ellipse cx="7" cy="15" rx="3.4" ry="4.4" transform="rotate(-18 7 15)" />
          {/* 발가락 2 (좌측 중앙) */}
          <Ellipse cx="15.2" cy="8.2" rx="3.7" ry="5.2" transform="rotate(-6 15.2 8.2)" />
          {/* 발가락 3 (우측 중앙) */}
          <Ellipse cx="26.8" cy="8.2" rx="3.7" ry="5.2" transform="rotate(6 26.8 8.2)" />
          {/* 발가락 4 (우측 외곽) */}
          <Ellipse cx="35" cy="15" rx="3.4" ry="4.4" transform="rotate(18 35 15)" />

          {/* 메인 팜 패드 (통통하고 둥근 빈 형상) */}
          <Path
            d="M21 16.5 C15.2 16.5 9.5 19.5 9 24.8 C8.5 29.8 11.8 34.8 15.8 35.2 C18.8 35.5 19.6 33.8 21 33.8 C22.4 33.8 23.2 35.5 26.2 35.2 C30.2 34.8 33.5 29.8 33 24.8 C32.5 19.5 26.8 16.5 21 16.5 Z"
          />
        </G>
      </Svg>
    </View>
  );
};

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'] as const;

export interface TrailAccomplishmentWidgetProps {
  stats?: WeeklyWalkStats | null;
  totalSlots?: number;
  onPress?: () => void;
  style?: ViewStyle;
}

export const TrailAccomplishmentWidget: React.FC<TrailAccomplishmentWidgetProps> = ({
  stats,
  totalSlots = 7,
  onPress,
  style,
}) => {
  const { colors } = useAppTheme();

  // 요일별 실제 산책 기록 매핑 (월: index 0 ~ 일: index 6)
  const hasDailyStats = Array.isArray(stats?.dailyStats) && stats.dailyStats.length > 0;

  const slots = Array.from({ length: totalSlots }, (_, i) => {
    const dayStat = hasDailyStats ? stats.dailyStats[i] : null;
    const isWalked = dayStat
      ? Boolean(dayStat.hasWalked || (dayStat.walkCount && dayStat.walkCount > 0))
      : false;
    const isToday = Boolean(dayStat?.isToday);

    return {
      id: `paw_slot_step_${i + 1}`,
      dayLabel: DAY_LABELS[i] ?? `${i + 1}`,
      filled: isWalked,
      isToday,
      walkCount: dayStat?.walkCount ?? 0,
    };
  });

  const completedDaysCount = slots.filter((s) => s.filled).length;

  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.88 : 1}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`이번 주 산책 달성도: ${totalSlots}일 중 ${completedDaysCount}일 달성`}
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {/* 1. 상단 아바타 & 타이틀 및 실시간 달성 배지 */}
      <View style={styles.topHeader}>
        <View style={styles.headerLeft}>
          <PuppyAccomplishmentAvatar />
          <Text style={[styles.title, { color: colors.textMain }]}>
            이번 주 산책 달성도
          </Text>
        </View>

        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>
            {completedDaysCount}/{totalSlots}일 완료
          </Text>
        </View>
      </View>

      {/* 2. 하단 7개 강아지 발자국(Paw) & 요일별 1:1 실데이터 게이지 바 */}
      <View style={styles.pawsRow}>
        {slots.map((slot) => (
          <View key={slot.id} style={styles.pawColumn}>
            <AccomplishmentPaw
              filled={slot.filled}
              activeColor="#58B273"
              inactiveColor="#E2E8F0"
            />
            <Text
              style={[
                styles.dayText,
                {
                  color: slot.filled
                    ? '#15803D'
                    : slot.isToday
                    ? '#2563EB'
                    : colors.textMuted,
                  fontWeight: slot.isToday || slot.filled ? '800' : '600',
                },
              ]}
            >
              {slot.dayLabel}
            </Text>
            {slot.isToday && (
              <View style={[styles.todayIndicatorDot, { backgroundColor: slot.filled ? '#15803D' : '#2563EB' }]} />
            )}
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  countBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#15803D',
  },
  avatarWrap: {
    width: 34,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 15.5,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  pawsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginTop: 6,
    paddingHorizontal: 2,
  },
  pawColumn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  pawWrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayText: {
    fontSize: 10,
    marginTop: 1,
  },
  todayIndicatorDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 1,
  },
});
