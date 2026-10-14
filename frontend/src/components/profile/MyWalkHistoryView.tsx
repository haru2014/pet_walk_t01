/**
 * [편안하개 - PetWalk]
 * 마이페이지 산책 기록 목록 및 커뮤니티 후기 공개(is_public) 토글 뷰 (US-G2, PR #42)
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { TOKENS } from '../../theme/tokens';
import { CardWrapper } from '../common/CardWrapper';
import { AppIcon } from '../common/AppIcon';
import { WalkRecord } from '../../types/storage';
import { LocalStorageService } from '../../services/storage';
import { SupabaseService } from '../../services/supabaseService';

export interface MyWalkHistoryViewProps {
  readonly dogName: string;
  readonly onOpenAuthModal?: (mode?: 'signup' | 'signin') => void;
}

export const MyWalkHistoryView: React.FC<MyWalkHistoryViewProps> = ({ dogName, onOpenAuthModal }) => {
  const [records, setRecords] = useState<WalkRecord[]>([]);
  const [publicMap, setPublicMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void loadRecords();
  }, []);

  const loadRecords = async () => {
    const list = await LocalStorageService.getWalkHistory();
    setRecords(list);
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
          <Text style={styles.title}>🐾 나의 산책 기록 목록 (US-G2)</Text>
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
      <View style={styles.headerRow}>
        <Text style={styles.title}>🐾 나의 산책 기록 목록 ({records.length}회)</Text>
        <View style={styles.badge}><Text style={styles.badgeText}>DB 동기화</Text></View>
      </View>
      <Text style={styles.subDesc}>
        완주한 기록을 확인하고, "후기 공개"를 누르면 이웃 견주들과 안심 코스를 나눕니다.
      </Text>

      <View style={{ gap: 10, marginTop: 10 }}>
        {records.slice(0, 5).map((rec) => {
          const isPublic = publicMap[rec.id] ?? false;
          const dateStr = new Date(rec.completedAt).toLocaleDateString('ko-KR', {
            month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
          });

          return (
            <View key={rec.id} style={[styles.recordCard, isPublic && styles.recordCardPublic]}>
              <View style={styles.recordTop}>
                <View>
                  <Text style={styles.recordDate}>{dateStr}</Text>
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
                    <Text style={styles.feedbackComment}>"{rec.feedback.comment}"</Text>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>
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
});
