import React, { useEffect, useState } from 'react';
import {
  View, StyleSheet, SafeAreaView, ScrollView, Image, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { User, Experience, Trip } from '@/types';
import { getUserProfile } from '@/lib/users';
import { getMyUserId } from '@/lib/auth';
import { experienceTitle, localityLabel, sentimentEmoji } from '@/lib/experienceDisplay';
import { shareProfile } from '@/lib/share';
import { getFollowCounts, getFollowingIds, followUser, unfollowUser } from '@/lib/follows';
import { queryClient } from '@/lib/queryClient';
import { qk } from '@/lib/queryKeys';
import { AppText } from '@/components/ui/AppText';
import { Avatar } from '@/components/ui/Avatar';
import { FollowButton } from '@/components/ui/FollowButton';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

const TRIP_CARD = 140;

// Profile for another user: browse their ranked list + trips, follow/unfollow,
// share. This is where the shared deep link (zoi://user/<id>) lands, so the
// follow button here closes the share → follow loop (#55).
export function UserProfileScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ UserProfile: { userId: string } }, 'UserProfile'>>();
  const { userId } = route.params;

  const [profile, setProfile] = useState<User | null>(null);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [followPending, setFollowPending] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([getUserProfile(userId), getFollowCounts(userId), getMyUserId(), getFollowingIds()])
      .then(([data, followCounts, me, followingIds]) => {
        if (!active) return;
        setProfile(data.profile);
        setExperiences(data.experiences);
        setTrips(data.trips);
        setCounts(followCounts);
        setMyId(me);
        setFollowing(followingIds.has(userId));
      })
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [userId]);

  async function toggleFollow() {
    const wasFollowing = following;
    setFollowPending(true);
    // Optimistic: flip the button and the follower count together.
    setFollowing(!wasFollowing);
    setCounts((c) => ({ ...c, followers: Math.max(0, c.followers + (wasFollowing ? -1 : 1)) }));
    try {
      if (wasFollowing) await unfollowUser(userId);
      else await followUser(userId);
      // Feed depends on who you follow — refresh it next time it's shown.
      queryClient.invalidateQueries({ queryKey: qk.feed });
    } catch {
      setFollowing(wasFollowing);
      setCounts((c) => ({ ...c, followers: Math.max(0, c.followers + (wasFollowing ? 1 : -1)) }));
    } finally {
      setFollowPending(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator color={COLORS.text} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <AppText variant="body" weight="medium" color={COLORS.accent}>‹ Back</AppText>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => shareProfile(userId, profile?.handle)} hitSlop={8}>
          <Ionicons name="share-outline" size={22} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <Avatar uri={profile?.avatar_url} size={64} />
          <View style={styles.userInfo}>
            <AppText variant="title">{profile?.name ?? 'User'}</AppText>
            <AppText variant="subhead" weight="regular" color={COLORS.textMuted} style={styles.handle}>@{profile?.handle ?? 'handle'}</AppText>
          </View>
          {!!myId && myId !== userId && (
            <FollowButton following={following} onPress={toggleFollow} disabled={followPending} />
          )}
        </View>

        {/* Follower / following counts */}
        <View style={styles.counts}>
          <TouchableOpacity
            style={styles.countItem}
            onPress={() => navigation.navigate('FollowList', { userId, mode: 'followers' })}
            activeOpacity={0.7}
          >
            <AppText variant="body" weight="bold">{counts.followers}</AppText>
            <AppText variant="subhead" weight="regular" color={COLORS.textSecondary}>{counts.followers === 1 ? 'follower' : 'followers'}</AppText>
          </TouchableOpacity>
          <View style={styles.countDivider} />
          <TouchableOpacity
            style={styles.countItem}
            onPress={() => navigation.navigate('FollowList', { userId, mode: 'following' })}
            activeOpacity={0.7}
          >
            <AppText variant="body" weight="bold">{counts.following}</AppText>
            <AppText variant="subhead" weight="regular" color={COLORS.textSecondary}>following</AppText>
          </TouchableOpacity>
        </View>

        {/* Experiences — simplified ranked list (read-only) */}
        <AppText variant="caption" weight="semibold" color={COLORS.textSecondary} style={styles.sectionTitle}>
          {experiences.length} {experiences.length === 1 ? 'experience' : 'experiences'}
        </AppText>

        {experiences.length === 0 ? (
          <View style={styles.empty}>
            <AppText variant="body" color={COLORS.textSecondary} style={styles.emptyBody}>No experiences yet.</AppText>
          </View>
        ) : (
          experiences.map((item, i) => (
            <TouchableOpacity
              key={item.id}
              style={styles.row}
              onPress={() => navigation.navigate('ExperienceDetail', { experienceId: item.id })}
              activeOpacity={0.7}
            >
              <AppText variant="body" weight="bold" color={COLORS.brand} style={styles.rank}>{i + 1}</AppText>
              <View style={styles.rowInfo}>
                <AppText variant="body" weight="medium" numberOfLines={1}>
                  {sentimentEmoji(item.sentiment)} {experienceTitle(item)}
                </AppText>
                {!!localityLabel(item) && (
                  <AppText variant="caption" numberOfLines={1} style={styles.rowPlace}>{localityLabel(item)}</AppText>
                )}
              </View>
              <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          ))
        )}

        {/* Trips — tap to view the itinerary (and save/copy stops from it) */}
        <AppText variant="caption" weight="semibold" color={COLORS.textSecondary} style={[styles.sectionTitle, styles.tripsTitle]}>Trips</AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tripRow}>
          {trips.length === 0 ? (
            <View style={[styles.tripCard, styles.tripPlaceholder]}>
              <AppText variant="caption">No trips yet</AppText>
            </View>
          ) : (
            trips.map((trip) => (
              <TouchableOpacity
                key={trip.id}
                style={styles.tripCard}
                onPress={() => navigation.navigate('TripDetail', { tripId: trip.id })}
                activeOpacity={0.85}
              >
                {trip.cover_photo ? (
                  <Image source={{ uri: trip.cover_photo }} style={styles.tripCover} />
                ) : (
                  <View style={[styles.tripCover, styles.tripCoverPlaceholder]}>
                    <AppText style={styles.tripEmoji}>🧳</AppText>
                  </View>
                )}
                <AppText variant="subhead" weight="semibold" color={COLORS.text} numberOfLines={1}>{trip.title}</AppText>
                {!!trip.destination && (
                  <AppText variant="footnote" numberOfLines={1} style={styles.tripDest}>{trip.destination}</AppText>
                )}
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md,
  },
  scroll: { paddingBottom: SPACING.xxl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.lg,
    gap: SPACING.md,
  },
  userInfo: { flex: 1 },
  handle: { marginTop: 2 },
  counts: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.lg,
    gap: SPACING.lg,
  },
  countItem: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  countDivider: { width: 1, height: 14, backgroundColor: COLORS.border },
  sectionTitle: {
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingHorizontal: SPACING.xl, marginBottom: SPACING.sm,
  },
  tripsTitle: { marginTop: SPACING.lg },
  tripRow: { paddingHorizontal: SPACING.xl, gap: SPACING.sm, marginBottom: SPACING.lg },
  tripCard: { width: TRIP_CARD },
  tripCover: {
    width: TRIP_CARD, height: TRIP_CARD, borderRadius: RADIUS.md,
    backgroundColor: COLORS.border, marginBottom: SPACING.xs,
  },
  tripCoverPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.brandLight },
  tripEmoji: { fontSize: 40 },
  tripDest: { marginTop: 1 },
  tripPlaceholder: {
    height: TRIP_CARD, borderRadius: RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm + 2,
    gap: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  rank: { width: 26, textAlign: 'center' },
  rowInfo: { flex: 1 },
  rowPlace: { marginTop: 1 },
  empty: { paddingHorizontal: SPACING.xxl, paddingTop: SPACING.lg, alignItems: 'center' },
  emptyBody: { textAlign: 'center' },
});
