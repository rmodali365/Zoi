import React, { useState } from 'react';
import {
  View, StyleSheet, TextInput, TouchableOpacity, SafeAreaView, ScrollView,
  Image, ActivityIndicator, Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LogStackParamList } from '@/types';
import { AppText } from '@/components/ui/AppText';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';
import { getMyUserId } from '@/lib/auth';
import { uploadExperiencePhotos } from '@/lib/storage';
import { createTrip, parseDateInput } from '@/lib/trips';

type Props = {
  navigation: NativeStackNavigationProp<LogStackParamList, 'StartTrip'>;
};

export function StartTripScreen({ navigation }: Props) {
  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('');
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);

  async function pickCover() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled) setCoverUri(result.assets[0].uri);
  }

  async function handleCreate() {
    if (!title.trim()) {
      Alert.alert('Name your trip', 'Give it a title so you can find it later.');
      return;
    }

    let start: string | null;
    let end: string | null;
    try {
      start = parseDateInput(startDate);
      end = parseDateInput(endDate);
    } catch (e) {
      Alert.alert('Check your dates', e instanceof Error ? e.message : 'Invalid date.');
      return;
    }

    setLoading(true);

    const userId = await getMyUserId();
    if (!userId) {
      Alert.alert('Error', 'Session expired.');
      setLoading(false);
      return;
    }

    let coverUrl: string | null = null;
    if (coverUri) {
      try {
        [coverUrl] = await uploadExperiencePhotos(userId, [coverUri]);
      } catch {
        Alert.alert('Cover upload failed', 'Creating the trip without a cover photo.');
      }
    }

    let tripId: string;
    try {
      tripId = await createTrip({
        title: title.trim(),
        destination: destination.trim() || null,
        start_date: start,
        end_date: end,
        cover_photo: coverUrl,
      });
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not create trip.');
      return;
    } finally {
      setLoading(false);
    }

    Alert.alert('Trip created', 'Add an experience to it now, or come back later.', [
      { text: 'Later', style: 'cancel', onPress: () => navigation.popToTop() },
      { text: 'Add experience', onPress: () => navigation.replace('AddExperience', { tripId }) },
    ]);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <AppText variant="body" color={COLORS.textSecondary}>Cancel</AppText>
        </TouchableOpacity>
        <AppText variant="body" weight="semibold">New trip</AppText>
        <TouchableOpacity onPress={handleCreate} hitSlop={8} disabled={loading}>
          {loading
            ? <ActivityIndicator color={COLORS.accent} />
            : <AppText variant="body" weight="semibold" color={COLORS.accent}>Create</AppText>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.coverPicker} onPress={pickCover} activeOpacity={0.85}>
          {coverUri ? (
            <Image source={{ uri: coverUri }} style={styles.cover} />
          ) : (
            <View style={[styles.cover, styles.coverPlaceholder]}>
              <Ionicons name="image-outline" size={28} color={COLORS.textMuted} />
              <AppText variant="caption">Add a cover photo (optional)</AppText>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.field}>
          <AppText variant="caption" weight="medium" color={COLORS.textSecondary} style={styles.label}>Trip name</AppText>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Lisbon 2026"
            placeholderTextColor={COLORS.textMuted}
          />
        </View>

        <View style={styles.field}>
          <AppText variant="caption" weight="medium" color={COLORS.textSecondary} style={styles.label}>Destination (optional)</AppText>
          <TextInput
            style={styles.input}
            value={destination}
            onChangeText={setDestination}
            placeholder="Lisbon, Portugal"
            placeholderTextColor={COLORS.textMuted}
            autoCorrect={false}
          />
        </View>

        <View style={styles.dateRow}>
          <View style={[styles.field, styles.dateField]}>
            <AppText variant="caption" weight="medium" color={COLORS.textSecondary} style={styles.label}>Start (optional)</AppText>
            <TextInput
              style={styles.input}
              value={startDate}
              onChangeText={setStartDate}
              placeholder="2026-06-03"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View style={[styles.field, styles.dateField]}>
            <AppText variant="caption" weight="medium" color={COLORS.textSecondary} style={styles.label}>End (optional)</AppText>
            <TextInput
              style={styles.input}
              value={endDate}
              onChangeText={setEndDate}
              placeholder="2026-06-10"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        <AppText variant="subhead" weight="regular" color={COLORS.textMuted} style={styles.hint}>
          A trip is a container for an itinerary. Add planned stops or log experiences into it —
          each experience still gets ranked on its own.
        </AppText>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  content: { padding: SPACING.xl, gap: SPACING.lg },
  coverPicker: { borderRadius: RADIUS.lg, overflow: 'hidden' },
  cover: { width: '100%', height: 160, borderRadius: RADIUS.lg, backgroundColor: COLORS.border },
  coverPlaceholder: { alignItems: 'center', justifyContent: 'center', gap: SPACING.xs },
  field: { gap: SPACING.sm },
  label: { textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
  },
  dateRow: { flexDirection: 'row', gap: SPACING.md },
  dateField: { flex: 1 },
  hint: { lineHeight: 20 },
});
