import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, RADIUS, FONT } from '@/constants/theme';
import { Bucket } from '@/types';
import { BUCKET_LABELS, BUCKET_DESCRIPTIONS } from '@/constants/buckets';

const BUCKETS: Bucket[] = ['single', 'day_trip', 'weekend', 'trip'];

export function LogScreen() {
  function handleBucketSelect(_bucket: Bucket) {
    // TODO: navigate to AddExperienceScreen with bucket pre-selected
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Log an experience</Text>
        <Text style={styles.subtitle}>What did you do?</Text>
      </View>

      <View style={styles.buckets}>
        {BUCKETS.map((bucket) => (
          <TouchableOpacity
            key={bucket}
            style={styles.bucketRow}
            onPress={() => handleBucketSelect(bucket)}
            activeOpacity={0.7}
          >
            <View style={styles.bucketInfo}>
              <Text style={styles.bucketLabel}>{BUCKET_LABELS[bucket]}</Text>
              <Text style={styles.bucketDesc}>{BUCKET_DESCRIPTIONS[bucket]}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  title: { fontSize: 28, ...FONT.bold, color: COLORS.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 16, color: COLORS.textSecondary, marginTop: SPACING.xs },
  buckets: {
    paddingHorizontal: SPACING.xl,
    gap: SPACING.sm,
  },
  bucketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  bucketInfo: { flex: 1 },
  bucketLabel: { fontSize: 17, ...FONT.semibold, color: COLORS.text },
  bucketDesc: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  chevron: { fontSize: 22, color: COLORS.textMuted, paddingLeft: SPACING.sm },
});
