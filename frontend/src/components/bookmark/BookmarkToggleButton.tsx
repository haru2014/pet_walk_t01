/**
 * [편안하개 - PetWalk]
 * 안심 코스 즐겨찾기 토글 버튼 (US-29)
 *
 * 코스 프리뷰 / 완주 리포트에서 공통으로 사용하며, 탭 즉시 로컬 보관함에 저장/해제한다.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppTheme } from '../../theme/themeManager';
import { BookmarkedRoute } from '../../types/bookmark';
import { BookmarkService } from '../../services/bookmarkService';
import { hapticLight, hapticSuccess } from '../../services/haptics';
import { AppIcon } from '../common/AppIcon';

export interface BookmarkToggleButtonProps {
  readonly bookmark: BookmarkedRoute | null;
}

export const BookmarkToggleButton: React.FC<BookmarkToggleButtonProps> = ({ bookmark }) => {
  const { colors } = useAppTheme();
  const [saved, setSaved] = useState(false);
  const bookmarkId = bookmark?.id;

  useEffect(() => {
    let mounted = true;
    if (!bookmarkId) {
      return undefined;
    }
    void BookmarkService.isBookmarked(bookmarkId).then((value) => {
      if (mounted) setSaved(value);
    });
    return () => {
      mounted = false;
    };
  }, [bookmarkId]);

  const handleToggle = async () => {
    if (!bookmark) return;
    const next = await BookmarkService.toggleBookmark(bookmark);
    setSaved(next);
    void (next ? hapticSuccess() : hapticLight());
  };
  const isSaved = Boolean(bookmarkId && saved);

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={!bookmark}
      onPress={() => void handleToggle()}
      accessibilityRole="button"
      accessibilityLabel={isSaved ? '즐겨찾기 해제' : '즐겨찾기 저장'}
      style={[
        styles.button,
        {
          borderColor: isSaved ? colors.primaryMint : colors.border,
          backgroundColor: isSaved ? colors.primaryWash : colors.background,
        },
      ]}
    >
      <View style={styles.content}>
        <AppIcon
          name="heart"
          size={14}
          color={isSaved ? colors.primaryDark : colors.textMuted}
          filled={isSaved}
        />
        <Text
          style={[
            styles.text,
            { color: isSaved ? colors.primaryDark : colors.textMain },
          ]}
        >
          {isSaved ? '저장됨' : '찜하기'}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  text: { fontSize: 11, fontWeight: '700' },
  content: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
