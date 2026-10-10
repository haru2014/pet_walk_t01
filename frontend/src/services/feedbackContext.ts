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

    let slopeDissatisfaction = 0;
    let shadePreference = 0;

    for (const record of recent) {
      if (!record.feedback) continue;
      const tags = record.feedback.tags || [];
      if (tags.some((t) => t.includes('경사') || t.includes('가팔'))) {
        slopeDissatisfaction += 1;
      }
      if (tags.some((t) => t.includes('그늘'))) {
        shadePreference += 1;
      }
    }

    const slopeOffset = slopeDissatisfaction > 0 ? -(slopeDissatisfaction * 1.5) : 0;

    return {
      recent_walk_count: recent.length,
      slope_dissatisfaction_count: slopeDissatisfaction,
      shade_preference_count: shadePreference,
      recommended_max_slope_offset: Math.round(slopeOffset * 10) / 10,
    };
  }

  static generateBriefingNotice(summary: FeedbackSummaryPayload): string {
    if (summary.slope_dissatisfaction_count > 0) {
      return `최근 경사도 피드백을 반영하여 완만한 길 위주로 최대 경사도를 ${Math.abs(summary.recommended_max_slope_offset)}% 더 완화하여 안내합니다.`;
    }
    if (summary.shade_preference_count > 0) {
      return '그늘이 풍부한 시원한 보행로를 우선적으로 추천했습니다.';
    }
    return '반려견 관절 안심을 위한 최적의 표준 평지 코스를 추천합니다.';
  }
}
