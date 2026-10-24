import { TYPOGRAPHY } from '../../theme/tokens';
/**
 * [편안하개 - PetWalk]
 * 메인 카드 강아지 선택 드롭다운 (HomeDogDropdownN2.tsx)
 * 한 손 엄지 조작 최적화: 폭 180dp, 항목 높이 48px 이상
 */

import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { AppText as Text } from '../common/AppText';
import { DogProfile } from '../../types/dogProfile';

export interface HomeDogDropdownN2Props {
  visible: boolean;
  activeDogId: string;
  dogs: readonly DogProfile[];
  onSelectDog: (dogId: string) => void;
  onClose: () => void;
  top?: number;
}

export const HomeDogDropdownN2: React.FC<HomeDogDropdownN2Props> = ({
  visible,
  activeDogId,
  dogs,
  onSelectDog,
  onClose,
  top = 56,
}) => {
  if (!visible || dogs.length <= 1) return null;

  return (
    <View style={[styles.dropdownMenu, { top }]}>
      {dogs.map((d) => {
        const isSelected = d.id === activeDogId;
        return (
          <TouchableOpacity
            key={d.id}
            style={[styles.dropdownItem, isSelected && styles.dropdownItemActive]}
            onPress={() => {
              onSelectDog(d.id);
              onClose();
            }}
            accessibilityLabel={`${d.name} 선택`}
          >
            <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextActive]}>
              {d.name}
            </Text>
            {isSelected && <Text style={styles.dropdownCheck}>✓</Text>}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  dropdownMenu: {
    position: 'absolute',
    top: 56,
    right: 12,
    zIndex: 100,
    width: 180,
    backgroundColor: '#FDFAF4',
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(90, 115, 97, 0.2)',
    overflow: 'hidden',
  },
  dropdownItem: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0, 0, 0, 0.08)',
  },
  dropdownItemActive: {
    backgroundColor: 'rgba(90, 115, 97, 0.08)',
  },
  dropdownItemText: {
    fontSize: TYPOGRAPHY.body,
    fontWeight: '600',
    color: '#2D3A31',
    flex: 1,
  },
  dropdownItemTextActive: {
    fontWeight: '800',
    color: '#5A7361',
  },
  dropdownCheck: {
    fontSize: TYPOGRAPHY.body,
    fontWeight: '800',
    color: '#5A7361',
  },
});
