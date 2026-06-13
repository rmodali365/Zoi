import React, { useCallback, useMemo, useState } from 'react';
import {
  View, StyleSheet, SafeAreaView, ScrollView, Image, ActivityIndicator,
  TouchableOpacity, RefreshControl,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Experience, ExperiencesStackParamList } from '@/types';
import { TAG_LABELS } from '@/constants/experiences';
import { getSaves, unsaveExperience } from '@/lib/saves';
import { getMyExperiences, getMyTrips } from '@/lib/me';
import { qk } from '@/lib/queryKeys';
import { experienceTitle, localityLabel, sentimentEmoji } from '@/lib/experienceDisplay';
import { TripCard } from '@/components/TripCard';
import { AppText } from '@/components/ui/AppText';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

type ListTab = 'ranked' | 'trips' | 'wishlist';
type RankedView = 'list' | 'map';

type Props = NativeStackScreenProps<ExperiencesStackParamList, 'ExperiencesHome'>;

// A pin only makes sense with real coordinates. Older/edge-case rows can carry
// lat: 0, lng: 0 ("null island") — drop those rather than pinning the Atlantic.
function hasValidCoords(e: Experience): boolean {
  const { lat, lng } = e.location ?? {};
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    !(lat === 0 && lng === 0)
  );
}

// US-ish fallback when the user has no pinnable experiences yet.
const DEFAULT_REGION: Region = {
  latitude: 39.5,
  longitude: -98.35,
  latitudeDelta: 60,
  longitudeDelta: 60,
};

