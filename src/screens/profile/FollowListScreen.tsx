import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList, TouchableOpacity, Image, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import {
  getFollowers, getFollowing, getFollowingIds, followUser, unfollowUser, UserResult,
} from '@/lib/follows';
import { supabase } from '@/lib/supabase';
import { COLORS, SPACING, RADIUS, FONT } from '@/constants/theme';

type FollowListRoute = RouteProp<
  { FollowList: { userId: string; mode: 'followers' | 'following' } },
  'FollowList'
>;

// A scrollable list of a user's followers or following. Each row taps through to
// that user's profile and (unless it's you) has a follow/unfollow toggle.
export function FollowListScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<FollowListRoute>();
  const { userId, mode } = route.params;

  const [users, setUsers] = useState<UserResult[]>([]);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const [list, followingIds] = await Promise.all([
        mode === 'followers' ? getFollowers(userId) : getFollowing(userId),
        getFollowingIds(),
      ]);
      if (!active) return;
      setMeId(user?.id ?? null);
      setUsers(list);
      setFollowing(followingIds);
      setLoading(false);
    })().catch(() => active && setLoading(false));
    return () => { active = false; };
  }, [userId, mode]);

  async function toggleFollow(id: string) {
    const isFollowing = following.has(id);
    setPending((p) => new Set(p).add(id));
    setFollowing((prev) => {
      const next = new Set(prev);
      isFollowing ? next.delete(id) : next.add(id);
      return next;
    });
    try {
      if (isFollowing) await unfollowUser(id);
      else await followUser(id);
    } catch {
      setFollowing((prev) => {
        const next = new Set(prev);
        isFollowing ? next.add(id) : next.delete(id);
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>{mode === 'followers' ? 'Followers' : 'Following'}</Text>
        <View style={styles.spacer} />
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={COLORS.text} /></View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {mode === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
            </Text>
          }
          renderItem={({ item }) => {
            const isMe = item.id === meId;
            const isFollowing = following.has(item.id);
            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() => navigation.navigate('UserProfile', { userId: item.id })}
                activeOpacity={0.7}
              >
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatar} />
                )}
                <View style={styles.info}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.handle} numberOfLines={1}>@{item.handle}</Text>
                </View>
                {!isMe && (
                  <TouchableOpacity
                    style={[styles.followBtn, isFollowing && styles.followingBtn]}
                    onPress={() => toggleFollow(item.id)}
                    disabled={pending.has(item.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.followText, isFollowing && styles.followingText]}>
                      {isFollowing ? 'Following' : 'Follow'}
                    </Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md,
  },
  back: { fontSize: 16, ...FONT.medium, color: COLORS.accent, width: 60 },
  topTitle: { fontSize: 16, ...FONT.semibold, color: COLORS.text },
  spacer: { width: 60 },
  list: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.sm, flexGrow: 1 },
  emptyText: { fontSize: 15, color: COLORS.textMuted, textAlign: 'center', marginTop: SPACING.xxl },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.border },
  info: { flex: 1 },
  name: { fontSize: 16, ...FONT.semibold, color: COLORS.text },
  handle: { fontSize: 14, color: COLORS.textMuted, marginTop: 1 },
  followBtn: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 4,
    borderRadius: RADIUS.full, backgroundColor: COLORS.text,
  },
  followingBtn: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  followText: { fontSize: 14, ...FONT.semibold, color: COLORS.background },
  followingText: { color: COLORS.text },
});
