import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { Avatar } from '@/components/ui/Avatar';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

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
        <TouchableOpacity
          style={[styles.followBtn, following && styles.followingBtn]}
          onPress={onToggleFollow}
          disabled={followDisabled}
          activeOpacity={0.8}
        >
          <AppText variant="subhead" weight="semibold" color={following ? COLORS.text : COLORS.surface}>
            {following ? 'Following' : 'Follow'}
          </AppText>
        </TouchableOpacity>
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
  followBtn: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 4,
    borderRadius: RADIUS.full, backgroundColor: COLORS.brand,
  },
  followingBtn: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
});
