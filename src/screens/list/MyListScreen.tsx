import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, Image, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Experience } from '@/types';
import { SENTIMENT_EMOJI, TAG_LABELS } from '@/constants/experiences';
import { COLORS, SPACING, RADIUS, FONT } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

export function MyListScreen() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Experience[]>([]);

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

    setItems((data ?? []) as Experience[]);
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
        <Text style={styles.subtitle}>
          {items.length} {items.length === 1 ? 'place' : 'places'} ranked
        </Text>
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No experiences yet</Text>
          <Text style={styles.emptyBody}>Log your first experience to start ranking your taste.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {items.map((item, i) => (
            <View key={item.id} style={styles.row}>
              <View style={styles.rankBadge}>
                <Text style={styles.rankText}>{i + 1}</Text>
              </View>
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>
                  {SENTIMENT_EMOJI[item.sentiment]} {item.location.name}
                </Text>
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
  rankBadge: {
    width: 36, height: 36, borderRadius: RADIUS.full,
    backgroundColor: COLORS.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  rankText: { fontSize: 16, ...FONT.bold, color: COLORS.accent },
  info: { flex: 1 },
  name: { fontSize: 16, ...FONT.semibold, color: COLORS.text },
  place: { fontSize: 13, color: COLORS.textSecondary, marginTop: 1 },
  tags: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  thumb: { width: 48, height: 48, borderRadius: RADIUS.sm, backgroundColor: COLORS.border },
  empty: { paddingHorizontal: SPACING.xxl, paddingTop: SPACING.xxl, alignItems: 'center', gap: SPACING.sm },
  emptyTitle: { fontSize: 17, ...FONT.semibold, color: COLORS.text, textAlign: 'center' },
  emptyBody: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },
});
