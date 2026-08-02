import React, { useState } from 'react';
import {
  View, StyleSheet, SafeAreaView, ScrollView, Image, TouchableOpacity, Alert,
  ActivityIndicator, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { NavigationProp, RouteProp } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TAG_LABELS } from '@/constants/experiences';
import {
  experienceTitle, localityLabel, primaryLocation, sentimentEmoji, sentimentLabel,
} from '@/lib/experienceDisplay';
import { formatDay } from '@/lib/dates';
import { getExperience, deleteExperience } from '@/lib/experiences';
import { getMyProfile } from '@/lib/me';
import { getSavedIds, getSaveCounts, saveExperience, unsaveExperience } from '@/lib/saves';
import { qk } from '@/lib/queryKeys';
import { AppText } from '@/components/ui/AppText';
import { Avatar } from '@/components/ui/Avatar';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

// Registered in the Feed, Experiences and Profile stacks, so it's typed
// structurally (same approach as TripDetailScreen).
type Props = {
  navigation: NavigationProp<Record<string, object | undefined>>;
  route: RouteProp<{ ExperienceDetail: { experienceId: string } }, 'ExperienceDetail'>;
};

const PHOTO_HEIGHT = 300;

// Read-only full view of one experience: every photo (swipeable), place(s), date,
// sentiment + the author's rank position, tags, quick take, trip link and a map pin.
export function ExperienceDetailScreen({ navigation, route }: Props) {
  const { experienceId } = route.params;
  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();
  const [photoIndex, setPhotoIndex] = useState(0);

  const { data: exp, isLoading } = useQuery({
    queryKey: qk.experience(experienceId),
    queryFn: () => getExperience(experienceId),
  });
  const { data: profile } = useQuery({ queryKey: qk.myProfile, queryFn: getMyProfile });
  const { data: savedIds = new Set<string>() } = useQuery({ queryKey: qk.savedIds, queryFn: getSavedIds });

  const isMine = !!exp && !!profile && exp.user_id === profile.id;
  const saved = !!exp && savedIds.has(exp.id);

  // Author-side feedback (#59): how many people saved this to their Want-to-do.
  const { data: saveCounts = {} } = useQuery({
    queryKey: qk.saveCounts([experienceId]),
    queryFn: () => getSaveCounts([experienceId]),
    enabled: isMine,
  });
  const saveCount = saveCounts[experienceId] ?? 0;

  const toggleSave = useMutation({
    mutationFn: () => (saved ? unsaveExperience(experienceId) : saveExperience(experienceId)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.savedIds });
      queryClient.invalidateQueries({ queryKey: qk.saves });
    },
  });

  // Owner delete (#53). Positions are derived from rank_key order and saves cascade
  // in the DB, so invalidating the owner's lists is all the cleanup needed.
  const del = useMutation({
    mutationFn: () => deleteExperience(experienceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.myExperiences });
      queryClient.invalidateQueries({ queryKey: qk.myTrips });
      if (exp?.trip_id) queryClient.invalidateQueries({ queryKey: qk.trip(exp.trip_id) });
      navigation.goBack();
    },
    onError: (e: unknown) =>
      Alert.alert('Could not delete', e instanceof Error ? e.message : 'Try again.'),
  });

  function confirmDelete() {
    Alert.alert(
      'Delete this experience?',
      exp?.trip_id
        ? 'It will leave your ranked list and its trip. This can’t be undone.'
        : 'It will leave your ranked list. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => del.mutate() },
      ],
    );
  }

  function onPhotoScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    setPhotoIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  }

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator color={COLORS.text} />
      </SafeAreaView>
    );
  }

  if (!exp) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
            <AppText variant="body" weight="medium" color={COLORS.accent}>‹ Back</AppText>
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <AppText variant="body" color={COLORS.textSecondary}>This experience is no longer available.</AppText>
        </View>
      </SafeAreaView>
    );
  }

  const author = exp.user;
  const locations = exp.locations?.length ? exp.locations : (exp.location ? [exp.location] : []);
  const pin = primaryLocation(exp);
  const hasPin =
    !!pin && Number.isFinite(pin.lat) && Number.isFinite(pin.lng) && !(pin.lat === 0 && pin.lng === 0);
  const ranked = exp.status === 'ranked';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <AppText variant="body" weight="medium" color={COLORS.accent}>‹ Back</AppText>
        </TouchableOpacity>
        {isMine ? (
          <View style={styles.ownerActions}>
            <TouchableOpacity
              onPress={() => navigation.navigate('EditExperience', { experienceId })}
              hitSlop={8}
              activeOpacity={0.7}
            >
              <Ionicons name="create-outline" size={22} color={COLORS.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={confirmDelete} disabled={del.isPending} hitSlop={8} activeOpacity={0.7}>
              {del.isPending
                ? <ActivityIndicator size="small" color={COLORS.error} />
                : <Ionicons name="trash-outline" size={22} color={COLORS.error} />}
            </TouchableOpacity>
          </View>
        ) : ranked ? (
          <TouchableOpacity onPress={() => toggleSave.mutate()} hitSlop={8} activeOpacity={0.7}>
            <Ionicons
              name={saved ? 'bookmark' : 'bookmark-outline'}
              size={22}
              color={saved ? COLORS.brand : COLORS.text}
            />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Photo carousel */}
        {exp.photos.length > 0 && (
          <View>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onPhotoScroll}
            >
              {exp.photos.map((uri) => (
                <Image key={uri} source={{ uri }} style={[styles.photo, { width }]} />
              ))}
            </ScrollView>
            {exp.photos.length > 1 && (
              <View style={styles.dots}>
                {exp.photos.map((uri, i) => (
                  <View key={uri} style={[styles.dot, i === photoIndex && styles.dotActive]} />
                ))}
              </View>
            )}
          </View>
        )}

        <View style={styles.body}>
          {/* Author */}
          <TouchableOpacity
            style={styles.authorRow}
            onPress={() => navigation.navigate('UserProfile', { userId: exp.user_id })}
            disabled={isMine}
            activeOpacity={0.7}
          >
            <Avatar uri={author?.avatar_url} size={40} />
            <View style={styles.authorInfo}>
              <AppText variant="body" weight="semibold" numberOfLines={1}>
                {isMine ? 'You' : author?.name ?? 'Someone'}
              </AppText>
              <AppText variant="caption" numberOfLines={1}>@{author?.handle ?? '…'}</AppText>
            </View>
            <View style={styles.dateChip}>
              <Ionicons name="calendar-outline" size={13} color={COLORS.textSecondary} />
              <AppText variant="caption" color={COLORS.textSecondary}>{formatDay(exp.experience_date)}</AppText>
            </View>
          </TouchableOpacity>

          {/* Title + place */}
          <AppText variant="display" style={styles.title}>{experienceTitle(exp)}</AppText>
          {!!localityLabel(exp) && (
            <AppText variant="body" color={COLORS.textSecondary}>{localityLabel(exp)}</AppText>
          )}

          {/* Rank strip */}
          {ranked && (
            <View style={styles.rankStrip}>
              <AppText style={styles.rankEmoji}>{sentimentEmoji(exp.sentiment)}</AppText>
              <View style={styles.rankInfo}>
                <AppText variant="body" weight="semibold">{sentimentLabel(exp.sentiment)}</AppText>
                {exp.rankPosition !== null && (
                  <AppText variant="caption" color={COLORS.textSecondary}>
                    {isMine ? 'Your' : `${author?.name ?? 'Their'}’s`} ranking
                  </AppText>
                )}
              </View>
              {exp.rankPosition !== null && (
                <AppText variant="title" color={COLORS.brand}>
                  #{exp.rankPosition}
                  <AppText variant="subhead" weight="regular" color={COLORS.textSecondary}> of {exp.authorTotal}</AppText>
                </AppText>
              )}
            </View>
          )}

          {/* Author-only: aggregate save count (never who) — the reward for posting. */}
          {isMine && saveCount > 0 && (
            <View style={styles.saveCountRow}>
              <Ionicons name="bookmark" size={15} color={COLORS.brand} />
              <AppText variant="subhead" color={COLORS.textSecondary}>
                {saveCount === 1 ? '1 person wants' : `${saveCount} people want`} to do this
              </AppText>
            </View>
          )}

          {/* Quick take */}
          {!!exp.quick_take && (
            <AppText variant="body" style={styles.quote}>“{exp.quick_take}”</AppText>
          )}

          {/* Planned-stop note */}
          {!ranked && !!exp.note && (
            <AppText variant="body" color={COLORS.textSecondary}>📝 {exp.note}</AppText>
          )}

          {/* Tags */}
          {exp.tags.length > 0 && (
            <View style={styles.tags}>
              {exp.tags.map((t) => (
                <View key={t} style={styles.tag}>
                  <AppText variant="footnote" weight="medium" color={COLORS.accent}>{TAG_LABELS[t]}</AppText>
                </View>
              ))}
            </View>
          )}

          {/* All locations, when there's more than one */}
          {locations.length > 1 && (
            <View style={styles.locList}>
              <AppText variant="caption" weight="semibold" color={COLORS.textSecondary} style={styles.sectionLabel}>Stops</AppText>
              {locations.map((loc) => (
                <View key={loc.place_id} style={styles.locRow}>
                  <Ionicons name="location-outline" size={16} color={COLORS.textMuted} />
                  <View style={styles.locInfo}>
                    <AppText variant="body" weight="medium" numberOfLines={1}>{loc.name}</AppText>
                    {!!loc.formattedAddress && (
                      <AppText variant="caption" numberOfLines={1}>{loc.formattedAddress}</AppText>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Trip link */}
          {!!exp.trip && (
            <TouchableOpacity
              style={styles.tripLink}
              onPress={() => navigation.navigate('TripDetail', { tripId: exp.trip!.id })}
              activeOpacity={0.7}
            >
              <AppText variant="body">🧳 Part of <AppText variant="body" weight="semibold">{exp.trip.title}</AppText></AppText>
              <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}

          {/* Map */}
          {hasPin && (
            <View style={styles.mapWrap} pointerEvents="none">
              <MapView
                style={styles.map}
                initialRegion={{
                  latitude: pin.lat,
                  longitude: pin.lng,
                  latitudeDelta: 0.02,
                  longitudeDelta: 0.02,
                }}
              >
                <Marker coordinate={{ latitude: pin.lat, longitude: pin.lng }} />
              </MapView>
            </View>
          )}
        </View>
      </ScrollView>
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
  scroll: { paddingBottom: SPACING.xxl },
  ownerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg },
  photo: { height: PHOTO_HEIGHT, backgroundColor: COLORS.border },
  dots: {
    flexDirection: 'row', justifyContent: 'center', gap: 6,
    position: 'absolute', bottom: SPACING.sm, left: 0, right: 0,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: COLORS.surface, opacity: 0.5,
  },
  dotActive: { opacity: 1 },
  body: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, gap: SPACING.sm },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xs },
  authorInfo: { flex: 1 },
  dateChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.accentLight, borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm + 2, paddingVertical: 4,
  },
  title: { marginTop: SPACING.xs },
  rankStrip: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.brandLight, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 2,
    marginTop: SPACING.xs,
  },
  rankEmoji: { fontSize: 26 },
  rankInfo: { flex: 1 },
  quote: { fontStyle: 'italic', lineHeight: 22 },
  saveCountRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  tag: {
    backgroundColor: COLORS.accentLight, borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm + 2, paddingVertical: 3,
  },
  sectionLabel: { textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: SPACING.xs },
  locList: { marginTop: SPACING.xs },
  locRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.xs + 2,
  },
  locInfo: { flex: 1 },
  tripLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 2,
    marginTop: SPACING.xs,
  },
  mapWrap: {
    borderRadius: RADIUS.md, overflow: 'hidden', marginTop: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border,
  },
  map: { height: 160 },
});
