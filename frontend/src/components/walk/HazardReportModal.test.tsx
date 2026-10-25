import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { HazardReportModal, buildEmergencyReturnReport } from './HazardReportModal';

vi.mock('react-native', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    Modal: ({ visible, children }: any) =>
      visible ? React.createElement('div', { 'data-testid': 'mock-modal' }, children) : null,
  };
});

vi.mock('react-native-svg', () => ({
  default: (props: any) => React.createElement('svg', props),
  Polyline: (props: any) => React.createElement('polyline', props),
  Circle: (props: any) => React.createElement('circle', props),
  Ellipse: (props: any) => React.createElement('ellipse', props),
  Line: (props: any) => React.createElement('line', props),
  Path: (props: any) => React.createElement('path', props),
  Polygon: (props: any) => React.createElement('polygon', props),
  Rect: (props: any) => React.createElement('rect', props),
  G: (props: any) => React.createElement('g', props),
  Text: (props: any) => React.createElement('text', props),
}));

describe('HazardReportModal - 현장 위험 제보 및 안전 우회 모달 검증', () => {
  it('모달이 표시될 때(visible=true) 위험 유형 항목들과 우회/긴급복귀 버튼이 노출된다', () => {
    const html = renderToStaticMarkup(
      <HazardReportModal
        visible={true}
        onClose={vi.fn()}
        currentLat={36.374}
        currentLon={127.382}
        startLat={36.370}
        startLon={127.380}
        onRerouteApplied={vi.fn()}
      />
    );

    // 타이틀 확인
    expect(html).toContain('현장 위험 제보 &amp; 안전 우회');
    // 위험 유형 옵션들 확인
    expect(html).toContain('공사 구역');
    expect(html).toContain('높은 턱');
    expect(html).toContain('유리 파편');
    expect(html).toContain('들개/맹견 출몰');
    // 두 가지 주요 액션 버튼 확인
    expect(html).toContain('새로운 길로 안전 우회하기');
    expect(html).toContain('출발지로 즉시 안전 복귀하기');
  });

  it('visible=false일 때 모달 내용이 보이지 않는다', () => {
    const html = renderToStaticMarkup(
      <HazardReportModal
        visible={false}
        onClose={vi.fn()}
        currentLat={36.374}
        currentLon={127.382}
        onRerouteApplied={vi.fn()}
      />
    );

    expect(html).toBe('');
  });

  it('긴급 복귀: 위험 종류를 직접 고르지 않으면 제보를 올리지 않는다 (기본값 공사 구역이 쌓이던 문제)', () => {
    expect(buildEmergencyReturnReport(false, 'construction', 36.3906, 127.351)).toBeNull();
  });

  it('긴급 복귀: 위험 종류를 고르면 실제 현재 위치로 그 종류를 제보한다', () => {
    const report = buildEmergencyReturnReport(true, 'broken_glass', 36.3906, 127.351);
    expect(report).toEqual({
      lat: 36.3906,
      lon: 127.351,
      hazardType: 'broken_glass',
      severity: 'danger',
      description: '긴급 복귀 요청 - 현장 위험 [유리 파편]',
    });
  });
});
