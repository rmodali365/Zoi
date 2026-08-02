import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

type Props = {
  following: boolean;
  onPress: () => void;
  disabled?: boolean;
};

// The Follow / Following toggle pill. Shared by user rows, Find People and the
// user-profile header so the two states can't drift apart visually.
export function FollowButton({ following, onPress, disabled }: Props) {
  return (
    <TouchableOpacity
      style={[styles.btn, following && styles.followingBtn]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <AppText variant="subhead" weight="semibold" color={following ? COLORS.text : COLORS.background}>
        {following ? 'Following' : 'Follow'}
      </AppText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 4,
    borderRadius: RADIUS.full, backgroundColor: COLORS.brand,
  },
  followingBtn: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
});
