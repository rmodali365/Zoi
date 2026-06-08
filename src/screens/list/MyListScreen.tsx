import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, Image, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Experience, Sentiment } from '@/types';
import { SENTIMENTS, SENTIMENT_LABELS, scoreFromRank } from '@/constants/experiences';
import { TAG_LABELS } from '@/constants/experiences';
import { COLORS, SPACING, RADIUS, FONT } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type RankedItem = Experience & { score: number };

export function MyListScreen() {
  const [loading, setLoading] = useState(true);
  const [grouped, setGrouped] = useState<Record<Sentiment, RankedItem[]>>({
    loved: [], liked: [], fine: [],
  });
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('experiences')
      .select('*')
      .eq('user_id', user.id)
      .order('rank_key', { ascending: true });

    const all = (data ?? []) as Experience[];
    const next: Record<Sentiment, RankedItem[]> = { loved: [], liked: [], fine: [] };
    for (const s of SENTIMENTS) {
      const tier = all.filter((e) => e.sentiment === s);
      next[s] = tier.map((e, i) => ({ ...e, score: scoreFromRank(s, i, tier.length) }));
    }
    setGrouped(next);
    setTotal(all.length);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator color={COLORS.text} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My list</Text>
        <Text style={styles.subtitle}>{total} {total === 1 ? 'place' : 'places'} ranked</Text>
      </View>

      {total === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No experiences yet</Text>
          <Text style={styles.emptyBody}>Log your first experience to start ranking your taste.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {SENTIMENTS.map((s) => {
            const items = grouped[s];
            if (items.length === 0) return null;
            return (
              <View key={s} style={styles.section}>
                <Text style={styles.sectionTitle}>{SENTIMENT_LABELS[s]}</Text>
                {items.map((item, i) => (
                  <View key={item.id} style={styles.row}>
                    <Text style={styles.rank}>{i + 1}</Text>
                    <View style={styles.scoreBadge}>
                      <Text style={styles.scoreText}>{item.score.toFixed(1)}</Text>
                    </View>
                    <View style={styles.info}>
                      <Text style={styles.name} numberOfLines={1}>{item.location.name}</Text>
                      {!!(item.location.city || item.location.region) && (
                        <Text style={styles.place} numberOfLines={1}>
                          {[item.location.city, item.location.region].filter(Boolean).join(', ')}
                        </Text>
                      )}
                      {item.tags.length > 0 && (
                        <Text style={styles.tags} numberOfLines={1}>
                          {item.tags.map((t) => TAG_LABELS[t]).join(' · ')}
                        </Text>
                      )}
                    </View>
                    {item.photos.length > 0 && (
                      <Image source={{ uri: item.photos[0] }} style={styles.thumb} />
                    )}
                  </View>
                ))}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.xl, paddingBottom: SPACING.md },
  title: { fontSize: 28, ...FONT.bold, color: COLORS.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: COLORS.textSecondary, marginTop: SPACING.xs },
  scroll: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxl },
  section: { marginBottom: SPACING.lg },
  sectionTitle: {
    fontSize: 13, ...FONT.semibold, color: COLORS.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.sm + 2,
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  rank: { fontSize: 14, ...FONT.medium, color: COLORS.textMuted, width: 20, textAlign: 'center' },
  scoreBadge: {
    width: 40, height: 40, borderRadius: RADIUS.sm,
    backgroundColor: COLORS.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  scoreText: { fontSize: 15, ...FONT.bold, color: COLORS.accent },
  info: { flex: 1 },
  name: { fontSize: 16, ...FONT.semibold, color: COLORS.text },
  place: { fontSize: 13, color: COLORS.textSecondary, marginTop: 1 },
  tags: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  thumb: { width: 48, height: 48, borderRadius: RADIUS.sm, backgroundColor: COLORS.border },
  empty: { paddingHorizontal: SPACING.xxl, paddingTop: SPACING.xxl, alignItems: 'center', gap: SPACING.sm },
  emptyTitle: { fontSize: 17, ...FONT.semibold, color: COLORS.text, textAlign: 'center' },
  emptyBody: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },
});
