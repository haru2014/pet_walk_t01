/**
 * [편안하개 - PetWalk]
 * 모바일 홈 활성 반려견 카드 및 다견 슬라이더 (Screen-01, US-A2)
 *
 * 1. 단일견: 심플한 활성 반려견 정보 카드
 * 2. 다견(2마리 이상): 좌우 스와이프 페이징(Carousel) + 페이지네이션 도트 인디케이터 + 실시간 활성견 변경 연동
 * 3. 마지막 슬라이드: "+ 새로운 반려견 등록" 퀵 추가 카드 제공
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Dimensions,
} from 'react-native';
import { TOKENS } from '../../theme/tokens';
import { DogProfile } from '../../types/dogProfile';
import { AppIcon } from '../common/AppIcon';
import { DogAvatar } from '../common/DogAvatar';

export interface HomeDogCardProps {
  profile: DogProfile;
  dogs?: readonly DogProfile[];
  selectedDogId?: string;
  onSelectDog?: (dogId: string) => void;
  onAddDog?: () => void;
  onPressProfile?: () => void;
  onStartWalk?: () => void;
}

export const HomeDogCard: React.FC<HomeDogCardProps> = ({
  profile,
  dogs,
  selectedDogId,
  onSelectDog,
  onAddDog,
  onPressProfile,
  onStartWalk,
}) => {
  const dogList = dogs && dogs.length > 0 ? dogs : [profile];
  const isMultiDog = dogList.length > 1;

  const [cardWidth, setCardWidth] = useState<number>(() => {
    const w = Dimensions.get('window').width;
    return Math.min(w, 480) - 32;
  });

  const [activeIndex, setActiveIndex] = useState<number>(() => {
    const initIdx = dogList.findIndex((d) => d.id === (selectedDogId ?? profile.id));
    return initIdx >= 0 ? initIdx : 0;
  });

  const scrollRef = useRef<ScrollView>(null);

  // 외부에서 선택된 반려견이 변경되면 슬라이더 위치 동기화
  useEffect(() => {
    if (!selectedDogId) return;
    const targetIdx = dogList.findIndex((d) => d.id === selectedDogId);
    if (targetIdx >= 0 && targetIdx !== activeIndex && cardWidth > 0) {
      setActiveIndex(targetIdx);
      scrollRef.current?.scrollTo({ x: targetIdx * cardWidth, animated: true });
    }
  }, [selectedDogId, dogList, cardWidth]);

  const handleScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (cardWidth <= 0) return;
    const offsetX = e.nativeEvent.contentOffset.x;
    const newIndex = Math.round(offsetX / cardWidth);
    if (newIndex >= 0 && newIndex !== activeIndex) {
      setActiveIndex(newIndex);
      if (newIndex < dogList.length) {
        onSelectDog?.(dogList[newIndex].id);
      }
    }
  };

  const handleDotPress = (idx: number) => {
    if (cardWidth <= 0) return;
    setActiveIndex(idx);
    scrollRef.current?.scrollTo({ x: idx * cardWidth, animated: true });
    if (idx < dogList.length) {
      onSelectDog?.(dogList[idx].id);
    }
  };

  // 단일 반려견일 때 (슬라이드 불필요)
  if (!isMultiDog) {
    return (
      <View style={styles.singleCardWrapper}>
        <View style={styles.card}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onPressProfile}
            style={styles.profileRow}
          >
            <View style={styles.avatarWrapper}>
              <DogAvatar photoUri={profile.photoUri} size={48} />
              <View style={styles.onlineBadge} />
            </View>

            <View style={styles.infoContainer}>
              <View style={styles.nameRow}>
                <Text style={styles.dogName}>{profile.name}</Text>
                <View style={styles.readyBadge}>
                  <Text style={styles.readyBadgeText}>준비 완료</Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={onAddDog ?? onPressProfile}
                  style={styles.addBtnSmall}
                >
                  <Text style={styles.addBtnSmallText}>+ 아이 추가</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.subtitleRow}>
                <Text style={styles.subtitle}>오늘 산책 준비됐어요</Text>
                <AppIcon name="sun" size={14} color={TOKENS.colors.primaryDark} />
              </View>
              <Text style={styles.breedText}>
                {profile.breed} · {profile.ageYears}살 · {profile.speedKmH} km/h
              </Text>
            </View>
          </TouchableOpacity>

          <View style={styles.actionRow}>
            <View style={styles.chipsContainer}>
              <View style={styles.chip}>
                <View style={styles.chipContent}>
                  <AppIcon name="clock" size={13} color={TOKENS.colors.primaryDark} />
                  <Text style={styles.chipText}>30분 산책</Text>
                </View>
              </View>
              <View style={styles.chip}>
                <View style={styles.chipContent}>
                  <AppIcon name="soft" size={13} color={TOKENS.colors.primaryDark} />
                  <Text style={styles.chipText}>폭신한 길 우선</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onStartWalk}
              style={styles.startButton}
            >
              <View style={styles.startButtonContent}>
                <Text style={styles.startButtonText}>산책 시작</Text>
                <AppIcon name="chevronRight" size={16} color={TOKENS.colors.textWhite} />
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // 다견(2마리 이상) 슬라이더 캐러셀
  return (
    <View
      style={styles.sliderOuterContainer}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.abs(w - cardWidth) > 2) {
          setCardWidth(w);
        }
      }}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        contentContainerStyle={styles.scrollContent}
        scrollEventThrottle={16}
      >
        {dogList.map((dogItem, idx) => {
          const isSelected = dogItem.id === (selectedDogId ?? profile.id);
          return (
            <View key={dogItem.id} style={[styles.cardSlide, { width: cardWidth }]}>
              <View style={[styles.card, isSelected && styles.cardActiveHighlight]}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={onPressProfile}
                  style={styles.profileRow}
                >
                  <View style={styles.avatarWrapper}>
                    <DogAvatar photoUri={dogItem.photoUri} size={48} />
                    <View style={styles.onlineBadge} />
                  </View>

                  <View style={styles.infoContainer}>
                    <View style={styles.nameRow}>
                      <Text style={styles.dogName}>{dogItem.name}</Text>
                      <View style={styles.readyBadge}>
                        <Text style={styles.readyBadgeText}>준비 완료</Text>
                      </View>
                      <View style={styles.slideNoticeBadge}>
                        <Text style={styles.slideNoticeText}>
                          {idx + 1}/{dogList.length} ⇄
                        </Text>
                      </View>
                    </View>
                    <View style={styles.subtitleRow}>
                      <Text style={styles.subtitle}>오늘 산책 준비됐어요</Text>
                      <AppIcon name="sun" size={14} color={TOKENS.colors.primaryDark} />
                    </View>
                    <Text style={styles.breedText}>
                      {dogItem.breed} · {dogItem.ageYears}살 · {dogItem.speedKmH} km/h
                    </Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.actionRow}>
                  <View style={styles.chipsContainer}>
                    <View style={styles.chip}>
                      <View style={styles.chipContent}>
                        <AppIcon name="clock" size={13} color={TOKENS.colors.primaryDark} />
                        <Text style={styles.chipText}>30분 산책</Text>
                      </View>
                    </View>
                    <View style={styles.chip}>
                      <View style={styles.chipContent}>
                        <AppIcon name="soft" size={13} color={TOKENS.colors.primaryDark} />
                        <Text style={styles.chipText}>폭신한 길 우선</Text>
                      </View>
                    </View>
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={onStartWalk}
                    style={styles.startButton}
                  >
                    <View style={styles.startButtonContent}>
                      <Text style={styles.startButtonText}>산책 시작</Text>
                      <AppIcon name="chevronRight" size={16} color={TOKENS.colors.textWhite} />
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })}

        {/* 마지막 슬라이드: + 새로운 반려견 등록 카드 */}
        <View style={[styles.cardSlide, { width: cardWidth }]}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onAddDog ?? onPressProfile}
            style={[styles.card, styles.addCard]}
          >
            <View style={styles.addCardContent}>
              <View style={styles.addIconCircle}>
                <Text style={styles.addIconText}>＋</Text>
              </View>
              <Text style={styles.addCardTitle}>우리 아이 한 마리 더 등록하기</Text>
              <Text style={styles.addCardSubtitle}>
                새로운 반려견을 추가하고 맞춤 안심 코스를 추천받아보세요
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* 페이지네이션 도트 인디케이터 */}
      <View style={styles.indicatorContainer}>
        {dogList.map((dogItem, idx) => (
          <TouchableOpacity
            key={`dot_${dogItem.id}`}
            activeOpacity={0.7}
            onPress={() => handleDotPress(idx)}
            style={[
              styles.dot,
              activeIndex === idx ? styles.activeDot : styles.inactiveDot,
            ]}
          />
        ))}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => handleDotPress(dogList.length)}
          style={[
            styles.addDot,
            activeIndex === dogList.length ? styles.activeAddDot : styles.inactiveAddDot,
          ]}
        >
          <Text
            style={[
              styles.addDotText,
              activeIndex === dogList.length && styles.addDotTextActive,
            ]}
          >
            +
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  singleCardWrapper: {
    marginBottom: 10,
  },
  sliderOuterContainer: {
    marginBottom: 8,
  },
  scrollContent: {
    alignItems: 'stretch',
  },
  cardSlide: {
    paddingHorizontal: 0,
  },
  card: {
    backgroundColor: TOKENS.colors.surface,
    borderRadius: TOKENS.borderRadius.card,
    padding: 16,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    shadowColor: TOKENS.colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  cardActiveHighlight: {
    borderColor: TOKENS.colors.primaryMint,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 12,
  },
  avatarWrapper: {
    position: 'relative',
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: TOKENS.colors.primary,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  dogName: {
    fontSize: 17,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
  },
  readyBadge: {
    backgroundColor: TOKENS.colors.primarySubtle,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 20,
  },
  readyBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: TOKENS.colors.primary,
  },
  slideNoticeBadge: {
    marginLeft: 'auto',
    backgroundColor: TOKENS.colors.primaryLight,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TOKENS.colors.primaryMint,
  },
  slideNoticeText: {
    fontSize: 11,
    fontWeight: '700',
    color: TOKENS.colors.primaryDark,
  },
  addBtnSmall: {
    marginLeft: 'auto',
    backgroundColor: TOKENS.colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  addBtnSmallText: {
    fontSize: 11,
    fontWeight: '700',
    color: TOKENS.colors.primaryDark,
  },
  subtitle: {
    fontSize: 13,
    color: TOKENS.colors.textMuted,
    lineHeight: 18,
  },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  breedText: {
    fontSize: 11,
    color: TOKENS.colors.textMuted,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    gap: 8,
  },
  chipsContainer: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
  },
  chip: {
    backgroundColor: TOKENS.colors.primaryLight,
    borderWidth: 1,
    borderColor: TOKENS.colors.primaryMint,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
    color: TOKENS.colors.primaryDark,
  },
  chipContent: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  startButton: {
    backgroundColor: TOKENS.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 14,
    shadowColor: TOKENS.colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 3,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  startButtonContent: { flexDirection: 'row', alignItems: 'center', gap: 2 },

  // + 추가 카드 스타일
  addCard: {
    borderStyle: 'dashed',
    borderWidth: 1.5,
    borderColor: TOKENS.colors.primary,
    backgroundColor: TOKENS.colors.primaryLight,
    minHeight: 124,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addCardContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  addIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: TOKENS.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  addIconText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 22,
  },
  addCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: TOKENS.colors.textMain,
    marginBottom: 3,
  },
  addCardSubtitle: {
    fontSize: 11,
    color: TOKENS.colors.textMuted,
    textAlign: 'center',
  },

  // 인디케이터 스타일
  indicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 6,
  },
  dot: {
    height: 5,
    borderRadius: 3,
  },
  activeDot: {
    width: 18,
    backgroundColor: TOKENS.colors.primary,
  },
  inactiveDot: {
    width: 6,
    backgroundColor: TOKENS.colors.border,
  },
  addDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  activeAddDot: {
    borderColor: TOKENS.colors.primary,
    backgroundColor: TOKENS.colors.primary,
  },
  inactiveAddDot: {
    borderColor: TOKENS.colors.border,
    backgroundColor: 'transparent',
  },
  addDotText: {
    fontSize: 10,
    fontWeight: '700',
    color: TOKENS.colors.textMuted,
    lineHeight: 12,
  },
  addDotTextActive: {
    color: '#FFFFFF',
  },
});