// Bounding region that frames every pin, with padding so markers aren't on the edge.
function regionForPins(pins: Experience[]): Region {
  if (pins.length === 0) return DEFAULT_REGION;

  const lats = pins.map((p) => p.location.lat);
  const lngs = pins.map((p) => p.location.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const latitude = (minLat + maxLat) / 2;
  const longitude = (minLng + maxLng) / 2;
  // 1.4x padding; floor so a single pin (or tightly clustered pins) still zooms sanely.
  const latitudeDelta = Math.max((maxLat - minLat) * 1.4, 0.05);
  const longitudeDelta = Math.max((maxLng - minLng) * 1.4, 0.05);

  return { latitude, longitude, latitudeDelta, longitudeDelta };
}

export function MyListScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<ListTab>('ranked');
  // List vs map only applies to the Ranked tab (your own "everywhere I've been").
  const [rankedView, setRankedView] = useState<RankedView>('list');

  const { data: items = [], isLoading: loadingItems, refetch: refetchItems, isRefetching: refItems } = useQuery({
    queryKey: qk.myExperiences,
    queryFn: getMyExperiences,
  });
  const { data: saved = [], isLoading: loadingSaves, refetch: refetchSaves, isRefetching: refSaves } = useQuery({
    queryKey: qk.saves,
    queryFn: getSaves,
  });
  const { data: trips = [], refetch: refetchTrips, isRefetching: refTrips } = useQuery({
    queryKey: qk.myTrips,
    queryFn: getMyTrips,
  });

  // Reset to the default view (ranked list) when leaving the tab. With caching there's
  // no loading spinner on revisit, so reset on BLUR — the screen stays mounted, so it's
  // already in the default state on return (no flash of the previous view).
  useFocusEffect(
    useCallback(() => () => {
      setTab('ranked');
      setRankedView('list');
    }, []),
  );

  const pins = useMemo(() => items.filter(hasValidCoords), [items]);
  const region = useMemo(() => regionForPins(pins), [pins]);

  // Optimistic unsave; reverts on error.
  const unsave = useMutation({
    mutationFn: (id: string) => unsaveExperience(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: qk.saves });
      const prev = queryClient.getQueryData(qk.saves);
      queryClient.setQueryData(qk.saves, (old: typeof saved | undefined) =>
        (old ?? []).filter((e) => e.id !== id));
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(qk.saves, ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qk.savedIds });
    },
  });

  const onRefresh = useCallback(() => {
    refetchItems();
    refetchSaves();
    refetchTrips();
  }, [refetchItems, refetchSaves, refetchTrips]);

  if (loadingItems && loadingSaves) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator color={COLORS.text} />
      </SafeAreaView>
    );
  }

  const refreshing = refItems || refSaves || refTrips;
  const showMap = tab === 'ranked' && rankedView === 'map';

  const subtitle =
    tab === 'ranked' ? `${items.length} ${items.length === 1 ? 'place' : 'places'} ranked`
    : tab === 'trips' ? `${trips.length} ${trips.length === 1 ? 'trip' : 'trips'}`
    : `${saved.length} ${saved.length === 1 ? 'place' : 'places'} to do`;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <AppText variant="display">Experiences</AppText>
          <AppText variant="body" color={COLORS.textSecondary} style={styles.subtitle}>{subtitle}</AppText>
        </View>
        {/* List/map toggle — only meaningful for your own ranked experiences. */}
        {tab === 'ranked' && (
          <View style={styles.toggle}>
            <TouchableOpacity
              style={[styles.toggleBtn, rankedView === 'list' && styles.toggleBtnActive]}
              onPress={() => setRankedView('list')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="list"
                size={18}
                color={rankedView === 'list' ? COLORS.background : COLORS.textSecondary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, rankedView === 'map' && styles.toggleBtnActive]}
              onPress={() => setRankedView('map')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="map"
                size={18}
                color={rankedView === 'map' ? COLORS.background : COLORS.textSecondary}
              />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Ranked / Want-to-do segmented control */}
      <View style={styles.segment}>
        <TouchableOpacity
          style={[styles.segmentBtn, tab === 'ranked' && styles.segmentBtnActive]}
          onPress={() => setTab('ranked')}
          activeOpacity={0.8}
        >
          <AppText variant="subhead" weight="semibold" color={tab === 'ranked' ? COLORS.background : COLORS.textSecondary}>Ranked</AppText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentBtn, tab === 'trips' && styles.segmentBtnActive]}
          onPress={() => setTab('trips')}
          activeOpacity={0.8}
        >
          <AppText variant="subhead" weight="semibold" color={tab === 'trips' ? COLORS.background : COLORS.textSecondary}>Trips</AppText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentBtn, tab === 'wishlist' && styles.segmentBtnActive]}
          onPress={() => setTab('wishlist')}
          activeOpacity={0.8}
        >
          <AppText variant="subhead" weight="semibold" color={tab === 'wishlist' ? COLORS.background : COLORS.textSecondary}>Want to do</AppText>
        </TouchableOpacity>
      </View>

      {showMap ? (
        <MapView style={styles.map} initialRegion={region}>
          {pins.map((item) => (
            <Marker
              key={item.id}
              coordinate={{ latitude: item.location.lat, longitude: item.location.lng }}
              title={experienceTitle(item)}
              description={localityLabel(item)}
            />
          ))}
        </MapView>
      ) : tab === 'ranked' ? (
        items.length === 0 ? (
          <View style={styles.empty}>
            <AppText variant="headline" style={styles.emptyTitle}>No experiences yet</AppText>
            <AppText variant="body" color={COLORS.textSecondary} style={styles.emptyBody}>Log your first experience to start ranking your taste.</AppText>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.textMuted} />}
          >
            {items.map((item, i) => (
              <View key={item.id} style={styles.row}>
                <View style={styles.rankBadge}>
                  <AppText variant="body" weight="bold" color={COLORS.accent}>{i + 1}</AppText>
                </View>
                <View style={styles.info}>
                  <AppText variant="body" weight="semibold" numberOfLines={1}>
                    {sentimentEmoji(item.sentiment)} {experienceTitle(item)}
                  </AppText>
                  {!!localityLabel(item) && (
                    <AppText variant="caption" color={COLORS.textSecondary} numberOfLines={1} style={styles.place}>{localityLabel(item)}</AppText>
                  )}
                  {item.tags.length > 0 && (
                    <AppText variant="footnote" numberOfLines={1} style={styles.tags}>
                      {item.tags.map((t) => TAG_LABELS[t]).join(' · ')}
                    </AppText>
                  )}
                </View>
                {item.photos.length > 0 && (
                  <Image source={{ uri: item.photos[0] }} style={styles.thumb} />
                )}
              </View>
            ))}
          </ScrollView>
        )
      ) : tab === 'trips' ? (
        trips.length === 0 ? (
          <View style={styles.empty}>
            <AppText variant="headline" style={styles.emptyTitle}>No trips yet</AppText>
            <AppText variant="body" color={COLORS.textSecondary} style={styles.emptyBody}>Start a trip from the Log tab to group experiences into an itinerary.</AppText>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.textMuted} />}
          >
            <View style={styles.tripGrid}>
              {trips.map((trip) => (
                <TripCard
                  key={trip.id}
                  trip={trip}
                  onPress={() => navigation.navigate('TripDetail', { tripId: trip.id })}
                />
              ))}
            </View>
          </ScrollView>
        )
      ) : saved.length === 0 ? (
        <View style={styles.empty}>
          <AppText variant="headline" style={styles.emptyTitle}>Nothing saved yet</AppText>
          <AppText variant="body" color={COLORS.textSecondary} style={styles.emptyBody}>
            Tap the bookmark on a friend's experience to add it to your want-to-do list.
          </AppText>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.textMuted} />}
        >
          {saved.map((item) => (
            <View key={item.id} style={styles.row}>
              {item.photos.length > 0 ? (
                <Image source={{ uri: item.photos[0] }} style={styles.savedThumb} />
              ) : (
                <View style={[styles.savedThumb, styles.savedThumbPlaceholder]}>
                  <AppText style={styles.savedEmoji}>{sentimentEmoji(item.sentiment)}</AppText>
                </View>
              )}
              <View style={styles.info}>
                <AppText variant="body" weight="semibold" numberOfLines={1}>{experienceTitle(item)}</AppText>
                {!!localityLabel(item) && (
                  <AppText variant="caption" color={COLORS.textSecondary} numberOfLines={1} style={styles.place}>{localityLabel(item)}</AppText>
                )}
                {!!item.user && (
                  <AppText variant="caption" color={COLORS.textSecondary} numberOfLines={1} style={styles.place}>
                    {sentimentEmoji(item.sentiment)} from @{item.user.handle}
                  </AppText>
                )}
                {item.tags.length > 0 && (
                  <AppText variant="footnote" numberOfLines={1} style={styles.tags}>
                    {item.tags.map((t) => TAG_LABELS[t]).join(' · ')}
                  </AppText>
                )}
              </View>
              <TouchableOpacity onPress={() => unsave.mutate(item.id)} hitSlop={8} activeOpacity={0.7}>
                <Ionicons name="bookmark" size={22} color={COLORS.accent} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.md,
  },
  headerText: { flex: 1 },
  subtitle: { marginTop: SPACING.xs },
  toggle: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.full,
    padding: 2,
    gap: 2,
  },
  toggleBtn: {
    width: 38, height: 32, borderRadius: RADIUS.full,
    alignItems: 'center', justifyContent: 'center',
  },
  toggleBtnActive: { backgroundColor: COLORS.text },
  map: { flex: 1 },
  segment: {
    flexDirection: 'row',
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.full,
    padding: 3,
    gap: 3,
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: RADIUS.full,
  },
  segmentBtnActive: { backgroundColor: COLORS.text },
  scroll: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxl },
  tripGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: SPACING.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.sm + 2,
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  rankBadge: {
    width: 36, height: 36, borderRadius: RADIUS.full,
    backgroundColor: COLORS.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  info: { flex: 1 },
  place: { marginTop: 1 },
  tags: { marginTop: 2 },
  thumb: { width: 48, height: 48, borderRadius: RADIUS.sm, backgroundColor: COLORS.border },
  savedThumb: { width: 48, height: 48, borderRadius: RADIUS.sm, backgroundColor: COLORS.border },
  savedThumbPlaceholder: {
    backgroundColor: COLORS.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  savedEmoji: { fontSize: 22 },
  empty: { paddingHorizontal: SPACING.xxl, paddingTop: SPACING.xxl, alignItems: 'center', gap: SPACING.sm },
  emptyTitle: { textAlign: 'center' },
  emptyBody: { textAlign: 'center', lineHeight: 22 },
});
