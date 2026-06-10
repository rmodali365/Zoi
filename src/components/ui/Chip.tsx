import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
};

// A pill — used for tags and selectable options. Selected state uses the brand tint.
export function Chip({ label, selected = false, onPress }: Props) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.selected]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
    >
      <AppText variant="subhead" color={selected ? COLORS.brand : COLORS.text} weight="medium">
        {label}
      </AppText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    backgroundColor: COLORS.surface,
  },
  selected: { backgroundColor: COLORS.brandLight, borderColor: COLORS.brand },
});
