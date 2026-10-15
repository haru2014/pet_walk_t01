/**
 * [편안하개 - PetWalk]
 * 마이페이지 산책 기록 목록 및 커뮤니티 후기 공개(is_public) 토글 뷰 (US-G2, PR #42)
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { TOKENS } from '../../theme/tokens';
import { CardWrapper } from '../common/CardWrapper';
import { AppIcon } from '../common/AppIcon';
import { DogAvatar } from '../common/DogAvatar';
import { WalkRecord } from '../../types/storage';
import { LocalStorageService } from '../../services/storage';
import { SupabaseService } from '../../services/supabaseService';
import {
  WalkStatisticsService,
  StatsPeriodType,
} from '../../services/walkStatisticsService';

export interface MyWalkHistoryViewProps {
  readonly dogName: string;
  readonly onOpenAuthModal?: (mode?: 'signup' | 'signin') => void;
}

export const MyWalkHistoryView: React.FC<MyWalkHistoryViewProps> = ({ dogName, onOpenAuthModal }) => {
  const [records, setRecords] = useState<WalkRecord[]>([]);
  const [publicMap, setPublicMap] = useState<Record<string, boolean>>({});
  const [period, setPeriod] = useState<StatsPeriodType>('7days');

  useEffect(() => {
    void LocalStorageService.getWalkHistory().then(setRecords);
  }, []);

  const periodStats = WalkStatisticsService.getPeriodStats(records, period);

  const handleExportCsv = () => {
    if (records.length === 0) {
      Alert.alert('알림', '내보낼 산책 기록이 없습니다.');
      return;
    }
    const success = WalkStatisticsService.downloadCsvFile(records, dogName);
    if (success) {
      Alert.alert('CSV 다운로드 완료', `🐾 ${dogName}의 산책 기록(CSV)이 다운로드 폴더에 저장되었습니다.\n엑셀(Excel)에서 바로 열람할 수 있습니다.`);
    } else {
      const csv = WalkStatisticsService.exportWalkRecordsToCsv(records, dogName);
      Alert.alert('CSV 내보내기', `총 ${records.length}건의 산책 데이터가 CSV로 생성되었습니다.`);
    }
  };

  const handleExportJson = () => {
    if (records.length === 0) {
      Alert.alert('알림', '내보낼 산책 기록이 없습니다.');
      return;
    }
    const jsonStr = WalkStatisticsService.exportWalkRecordsToJson(records, dogName);
    if (typeof window !== 'undefined') {
      try {
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `편안하개_산책데이터_${dogName}.json`;
        a.click();
        URL.revokeObjectURL(url);
        Alert.alert('JSON 저장 완료', '산책 데이터 JSON 백업 파일이 저장되었습니다.');
        return;
      } catch {}
    }
    Alert.alert('데이터 내보내기', `총 ${records.length}건의 데이터가 생성되었습니다:\n${jsonStr.slice(0, 100)}...`);
  };

  const handleTogglePublic = async (record: WalkRecord) => {
    const user = SupabaseService.getCurrentUser();
    if (!user) {
      Alert.alert(
        '회원 전용 기능',
        '커뮤니티 후기 공유는 회원만 가능합니다.\n회원가입 후 동네 이웃들에게 우리 아이 안심 코스를 공유해 보세요!',
        [
          { text: '취소', style: 'cancel' },
          { text: '회원가입하기', onPress: () => onOpenAuthModal?.('signup') },
        ]
      );
      return;
    }

    const current = publicMap[record.id] ?? false;
    const nextState = !current;

    await SupabaseService.toggleWalkRecordPublic(record.id, nextState);
    setPublicMap((prev) => ({ ...prev, [record.id]: nextState }));

    const message = nextState
      ? '🌐 이 산책 기록이 커뮤니티 공개 후기(is_public: true)로 전환되었습니다.'
      : '🔒 공개가 해제되어 나만의 비공개 기록으로 보관됩니다.';
    Alert.alert(nextState ? '후기 공개 설정' : '비공개 전환', message);
  };

  if (records.length === 0) {
    return (
      <CardWrapper variant="flat" style={{ marginBottom: 16 }}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>🐾 나의 산책 기록 목록</Text>
          <View style={styles.badge}><Text style={styles.badgeText}>클라우드 연동</Text></View>
        </View>
        <Text style={styles.emptyText}>
          아직 완주한 산책 기록이 없습니다. {dogName}와 첫 안심 산책을 시작해보세요!
        </Text>
      </CardWrapper>
    );
  }

  return (
    <CardWrapper variant="flat" style={{ marginBottom: 16 }}>
      {/* 1. 상단 타이틀 & 내보내기 버튼 */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>🐾 산책 통계 및 기록 ({records.length}회)</Text>
          <Text style={styles.subDesc}>
            기간별 보행 지표 분석 및 동물병원·보험 제출용 리포트 내보내기
          </Text>
        </View>
        <View style={styles.badge}><Text style={styles.badgeText}>DB 동기화</Text></View>
      </View>

      {/* 2. 기간 선택 필터 칩 (최근 7일 / 최근 30일 / 전체) */}
      <View style={styles.periodRow}>
        {(['7days', '30days', 'all'] as const).map((p) => {
          const isSelected = period === p;
          const labels = { '7days': '최근 7일', '30days': '최근 30일', all: '전체 기록' };
          return (
            <TouchableOpacity
              key={p}
              activeOpacity={0.8}
              onPress={() => setPeriod(p)}
              style={[styles.periodChip, isSelected && styles.periodChipActive]}
            >
              <Text style={[styles.periodChipText, isSelected && styles.periodChipTextActive]}>
                {labels[p]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 3. 기간별 헬스케어 통계 요약 박스 */}
      <View style={styles.statsSummaryBox}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>산책 횟수</Text>
          <Text style={styles.summaryValue}>{periodStats.totalWalks}회</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>총 거리</Text>
          <Text style={styles.summaryValue}>{periodStats.totalDistanceKm}km</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>총 시간</Text>
          <Text style={styles.summaryValue}>{periodStats.totalDurationMinutes}분</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>완만 노면율</Text>
          <Text style={[styles.summaryValue, { color: TOKENS.colors.primaryDark }]}>
            {periodStats.averageSafeRatioPercent}%
          </Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>총 배변</Text>
          <Text style={styles.summaryValue}>{periodStats.totalPoopCount}회</Text>
        </View>
      </View>

      {/* 4. 리포트 내보내기 액션 버튼 바 */}
      <View style={styles.exportBtnRow}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleExportCsv}
          style={[styles.exportBtn, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}
        >
          <AppIcon name="map" size={14} color="#047857" />
          <Text style={[styles.exportBtnText, { color: '#047857' }]}>📥 엑셀(CSV) 내보내기</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleExportJson}
          style={[styles.exportBtn, { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }]}
        >
          <AppIcon name="sparkle" size={14} color="#475569" />
          <Text style={[styles.exportBtnText, { color: '#475569' }]}>📋 JSON 백업</Text>
        </TouchableOpacity>
      </View>

      {/* 5. 누적된 산책 기록 목록 스크롤 격리 영역 */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
      >
        {records.map((rec) => {
          const isPublic = publicMap[rec.id] ?? false;
          const dateStr = new Date(rec.completedAt).toLocaleDateString('ko-KR', {
            month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
          });

          return (
            <View key={rec.id} style={[styles.recordCard, isPublic && styles.recordCardPublic]}>
              <View style={styles.recordTop}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <View style={styles.recordHeaderRow}>
                    <Text style={styles.recordDate}>{dateStr}</Text>
                    {rec.dogSummary ? (
                      <View style={styles.dogBadge}>
                        <DogAvatar photoUri={rec.dogSummary.photoUri} size={15} />
                        <Text style={styles.dogBadgeText}>
                          {rec.dogSummary.name} ({rec.dogSummary.breed})
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.dogBadge}>
                        <Text style={styles.dogBadgeText}>🐾 {dogName}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.recordMetrics}>
                    {rec.totalDistanceKm.toFixed(1)}km · {rec.durationMinutes}분 · 평균 {rec.averageSpeedKmH.toFixed(1)}km/h
                  </Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => void handleTogglePublic(rec)}
                  style={[styles.publicBtn, isPublic ? styles.publicBtnActive : styles.publicBtnInactive]}
                >
                  <AppIcon name="users" size={14} color={isPublic ? '#047857' : TOKENS.colors.textMuted} />
                  <Text style={[styles.publicBtnText, isPublic && styles.publicBtnTextActive]}>
                    {isPublic ? '공개 중 ✓' : '후기 공유'}
                  </Text>
                </TouchableOpacity>
              </View>

              {rec.feedback && (
                <View style={styles.feedbackRow}>
                  <Text style={styles.feedbackComfort}>
                    만족도 {rec.feedback.comfortScore}점 · {rec.feedback.tags.join(', ')}
                  </Text>
                  {Boolean(rec.feedback.comment) && (
                    <Text style={styles.feedbackComment}>&quot;{rec.feedback.comment}&quot;</Text>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </CardWrapper>
  );
};

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 14, fontWeight: '700', color: TOKENS.colors.textMain },
  badge: {
    backgroundColor: TOKENS.colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: TOKENS.colors.primaryDark },
  subDesc: { fontSize: 12, color: TOKENS.colors.textMuted, marginTop: 4 },
  emptyText: { fontSize: 13, color: TOKENS.colors.textMuted, marginTop: 8 },
  recordCard: {
    backgroundColor: TOKENS.colors.background,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    borderRadius: 12,
    padding: 12,
  },
  recordCardPublic: { borderColor: '#10B981', backgroundColor: '#F0FDF4' },
  recordTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recordHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
    flexWrap: 'wrap',
  },
  dogBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TOKENS.colors.primaryLight,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 4,
  },
  dogBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: TOKENS.colors.primaryDark,
  },
  recordDate: { fontSize: 13, fontWeight: '700', color: TOKENS.colors.textMain },
  recordMetrics: { fontSize: 12, color: TOKENS.colors.textMuted, marginTop: 2 },
  publicBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  publicBtnInactive: {
    backgroundColor: TOKENS.colors.surface,
    borderColor: TOKENS.colors.border,
  },
  publicBtnActive: {
    backgroundColor: '#D1FAE5',
    borderColor: '#34D399',
  },
  publicBtnText: { fontSize: 11, fontWeight: '600', color: TOKENS.colors.textMuted },
  publicBtnTextActive: { color: '#047857', fontWeight: '700' },
  feedbackRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: TOKENS.colors.border,
  },
  feedbackComfort: { fontSize: 11, fontWeight: '600', color: TOKENS.colors.primaryDark },
  feedbackComment: { fontSize: 11, color: TOKENS.colors.textMuted, marginTop: 2, fontStyle: 'italic' },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    marginBottom: 8,
  },
  periodChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: TOKENS.colors.background,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
  },
  periodChipActive: {
    backgroundColor: TOKENS.colors.primaryLight,
    borderColor: TOKENS.colors.primary,
  },
  periodChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: TOKENS.colors.textMuted,
  },
  periodChipTextActive: {
    color: TOKENS.colors.primaryDark,
    fontWeight: '700',
  },
  statsSummaryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    paddingVertical: 10,
    paddingHorizontal: 6,
    marginBottom: 8,
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryLabel: {
    fontSize: 10.5,
    fontWeight: '500',
    color: TOKENS.colors.textMuted,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 12.5,
    fontWeight: '800',
    color: TOKENS.colors.textMain,
  },
  exportBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  exportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  exportBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  scrollArea: {
    maxHeight: 460,
    marginTop: 4,
  },
  scrollContent: {
    gap: 10,
    paddingRight: 4,
    paddingBottom: 4,
  },
});
