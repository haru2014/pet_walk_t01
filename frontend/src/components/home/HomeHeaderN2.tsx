/**
 * [편안하개 - PetWalk]
 * 디자인 시안 02번 (Dusty Amber & Sage Green) 상단 헤더
 * (docs/reference/UI개선/app_design_n2-1.png 기준)
 *
 * 1. 좌측: 햄버거 메뉴 아이콘 (menu_icon.png)
 * 2. 우측: 원형 알림 종 아이콘 (bell_icon.png, 크림색 서클 배경)
 */

import React from 'react';
import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import menuIconImg from '../../../assets/ui_n2/menu_icon.png';
import bellIconImg from '../../../assets/ui_n2/bell_icon.png';

export interface HomeHeaderN2Props {
  onPressMenu?: () => void;
  onPressNotification?: () => void;
}

export const HomeHeaderN2: React.FC<HomeHeaderN2Props> = ({
  onPressMenu,
  onPressNotification,
}) => {
  return (
    <View style={styles.header}>
      {/* 1. 좌측 햄버거 메뉴 버튼 */}
      <TouchableOpacity
        onPress={onPressMenu}
        style={styles.menuButton}
        activeOpacity={0.7}
        accessibilityLabel="메뉴 열기"
      >
        <Image source={menuIconImg} style={styles.menuIcon} resizeMode="contain" />
      </TouchableOpacity>

      {/* 2. 우측 원형 알림 종 버튼 (Soft Cream 서클) */}
      <TouchableOpacity
        onPress={onPressNotification}
        style={styles.bellButton}
        activeOpacity={0.75}
        accessibilityLabel="알림 확인"
      >
        <Image source={bellIconImg} style={styles.bellIcon} resizeMode="contain" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    backgroundColor: '#5A7361', // Sage Green
  },
  menuButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIcon: {
    width: 24,
    height: 24,
    tintColor: '#FFFFFF',
  },
  bellButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F5EFE0', // Soft Cream
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  bellIcon: {
    width: 20,
    height: 20,
    tintColor: '#2D3A31',
  },
});
