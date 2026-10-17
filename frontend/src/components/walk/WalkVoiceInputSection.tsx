/**
 * [편안하개 - PetWalk]
 * 자연어 및 음성 발화 산책 조건 입력 섹션 컴포넌트 (US-A1, 영역 1 & 2)
 *
 * docs/implementation_plan/gemini_api_적용_계획.md:
 * - 웹 표준 Web Speech API (SpeechRecognition / webkitSpeechRecognition) 실시간 한국어 음성 인식
 * - 음성 텍스트 획득 즉시 Gemini API (POST /api/v1/voice/intent) 구조화 의도 분석
 * - STT 미지원 환경 시 원터치 음성 예시 시나리오 모달 제공
 * - 분석 결과(시간, 그늘, 흙길, 계단, 거점 랜드마크) 시각 뱃지 피드백 및 상위 폼 자동 반영
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { TOKENS } from '../../theme/tokens';
import { AppIcon } from '../common/AppIcon';
import { TTSNavigationService } from '../../services/ttsNavigation';
import {
  analyzeVoiceIntent,
  VoiceIntentResult,
} from '../../services/voiceIntentApi';

export interface WalkVoiceInputSectionProps {
  dogName: string;
  requestText: string;
  onChangeText: (text: string) => void;
  onIntentParsed?: (result: VoiceIntentResult) => void;
  coords?: { lat: number; lon: number } | null;
}

export const WalkVoiceInputSection: React.FC<WalkVoiceInputSectionProps> = ({
  dogName,
  requestText,
  onChangeText,
  onIntentParsed,
  coords,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<VoiceIntentResult | null>(null);
  const [showScenarioModal, setShowScenarioModal] = useState(false);

  const recognitionRef = useRef<any>(null);

  // 음성 인식 Web Speech API 브라우저/웹뷰 가용 여부 확인
  const isSpeechSupported =
    typeof window !== 'undefined' &&
    (('SpeechRecognition' in window) || ('webkitSpeechRecognition' in window));

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const runAnalysis = async (textToAnalyze: string) => {
    if (!textToAnalyze.trim()) return;
    setIsAnalyzing(true);
    try {
      const result = await analyzeVoiceIntent(textToAnalyze, dogName, coords);
      setAnalysisResult(result);
      onIntentParsed?.(result);
      if (result.intent.briefing_message) {
        TTSNavigationService.speak(result.intent.briefing_message);
      }
    } catch (err) {
      console.warn('[WalkVoiceInputSection] Gemini 분석 오류:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const startBrowserListening = () => {
    try {
      const SpeechRecognitionClass =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognitionClass();
      recognition.lang = 'ko-KR';
      recognition.interimResults = true;
      recognition.continuous = false;

      recognition.onstart = () => {
        setIsListening(true);
        TTSNavigationService.speak('원하시는 산책 조건을 말씀해주세요.');
      };

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((res: any) => res[0]?.transcript)
          .join('');
        if (transcript) {
          onChangeText(transcript);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        // 음성 입력 종료 시 즉시 Gemini AI 의도 분석 가동
        if (requestText.trim()) {
          void runAnalysis(requestText);
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
        setShowScenarioModal(true);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
      setShowScenarioModal(true);
    }
  };

  const handleToggleVoiceInput = () => {
    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      setIsListening(false);
      return;
    }

    if (isSpeechSupported) {
      startBrowserListening();
    } else {
      // Web Speech 미지원 환경 시 친절한 대화형 음성 시나리오 모달 표시
      setShowScenarioModal(true);
    }
  };

  const handleSelectScenario = (scenarioText: string) => {
    setShowScenarioModal(false);
    onChangeText(scenarioText);
    void runAnalysis(scenarioText);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>직접 말해도 좋아요</Text>
        {isAnalyzing && (
          <View style={styles.analyzingPill}>
            <ActivityIndicator size="small" color="#4F46E5" />
            <Text style={styles.analyzingText}>Gemini AI 의도 분석 중...</Text>
          </View>
        )}
      </View>

      <View style={styles.textInputBox}>
        <TextInput
          value={requestText}
          onChangeText={onChangeText}
          onSubmitEditing={() => runAnalysis(requestText)}
          multiline
          placeholder={`예) ${dogName}랑 25분만 그늘진 흙길로 유림공원 한 바퀴 돌고 싶어.`}
          placeholderTextColor="#9CA3AF"
          style={styles.textArea}
        />
        <View style={styles.controlsRow}>
          {requestText.trim().length > 0 && !isAnalyzing && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => runAnalysis(requestText)}
              style={styles.analyzeBtn}
            >
              <AppIcon name="sparkle" size={13} color="#4F46E5" />
              <Text style={styles.analyzeBtnText}>AI 분석</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleToggleVoiceInput}
            accessibilityRole="button"
            accessibilityLabel="음성으로 산책 조건 말하기"
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
          <Text style={styles.listeningNotice}>말씀해주세요. 듣고 있어요...</Text>
        </View>
      )}

      {/* Gemini AI 분석 결과 피드백 뱃지 */}
      {analysisResult && !isAnalyzing && (
        <View style={styles.analysisBadge}>
          <View style={styles.badgeTop}>
            <AppIcon name="sparkle" size={14} color="#4F46E5" />
            <Text style={styles.badgeTitle}>
              Gemini AI 맞춤 코스 설정 완료 ({analysisResult.intent.target_duration_minutes}분 · {analysisResult.intent.prefer_shade ? '그늘길 · ' : ''}{analysisResult.intent.prefer_cushion ? '흙길 · ' : ''}{analysisResult.intent.destination_landmark ?? '자유루프'})
            </Text>
          </View>
          {analysisResult.intent.briefing_message && (
            <Text style={styles.briefingText}>
              {analysisResult.intent.briefing_message}
            </Text>
          )}
        </View>
      )}

      {/* 음성 발화 빠른 예시 모달 */}
      <Modal
        visible={showScenarioModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowScenarioModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <AppIcon name="mic" size={20} color="#4F46E5" />
                <Text style={styles.modalTitle}>원하는 산책을 말씀해주세요</Text>
              </View>
              <TouchableOpacity onPress={() => setShowScenarioModal(false)}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>
              터치하거나 직접 입력하시면 Gemini가 최적의 조건을 자동 설정합니다.
            </Text>

            <View style={styles.scenarioList}>
              {[
                `날씨가 더우니까 ${dogName}랑 25분만 그늘진 흙길로 유림공원 한 바퀴 돌고 싶어`,
                `30분 동안 계단 없이 시원하고 폭신한 잔디길로 천천히 걸을래`,
                `세종호수공원에서 40분 동안 완만한 길로 신나게 산책하자`,
                `보라매공원 30분 관절에 무리 없는 그늘길 코스 찾아줘`,
              ].map((item, idx) => (
                <TouchableOpacity
                  key={`scenario-${idx}`}
                  activeOpacity={0.7}
                  onPress={() => handleSelectScenario(item)}
                  style={styles.scenarioChip}
                >
                  <AppIcon name="sparkle" size={12} color="#6366F1" />
                  <Text style={styles.scenarioChipText}>{item}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
  },
  closeBtn: {
    fontSize: 18,
    color: '#94A3B8',
    padding: 4,
  },
  modalSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 6,
    marginBottom: 14,
    lineHeight: 17,
  },
  scenarioList: {
    gap: 8,
  },
  scenarioChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  scenarioChipText: {
    flex: 1,
    fontSize: 12.5,
    color: '#334155',
    lineHeight: 18,
  },
});
