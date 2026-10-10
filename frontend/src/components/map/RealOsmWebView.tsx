/**
 * [편안하개 - PetWalk]
 * Web 환경 전용 OpenStreetMap(OSM) 대화형 실감 지도 뷰어 (US-C1, Phase 3)
 *
 * 브라우저 환경에서 실제 도로명, 공원 산책로, 건물, 지하철역 등을
 * 100% 완전한 실제 인터랙티브 지도로 확대/축소/탐색할 수 있게 지원합니다.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Linking, TouchableOpacity, Platform } from 'react-native';
import { TOKENS } from '../../theme/tokens';
import { LonLat } from '../../types/route';

export interface RealOsmWebViewProps {
  readonly coords: readonly LonLat[];
  readonly width?: number;
  readonly height?: number;
}

export const RealOsmWebView: React.FC<RealOsmWebViewProps> = ({
  coords,
  width = 360,
  height = 380,
}) => {
  const { embedUrl, osmLinkUrl } = useMemo(() => {
    if (!coords || coords.length === 0) {
      return { embedUrl: '', osmLinkUrl: '' };
    }

    const lons = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);

    const padLon = 0.0035;
    const padLat = 0.0025;
    const minX = (minLon - padLon).toFixed(5);
    const minY = (minLat - padLat).toFixed(5);
    const maxX = (maxLon + padLon).toFixed(5);
    const maxY = (maxLat + padLat).toFixed(5);
    const centerLat = ((minLat + maxLat) / 2).toFixed(5);
    const centerLon = ((minLon + maxLon) / 2).toFixed(5);

    const embed = `https://www.openstreetmap.org/export/embed.html?bbox=${minX},${minY},${maxX},${maxY}&layer=mapnik&marker=${centerLat},${centerLon}`;
    const link = `https://www.openstreetmap.org/?mlat=${centerLat}&mlon=${centerLon}#map=16/${centerLat}/${centerLon}`;

    return { embedUrl: embed, osmLinkUrl: link };
  }, [coords]);

  if (Platform.OS !== 'web') {
    return (
      <View style={[styles.canvas, { width, height }]}>
        <Text style={styles.nativeNotice}>모바일 환경에서는 고해상도 안심 타일 뷰가 표시됩니다.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.canvas, { width, height }]}>
      {/* OpenStreetMap 실시간 대화형 임베드 (iframe) */}
      <iframe
        title="OpenStreetMap Real-time Walk Map"
        src={embedUrl}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          borderRadius: 16,
        }}
        loading="lazy"
      />

      {/* 실시간 실제 맵 뱃지 */}
      <View style={styles.topBadge}>
        <Text style={styles.badgeText}>🗺️ OSM 실시간 실제 지도 (드래그/확대 가능)</Text>
      </View>

      {/* 새 창 크게보기 버튼 */}
      <TouchableOpacity
        style={styles.openExternalBtn}
        activeOpacity={0.8}
        onPress={() => void Linking.openURL(osmLinkUrl)}
      >
        <Text style={styles.openExternalText}>크게보기 ↗</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  canvas: {
    borderRadius: TOKENS.borderRadius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    backgroundColor: '#E8F1EC',
    position: 'relative',
    alignSelf: 'center',
  },
  nativeNotice: {
    color: TOKENS.colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 160,
  },
  topBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: TOKENS.colors.primaryDark,
  },
  openExternalBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(20, 83, 45, 0.9)',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  openExternalText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
