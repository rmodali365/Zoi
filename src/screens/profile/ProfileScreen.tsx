import React, { useCallback, useRef, useState } from 'react';
import {
  View, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Alert,
  Image, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, NavigationProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { AppTabParamList, ProfileStackParamList } from '@/types';
import { SuggestedUsers } from '@/components/SuggestedUsers';
import { experienceTitle, localityLabel, sentimentEmoji } from '@/lib/experienceDisplay';
import { getMyProfile, getMyExperiences, getMyTrips } from '@/lib/me';
import { qk } from '@/lib/queryKeys';
import { shareProfile } from '@/lib/share';
import { getFollowCounts } from '@/lib/follows';
import { updateAvatar } from '@/lib/users';
import { signOut } from '@/lib/auth';
import { AppText } from '@/components/ui/AppText';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<ProfileStackParamList, 'ProfileHome'>;
};

const TRIP_CARD = 140;

export function ProfileScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const tripsRef = useRef<ScrollView>(null);

  // With caching the screen no longer remounts on focus, so scroll position would
  // persist. Reset it to the top (and the trips strip to the start) on blur.
  useFocusEffect(
    useCallback(() => () => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      tripsRef.current?.scrollTo({ x: 0, animated: false });
    }, []),
  );

  const { data: profile = null, isLoading: l1, refetch: rp, isRefetching: r1 } = useQuery({
    queryKey: qk.myProfile,
    queryFn: getMyProfile,
  });
  const { data: experiences = [], isLoading: l2, refetch: re, isRefetching: r2 } = useQuery({
    queryKey: qk.myExperiences,
    queryFn: getMyExperiences,
  });
  const { data: trips = [], isLoading: l3, refetch: rt, isRefetching: r3 } = useQuery({
    queryKey: qk.myTrips,
    queryFn: getMyTrips,
  });

  const myId = profile?.id ?? null;
  const { data: counts = { followers: 0, following: 0 }, refetch: rc } = useQuery({
    queryKey: ['follow-counts', myId],
    queryFn: () => getFollowCounts(myId as string),
    enabled: !!myId,
  });

  const loading = l1 && l2 && l3;
  const refreshing = r1 || r2 || r3;
  const onRefresh = useCallback(() => { rp(); re(); rt(); rc(); }, [rp, re, rt, rc]);

  async function handlePickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !myId) return;

    setUploading(true);
    try {
      await updateAvatar(myId, result.assets[0].uri);
      queryClient.invalidateQueries({ queryKey: qk.myProfile });
    } catch {
      Alert.alert('Upload failed', 'Could not update your profile picture. Try again.');
    } finally {
      setUploading(false);
    }
  }

  // Trips live in the Experiences tab — tapping one of my trip cards jumps there
  // instead of pushing a second TripDetail copy inside the Profile stack (#48).
  function openTrip(tripId: string) {
    const tabNav = navigation.getParent<NavigationProp<AppTabParamList>>();
    tabNav?.navigate('List', { screen: 'TripDetail', params: { tripId } });
  }

  function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        // RootNavigator's onAuthStateChange switches back to Auth automatically
        onPress: () => { signOut(); },
      },
    ]);
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
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.textMuted} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handlePickAvatar} activeOpacity={0.8}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]} />
            )}
            <View style={styles.cameraBadge}>
              {uploading
                ? <ActivityIndicator size="small" color={COLORS.background} />
                : <Ionicons name="camera" size={14} color={COLORS.background} />}
            </View>
          </TouchableOpacity>

          <View style={styles.userInfo}>
            <AppText variant="title">{profile?.name ?? 'Your Name'}</AppText>
            <AppText variant="subhead" weight="regular" color={COLORS.textMuted} style={styles.handle}>@{profile?.handle ?? 'handle'}</AppText>
          </View>

          <View style={styles.headerActions}>
            {!!profile && (
              <TouchableOpacity
                onPress={() => shareProfile(profile.id, profile.handle)}
                activeOpacity={0.7}
                hitSlop={8}
              >
                <Ionicons name="share-outline" size={22} color={COLORS.text} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => navigation.navigate('EditProfile')}
              activeOpacity={0.7}
              hitSlop={8}
            >
              <Ionicons name="create-outline" size={22} color={COLORS.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSignOut} activeOpacity={0.7} hitSlop={8}>
              <AppText variant="subhead" color={COLORS.textSecondary}>Sign out</AppText>
            </TouchableOpacity>
          </View>
        </View>

        {/* Follower / following counts */}
        {!!myId && (
          <View style={styles.counts}>
            <TouchableOpacity
              style={styles.countItem}
              onPress={() => navigation.navigate('FollowList', { userId: myId, mode: 'followers' })}
              activeOpacity={0.7}
            >
              <AppText variant="body" weight="bold">{counts.followers}</AppText>
              <AppText variant="subhead" weight="regular" color={COLORS.textSecondary}>{counts.followers === 1 ? 'follower' : 'followers'}</AppText>
            </TouchableOpacity>
            <View style={styles.countDivider} />
            <TouchableOpacity
              style={styles.countItem}
              onPress={() => navigation.navigate('FollowList', { userId: myId, mode: 'following' })}
              activeOpacity={0.7}
            >
              <AppText variant="body" weight="bold">{counts.following}</AppText>
              <AppText variant="subhead" weight="regular" color={COLORS.textSecondary}>following</AppText>
            </TouchableOpacity>
          </View>
        )}

        {/* Who to follow */}
        <SuggestedUsers onPressUser={(id) => navigation.navigate('UserProfile', { userId: id })} />

        {/* Experiences — simplified ranked list */}
        <AppText variant="caption" weight="semibold" color={COLORS.textSecondary} style={styles.sectionTitle}>
          {experiences.length} {experiences.length === 1 ? 'experience' : 'experiences'}
        </AppText>

        {experiences.length === 0 ? (
          <View style={styles.empty}>
            <AppText variant="headline" style={styles.emptyTitle}>No experiences yet</AppText>
            <AppText variant="body" color={COLORS.textSecondary} style={styles.emptyBody}>
              Log your first experience to start building your taste profile.
            </AppText>
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

        {/* Trips */}
        <AppText variant="caption" weight="semibold" color={COLORS.textSecondary} style={[styles.sectionTitle, styles.tripsTitle]}>Trips</AppText>
        <ScrollView ref={tripsRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tripRow}>
          {trips.length === 0 ? (
            <View style={[styles.tripCard, styles.tripPlaceholder]}>
              <AppText variant="caption">No trips yet</AppText>
            </View>
          ) : (
            trips.map((trip) => (
              <TouchableOpacity
                key={trip.id}
                style={styles.tripCard}
                onPress={() => openTrip(trip.id)}
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
  scroll: { paddingBottom: SPACING.xxl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    gap: SPACING.md,
  },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.border },
  avatarPlaceholder: { backgroundColor: COLORS.border },
  cameraBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: COLORS.text,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.background,
  },
  userInfo: { flex: 1 },
  handle: { marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
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
  empty: {
    paddingHorizontal: SPACING.xxl,
    paddingTop: SPACING.xl,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  emptyTitle: { textAlign: 'center' },
  emptyBody: { textAlign: 'center', lineHeight: 22 },
});
