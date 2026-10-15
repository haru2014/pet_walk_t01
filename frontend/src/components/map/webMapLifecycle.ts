/**
 * [편안하개 - PetWalk]
 * 웹 MapLibre 인스턴스 자원 해제 헬퍼 (T-OFM-8 메모리 누수 방지)
 *
 * 모달/탭 전환으로 지도가 언마운트될 때 마커 DOM, 스타일 로드 감시 타이머,
 * WebGL 컨텍스트를 가진 map 인스턴스를 순서대로 해제합니다.
 * 어느 한 단계에서 예외가 발생해도 나머지 해제는 계속 진행합니다.
 */

export interface RemovableHandle {
  remove(): void;
}

function safeRemove(handle: RemovableHandle | null | undefined): void {
  try {
    handle?.remove();
  } catch {
    // 이미 해제되었거나 WebGL 컨텍스트가 소실된 경우 무시
  }
}

/** 마커 목록을 모두 해제합니다. (경로/핀 갱신 시 이전 마커 정리에도 사용) */
export function removeHandles(handles: readonly RemovableHandle[]): void {
  handles.forEach(safeRemove);
}

export function disposeWebMap(
  map: RemovableHandle | null,
  markers: readonly RemovableHandle[],
  watchdogId: ReturnType<typeof setTimeout> | null,
): void {
  if (watchdogId !== null) clearTimeout(watchdogId);
  removeHandles(markers);
  safeRemove(map);
}
