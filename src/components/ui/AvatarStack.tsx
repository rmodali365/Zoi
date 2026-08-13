import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { COLORS } from '@/constants/theme';

type Props = {
  uris: (string | null | undefined)[];
  size?: number;
  // Beyond this many, the rest collapse into a "+N" chip.
  max?: number;
};

// Overlapping avatars for a group of people — trip members, and (later) everyone
// who logged the same outing. Collapses past `max` so a big group can't push the
// rest of a row off screen.
export function AvatarStack({ uris, size = 24, max = 4 }: Props) {
  if (uris.length === 0) return null;
  const shown = uris.slice(0, max);
  const extra = uris.length - shown.length;
  // Computed out here rather than inline in JSX (the sizes are dynamic, and the
  // lint rule bans inline style objects) — same pattern as Avatar itself.
  const overlap = Math.round(size / 3);
  const radius = (size + 4) / 2;
  const first = { marginLeft: 0, borderRadius: radius };
  const rest = { marginLeft: -overlap, borderRadius: radius };
  const moreStyle = { marginLeft: -overlap, height: size + 4, borderRadius: radius };

  return (
    <View style={styles.row}>
      {shown.map((uri, i) => (
        <View key={i} style={[styles.ring, i === 0 ? first : rest]}>
          <Avatar uri={uri} size={size} />
        </View>
      ))}
      {extra > 0 && (
        <View style={[styles.more, moreStyle]}>
          <AppText variant="footnote" weight="semibold" color={COLORS.textSecondary}>+{extra}</AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  ring: { borderWidth: 2, borderColor: COLORS.surface },
  more: {
    justifyContent: 'center',
    paddingHorizontal: 6,
    backgroundColor: COLORS.border,
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
});
