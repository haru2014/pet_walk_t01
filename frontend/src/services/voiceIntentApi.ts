/**
 * [편안하개 - PetWalk]
 * Gemini API 기반 음성 의도 분석 서비스 (voiceIntentApi.ts)
 *
 * docs/implementation_plan/gemini_api_적용_계획.md 준수:
 * - [영역 1] 음성 발화 텍스트 -> Gemini Structured Output 분석 (POST /api/v1/voice/intent)
 * - [영역 2] 랜드마크(유림공원 등) 및 노면/시간 제약조건 추출 및 경로 생성 오케스트레이션 연계
 * - 오프라인 안전망: 서버 요청 실패·타임아웃 후 extractLocalVoiceIntent로 폴백
 */

import { fetchWithServerFallback } from './apiClient';
import { extractVoiceLandmark, normalizeToFrontendParkId, unsupportedParkMessage } from './voiceIntentLandmarks';
import { sanitizeVoiceBriefing } from './voiceBriefing';
export { normalizeToFrontendParkId } from './voiceIntentLandmarks';

export interface VoiceWalkIntent {
  target_duration_minutes: number;
  prefer_shade: boolean;
  prefer_cushion: boolean;
  avoid_stairs: boolean;
  joint_care_level: number;
  destination_landmark?: string | null;
  max_surface_temp_limit: number;
  briefing_message?: string | null;
}

export interface VoiceIntentResult {
  status: 'success' | 'fallback';
  intent: VoiceWalkIntent;
  landmark_park_id?: string | null;
  model_used: string;
  data_source: 'gemini_live' | 'local_fallback' | 'gemini_transcription';
}

/** Send a recorded utterance to the backend for Gemini transcription only. */
export async function transcribeVoiceCommand(
  audio: Blob,
  fileName: string,
  mimeType: string,
  dogName?: string
): Promise<string> {
  const form = new FormData();
  form.append('audio', audio, fileName);
  form.append('mime_type', mimeType);
  form.append('dog_name', dogName ?? '');

  const response = await fetchWithServerFallback(
    '/api/v1/voice/transcribe',
    { method: 'POST', body: form },
    75000,
    2500,
    false
  );
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(typeof detail?.detail === 'string' ? detail.detail : '음성 인식에 실패했어요. 다시 말씀해 주세요.');
  }
  const data = await response.json();
  const transcript = typeof data?.transcript === 'string' ? data.transcript.trim() : '';
  if (!transcript) throw new Error('음성을 알아듣지 못했어요. 조금 더 또렷하게 말씀해 주세요.');
  return transcript;
}

/**
 * [오프라인 안전망] 네트워크 단절 또는 API 키 부재 시 온디바이스 정규식/키워드 파서
 */
export function extractLocalVoiceIntent(speechText: string, dogName?: string): VoiceIntentResult {
  const text = speechText.trim();
  const name = dogName || '강아지';

  // 1. 산책 시간(분) 추출
  let duration = 30;
  if (/(?:1\s*시간|한\s*시간)\s*(?:반|30\s*분)/.test(text)) {
    duration = 90;
  } else if (/(?:1\s*시간|한\s*시간|한시간)/.test(text)) {
    duration = 60;
  } else if (!text.includes('반시간')) {
    const match = /(\d{1,3})\s*(?:분|min)/.exec(text);
    if (match) {
      duration = Math.max(10, Math.min(90, Number.parseInt(match[1], 10)));
    }
  }

  // 2. 그늘길 선호 여부
  const prefer_shade = ['그늘', '시원', '더위', '덥', '뜨거', '햇빛', '햇볕'].some((k) => text.includes(k));

  // 3. 폭신한 흙길/잔디 선호 여부
  const prefer_cushion = !['아스팔트', '딱딱한 길 좋아'].some((k) => text.includes(k));

  // 4. 계단 회피 여부
  const avoid_stairs = !['계단 괜찮', '계단 포함', '계단 상관없', '계단 좋아'].some((k) => text.includes(k));

  // 5. 랜드마크 추출 (긴 이름 우선 매칭)
  const destination_landmark = extractVoiceLandmark(text);
  const landmark_park_id = normalizeToFrontendParkId(destination_landmark);

  // 6. 관절 케어 레벨
  let joint_care_level = 1;
  if (['관절', '다리', '슬개골', '무리 없', '천천히', '완만'].some((k) => text.includes(k))) {
    joint_care_level = 2;
  } else if (['신나게', '뛰', '달리', '활발'].some((k) => text.includes(k))) {
    joint_care_level = 0;
  }

  const landmarkMsg = destination_landmark ? `${destination_landmark} ` : '';
  const briefing = destination_landmark && !landmark_park_id
    ? unsupportedParkMessage(destination_landmark)
    : `${landmarkMsg}${name}와 함께하는 ${duration}분 맞춤 안심 산책 코스를 설정했습니다.`;

  return {
    status: 'success',
    intent: {
      target_duration_minutes: duration,
      prefer_shade,
      prefer_cushion,
      avoid_stairs,
      joint_care_level,
      destination_landmark,
      max_surface_temp_limit: 33.0,
      briefing_message: sanitizeVoiceBriefing(briefing),
    },
    landmark_park_id,
    model_used: 'local-rule-engine',
    data_source: 'local_fallback',
  };
}

/**
 * [영역 1 & 2] 음성/자연어 텍스트를 Gemini API를 통해 의도 분석
 */
export async function analyzeVoiceIntent(
  speechText: string,
  dogName?: string,
  coords?: { lat: number; lon: number } | null
): Promise<VoiceIntentResult> {
  const cleaned = speechText.trim();
  if (!cleaned) {
    return extractLocalVoiceIntent('30분 산책', dogName);
  }

  try {
    const payload = {
      speech_text: cleaned,
      dog_name: dogName || '반려견',
      origin_lat: coords?.lat ?? null,
      origin_lon: coords?.lon ?? null,
    };

    const response = await fetchWithServerFallback(
      '/api/v1/voice/intent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      },
      3000,
      1500
    );

    if (response.ok) {
      const data = await response.json();
      if (data?.status === 'success' && data.intent) {
        // 서버 모델이 공원 별칭을 잘못 추출해도 원문에 없는 장소는 사용하지 않는다.
        const landmark = extractVoiceLandmark(cleaned);
        const parkId = normalizeToFrontendParkId(landmark);
        return {
          status: 'success',
          intent: {
            ...data.intent,
            destination_landmark: landmark,
            briefing_message: sanitizeVoiceBriefing(landmark && !parkId
              ? unsupportedParkMessage(landmark) : data.intent.briefing_message),
          },
          landmark_park_id: parkId,
          model_used: data.model_used || 'gemini-3.5-flash-lite',
          data_source: data.data_source || 'gemini_live',
        };
      }
    }
  } catch (error) {
    console.warn('[VoiceIntentApi] 백엔드 Gemini 호출 실패, 로컬 안전망으로 즉시 폴백:', error);
  }

  // 네트워크 단절 또는 오류 시 100% 안전망 즉각 폴백
  return extractLocalVoiceIntent(cleaned, dogName);
}
