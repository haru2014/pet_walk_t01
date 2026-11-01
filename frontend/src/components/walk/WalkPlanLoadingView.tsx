import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppText as Text } from '../common/AppText';
import { AppScreenHeader } from '../common/AppScreenHeader';
import { MapLibreMapView } from '../map/MapLibreMapView';
import { LonLat, RouteFeatureCollection, RouteStepPin } from '../../types/route';
import { useAppTheme } from '../../theme/themeManager';
import { TOKENS, TYPOGRAPHY } from '../../theme/tokens';
import dogCharacter from '../../../assets/ui_n2/dog_character.png';

const EMPTY_ROUTE: RouteFeatureCollection = { type: 'FeatureCollection', features: [] };
const EMPTY_STEP_PINS: readonly RouteStepPin[] = [];

export const WALK_PLAN_PAW_STEPS = [
  { left: '20%', top: '74%', rotation: '-24deg', delayMs: 0 },
  { left: '38%', top: '65%', rotation: '18deg', delayMs: 260 },
  { left: '30%', top: '56%', rotation: '-20deg', delayMs: 520 },
  { left: '48%', top: '47%', rotation: '20deg', delayMs: 780 },
  { left: '40%', top: '38%', rotation: '-18deg', delayMs: 1040 },
  { left: '58%', top: '29%', rotation: '22deg', delayMs: 1300 },
] as const;

export interface WalkPlanLoadingViewProps {
  readonly parkName: string;
  readonly mapCenter: LonLat;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly onBack: () => void;
  readonly onRetry: () => void;
}

