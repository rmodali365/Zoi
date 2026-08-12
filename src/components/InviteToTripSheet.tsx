import React, { useState } from 'react';
import {
  View, StyleSheet, Modal, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trip, TripMember, User } from '@/types';
import { searchUsers, UserResult } from '@/lib/follows';
import { inviteToTrip, removeTripMember } from '@/lib/tripMembers';
import { qk } from '@/lib/queryKeys';
import { useBanner } from '@/contexts/BannerContext';
import { AppText } from '@/components/ui/AppText';
import { Avatar } from '@/components/ui/Avatar';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

type Props = {
  visible: boolean;
  trip: Trip | null;
  members: TripMember[];
  // The trip owner's profile, shown at the top of the roster.
  owner?: User;
  // Owners can remove people; members can only invite.
  isOwner: boolean;
  onClose: () => void;
};

// "Who's on this trip?" — the roster plus a people search to invite more (#67).
// Anyone already in the trip can invite; only the owner can remove someone.
// Invitees appear greyed out as "Invited" until they accept, because only a
// joined member can actually write to the itinerary (enforced by RLS).
export function InviteToTripSheet({ visible, trip, members, owner, isOwner, onClose }: Props) {
  const queryClient = useQueryClient();
  const { show } = useBanner();
  const [query, setQuery] = useState('');

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['user-search', query],
    queryFn: () => searchUsers(query),
    enabled: query.trim().length > 0,
  });

  const alreadyIn = new Set([
    ...(owner ? [owner.id] : []),
    ...members.map((m) => m.user_id),
  ]);

  const invite = useMutation({
    mutationFn: (userId: string) => inviteToTrip(trip!.id, [userId]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.trip(trip!.id) });
      setQuery('');
      show({ title: 'Invite sent', message: 'They can add to the itinerary once they accept.', icon: 'people' });
    },
    onError: (e: unknown) => Alert.alert('Could not invite', e instanceof Error ? e.message : 'Try again.'),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => removeTripMember(trip!.id, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.trip(trip!.id) }),
    onError: (e: unknown) => Alert.alert('Could not remove', e instanceof Error ? e.message : 'Try again.'),
  });

  function confirmRemove(member: TripMember) {
    Alert.alert(
      `Remove ${member.user?.name ?? 'this person'}?`,
      'They lose access to the itinerary. Anything they already ranked stays in their own list.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(member.user_id) },
      ],
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <AppText variant="title">On this trip</AppText>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" style={styles.list}>
            {!!owner && (
              <View style={styles.row}>
                <Avatar uri={owner.avatar_url} size={36} />
                <View style={styles.rowBody}>
                  <AppText variant="body" weight="semibold" numberOfLines={1}>{owner.name}</AppText>
                  <AppText variant="caption" color={COLORS.textSecondary}>Created the trip</AppText>
                </View>
              </View>
            )}

            {members.map((m) => (
              <View key={m.user_id} style={styles.row}>
                <Avatar uri={m.user?.avatar_url} size={36} />
                <View style={styles.rowBody}>
                  <AppText variant="body" weight="semibold" numberOfLines={1}>{m.user?.name ?? 'Someone'}</AppText>
                  <AppText variant="caption" color={COLORS.textSecondary}>
                    {m.status === 'joined' ? `@${m.user?.handle ?? '…'}` : 'Invited — not joined yet'}
                  </AppText>
                </View>
                {isOwner && (
                  <TouchableOpacity onPress={() => confirmRemove(m)} hitSlop={8}>
                    <Ionicons name="close-circle-outline" size={22} color={COLORS.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            ))}

            <AppText variant="caption" weight="semibold" color={COLORS.textSecondary} style={styles.sectionLabel}>
              ADD SOMEONE
            </AppText>
            <TextInput
              style={styles.input}
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name or @handle"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {isFetching && <ActivityIndicator color={COLORS.textSecondary} style={styles.spinner} />}

            {results.map((u: UserResult) => {
              const isIn = alreadyIn.has(u.id);
              return (
                <View key={u.id} style={styles.row}>
                  <Avatar uri={u.avatar_url} size={36} />
                  <View style={styles.rowBody}>
                    <AppText variant="body" weight="semibold" numberOfLines={1}>{u.name}</AppText>
                    <AppText variant="caption" color={COLORS.textSecondary}>@{u.handle}</AppText>
                  </View>
                  {isIn ? (
                    <AppText variant="caption" color={COLORS.textMuted}>Already in</AppText>
                  ) : (
                    <TouchableOpacity
                      style={styles.inviteBtn}
                      onPress={() => invite.mutate(u.id)}
                      disabled={invite.isPending}
                      activeOpacity={0.85}
                    >
                      <AppText variant="caption" weight="semibold" color={COLORS.surface}>Invite</AppText>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </ScrollView>
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
    padding: SPACING.xl, paddingBottom: SPACING.xxl, gap: SPACING.md, minHeight: 420,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  list: { maxHeight: 460 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  rowBody: { flex: 1, gap: 1 },
  sectionLabel: { textTransform: 'uppercase', letterSpacing: 0.5, marginTop: SPACING.lg, marginBottom: SPACING.xs },
  input: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: 15, color: COLORS.text,
    backgroundColor: COLORS.surface, minHeight: 48,
  },
  spinner: { paddingVertical: SPACING.md },
  inviteBtn: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full, backgroundColor: COLORS.brand,
  },
});
