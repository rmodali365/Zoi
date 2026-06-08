import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList } from 'react-native';
import { COLORS, SPACING, FONT } from '@/constants/theme';

export function FeedScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.wordmark}>Zoi</Text>
      </View>
      <FlatList
        data={[]}
        renderItem={() => null}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Follow friends to see their rankings</Text>
            <Text style={styles.emptyBody}>
              When friends rank experiences, they'll show up here.
            </Text>
          </View>
        }
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  wordmark: { fontSize: 22, ...FONT.bold, color: COLORS.text, letterSpacing: -0.5 },
  list: { flexGrow: 1 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xxl,
    paddingTop: 100,
    gap: SPACING.sm,
  },
  emptyTitle: {
    fontSize: 17,
    ...FONT.semibold,
    color: COLORS.text,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
