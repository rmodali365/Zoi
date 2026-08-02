import React, { useCallback } from 'react';
import {
  View, StyleSheet, SafeAreaView, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FeedStackParamList } from '@/types';
import { getFeed, FeedEntry } from '@/lib/feed';
import { getSavedIds, saveExperience, unsaveExperience } from '@/lib/saves';
import { qk } from '@/lib/queryKeys';
import { ExperienceCard } from '@/components/ExperienceCard';
import { TripFeedCard } from '@/components/TripFeedCard';
import { AppText } from '@/components/ui/AppText';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

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
        <AppText variant="title" style={styles.wordmark}>Zoi</AppText>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => navigation.navigate('Search')} hitSlop={8}>
            <Ionicons name="search-outline" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('FindPeople')} hitSlop={8}>
            <Ionicons name="person-add-outline" size={22} color={COLORS.text} />
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.text} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(entry: FeedEntry) => entry.id}
          renderItem={({ item: entry }) =>
            entry.kind === 'trip' ? (
              <TripFeedCard
                trip={entry.trip}
                onPress={() => navigation.navigate('TripDetail', { tripId: entry.trip.id })}
                onPressAuthor={() => navigation.navigate('UserProfile', { userId: entry.trip.user_id })}
              />
            ) : (
              <ExperienceCard
                item={entry.item}
                onPress={() => navigation.navigate('ExperienceDetail', { experienceId: entry.item.id })}
                onPressAuthor={() => navigation.navigate('UserProfile', { userId: entry.item.user_id })}
                saved={savedIds.has(entry.item.id)}
                onToggleSave={() => toggle.mutate({ id: entry.item.id, wasSaved: savedIds.has(entry.item.id) })}
              />
            )
          }
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={COLORS.textMuted} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <AppText variant="headline" style={styles.emptyTitle}>Follow friends to see their rankings</AppText>
              <AppText variant="body" color={COLORS.textSecondary} style={styles.emptyBody}>
                When friends rank experiences or build trips, they'll show up here.
              </AppText>
              <TouchableOpacity
                style={styles.cta}
                onPress={() => navigation.navigate('FindPeople')}
                activeOpacity={0.85}
              >
                <AppText variant="body" weight="semibold" color={COLORS.background}>Find friends</AppText>
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
  wordmark: { fontSize: 22, letterSpacing: -0.5 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg },
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
  emptyTitle: { textAlign: 'center' },
  emptyBody: { textAlign: 'center', lineHeight: 22 },
  cta: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.brand,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    paddingHorizontal: SPACING.xl,
  },
});
