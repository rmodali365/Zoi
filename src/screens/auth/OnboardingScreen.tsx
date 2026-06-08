import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList, Bucket } from '@/types';
import { BUCKET_LABELS, BUCKET_DESCRIPTIONS } from '@/constants/buckets';
import { COLORS, SPACING, RADIUS, FONT } from '@/constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Onboarding'>;
};

const BUCKETS: Bucket[] = ['single', 'day_trip', 'weekend', 'trip'];

export function OnboardingScreen({ navigation: _navigation }: Props) {
  const [selected, setSelected] = useState<Set<Bucket>>(new Set());

  function toggleBucket(bucket: Bucket) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(bucket) ? next.delete(bucket) : next.add(bucket);
      return next;
    });
  }

  // Auth state change will navigate to App automatically after session is set.
  // This screen just collects bucket preferences and can store them in the DB.
  function handleContinue() {
    // TODO: save selected buckets to user profile in Supabase
    // Navigation to App happens automatically via RootNavigator session listener
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>What do you do?</Text>
        <Text style={styles.subtitle}>
          Pick the types of experiences you want to rank. You can change this anytime.
        </Text>

        <View style={styles.buckets}>
          {BUCKETS.map((bucket) => (
            <TouchableOpacity
              key={bucket}
              style={[styles.bucketCard, selected.has(bucket) && styles.bucketCardSelected]}
              onPress={() => toggleBucket(bucket)}
              activeOpacity={0.8}
            >
              <Text style={[styles.bucketLabel, selected.has(bucket) && styles.bucketLabelSelected]}>
                {BUCKET_LABELS[bucket]}
              </Text>
              <Text style={[styles.bucketDesc, selected.has(bucket) && styles.bucketDescSelected]}>
                {BUCKET_DESCRIPTIONS[bucket]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.button, selected.size === 0 && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={selected.size === 0}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xxl,
    paddingBottom: SPACING.xxl,
    gap: SPACING.lg,
  },
  title: { fontSize: 28, ...FONT.bold, color: COLORS.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 16, color: COLORS.textSecondary, lineHeight: 24 },
  buckets: { gap: SPACING.sm },
  bucketCard: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  bucketCardSelected: {
    borderColor: COLORS.text,
    backgroundColor: COLORS.accentLight,
  },
  bucketLabel: { fontSize: 17, ...FONT.semibold, color: COLORS.text },
  bucketLabelSelected: { color: COLORS.accent },
  bucketDesc: { fontSize: 14, color: COLORS.textMuted, marginTop: 2 },
  bucketDescSelected: { color: COLORS.textSecondary },
  button: {
    backgroundColor: COLORS.text,
    borderRadius: RADIUS.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: COLORS.background, fontSize: 16, ...FONT.semibold },
});
