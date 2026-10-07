/**
 * [편안하개 - PetWalk]
 * 무상태(Stateless) 피드백 컨텍스트 바인딩 모듈 (US-E3)
 * 
 * 배경 & 차별화:
 * - 서버 DB에 견주의 개인 히스토리를 누적하지 않는 Stateless 원칙 유지.
 * - 클라이언트 로컬의 최근 3회 산책 피드백 요약본을 생성하여
 *   AI 경로 생성 요청 시 페이로드에 동적 주입.
 */

import { LocalStorageService } from './storage';
import { STORAGE_KEYS, WalkRecord } from '../types/storage';

export interface FeedbackSummaryPayload {
  recent_walk_count: number;
  slope_dissatisfaction_count: number;    // "가팔랐어요" 불만족 횟수
  shade_preferred: boolean;               // 그늘길 선호 태그 누적 여부
  average_comfort_score: number;          // 최근 평균 체감 점수 (1~5)
  recommended_max_slope_offset: number;   // AI 허용 최대 경사도 보정값 (-1% ~ -2%)
}

export class FeedbackContextService {
  /**
   * 최근 3회 산책 기록을 기반으로 Stateless AI 피드백 요약 페이로드 추출
   */
  static async buildRecentFeedbackContext(): Promise<FeedbackSummaryPayload> {
    const walkHistory = await LocalStorageService.getItem<WalkRecord[]>(STORAGE_KEYS.WALK_HISTORY) || [];
    const recentWalks = walkHistory.slice(0, 3); // 최근 3회만 분석

    if (recentWalks.length === 0) {
      return {
        recent_walk_count: 0,
        slope_dissatisfaction_count: 0,
        shade_preferred: false,
        average_comfort_score: 5.0,
        recommended_max_slope_offset: 0.0,
      };
    }

    let slopeDissatisfaction = 0;
    let shadeTagCount = 0;
    let totalScore = 0;
    let validScoreCount = 0;

    for (const walk of recentWalks) {
      if (walk.feedback) {
        // 체감 점수가 3점 이하이거나 경사 불만족 언급이 있는 경우
        if (walk.feedback.comfortScore <= 3) {
          slopeDissatisfaction += 1;
        }

        if (walk.feedback.tags && walk.feedback.tags.includes('그늘많아요')) {
          shadeTagCount += 1;
        }

        totalScore += walk.feedback.comfortScore;
        validScoreCount += 1;
      }
    }

    const avgScore = validScoreCount > 0 ? Number((totalScore / validScoreCount).toFixed(1)) : 5.0;

    // 경사 불만족이 1회 이상이면 최대 허용 경사도를 1.5% 낮춤
    const slopeOffset = slopeDissatisfaction > 0 ? -1.5 : 0.0;

    return {
      recent_walk_count: recentWalks.length,
      slope_dissatisfaction_count: slopeDissatisfaction,
      shade_preferred: shadeTagCount >= 1,
      average_comfort_score: avgScore,
      recommended_max_slope_offset: slopeOffset,
    };
  }

  /**
   * AI 경로 요청 페이로드에 결합할 Stateless 안내 문구 생성
   */
  static generateBriefingNotice(payload: FeedbackSummaryPayload): string | null {
    if (payload.slope_dissatisfaction_count > 0) {
      return '지난 산책 피드백을 반영하여 더 완만한 평지 위주로 코스를 구성했어요. 🌿';
    }
    if (payload.shade_preferred) {
      return '그늘길을 선호하시는 피드백에 맞춰 시원한 나무 그늘 구간을 우선 포함했어요. 🌳';
    }
    return null;
  }
}
