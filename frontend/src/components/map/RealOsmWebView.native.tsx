/**
 * [편안하개 - PetWalk]
 * 모바일(iOS / Android) 전용 OpenStreetMap 대화형 실감 지도 뷰어 (US-C1, Phase 3)
 *
 * react-native-webview를 통해 네이티브 환경에서 OSM 대화형 지도를
 * 확대/축소/스크롤 및 로딩/오류 상태와 함께 안전하게 렌더링합니다.
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, Linking, TouchableOpacity, ActivityIndicator } from 'react-native';
import { AppText as Text } from '../common/AppText';
import { WebView } from 'react-native-webview';
import { TOKENS, TYPOGRAPHY } from '../../theme/tokens';
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

  return (
    <View style={[styles.canvas, { width, height }]}>
      <WebView
        source={{ uri: embedUrl }}
        style={styles.webView}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={TOKENS.colors.primary} />
            <Text style={styles.loadingText}>지도를 불러오고 있어요...</Text>
          </View>
        )}
        renderError={() => (
          <View style={styles.loadingContainer}>
            <Text style={styles.errorText}>지도를 불러올 수 없습니다.</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => void Linking.openURL(osmLinkUrl)}
            >
              <Text style={styles.retryBtnText}>브라우저에서 지도 열기 ↗</Text>
            </TouchableOpacity>
          </View>
        )}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        nestedScrollEnabled={true}
      />

      {/* 실시간 실제 맵 뱃지 */}
      <View style={styles.topBadge} pointerEvents="none">
        <Text style={styles.badgeText}>🗺️ 실제 지도 (움직이거나 확대할 수 있어요)</Text>
      </View>

      {/* 새 창 크게보기 버튼 */}
      <TouchableOpacity
        style={styles.openExternalBtn}
        activeOpacity={0.8}
        onPress={() => void Linking.openURL(osmLinkUrl)}
        accessibilityRole="button"
        accessibilityLabel="지도 크게보기"
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
  webView: {
    flex: 1,
    backgroundColor: '#E8F1EC',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#E8F1EC',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: TYPOGRAPHY.label,
    color: TOKENS.colors.textMuted,
    fontWeight: '500',
  },
  errorText: {
    fontSize: TYPOGRAPHY.label,
    color: TOKENS.colors.routeCaution,
    fontWeight: '600',
    marginBottom: 8,
  },
  retryBtn: {
    backgroundColor: TOKENS.colors.primaryDark,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: TYPOGRAPHY.button,
    fontWeight: '600',
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
    fontSize: TYPOGRAPHY.label,
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
    fontSize: TYPOGRAPHY.caption,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
