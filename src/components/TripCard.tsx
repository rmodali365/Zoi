import React from 'react';
import { View, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { AvatarStack } from '@/components/ui/AvatarStack';
import { Trip, TripMember } from '@/types';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

const TRIP_CARD = 140;

type Props = {
  trip: Trip;
  // Joined members, when the caller has loaded the roster — renders the avatar
  // stack that marks a trip as shared (#67).
  members?: TripMember[];
  onPress?: () => void;
};

// Square trip card for the horizontal trips strip on profiles.
export function TripCard({ trip, members, onPress }: Props) {
  const joined = (members ?? []).filter((m) => m.status === 'joined');

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} disabled={!onPress} activeOpacity={0.85}>
      <View>
        {trip.cover_photo ? (
          <Image source={{ uri: trip.cover_photo }} style={styles.cover} />
        ) : (
          <View style={[styles.cover, styles.coverPlaceholder]}>
            <AppText style={styles.emoji}>🧳</AppText>
          </View>
        )}
        {joined.length > 0 && (
          <View style={styles.members}>
            <AvatarStack
              uris={[trip.user?.avatar_url, ...joined.map((m) => m.user?.avatar_url)]}
              size={20}
              max={3}
            />
          </View>
        )}
      </View>
      <AppText variant="subhead" weight="semibold" numberOfLines={1}>{trip.title}</AppText>
      {!!trip.destination && (
        <AppText variant="footnote" numberOfLines={1}>{trip.destination}</AppText>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { width: TRIP_CARD },
  cover: {
    width: TRIP_CARD, height: TRIP_CARD, borderRadius: RADIUS.md,
    backgroundColor: COLORS.border, marginBottom: SPACING.xs,
  },
  coverPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.brandLight },
  emoji: { fontSize: 40 },
  members: { position: 'absolute', left: SPACING.xs, bottom: SPACING.sm },
});
