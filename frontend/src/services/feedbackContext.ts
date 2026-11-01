/**
 * [편안하개 - PetWalk]
 * 무상태(Stateless) AI 피드백 컨텍스트 생성기 (US-E3)
 */

import { LocalStorageService } from './storage';

export interface FeedbackSummaryPayload {
  recent_walk_count: number;
  slope_dissatisfaction_count: number;
  shade_preference_count: number;
  recommended_max_slope_offset: number;
}

export class FeedbackContextService {
  static async buildRecentFeedbackContext(): Promise<FeedbackSummaryPayload> {
    const history = await LocalStorageService.getWalkHistory();
    const recent = history.slice(0, 5);

    let steepCount = 0;
    let gentleCount = 0;
    let shadePreference = 0;

    for (const record of recent) {
      if (!record.feedback) continue;
      const fb = record.feedback;
      const tags = fb.tags || [];
      const isSteep = fb.slopeRating === 'steep' || tags.some((t) => t.includes('경사') || t.includes('가팔'));
      const isGentle = fb.slopeRating === 'gentle' || tags.some((t) => t.includes('완만') || t.includes('편안'));

      if (isSteep) {
        steepCount += 1;
      } else if (isGentle) {
        gentleCount += 1;
      }
      if (tags.some((t) => t.includes('그늘'))) {
        shadePreference += 1;
      }
    }

    // 순 경사 불만족 횟수: 완만/편안함 피드백 시 불만족이 단계적으로 상쇄 및 회복됨
    const netSlopeDissatisfaction = Math.max(0, steepCount - gentleCount);
    const slopeOffset = netSlopeDissatisfaction > 0 ? -(netSlopeDissatisfaction * 1.5) : 0;

    return {
      recent_walk_count: recent.length,
      slope_dissatisfaction_count: netSlopeDissatisfaction,
      shade_preference_count: shadePreference,
      recommended_max_slope_offset: Math.round(slopeOffset * 10) / 10,
    };
  }

  static generateBriefingNotice(summary: FeedbackSummaryPayload): string {
    if (summary.slope_dissatisfaction_count > 0) {
      return '산책 의견을 반영해 오르막이 적은 길을 먼저 찾아요.';
    }
    if (summary.shade_preference_count > 0) {
      return '그늘이 많은 시원한 길을 먼저 찾아요.';
    }
    return '반려견의 관절과 발바닥이 편안한 길을 먼저 찾아요.';
  }
}
