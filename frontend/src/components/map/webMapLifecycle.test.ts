import { describe, it, expect, vi } from 'vitest';
import { disposeWebMap, RemovableHandle } from './webMapLifecycle';

describe('웹 지도 자원 해제 - 메모리 누수 점검 (T-OFM-8)', () => {
  it('마커를 먼저 해제한 뒤 map.remove()를 정확히 1회 호출한다', () => {
    const order: string[] = [];
    const map: RemovableHandle = { remove: vi.fn(() => { order.push('map'); }) };
    const markers: RemovableHandle[] = ['a', 'b'].map((name) => ({
      remove: vi.fn(() => { order.push(`marker-${name}`); }),
    }));

    disposeWebMap(map, markers, null);

    expect(order).toEqual(['marker-a', 'marker-b', 'map']);
    expect(map.remove).toHaveBeenCalledTimes(1);
  });

  it('스타일 로드 감시 타이머를 해제해 언마운트 이후 콜백이 실행되지 않는다', async () => {
    const callback = vi.fn();
    const watchdogId = setTimeout(callback, 5);

    disposeWebMap(null, [], watchdogId);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(callback).not.toHaveBeenCalled();
  });

  it('map이 없어도(초기화 전 언마운트) 예외 없이 종료한다', () => {
    expect(() => disposeWebMap(null, [], null)).not.toThrow();
  });

  it('일부 해제가 예외를 던져도 나머지 마커와 map 해제를 계속 진행한다', () => {
    const failingMarker: RemovableHandle = { remove: vi.fn(() => { throw new Error('already removed'); }) };
    const healthyMarker: RemovableHandle = { remove: vi.fn() };
    const map: RemovableHandle = { remove: vi.fn(() => { throw new Error('webgl context lost'); }) };

    expect(() => disposeWebMap(map, [failingMarker, healthyMarker], null)).not.toThrow();
    expect(healthyMarker.remove).toHaveBeenCalledTimes(1);
    expect(map.remove).toHaveBeenCalledTimes(1);
  });

  it('모달/탭 전환을 100회 반복해도 생성된 map 인스턴스가 모두 해제된다', () => {
    let liveMaps = 0;
    let liveMarkers = 0;
    const createMap = (): RemovableHandle => {
      liveMaps += 1;
      return { remove: () => { liveMaps -= 1; } };
    };
    const createMarker = (): RemovableHandle => {
      liveMarkers += 1;
      return { remove: () => { liveMarkers -= 1; } };
    };

    for (let cycle = 0; cycle < 100; cycle += 1) {
      const map = createMap();
      const markers = [createMarker(), createMarker(), createMarker()];
      disposeWebMap(map, markers, null);
    }

    expect(liveMaps).toBe(0);
    expect(liveMarkers).toBe(0);
  });
});
