import React, { useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TextInput,
} from 'react-native';
import { COLORS, SPACING, RADIUS, FONT } from '@/constants/theme';

export function SearchScreen() {
  const [query, setQuery] = useState('');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Search</Text>
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
          <Text style={styles.hintText}>
            Search for a city to see what your friends have ranked there.
          </Text>
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
  title: { fontSize: 28, ...FONT.bold, color: COLORS.text, letterSpacing: -0.5 },
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
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
