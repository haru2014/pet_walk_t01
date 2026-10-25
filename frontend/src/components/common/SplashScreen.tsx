import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Ellipse, Path } from 'react-native-svg';

export const SPLASH_BACKGROUND_COLOR = '#536A55';
export const SPLASH_FOREGROUND_COLOR = '#FAF6E9';
export const SPLASH_STEP_INTERVAL_MS = 320;
const SAGE = SPLASH_BACKGROUND_COLOR;
const CREAM = SPLASH_FOREGROUND_COLOR;
const STEP_POSITIONS = [
  { x: 38, y: 68, rotate: -12 },
  { x: 56, y: 56, rotate: 10 },
  { x: 42, y: 44, rotate: -8 },
] as const;

interface SplashScreenProps {
  onAnimationComplete: () => void;
  initializationError?: string | null;
  onRetry?: () => void;
}

const PawMark: React.FC<{ size: number }> = ({ size }) => (
  <Svg width={size} height={size} viewBox="0 0 100 100">
    <Ellipse cx="23" cy="45" rx="10" ry="15" transform="rotate(-18 23 45)" fill={CREAM} />
    <Ellipse cx="41" cy="28" rx="10.5" ry="17" transform="rotate(-6 41 28)" fill={CREAM} />
    <Ellipse cx="61" cy="28" rx="10.5" ry="17" transform="rotate(6 61 28)" fill={CREAM} />
    <Ellipse cx="79" cy="45" rx="10" ry="15" transform="rotate(18 79 45)" fill={CREAM} />
    <Path
      d="M 50 48 C 35 48, 20 60, 24 75 C 27 86, 38 90, 50 84 C 62 90, 73 86, 76 75 C 80 60, 65 48, 50 48 Z"
      fill={CREAM}
    />
  </Svg>
);

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onAnimationComplete,
  initializationError,
  onRetry,
}) => {
  const stepOpacity = useRef(STEP_POSITIONS.map(() => new Animated.Value(0))).current;
  const stepScale = useRef(STEP_POSITIONS.map(() => new Animated.Value(0.3))).current;
  const stepLift = useRef(STEP_POSITIONS.map(() => new Animated.Value(20))).current;
  const rippleOpacity = useRef(STEP_POSITIONS.map(() => new Animated.Value(0))).current;
  const rippleScale = useRef(STEP_POSITIONS.map(() => new Animated.Value(0.5))).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.4)).current;
  const brandingOpacity = useRef(new Animated.Value(0)).current;
  const brandingLift = useRef(new Animated.Value(15)).current;
  const completionCallback = useRef(onAnimationComplete);
  const hasCompleted = useRef(false);

  useEffect(() => {
    completionCallback.current = onAnimationComplete;
  }, [onAnimationComplete]);

  useEffect(() => {
    let isMounted = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const animations: Animated.CompositeAnimation[] = [];

    STEP_POSITIONS.forEach((_, index) => {
      timers.push(setTimeout(() => {
        if (!isMounted) return;
        const stepAnimation = Animated.parallel([
          Animated.timing(stepOpacity[index], {
            toValue: 0.7,
            duration: 300,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.spring(stepScale[index], {
            toValue: 0.8,
            speed: 18,
            bounciness: 10,
            useNativeDriver: true,
          }),
          Animated.timing(stepLift[index], {
            toValue: 0,
            duration: 400,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.parallel([
            Animated.timing(rippleOpacity[index], {
              toValue: 0,
              duration: 600,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(rippleScale[index], {
              toValue: 1.6,
              duration: 600,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        ]);
        animations.push(stepAnimation);
        rippleOpacity[index].setValue(0.6);
        rippleScale[index].setValue(0.5);
        stepAnimation.start();
      }, index * SPLASH_STEP_INTERVAL_MS));
    });

    timers.push(setTimeout(() => {
      if (!isMounted) return;
      const fadeStepsAnimation = Animated.parallel(stepOpacity.map((opacity, index) =>
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 500,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(stepScale[index], {
            toValue: 0.6,
            duration: 500,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(stepLift[index], {
            toValue: -10,
            duration: 500,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      ));
      animations.push(fadeStepsAnimation);
      fadeStepsAnimation.start();

      const logoAnimation = Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          speed: 12,
          bounciness: 8,
          useNativeDriver: true,
        }),
      ]);
      const brandingAnimation = Animated.sequence([
        Animated.delay(200),
        Animated.parallel([
          Animated.timing(brandingOpacity, {
            toValue: 1,
            duration: 600,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(brandingLift, {
            toValue: 0,
            duration: 600,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]);
      const revealAnimation = Animated.parallel([logoAnimation, brandingAnimation]);
      animations.push(revealAnimation);
      revealAnimation.start(({ finished }) => {
        if (!finished || !isMounted || hasCompleted.current) return;
        hasCompleted.current = true;
        completionCallback.current();
      });
    }, STEP_POSITIONS.length * SPLASH_STEP_INTERVAL_MS + 150));

    return () => {
      isMounted = false;
      timers.forEach(clearTimeout);
      animations.forEach((animation) => animation.stop());
    };
  }, [
    brandingLift,
    brandingOpacity,
    logoOpacity,
    logoScale,
    rippleOpacity,
    rippleScale,
    stepLift,
    stepOpacity,
    stepScale,
  ]);

  return (
    <View style={styles.container} accessibilityLabel="편안하개 시작 화면">
      <StatusBar barStyle="light-content" backgroundColor={SAGE} />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {STEP_POSITIONS.map((position, index) => (
          <React.Fragment key={`${position.x}-${position.y}`}>
            <Animated.View
              style={[
                styles.ripple,
                {
                  left: `${position.x}%`,
                  top: `${position.y}%`,
                  opacity: rippleOpacity[index],
                  transform: [{ scale: rippleScale[index] }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.step,
                {
                  left: `${position.x}%`,
                  top: `${position.y}%`,
                  opacity: stepOpacity[index],
                  transform: [
                    { translateY: stepLift[index] },
                    { scale: stepScale[index] },
                    { rotate: `${position.rotate}deg` },
                  ],
                },
              ]}
            >
              <PawMark size={48} />
            </Animated.View>
          </React.Fragment>
        ))}
      </View>

      <View style={styles.brandGroup}>
        <Animated.View
          style={[
            styles.mainPaw,
            { opacity: logoOpacity, transform: [{ scale: logoScale }] },
          ]}
        >
          <PawMark size={144} />
        </Animated.View>
        <Animated.View
          style={[
            styles.branding,
            { opacity: brandingOpacity, transform: [{ translateY: brandingLift }] },
          ]}
        >
          <Text style={styles.title}>편안하개</Text>
          <Text style={styles.tagline}>반려견 맞춤 완만길 산책</Text>
        </Animated.View>
      </View>

      {initializationError && (
        <View style={styles.errorPanel} accessibilityRole="alert">
          <Text style={styles.errorText}>{initializationError}</Text>
          {onRetry && (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={onRetry}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>다시 시도</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    minHeight: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: SAGE,
  },
  brandGroup: { alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  mainPaw: {
    marginBottom: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  branding: { alignItems: 'center' },
  title: {
    color: CREAM,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  tagline: {
    color: 'rgba(250, 246, 233, 0.78)',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 1,
    textAlign: 'center',
  },
  step: { position: 'absolute', marginLeft: -24, marginTop: -24 },
  ripple: {
    position: 'absolute',
    width: 48,
    height: 48,
    marginLeft: -24,
    marginTop: -12,
    borderWidth: 2,
    borderColor: CREAM,
    borderRadius: 24,
  },
  errorPanel: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 36,
    alignItems: 'center',
  },
  errorText: {
    color: CREAM,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 12,
  },
  retryButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(250, 246, 233, 0.5)',
    backgroundColor: 'rgba(250, 246, 233, 0.15)',
  },
  retryText: { color: CREAM, fontSize: 13, fontWeight: '600' },
});
