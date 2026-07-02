import React from 'react';
import { View, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FeedTrip } from '@/lib/feed';
import { AppText } from '@/components/ui/AppText';
import { Avatar } from '@/components/ui/Avatar';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

type Props = {
  trip: FeedTrip;
  onPress: () => void;
  onPressAuthor?: () => void;
};

// Feed card for a followed user's trip — cover, itinerary summary, tap to browse
// (and borrow from) the full itinerary.
export function TripFeedCard({ trip, onPress, onPressAuthor }: Props) {
  const author = trip.user;

  const meta: string[] = [`${trip.stopCount} ${trip.stopCount === 1 ? 'stop' : 'stops'}`];
  if (trip.cities.length > 0) {
    meta.push(trip.cities.length === 1 ? trip.cities[0] : `${trip.cities.length} cities`);
  }
  if (trip.plannedCount > 0) meta.push(`${trip.plannedCount} planned`);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.9}>
      {/* Author */}
      <TouchableOpacity
        style={styles.head}
        onPress={onPressAuthor}
        disabled={!onPressAuthor}
        activeOpacity={0.7}
      >
        <Avatar uri={author?.avatar_url} size={36} />
        <View style={styles.headInfo}>
          <AppText variant="body" weight="semibold" numberOfLines={1}>{author?.name ?? 'Someone'}</AppText>
          <AppText variant="caption" numberOfLines={1}>shared a trip</AppText>
        </View>
        <Ionicons name="airplane-outline" size={18} color={COLORS.textMuted} />
      </TouchableOpacity>

      {/* Cover */}
      {trip.cover_photo ? (
        <Image source={{ uri: trip.cover_photo }} style={styles.cover} />
      ) : (
        <View style={[styles.cover, styles.coverPlaceholder]}>
          <AppText style={styles.coverEmoji}>🧳</AppText>
        </View>
      )}

      {/* Body */}
      <View style={styles.body}>
        <AppText variant="headline" weight="bold" numberOfLines={1}>{trip.title}</AppText>
        {!!trip.destination && (
          <AppText variant="subhead" weight="regular" numberOfLines={1}>{trip.destination}</AppText>
        )}
        <AppText variant="caption" style={styles.meta}>{meta.join(' · ')}</AppText>
        <View style={styles.ctaRow}>
          <AppText variant="subhead" weight="semibold" color={COLORS.brand}>View itinerary</AppText>
          <Ionicons name="chevron-forward" size={14} color={COLORS.brand} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.md,
  },
  headInfo: { flex: 1 },
  cover: { width: '100%', height: 150, backgroundColor: COLORS.border },
  coverPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.brandLight,
  },
  coverEmoji: { fontSize: 44 },
  body: { padding: SPACING.md, gap: 2 },
  meta: { marginTop: 2 },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: SPACING.sm },
});
