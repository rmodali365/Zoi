import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, Image, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { ProfileStackParamList, Trip, Experience } from '@/types';
import { SENTIMENT_EMOJI, TAG_LABELS } from '@/constants/experiences';
import { supabase } from '@/lib/supabase';
import { COLORS, SPACING, RADIUS, FONT } from '@/constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<ProfileStackParamList, 'TripDetail'>;
  route: RouteProp<ProfileStackParamList, 'TripDetail'>;
};

export function TripDetailScreen({ navigation, route }: Props) {
  const { tripId } = route.params;
  const [trip, setTrip] = useState<Trip | null>(null);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data: t }, { data: exps }] = await Promise.all([
      supabase.from('trips').select('*').eq('id', tripId).maybeSingle(),
      supabase.from('experiences').select('*').eq('trip_id', tripId).order('rank_key', { ascending: true }),
    ]);
    setTrip((t as Trip) ?? null);
    setExperiences((exps ?? []) as Experience[]);
    setLoading(false);
  }, [tripId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={COLORS.text} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>{trip?.title ?? 'Trip'}</Text>
          {!!trip?.destination && <Text style={styles.destination}>{trip.destination}</Text>}
          <Text style={styles.count}>
            {experiences.length} {experiences.length === 1 ? 'experience' : 'experiences'}
          </Text>

          {experiences.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No experiences in this trip yet</Text>
              <Text style={styles.emptyBody}>Log an experience and add it to this trip.</Text>
            </View>
          ) : (
            experiences.map((item) => (
              <View key={item.id} style={styles.card}>
                {item.photos.length > 0 && (
                  <Image source={{ uri: item.photos[0] }} style={styles.photo} />
                )}
                <View style={styles.cardBody}>
                  <Text style={styles.name}>
                    {SENTIMENT_EMOJI[item.sentiment]} {item.location.name}
                  </Text>
                  {!!(item.location.city || item.location.region) && (
                    <Text style={styles.place}>
                      {[item.location.city, item.location.region].filter(Boolean).join(', ')}
                    </Text>
                  )}
                  {!!item.quick_take && <Text style={styles.quote}>“{item.quick_take}”</Text>}
                  {item.tags.length > 0 && (
                    <Text style={styles.tags}>{item.tags.map((t) => TAG_LABELS[t]).join(' · ')}</Text>
                  )}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md },
  back: { fontSize: 16, ...FONT.medium, color: COLORS.accent },
  scroll: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxl },
  title: { fontSize: 28, ...FONT.bold, color: COLORS.text, letterSpacing: -0.5 },
  destination: { fontSize: 16, color: COLORS.textSecondary, marginTop: 2 },
  count: { fontSize: 14, color: COLORS.textMuted, marginTop: SPACING.xs, marginBottom: SPACING.lg },
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
    overflow: 'hidden',
  },
  photo: { width: '100%', height: 160, backgroundColor: COLORS.border },
  cardBody: { padding: SPACING.md, gap: SPACING.xs },
  name: { fontSize: 17, ...FONT.semibold, color: COLORS.text },
  place: { fontSize: 14, color: COLORS.textSecondary },
  quote: { fontSize: 15, color: COLORS.text, fontStyle: 'italic', lineHeight: 21 },
  tags: { fontSize: 12, color: COLORS.textMuted },
  empty: { paddingTop: SPACING.xxl, alignItems: 'center', gap: SPACING.sm },
  emptyTitle: { fontSize: 17, ...FONT.semibold, color: COLORS.text, textAlign: 'center' },
  emptyBody: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },
});
