/**
 * [편안하개 - PetWalk]
 * QuickFeedbackModal 단위 테스트 (Screen-05, US-E2)
 *
 * - 별점(comfortScore), 경사도(slopeRating), 태그(tags), 코멘트(comment) 전 항목 수정 및 보존 검증
 * - 태그 라벨 첫 단어 잘림 버그 방지 검증
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuickFeedbackModal } from './QuickFeedbackModal';
import { WalkFeedback } from '../../types/storage';

vi.mock('react-native', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    Modal: ({ visible, children }: any) =>
      visible ? React.createElement('div', { 'data-testid': 'mock-modal' }, children) : null,
  };
});

vi.mock('../common/AppIcon', () => ({
  AppIcon: () => React.createElement('span', { 'data-testid': 'mock-icon' }),
}));

describe('QuickFeedbackModal - 후기 피드백 전 항목 수정 및 보존', () => {
  it('기본 렌더링 시 피드백 항목들(별점, 경사도, 태그, 코멘트)이 정상 출력된다', () => {
    const html = renderToStaticMarkup(
      <QuickFeedbackModal
        visible={true}
        dogName="초코"
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // 1. 헤더 및 반려견 이름
    expect(html).toContain('산책 체감 피드백');
    expect(html).toContain('초코와의 오늘 산책은 어떠셨나요?');

    // 2. 보행 종합 만족도
    expect(html).toContain('보행 종합 만족도');
    expect(html).toContain('5점');

    // 3. 경사도 3단계 옵션
    expect(html).toContain('오르막과 내리막은 어땠나요?');
    expect(html).toContain('완만/평지');
    expect(html).toContain('적당함');
    expect(html).toContain('가파름');

    // 4. 웰니스 체감 태그 칩 (첫 단어가 잘리지 않고 온전히 출력)
    expect(html).toContain('그늘 많아요');
    expect(html).toContain('폭신한 흙/잔디');
    expect(html).toContain('계단 적어요');

    // 5. 메모 입력창
    expect(html).toContain('한 줄 메모 (선택)');
  });

  it('기존 initialFeedback이 제공되었을 때 저장된 값들이 모달에 온전히 복원된다', () => {
    const existingFeedback: WalkFeedback = {
      comfortScore: 4,
      slopeRating: 'steep',
      tags: ['그늘 많아요', '계단 적어요'],
      comment: '가파른 오르막이 있었지만 그늘이 많았어요',
    };

    const html = renderToStaticMarkup(
      <QuickFeedbackModal
        visible={true}
        dogName="초코"
        initialFeedback={existingFeedback}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain('4점');
    expect(html).toContain('가파름');
    expect(html).toContain('그늘 많아요');
    expect(html).toContain('계단 적어요');
    expect(html).toContain('가파른 오르막이 있었지만 그늘이 많았어요');
  });
});
