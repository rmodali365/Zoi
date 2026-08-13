import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { AvatarStack } from '@/components/ui/AvatarStack';
import { RankedExperience } from '@/types';
import { sentimentEmoji } from '@/lib/experienceDisplay';
import { pooledPhotos } from '@/lib/rankings';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

type Props = {
  // A shared post plus the rankings on it; `mine` is whose list this row is in.
  experience: RankedExperience;
  // Optional leading rank badge (1-based position).
  rank?: number;
  // Optional trailing photo thumbnail.
  showThumb?: boolean;
  // Whose list is being rendered. Defaults to the viewer's own ranking; set this
  // when showing someone else's list so the row reflects THEIR take.
  rankingUserId?: string;
};

// Compact ranked/list row for an experience — shared by My List, Profile,
// UserProfile and Trip detail. One post can sit in several people's lists at
// different positions, so the row always renders one specific person's ranking.
export function ExperienceRow({ experience, rank, showThumb, rankingUserId }: Props) {
  const ranking = rankingUserId
    ? experience.rankings.find((r) => r.user_id === rankingUserId) ?? experience.mine
    : experience.mine;
  const place = [experience.location?.city, experience.location?.region].filter(Boolean).join(', ');
  // Anyone else who was there — a shared night reads as shared in your own list.
  const others = experience.rankings.filter((r) => r.user_id !== ranking?.user_id);
  const photos = ranking?.photos.length ? ranking.photos : pooledPhotos(experience);

  return (
    <View style={styles.row}>
      {rank !== undefined && (
        <View style={styles.rankBadge}>
          <AppText variant="headline" weight="bold" color={COLORS.brand}>{rank}</AppText>
        </View>
      )}
      <View style={styles.info}>
        <AppText variant="headline" weight="semibold" numberOfLines={1}>
          {sentimentEmoji(ranking?.sentiment)} {experience.location?.name}
        </AppText>
        {!!place && <AppText variant="caption" numberOfLines={1}>{place}</AppText>}
        {others.length > 0 && (
          <View style={styles.withRow}>
            <AvatarStack uris={others.map((r) => r.user?.avatar_url)} size={16} max={3} />
            <AppText variant="footnote" color={COLORS.textMuted} numberOfLines={1}>
              with {others.map((r) => r.user?.name?.split(' ')[0] ?? 'someone').join(', ')}
            </AppText>
          </View>
        )}
      </View>
      {showThumb && photos.length > 0 && (
        <Image source={{ uri: photos[0] }} style={styles.thumb} />
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
  withRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: 2 },
  thumb: { width: 48, height: 48, borderRadius: RADIUS.sm, backgroundColor: COLORS.border },
});
