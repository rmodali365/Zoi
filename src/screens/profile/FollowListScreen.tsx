import React, { useEffect, useState } from 'react';
import {
  View, StyleSheet, SafeAreaView, FlatList, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import {
  getFollowers, getFollowing, getFollowingIds, followUser, unfollowUser, UserResult,
} from '@/lib/follows';
import { supabase } from '@/lib/supabase';
import { AppText } from '@/components/ui/AppText';
import { Avatar } from '@/components/ui/Avatar';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

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
          <AppText variant="body" weight="medium" color={COLORS.accent} style={styles.back}>‹ Back</AppText>
        </TouchableOpacity>
        <AppText variant="body" weight="semibold">{mode === 'followers' ? 'Followers' : 'Following'}</AppText>
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
            <AppText variant="body" color={COLORS.textMuted} style={styles.emptyText}>
              {mode === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
            </AppText>
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
                <Avatar uri={item.avatar_url} size={44} />
                <View style={styles.info}>
                  <AppText variant="body" weight="semibold" numberOfLines={1}>{item.name}</AppText>
                  <AppText variant="subhead" weight="regular" color={COLORS.textMuted} numberOfLines={1}>@{item.handle}</AppText>
                </View>
                {!isMe && (
                  <TouchableOpacity
                    style={[styles.followBtn, isFollowing && styles.followingBtn]}
                    onPress={() => toggleFollow(item.id)}
                    disabled={pending.has(item.id)}
                    activeOpacity={0.8}
                  >
                    <AppText variant="subhead" weight="semibold" color={isFollowing ? COLORS.text : COLORS.background}>
                      {isFollowing ? 'Following' : 'Follow'}
                    </AppText>
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
  back: { width: 60 },
  spacer: { width: 60 },
  list: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.sm, flexGrow: 1 },
  emptyText: { textAlign: 'center', marginTop: SPACING.xxl },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  info: { flex: 1 },
  followBtn: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 4,
    borderRadius: RADIUS.full, backgroundColor: COLORS.text,
  },
  followingBtn: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
});