export const WalkPlanLoadingView: React.FC<WalkPlanLoadingViewProps> = ({
  parkName,
  mapCenter,
  isLoading,
  error,
  onBack,
  onRetry,
}) => {
  const { colors } = useAppTheme();
  const opacityValues = useRef(WALK_PLAN_PAW_STEPS.map(() => new Animated.Value(0))).current;
  const scaleValues = useRef(WALK_PLAN_PAW_STEPS.map(() => new Animated.Value(0.35))).current;
  const dogBreath = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    dogBreath.setValue(0);
    if (!isLoading || reduceMotion) return undefined;
    const breathing = Animated.loop(Animated.sequence([
      Animated.timing(dogBreath, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(dogBreath, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    breathing.start();
    return () => breathing.stop();
  }, [isLoading, reduceMotion, dogBreath]);

  useEffect(() => {
    opacityValues.forEach((value) => value.setValue(0));
    scaleValues.forEach((value) => value.setValue(0.35));
    if (!isLoading || reduceMotion) return undefined;

    const revealSteps = WALK_PLAN_PAW_STEPS.map((step, index) => Animated.sequence([
      Animated.delay(step.delayMs),
      Animated.parallel([
        Animated.timing(opacityValues[index], {
          toValue: 0.82,
          duration: 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(scaleValues[index], {
          toValue: 1,
          speed: 18,
          bounciness: 5,
          useNativeDriver: true,
        }),
      ]),
    ]));
    const fadeSteps = Animated.parallel(opacityValues.map((opacity, index) => Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 280, delay: index * 35, useNativeDriver: true }),
      Animated.timing(scaleValues[index], { toValue: 0.35, duration: 280, delay: index * 35, useNativeDriver: true }),
    ])));
    const loop = Animated.loop(Animated.sequence([
      Animated.parallel(revealSteps),
      Animated.delay(500),
      fadeSteps,
      Animated.delay(180),
    ]));
    loop.start();
    return () => loop.stop();
  }, [isLoading, reduceMotion, opacityValues, scaleValues]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppScreenHeader title="산책 경로 찾기" onBack={onBack} />
      <View style={styles.content}>
        <View style={styles.introRow}>
          <Animated.View style={[styles.dogWrap, {
            transform: [{ scale: dogBreath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] }) }],
          }]}>
            <Image source={dogCharacter} style={styles.dogImage} resizeMode="contain" accessibilityLabel="산책 경로를 찾는 강아지" />
          </Animated.View>
          <View style={[styles.speechBubble, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.speechText, { color: colors.textMain }]}>
              {error ? '앗! 경로를 불러오지 못했어요. 다시 시도해 주세요.' : '멍멍! 산책하기 좋은 길을 찾고 있어요! 🐾'}
            </Text>
            <View style={[styles.bubbleTail, { borderTopColor: colors.surface }]} />
          </View>
        </View>

        <View style={[styles.mapCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MapLibreMapView
            route={EMPTY_ROUTE}
            stepPins={EMPTY_STEP_PINS}
            width="100%"
            height="100%"
            initialCenter={mapCenter}
          />
          <View pointerEvents="none" style={styles.pawOverlay} accessibilityLabel="장식용 발자국 애니메이션">
            {isLoading && !reduceMotion ? WALK_PLAN_PAW_STEPS.map((step, index) => (
              <Animated.View
                key={index}
                accessibilityLabel={`발자국 ${index + 1}`}
                style={[
                  styles.paw,
                  {
                    left: step.left,
                    top: step.top,
                    opacity: opacityValues[index],
                    transform: [{ rotate: step.rotation }, { scale: scaleValues[index] }],
                  },
                ]}
              >
                <Text style={[styles.pawGlyph, { color: colors.primary }]}>🐾</Text>
              </Animated.View>
            )) : null}
          </View>
          <View pointerEvents="none" style={[styles.mapLabel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.mapLabelText, { color: colors.textMuted }]}>{parkName} 주변 · 경로 확정 전</Text>
          </View>
          {isLoading && (
            <View pointerEvents="none" style={[styles.pawNote, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.mapLabelText, { color: colors.textMuted }]}>발자국은 장식용 로딩 애니메이션이에요</Text>
            </View>
          )}
        </View>

        <View style={styles.statusBlock}>
          <View style={styles.statusTitleRow}>
            {isLoading ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={styles.statusIcon}>🐾</Text>}
            <Text accessibilityRole="header" style={[styles.statusTitle, { color: colors.textMain }]}>
              {error ? '경로를 불러오지 못했어요' : '산책하기 좋은 길을 찾고 있어요'}
            </Text>
          </View>
          <Text accessibilityRole={error ? 'alert' : undefined} style={[styles.statusDetail, { color: error ? colors.error : colors.textMuted }]}>
            {error ?? `${parkName} 산책 경로를 요청하고 있어요.`}
          </Text>
        </View>

        {error ? (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={onRetry}
            style={[styles.actionButton, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.actionText, { color: colors.textWhite }]}>다시 시도하기</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.loadingPill, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.loadingPaw, { color: colors.primary }]}>🐾</Text>
            <Text style={[styles.loadingText, { color: colors.primaryDark }]}>경로를 준비하고 있어요</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 14, gap: 12, justifyContent: 'center' },
  introRow: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dogWrap: { width: 94, height: 84, alignItems: 'center', justifyContent: 'center' },
  dogImage: { width: 94, height: 84 },
  speechBubble: { flex: 1, minHeight: 68, borderWidth: 1, borderRadius: TOKENS.borderRadius.card, paddingHorizontal: 14, paddingVertical: 12, justifyContent: 'center' },
  speechText: { fontSize: TYPOGRAPHY.body, lineHeight: 23, fontWeight: '700' },
  bubbleTail: { position: 'absolute', left: -7, bottom: 16, width: 0, height: 0, borderTopWidth: 8, borderTopColor: '#fff', borderBottomWidth: 8, borderBottomColor: 'transparent', borderRightWidth: 9, borderRightColor: 'transparent' },
  mapCard: { height: '42%', minHeight: 190, maxHeight: 360, borderWidth: 1, borderRadius: TOKENS.borderRadius.card, overflow: 'hidden', position: 'relative' },
  pawOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  paw: { position: 'absolute', width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  pawGlyph: { fontSize: 23 },
  mapLabel: { position: 'absolute', top: 10, left: 10, borderWidth: 1, borderRadius: TOKENS.borderRadius.badge, paddingHorizontal: 10, paddingVertical: 5 },
  mapLabelText: { fontSize: TYPOGRAPHY.caption, fontWeight: '600' },
  pawNote: { position: 'absolute', bottom: 10, left: 10, borderWidth: 1, borderRadius: TOKENS.borderRadius.badge, paddingHorizontal: 9, paddingVertical: 5 },
  statusBlock: { alignItems: 'center', gap: 5, paddingTop: 2 },
  statusTitleRow: { minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  statusIcon: { fontSize: 19 },
  statusTitle: { fontSize: TYPOGRAPHY.sectionTitle, fontWeight: '800', textAlign: 'center' },
  statusDetail: { fontSize: TYPOGRAPHY.support, lineHeight: 20, textAlign: 'center' },
  loadingPill: { minHeight: 46, alignSelf: 'stretch', borderRadius: TOKENS.borderRadius.badge, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  loadingPaw: { fontSize: 20 },
  loadingText: { fontSize: TYPOGRAPHY.button, fontWeight: '700' },
  actionButton: { minHeight: 48, alignSelf: 'stretch', borderRadius: TOKENS.borderRadius.button, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: TYPOGRAPHY.button, fontWeight: '700' },
});
