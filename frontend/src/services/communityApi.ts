/**
 * [편안하개 - PetWalk]
 * 커뮤니티 안심 산책로 공유 및 피드 연동 서비스 (US-G2)
 *
 * - FastAPI/Supabase 백엔드 실시간 연동
 * - 서버 미가동/오프라인 환경 시 로컬 안심 피드로 0.1초 무중단 자동 폴백
 */

import { detectLandmarkCategory } from './landmarkTagger';

import { fetchWithServerFallback } from './apiClient';

export interface CommunityFeedItem {
  readonly course_id: string;
  readonly title: string;
  readonly masked_polyline: readonly [number, number][];
  readonly distance_m: number;
  readonly duration_min: number;
  readonly rating: number;
  readonly is_origin_masked: boolean;
  readonly landmark_code?: string;
  readonly landmark_name?: string;
  readonly region_name?: string;
  readonly created_at?: string;
  readonly tags?: readonly string[];
}

export interface CommunityFeedResponse {
  readonly feeds: readonly CommunityFeedItem[];
  readonly is_supabase?: boolean;
}
const DEFAULT_FEEDS: readonly CommunityFeedItem[] = [
  {
    course_id: 'feed_1',
    title: '성산근린공원 폭신한 숲길 루프',
    masked_polyline: [
      [126.9082, 37.5668], [126.9088, 37.5673], [126.9096, 37.5680],
      [126.9103, 37.5687], [126.9106, 37.5693], [126.9102, 37.5700],
      [126.9096, 37.5707], [126.9088, 37.5711], [126.9079, 37.5712],
      [126.9071, 37.5708], [126.9065, 37.5702], [126.9061, 37.5694],
      [126.9062, 37.5686], [126.9067, 37.5679], [126.9074, 37.5672],
      [126.9082, 37.5668],
    ],
    distance_m: 1600,
    duration_min: 26,
    rating: 4.9,
    is_origin_masked: true,
    landmark_code: 'LM_SEONGSAN',
    landmark_name: '성산근린공원',
    region_name: '서울시 마포구',
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['폭신한숲길', '그늘많음'],
  },
  {
    course_id: 'feed_2',
    title: '세종호수공원 은빛해변 & 수상무대섬 루프',
    masked_polyline: [
      [127.2655, 36.5065], [127.2660, 36.5068], [127.2668, 36.5067],
      [127.2678, 36.5060], [127.2678, 36.5055], [127.2673, 36.5045],
      [127.2670, 36.5039], [127.2675, 36.5035], [127.2682, 36.5035],
      [127.2692, 36.5022], [127.2687, 36.5013], [127.2693, 36.5013],
      [127.2710, 36.5014], [127.2718, 36.5026], [127.2723, 36.5013],
      [127.2720, 36.5002], [127.2709, 36.4996], [127.2693, 36.4974],
      [127.2672, 36.4980], [127.2682, 36.5001], [127.2692, 36.5022],
      [127.2666, 36.5030], [127.2655, 36.5034], [127.2644, 36.5048],
      [127.2650, 36.5060], [127.2655, 36.5065],
    ],
    distance_m: 2400,
    duration_min: 36,
    rating: 5.0,
    is_origin_masked: true,
    landmark_code: 'LM_SEJONG',
    landmark_name: '세종호수공원',
    region_name: '세종특별자치시',
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['호수뷰', '평지보행'],
  },
  {
    course_id: 'feed_3',
    title: '대전 유림공원 반도지 & 갑천 둔치 루프',
    masked_polyline: [
      [127.3592, 36.3628], [127.3585, 36.3634], [127.3575, 36.3640],
      [127.3562, 36.3632], [127.3555, 36.3620], [127.3560, 36.3608],
      [127.3572, 36.3602], [127.3586, 36.3609], [127.3598, 36.3615],
      [127.3601, 36.3622], [127.3592, 36.3628],
    ],
    distance_m: 1800,
    duration_min: 28,
    rating: 4.9,
    is_origin_masked: true,
    landmark_code: 'LM_YURIM',
    landmark_name: '유림공원',
    region_name: '대전시 유성구',
    created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['수변데크', '완만길'],
  },
  {
    course_id: 'feed_4',
    title: '서울숲 안심 무장애 흙길 순환',
    masked_polyline: [
      [127.0365, 37.5435], [127.0373, 37.5442], [127.0382, 37.5448],
      [127.0394, 37.5452], [127.0406, 37.5450], [127.0414, 37.5444],
      [127.0412, 37.5435], [127.0403, 37.5428], [127.0390, 37.5425],
      [127.0376, 37.5428], [127.0365, 37.5435],
    ],
    distance_m: 1400,
    duration_min: 22,
    rating: 4.8,
    is_origin_masked: true,
    landmark_code: 'LM_SEOUL_FOREST',
    landmark_name: '서울숲 공원',
    region_name: '서울시 성동구',
    created_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['가족마당', '무장애길'],
  },
  {
    course_id: 'feed_5',
    title: '서울시청 & 덕수궁 돌담길 완만 산책',
    masked_polyline: [
      [126.9772, 37.5658], [126.9765, 37.5665], [126.9758, 37.5672],
      [126.9752, 37.5680], [126.9762, 37.5685], [126.9775, 37.5683],
      [126.9782, 37.5675], [126.9779, 37.5663], [126.9772, 37.5658],
    ],
    distance_m: 1250,
    duration_min: 20,
    rating: 4.9,
    is_origin_masked: true,
    landmark_code: 'LM_CITY_HALL',
    landmark_name: '서울시청 · 청계천',
    region_name: '서울시 중구',
    created_at: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['돌담길', '도심산책'],
  },
];

