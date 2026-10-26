import { TYPOGRAPHY } from '../../theme/tokens';
/**
 * [편안하개 - PetWalk]
 * 마이페이지 컬러 테마 선택 카드 컴포넌트
 *
 * Upstream and PR #202 palette choices
 */

import React, { useState } from 'react';
import { Alert, View, StyleSheet, TouchableOpacity } from 'react-native';
import { AppText as Text } from '../common/AppText';
import { THEME_LIST } from '../../types/theme';
import { useAppTheme } from '../../theme/themeManager';
import { CardWrapper } from '../common/CardWrapper';
import { AppIcon } from '../common/AppIcon';

export const ThemeSelectorCard: React.FC = () => {
  const { theme, colors, isReady, setTheme } = useAppTheme();
  const [isSaving, setIsSaving] = useState(false);

  const selectTheme = async (nextTheme: typeof theme) => {
    if (isSaving || !isReady || nextTheme === theme) return;
    setIsSaving(true);
    try {
      const saved = await setTheme(nextTheme);
      if (!saved) {
        Alert.alert('테마 저장 실패', '테마를 저장하지 못했어요. 기존 테마를 유지합니다.');
      }
    } catch (error) {
      console.error('[ThemeSelectorCard] 테마 저장 중 오류:', error);
      Alert.alert('테마 저장 실패', '테마를 저장하지 못했어요. 기존 테마를 유지합니다.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <CardWrapper variant="flat" style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <AppIcon name="sparkle" size={16} color={colors.primary} />
          <Text style={[styles.cardTitle, { color: colors.textMain }]}>앱 컬러 테마 선택</Text>
        </View>
        <View style={[styles.activeBadge, { backgroundColor: colors.primaryLight }]}>
          <Text style={[styles.activeBadgeText, { color: colors.primaryDark }]}>
            {THEME_LIST.find((t) => t.id === theme)?.badgeText ?? '테마'}
          </Text>
        </View>
      </View>

      <Text style={[styles.subDesc, { color: colors.textMuted }]}>
        취향과 상황에 맞는 7가지 비주얼 스타일을 선택하세요.
      </Text>

      <View style={styles.themeGrid}>
        {THEME_LIST.map((item) => {
          const isSelected = theme === item.id;

          return (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.85}
              disabled={!isReady || isSaving}
              onPress={() => { void selectTheme(item.id); }}
              style={[
                styles.themeItem,
                {
                  backgroundColor: isSelected ? colors.primaryLight : colors.surface,
                  borderColor: isSelected ? colors.primary : colors.border,
                },
                (!isReady || isSaving) && styles.themeItemDisabled,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected, disabled: !isReady || isSaving }}
            >
              {/* 테마 컬러 프리뷰 스와치 */}
              <View style={[styles.swatchBox, { backgroundColor: item.previewBackground }]}>
                <View style={[styles.colorDot, { backgroundColor: item.previewPrimary }]} />
                <View style={[styles.colorDotSmall, { backgroundColor: item.previewAccent }]} />
              </View>

              <View style={styles.themeInfo}>
                <View style={styles.itemHeader}>
                  <Text style={[styles.themeName, { color: isSelected ? colors.primaryDark : colors.textMain }]}>
                    {item.name}
                  </Text>
                  {isSelected && <Text style={[styles.checkMark, { color: colors.primaryDark }]}>✓</Text>}
                </View>
                <Text style={[styles.themeDesc, { color: colors.textMuted }]} numberOfLines={1}>
                  {item.description}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </CardWrapper>
  );
};

const styles = StyleSheet.create({
  card: { marginBottom: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { fontSize: TYPOGRAPHY.cardTitle, fontWeight: '700' },
  activeBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  activeBadgeText: { fontSize: TYPOGRAPHY.label, fontWeight: '700' },
  subDesc: { fontSize: TYPOGRAPHY.support, marginTop: 2, marginBottom: 6 },
  themeGrid: { gap: 5 },
  themeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 8,
  },
  themeItemDisabled: { opacity: 0.6 },
  swatchBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  colorDot: { width: 12, height: 12, borderRadius: 6 },
  colorDotSmall: { width: 9, height: 9, borderRadius: 4.5 },
  themeInfo: { flex: 1 },
  itemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  themeName: { fontSize: TYPOGRAPHY.cardTitle, fontWeight: '700' },
  checkMark: { fontSize: TYPOGRAPHY.label, fontWeight: '800' },
  themeDesc: { fontSize: TYPOGRAPHY.support, marginTop: 1 },
});
