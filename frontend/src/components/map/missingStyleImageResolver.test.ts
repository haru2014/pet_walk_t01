import { describe, expect, it, vi } from 'vitest';
import { registerMissingStyleImageResolver } from './missingStyleImageResolver';

describe('registerMissingStyleImageResolver', () => {
  it('누락된 스타일 아이콘을 MapLibre에 투명 이미지로 등록한다', () => {
    let resolver: ((id: string) => void) | undefined;
    const addImage = vi.fn();
    const map = {
      hasImage: vi.fn(() => false),
      addImage,
      setMissingStyleImageResolver: vi.fn((callback: (id: string) => void) => {
        resolver = callback;
      }),
    };

    registerMissingStyleImageResolver(map);
    resolver?.('office');

    expect(map.setMissingStyleImageResolver).toHaveBeenCalledOnce();
    expect(map.hasImage).toHaveBeenCalledWith('office');
    expect(addImage).toHaveBeenCalledWith('office', {
      width: 1,
      height: 1,
      data: new Uint8Array(4),
    });
  });

  it('이미 등록된 아이콘을 다시 등록하지 않는다', () => {
    let resolver: ((id: string) => void) | undefined;
    const addImage = vi.fn();
    registerMissingStyleImageResolver({
      hasImage: () => true,
      addImage,
      setMissingStyleImageResolver: (callback) => {
        resolver = callback;
      },
    });

    resolver?.('cycling');

    expect(addImage).not.toHaveBeenCalled();
  });
});
