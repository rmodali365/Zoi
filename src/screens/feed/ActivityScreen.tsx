import React, { useCallback, useEffect, useState } from 'react';
import {
  View, StyleSheet, SafeAreaView, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FeedStackParamList } from '@/types';
import { getNotifications, markAllRead, Notification } from '@/lib/notifications';
import { acceptTripInvite, declineTripInvite, getMyTripInvites } from '@/lib/tripMembers';
import { experienceTitle } from '@/lib/experienceDisplay';
import { timeAgo } from '@/lib/dates';
import { qk } from '@/lib/queryKeys';
import { useBanner } from '@/contexts/BannerContext';
import { AppText } from '@/components/ui/AppText';
import { Avatar } from '@/components/ui/Avatar';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<FeedStackParamList, 'Activity'>;
};

// In-app activity (#59): who followed you, who wants to do your experiences.
// Rows come from DB triggers (lib/notifications.ts); opening this screen clears
// the unread badge on the Feed bell.
export function ActivityScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const { show } = useBanner();

  const { data: items = [], isLoading, refetch } = useQuery({
    queryKey: qk.notifications,
    queryFn: getNotifications,
  });

  // Which trip invites are still open — a trip_invite notification sticks around
  // after you answer it, so the Accept/Decline buttons key off this instead.
  const { data: invites = [] } = useQuery({
    queryKey: qk.tripInvites,
    queryFn: getMyTripInvites,
  });
  const openInvites = new Set(invites.map((i) => i.trip_id));

  function afterInviteAnswer(tripId: string) {
    queryClient.invalidateQueries({ queryKey: qk.tripInvites });
    queryClient.invalidateQueries({ queryKey: qk.myTrips });
    queryClient.invalidateQueries({ queryKey: qk.trip(tripId) });
  }

  const accept = useMutation({
    mutationFn: (tripId: string) => acceptTripInvite(tripId),
    onSuccess: (_d, tripId) => {
      afterInviteAnswer(tripId);
      show({ title: 'You’re on the trip', message: 'Add stops to the itinerary any time.', icon: 'airplane' });
    },
    onError: (e: unknown) => Alert.alert('Could not join', e instanceof Error ? e.message : 'Try again.'),
  });

  const decline = useMutation({
    mutationFn: (tripId: string) => declineTripInvite(tripId),
    onSuccess: (_d, tripId) => afterInviteAnswer(tripId),
    onError: (e: unknown) => Alert.alert('Could not decline', e instanceof Error ? e.message : 'Try again.'),
  });

  // Spinner shows only during an explicit pull — not on the background refetch that
  // fires when navigating in, which otherwise leaves it stuck at the top.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  // Clear the badge once the list is up — rows already fetched keep their
  // unread flag, so the highlight still shows on this visit.
  useEffect(() => {
    markAllRead()
      .then(() => queryClient.invalidateQueries({ queryKey: qk.notificationsUnread }))
      .catch(() => {});
  }, [queryClient]);

  function open(n: Notification) {
    if (n.type === 'save' && n.experience_id) {
      navigation.navigate('ExperienceDetail', { experienceId: n.experience_id });
    } else if ((n.type === 'trip_invite' || n.type === 'trip_join') && n.trip_id) {
      // A pending invite has no itinerary access yet, so send them to the
      // inviter's profile rather than a trip they can't act on.
      if (n.type === 'trip_invite' && openInvites.has(n.trip_id)) {
        navigation.navigate('UserProfile', { userId: n.actor_id });
      } else {
        navigation.navigate('TripDetail', { tripId: n.trip_id });
      }
    } else {
      navigation.navigate('UserProfile', { userId: n.actor_id });
    }
  }

  function line(n: Notification): string {
    if (n.type === 'follow') return 'started following you';
    if (n.type === 'trip_invite') {
      return `added you to ${n.trip ? `“${n.trip.title}”` : 'a trip'}`;
    }
    if (n.type === 'trip_join') {
      return `joined ${n.trip ? `“${n.trip.title}”` : 'your trip'}`;
    }
    const what = n.experience ? `“${experienceTitle(n.experience)}”` : 'one of your experiences';
    return `wants to do ${what}`;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <AppText variant="body" weight="medium" color={COLORS.accent}>‹ Back</AppText>
        </TouchableOpacity>
        <AppText variant="body" weight="semibold">Activity</AppText>
        <View style={styles.spacer} />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.text} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.textMuted} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <AppText variant="headline" style={styles.emptyTitle}>Nothing yet</AppText>
              <AppText variant="body" color={COLORS.textSecondary} style={styles.emptyBody}>
                When someone follows you, saves one of your experiences, or adds you to a trip, it shows up here.
              </AppText>
            </View>
          }
          renderItem={({ item }) => {
            const pendingInvite =
              item.type === 'trip_invite' && !!item.trip_id && openInvites.has(item.trip_id);
            return (
              <TouchableOpacity
                style={[styles.row, !item.read && styles.rowUnread]}
                onPress={() => open(item)}
                activeOpacity={0.7}
              >
                <Avatar uri={item.actor?.avatar_url} size={40} />
                <View style={styles.rowBody}>
                  <AppText variant="body">
                    <AppText variant="body" weight="semibold">{item.actor?.name ?? 'Someone'}</AppText>
                    {` ${line(item)}`}
                  </AppText>
                  {pendingInvite && (
                    <View style={styles.inviteActions}>
                      <TouchableOpacity
                        style={styles.acceptBtn}
                        onPress={() => accept.mutate(item.trip_id as string)}
                        disabled={accept.isPending}
                        activeOpacity={0.85}
                      >
                        <AppText variant="caption" weight="semibold" color={COLORS.surface}>Join trip</AppText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => decline.mutate(item.trip_id as string)}
                        disabled={decline.isPending}
                        hitSlop={8}
                      >
                        <AppText variant="caption" weight="semibold" color={COLORS.textSecondary}>Decline</AppText>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
                <AppText variant="caption" color={COLORS.textMuted}>{timeAgo(item.created_at)}</AppText>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md,
  },
  spacer: { width: 50 },
  list: { flexGrow: 1, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxl },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.sm + 2, paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md, marginBottom: 2,
  },
  rowUnread: { backgroundColor: COLORS.brandLight },
  rowBody: { flex: 1 },
  inviteActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginTop: SPACING.xs },
  acceptBtn: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full, backgroundColor: COLORS.brand,
  },
  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: SPACING.xl, gap: SPACING.sm,
  },
  emptyTitle: { textAlign: 'center' },
  emptyBody: { textAlign: 'center', lineHeight: 22 },
});
