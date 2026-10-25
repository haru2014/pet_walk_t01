/**
 * [편안하개 - PetWalk]
 * OpenFreeMap & MapLibre 벡터 지도 스타일 정의 및 앱 테마 실시간 동기화 모듈
 * (T-OFM-2, docs/08_OpenFreeMap_MapLibre_배경지도_구현계획서.md)
 *
 * 1. OpenFreeMap 공식 3대 벡터 타일 스타일 엔드포인트 정의 (Liberty, Bright, Dark)
 * 2. 앱 테마별 OpenFreeMap 스타일과 경로 팔레트 매핑
 * 3. MapLibre 벡터 레이어용 경로 세그먼트(3색 안심 보행로), 마스킹 원, 마커 컬러 팔레트 제공
 */

import { ThemeId } from '../types/theme';
import { useAppTheme } from '../theme/themeManager';
import { THEME_PALETTES } from '../theme/tokens';

export type OpenFreeMapStyleKey = 'liberty' | 'bright' | 'dark';

/**
 * OpenFreeMap 공식 벡터 타일 스타일 JSON 엔드포인트
 * - liberty: 자연/녹지/공원 디테일이 강조된 오픈스트리트맵 표준 벡터 스타일 (숲길 그린 테마 매칭)
 * - bright: 가독성과 채도가 높은 도심 보행로 고대비 스타일 (비비드 바이올렛 테마 매칭)
 * - dark: 야간 산책 및 OLED 배터리 절전을 위한 딥 다크 벡터 스타일 (다크 포켓 테마 매칭)
 */
export const OPENFREEMAP_STYLES: Record<OpenFreeMapStyleKey, string> = {
  liberty: 'https://tiles.openfreemap.org/styles/liberty',
  bright: 'https://tiles.openfreemap.org/styles/bright',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const;

/**
 * 앱 테마(ThemeId)와 OpenFreeMap 스타일 키 매핑
 */
export const THEME_TO_MAP_STYLE: Record<ThemeId, OpenFreeMapStyleKey> = {
  dusty_amber: 'liberty',
  forest: 'liberty',
  vivid_violet: 'bright',
  dark: 'dark',
  ocean: 'bright',
  coral: 'bright',
} as const;

/**
 * MapLibre LineString / Circle 레이어 렌더링용 테마별 보행로 색상 설정
 */
export interface MapRouteColors {
  readonly safe: string;       // 완만/그늘 안심 구간 (녹색 계열)
  readonly normal: string;     // 일반 보행로 구간 (청색/보라 계열)
  readonly caution: string;    // 급경사/주의 구간 (주황/황색 계열)
  readonly casing: string;     // 도로 라인 외곽 테두리 (가독성용 흰색/다크 외곽선)
  readonly maskCircle: string; // 200m 안심 마스킹 원 색상
  readonly maskBorder: string; // 200m 안심 마스킹 테두리 색상
  readonly startMarker: string;// 출발점 마커 색상
}

export const THEME_MAP_ROUTE_COLORS: Record<ThemeId, MapRouteColors> = {
  dusty_amber: {
    safe: THEME_PALETTES.dusty_amber.routeSafe,
    normal: THEME_PALETTES.dusty_amber.routeNormal,
    caution: THEME_PALETTES.dusty_amber.routeCaution,
    casing: '#FDFAF4',
    maskCircle: 'rgba(90, 115, 97, 0.18)',
    maskBorder: '#3E5244',
    startMarker: '#5A7361',
  },
  forest: {
    safe: THEME_PALETTES.forest.routeSafe,
    normal: THEME_PALETTES.forest.routeNormal,
    caution: THEME_PALETTES.forest.routeCaution,
    casing: '#FFFFFF',
    maskCircle: 'rgba(16, 185, 129, 0.18)',
    maskBorder: '#059669',
    startMarker: '#059669',
  },
  vivid_violet: {
    safe: THEME_PALETTES.vivid_violet.routeSafe,
    normal: THEME_PALETTES.vivid_violet.routeNormal,
    caution: THEME_PALETTES.vivid_violet.routeCaution,
    casing: '#FFFFFF',
    maskCircle: 'rgba(124, 58, 237, 0.18)',
    maskBorder: '#6D28D9',
    startMarker: '#7C3AED',
  },
  dark: {
    safe: THEME_PALETTES.dark.routeSafe,
    normal: THEME_PALETTES.dark.routeNormal,
    caution: THEME_PALETTES.dark.routeCaution,
    casing: '#0F172A',     // 다크 배경 대비선
    maskCircle: 'rgba(52, 211, 153, 0.22)',
    maskBorder: '#34D399',
    startMarker: '#34D399',
  },
  ocean: {
    safe: THEME_PALETTES.ocean.routeSafe,
    normal: THEME_PALETTES.ocean.routeNormal,
    caution: THEME_PALETTES.ocean.routeCaution,
    casing: '#FFFFFF',
    maskCircle: 'rgba(37, 99, 235, 0.18)',
    maskBorder: '#1D4ED8',
    startMarker: '#2563EB',
  },
  coral: {
    safe: THEME_PALETTES.coral.routeSafe,
    normal: THEME_PALETTES.coral.routeNormal,
    caution: THEME_PALETTES.coral.routeCaution,
    casing: '#FFFFFF',
    maskCircle: 'rgba(249, 115, 22, 0.18)',
    maskBorder: '#C2410C',
    startMarker: '#F97316',
  },
} as const;

/**
 * 스타일 키에 해당하는 OpenFreeMap 스타일 URL을 반환합니다.
 */
export function getMapStyleUrl(key: OpenFreeMapStyleKey): string {
  return OPENFREEMAP_STYLES[key] ?? OPENFREEMAP_STYLES.liberty;
}

/**
 * 주어진 앱 테마(ThemeId)에 대응하는 OpenFreeMap 스타일 키를 반환합니다.
 */
export function getMapStyleKeyForTheme(theme: ThemeId): OpenFreeMapStyleKey {
  return THEME_TO_MAP_STYLE[theme] ?? 'liberty';
}

/**
 * 주어진 앱 테마(ThemeId)에 대응하는 최종 OpenFreeMap 스타일 URL을 반환합니다.
 */
export function getMapStyleForTheme(theme: ThemeId): string {
  const key = getMapStyleKeyForTheme(theme);
  return getMapStyleUrl(key);
}

/**
 * 주어진 앱 테마(ThemeId)에 대응하는 지도 보행로 색상 세트를 반환합니다.
 */
export function getMapRouteColors(theme: ThemeId): MapRouteColors {
  return THEME_MAP_ROUTE_COLORS[theme] ?? THEME_MAP_ROUTE_COLORS.forest;
}

/**
 * 현재 활성화된 앱 테마에 따라 실시간으로 OpenFreeMap 스타일과 색상을 제공하는 React Hook
 */
export function useMapThemeStyle() {
  const { theme, colors } = useAppTheme();
  const styleKey = getMapStyleKeyForTheme(theme);
  const mapStyleUrl = getMapStyleUrl(styleKey);
  const routeColors = getMapRouteColors(theme);

  return {
    theme,
    styleKey,
    mapStyleUrl,
    routeColors,
    appColors: colors,
  };
}
