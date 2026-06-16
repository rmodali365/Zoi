import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { getSuggestedUsers, followUser, UserResult } from '@/lib/follows';
import { queryClient } from '@/lib/queryClient';
import { qk } from '@/lib/queryKeys';
import { AppText } from '@/components/ui/AppText';
import { Avatar } from '@/components/ui/Avatar';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

const CARD = 140;

// onPressUser, when provided, opens a user's profile when their card is tapped.
export function SuggestedUsers({ onPressUser }: { onPressUser?: (id: string) => void }) {
  const [users, setUsers] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());

  useEffect(() => {
    getSuggestedUsers()
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, []);

  async function follow(id: string) {
    setPending((p) => new Set(p).add(id));
    setFollowed((prev) => new Set(prev).add(id));
    try {
      await followUser(id);
      queryClient.invalidateQueries({ queryKey: qk.feed });
    } catch {
      setFollowed((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(id);
        return next;
      });
    }
  }

  // Hide entirely once loaded with no suggestions.
  if (!loading && users.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <AppText variant="caption" weight="semibold" color={COLORS.textSecondary} style={styles.title}>
        Suggested for you
      </AppText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {loading
          ? [0, 1, 2].map((i) => <View key={i} style={[styles.card, styles.skeleton]} />)
          : users.map((u) => {
              const isFollowed = followed.has(u.id);
              return (
                <TouchableOpacity
                  key={u.id}
                  style={styles.card}
                  onPress={() => onPressUser?.(u.id)}
                  disabled={!onPressUser}
                  activeOpacity={0.8}
                >
                  <Avatar uri={u.avatar_url} size={52} />
                  <AppText variant="subhead" weight="semibold" color={COLORS.text} numberOfLines={1} style={styles.name}>{u.name}</AppText>
                  <AppText variant="footnote" numberOfLines={1} style={styles.name}>@{u.handle}</AppText>
                  <TouchableOpacity
                    style={[styles.btn, isFollowed && styles.btnDone]}
                    onPress={() => follow(u.id)}
                    disabled={isFollowed || pending.has(u.id)}
                    activeOpacity={0.8}
                  >
                    <AppText variant="caption" weight="semibold" color={isFollowed ? COLORS.text : COLORS.background}>
                      {isFollowed ? 'Following' : 'Follow'}
                    </AppText>
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: SPACING.lg },
  title: {
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingHorizontal: SPACING.xl, marginBottom: SPACING.sm,
  },
  row: { paddingHorizontal: SPACING.xl, gap: SPACING.sm },
  card: {
    width: CARD,
    height: CARD,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  skeleton: { backgroundColor: COLORS.accentLight, borderColor: COLORS.accentLight },
  name: { maxWidth: CARD - SPACING.md },
  btn: {
    marginTop: 6,
    backgroundColor: COLORS.text,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
  },
  btnDone: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
});
