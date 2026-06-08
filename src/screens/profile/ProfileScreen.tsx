import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, FONT, RADIUS } from '@/constants/theme';
import { Bucket } from '@/types';
import { BUCKET_LABELS } from '@/constants/buckets';

const BUCKETS: Bucket[] = ['single', 'day_trip', 'weekend', 'trip'];

export function ProfileScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile header */}
        <View style={styles.header}>
          <View style={styles.avatar} />
          <View style={styles.userInfo}>
            <Text style={styles.name}>Your Name</Text>
            <Text style={styles.handle}>@handle</Text>
          </View>
        </View>

        {/* Bucket tabs */}
        <View style={styles.bucketTabs}>
          {BUCKETS.map((bucket) => (
            <TouchableOpacity key={bucket} style={styles.bucketTab} activeOpacity={0.7}>
              <Text style={styles.bucketTabText}>{BUCKET_LABELS[bucket]}</Text>
              <Text style={styles.bucketCount}>0</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Empty state */}
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No experiences yet</Text>
          <Text style={styles.emptyBody}>
            Log your first experience to start building your taste profile.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    gap: SPACING.md,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.border,
  },
  userInfo: { flex: 1 },
  name: { fontSize: 20, ...FONT.bold, color: COLORS.text },
  handle: { fontSize: 14, color: COLORS.textMuted, marginTop: 2 },
  bucketTabs: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.xl,
    gap: SPACING.sm,
    flexWrap: 'wrap',
    marginBottom: SPACING.lg,
  },
  bucketTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
  },
  bucketTabText: { fontSize: 13, ...FONT.medium, color: COLORS.text },
  bucketCount: { fontSize: 13, color: COLORS.textMuted },
  empty: {
    paddingHorizontal: SPACING.xxl,
    paddingTop: SPACING.xxl,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  emptyTitle: { fontSize: 17, ...FONT.semibold, color: COLORS.text, textAlign: 'center' },
  emptyBody: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },
});
