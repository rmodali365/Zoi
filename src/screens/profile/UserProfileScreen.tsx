import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, Image, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { User, Experience, Trip } from '@/types';
import { SENTIMENT_EMOJI } from '@/constants/experiences';
import { getUserProfile } from '@/lib/users';
import { shareProfile } from '@/lib/share';
import { COLORS, SPACING, FONT, RADIUS } from '@/constants/theme';

const TRIP_CARD = 140;

// Read-only profile for another user. Reachable from the feed author and suggested/find
// people. Nothing inside is interactive in v1.
export function UserProfileScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<{ UserProfile: { userId: string } }, 'UserProfile'>>();
  const { userId } = route.params;

  const [profile, setProfile] = useState<User | null>(null);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getUserProfile(userId)
      .then((data) => {
        if (!active) return;
        setProfile(data.profile);
        setExperiences(data.experiences);
        setTrips(data.trips);
      })
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [userId]);

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
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => shareProfile(userId, profile?.handle)} hitSlop={8}>
          <Ionicons name="share-outline" size={22} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]} />
          )}
          <View style={styles.userInfo}>
            <Text style={styles.name}>{profile?.name ?? 'User'}</Text>
            <Text style={styles.handle}>@{profile?.handle ?? 'handle'}</Text>
          </View>
        </View>

        {/* Experiences — simplified ranked list (read-only) */}
        <Text style={styles.sectionTitle}>
          {experiences.length} {experiences.length === 1 ? 'experience' : 'experiences'}
        </Text>

        {experiences.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyBody}>No experiences yet.</Text>
          </View>
        ) : (
          experiences.map((item, i) => (
            <View key={item.id} style={styles.row}>
              <Text style={styles.rank}>{i + 1}</Text>
              <View style={styles.rowInfo}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {SENTIMENT_EMOJI[item.sentiment]} {item.location.name}
                </Text>
                {!!(item.location.city || item.location.region) && (
                  <Text style={styles.rowPlace} numberOfLines={1}>
                    {[item.location.city, item.location.region].filter(Boolean).join(', ')}
                  </Text>
                )}
              </View>
            </View>
          ))
        )}

        {/* Trips — read-only, not tappable */}
        <Text style={[styles.sectionTitle, styles.tripsTitle]}>Trips</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tripRow}>
          {trips.length === 0 ? (
            <View style={[styles.tripCard, styles.tripPlaceholder]}>
              <Text style={styles.tripPlaceholderText}>No trips yet</Text>
            </View>
          ) : (
            trips.map((trip) => (
              <View key={trip.id} style={styles.tripCard}>
                {trip.cover_photo ? (
                  <Image source={{ uri: trip.cover_photo }} style={styles.tripCover} />
                ) : (
                  <View style={[styles.tripCover, styles.tripCoverPlaceholder]}>
                    <Text style={styles.tripEmoji}>🧳</Text>
                  </View>
                )}
                <Text style={styles.tripTitle} numberOfLines={1}>{trip.title}</Text>
                {!!trip.destination && (
                  <Text style={styles.tripDest} numberOfLines={1}>{trip.destination}</Text>
                )}
              </View>
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
  back: { fontSize: 16, ...FONT.medium, color: COLORS.accent },
  scroll: { paddingBottom: SPACING.xxl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.lg,
    gap: SPACING.md,
  },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.border },
  avatarPlaceholder: { backgroundColor: COLORS.border },
  userInfo: { flex: 1 },
  name: { fontSize: 20, ...FONT.bold, color: COLORS.text },
  handle: { fontSize: 14, color: COLORS.textMuted, marginTop: 2 },
  sectionTitle: {
    fontSize: 13, ...FONT.semibold, color: COLORS.textSecondary,
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
  tripCoverPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.accentLight },
  tripEmoji: { fontSize: 40 },
  tripTitle: { fontSize: 14, ...FONT.semibold, color: COLORS.text },
  tripDest: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  tripPlaceholder: {
    height: TRIP_CARD, borderRadius: RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  tripPlaceholderText: { fontSize: 13, color: COLORS.textMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm + 2,
    gap: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  rank: { fontSize: 15, ...FONT.bold, color: COLORS.textMuted, width: 26, textAlign: 'center' },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 16, ...FONT.medium, color: COLORS.text },
  rowPlace: { fontSize: 13, color: COLORS.textMuted, marginTop: 1 },
  empty: { paddingHorizontal: SPACING.xxl, paddingTop: SPACING.lg, alignItems: 'center' },
  emptyBody: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center' },
});
