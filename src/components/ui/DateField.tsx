import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Modal, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { toDateString, fromDateString, formatDay } from '@/lib/dates';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

type Props = {
  // 'YYYY-MM-DD'; callers default it to today so the user just confirms or changes.
  value: string;
  onChange: (v: string) => void;
  maximumDate?: Date;
  minimumDate?: Date;
};

// Tap-to-pick date row. iOS opens an inline calendar in a bottom sheet; Android
// uses the system date dialog. Value renders as "Today" / "Yesterday" / "Jun 12".
export function DateField({ value, onChange, maximumDate, minimumDate }: Props) {
  const [open, setOpen] = useState(false);

  const picker = (
    <DateTimePicker
      value={fromDateString(value)}
      mode="date"
      display={Platform.OS === 'ios' ? 'inline' : 'default'}
      maximumDate={maximumDate}
      minimumDate={minimumDate}
      accentColor={COLORS.brand}
      themeVariant="light"
      onChange={(event, date) => {
        if (Platform.OS !== 'ios') setOpen(false);
        if (event.type !== 'dismissed' && date) onChange(toDateString(date));
      }}
    />
  );

  return (
    <>
      <TouchableOpacity style={styles.row} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Ionicons name="calendar-outline" size={18} color={COLORS.textSecondary} />
        <AppText variant="body" weight="medium" style={styles.value}>{formatDay(value)}</AppText>
        <Ionicons name="chevron-down" size={16} color={COLORS.textMuted} />
      </TouchableOpacity>

      {Platform.OS === 'ios' ? (
        <Modal visible={open} animationType="fade" transparent onRequestClose={() => setOpen(false)}>
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
            <TouchableOpacity activeOpacity={1} style={styles.sheet}>
              {picker}
              <TouchableOpacity style={styles.doneBtn} onPress={() => setOpen(false)} activeOpacity={0.85}>
                <AppText variant="body" weight="semibold" color={COLORS.surface}>Done</AppText>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      ) : (
        open && picker
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
  },
  value: { flex: 1 },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: COLORS.overlay,
  },
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    padding: SPACING.xl,
    paddingBottom: SPACING.xxl,
    gap: SPACING.md,
  },
  doneBtn: {
    backgroundColor: COLORS.brand,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
});
