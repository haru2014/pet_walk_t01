/**
 * [편안하개 - PetWalk]
 * 마이페이지 프로필 탭 - 데이터 백업 및 복원 카드 컴포넌트
 *
 * - 스마트폰 기기 변경 및 원본 보관용 통합 백업 파일 생성 (내부 포맷: JSON)
 * - UX 관점에서 백업 바로 아래에 이어서 배치된 백업 파일 원터치 복원(Restore)
 */

import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import { AppText as Text } from '../common/AppText';
import { TOKENS, TYPOGRAPHY, TYPOGRAPHY_LINE_HEIGHT } from '../../theme/tokens';
import { useAppTheme } from '../../theme/themeManager';
import { AppIcon } from '../common/AppIcon';
import { DogProfile } from '../../types/dogProfile';
import { WalkRecord } from '../../types/storage';
import { LocalStorageService } from '../../services/storage';
import { BackupService, RestoreResult } from '../../services/backupService';

export interface DataBackupRestoreCardProps {
  readonly dog: DogProfile;
  readonly defaultExpanded?: boolean;
  readonly onRestoreCompleted?: (result: RestoreResult) => void;
}

export const DataBackupRestoreCard: React.FC<DataBackupRestoreCardProps> = ({
  dog,
  defaultExpanded = false,
  onRestoreCompleted,
}) => {
  const { colors } = useAppTheme();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [records, setRecords] = useState<WalkRecord[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let mounted = true;
    void LocalStorageService.getWalkHistory().then((history) => {
      if (mounted) setRecords(history);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleBackup = async () => {
    const success = await BackupService.downloadUnifiedBackupJsonFile(dog, records);
    if (success) {
      Alert.alert('백업 완료', `🐾 ${dog.name}의 프로필과 산책 기록(${records.length}건)이 백업되었습니다.`);
      return;
    }
    Alert.alert('백업 실패', '백업 파일을 만들거나 저장하지 못했습니다. 다시 시도해 주세요.');
  };

  const handleRestoreContent = async (content: string) => {
    const result = await BackupService.restoreAnyBackup(content);
    if (result) {
      const profileMsg = result.profile ? `[${result.profile.name}] 프로필` : '';
      const recordsMsg = result.recordsCount > 0 ? `산책 기록 ${result.recordsCount}건` : '';
      const combined = [profileMsg, recordsMsg].filter(Boolean).join(' 및 ');

      const message = `🐾 ${combined || '데이터'}이(가) 성공적으로 복원되었습니다!`;
      if (typeof window !== 'undefined') {
        window.alert(message);
      } else {
        Alert.alert('복원 완료', message);
      }
      onRestoreCompleted?.(result);
    } else {
      const errorMsg = '유효한 편안하개 백업 파일이 아니거나 손상되었습니다.';
      if (typeof window !== 'undefined') {
        window.alert(errorMsg);
      } else {
        Alert.alert('복원 실패', errorMsg);
      }
    }
  };

  const handleTriggerFilePicker = async () => {
    if (Platform.OS === 'web') {
      fileInputRef.current?.click();
      return;
    }

    try {
      const content = await BackupService.pickBackupJsonFile();
      if (content !== null) await handleRestoreContent(content);
    } catch {
      Alert.alert('복원 실패', '백업 파일을 열지 못했습니다. 파일을 확인하고 다시 시도해 주세요.');
    }
  };

  const handleWebFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const content = loadEvent.target?.result;
      if (typeof content === 'string') void handleRestoreContent(content);
      event.target.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <View style={[styles.accordionContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* 1. 접이식 아코디언 헤더 */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setIsExpanded(!isExpanded)}
        style={styles.accordionHeader}
        accessibilityRole="button"
        accessibilityLabel="백업 및 복원하기 열기"
      >
        <View style={styles.headerLeft}>
          <Text style={styles.headerIcon}>📁</Text>
          <View>
            <Text style={[styles.headerTitle, { color: colors.textMain }]}>백업 및 복원하기</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
              {isExpanded ? '닫기' : '기기를 바꿀 때 내 데이터를 옮겨 보세요'}
            </Text>
          </View>
        </View>
        <Text style={[styles.toggleArrow, { color: colors.textMuted }]}>{isExpanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {/* 2. 아코디언 본문 (백업 및 복원) */}
      {isExpanded && (
        <View style={styles.accordionBody}>
          <Text style={[styles.bodyNotice, { color: colors.textMuted }]}>
            스마트폰을 바꾸거나 데이터를 보관하고 싶을 때, 강아지 프로필과 산책 기록을 안전하게 백업하고 복원할 수 있습니다.
          </Text>

          {/* 2-1. 백업하기 버튼 */}
          <View style={styles.actionBtnRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleBackup}
              style={[styles.exportBtn, { backgroundColor: colors.primaryWash, borderColor: colors.primaryMint }]}
              accessibilityLabel="백업하기"
            >
              <AppIcon name="sparkle" size={14} color={colors.primaryDark} />
              <View style={styles.btnTextGroup}>
                <Text style={[styles.btnTitle, { color: colors.primaryDark }]}>📋 백업하기</Text>
                <Text style={[styles.btnSub, { color: colors.textMuted }]}>기기 이전·전체 보관용</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* 2-2. 복원하기 섹션 (UX 관점에서 백업과 자연스럽게 연결) */}
          <View style={[styles.restoreDivider, { backgroundColor: colors.border }]} />

          <View style={styles.restoreHeaderRow}>
            <Text style={[styles.restoreSectionTitle, { color: colors.textMain }]}>📂 복원하기</Text>
          </View>
          <Text style={[styles.restoreNotice, { color: colors.textMuted }]}>
            이전에 백업해 둔 편안하개 백업 파일을 선택하면, 강아지 프로필과 산책 기록을 자동으로 찾아 복원합니다.
          </Text>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleTriggerFilePicker}
            style={[styles.restoreBtn, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
            accessibilityRole="button"
            accessibilityLabel="복원하기"
          >
            <AppIcon name="users" size={14} color={colors.primaryDark} />
            <Text style={[styles.restoreBtnText, { color: colors.primaryDark }]}>📂 복원하기</Text>
          </TouchableOpacity>

          {Platform.OS === 'web' && (
            <input
              type="file"
              ref={fileInputRef as React.RefObject<HTMLInputElement>}
              onChange={handleWebFileChange}
              accept=".json,application/json"
              style={{ display: 'none' }}
              data-testid="backup-file-input"
            />
          )}

        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  accordionContainer: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    overflow: 'hidden',
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  headerIcon: {
    fontSize: 16,
  },
  headerTitle: {
    fontSize: TYPOGRAPHY.screenTitle,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
  },
  headerSubtitle: {
    fontSize: TYPOGRAPHY.support,
    color: TOKENS.colors.textMuted,
    marginTop: 1,
  },
  toggleArrow: {
    fontSize: TYPOGRAPHY.label,
    fontWeight: '700',
    color: TOKENS.colors.textMuted,
    paddingLeft: 8,
  },
  accordionBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  bodyNotice: {
    fontSize: TYPOGRAPHY.support,
    color: TOKENS.colors.textMuted,
    lineHeight: TYPOGRAPHY_LINE_HEIGHT.support,
    marginBottom: 10,
  },
  actionBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  exportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  btnTextGroup: {
    alignItems: 'flex-start',
  },
  btnTitle: {
    fontSize: TYPOGRAPHY.button,
    fontWeight: '700',
  },
  btnSub: {
    fontSize: TYPOGRAPHY.button,
    color: TOKENS.colors.textMuted,
    marginTop: 1,
  },
  restoreDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 12,
  },
  restoreHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  restoreSectionTitle: {
    fontSize: TYPOGRAPHY.cardTitle,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
  },
  restoreNotice: {
    fontSize: TYPOGRAPHY.support,
    color: TOKENS.colors.textMuted,
    lineHeight: TYPOGRAPHY_LINE_HEIGHT.support,
    marginBottom: 8,
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderColor: '#34D399',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
  },
  restoreBtnText: {
    fontSize: TYPOGRAPHY.button,
    fontWeight: '700',
    color: '#065F46',
  },
});
