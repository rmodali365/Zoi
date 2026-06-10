import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, Image, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NavigationProp, RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Experience } from '@/types';
import { TAG_LABELS } from '@/constants/experiences';
import {
  experienceTitle, localityLabel, primaryLocation, sentimentEmoji,
} from '@/lib/experienceDisplay';
import { getTripDetail, groupByCity } from '@/lib/trips';
import { getMyProfile } from '@/lib/me';
import { qk } from '@/lib/queryKeys';
import { COLORS, SPACING, RADIUS, FONT } from '@/constants/theme';

// TripDetail is registered in both the Profile and Experiences stacks, so type
// it structurally (it only needs goBack + the tripId param) rather than against
// one stack's param list.
type Props = {
  navigation: NavigationProp<Record<string, object | undefined>>;
  route: RouteProp<{ TripDetail: { tripId: string } }, 'TripDetail'>;
};

type ViewMode = 'list' | 'map';

function hasCoords(e: Experience): boolean {
  const loc = primaryLocation(e);
  if (!loc) return false;
  const { lat, lng } = loc;
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)
  );
}

// Bounding region framing every pin, with padding so markers aren't on the edge.
function regionForPins(pins: Experience[]): Region | undefined {
  const coords = pins.map(primaryLocation).filter(Boolean) as { lat: number; lng: number }[];
  if (coords.length === 0) return undefined;
  const lats = coords.map((c) => c.lat);
  const lngs = coords.map((c) => c.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.4, 0.05),
    longitudeDelta: Math.max((maxLng - minLng) * 1.4, 0.05),
  };
}

