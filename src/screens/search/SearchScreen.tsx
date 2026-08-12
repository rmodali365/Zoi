import React, { useMemo, useState } from 'react';
import {
  View, StyleSheet, SafeAreaView, TextInput, ScrollView, Image, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { FeedStackParamList } from '@/types';
import { getFeed, filterFeedByPlace } from '@/lib/feed';
import { experienceTitle, localityLabel, sentimentEmoji } from '@/lib/experienceDisplay';
import { qk } from '@/lib/queryKeys';
import { AppText } from '@/components/ui/AppText';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<FeedStackParamList, 'Search'>;
};

// Place search over the people you follow (#63): type a city (or place/title)
// and see what your friends have ranked there — best-ranked first, since their
// own ordering IS the recommendation — plus their matching trips to fork or
// copy from. Filters the cached feed query, so typing costs no network.
export function SearchScreen({ navigation }: Props) {
  const [query, setQuery] = useState('');

  const { data: entries = [], isLoading } = useQuery({
    queryKey: qk.feed,
    queryFn: getFeed,
  });

  const { experiences, trips } = useMemo(
    () => filterFeedByPlace(entries, query),
    [entries, query],
  );

  const searching = query.trim().length > 0;
  const nothingFound = searching && !isLoading && experiences.length === 0 && trips.length === 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <AppText variant="body" weight="medium" color={COLORS.accent}>‹ Back</AppText>
        </TouchableOpacity>
        <AppText variant="body" weight="semibold">Search places</AppText>
        <View style={styles.spacer} />
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="City, place, or experience…"
          placeholderTextColor={COLORS.textMuted}
          returnKeyType="search"
          autoFocus
          autoCorrect={false}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!searching ? (
          <View style={styles.hint}>
            <AppText variant="body" color={COLORS.textSecondary} style={styles.hintText}>
              {entries.length === 0 && !isLoading
                ? 'Follow friends first — then search a city to see what they ranked there.'
                : 'Search a city to see what the people you follow have ranked there.'}
            </AppText>
          </View>
        ) : nothingFound ? (
          <View style={styles.hint}>
            <AppText variant="body" color={COLORS.textSecondary} style={styles.hintText}>
              No one you follow has ranked anything matching “{query.trim()}” yet.
            </AppText>
          </View>
        ) : (
          <>
            {experiences.length > 0 && (
              <>
                <AppText variant="caption" weight="semibold" color={COLORS.textSecondary} style={styles.sectionTitle}>
                  Ranked by people you follow
                </AppText>
                {experiences.map((item) => {
                  // A shared post can be several people's recommendation; lead
                  // with whoever ranked it highest.
                  const best = [...item.ranked].sort(
                    (a, b) => (a.rankPosition ?? Infinity) - (b.rankPosition ?? Infinity),
                  )[0];
                  const photos = item.ranked.flatMap((r) => r.photos);
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.row}
                      onPress={() => navigation.navigate('ExperienceDetail', { experienceId: item.id })}
                      activeOpacity={0.7}
                    >
                      <View style={styles.rankBadge}>
                        <AppText variant="subhead" weight="bold" color={COLORS.brand}>#{best?.rankPosition ?? '–'}</AppText>
                      </View>
                      <View style={styles.info}>
                        <AppText variant="body" weight="semibold" numberOfLines={1}>
                          {sentimentEmoji(best?.sentiment)} {experienceTitle(item)}
                        </AppText>
                        <AppText variant="caption" color={COLORS.textSecondary} numberOfLines={1}>
                          {[
                            localityLabel(item),
                            item.ranked.map((r) => `@${r.user?.handle ?? '…'}`).join(', ') || null,
                          ].filter(Boolean).join(' · ')}
                        </AppText>
                      </View>
                      {photos.length > 0 && <Image source={{ uri: photos[0] }} style={styles.thumb} />}
                    </TouchableOpacity>
                  );
                })}
              </>
            )}

            {trips.length > 0 && (
              <>
                <AppText
                  variant="caption" weight="semibold" color={COLORS.textSecondary}
                  style={[styles.sectionTitle, experiences.length > 0 && styles.sectionGap]}
                >
                  Trips to borrow
                </AppText>
                {trips.map((trip) => (
                  <TouchableOpacity
                    key={trip.id}
                    style={styles.row}
                    onPress={() => navigation.navigate('TripDetail', { tripId: trip.id })}
                    activeOpacity={0.7}
                  >
                    {trip.cover_photo ? (
                      <Image source={{ uri: trip.cover_photo }} style={styles.thumb} />
                    ) : (
                      <View style={[styles.thumb, styles.thumbPlaceholder]}>
                        <AppText style={styles.tripEmoji}>🧳</AppText>
                      </View>
                    )}
                    <View style={styles.info}>
                      <AppText variant="body" weight="semibold" numberOfLines={1}>{trip.title}</AppText>
                      <AppText variant="caption" color={COLORS.textSecondary} numberOfLines={1}>
                        {[
                          trip.destination,
                          `${trip.stopCount} ${trip.stopCount === 1 ? 'stop' : 'stops'}`,
                          trip.user ? `@${trip.user.handle}` : null,
                        ].filter(Boolean).join(' · ')}
                      </AppText>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                  </TouchableOpacity>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md,
  },
  spacer: { width: 50 },
  searchWrap: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.sm },
  input: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: 16,
    color: COLORS.text, backgroundColor: COLORS.surface,
  },
  scroll: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxl },
  hint: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.xxl, alignItems: 'center' },
  hintText: { textAlign: 'center', lineHeight: 22 },
  sectionTitle: {
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: SPACING.sm, marginBottom: SPACING.sm,
  },
  sectionGap: { marginTop: SPACING.lg },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, padding: SPACING.sm + 2, marginBottom: SPACING.sm,
  },
  rankBadge: {
    minWidth: 44, height: 36, borderRadius: RADIUS.full,
    backgroundColor: COLORS.brandLight, paddingHorizontal: SPACING.xs,
    alignItems: 'center', justifyContent: 'center',
  },
  info: { flex: 1 },
  thumb: { width: 48, height: 48, borderRadius: RADIUS.sm, backgroundColor: COLORS.border },
  thumbPlaceholder: {
    backgroundColor: COLORS.brandLight,
    alignItems: 'center', justifyContent: 'center',
  },
  tripEmoji: { fontSize: 22 },
});
