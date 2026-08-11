import React from 'react';
import { View, StyleSheet, Modal, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Experience } from '@/types';
import { copyStopToTrip } from '@/lib/trips';
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

// "Add to which trip?" bottom sheet: copies `item` into a trip you own as a fresh
// planned stop via copyStopToTrip (place + note only — the author's ranking and
// take stay theirs). Shared by TripDetail, ExperienceDetail and the Wishlist so
// the inspiration mechanic works wherever an experience is seen (#57/#58).
export function TripPickerSheet({ item, onClose }: Props) {
  const queryClient = useQueryClient();
  const { show } = useBanner();
  const { data: myTrips = [] } = useQuery({ queryKey: qk.myTrips, queryFn: getMyTrips });

  const copyStop = useMutation({
    mutationFn: ({ toTripId }: { toTripId: string }) =>
      copyStopToTrip(item as Experience, toTripId),
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
                  onPress={() => copyStop.mutate({ toTripId: t.id })}
                  disabled={copyStop.isPending}
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
