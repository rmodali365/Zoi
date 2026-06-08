import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, SafeAreaView,
  ActivityIndicator, FlatList,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FeedStackParamList } from '@/types';
import { searchUsers, getFollowingIds, followUser, unfollowUser, UserResult } from '@/lib/follows';
import { COLORS, SPACING, RADIUS, FONT } from '@/constants/theme';

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
          <Text style={styles.back}>Done</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Find friends</Text>
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
            <Text style={styles.emptyText}>No one found for “{query.trim()}”.</Text>
          ) : null
        }
        renderItem={({ item }) => {
          const isFollowing = following.has(item.id);
          const isPending = pending.has(item.id);
          return (
            <View style={styles.row}>
              <View style={styles.avatar} />
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.handle} numberOfLines={1}>@{item.handle}</Text>
              </View>
              <TouchableOpacity
                style={[styles.followBtn, isFollowing && styles.followingBtn]}
                onPress={() => toggleFollow(item.id)}
                disabled={isPending}
                activeOpacity={0.8}
              >
                <Text style={[styles.followText, isFollowing && styles.followingText]}>
                  {isFollowing ? 'Following' : 'Follow'}
                </Text>
              </TouchableOpacity>
            </View>
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
  back: { fontSize: 15, ...FONT.medium, color: COLORS.accent, width: 50 },
  topTitle: { fontSize: 16, ...FONT.semibold, color: COLORS.text },
  spacer: { width: 50 },
  searchWrap: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.sm },
  input: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: 16,
    color: COLORS.text, backgroundColor: COLORS.surface,
  },
  loading: { position: 'absolute', right: SPACING.xl + SPACING.md, top: 14 },
  list: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.sm },
  emptyText: { fontSize: 15, color: COLORS.textMuted, textAlign: 'center', marginTop: SPACING.xl },
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
