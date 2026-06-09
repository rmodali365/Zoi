import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FeedStackParamList } from '@/types';
import { getFeed, FeedItem } from '@/lib/feed';
import { getSavedIds, saveExperience, unsaveExperience } from '@/lib/saves';
import { ExperienceCard } from '@/components/ExperienceCard';
import { COLORS, SPACING, RADIUS, FONT } from '@/constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<FeedStackParamList, 'FeedHome'>;
};

export function FeedScreen({ navigation }: Props) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      // Prefetch saved ids alongside the feed so cards render the right bookmark state.
      const [feed, saved] = await Promise.all([getFeed(), getSavedIds()]);
      setItems(feed);
      setSavedIds(saved);
    } catch {
      setItems([]);
    }
  }, []);

  // Optimistic bookmark toggle; reverts the local set on failure.
  const toggleSave = useCallback(async (id: string) => {
    const wasSaved = savedIds.has(id);
    setSavedIds((prev) => {
      const next = new Set(prev);
      wasSaved ? next.delete(id) : next.add(id);
      return next;
    });
    try {
      if (wasSaved) await unsaveExperience(id);
      else await saveExperience(id);
    } catch {
      setSavedIds((prev) => {
        const next = new Set(prev);
        wasSaved ? next.add(id) : next.delete(id);
        return next;
      });
    }
  }, [savedIds]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.wordmark}>Zoi</Text>
        <TouchableOpacity onPress={() => navigation.navigate('FindPeople')} hitSlop={8}>
          <Ionicons name="person-add-outline" size={22} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.text} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ExperienceCard
              item={item}
              saved={savedIds.has(item.id)}
              onToggleSave={() => toggleSave(item.id)}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.textMuted} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Follow friends to see their rankings</Text>
              <Text style={styles.emptyBody}>
                When friends rank experiences, they'll show up here.
              </Text>
              <TouchableOpacity
                style={styles.cta}
                onPress={() => navigation.navigate('FindPeople')}
                activeOpacity={0.85}
              >
                <Text style={styles.ctaText}>Find friends</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  wordmark: { fontSize: 22, ...FONT.bold, color: COLORS.text, letterSpacing: -0.5 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { flexGrow: 1, padding: SPACING.xl },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: 100,
    gap: SPACING.sm,
  },
  emptyTitle: { fontSize: 17, ...FONT.semibold, color: COLORS.text, textAlign: 'center' },
  emptyBody: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },
  cta: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.text,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    paddingHorizontal: SPACING.xl,
  },
  ctaText: { fontSize: 15, ...FONT.semibold, color: COLORS.background },
});
