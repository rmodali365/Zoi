import React, { useState } from 'react';
import {
  View, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, NavigationProp } from '@react-navigation/native';
import { AppTabParamList, LogStackParamList, Experience, Ranking, Sentiment } from '@/types';
import { SENTIMENTS, SENTIMENT_LABELS, SENTIMENT_EMOJI, thirdBounds } from '@/constants/experiences';
import { initialRankKey, keyBefore, keyAfter, keyBetween } from '@/lib/ranking';
import { experienceTitle } from '@/lib/experienceDisplay';
import { getMyUserId } from '@/lib/auth';
import { getRankingPool } from '@/lib/rankings';
import { saveRankedExperience, rerankExperience } from '@/lib/experiences';
import { queryClient } from '@/lib/queryClient';
import { qk } from '@/lib/queryKeys';
import { haptics } from '@/lib/haptics';
import { useBanner } from '@/contexts/BannerContext';
import { AppText } from '@/components/ui/AppText';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<LogStackParamList, 'RankExperience'>;
  route: RouteProp<LogStackParamList, 'RankExperience'>;
};

// One candidate in the head-to-head: a ranking of yours plus enough of the
// shared experience to render the comparison card.
type PoolEntry = Ranking & { experience: Experience | null };

export function RankExperienceScreen({ navigation, route }: Props) {
  const { draft, experienceId, rerank } = route.params;
  const { show } = useBanner();

  const [phase, setPhase] = useState<'sentiment' | 'comparing' | 'saving'>('sentiment');
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  // The comparison pool is the user's own RANKINGS — their list, in their order.
  const [pool, setPool] = useState<PoolEntry[]>([]);
  // Binary-search window: insert position lands at `lo` once lo === hi.
  const [lo, setLo] = useState(0);
  const [hi, setHi] = useState(0);

  async function handlePickSentiment(s: Sentiment) {
    haptics.select();
    setSentiment(s);
    setPhase('saving');

    const userId = await getMyUserId();
    if (!userId) {
      Alert.alert('Error', 'Session expired.');
      return;
    }

    // Load the FULL ranked list — one overall list per user. It's your rankings,
    // so planned stops (which have none) can't appear. When re-ranking, or when
    // ranking an experience you've already ranked, that entry leaves the pool so
    // it can't be compared against itself.
    const existing = (await getRankingPool(userId)).filter((r) => r.experience_id !== experienceId);

    if (existing.length === 0) {
      // Very first experience — auto #1.
      await save(s, initialRankKey(), 0, 1);
      return;
    }

    // Seed the comparison window to the third this sentiment maps to.
    const [loBound, hiBound] = thirdBounds(s, existing.length);

    if (loBound >= hiBound) {
      // No room to compare (tiny list) — drop straight into the boundary slot.
      await save(s, rankKeyForPositionIn(existing, loBound), loBound, existing.length + 1);
      return;
    }

    setPool(existing);
    setLo(loBound);
    setHi(hiBound);
    setPhase('comparing');
  }

  // User chose which experience they enjoyed more.
  function handleChoice(newIsBetter: boolean) {
    haptics.compareTap();
    const mid = (lo + hi) >> 1;
    let nextLo = lo;
    let nextHi = hi;
    if (newIsBetter) nextHi = mid;
    else nextLo = mid + 1;

    if (nextLo >= nextHi) {
      finalize(nextLo);
    } else {
      setLo(nextLo);
      setHi(nextHi);
    }
  }

  // Every entry is a ranking, so rank_key is always present.
  function rankKeyForPositionIn(list: PoolEntry[], pos: number): string {
    if (pos <= 0) return keyBefore(list[0].rank_key);
    if (pos >= list.length) return keyAfter(list[list.length - 1].rank_key);
    return keyBetween(list[pos - 1].rank_key, list[pos].rank_key);
  }

  async function finalize(pos: number) {
    if (!sentiment) return;
    setPhase('saving');
    await save(sentiment, rankKeyForPositionIn(pool, pos), pos, pool.length + 1);
  }

  // Exit the form flow no matter how we entered it (#52). popToTop() isn't enough:
  // deep-navigating from a trip can make AddExperience the Log stack's ROOT, where
  // popToTop() is a no-op and the user lands back on the stale filled-in form. So
  // reset the Log stack to LogHome, then jump to where the result is visible —
  // the trip's itinerary when the log belongs to a trip, else the ranked list.
  function finish() {
    navigation.reset({ index: 0, routes: [{ name: 'LogHome' }] });
    const tabNav = navigation.getParent<NavigationProp<AppTabParamList>>();
    // Re-ranking is about the list, not the trip — always land on the ranked
    // list so the new position is visible.
    if (draft.trip_id && !rerank) {
      // initial: false puts ExperiencesHome under TripDetail in the List stack.
      // Without it the stack is rooted AT TripDetail, so Back has nothing to pop
      // and falls through to the tab navigator (which defaults to the first tab —
      // the Feed — instead of the Experiences list).
      tabNav?.navigate('List', { screen: 'TripDetail', params: { tripId: draft.trip_id }, initial: false });
    } else {
      tabNav?.navigate('List', { screen: 'ExperiencesHome' });
    }
  }

  async function save(s: Sentiment, rankKey: string, pos: number, total: number) {
    const userId = await getMyUserId();
    if (!userId) return;

    // A new experience (or a graduated stop) affects My List + Profile (and trip averages).
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: qk.myExperiences });
      queryClient.invalidateQueries({ queryKey: qk.myTrips });
      if (draft.trip_id) queryClient.invalidateQueries({ queryKey: qk.trip(draft.trip_id) });
    };

    try {
      if (experienceId && rerank) {
        // Re-ranking: only sentiment + rank_key move; content stays untouched.
        await rerankExperience({ experienceId, sentiment: s, rankKey });
        invalidate();
        queryClient.invalidateQueries({ queryKey: qk.experience(experienceId) });
        haptics.success();
        show({ title: 'Re-ranked!', message: `${draft.title} now sits at #${pos + 1} of ${total}.` });
        finish();
        return;
      }

      // One call for both cases now. With `experienceId` you're ranking an
      // EXISTING shared post — a planned trip stop, or an experience someone
      // added you to — and that's just inserting your own ranking on it, with
      // your own photos and take. Nobody else's row is touched. Without it, the
      // post is created first and then ranked.
      await saveRankedExperience({
        draft,
        sentiment: s,
        rankKey,
        experienceId,
        onPhotoError: () =>
          Alert.alert('Photo upload failed', 'Saving your experience without photos.'),
        onInviteError: () =>
          Alert.alert('Couldn’t add everyone', 'Your experience saved — try adding the people you were with again later.'),
      });
      if (experienceId) queryClient.invalidateQueries({ queryKey: qk.experience(experienceId) });
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save.');
      setPhase('comparing');
      return;
    }

    invalidate();

    haptics.success();
    const isFirst = total === 1;
    show({
      title: isFirst ? '🎉 First one!' : 'Ranked!',
      message: isFirst
        ? `${draft.title} is your #1. You started your list!`
        : `${draft.title} landed at #${pos + 1} of ${total}`,
    });
    finish();
  }

  if (phase === 'saving') {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator color={COLORS.text} />
      </SafeAreaView>
    );
  }

  if (phase === 'sentiment') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
            <AppText variant="body" color={COLORS.textSecondary}>Back</AppText>
          </TouchableOpacity>
        </View>
        <View style={styles.content}>
          <AppText variant="display" style={styles.title}>How was it?</AppText>
          <AppText variant="body" color={COLORS.textSecondary} style={styles.subtitle}>{draft.title}</AppText>
          <View style={styles.sentiments}>
            {SENTIMENTS.map((s) => (
              <TouchableOpacity
                key={s}
                style={styles.sentimentCard}
                onPress={() => handlePickSentiment(s)}
                activeOpacity={0.85}
              >
                <AppText style={styles.sentimentEmoji}>{SENTIMENT_EMOJI[s]}</AppText>
                <AppText variant="headline" weight="semibold">{SENTIMENT_LABELS[s]}</AppText>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Comparing phase
  const mid = (lo + hi) >> 1;
  const opponent = pool[mid];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <AppText variant="display" style={styles.title}>Which did you enjoy more?</AppText>
        <View style={styles.compareRow}>
          <TouchableOpacity style={styles.compareCard} onPress={() => handleChoice(true)} activeOpacity={0.85}>
            <AppText variant="headline" weight="semibold" style={styles.compareName}>{draft.title}</AppText>
            <AppText variant="footnote" style={styles.compareTag}>{rerank ? 'Moving' : 'New'}</AppText>
          </TouchableOpacity>

          <AppText variant="subhead" weight="medium" color={COLORS.textMuted}>vs</AppText>

          <TouchableOpacity style={styles.compareCard} onPress={() => handleChoice(false)} activeOpacity={0.85}>
            <AppText variant="headline" weight="semibold" style={styles.compareName}>
              {opponent?.experience ? experienceTitle(opponent.experience) : 'Experience'}
            </AppText>
            <AppText variant="footnote" style={styles.compareTag}>Ranked</AppText>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { alignItems: 'center', justifyContent: 'center' },
  topBar: { paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md },
  content: { flex: 1, paddingHorizontal: SPACING.xl, justifyContent: 'center', gap: SPACING.lg },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', marginTop: -SPACING.sm },
  sentiments: { gap: SPACING.md, marginTop: SPACING.lg },
  sentimentCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.lg, padding: SPACING.lg,
  },
  sentimentEmoji: { fontSize: 28 },
  compareRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  compareCard: {
    flex: 1, minHeight: 140, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg,
    padding: SPACING.lg, alignItems: 'center', justifyContent: 'center', gap: SPACING.xs,
  },
  compareName: { textAlign: 'center' },
  compareTag: { textTransform: 'uppercase', letterSpacing: 0.5 },
});
