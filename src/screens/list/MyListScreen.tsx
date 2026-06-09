import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, Image, ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Experience } from '@/types';
import { SENTIMENT_EMOJI, TAG_LABELS } from '@/constants/experiences';
import { getSaves, unsaveExperience, SavedExperience } from '@/lib/saves';
import { COLORS, SPACING, RADIUS, FONT } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type ListTab = 'ranked' | 'wishlist';
type RankedView = 'list' | 'map';

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

export function MyListScreen() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Experience[]>([]);
  const [saved, setSaved] = useState<SavedExperience[]>([]);
  const [tab, setTab] = useState<ListTab>('ranked');
  // List vs map only applies to the Ranked tab (your own "everywhere I've been").
  const [rankedView, setRankedView] = useState<RankedView>('list');

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const [{ data }, savedRows] = await Promise.all([
      supabase
        .from('experiences')
        .select('*')
        .eq('user_id', user.id)
        .order('rank_key', { ascending: true }),
      getSaves().catch(() => [] as SavedExperience[]),
    ]);

    setItems((data ?? []) as Experience[]);
    setSaved(savedRows);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Reset to the default view on every focus so returning to this tab always
      // lands on the ranked list (not the map / want-to-do). Runs behind the
      // loading spinner, so there's no flash of the previous view.
      setTab('ranked');
      setRankedView('list');
      setLoading(true);
      load();
    }, [load]),
  );

  const pins = useMemo(() => items.filter(hasValidCoords), [items]);
  const region = useMemo(() => regionForPins(pins), [pins]);

  async function handleUnsave(id: string) {
    const prev = saved;
    setSaved((s) => s.filter((e) => e.id !== id)); // optimistic
    try {
      await unsaveExperience(id);
    } catch {
      setSaved(prev); // revert on failure
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator color={COLORS.text} />
      </SafeAreaView>
    );
  }

  const showMap = tab === 'ranked' && rankedView === 'map';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>My list</Text>
          <Text style={styles.subtitle}>
            {tab === 'ranked'
              ? `${items.length} ${items.length === 1 ? 'place' : 'places'} ranked`
              : `${saved.length} ${saved.length === 1 ? 'place' : 'places'} to do`}
          </Text>
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
          <Text style={[styles.segmentText, tab === 'ranked' && styles.segmentTextActive]}>Ranked</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentBtn, tab === 'wishlist' && styles.segmentBtnActive]}
          onPress={() => setTab('wishlist')}
          activeOpacity={0.8}
        >
          <Text style={[styles.segmentText, tab === 'wishlist' && styles.segmentTextActive]}>Want to do</Text>
        </TouchableOpacity>
      </View>

      {showMap ? (
        <MapView style={styles.map} initialRegion={region}>
          {pins.map((item) => (
            <Marker
              key={item.id}
              coordinate={{ latitude: item.location.lat, longitude: item.location.lng }}
              title={item.location.name}
              description={[item.location.city, item.location.region].filter(Boolean).join(', ')}
            />
          ))}
        </MapView>
      ) : tab === 'ranked' ? (
        items.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No experiences yet</Text>
            <Text style={styles.emptyBody}>Log your first experience to start ranking your taste.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {items.map((item, i) => (
              <View key={item.id} style={styles.row}>
                <View style={styles.rankBadge}>
                  <Text style={styles.rankText}>{i + 1}</Text>
                </View>
                <View style={styles.info}>
                  <Text style={styles.name} numberOfLines={1}>
                    {SENTIMENT_EMOJI[item.sentiment]} {item.location.name}
                  </Text>
                  {!!(item.location.city || item.location.region) && (
                    <Text style={styles.place} numberOfLines={1}>
                      {[item.location.city, item.location.region].filter(Boolean).join(', ')}
                    </Text>
                  )}
                  {item.tags.length > 0 && (
                    <Text style={styles.tags} numberOfLines={1}>
                      {item.tags.map((t) => TAG_LABELS[t]).join(' · ')}
                    </Text>
                  )}
                </View>
                {item.photos.length > 0 && (
                  <Image source={{ uri: item.photos[0] }} style={styles.thumb} />
                )}
              </View>
            ))}
          </ScrollView>
        )
      ) : saved.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing saved yet</Text>
          <Text style={styles.emptyBody}>
            Tap the bookmark on a friend's experience to add it to your want-to-do list.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {saved.map((item) => (
            <View key={item.id} style={styles.row}>
              {item.photos.length > 0 ? (
                <Image source={{ uri: item.photos[0] }} style={styles.savedThumb} />
              ) : (
                <View style={[styles.savedThumb, styles.savedThumbPlaceholder]}>
                  <Text style={styles.savedEmoji}>{SENTIMENT_EMOJI[item.sentiment]}</Text>
                </View>
              )}
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>{item.location.name}</Text>
                {!!(item.location.city || item.location.region) && (
                  <Text style={styles.place} numberOfLines={1}>
                    {[item.location.city, item.location.region].filter(Boolean).join(', ')}
                  </Text>
                )}
                {!!item.user && (
                  <Text style={styles.savedBy} numberOfLines={1}>
                    {SENTIMENT_EMOJI[item.sentiment]} from @{item.user.handle}
                  </Text>
                )}
                {item.tags.length > 0 && (
                  <Text style={styles.tags} numberOfLines={1}>
                    {item.tags.map((t) => TAG_LABELS[t]).join(' · ')}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => handleUnsave(item.id)} hitSlop={8} activeOpacity={0.7}>
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
  title: { fontSize: 28, ...FONT.bold, color: COLORS.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: COLORS.textSecondary, marginTop: SPACING.xs },
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
  segmentText: { fontSize: 14, ...FONT.semibold, color: COLORS.textSecondary },
  segmentTextActive: { color: COLORS.background },
  scroll: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxl },
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
  rankText: { fontSize: 16, ...FONT.bold, color: COLORS.accent },
  info: { flex: 1 },
  name: { fontSize: 16, ...FONT.semibold, color: COLORS.text },
  place: { fontSize: 13, color: COLORS.textSecondary, marginTop: 1 },
  savedBy: { fontSize: 13, color: COLORS.textSecondary, marginTop: 1 },
  tags: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  thumb: { width: 48, height: 48, borderRadius: RADIUS.sm, backgroundColor: COLORS.border },
  savedThumb: { width: 48, height: 48, borderRadius: RADIUS.sm, backgroundColor: COLORS.border },
  savedThumbPlaceholder: {
    backgroundColor: COLORS.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  savedEmoji: { fontSize: 22 },
  empty: { paddingHorizontal: SPACING.xxl, paddingTop: SPACING.xxl, alignItems: 'center', gap: SPACING.sm },
  emptyTitle: { fontSize: 17, ...FONT.semibold, color: COLORS.text, textAlign: 'center' },
  emptyBody: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },
});
