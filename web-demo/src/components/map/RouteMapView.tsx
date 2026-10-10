/**
 * [편안하개 - PetWalk]
 * 코스 프리뷰 지도 뷰 (Phase 3, US-C1)
 * Polyline + 마커 + 범례 + 선택된 스텝 안내 + 요약 카드를 조합한다.
 */

import React, { useMemo, useState } from 'react';
import { TOKENS } from '../../theme/tokens';
import { LonLat, RouteFeatureCollection, RouteStepPin } from '../../types/route';
import { buildCourseSummary, createProjector } from '../../services/routeGeometry';
import { RoutePolylineRenderer, SEGMENT_STYLES } from './RoutePolylineRenderer';
import { PawMarker, StepPin } from './CustomMarkers';
import { CourseSummaryCard } from './CourseSummaryCard';

const MAP_WIDTH = 350;
const MAP_HEIGHT = 420;

const LEGEND: ReadonlyArray<{ type: 'safe' | 'normal' | 'caution'; label: string }> = [
  { type: 'safe', label: '완만/그늘' },
  { type: 'normal', label: '일반 보도' },
  { type: 'caution', label: '주의 구간' },
];

export interface RouteMapViewProps {
  readonly route: RouteFeatureCollection;
  readonly stepPins: readonly RouteStepPin[];
  readonly speedKmH: number;
  readonly onStart?: () => void;
}

export const RouteMapView: React.FC<RouteMapViewProps> = ({ route, stepPins, speedKmH, onStart }) => {
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);

  const allCoords = useMemo<LonLat[]>(
    () => route.features.flatMap((f) => [...f.geometry.coordinates]),
    [route],
  );
  const project = useMemo(
    () => createProjector(allCoords, { width: MAP_WIDTH, height: MAP_HEIGHT, padding: 44 }),
    [allCoords],
  );
  const summary = useMemo(() => buildCourseSummary(route, speedKmH), [route, speedKmH]);

  if (allCoords.length === 0) return null;

  const start = project(allCoords[0]);
  const selectedPin = stepPins.find((p) => p.id === selectedPinId) ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      <div
        style={{
          position: 'relative',
          borderRadius: `${TOKENS.borderRadius.card}px`,
          overflow: 'hidden',
          border: `1px solid ${TOKENS.colors.border}`,
          background: 'linear-gradient(160deg, #EAF6EF 0%, #F4F8F5 55%, #E6F1EA 100%)',
        }}
      >
        <svg
          width="100%"
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          role="img"
          aria-label="산책 코스 지도 프리뷰"
          style={{ display: 'block' }}
        >
          {/* 지도 배경 그리드 */}
          <defs>
            <pattern id="map-grid" width="35" height="35" patternUnits="userSpaceOnUse">
              <path d="M 35 0 L 0 0 0 35" fill="none" stroke="#D5E6DB" strokeWidth="0.8" />
            </pattern>
          </defs>
          <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#map-grid)" />

          <RoutePolylineRenderer route={route} project={project} />

          {stepPins.map((pin) => (
            <StepPin
              key={pin.id}
              pin={pin}
              project={project}
              selected={pin.id === selectedPinId}
              onSelect={setSelectedPinId}
            />
          ))}

          {/* 순환 코스: 출발=도착 동일 지점 */}
          <PawMarker x={start.x} y={start.y} label="출발/도착" />
        </svg>

        {/* 범례 */}
        <div
          style={{
            position: 'absolute', top: '10px', left: '10px',
            background: 'rgba(255,255,255,0.92)', borderRadius: '12px',
            padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: '3px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}
        >
          {LEGEND.map((item) => (
            <div key={item.type} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: TOKENS.colors.textMain }}>
              <span style={{ width: '16px', height: '4px', borderRadius: '2px', background: SEGMENT_STYLES[item.type].color }} />
              {item.label}
            </div>
          ))}
        </div>

        {/* 선택된 스텝 안내 */}
        {selectedPin && (
          <div
            style={{
              position: 'absolute', bottom: '10px', left: '10px', right: '10px',
              background: TOKENS.colors.textMain, color: '#FFF', borderRadius: '12px',
              padding: '8px 12px', fontSize: '12px', textAlign: 'center',
            }}
          >
            🔊 {selectedPin.instruction}
          </div>
        )}
      </div>

      <div style={{ marginTop: '12px' }}>
        <CourseSummaryCard summary={summary} onStart={onStart} />
      </div>
    </div>
  );
};
