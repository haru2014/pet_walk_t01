import { describe, expect, it } from 'vitest';
import { resolvePrivacyMaskCenter } from './privacyMask';

describe('resolvePrivacyMaskCenter - 200m 보호 원은 산책 시작 지점에 고정', () => {
  it('현재 위치가 아니라 산책 시작 지점을 중심으로 한다 (경로 이탈 재탐색 후에도 동일)', () => {
    const start = { lat: 36.36, lon: 127.38 };
    const afterReroute = { lat: 36.37, lon: 127.39 };
    expect(resolvePrivacyMaskCenter(start, afterReroute)).toEqual([127.38, 36.36]);
  });

  it('시작 지점을 아직 모르면 현재 위치를 쓴다', () => {
    expect(resolvePrivacyMaskCenter(null, { lat: 36.37, lon: 127.39 })).toEqual([127.39, 36.37]);
  });

  it('둘 다 없으면 보호 원을 그리지 않는다', () => {
    expect(resolvePrivacyMaskCenter(null, null)).toBeUndefined();
  });
});
