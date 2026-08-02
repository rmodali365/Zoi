import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { Avatar } from '@/components/ui/Avatar';
import { FollowButton } from '@/components/ui/FollowButton';
import { COLORS, SPACING } from '@/constants/theme';

type Props = {
  name: string;
  handle: string;
  avatarUrl?: string | null;
  onPress?: () => void;
  // Follow button (optional). When `following` is provided, renders the toggle.
  following?: boolean;
  onToggleFollow?: () => void;
  followDisabled?: boolean;
};

// Shared "user list row": avatar + name/@handle + optional follow toggle.
// Used by Find People, follower/following lists, etc.
export function UserRow({
  name, handle, avatarUrl, onPress, following, onToggleFollow, followDisabled,
}: Props) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} disabled={!onPress} activeOpacity={0.7}>
      <Avatar uri={avatarUrl} size={44} />
      <View style={styles.info}>
        <AppText variant="headline" numberOfLines={1}>{name}</AppText>
        <AppText variant="caption" numberOfLines={1}>@{handle}</AppText>
      </View>
      {onToggleFollow && (
        <FollowButton following={!!following} onPress={onToggleFollow} disabled={followDisabled} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  info: { flex: 1 },
});
