/**
 * [편안하개 - PetWalk]
 * 구간별 분기 Polyline 렌더러 (Phase 3, US-C1)
 *
 * segmentType별 스타일:
 *  - safe    : #10B981, 두께 6, round cap
 *  - normal  : #3B82F6, 두께 5
 *  - caution : #F97316, 두께 6
 */

import React from 'react';
import { TOKENS } from '../../theme/tokens';
import { LonLat, RouteFeatureCollection, SegmentType } from '../../types/route';
import { ProjectedPoint } from '../../services/routeGeometry';

interface SegmentStyle {
  readonly color: string;
  readonly width: number;
}

export const SEGMENT_STYLES: Record<SegmentType, SegmentStyle> = {
  safe: { color: TOKENS.colors.routeSafe, width: 6 },
  normal: { color: TOKENS.colors.routeNormal, width: 5 },
  caution: { color: TOKENS.colors.routeRubber, width: 6 },
};

export interface RoutePolylineRendererProps {
  readonly route: RouteFeatureCollection;
  readonly project: (p: LonLat) => ProjectedPoint;
}

export const RoutePolylineRenderer: React.FC<RoutePolylineRendererProps> = ({ route, project }) => (
  <g>
    {route.features.map((feature, idx) => {
      const style = SEGMENT_STYLES[feature.properties.segmentType];
      const points = feature.geometry.coordinates
        .map((c) => {
          const p = project(c);
          return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        })
        .join(' ');
      const key = `${feature.properties.segmentType}_${idx}`;

      return (
        <g key={key}>
          {/* 외곽 화이트 케이싱으로 지도 위 시인성 확보 */}
          <polyline
            points={points}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={style.width + 4}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.9}
          />
          <polyline
            points={points}
            fill="none"
            stroke={style.color}
            strokeWidth={style.width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      );
    })}
  </g>
);
