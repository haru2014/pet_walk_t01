/**
 * [편안하개 - PetWalk]
 * 자연어 및 음성 발화 산책 조건 입력 섹션 컴포넌트 (US-A1, 영역 1 & 2)
 *
 * - expo-audio 녹음과 Gemini Transcribe 음성 텍스트 변환
 * - 산책 조건 해석과 화면 반영은 프론트엔드 규칙 엔진에서 처리
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Platform,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { TOKENS } from '../../theme/tokens';
import { AppIcon } from '../common/AppIcon';
import { TTSNavigationService } from '../../services/ttsNavigation';
import {
  extractLocalVoiceIntent,
  transcribeVoiceCommand,
  VoiceIntentResult,
} from '../../services/voiceIntentApi';

export interface WalkVoiceInputSectionProps {
  dogName: string;
  requestText: string;
  onChangeText: (text: string) => void;
  onIntentParsed?: (result: VoiceIntentResult) => void;
  coords?: { lat: number; lon: number } | null;
  onFindRouteDirectly?: () => void;
  /** 부모 컴포넌트(예: WalkSettingsView)에서 자체 피드백 카드를 렌더링할 때 중복 출력을 방지하는 옵션 */
  hideResultBadge?: boolean;
}

export const WalkVoiceInputSection: React.FC<WalkVoiceInputSectionProps> = ({
  dogName,
  requestText,
  onChangeText,
  onIntentParsed,
  onFindRouteDirectly,
  hideResultBadge = false,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<VoiceIntentResult | null>(null);
  const [recordingError, setRecordingError] = useState('');
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const listeningRef = useRef(false);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_RECORDING_SECONDS = 15;

  useEffect(() => {
    return () => {
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
      if (listeningRef.current) {
        listeningRef.current = false;
        void recorder.stop().catch(() => undefined);
      }
    };
  }, [recorder]);

  const applyTextIntent = (textToAnalyze: string) => {
    if (!textToAnalyze.trim()) return;
    const result = extractLocalVoiceIntent(textToAnalyze, dogName);
    setAnalysisResult(result);
    onIntentParsed?.(result);
    if (result.intent.briefing_message) TTSNavigationService.speak(result.intent.briefing_message);
  };

  const stopAndTranscribe = async () => {
    if (!listeningRef.current) return;
    listeningRef.current = false;
    setIsListening(false);
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }

    try {
      setIsAnalyzing(true);
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const uri = recorder.uri;
      if (!uri) throw new Error('녹음 파일을 찾지 못했어요. 다시 말씀해 주세요.');

      const isWebRecording = Platform.OS === 'web';
      const mimeType = isWebRecording ? 'audio/webm' : 'audio/m4a';
      const recordingBlob = isWebRecording
        ? await (await fetch(uri)).blob()
        : await (async () => {
            const { File } = await import('expo-file-system');
            return new File(uri);
          })();
      const transcript = await transcribeVoiceCommand(
        recordingBlob,
        isWebRecording ? 'walk-command.webm' : 'walk-command.m4a',
        mimeType,
        dogName
      );
      onChangeText(transcript);

      // Gemini is used only to recognize the spoken words. Command parsing stays in the app.
      const localResult = extractLocalVoiceIntent(transcript, dogName);
      const result: VoiceIntentResult = {
        ...localResult,
        model_used: 'gemini-3.5-transcribe',
        data_source: 'gemini_transcription',
      };
      setAnalysisResult(result);
      onIntentParsed?.(result);
      if (result.intent.briefing_message) TTSNavigationService.speak(result.intent.briefing_message);
    } catch (error) {
      setRecordingError(error instanceof Error ? error.message : '음성 인식에 실패했어요. 다시 말씀해 주세요.');
    } finally {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
      setIsAnalyzing(false);
    }
  };

  const startListening = async () => {
    setRecordingError('');
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        throw new Error('음성 명령을 사용하려면 마이크 권한을 허용해 주세요.');
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      listeningRef.current = true;
      setIsListening(true);
      recordingTimeoutRef.current = setTimeout(() => {
        void stopAndTranscribe();
      }, MAX_RECORDING_SECONDS * 1000);
    } catch (error) {
      listeningRef.current = false;
      setIsListening(false);
      setRecordingError(error instanceof Error ? error.message : '마이크를 시작하지 못했어요.');
    }
  };

  const handleToggleVoiceInput = () => {
    if (isListening) {
      void stopAndTranscribe();
      return;
    }
    void startListening();
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>직접 말해도 좋아요</Text>
        {isAnalyzing && (
          <View style={styles.analyzingPill}>
            <ActivityIndicator size="small" color="#4F46E5" />
            <Text style={styles.analyzingText}>Gemini 음성 인식 중...</Text>
          </View>
        )}
      </View>

      <View style={styles.textInputBox}>
        <TextInput
          value={requestText}
          onChangeText={onChangeText}
          onSubmitEditing={() => applyTextIntent(requestText)}
          multiline
          placeholder={`예) ${dogName}랑 25분만 그늘진 흙길로 유림공원 한 바퀴 돌고 싶어.`}
          placeholderTextColor="#9CA3AF"
          style={styles.textArea}
        />
        <View style={styles.controlsRow}>
          {requestText.trim().length > 0 && !isAnalyzing && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => applyTextIntent(requestText)}
              style={styles.analyzeBtn}
            >
              <AppIcon name="sparkle" size={13} color="#4F46E5" />
              <Text style={styles.analyzeBtnText}>조건 적용</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleToggleVoiceInput}
            accessibilityRole="button"
            accessibilityLabel={isListening ? '음성 녹음 마치기' : '음성으로 산책 조건 말하기'}
            disabled={isAnalyzing}
            style={[styles.micButton, isListening && styles.micButtonActive]}
          >
            <AppIcon
              name="mic"
              size={18}
              color={isListening ? TOKENS.colors.textWhite : TOKENS.colors.textMuted}
            />
          </TouchableOpacity>
        </View>
      </View>

      {isListening && (
        <View style={styles.listeningNoticeBox}>
          <View style={styles.pulsingDot} />
          <Text style={styles.listeningNotice}>말씀해주세요. 누르면 녹음이 끝나요. (최대 15초)</Text>
        </View>
      )}
      {!!recordingError && <Text accessibilityRole="alert" style={styles.recordingError}>{recordingError}</Text>}

      {/* 음성 인식 및 앱 명령 분석 결과 (부모 컴포넌트에서 자체 피드백 카드를 표시하지 않을 때만 렌더링) */}
      {analysisResult && !isAnalyzing && !hideResultBadge && (
        <View style={styles.analysisBadge}>
          <View style={styles.badgeTop}>
            <AppIcon name="sparkle" size={14} color="#4F46E5" />
            <Text style={styles.badgeTitle}>
              {analysisResult.data_source === 'gemini_transcription'
                ? 'Gemini 음성 인식 · 앱 명령 분석'
                : analysisResult.data_source === 'local_fallback' ? '로컬 규칙 분석' : 'Gemini AI'} 맞춤 코스 설정 완료 ({analysisResult.intent.target_duration_minutes}분 · {analysisResult.intent.prefer_shade ? '그늘길 · ' : ''}{analysisResult.intent.prefer_cushion ? '흙길 · ' : ''}{analysisResult.intent.avoid_stairs ? '계단피하기 · ' : ''}{analysisResult.intent.destination_landmark ?? '자유루프'})
            </Text>
          </View>
          {analysisResult.intent.briefing_message && (
            <Text style={styles.briefingText}>
              {analysisResult.intent.briefing_message}
            </Text>
          )}
          {onFindRouteDirectly && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={onFindRouteDirectly}
              style={styles.directFindBtn}
            >
              <AppIcon name="sparkle" size={13} color="#FFFFFF" />
              <Text style={styles.directFindBtnText}>✨ 이 AI 맞춤 조건으로 산책로 바로 찾기</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: 12 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: TOKENS.colors.textMain },
  analyzingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  analyzingText: { fontSize: 11, color: '#4F46E5', fontWeight: '600' },
  textInputBox: {
    backgroundColor: TOKENS.colors.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: TOKENS.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 74,
    justifyContent: 'space-between',
  },
  textArea: {
    fontSize: 13,
    color: TOKENS.colors.textMain,
    lineHeight: 18,
    minHeight: 38,
    textAlignVertical: 'top',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  analyzeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  analyzeBtnText: {
    fontSize: 11,
    color: '#4F46E5',
    fontWeight: '700',
  },
  micButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: TOKENS.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonActive: {
    backgroundColor: TOKENS.colors.primaryDark,
  },
  listeningNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  recordingError: {
    color: '#B42318',
    fontSize: 12,
    marginTop: 6,
  },
  pulsingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  listeningNotice: {
    fontSize: 11.5,
    color: '#DC2626',
    fontWeight: '600',
  },
  analysisBadge: {
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
    gap: 4,
  },
  badgeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  briefingText: {
    fontSize: 11.5,
    color: '#5B21B6',
    lineHeight: 16,
  },
  directFindBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#4F46E5',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  directFindBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
