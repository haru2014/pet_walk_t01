/**
 * [편안하개 - PetWalk]
 * 공통 SVG 아이콘 컴포넌트 모음
 * UI_design/src/App.tsx의 디자인 에셋 1:1 포팅
 */

import React from 'react';
import { TOKENS } from '../../theme/tokens';

interface IconProps {
  size?: number;
  color?: string;
  active?: boolean;
}

/** 발자국 아이콘 (브랜드 심볼) */
export const PawIcon: React.FC<IconProps> = ({ size = 26, color = '#FFFFFF' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth="0.5">
    <ellipse cx="5" cy="6" rx="2" ry="2.5" />
    <ellipse cx="9.5" cy="3.5" rx="2" ry="2.5" />
    <ellipse cx="14.5" cy="3.5" rx="2" ry="2.5" />
    <ellipse cx="19" cy="6" rx="2" ry="2.5" />
    <path d="M12 22c-4 0-8-3-8-7 0-2 1.5-3.5 3.5-4.5 1-.5 2-1.5 2.5-2 .5-.5 1-1 2-1s1.5.5 2 1c.5.5 1.5 1.5 2.5 2C18.5 11.5 20 13 20 15c0 4-4 7-8 7z" />
  </svg>
);

/** 알림 벨 아이콘 */
export const BellIcon: React.FC<IconProps> = ({ size = 22, color = TOKENS.colors.textMain }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

/** 더보기 점 3개 아이콘 */
export const MoreIcon: React.FC<IconProps> = ({ size = 22, color = TOKENS.colors.textMain }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
  </svg>
);

/** 우측 화살표 아이콘 */
export const ArrowRightIcon: React.FC<IconProps> = ({ size = 18, color = TOKENS.colors.textMuted }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18l6-6-6-6" />
  </svg>
);

/** 하단 탭 - 홈 아이콘 */
export const HomeIcon: React.FC<IconProps> = ({ size = 22, active = false }) => {
  const strokeColor = active ? TOKENS.colors.primary : TOKENS.colors.textMuted;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
};

/** 하단 탭 - 지도/산책 아이콘 */
export const MapIcon: React.FC<IconProps> = ({ size = 22, active = false }) => {
  const strokeColor = active ? TOKENS.colors.primary : TOKENS.colors.textMuted;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </svg>
  );
};

/** 하단 탭 - 커뮤니티 아이콘 */
export const UsersIcon: React.FC<IconProps> = ({ size = 22, active = false }) => {
  const strokeColor = active ? TOKENS.colors.primary : TOKENS.colors.textMuted;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
};

/** 하단 탭 - 마이페이지 아이콘 */
export const UserIcon: React.FC<IconProps> = ({ size = 22, active = false }) => {
  const strokeColor = active ? TOKENS.colors.primary : TOKENS.colors.textMuted;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
};
