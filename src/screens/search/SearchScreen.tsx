import React, { useState } from 'react';
import {
  View, StyleSheet, SafeAreaView, TextInput,
} from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

export function SearchScreen() {
  const [query, setQuery] = useState('');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <AppText variant="display">Search</AppText>
        <View style={styles.searchBar}>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="City, place, or friend..."
            placeholderTextColor={COLORS.textMuted}
            returnKeyType="search"
          />
        </View>
      </View>

      {!query && (
        <View style={styles.hint}>
          <AppText variant="body" color={COLORS.textSecondary} style={styles.hintText}>
            Search for a city to see what your friends have ranked there.
          </AppText>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.md,
    gap: SPACING.md,
  },
  searchBar: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
  },
  input: {
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.text,
  },
  hint: {
    paddingHorizontal: SPACING.xxl,
    paddingTop: SPACING.xxl,
    alignItems: 'center',
  },
  hintText: {
    textAlign: 'center',
    lineHeight: 22,
  },
});
