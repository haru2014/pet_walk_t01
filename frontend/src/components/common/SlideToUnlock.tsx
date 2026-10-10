/**
 * [편안하개 - PetWalk]
 * 오터치 방지 '밀어서 잠금 해제' 슬라이더 (US-C2, Phase 4)
 *
 * 주머니 속 접촉으로 인한 오작동을 막기 위해 트랙 끝까지 밀어야만 해제된다.
 */

import React, { useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';
import { TOKENS } from '../../theme/tokens';

const HANDLE_SIZE = 56;
const UNLOCK_RATIO = 0.85;

export interface SlideToUnlockProps {
  readonly label?: string;
  readonly onUnlock: () => void;
}

export const SlideToUnlock: React.FC<SlideToUnlockProps> = ({
  label = '밀어서 잠금 해제',
  onUnlock,
}) => {
  const [trackWidth, setTrackWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const maxTravel = Math.max(trackWidth - HANDLE_SIZE - 8, 0);
  const maxTravelRef = useRef(maxTravel);
  maxTravelRef.current = maxTravel;
  const onUnlockRef = useRef(onUnlock);
  onUnlockRef.current = onUnlock;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gesture) => {
        translateX.setValue(Math.max(0, Math.min(gesture.dx, maxTravelRef.current)));
      },
      onPanResponderRelease: (_, gesture) => {
        const unlocked = maxTravelRef.current > 0 && gesture.dx >= maxTravelRef.current * UNLOCK_RATIO;
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        if (unlocked) onUnlockRef.current();
      },
    }),
  ).current;

  return (
    <View style={styles.track} onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}>
      <Text style={styles.label}>{label}  ›››</Text>
      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.handle, { transform: [{ translateX }] }]}
      >
        <Text style={styles.handleIcon}>🐾</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    height: HANDLE_SIZE + 8,
    borderRadius: (HANDLE_SIZE + 8) / 2,
    borderWidth: 1,
    borderColor: TOKENS.colors.pocketHud,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  label: {
    position: 'absolute',
    alignSelf: 'center',
    color: TOKENS.colors.pocketHudSubtle,
    fontSize: 14,
    fontWeight: '600',
  },
  handle: {
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_SIZE / 2,
    backgroundColor: TOKENS.colors.pocketHud,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleIcon: {
    fontSize: 24,
  },
});
