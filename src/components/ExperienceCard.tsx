import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { FeedItem } from '@/lib/feed';
import { SENTIMENT_EMOJI, SENTIMENT_LABELS, TAG_LABELS } from '@/constants/experiences';
import { COLORS, SPACING, RADIUS, FONT } from '@/constants/theme';

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

export function ExperienceCard({ item }: { item: FeedItem }) {
  const author = item.user;
  const place = [item.location.city, item.location.region].filter(Boolean).join(', ');

  return (
    <View style={styles.card}>
      {/* Author */}
      <View style={styles.head}>
        <View style={styles.avatar} />
        <View style={styles.headInfo}>
          <Text style={styles.author} numberOfLines={1}>{author?.name ?? 'Someone'}</Text>
          <Text style={styles.handle} numberOfLines={1}>@{author?.handle ?? '…'}</Text>
        </View>
        <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
      </View>

      {/* Photo */}
      {item.photos.length > 0 && (
        <Image source={{ uri: item.photos[0] }} style={styles.photo} />
      )}

      {/* Body */}
      <View style={styles.body}>
        <Text style={styles.name}>{item.location.name}</Text>
        {!!place && <Text style={styles.place}>{place}</Text>}

        <View style={styles.rankRow}>
          <Text style={styles.sentiment}>
            {SENTIMENT_EMOJI[item.sentiment]} {SENTIMENT_LABELS[item.sentiment]}
          </Text>
          <Text style={styles.rank}>· ranked #{item.rankPosition} of {item.authorTotal}</Text>
        </View>

        {!!item.quick_take && <Text style={styles.quote}>“{item.quick_take}”</Text>}

        {item.tags.length > 0 && (
          <View style={styles.tags}>
            {item.tags.map((t) => (
              <View key={t} style={styles.tag}>
                <Text style={styles.tagText}>{TAG_LABELS[t]}</Text>
              </View>
            ))}
          </View>
        )}

        {!!item.trip?.title && (
          <Text style={styles.trip}>🧳 Part of {item.trip.title}</Text>
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
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.border },
  headInfo: { flex: 1 },
  author: { fontSize: 15, ...FONT.semibold, color: COLORS.text },
  handle: { fontSize: 13, color: COLORS.textMuted },
  time: { fontSize: 13, color: COLORS.textMuted },
  photo: { width: '100%', height: 220, backgroundColor: COLORS.border },
  body: { padding: SPACING.md, gap: SPACING.xs },
  name: { fontSize: 18, ...FONT.bold, color: COLORS.text },
  place: { fontSize: 14, color: COLORS.textSecondary },
  rankRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 2 },
  sentiment: { fontSize: 14, ...FONT.medium, color: COLORS.text },
  rank: { fontSize: 14, color: COLORS.textSecondary },
  quote: { fontSize: 15, color: COLORS.text, fontStyle: 'italic', lineHeight: 21, marginTop: SPACING.xs },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginTop: SPACING.xs },
  tag: {
    backgroundColor: COLORS.accentLight,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 3,
  },
  tagText: { fontSize: 12, ...FONT.medium, color: COLORS.accent },
  trip: { fontSize: 13, color: COLORS.textMuted, marginTop: SPACING.xs },
});
