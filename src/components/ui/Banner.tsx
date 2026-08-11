import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/ui/AppText';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

export type BannerData = {
  title: string;
  message?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  // Bumped on every show() so re-triggering while one is visible restarts the animation.
  key?: number;
};

// How long the banner stays before auto-dismissing.
const VISIBLE_MS = 2800;

// The in-app confirmation banner (a top toast). Rendered once at the app root by
// BannerProvider so it floats above navigation and survives screen transitions —
// e.g. show it, then navigate to the ranked list, and it lingers over the result.
export function Banner({ banner, onHide }: { banner: BannerData | null; onHide: () => void }) {
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function dismiss() {
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true })
      .start(({ finished }) => finished && onHide());
  }

  useEffect(() => {
    if (!banner) return;
    anim.setValue(0);
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, bounciness: 6, speed: 14 }).start();
    timer.current = setTimeout(dismiss, VISIBLE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [banner?.key]);

  if (!banner) return null;

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] });

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { top: insets.top + SPACING.sm, opacity: anim, transform: [{ translateY }] }]}
    >
      <TouchableOpacity activeOpacity={0.9} onPress={dismiss} style={styles.card}>
        <Ionicons name={banner.icon ?? 'checkmark-circle'} size={22} color={COLORS.brand} />
        <View style={styles.textCol}>
          <AppText variant="subhead" weight="semibold" color={COLORS.text}>{banner.title}</AppText>
          {!!banner.message && (
            <AppText variant="caption" color={COLORS.textSecondary} numberOfLines={2} style={styles.message}>
              {banner.message}
            </AppText>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    zIndex: 1000,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    width: '100%',
    maxWidth: 480,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    shadowColor: COLORS.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  textCol: { flex: 1 },
  message: { marginTop: 1 },
});