export async function fetchCommunityFeeds(): Promise<CommunityFeedResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1200);

  try {
    const res = await fetchWithServerFallback('/api/v1/community/feed', {
      signal: controller.signal,
    }, 1500);
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const rawFeeds: CommunityFeedItem[] = data.feeds || DEFAULT_FEEDS;
      const enrichedFeeds = rawFeeds.map((feed) => {
        // 분류된 메타데이터가 이미 있어도 오래된 앱/서버에서 저장된
        // 기본 지역값일 수 있으므로 경로 좌표로 매번 다시 판별한다.
        const meta = detectLandmarkCategory(feed.masked_polyline, feed.title);
        return {
          ...feed,
          landmark_code: meta.landmarkCode,
          landmark_name: meta.landmarkName,
          region_name: meta.regionName,
          created_at: feed.created_at || new Date().toISOString(),
          tags: feed.tags && feed.tags.length > 0 ? feed.tags : ['안심산책', '이웃추천'],
        };
      });
      return {
        feeds: enrichedFeeds,
        is_supabase: Boolean(data.is_supabase),
      };
    }
  } catch {
    // 오프라인 자동 폴백
  } finally {
    clearTimeout(timeoutId);
  }

  return { feeds: DEFAULT_FEEDS, is_supabase: false };
}

export const COMMUNITY_SHARE_ERROR_MESSAGE = '지금은 공유할 수 없어요. 잠시 후 다시 시도해 주세요.';

export async function shareCommunityCourse(
  title: string,
  rawCoordinates: readonly [number, number][],
  rating: number = 5,
  userId?: string,
): Promise<{ success: boolean; is_supabase?: boolean; errorMessage?: string }> {
  try {
    const res = await fetchWithServerFallback('/api/v1/community/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId || 'user_local_demo',
        course_title: title,
        raw_coordinates: rawCoordinates,
        satisfaction_rating: rating,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, is_supabase: Boolean(data.is_supabase) };
    }
    return {
      success: false,
      is_supabase: false,
      errorMessage: COMMUNITY_SHARE_ERROR_MESSAGE,
    };
  } catch (err) {
    console.warn('[communityApi] 코스 공유 서버 호출 실패:', err);
    return {
      success: false,
      is_supabase: false,
      errorMessage: COMMUNITY_SHARE_ERROR_MESSAGE,
    };
  }
}
