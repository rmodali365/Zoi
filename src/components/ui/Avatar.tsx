import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/constants/theme';

type Props = {
  uri?: string | null;
  size?: number;
};

// User avatar. With no image, falls back to a person silhouette on a neutral
// circle (Instagram-style default) — the glyph scales with the circle so it reads
// the same at 36px in a feed card as at 96px on the edit-profile screen.
export function Avatar({ uri, size = 44 }: Props) {
  const style = { width: size, height: size, borderRadius: size / 2 };
  if (uri) return <Image source={{ uri }} style={[styles.base, style]} />;
  return (
    <View style={[styles.base, styles.placeholder, style]}>
      <Ionicons name="person" size={size * 0.58} color={COLORS.textMuted} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: COLORS.border },
  placeholder: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
