import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { Experience } from '@/types';
import { SENTIMENT_EMOJI } from '@/constants/experiences';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

type Props = {
  experience: Experience;
  // Optional leading rank badge (1-based position).
  rank?: number;
  // Optional trailing photo thumbnail.
  showThumb?: boolean;
};

// Compact ranked/list row for an experience — shared by My List, Profile,
// UserProfile and Trip detail.
export function ExperienceRow({ experience, rank, showThumb }: Props) {
  const place = [experience.location?.city, experience.location?.region].filter(Boolean).join(', ');
  return (
    <View style={styles.row}>
      {rank !== undefined && (
        <View style={styles.rankBadge}>
          <AppText variant="headline" weight="bold" color={COLORS.brand}>{rank}</AppText>
        </View>
      )}
      <View style={styles.info}>
        <AppText variant="headline" weight="semibold" numberOfLines={1}>
          {SENTIMENT_EMOJI[experience.sentiment]} {experience.location?.name}
        </AppText>
        {!!place && <AppText variant="caption" numberOfLines={1}>{place}</AppText>}
      </View>
      {showThumb && experience.photos.length > 0 && (
        <Image source={{ uri: experience.photos[0] }} style={styles.thumb} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm + 2,
    gap: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  rankBadge: {
    width: 36, height: 36, borderRadius: RADIUS.full,
    backgroundColor: COLORS.brandLight,
    alignItems: 'center', justifyContent: 'center',
  },
  info: { flex: 1 },
  thumb: { width: 48, height: 48, borderRadius: RADIUS.sm, backgroundColor: COLORS.border },
});
