import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { COLORS } from '@/constants/theme';

type Props = {
  uri?: string | null;
  size?: number;
};

// User avatar with a neutral placeholder when there's no image.
export function Avatar({ uri, size = 44 }: Props) {
  const style = { width: size, height: size, borderRadius: size / 2 };
  if (uri) return <Image source={{ uri }} style={[styles.base, style]} />;
  return <View style={[styles.base, style]} />;
}

const styles = StyleSheet.create({
  base: { backgroundColor: COLORS.border },
});
