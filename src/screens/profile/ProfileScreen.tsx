import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Alert,
  Image, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { ProfileStackParamList, User, Experience, Trip } from '@/types';
import { SENTIMENT_EMOJI } from '@/constants/experiences';
import { SuggestedUsers } from '@/components/SuggestedUsers';
import { shareProfile } from '@/lib/share';
import { uploadAvatar } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { COLORS, SPACING, FONT, RADIUS } from '@/constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<ProfileStackParamList, 'ProfileHome'>;
};

const TRIP_CARD = 140;

export function ProfileScreen({ navigation }: Props) {
  const [profile, setProfile] = useState<User | null>(null);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const [{ data: prof }, { data: exps }, { data: tr }] = await Promise.all([
      supabase.from('users').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('experiences').select('*').eq('user_id', user.id).order('rank_key', { ascending: true }),
      supabase.from('trips').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ]);
    setProfile((prof as User) ?? null);
    setExperiences((exps ?? []) as Experience[]);
    setTrips((tr ?? []) as Trip[]);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  async function handlePickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setUploading(true);
    try {
      const url = await uploadAvatar(user.id, result.assets[0].uri);
      const { error } = await supabase.from('users').update({ avatar_url: url }).eq('id', user.id);
      if (error) throw error;
      setProfile((p) => (p ? { ...p, avatar_url: url } : p));
    } catch {
      Alert.alert('Upload failed', 'Could not update your profile picture. Try again.');
    } finally {
      setUploading(false);
    }
  }

  function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        // RootNavigator's onAuthStateChange switches back to Auth automatically
        onPress: () => supabase.auth.signOut(),
      },
    ]);
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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handlePickAvatar} activeOpacity={0.8}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]} />
            )}
            <View style={styles.cameraBadge}>
              {uploading
                ? <ActivityIndicator size="small" color={COLORS.background} />
                : <Ionicons name="camera" size={14} color={COLORS.background} />}
            </View>
          </TouchableOpacity>

          <View style={styles.userInfo}>
            <Text style={styles.name}>{profile?.name ?? 'Your Name'}</Text>
            <Text style={styles.handle}>@{profile?.handle ?? 'handle'}</Text>
          </View>

          <View style={styles.headerActions}>
            {!!profile && (
              <TouchableOpacity
                onPress={() => shareProfile(profile.id, profile.handle)}
                activeOpacity={0.7}
                hitSlop={8}
              >
                <Ionicons name="share-outline" size={22} color={COLORS.text} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleSignOut} activeOpacity={0.7} hitSlop={8}>
              <Text style={styles.signOut}>Sign out</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Who to follow */}
        <SuggestedUsers onPressUser={(id) => navigation.navigate('UserProfile', { userId: id })} />

        {/* Experiences — simplified ranked list */}
        <Text style={styles.sectionTitle}>
          {experiences.length} {experiences.length === 1 ? 'experience' : 'experiences'}
        </Text>

        {experiences.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No experiences yet</Text>
            <Text style={styles.emptyBody}>
              Log your first experience to start building your taste profile.
            </Text>
          </View>
        ) : (
          experiences.map((item, i) => (
            <View key={item.id} style={styles.row}>
              <Text style={styles.rank}>{i + 1}</Text>
              <View style={styles.rowInfo}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {SENTIMENT_EMOJI[item.sentiment]} {item.location.name}
                </Text>
                {!!(item.location.city || item.location.region) && (
                  <Text style={styles.rowPlace} numberOfLines={1}>
                    {[item.location.city, item.location.region].filter(Boolean).join(', ')}
                  </Text>
                )}
              </View>
            </View>
          ))
        )}

        {/* Trips */}
        <Text style={[styles.sectionTitle, styles.tripsTitle]}>Trips</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tripRow}>
          {trips.length === 0 ? (
            <View style={[styles.tripCard, styles.tripPlaceholder]}>
              <Text style={styles.tripPlaceholderText}>No trips yet</Text>
            </View>
          ) : (
            trips.map((trip) => (
              <TouchableOpacity
                key={trip.id}
                style={styles.tripCard}
                onPress={() => navigation.navigate('TripDetail', { tripId: trip.id })}
                activeOpacity={0.85}
              >
                {trip.cover_photo ? (
                  <Image source={{ uri: trip.cover_photo }} style={styles.tripCover} />
                ) : (
                  <View style={[styles.tripCover, styles.tripCoverPlaceholder]}>
                    <Text style={styles.tripEmoji}>🧳</Text>
                  </View>
                )}
                <Text style={styles.tripTitle} numberOfLines={1}>{trip.title}</Text>
                {!!trip.destination && (
                  <Text style={styles.tripDest} numberOfLines={1}>{trip.destination}</Text>
                )}
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: SPACING.xxl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    gap: SPACING.md,
  },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.border },
  avatarPlaceholder: { backgroundColor: COLORS.border },
  cameraBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: COLORS.text,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.background,
  },
  userInfo: { flex: 1 },
  name: { fontSize: 20, ...FONT.bold, color: COLORS.text },
  handle: { fontSize: 14, color: COLORS.textMuted, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  signOut: { fontSize: 14, ...FONT.medium, color: COLORS.textSecondary },
  sectionTitle: {
    fontSize: 13, ...FONT.semibold, color: COLORS.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingHorizontal: SPACING.xl, marginBottom: SPACING.sm,
  },
  tripsTitle: { marginTop: SPACING.lg },
  tripRow: { paddingHorizontal: SPACING.xl, gap: SPACING.sm, marginBottom: SPACING.lg },
  tripCard: { width: TRIP_CARD },
  tripCover: {
    width: TRIP_CARD, height: TRIP_CARD, borderRadius: RADIUS.md,
    backgroundColor: COLORS.border, marginBottom: SPACING.xs,
  },
  tripCoverPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.accentLight },
  tripEmoji: { fontSize: 40 },
  tripTitle: { fontSize: 14, ...FONT.semibold, color: COLORS.text },
  tripDest: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  tripPlaceholder: {
    height: TRIP_CARD, borderRadius: RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  tripPlaceholderText: { fontSize: 13, color: COLORS.textMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm + 2,
    gap: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  rank: { fontSize: 15, ...FONT.bold, color: COLORS.textMuted, width: 26, textAlign: 'center' },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 16, ...FONT.medium, color: COLORS.text },
  rowPlace: { fontSize: 13, color: COLORS.textMuted, marginTop: 1 },
  empty: {
    paddingHorizontal: SPACING.xxl,
    paddingTop: SPACING.xl,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  emptyTitle: { fontSize: 17, ...FONT.semibold, color: COLORS.text, textAlign: 'center' },
  emptyBody: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },
});
