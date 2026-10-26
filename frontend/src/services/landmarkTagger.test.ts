import { describe, expect, it } from 'vitest';
import { detectLandmarkCategory } from './landmarkTagger';

describe('detectLandmarkCategory', () => {
  it('공원 중심 반경 밖의 대전 도로 경로를 동네 보행로·대전으로 표시한다', () => {
    const metadata = detectLandmarkCategory([[127.5, 36.4]]);

    expect(metadata.landmarkCode).toBe('LM_OTHER');
    expect(metadata.landmarkName).toBe('동네 안심 보행로');
    expect(metadata.regionName).toBe('대전광역시');
  });

  it('좌표가 있으면 제목의 다른 지역 장소명보다 좌표 지역을 우선한다', () => {
    const metadata = detectLandmarkCategory([[127.5, 36.4]], '서울시청 주변 산책');

    expect(metadata.regionName).toBe('대전광역시');
  });

  it('지원 지역 밖의 경로에 서울시를 임의로 붙이지 않는다', () => {
    const metadata = detectLandmarkCategory([[128.6, 35.9]]);

    expect(metadata.landmarkCode).toBe('LM_OTHER');
    expect(metadata.regionName).toBe('지역 미확인');
  });
});
