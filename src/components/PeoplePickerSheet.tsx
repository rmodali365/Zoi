import React, { useState } from 'react';
import {
  View, StyleSheet, Modal, ScrollView, TouchableOpacity, TextInput, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { searchUsers, getFollowing, UserResult } from '@/lib/follows';
import { getMyUserId } from '@/lib/auth';
import { AppText } from '@/components/ui/AppText';
import { Avatar } from '@/components/ui/Avatar';
import { SheetBackdrop } from '@/components/ui/SheetBackdrop';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

type Props = {
  visible: boolean;
  title: string;
  // Currently selected people; the sheet edits this list live.
  selected: UserResult[];
  onChange: (users: UserResult[]) => void;
  onClose: () => void;
};

// Multi-select people picker — "who were you with?" on a log (#67). Opens on the
// people you follow (the usual answer is someone you already follow) and falls
// back to search across everyone.
export function PeoplePickerSheet({ visible, title, selected, onChange, onClose }: Props) {
  const [query, setQuery] = useState('');
  const searching = query.trim().length > 0;

  const { data: following = [], isFetching: loadingFollowing } = useQuery({
    queryKey: ['following-picker'],
    queryFn: async () => {
      const me = await getMyUserId();
      return me ? getFollowing(me) : [];
    },
    enabled: visible,
  });
  const { data: results = [], isFetching: loadingSearch } = useQuery({
    queryKey: ['user-search', query],
    queryFn: () => searchUsers(query),
    enabled: searching,
  });

  const list = searching ? results : following;
  const isFetching = searching ? loadingSearch : loadingFollowing;
  const selectedIds = new Set(selected.map((u) => u.id));

  function toggle(user: UserResult) {
    onChange(
      selectedIds.has(user.id)
        ? selected.filter((u) => u.id !== user.id)
        : [...selected, user],
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <SheetBackdrop>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <AppText variant="title">{title}</AppText>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <AppText variant="body" weight="semibold" color={COLORS.brand}>Done</AppText>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or @handle"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {isFetching && <ActivityIndicator color={COLORS.textSecondary} style={styles.spinner} />}

          <ScrollView keyboardShouldPersistTaps="handled" style={styles.list}>
            {!searching && following.length > 0 && (
              <AppText variant="caption" weight="semibold" color={COLORS.textSecondary} style={styles.sectionLabel}>
                PEOPLE YOU FOLLOW
              </AppText>
            )}
            {list.length === 0 && !isFetching && (
              <AppText variant="body" color={COLORS.textSecondary} style={styles.empty}>
                {searching ? 'Nobody by that name.' : 'Follow some friends first, or search for them above.'}
              </AppText>
            )}
            {list.map((u) => {
              const on = selectedIds.has(u.id);
              return (
                <TouchableOpacity key={u.id} style={styles.row} onPress={() => toggle(u)} activeOpacity={0.7}>
                  <Avatar uri={u.avatar_url} size={36} />
                  <View style={styles.rowBody}>
                    <AppText variant="body" weight="semibold" numberOfLines={1}>{u.name}</AppText>
                    <AppText variant="caption" color={COLORS.textSecondary}>@{u.handle}</AppText>
                  </View>
                  <Ionicons
                    name={on ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={on ? COLORS.brand : COLORS.border}
                  />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </SheetBackdrop>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg,
    padding: SPACING.xl, paddingBottom: SPACING.xxl, gap: SPACING.md,
    minHeight: 420, maxHeight: '85%',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  input: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: 15, color: COLORS.text,
    backgroundColor: COLORS.surface, minHeight: 48,
  },
  spinner: { paddingVertical: SPACING.sm },
  list: { flexShrink: 1 },
  sectionLabel: { textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: SPACING.xs },
  empty: { paddingVertical: SPACING.lg, lineHeight: 22 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  rowBody: { flex: 1, gap: 1 },
});
