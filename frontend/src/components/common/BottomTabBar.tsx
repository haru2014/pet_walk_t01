/**
 * [편안하개 - PetWalk]
 * 모바일 하단 5개 탭 내비게이션 바 (BottomTabBar)
 * 
 * 디자인 규격:
 * - 5개 탭: [홈, 산책, (+ 플로팅 FAB), 커뮤니티, 마이]
 * - 중앙 플로팅 버튼: 48x48px 그라디언트 및 -18px 플로팅 마진
 * - 높이: 80px, 배경 #FFFFFF, 상단 보더 #F0F5F2, 그림자
 */

import React from 'react';
import { TOKENS } from '../../theme/tokens';
import { HomeIcon, MapIcon, UsersIcon, UserIcon } from './Icons';

export type TabKey = '홈' | '산책' | '액션' | '커뮤니티' | '마이';

export interface BottomTabBarProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  onActionPress?: () => void;
  style?: React.CSSProperties;
}

export const BottomTabBar: React.FC<BottomTabBarProps> = ({
  activeTab,
  onTabChange,
  onActionPress,
  style,
}) => {
  return (
    <div
      style={{
        height: '80px',
        background: TOKENS.colors.surface,
        borderTop: `1px solid ${TOKENS.colors.border}`,
        display: 'flex',
        alignItems: 'flex-start',
        padding: '10px 8px 0',
        flexShrink: 0,
        boxShadow: '0 -4px 20px rgba(0,0,0,0.05)',
        position: 'relative',
        zIndex: 50,
        ...style,
      }}
    >
      {/* 1. 홈 탭 */}
      <button
        onClick={() => onTabChange('홈')}
        style={tabButtonStyle}
      >
        <HomeIcon active={activeTab === '홈'} />
        <span style={getTabLabelStyle(activeTab === '홈')}>홈</span>
      </button>

      {/* 2. 산책 탭 */}
      <button
        onClick={() => onTabChange('산책')}
        style={tabButtonStyle}
      >
        <MapIcon active={activeTab === '산책'} />
        <span style={getTabLabelStyle(activeTab === '산책')}>산책</span>
      </button>

      {/* 3. 중앙 액션 FAB (+) */}
      <button
        onClick={onActionPress || (() => onTabChange('액션'))}
        style={{
          ...tabButtonStyle,
          paddingTop: 0,
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '16px',
            background: `linear-gradient(135deg, ${TOKENS.colors.primary}, ${TOKENS.colors.primaryDark})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(16,185,129,0.40)',
            marginTop: '-18px',
            transition: 'transform 0.1s ease',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </div>
      </button>

      {/* 4. 커뮤니티 탭 */}
      <button
        onClick={() => onTabChange('커뮤니티')}
        style={tabButtonStyle}
      >
        <UsersIcon active={activeTab === '커뮤니티'} />
        <span style={getTabLabelStyle(activeTab === '커뮤니티')}>커뮤니티</span>
      </button>

      {/* 5. 마이페이지 탭 */}
      <button
        onClick={() => onTabChange('마이')}
        style={tabButtonStyle}
      >
        <UserIcon active={activeTab === '마이'} />
        <span style={getTabLabelStyle(activeTab === '마이')}>마이</span>
      </button>
    </div>
  );
};

const tabButtonStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '4px',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '0',
};

const getTabLabelStyle = (isActive: boolean): React.CSSProperties => ({
  fontSize: '10px',
  fontWeight: isActive ? TOKENS.fontWeight.bold : TOKENS.fontWeight.regular,
  color: isActive ? TOKENS.colors.primary : TOKENS.colors.textMuted,
  letterSpacing: '-0.2px',
});