// "Jun 3 – Jun 10, 2026" / "Jun 3, 2026" — tolerant of missing dates.
function formatDates(start: string | null, end: string | null): string {
  const fmt = (s: string) =>
    new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  if (start && end) {
    const s = new Date(start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${s} – ${fmt(end)}`;
  }
  if (start) return fmt(start);
  if (end) return fmt(end);
  return '';
}

export function TripDetailScreen({ navigation, route }: Props) {
  const { tripId } = route.params;
  const [mode, setMode] = useState<ViewMode>('list');

  const { data, isLoading, refetch } = useQuery({
    queryKey: qk.trip(tripId),
    queryFn: () => getTripDetail(tripId),
  });
  const { data: profile } = useQuery({ queryKey: qk.myProfile, queryFn: getMyProfile });

  // Refetch on focus so items added/edited elsewhere show up on return.
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const trip = data?.trip ?? null;
  const items = useMemo(() => data?.items ?? [], [data]);
  const sections = useMemo(() => groupByCity(items), [items]);
  const pins = useMemo(() => items.filter(hasCoords), [items]);
  const region = useMemo(() => regionForPins(pins), [pins]);

  const isOwner = !!profile && !!trip && profile.id === trip.user_id;
  const rankedCount = items.filter((i) => i.status === 'ranked').length;
  const plannedCount = items.length - rankedCount;
  const dates = trip ? formatDates(trip.start_date, trip.end_date) : '';

  function countLine(): string {
    if (items.length === 0) return 'No stops yet';
    const parts = [`${items.length} ${items.length === 1 ? 'stop' : 'stops'}`];
    if (plannedCount > 0) parts.push(`${plannedCount} planned`);
    return parts.join(' · ');
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        {items.length > 0 && (
          <View style={styles.toggle}>
            <TouchableOpacity
              style={[styles.toggleBtn, mode === 'list' && styles.toggleBtnActive]}
              onPress={() => setMode('list')}
              activeOpacity={0.8}
            >
              <Ionicons name="list" size={18} color={mode === 'list' ? COLORS.background : COLORS.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, mode === 'map' && styles.toggleBtnActive]}
              onPress={() => setMode('map')}
              activeOpacity={0.8}
              disabled={pins.length === 0}
            >
              <Ionicons name="map" size={18} color={mode === 'map' ? COLORS.background : COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {isLoading ? (
        <View style={styles.centered}><ActivityIndicator color={COLORS.text} /></View>
      ) : mode === 'map' && region ? (
        <MapView style={styles.map} initialRegion={region}>
          {pins.map((item) => {
            const loc = primaryLocation(item)!;
            return (
              <Marker
                key={item.id}
                coordinate={{ latitude: loc.lat, longitude: loc.lng }}
                title={experienceTitle(item)}
                description={item.status === 'planned' ? 'Planned' : localityLabel(item)}
              />
            );
          })}
        </MapView>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Header */}
          {!!trip?.cover_photo && <Image source={{ uri: trip.cover_photo }} style={styles.cover} />}
          <Text style={styles.title}>{trip?.title ?? 'Trip'}</Text>
          {!!trip?.destination && <Text style={styles.destination}>{trip.destination}</Text>}
          {!!dates && <Text style={styles.dates}>{dates}</Text>}
          <Text style={styles.count}>{countLine()}</Text>

          {items.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>This itinerary is empty</Text>
              <Text style={styles.emptyBody}>
                {isOwner
                  ? 'Add a planned stop or log an experience to start building it.'
                  : 'Nothing here yet.'}
              </Text>
            </View>
          ) : (
            sections.map((section) => (
              <View key={section.city} style={styles.section}>
                <Text style={styles.cityHeader}>{section.city}</Text>
                {section.items.map((item) => (
                  <ItineraryRow key={item.id} item={item} />
                ))}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// One itinerary stop — planned (muted, with optional note) or ranked (sentiment +
// quick take + photo).
function ItineraryRow({ item }: { item: Experience }) {
  const planned = item.status === 'planned';
  const place = localityLabel(item);
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        {planned ? (
          <Ionicons name="ellipse-outline" size={18} color={COLORS.textMuted} />
        ) : (
          <Text style={styles.rowEmoji}>{sentimentEmoji(item.sentiment) || '📍'}</Text>
        )}
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>{experienceTitle(item)}</Text>
        {!!place && <Text style={styles.rowPlace} numberOfLines={1}>{place}</Text>}
        {planned && !!item.note && <Text style={styles.rowNote}>{item.note}</Text>}
        {!planned && !!item.quick_take && <Text style={styles.rowQuote}>“{item.quick_take}”</Text>}
        {!planned && item.tags.length > 0 && (
          <Text style={styles.rowTags} numberOfLines={1}>
            {item.tags.map((t) => TAG_LABELS[t]).join(' · ')}
          </Text>
        )}
      </View>
      {planned ? (
        <View style={styles.plannedPill}><Text style={styles.plannedPillText}>Planned</Text></View>
      ) : item.photos.length > 0 ? (
        <Image source={{ uri: item.photos[0] }} style={styles.thumb} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md,
  },
  back: { fontSize: 16, ...FONT.medium, color: COLORS.accent },
  toggle: {
    flexDirection: 'row', backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.full, padding: 2, gap: 2,
  },
  toggleBtn: { width: 38, height: 32, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center' },
  toggleBtnActive: { backgroundColor: COLORS.text },
  map: { flex: 1 },
  scroll: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxl },
  cover: {
    width: '100%', height: 180, borderRadius: RADIUS.lg,
    backgroundColor: COLORS.border, marginBottom: SPACING.md,
  },
  title: { fontSize: 28, ...FONT.bold, color: COLORS.text, letterSpacing: -0.5 },
  destination: { fontSize: 16, color: COLORS.textSecondary, marginTop: 2 },
  dates: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
  count: { fontSize: 14, color: COLORS.textMuted, marginTop: SPACING.xs, marginBottom: SPACING.lg },
  section: { marginBottom: SPACING.lg },
  cityHeader: {
    fontSize: 13, ...FONT.semibold, color: COLORS.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: SPACING.sm,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, padding: SPACING.sm + 2, marginBottom: SPACING.sm,
  },
  rowIcon: { width: 28, alignItems: 'center', justifyContent: 'center' },
  rowEmoji: { fontSize: 20 },
  rowBody: { flex: 1, gap: 1 },
  rowTitle: { fontSize: 16, ...FONT.semibold, color: COLORS.text },
  rowPlace: { fontSize: 13, color: COLORS.textSecondary },
  rowNote: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  rowQuote: { fontSize: 14, color: COLORS.text, fontStyle: 'italic', marginTop: 2 },
  rowTags: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  thumb: { width: 48, height: 48, borderRadius: RADIUS.sm, backgroundColor: COLORS.border },
  plannedPill: {
    paddingHorizontal: SPACING.sm, paddingVertical: 3,
    borderRadius: RADIUS.full, backgroundColor: COLORS.brandLight,
  },
  plannedPillText: { fontSize: 11, ...FONT.semibold, color: COLORS.brand },
  empty: { paddingTop: SPACING.xxl, alignItems: 'center', gap: SPACING.sm },
  emptyTitle: { fontSize: 17, ...FONT.semibold, color: COLORS.text, textAlign: 'center' },
  emptyBody: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },
});
