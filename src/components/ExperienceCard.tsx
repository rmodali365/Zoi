import React from 'react';
import { View, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FeedItem } from '@/lib/feed';
import { experienceTitle, localityLabel, sentimentEmoji, sentimentLabel } from '@/lib/experienceDisplay';
import { TAG_LABELS } from '@/constants/experiences';
import { AppText } from '@/components/ui/AppText';
import { Avatar } from '@/components/ui/Avatar';
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
  // When provided, tapping the author opens their profile.
  onPressAuthor?: () => void;
  // When provided, renders a bookmark toggle reflecting `saved`.
  saved?: boolean;
  onToggleSave?: () => void;
};

export function ExperienceCard({ item, onPressAuthor, saved = false, onToggleSave }: Props) {
  const author = item.user;
  const place = localityLabel(item);

  return (
    <View style={styles.card}>
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
          <AppText variant="caption" numberOfLines={1}>@{author?.handle ?? '…'}</AppText>
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

      {/* Photo */}
      {item.photos.length > 0 && (
        <Image source={{ uri: item.photos[0] }} style={styles.photo} />
      )}

      {/* Body */}
      <View style={styles.body}>
        <AppText variant="headline" weight="bold">{experienceTitle(item)}</AppText>
        {!!place && <AppText variant="subhead" weight="regular">{place}</AppText>}

        <View style={styles.rankRow}>
          <AppText variant="subhead" color={COLORS.text}>
            {sentimentEmoji(item.sentiment)} {sentimentLabel(item.sentiment)}
          </AppText>
          <AppText variant="subhead" weight="semibold" color={COLORS.brand}> · ranked #{item.rankPosition} of {item.authorTotal}</AppText>
        </View>

        {!!item.quick_take && (
          <AppText variant="body" style={styles.quote}>“{item.quick_take}”</AppText>
        )}

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
    </View>
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
