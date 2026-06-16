import React, { useEffect, useRef, useState } from 'react';
import {
  View, StyleSheet, TextInput, TouchableOpacity, SafeAreaView,
  ActivityIndicator, FlatList,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FeedStackParamList } from '@/types';
import { searchUsers, getFollowingIds, followUser, unfollowUser, UserResult } from '@/lib/follows';
import { queryClient } from '@/lib/queryClient';
import { qk } from '@/lib/queryKeys';
import { AppText } from '@/components/ui/AppText';
import { Avatar } from '@/components/ui/Avatar';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<FeedStackParamList, 'FindPeople'>;
};

export function FindPeopleScreen({ navigation }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getFollowingIds().then(setFollowing).catch(() => {});
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 1) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        setResults(await searchUsers(query));
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  async function toggleFollow(id: string) {
    const isFollowing = following.has(id);
    setPending((p) => new Set(p).add(id));
    // optimistic
    setFollowing((prev) => {
      const next = new Set(prev);
      isFollowing ? next.delete(id) : next.add(id);
      return next;
    });
    try {
      if (isFollowing) await unfollowUser(id);
      else await followUser(id);
      // Feed depends on who you follow — refresh it next time it's shown.
      queryClient.invalidateQueries({ queryKey: qk.feed });
    } catch {
      // revert on failure
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
          <AppText variant="body" weight="medium" color={COLORS.accent} style={styles.back}>Done</AppText>
        </TouchableOpacity>
        <AppText variant="body" weight="semibold">Find friends</AppText>
        <View style={styles.spacer} />
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or @handle"
          placeholderTextColor={COLORS.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />
        {loading && <ActivityIndicator style={styles.loading} color={COLORS.textMuted} />}
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          query.trim().length > 0 && !loading ? (
            <AppText variant="body" color={COLORS.textMuted} style={styles.emptyText}>No one found for “{query.trim()}”.</AppText>
          ) : null
        }
        renderItem={({ item }) => {
          const isFollowing = following.has(item.id);
          const isPending = pending.has(item.id);
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
              <TouchableOpacity
                style={[styles.followBtn, isFollowing && styles.followingBtn]}
                onPress={() => toggleFollow(item.id)}
                disabled={isPending}
                activeOpacity={0.8}
              >
                <AppText variant="subhead" weight="semibold" color={isFollowing ? COLORS.text : COLORS.background}>
                  {isFollowing ? 'Following' : 'Follow'}
                </AppText>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md,
  },
  back: { width: 50 },
  spacer: { width: 50 },
  searchWrap: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.sm },
  input: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: 16,
    color: COLORS.text, backgroundColor: COLORS.surface,
  },
  loading: { position: 'absolute', right: SPACING.xl + SPACING.md, top: 14 },
  list: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.sm },
  emptyText: { textAlign: 'center', marginTop: SPACING.xl },
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
