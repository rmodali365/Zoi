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

// "Alex", "Alex and Sam", "Alex, Sam and 2 others" — everyone else on this outing.
function companionNames(item: FeedItem): string {
  const names = item.companions.map((c) => c.user.name);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} ${names.length - 2 === 1 ? 'other' : 'others'}`;
}

export function ExperienceCard({ item, onPress, onPressAuthor, saved = false, onToggleSave }: Props) {
  const author = item.user;
  const place = localityLabel(item);
  // A shared outing: several people logged the same thing, each ranking it into
  // their own list (#67). The card is credited to all of them.
  const shared = item.companions.length > 0;
  const withNames = companionNames(item);
  // Everyone's photos, so the card carries more than one person's view of the night.
  const groupPhotos = [...item.photos, ...item.companions.flatMap((c) => c.photos)];
  // The feed list pads SPACING.xl on both sides; paging needs that exact width.
  const cardWidth = useWindowDimensions().width - SPACING.xl * 2;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} disabled={!onPress} activeOpacity={0.9}>
      {/* Author */}
      <TouchableOpacity
        style={styles.head}
        onPress={onPressAuthor}
        disabled={!onPressAuthor}
        activeOpacity={0.7}
      >
        {shared ? (
          <AvatarStack
            uris={[author?.avatar_url, ...item.companions.map((c) => c.user.avatar_url)]}
            size={36}
            max={3}
          />
        ) : (
          <Avatar uri={author?.avatar_url} size={36} />
        )}
        <View style={styles.headInfo}>
          <AppText variant="body" weight="semibold" numberOfLines={1}>
            {shared ? `${author?.name ?? 'Someone'} & ${withNames}` : author?.name ?? 'Someone'}
          </AppText>
          <AppText variant="caption" numberOfLines={1}>
            {shared ? 'did this together' : `@${author?.handle ?? '…'}`}
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

      {/* Photos. On a shared outing this is everyone's — each person shot their own
          view of the same night, which is half the point of logging it together. */}
      {groupPhotos.length === 1 ? (
        <Image source={{ uri: groupPhotos[0] }} style={styles.photo} />
      ) : groupPhotos.length > 1 ? (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
          {groupPhotos.map((uri) => (
            <Image key={uri} source={{ uri }} style={[styles.photo, { width: cardWidth }]} />
          ))}
        </ScrollView>
      ) : null}

      {/* Body */}
      <View style={styles.body}>
        <AppText variant="headline" weight="bold">{experienceTitle(item)}</AppText>
        {!!place && <AppText variant="subhead" weight="regular">{place}</AppText>}

        <View style={styles.rankRow}>
          {shared && (
            <AppText variant="subhead" weight="semibold" color={COLORS.textSecondary}>
              {author?.name?.split(' ')[0] ?? 'They'}:{' '}
            </AppText>
          )}
          <AppText variant="subhead" color={COLORS.text}>
            {sentimentEmoji(item.sentiment)} {sentimentLabel(item.sentiment)}
          </AppText>
          <AppText variant="subhead" weight="semibold" color={COLORS.brand}> · ranked #{item.rankPosition} of {item.authorTotal}</AppText>
        </View>

        {/* Same night, different lists. Each person's own ranking stands on its own —
            that contrast is the interesting part of a shared experience. */}
        {item.companions.map((c) => (
          <View key={c.experienceId} style={styles.rankRow}>
            <AppText variant="subhead" weight="semibold" color={COLORS.textSecondary}>
              {c.user.name.split(' ')[0]}:{' '}
            </AppText>
            <AppText variant="subhead" color={COLORS.text}>
              {sentimentEmoji(c.sentiment)} {sentimentLabel(c.sentiment)}
            </AppText>
            {c.rankPosition !== null && (
              <AppText variant="subhead" weight="semibold" color={COLORS.brand}> · ranked #{c.rankPosition} of {c.authorTotal}</AppText>
            )}
          </View>
        ))}

        {!!item.quick_take && (
          <AppText variant="body" style={styles.quote}>
            {shared ? `${author?.name?.split(' ')[0] ?? ''}: ` : ''}“{item.quick_take}”
          </AppText>
        )}

        {item.companions.filter((c) => !!c.quick_take).map((c) => (
          <AppText key={c.experienceId} variant="body" style={styles.quote}>
            {c.user.name.split(' ')[0]}: “{c.quick_take}”
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
