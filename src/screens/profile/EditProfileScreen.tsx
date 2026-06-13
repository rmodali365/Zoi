import React, { useEffect, useState } from 'react';
import {
  View, StyleSheet, SafeAreaView, TextInput, TouchableOpacity, Image,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { ProfileStackParamList, User } from '@/types';
import { cleanHandle, updateProfile } from '@/lib/users';
import { uploadAvatar } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { AppText } from '@/components/ui/AppText';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<ProfileStackParamList, 'EditProfile'>;
};

export function EditProfileScreen({ navigation }: Props) {
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle();
      if (!active) return;
      const prof = data as User | null;
      setUserId(user.id);
      setName(prof?.name ?? '');
      setHandle(prof?.handle ?? '');
      setAvatarUrl(prof?.avatar_url ?? null);
      setLoading(false);
    })().catch(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const handleClean = cleanHandle(handle);
  const canSave = name.trim().length > 0 && handleClean.length >= 2 && !saving;

  async function pickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (result.canceled || !userId) return;
    setUploading(true);
    try {
      const url = await uploadAvatar(userId, result.assets[0].uri);
      const { error } = await supabase.from('users').update({ avatar_url: url }).eq('id', userId);
      if (error) throw error;
      setAvatarUrl(url);
    } catch {
      Alert.alert('Upload failed', 'Could not update your profile picture. Try again.');
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!userId || !canSave) return;
    setSaving(true);
    const result = await updateProfile(userId, { name: name.trim(), handle: handleClean });
    setSaving(false);
    if (result.ok) {
      navigation.goBack();
      return;
    }
    if (result.error === 'handle_taken') {
      Alert.alert('Handle taken', `@${handleClean} is already in use. Pick another.`);
    } else {
      Alert.alert('Error', 'Could not save your profile. Try again.');
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator color={COLORS.text} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <AppText variant="body" color={COLORS.textSecondary}>Cancel</AppText>
        </TouchableOpacity>
        <AppText variant="body" weight="semibold">Edit profile</AppText>
        <TouchableOpacity onPress={handleSave} hitSlop={8} disabled={!canSave}>
          {saving
            ? <ActivityIndicator color={COLORS.accent} />
            : <AppText variant="body" weight="semibold" color={canSave ? COLORS.accent : COLORS.textMuted}>Save</AppText>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Avatar */}
        <View style={styles.avatarWrap}>
          <TouchableOpacity onPress={pickAvatar} activeOpacity={0.8}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]} />
            )}
            <View style={styles.cameraBadge}>
              {uploading
                ? <ActivityIndicator size="small" color={COLORS.background} />
                : <Ionicons name="camera" size={14} color={COLORS.background} />}
            </View>
          </TouchableOpacity>
          <AppText variant="caption">Tap to change photo</AppText>
        </View>

        {/* Name */}
        <View style={styles.field}>
          <AppText variant="caption" weight="medium" color={COLORS.textSecondary} style={styles.label}>Name</AppText>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={COLORS.textMuted}
            maxLength={50}
          />
        </View>

        {/* Handle */}
        <View style={styles.field}>
          <AppText variant="caption" weight="medium" color={COLORS.textSecondary} style={styles.label}>Handle</AppText>
          <View style={styles.handleRow}>
            <AppText variant="headline" weight="regular" color={COLORS.textSecondary}>@</AppText>
            <TextInput
              style={[styles.input, styles.handleInput]}
              value={handle}
              onChangeText={setHandle}
              placeholder="yourhandle"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
            />
          </View>
          {handle.length > 0 && handle !== handleClean && (
            <AppText variant="caption" style={styles.hint}>Will be saved as @{handleClean}</AppText>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  content: { padding: SPACING.xl, gap: SPACING.lg },
  avatarWrap: { alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: COLORS.border },
  avatarPlaceholder: { backgroundColor: COLORS.border },
  cameraBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.text,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.background,
  },
  field: { gap: SPACING.sm },
  label: { textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: 14, fontSize: 16,
    color: COLORS.text, backgroundColor: COLORS.surface,
  },
  handleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  handleInput: { flex: 1 },
  hint: { marginTop: 2 },
});
