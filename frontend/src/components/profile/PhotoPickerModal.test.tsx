import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PhotoPickerModal } from './PhotoPickerModal';

vi.mock('react-native', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    Modal: ({ visible, children }: any) =>
      visible ? React.createElement('div', { 'data-testid': 'mock-modal' }, children) : null,
  };
});

vi.mock('../../services/photoPickerService', () => ({
  PhotoPickerService: {
    pickFromGallery: vi.fn(),
    captureFromCamera: vi.fn(),
  },
  DOG_AVATAR_PRESETS: [
    { id: 'golden', name: '골든리트리버', emoji: '🦮', color: '#FEF3C7' },
    { id: 'maltese', name: '말티즈/비숑', emoji: '🐕', color: '#F3F4F6' },
  ],
}));

describe('PhotoPickerModal 컴포넌트 검증', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('visible이 true일 때 모달 내용(사진 보관함, 카메라, 견종 캐릭터)이 렌더링되어야 한다', () => {
    const html = renderToStaticMarkup(
      <PhotoPickerModal
        visible={true}
        onClose={vi.fn()}
        onSelectPhoto={vi.fn()}
      />
    );

    expect(html).toContain('사진 보관함');
    expect(html).toContain('카메라');
    expect(html).toContain('골든리트리버');
    expect(html).toContain('말티즈/비숑');
  });

  it('visible이 false일 때 모달 내용이 렌더링되지 않아야 한다', () => {
    const html = renderToStaticMarkup(
      <PhotoPickerModal
        visible={false}
        onClose={vi.fn()}
        onSelectPhoto={vi.fn()}
      />
    );

    expect(html).toBe('');
  });

  it('기존 사진이 있는 경우 기본 아이콘으로 초기화 버튼이 나타나야 한다', () => {
    const html = renderToStaticMarkup(
      <PhotoPickerModal
        visible={true}
        currentPhotoUri="file:///path/to/my_photo.jpg"
        onClose={vi.fn()}
        onSelectPhoto={vi.fn()}
      />
    );

    expect(html).toContain('기본 아이콘으로 초기화');
  });
});
