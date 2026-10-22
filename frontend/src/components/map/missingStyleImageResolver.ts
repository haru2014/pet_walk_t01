interface MissingImageMap {
  hasImage: (id: string) => boolean;
  addImage: (id: string, image: { width: number; height: number; data: Uint8Array }) => unknown;
  setMissingStyleImageResolver?: (resolver: (id: string) => void) => unknown;
}

/** 스타일에 없는 선택형 POI 아이콘을 투명 이미지로 등록해 MapLibre 경고를 방지한다. */
export function registerMissingStyleImageResolver(map: MissingImageMap): void {
  if (typeof map.setMissingStyleImageResolver !== 'function') return;

  map.setMissingStyleImageResolver((imageId) => {
    if (map.hasImage(imageId)) return;
    map.addImage(imageId, {
      width: 1,
      height: 1,
      data: new Uint8Array(4),
    });
  });
}
