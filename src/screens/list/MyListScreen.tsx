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
import { COLORS, SPACING, RADIUS, FONT } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type ListView = 'list' | 'map';

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
  const [view, setView] = useState<ListView>('list');

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('experiences')
      .select('*')
      .eq('user_id', user.id)
      .order('rank_key', { ascending: true });

    setItems((data ?? []) as Experience[]);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  const pins = useMemo(() => items.filter(hasValidCoords), [items]);
  const region = useMemo(() => regionForPins(pins), [pins]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator color={COLORS.text} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>My list</Text>
          <Text style={styles.subtitle}>
            {items.length} {items.length === 1 ? 'place' : 'places'} ranked
          </Text>
        </View>
        <View style={styles.toggle}>
          <TouchableOpacity
            style={[styles.toggleBtn, view === 'list' && styles.toggleBtnActive]}
            onPress={() => setView('list')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="list"
              size={18}
              color={view === 'list' ? COLORS.background : COLORS.textSecondary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, view === 'map' && styles.toggleBtnActive]}
            onPress={() => setView('map')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="map"
              size={18}
              color={view === 'map' ? COLORS.background : COLORS.textSecondary}
            />
          </TouchableOpacity>
        </View>
      </View>

      {view === 'map' ? (
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
      ) : items.length === 0 ? (
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
  tags: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  thumb: { width: 48, height: 48, borderRadius: RADIUS.sm, backgroundColor: COLORS.border },
  empty: { paddingHorizontal: SPACING.xxl, paddingTop: SPACING.xxl, alignItems: 'center', gap: SPACING.sm },
  emptyTitle: { fontSize: 17, ...FONT.semibold, color: COLORS.text, textAlign: 'center' },
  emptyBody: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },
});
