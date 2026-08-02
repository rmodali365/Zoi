import React, { useEffect, useRef, useState } from 'react';
import {
  View, StyleSheet, TextInput, TouchableOpacity, SafeAreaView,
  ActivityIndicator, FlatList, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FeedStackParamList } from '@/types';
import { searchUsers, getFollowingIds, followUser, unfollowUser, UserResult } from '@/lib/follows';
import { findContactsOnZoi } from '@/lib/contacts';
import { getMyProfile } from '@/lib/me';
import { shareProfile } from '@/lib/share';
import { queryClient } from '@/lib/queryClient';
import { qk } from '@/lib/queryKeys';
import { AppText } from '@/components/ui/AppText';
import { UserRow } from '@/components/UserRow';
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
  // Contacts matching (#60): null = not fetched yet (show the CTA).
  const [contacts, setContacts] = useState<UserResult[] | null>(null);
  const [contactsLoading, setContactsLoading] = useState(false);
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

  // Match phone contacts to Zoi users. Numbers are hashed on device — only
  // hashes reach the match-contacts Edge Function (see lib/contacts.ts).
  async function scanContacts() {
    setContactsLoading(true);
    try {
      const matches = await findContactsOnZoi();
      if (matches === null) {
        Alert.alert(
          'Contacts access needed',
          'Allow contacts access in Settings to see which of your friends are on Zoi.',
        );
      } else {
        setContacts(matches);
      }
    } catch {
      Alert.alert('Could not check contacts', 'Try again in a moment.');
    } finally {
      setContactsLoading(false);
    }
  }

  // Invite = share your own profile link via the native share sheet.
  async function invite() {
    const me = await getMyProfile();
    if (me) await shareProfile(me.id, me.handle);
  }

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
        data={query.trim().length > 0 ? results : contacts ?? []}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          query.trim().length === 0 ? (
            <View>
              {contacts === null ? (
                <TouchableOpacity
                  style={styles.contactsCta}
                  onPress={scanContacts}
                  disabled={contactsLoading}
                  activeOpacity={0.85}
                >
                  {contactsLoading ? (
                    <ActivityIndicator color={COLORS.brand} />
                  ) : (
                    <>
                      <Ionicons name="people-outline" size={20} color={COLORS.brand} />
                      <AppText variant="body" weight="semibold" color={COLORS.brand}>See who’s in your contacts</AppText>
                    </>
                  )}
                </TouchableOpacity>
              ) : (
                <AppText variant="caption" weight="semibold" color={COLORS.textSecondary} style={styles.sectionTitle}>
                  {contacts.length > 0 ? 'From your contacts' : 'No one from your contacts is on Zoi yet'}
                </AppText>
              )}
              <TouchableOpacity style={styles.inviteRow} onPress={invite} activeOpacity={0.7}>
                <Ionicons name="paper-plane-outline" size={18} color={COLORS.textSecondary} />
                <AppText variant="body" color={COLORS.textSecondary}>Invite friends to Zoi</AppText>
              </TouchableOpacity>
            </View>
          ) : null
        }
        ListEmptyComponent={
          query.trim().length > 0 && !loading ? (
            <AppText variant="body" color={COLORS.textMuted} style={styles.emptyText}>No one found for “{query.trim()}”.</AppText>
          ) : null
        }
        renderItem={({ item }) => (
          <UserRow
            name={item.name}
            handle={item.handle}
            avatarUrl={item.avatar_url}
            onPress={() => navigation.navigate('UserProfile', { userId: item.id })}
            following={following.has(item.id)}
            onToggleFollow={() => toggleFollow(item.id)}
            followDisabled={pending.has(item.id)}
          />
        )}
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
  contactsCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    borderWidth: 1.5, borderColor: COLORS.brand, borderRadius: RADIUS.md,
    paddingVertical: SPACING.md, marginBottom: SPACING.sm,
  },
  sectionTitle: {
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: SPACING.sm, marginBottom: SPACING.xs,
  },
  inviteRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs,
    paddingVertical: SPACING.sm, marginBottom: SPACING.xs,
  },
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
