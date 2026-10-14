/**
 * UI_design의 공통 선형 아이콘 세트.
 * 크기와 색상을 플랫폼에 관계없이 일정하게 표시하기 위해 SVG를 사용한다.
 */

import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import NativeSvg, {
  Circle as NativeCircle,
  Ellipse as NativeEllipse,
  G as NativeG,
  Line as NativeLine,
  Path as NativePath,
  Polygon as NativePolygon,
  Rect as NativeRect,
} from 'react-native-svg';
import { TOKENS } from '../../theme/tokens';
import { EnvironmentId } from '../../types/walkSettings';

const isWeb = Platform.OS === 'web';

const cleanWebProps = ({ accessible, style, ...props }: any) => {
  const flat = Array.isArray(style) ? StyleSheet.flatten(style) : style;
  return flat ? { style: flat, ...props } : props;
};

// 웹 브라우저 환경에서는 표준 HTML5 SVG 엘리먼트로 렌더링하여 react-native-svg 웹 충돌 방지
const Svg: React.ComponentType<any> = isWeb ? (props: any) => <svg {...cleanWebProps(props)} /> : NativeSvg;
const G: React.ComponentType<any> = isWeb ? (props: any) => <g {...cleanWebProps(props)} /> : NativeG;
const Path: React.ComponentType<any> = isWeb ? (props: any) => <path {...cleanWebProps(props)} /> : NativePath;
const Circle: React.ComponentType<any> = isWeb ? (props: any) => <circle {...cleanWebProps(props)} /> : NativeCircle;
const Ellipse: React.ComponentType<any> = isWeb ? (props: any) => <ellipse {...cleanWebProps(props)} /> : NativeEllipse;
const Line: React.ComponentType<any> = isWeb ? (props: any) => <line {...cleanWebProps(props)} /> : NativeLine;
const Polygon: React.ComponentType<any> = isWeb ? (props: any) => <polygon {...cleanWebProps(props)} /> : NativePolygon;
const Rect: React.ComponentType<any> = isWeb ? (props: any) => <rect {...cleanWebProps(props)} /> : NativeRect;

export type AppIconName =
  | EnvironmentId
  | 'home'
  | 'map'
  | 'users'
  | 'user'
  | 'paw'
  | 'pawOutline'
  | 'plus'
  | 'back'
  | 'chevronRight'
  | 'sparkle'
  | 'mountain'
  | 'location'
  | 'lock'
  | 'shield'
  | 'sun'
  | 'star'
  | 'heart'
  | 'clock'
  | 'volume'
  | 'volumeMute'
  | 'water'
  | 'mic'
  | 'trash'
  | 'globe'
  | 'ruler'
  | 'edit'
  | 'speed';

export interface AppIconProps {
  readonly name: AppIconName;
  readonly size?: number;
  readonly color?: string;
  readonly strokeWidth?: number;
  readonly filled?: boolean;
}

const isEnvironmentId = (name: AppIconName): name is EnvironmentId =>
  name === 'soft' || name === 'shade' || name === 'stairs' || name === 'traffic' || name === 'quiet' || name === 'rest';

const renderEnvironmentShape = (name: EnvironmentId): React.ReactNode => {
  switch (name) {
    case 'soft':
      return <><Ellipse cx="5" cy="7" rx="1.4" ry="2" /><Ellipse cx="10" cy="4.5" rx="1.4" ry="2" /><Ellipse cx="15" cy="4.5" rx="1.4" ry="2" /><Ellipse cx="20" cy="7" rx="1.4" ry="2" /><Path d="M12.5 11c-2 0-3 1.8-4.5 3.2-1.2 1.1-2.4 2-2.4 3.6A3.2 3.2 0 0 0 8.8 21c1.3 0 2.2-.8 3.7-.8s2.4.8 3.7.8a3.2 3.2 0 0 0 3.2-3.2c0-1.6-1.2-2.5-2.4-3.6C15.5 12.8 14.5 11 12.5 11Z" /></>;
    case 'shade':
      return <><Path d="M12 3a7 7 0 0 0-7 7c-1.7 0-3 1.3-3 3s1.3 3 3 3h14c1.7 0 3-1.3 3-3s-1.3-3-3-3a7 7 0 0 0-7-7Z" /><Path d="M12 16v6m-3 0h6" /></>;
    case 'stairs':
      return <><Path d="M2 20h5v-5h5v-5h5V5h5" /><Path d="m3 4 18 18" /></>;
    case 'traffic':
      return <><Path d="m5 11 1.5-5A2 2 0 0 1 8.4 4h7.2a2 2 0 0 1 1.9 2L19 11M5 11h14a2 2 0 0 1 2 2v5H3v-5a2 2 0 0 1 2-2Z" /><Path d="M6 18v2m12-2v2M7 14h2m6 0h2" /></>;
    case 'quiet':
      return <><Path d="M20 4C9 4 4 9 4 16a4 4 0 0 0 4 4c7 0 12-5 12-16Z" /><Path d="M5 19c3-4 6-7 11-10" /></>;
    case 'rest':
      return <><Path d="M5 12h14v4H5zM7 16v5m10-5v5M5 12V8m14 4V8M8 8h8" /><Path d="M12 2v2m-3-1 1 1m5-1-1 1" /></>;
  }
};

