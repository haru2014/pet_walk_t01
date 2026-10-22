/**
 * [편안하개 - PetWalk]
 * 앱에서 선택할 수 있는 컬러 테마 정의
 */

export type ThemeId = 'dusty_amber' | 'forest' | 'vivid_violet' | 'dark';

export interface ThemeMeta {
  readonly id: ThemeId;
  readonly name: string;
  readonly description: string;
  readonly previewPrimary: string;
  readonly previewBackground: string;
  readonly previewAccent: string;
  readonly badgeText: string;
}

export const THEME_LIST: readonly ThemeMeta[] = [
  {
    id: 'dusty_amber',
    name: '더스티 앰버 & 세이지 그린',
    description: '따뜻하고 자연 친화적인 세이지 그린과 앰버 테마',
    previewPrimary: '#5A7361',
    previewBackground: '#F5EFE0',
    previewAccent: '#CFA052',
    badgeText: '앰버 & 세이지',
  },
  {
    id: 'forest',
    name: '숲길 그린',
    description: '자연 친화적 에메랄드 & 민트 웰니스 테마',
    previewPrimary: '#10B981',
    previewBackground: '#F8FAF9',
    previewAccent: '#F59E0B',
    badgeText: '숲길',
  },
  {
    id: 'vivid_violet',
    name: '비비드 바이올렛',
    description: '생동감 있는 보라색과 밝은 노란색 테마',
    previewPrimary: '#7C3AED',
    previewBackground: '#F5F3FF',
    previewAccent: '#FACC15',
    badgeText: '바이올렛',
  },
  {
    id: 'dark',
    name: '다크 포켓',
    description: '야간 산책 및 OLED 절전을 위한 모던 다크 테마',
    previewPrimary: '#34D399',
    previewBackground: '#0F172A',
    previewAccent: '#38BDF8',
    badgeText: '야간',
  },
];
