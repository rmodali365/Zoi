import React, { useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FeedStackParamList } from '@/types';
import { getFeed } from '@/lib/feed';
import { getSavedIds, saveExperience, unsaveExperience } from '@/lib/saves';
import { qk } from '@/lib/queryKeys';
import { ExperienceCard } from '@/components/ExperienceCard';
import { COLORS, SPACING, RADIUS, FONT } from '@/constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<FeedStackParamList, 'FeedHome'>;
};

export function FeedScreen({ navigation }: Props) {
  const queryClient = useQueryClient();

  const { data: items = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: qk.feed,
    queryFn: getFeed,
  });
  const { data: savedIds = new Set<string>() } = useQuery({
    queryKey: qk.savedIds,
    queryFn: getSavedIds,
  });

  // Optimistic bookmark toggle; reverts on error. Persisted to public.saves and the
  // Want-to-do list (qk.saves) is invalidated so My List reflects the change.
  const toggle = useMutation({
    mutationFn: ({ id, wasSaved }: { id: string; wasSaved: boolean }) =>
      wasSaved ? unsaveExperience(id) : saveExperience(id),
    onMutate: async ({ id, wasSaved }) => {
      await queryClient.cancelQueries({ queryKey: qk.savedIds });
      const prev = queryClient.getQueryData<Set<string>>(qk.savedIds);
      queryClient.setQueryData<Set<string>>(qk.savedIds, (old) => {
        const next = new Set(old ?? []);
        wasSaved ? next.delete(id) : next.add(id);
        return next;
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(qk.savedIds, ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qk.saves });
    },
  });

  const onRefresh = useCallback(() => {
    refetch();
    queryClient.invalidateQueries({ queryKey: qk.savedIds });
  }, [refetch, queryClient]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.wordmark}>Zoi</Text>
        <TouchableOpacity onPress={() => navigation.navigate('FindPeople')} hitSlop={8}>
          <Ionicons name="person-add-outline" size={22} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
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
              onPressAuthor={() => navigation.navigate('UserProfile', { userId: item.user_id })}
              saved={savedIds.has(item.id)}
              onToggleSave={() => toggle.mutate({ id: item.id, wasSaved: savedIds.has(item.id) })}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={COLORS.textMuted} />}
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
