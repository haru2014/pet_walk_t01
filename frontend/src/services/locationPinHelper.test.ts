import { describe, it, expect } from 'vitest';
import {
  CURRENT_LOCATION_PIN_ID,
  createCurrentLocationPin,
  mergeCurrentLocationPin,
} from './locationPinHelper';
import { RouteStepPin } from '../types/route';

describe('locationPinHelper', () => {
  it('GPS 좌표로부터 현재 위치 핀을 올바르게 생성한다', () => {
    const pin = createCurrentLocationPin(127.3592, 36.3628, 'GPS 확인');
    expect(pin.id).toBe(CURRENT_LOCATION_PIN_ID);
    expect(pin.position).toEqual([127.3592, 36.3628]);
    expect(pin.icon).toBe('📍');
    expect(pin.title).toBe('현재 위치');
    expect(pin.detail).toBe('GPS 확인');
  });

  it('좌표가 없을 때는 기존 핀 목록을 그대로 반환한다', () => {
    const originalPins: RouteStepPin[] = [
      { id: 'step_1', kind: 'turn', position: [127.3, 36.3], instruction: '우회전' },
    ];
    const merged = mergeCurrentLocationPin(originalPins, null, null);
    expect(merged).toBe(originalPins);
  });

  it('좌표가 주어지면 기존 목록의 맨 앞에 현재 위치 핀을 삽입한다', () => {
    const originalPins: RouteStepPin[] = [
      { id: 'step_1', kind: 'turn', position: [127.3, 36.3], instruction: '우회전' },
    ];
    const merged = mergeCurrentLocationPin(originalPins, 127.3592, 36.3628);
    expect(merged.length).toBe(2);
    expect(merged[0].id).toBe(CURRENT_LOCATION_PIN_ID);
    expect(merged[0].position).toEqual([127.3592, 36.3628]);
    expect(merged[1].id).toBe('step_1');
  });
});
