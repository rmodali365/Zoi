import React from 'react';
import { View, StyleSheet, Modal, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Experience } from '@/types';
import { addStopFromPlace } from '@/lib/trips';
import { primaryLocation } from '@/lib/experienceDisplay';
import { getMyTrips } from '@/lib/me';
import { qk } from '@/lib/queryKeys';
import { useBanner } from '@/contexts/BannerContext';
import { AppText } from '@/components/ui/AppText';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

type Props = {
  // The experience being copied into one of your trips; null hides the sheet.
  item: Experience | null;
  onClose: () => void;
};

// "Add to which trip?" bottom sheet: adds `item`'s place to a trip you own as a
// fresh planned stop via addStopFromPlace (place + kind only — the author's
// ranking and take stay theirs, and it's snapped to the right city section of the
// target trip). Used by the Wishlist so a saved place reaches a trip (#57).
export function TripPickerSheet({ item, onClose }: Props) {
  const queryClient = useQueryClient();
  const { show } = useBanner();
  const { data: myTrips = [] } = useQuery({ queryKey: qk.myTrips, queryFn: getMyTrips });

  const addStop = useMutation({
    mutationFn: ({ toTripId }: { toTripId: string }) => {
      const location = primaryLocation(item as Experience);
      if (!location) throw new Error('This place has no location to add.');
      return addStopFromPlace({ tripId: toTripId, location, kind: (item as Experience).kind });
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: qk.trip(vars.toTripId) });
      onClose();
      show({ title: 'Added to your trip', message: 'Saved as a planned stop you can rank later.', icon: 'airplane' });
    },
    onError: (e: unknown) => Alert.alert('Could not add', e instanceof Error ? e.message : 'Try again.'),
  });

  return (
    <Modal visible={!!item} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <AppText variant="title">Add to which trip?</AppText>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
          {myTrips.length === 0 ? (
            <AppText variant="body" color={COLORS.textSecondary} style={styles.empty}>
              You don’t have any trips yet. Start one from the Log tab first.
            </AppText>
          ) : (
            <ScrollView style={styles.list}>
              {myTrips.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={styles.row}
                  onPress={() => addStop.mutate({ toTripId: t.id })}
                  disabled={addStop.isPending}
                  activeOpacity={0.7}
                >
                  <AppText variant="body" weight="semibold">{t.title}</AppText>
                  {!!t.destination && <AppText variant="caption" color={COLORS.textSecondary} style={styles.rowDest}>{t.destination}</AppText>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: COLORS.overlay },
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg,
    padding: SPACING.xl, paddingBottom: SPACING.xxl, gap: SPACING.md, minHeight: 320,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  empty: { lineHeight: 22, paddingVertical: SPACING.md },
  list: { maxHeight: 320 },
  row: {
    paddingVertical: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  rowDest: { marginTop: 1 },
});
