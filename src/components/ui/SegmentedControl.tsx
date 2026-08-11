import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { haptics } from '@/lib/haptics';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

type Segment<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
};

// Brand-accented segmented control (e.g. My List's Ranked / Want-to-do).
export function SegmentedControl<T extends string>({ segments, value, onChange }: Props<T>) {
  return (
    <View style={styles.wrap}>
      {segments.map((s) => {
        const active = s.value === value;
        return (
          <TouchableOpacity
            key={s.value}
            style={[styles.segment, active && styles.segmentActive]}
            onPress={() => { if (s.value !== value) haptics.select(); onChange(s.value); }}
            activeOpacity={0.8}
          >
            <AppText variant="subhead" weight="semibold" color={active ? COLORS.surface : COLORS.textSecondary}>
              {s.label}
            </AppText>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.full,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: RADIUS.full,
  },
  segmentActive: { backgroundColor: COLORS.brand },
});
