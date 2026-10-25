import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RouteReasonCard } from './RouteReasonCard';

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

describe('RouteReasonCard (인포그래픽 카드 표시 검증)', () => {
  it('DEM 실측값인 경우 정상 경사도 및 노면 정보를 표시한다', () => {
    const html = renderToStaticMarkup(
      <RouteReasonCard
        reasonText="안심 경로 안내"
        maxSlopePercent={2.1}
        slopeSource="dem"
        softSurfacePercent={85}
        surfaceKnownRatio={1.0}
      />
    );

    expect(html).toContain('오르막 경사');
    expect(html).toContain('최대 2.1%');
    expect(html).toContain('지도에 표시된 높낮이를 기준으로 했어요');
    expect(html).toContain('폭신한 길');
    expect(html).toContain('85%');
  });

  it('근사 계산인 경우 "예상 경사도" 및 "약 N%"로 오해 없이 표시한다', () => {
    const html = renderToStaticMarkup(
      <RouteReasonCard
        reasonText="안심 경로 안내"
        maxSlopePercent={3.5}
        slopeSource="approximation"
        softSurfacePercent={70}
      />
    );

    expect(html).toContain('예상 오르막');
    expect(html).toContain('약 3.5%');
    expect(html).toContain('주변 지형을 바탕으로 예상했어요');
  });

  it('고도/경사도 또는 노면 데이터가 없을 때 0%나 임의 값 대신 "정보 없음"으로 표시한다', () => {
    const html = renderToStaticMarkup(
      <RouteReasonCard
        reasonText="안심 경로 안내"
        maxSlopePercent={null}
        slopeSource="unknown"
        softSurfacePercent={null}
        surfaceKnownRatio={0.0}
      />
    );

    expect(html).toContain('길의 높낮이');
    expect(html).toContain('정보 없음');
    expect(html).toContain('길 높낮이를 아직 확인하지 못했어요');
    expect(html).toContain('길 종류');
    expect(html).toContain('산책길 종류를 아직 확인하지 못했어요');
    expect(html).not.toContain('0%');
    expect(html).not.toContain('평탄함');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
  });

  it('노면이 일부 구간만 확인되었을 때 확인 구간 비율을 보조문구로 명시한다', () => {
    const html = renderToStaticMarkup(
      <RouteReasonCard
        reasonText="안심 경로 안내"
        maxSlopePercent={2.0}
        slopeSource="dem"
        softSurfacePercent={45}
        surfaceKnownRatio={0.6}
      />
    );

    expect(html).toContain('폭신한 길');
    expect(html).toContain('45%');
    expect(html).toContain('정보가 있는 길(60%) 기준');
  });
});
