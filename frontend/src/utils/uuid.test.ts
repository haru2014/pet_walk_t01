/**
 * [편안하개 - PetWalk] UUID 유틸 단위 테스트 (US-G2, backend/sql/README.md 약속 1번)
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { generateUuid, isUuid } from './uuid';

describe('uuid 유틸', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('generateUuid 는 UUID v4 형식이고 매번 다르다', () => {
    const a = generateUuid();
    const b = generateUuid();
    expect(isUuid(a)).toBe(true);
    expect(isUuid(b)).toBe(true);
    expect(a).not.toBe(b);
  });

  it('crypto.randomUUID 가 없어도(대체 경로) 올바른 UUID 를 만든다', () => {
    vi.stubGlobal('crypto', undefined);
    const id = generateUuid();
    expect(isUuid(id)).toBe(true);
  });

  it('옛 형식(dog_123, walk_123, guest_user)과 잘못된 값은 UUID 가 아니다', () => {
    for (const bad of ['dog_1760000000000', 'walk_1', 'guest_user', '', 'not-a-uuid', undefined, null, 42]) {
      expect(isUuid(bad)).toBe(false);
    }
  });

  it('DB 가 받는 표준 UUID 는 통과한다', () => {
    expect(isUuid('3f2a9c1e-7b4d-4f6a-9d2e-1a8b5c0d7e44')).toBe(true);
  });
});