export const AppIcon: React.FC<AppIconProps> = ({
  name,
  size = 20,
  color = TOKENS.colors.textMuted,
  strokeWidth = 1.8,
  filled = false,
}) => {
  const common = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  let shape: React.ReactNode;

  if (isEnvironmentId(name)) {
    shape = renderEnvironmentShape(name);
  } else {
    switch (name) {
      case 'home':
        shape = <><Path d="M3 9 12 2l9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><Path d="M9 22V12h6v10" /></>;
        break;
      case 'map':
        shape = <><Polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" /><Line x1="9" y1="3" x2="9" y2="18" /><Line x1="15" y1="6" x2="15" y2="21" /></>;
        break;
      case 'users':
        shape = <><Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><Circle cx="9" cy="7" r="4" /><Path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>;
        break;
      case 'user':
        shape = <><Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><Circle cx="12" cy="7" r="4" /></>;
        break;
      case 'paw':
      case 'pawOutline':
        shape = <><Ellipse cx="5" cy="6" rx="2" ry="2.5" /><Ellipse cx="9.5" cy="3.5" rx="2" ry="2.5" /><Ellipse cx="14.5" cy="3.5" rx="2" ry="2.5" /><Ellipse cx="19" cy="6" rx="2" ry="2.5" /><Path d="M12 22c-4 0-8-3-8-7 0-2 1.5-3.5 3.5-4.5 1-.5 2-1.5 2.5-2 .5-.5 1-1 2-1s1.5.5 2 1c.5.5 1.5 1.5 2.5 2C18.5 11.5 20 13 20 15c0 4-4 7-8 7z" /></>;
        break;
      case 'plus':
        shape = <><Line x1="12" y1="5" x2="12" y2="19" /><Line x1="5" y1="12" x2="19" y2="12" /></>;
        break;
      case 'back':
        shape = <Path d="m15 18-6-6 6-6" />;
        break;
      case 'chevronRight':
        shape = <Path d="m9 18 6-6-6-6" />;
        break;
      case 'sparkle':
        shape = <><Path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><Path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" /></>;
        break;
      case 'mountain':
        shape = <><Path d="m3 20 7-14 4 8 2-4 5 10H3Z" /><Path d="m8 10 2 2 2-2" /></>;
        break;
      case 'location':
        shape = <><Path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><Circle cx="12" cy="10" r="2.5" /></>;
        break;
      case 'lock':
        shape = <><Rect x="4" y="10" width="16" height="11" rx="2" /><Path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>;
        break;
      case 'shield':
        shape = <><Path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><Path d="m9 12 2 2 4-4" /></>;
        break;
      case 'sun':
        shape = <><Circle cx="12" cy="12" r="4" /><Path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>;
        break;
      case 'star':
        shape = <Path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" fill={filled ? color : 'none'} />;
        break;
      case 'heart':
        shape = <Path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" fill={filled ? color : 'none'} />;
        break;
      case 'clock':
        shape = <><Circle cx="12" cy="12" r="9" /><Path d="M12 7v5l3 2" /></>;
        break;
      case 'volume':
        shape = <><Path d="M11 5 6 9H3v6h3l5 4V5Z" /><Path d="M15.5 8.5a5 5 0 0 1 0 7m3-10a9 9 0 0 1 0 13" /></>;
        break;
      case 'volumeMute':
        shape = <><Path d="M11 5 6 9H3v6h3l5 4V5Z" /><Line x1="22" y1="9" x2="16" y2="15" /><Line x1="16" y1="9" x2="22" y2="15" /></>;
        break;
      case 'water':
        shape = <><Path d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11Z" /><Path d="M9 15a3 3 0 0 0 3 3" /></>;
        break;
      case 'mic':
        shape = <><Rect x="9" y="2" width="6" height="12" rx="3" /><Path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8" /></>;
        break;
      case 'trash':
        shape = <Path d="M3 6h18m-2 0-.9 14H5.9L5 6m4 0V4h6v2m-5 4v6m4-6v6" />;
        break;
      case 'globe':
        shape = <><Circle cx="12" cy="12" r="9" /><Path d="M3 12h18M12 3a15 15 0 0 1 0 18m0-18a15 15 0 0 0 0 18" /></>;
        break;
      case 'ruler':
        shape = <><Path d="m4 16 12-12 4 4L8 20H4v-4Z" /><Path d="m13 7 4 4m-7-1 2 2m-5 1 2 2" /></>;
        break;
      case 'edit':
        shape = <><Path d="m12 20 9-9-4-4-9 9-1 5 5-1Z" /><Path d="m15 8 4 4M4 20h4" /></>;
        break;
      case 'speed':
        shape = <><Path d="M4 18a9 9 0 1 1 16 0" /><Path d="m12 13 4-4m-4 4-2 5" /><Path d="M5 18h14" /></>;
        break;
    }
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessible={false}>
      <G {...common} fill={name === 'paw' || filled ? color : 'none'}>
        {shape}
      </G>
    </Svg>
  );
};
