/**
 * [편안하개 - PetWalk]
 * 마이페이지 프로필 탭 - 데이터 백업 및 복원 카드 컴포넌트
 *
 * - 스마트폰 기기 변경 및 원본 보관용 통합 JSON 백업 파일 생성
 * - UX 관점에서 백업 바로 아래에 이어서 배치된 JSON 백업 파일 원터치 복원(Restore)
 */

import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import { TOKENS } from '../../theme/tokens';
import { useAppTheme } from '../../theme/themeManager';
import { AppIcon } from '../common/AppIcon';
import { DogProfile } from '../../types/dogProfile';
import { WalkRecord } from '../../types/storage';
import { LocalStorageService } from '../../services/storage';
import { WalkStatisticsService } from '../../services/walkStatisticsService';
import { BackupService, RestoreResult } from '../../services/backupService';

export interface DataBackupRestoreCardProps {
  readonly dog: DogProfile;
  readonly defaultExpanded?: boolean;
  readonly onRestoreCompleted?: (result: RestoreResult) => void;
}

export const DataBackupRestoreCard: React.FC<DataBackupRestoreCardProps> = ({
  dog,
  defaultExpanded = true,
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

  const handleExportCsv = () => {
    if (records.length === 0) {
      Alert.alert('알림', '내보낼 산책 기록이 없습니다.');
      return;
    }
    const success = WalkStatisticsService.downloadCsvFile(records, dog.name);
    if (success) {
      Alert.alert('CSV 다운로드 완료', `🐾 ${dog.name}의 산책 기록(CSV)이 다운로드되었습니다.\n엑셀(Excel)에서 바로 열람할 수 있습니다.`);
    } else {
      const csv = WalkStatisticsService.exportWalkRecordsToCsv(records, dog.name);
      Alert.alert('CSV 내보내기', `총 ${records.length}건의 산책 데이터가 CSV로 생성되었습니다.`);
    }
  };

  const handleExportJson = () => {
    const success = BackupService.downloadUnifiedBackupJsonFile(dog, records);
    if (success) {
      Alert.alert('JSON 저장 완료', `🐾 ${dog.name}의 프로필과 산책 기록(${records.length}건)이 포함된 통합 백업 파일이 저장되었습니다.`);
      return;
    }

    const jsonStr = BackupService.exportUnifiedBackupToJson(dog, records);
    Alert.alert('데이터 내보내기', `총 ${records.length}건의 산책 데이터와 프로필이 생성되었습니다:\n${jsonStr.slice(0, 100)}...`);
  };

  const handleTriggerFilePicker = () => {
    if (Platform.OS === 'web' && fileInputRef.current) {
      fileInputRef.current.click();
    } else {
      Alert.alert(
        '데이터 복원',
        '백업해 둔 편안하개 JSON 파일(.json)의 내용을 붙여넣거나 파일 선택을 통해 복원할 수 있습니다.',
        [{ text: '확인' }]
      );
    }
  };

  const handleWebFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result;
      if (typeof content !== 'string') return;

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
        const errorMsg = '유효한 편안하개 백업 JSON 파일이 아니거나 손상되었습니다.';
        if (typeof window !== 'undefined') {
          window.alert(errorMsg);
        } else {
          Alert.alert('복원 실패', errorMsg);
        }
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
        accessibilityLabel="동물병원 제출 및 데이터 백업 복원 열기"
      >
        <View style={styles.headerLeft}>
          <Text style={styles.headerIcon}>📁</Text>
          <View>
            <Text style={[styles.headerTitle, { color: colors.textMain }]}>동물병원 제출 및 데이터 백업·복원</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
              {isExpanded ? '엑셀(CSV) 및 백업·복원(JSON) 기능 닫기' : '슬개골 진료 상담 표 / 기기 변경 백업 및 복원 열기'}
            </Text>
          </View>
        </View>
        <Text style={[styles.toggleArrow, { color: colors.textMuted }]}>{isExpanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {/* 2. 아코디언 본문 (백업 및 복원) */}
      {isExpanded && (
        <View style={styles.accordionBody}>
          <Text style={[styles.bodyNotice, { color: colors.textMuted }]}>
            수의사 진료 시 누적 보행 데이터를 확인하거나, 스마트폰 변경 시 강아지 프로필과 산책 데이터를 안전하게 백업 및 복원할 수 있습니다.
          </Text>

          {/* 2-1. 내보내기 액션 버튼 행 */}
          <View style={styles.actionBtnRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleExportCsv}
              style={[styles.exportBtn, { backgroundColor: colors.primaryWash, borderColor: colors.primaryMint }]}
              accessibilityLabel="엑셀 CSV 저장"
            >
              <AppIcon name="map" size={14} color={colors.primaryDark} />
              <View style={styles.btnTextGroup}>
                <Text style={[styles.btnTitle, { color: colors.primaryDark }]}>📥 엑셀(CSV) 저장</Text>
                <Text style={[styles.btnSub, { color: colors.textMuted }]}>병원 진료·보험 제출용</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleExportJson}
              style={[styles.exportBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
              accessibilityLabel="JSON 백업"
            >
              <AppIcon name="sparkle" size={14} color={colors.primary} />
              <View style={styles.btnTextGroup}>
                <Text style={[styles.btnTitle, { color: colors.textMain }]}>📋 JSON 백업</Text>
                <Text style={[styles.btnSub, { color: colors.textMuted }]}>기기 이전·전체 보관용</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* 2-2. 복원하기 섹션 (UX 관점에서 백업과 자연스럽게 연결) */}
          <View style={[styles.restoreDivider, { backgroundColor: colors.border }]} />

          <View style={styles.restoreHeaderRow}>
            <Text style={[styles.restoreSectionTitle, { color: colors.textMain }]}>📂 기기 변경 데이터 복원</Text>
          </View>
          <Text style={[styles.restoreNotice, { color: colors.textMuted }]}>
            이전에 백업해 둔 편안하개 JSON 파일(`.json`)을 선택하면, 강아지 프로필과 산책 기록을 자동으로 판별하여 즉시 복원합니다.
          </Text>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleTriggerFilePicker}
            style={[styles.restoreBtn, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
            accessibilityRole="button"
            accessibilityLabel="백업 파일 JSON 선택하여 복원"
          >
            <AppIcon name="users" size={14} color={colors.primaryDark} />
            <Text style={[styles.restoreBtnText, { color: colors.primaryDark }]}>📂 백업 파일(JSON) 선택하여 복원하기</Text>
          </TouchableOpacity>

          {/* Web 전용 보이지 않는 File Input */}
          {Platform.OS === 'web' && (
            <input
              type="file"
              ref={fileInputRef as any}
              onChange={handleWebFileChange as any}
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
    fontSize: 13,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
  },
  headerSubtitle: {
    fontSize: 10.5,
    color: TOKENS.colors.textMuted,
    marginTop: 1,
  },
  toggleArrow: {
    fontSize: 12,
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
    fontSize: 11,
    color: TOKENS.colors.textMuted,
    lineHeight: 16,
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
    fontSize: 11.5,
    fontWeight: '700',
  },
  btnSub: {
    fontSize: 9.5,
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
    fontSize: 12,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
  },
  restoreNotice: {
    fontSize: 10.5,
    color: TOKENS.colors.textMuted,
    lineHeight: 15,
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
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
  },
});
