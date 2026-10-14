/**
 * [편안하개 - PetWalk]
 * 모바일 홈 화면 (Screen-02, docs/screenshots/02_home_screen.png 원형 복원 및 스크롤 방지 최적화)
 *
 * 1. 상단 환영 인사: "오늘도 편안하게, 우리 아이와 걸어요. 🐾"
 * 2. 활성 반려견 카드: 프로필, 상태 뱃지, 30분/폭신한길 칩, 원터치 [산책 시작 →] 버튼
 * 3. 지면온도 골든타임 위젯: 실시간 기상청 예보 연동 지면온도 추천 바
 * 4. AI 산책 플래너 배너: "오늘 어디로 산책할까요?" 원터치 진입
 * 5. 최근 산책 요약 카드: 완주 기록 및 AI 피드백 보정 연동
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAppTheme } from '../theme/themeManager';
import { DogProfile } from '../types/dogProfile';
import { HomeDogCard } from '../components/home/HomeDogCard';
import { GoldenTimeWidget } from '../components/home/GoldenTimeWidget';
import { RecentWalkCard } from '../components/home/RecentWalkCard';
import { FeedbackContextService, FeedbackSummaryPayload } from '../services/feedbackContext';
import { AppIcon } from '../components/common/AppIcon';
import { fetchHeatRiskForecast } from '../services/weatherApi';
import { HeatRiskResponse } from '../types/weather';
import { LocalStorageService } from '../services/storage';

export interface HomeScreenProps {
  dog: DogProfile;
  feedbackSummary: FeedbackSummaryPayload | null;
  onPressProfile: () => void;
  onStartWalk: () => void;
  onOpenPlanner: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  dog,
  feedbackSummary,
  onPressProfile,
  onStartWalk,
  onOpenPlanner,
}) => {
  const { colors } = useAppTheme();
  const [weather, setWeather] = useState<HeatRiskResponse | null>(null);
  const [recentStats, setRecentStats] = useState({
    title: '오늘의 산책',
    distanceKm: 2.4,
    durationMinutes: 38,
    safeRatioPercent: 72,
  });

  useEffect(() => {
    let isMounted = true;
    void fetchHeatRiskForecast(36.3628, 127.3592).then((res) => {
      if (isMounted) setWeather(res);
    });
    void LocalStorageService.getWalkHistory().then((history) => {
      if (!isMounted || history.length === 0) return;
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayList = history.filter((r) => r.completedAt.slice(0, 10) === todayStr);

      if (todayList.length > 0) {
        const totalDist = todayList.reduce((acc, r) => acc + r.totalDistanceKm, 0);
        const totalDur = todayList.reduce((acc, r) => acc + r.durationMinutes, 0);
        const avgSafe = Math.round(
          (todayList.reduce((acc, r) => acc + r.safeSurfaceRatio, 0) / todayList.length) * 100
        );
        setRecentStats({
          title: `오늘의 완주 (${todayList.length}회)`,
          distanceKm: Math.round(totalDist * 10) / 10,
          durationMinutes: totalDur,
          safeRatioPercent: avgSafe,
        });
      } else {
        const latest = history[0];
        const dateStr = new Date(latest.completedAt).toLocaleDateString('ko-KR', {
          month: 'numeric',
          day: 'numeric',
        });
        setRecentStats({
          title: `직전 완주 (${dateStr})`,
          distanceKm: Math.round(latest.totalDistanceKm * 10) / 10,
          durationMinutes: latest.durationMinutes,
          safeRatioPercent: Math.round(latest.safeSurfaceRatio * 100),
        });
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const currentTemp = typeof weather?.current_surface_temp === 'number'
    ? weather.current_surface_temp
    : 24;

  const goldenNotice = weather
    ? `현재 ${currentTemp.toFixed(0)}℃ · ${weather.notice ?? '산책 추천 시간대 (지면온도 적정)'}`
    : '현재 15:30 · 산책 추천 시간대 (지면온도 적정)';

  return (
    <View style={styles.container}>
      {/* 1. 환영 인사 (02_home_screen.png 원형 복원) */}
      <View style={styles.greetingSection}>
        <Text style={[styles.greetingSub, { color: colors.textMuted }]}>오늘도 편안하게,</Text>
        <View style={styles.greetingMainRow}>
          <Text style={[styles.greetingMain, { color: colors.textMain }]}>우리 아이와 걸어요.</Text>
          <AppIcon name="paw" size={18} color={colors.primary} />
        </View>
      </View>

      {/* 2. 메인 반려견 카드 (초코 상태, 프리셋 칩, 산책 시작 버튼) */}
      <HomeDogCard
        profile={dog}
        onPressProfile={onPressProfile}
        onStartWalk={onStartWalk}
      />

      {/* 3. 산책하기 좋은 시간 (지면온도 골든타임 위젯 실데이터 연동) */}
      <GoldenTimeWidget
        currentTimeLabel={new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
        startTimeLabel="14:00"
        endTimeLabel="17:00"
        progressPercent={Math.min(100, Math.max(0, Math.round(((currentTemp - 15) / 25) * 100)))}
        statusNotice={goldenNotice}
      />

      {/* 4. '산책' 버튼 (누르면 '산책 설정' 페이지로 이동) */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onOpenPlanner}
        style={[styles.walkNavButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={styles.walkNavContent}>
          <View style={[styles.walkNavIconBadge, { backgroundColor: colors.primaryLight }]}>
            <AppIcon name="paw" size={16} color={colors.primaryDark} />
          </View>
          <View style={styles.walkNavTextWrap}>
            <Text style={[styles.walkNavTitle, { color: colors.textMain }]}>산책</Text>
            <Text style={[styles.walkNavSub, { color: colors.textMuted }]}>원하는 시간·공원·노면 조건 설정</Text>
          </View>
          <Text style={[styles.walkNavArrow, { color: colors.primary }]}>➔</Text>
        </View>
      </TouchableOpacity>

      {/* 5. 최근 산책 요약 카드 ("오늘의 산책 / 2.4 km · 38분") */}
      <RecentWalkCard
        title={recentStats.title}
        distanceKm={recentStats.distanceKm}
        durationMinutes={recentStats.durationMinutes}
        safeRatioPercent={recentStats.safeRatioPercent}
        onPress={onStartWalk}
      />

      {/* (선택) 최근 피드백 AI 보정 브리핑 (간결한 1줄) */}
      {feedbackSummary && feedbackSummary.recent_walk_count > 0 && (
        <View style={[styles.feedbackBadge, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
          <AppIcon name="sparkle" size={13} color={colors.primaryDark} />
          <Text style={[styles.feedbackText, { color: colors.primaryDark }]} numberOfLines={1}>
            AI 맞춤 보정: {FeedbackContextService.generateBriefingNotice(feedbackSummary)}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    justifyContent: 'space-between', // 스크롤 없이 한 화면에 균형 배치
  },
  greetingSection: {
    marginBottom: 4,
  },
  greetingSub: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 2,
  },
  greetingMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  greetingMain: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  feedbackBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  feedbackText: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  walkNavButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  walkNavContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  walkNavIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walkNavTextWrap: {
    flex: 1,
  },
  walkNavTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  walkNavSub: {
    fontSize: 11,
    marginTop: 1,
  },
  walkNavArrow: {
    fontSize: 15,
    fontWeight: '700',
  },
});
