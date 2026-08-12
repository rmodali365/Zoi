import React from 'react';
import { View, StyleSheet, Image, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FeedItem } from '@/lib/feed';
import { experienceTitle, localityLabel, sentimentEmoji, sentimentLabel } from '@/lib/experienceDisplay';
import { TAG_LABELS } from '@/constants/experiences';
import { AppText } from '@/components/ui/AppText';
import { Avatar } from '@/components/ui/Avatar';
import { AvatarStack } from '@/components/ui/AvatarStack';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  return `${Math.floor(d / 30)}mo`;
}

type Props = {
  item: FeedItem;
  // When provided, tapping the card opens the experience detail.
  onPress?: () => void;
  // When provided, tapping the author opens their profile.
  onPressAuthor?: () => void;
  // When provided, renders a bookmark toggle reflecting `saved`.
  saved?: boolean;
  onToggleSave?: () => void;
};

// "Alex", "Alex and Sam", "Alex, Sam and 2 others"
function nameList(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} ${names.length - 2 === 1 ? 'other' : 'others'}`;
}

// One outing, one card. A shared experience is a single post carrying everyone's
// rankings, so the card credits all of them and shows each person's own take —
// same night, different lists.
export function ExperienceCard({ item, onPress, onPressAuthor, saved = false, onToggleSave }: Props) {
  const place = localityLabel(item);
  const ranked = item.ranked;
  const lead = ranked[0];
  const rest = ranked.slice(1);
  const shared = ranked.length > 1;

  // Everyone's photos: each person shot their own view of the same night.
  const photos = ranked.flatMap((r) => r.photos);
  // The feed list pads SPACING.xl on both sides; paging needs that exact width.
  const cardWidth = useWindowDimensions().width - SPACING.xl * 2;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} disabled={!onPress} activeOpacity={0.9}>
      {/* Who did it */}
      <TouchableOpacity
        style={styles.head}
        onPress={onPressAuthor}
        disabled={!onPressAuthor}
        activeOpacity={0.7}
      >
        {shared ? (
          <AvatarStack uris={ranked.map((r) => r.user?.avatar_url)} size={36} max={3} />
        ) : (
          <Avatar uri={lead?.user?.avatar_url} size={36} />
        )}
        <View style={styles.headInfo}>
          <AppText variant="body" weight="semibold" numberOfLines={1}>
            {nameList(ranked.map((r) => r.user?.name ?? 'Someone'))}
          </AppText>
          <AppText variant="caption" numberOfLines={1}>
            {shared ? 'did this together' : `@${lead?.user?.handle ?? '…'}`}
          </AppText>
        </View>
        <AppText variant="caption">{timeAgo(item.created_at)}</AppText>
        {onToggleSave && (
          <TouchableOpacity onPress={onToggleSave} hitSlop={8} activeOpacity={0.7} style={styles.saveBtn}>
            <Ionicons
              name={saved ? 'bookmark' : 'bookmark-outline'}
              size={22}
              color={saved ? COLORS.brand : COLORS.textSecondary}
            />
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {/* Photos */}
      {photos.length === 1 ? (
        <Image source={{ uri: photos[0] }} style={styles.photo} />
      ) : photos.length > 1 ? (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
          {photos.map((uri) => (
            <Image key={uri} source={{ uri }} style={[styles.photo, { width: cardWidth }]} />
          ))}
        </ScrollView>
      ) : null}

      {/* Body */}
      <View style={styles.body}>
        <AppText variant="headline" weight="bold">{experienceTitle(item)}</AppText>
        {!!place && <AppText variant="subhead" weight="regular">{place}</AppText>}

        {/* Each person's own ranking. The contrast is the interesting part. */}
        {ranked.map((r) => (
          <View key={r.user_id} style={styles.rankRow}>
            {shared && (
              <AppText variant="subhead" weight="semibold" color={COLORS.textSecondary}>
                {r.user?.name?.split(' ')[0] ?? 'They'}:{' '}
              </AppText>
            )}
            <AppText variant="subhead" color={COLORS.text}>
              {sentimentEmoji(r.sentiment)} {sentimentLabel(r.sentiment)}
            </AppText>
            {r.rankPosition !== null && (
              <AppText variant="subhead" weight="semibold" color={COLORS.brand}>
                {' '}· ranked #{r.rankPosition} of {r.authorTotal}
              </AppText>
            )}
          </View>
        ))}

        {ranked.filter((r) => !!r.quick_take).map((r) => (
          <AppText key={r.user_id} variant="body" style={styles.quote}>
            {shared ? `${r.user?.name?.split(' ')[0] ?? ''}: ` : ''}“{r.quick_take}”
          </AppText>
        ))}

        {item.tags.length > 0 && (
          <View style={styles.tags}>
            {item.tags.map((t) => (
              <View key={t} style={styles.tag}>
                <AppText variant="footnote" weight="medium" color={COLORS.accent}>{TAG_LABELS[t]}</AppText>
              </View>
            ))}
          </View>
        )}

        {!!item.trip?.title && (
          <AppText variant="caption" style={styles.trip}>🧳 Part of {item.trip.title}</AppText>
        )}
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
  saveBtn: { marginLeft: SPACING.sm },
  photo: { width: '100%', height: 220, backgroundColor: COLORS.border },
  body: { padding: SPACING.md, gap: SPACING.xs },
  rankRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 2 },
  quote: { fontStyle: 'italic', lineHeight: 21, marginTop: SPACING.xs },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginTop: SPACING.xs },
  tag: {
    backgroundColor: COLORS.accentLight,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 3,
  },
  trip: { marginTop: SPACING.xs },
});
