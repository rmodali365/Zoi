import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { LogStackParamList, Experience, Sentiment } from '@/types';
import { SENTIMENTS, SENTIMENT_LABELS, SENTIMENT_EMOJI, thirdBounds } from '@/constants/experiences';
import { initialRankKey, keyBefore, keyAfter, keyBetween } from '@/lib/ranking';
import { experienceTitle } from '@/lib/experienceDisplay';
import { uploadExperiencePhotos } from '@/lib/storage';
import { queryClient } from '@/lib/queryClient';
import { qk } from '@/lib/queryKeys';
import { COLORS, SPACING, RADIUS, FONT } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type Props = {
  navigation: NativeStackNavigationProp<LogStackParamList, 'RankExperience'>;
  route: RouteProp<LogStackParamList, 'RankExperience'>;
};

export function RankExperienceScreen({ navigation, route }: Props) {
  const { draft } = route.params;

  const [phase, setPhase] = useState<'sentiment' | 'comparing' | 'saving'>('sentiment');
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [pool, setPool] = useState<Experience[]>([]);
  // Binary-search window: insert position lands at `lo` once lo === hi.
  const [lo, setLo] = useState(0);
  const [hi, setHi] = useState(0);

  async function handlePickSentiment(s: Sentiment) {
    setSentiment(s);
    setPhase('saving');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert('Error', 'Session expired.');
      return;
    }

    // Load the FULL ranked list — ranking is one overall list per user now.
    // Planned trip stops are excluded; only ranked experiences are comparison candidates.
    const { data } = await supabase
      .from('experiences')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'ranked')
      .order('rank_key', { ascending: true });

    const existing = (data ?? []) as Experience[];

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

  // `list` is the ranked pool (status='ranked'), so every rank_key is non-null.
  function rankKeyForPositionIn(list: Experience[], pos: number): string {
    if (pos <= 0) return keyBefore(list[0].rank_key!);
    if (pos >= list.length) return keyAfter(list[list.length - 1].rank_key!);
    return keyBetween(list[pos - 1].rank_key!, list[pos].rank_key!);
  }

  async function finalize(pos: number) {
    if (!sentiment) return;
    setPhase('saving');
    await save(sentiment, rankKeyForPositionIn(pool, pos), pos, pool.length + 1);
  }

  async function save(s: Sentiment, rankKey: string, pos: number, total: number) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Upload photos to Storage first; save without them if upload fails.
    let photoUrls: string[] = [];
    try {
      photoUrls = await uploadExperiencePhotos(user.id, draft.photos);
    } catch {
      if (draft.photos.length > 0) {
        Alert.alert('Photo upload failed', 'Saving your experience without photos.');
      }
    }

    const { error } = await supabase.from('experiences').insert({
      user_id: user.id,
      sentiment: s,
      trip_id: draft.trip_id,
      title: draft.title,
      locations: draft.locations,
      // Representative location (= locations[0]) for the map pin / legacy reads.
      location: draft.locations[0] ?? null,
      tags: draft.tags,
      photos: photoUrls,
      quick_take: draft.quick_take,
      rank_key: rankKey,
    });

    if (error) {
      Alert.alert('Error', error.message);
      setPhase('comparing');
      return;
    }

    // New experience affects the user's My List + Profile (and trip averages).
    queryClient.invalidateQueries({ queryKey: qk.myExperiences });
    queryClient.invalidateQueries({ queryKey: qk.myTrips });

    const place = draft.title;
    const isFirst = total === 1;
    Alert.alert(
      isFirst ? '🎉 First one!' : 'Ranked!',
      isFirst
        ? `${place} is your #1. You started your list!`
        : `${place} landed at #${pos + 1} of ${total}`,
      [{ text: 'Done', onPress: () => navigation.popToTop() }],
    );
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
            <Text style={styles.cancel}>Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.content}>
          <Text style={styles.title}>How was it?</Text>
          <Text style={styles.subtitle}>{draft.title}</Text>
          <View style={styles.sentiments}>
            {SENTIMENTS.map((s) => (
              <TouchableOpacity
                key={s}
                style={styles.sentimentCard}
                onPress={() => handlePickSentiment(s)}
                activeOpacity={0.85}
              >
                <Text style={styles.sentimentEmoji}>{SENTIMENT_EMOJI[s]}</Text>
                <Text style={styles.sentimentLabel}>{SENTIMENT_LABELS[s]}</Text>
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
        <Text style={styles.title}>Which did you enjoy more?</Text>
        <View style={styles.compareRow}>
          <TouchableOpacity style={styles.compareCard} onPress={() => handleChoice(true)} activeOpacity={0.85}>
            <Text style={styles.compareName}>{draft.title}</Text>
            <Text style={styles.compareTag}>New</Text>
          </TouchableOpacity>

          <Text style={styles.vs}>vs</Text>

          <TouchableOpacity style={styles.compareCard} onPress={() => handleChoice(false)} activeOpacity={0.85}>
            <Text style={styles.compareName}>{opponent ? experienceTitle(opponent) : 'Experience'}</Text>
            <Text style={styles.compareTag}>Ranked</Text>
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
  cancel: { fontSize: 15, color: COLORS.textSecondary },
  content: { flex: 1, paddingHorizontal: SPACING.xl, justifyContent: 'center', gap: SPACING.lg },
  title: { fontSize: 26, ...FONT.bold, color: COLORS.text, letterSpacing: -0.5, textAlign: 'center' },
  subtitle: { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', marginTop: -SPACING.sm },
  sentiments: { gap: SPACING.md, marginTop: SPACING.lg },
  sentimentCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.lg, padding: SPACING.lg,
  },
  sentimentEmoji: { fontSize: 28 },
  sentimentLabel: { fontSize: 18, ...FONT.semibold, color: COLORS.text },
  compareRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  compareCard: {
    flex: 1, minHeight: 140, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg,
    padding: SPACING.lg, alignItems: 'center', justifyContent: 'center', gap: SPACING.xs,
  },
  compareName: { fontSize: 17, ...FONT.semibold, color: COLORS.text, textAlign: 'center' },
  compareTag: { fontSize: 12, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  vs: { fontSize: 14, ...FONT.medium, color: COLORS.textMuted },
});
