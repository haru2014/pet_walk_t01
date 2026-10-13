/**
 * [편안하개 - PetWalk]
 * 안심 코스 즐겨찾기 토글 버튼 (US-29)
 *
 * 코스 프리뷰 / 완주 리포트에서 공통으로 사용하며, 탭 즉시 로컬 보관함에 저장/해제한다.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { TOKENS } from '../../theme/tokens';
import { BookmarkedRoute } from '../../types/bookmark';
import { BookmarkService } from '../../services/bookmarkService';
import { hapticLight, hapticSuccess } from '../../services/haptics';
import { AppIcon } from '../common/AppIcon';

export interface BookmarkToggleButtonProps {
  readonly bookmark: BookmarkedRoute | null;
}

export const BookmarkToggleButton: React.FC<BookmarkToggleButtonProps> = ({ bookmark }) => {
  const [saved, setSaved] = useState(false);
  const bookmarkId = bookmark?.id;

  useEffect(() => {
    let mounted = true;
    if (!bookmarkId) {
      setSaved(false);
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

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={!bookmark}
      onPress={() => void handleToggle()}
      accessibilityRole="button"
      accessibilityLabel={saved ? '즐겨찾기 해제' : '즐겨찾기 저장'}
      style={[styles.button, saved && styles.buttonSaved]}
    >
      <View style={styles.content}>
        <AppIcon name="heart" size={14} color={saved ? TOKENS.colors.primary : TOKENS.colors.textMuted} filled={saved} />
        <Text style={[styles.text, saved && styles.textSaved]}>{saved ? '저장됨' : '찜하기'}</Text>
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
    borderColor: TOKENS.colors.border,
    backgroundColor: TOKENS.colors.surface,
  },
  buttonSaved: { borderColor: TOKENS.colors.primaryMint, backgroundColor: TOKENS.colors.primaryLight },
  text: { fontSize: 11, fontWeight: '700', color: TOKENS.colors.textMuted },
  textSaved: { color: TOKENS.colors.primaryDark },
  content: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
