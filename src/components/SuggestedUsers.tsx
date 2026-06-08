import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { getSuggestedUsers, followUser, UserResult } from '@/lib/follows';
import { COLORS, SPACING, RADIUS, FONT } from '@/constants/theme';

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
      <Text style={styles.title}>Suggested for you</Text>
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
                  {u.avatar_url ? (
                    <Image source={{ uri: u.avatar_url }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]} />
                  )}
                  <Text style={styles.name} numberOfLines={1}>{u.name}</Text>
                  <Text style={styles.handle} numberOfLines={1}>@{u.handle}</Text>
                  <TouchableOpacity
                    style={[styles.btn, isFollowed && styles.btnDone]}
                    onPress={() => follow(u.id)}
                    disabled={isFollowed || pending.has(u.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.btnText, isFollowed && styles.btnDoneText]}>
                      {isFollowed ? 'Following' : 'Follow'}
                    </Text>
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
    fontSize: 13, ...FONT.semibold, color: COLORS.textSecondary,
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
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.border, marginBottom: 2 },
  avatarPlaceholder: { backgroundColor: COLORS.border },
  name: { fontSize: 14, ...FONT.semibold, color: COLORS.text, maxWidth: CARD - SPACING.md },
  handle: { fontSize: 12, color: COLORS.textMuted, maxWidth: CARD - SPACING.md },
  btn: {
    marginTop: 6,
    backgroundColor: COLORS.text,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
  },
  btnDone: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  btnText: { fontSize: 13, ...FONT.semibold, color: COLORS.background },
  btnDoneText: { color: COLORS.text },
});
