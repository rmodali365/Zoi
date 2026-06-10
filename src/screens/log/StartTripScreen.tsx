import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, SafeAreaView, ScrollView,
  Image, ActivityIndicator, Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LogStackParamList } from '@/types';
import { COLORS, SPACING, RADIUS, FONT } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { uploadExperiencePhotos } from '@/lib/storage';
import { parseDateInput } from '@/lib/trips';

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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert('Error', 'Session expired.');
      setLoading(false);
      return;
    }

    let coverUrl: string | null = null;
    if (coverUri) {
      try {
        [coverUrl] = await uploadExperiencePhotos(user.id, [coverUri]);
      } catch {
        Alert.alert('Cover upload failed', 'Creating the trip without a cover photo.');
      }
    }

    const { data, error } = await supabase
      .from('trips')
      .insert({
        user_id: user.id,
        title: title.trim(),
        destination: destination.trim() || null,
        start_date: start,
        end_date: end,
        cover_photo: coverUrl,
      })
      .select('id')
      .single();

    setLoading(false);

    if (error || !data) {
      Alert.alert('Error', error?.message ?? 'Could not create trip.');
      return;
    }

    Alert.alert('Trip created', 'Add an experience to it now, or come back later.', [
      { text: 'Later', style: 'cancel', onPress: () => navigation.popToTop() },
      { text: 'Add experience', onPress: () => navigation.replace('AddExperience', { tripId: data.id }) },
    ]);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>New trip</Text>
        <TouchableOpacity onPress={handleCreate} hitSlop={8} disabled={loading}>
          {loading ? <ActivityIndicator color={COLORS.accent} /> : <Text style={styles.create}>Create</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.coverPicker} onPress={pickCover} activeOpacity={0.85}>
          {coverUri ? (
            <Image source={{ uri: coverUri }} style={styles.cover} />
          ) : (
            <View style={[styles.cover, styles.coverPlaceholder]}>
              <Ionicons name="image-outline" size={28} color={COLORS.textMuted} />
              <Text style={styles.coverHint}>Add a cover photo (optional)</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.field}>
          <Text style={styles.label}>Trip name</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Lisbon 2026"
            placeholderTextColor={COLORS.textMuted}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Destination (optional)</Text>
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
            <Text style={styles.label}>Start (optional)</Text>
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
            <Text style={styles.label}>End (optional)</Text>
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

        <Text style={styles.hint}>
          A trip is a container for an itinerary. Add planned stops or log experiences into it —
          each experience still gets ranked on its own.
        </Text>
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
  cancel: { fontSize: 15, color: COLORS.textSecondary },
  topTitle: { fontSize: 16, ...FONT.semibold, color: COLORS.text },
  create: { fontSize: 15, ...FONT.semibold, color: COLORS.accent },
  content: { padding: SPACING.xl, gap: SPACING.lg },
  coverPicker: { borderRadius: RADIUS.lg, overflow: 'hidden' },
  cover: { width: '100%', height: 160, borderRadius: RADIUS.lg, backgroundColor: COLORS.border },
  coverPlaceholder: { alignItems: 'center', justifyContent: 'center', gap: SPACING.xs },
  coverHint: { fontSize: 13, color: COLORS.textMuted },
  field: { gap: SPACING.sm },
  label: { fontSize: 13, ...FONT.medium, color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
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
  hint: { fontSize: 14, color: COLORS.textMuted, lineHeight: 20 },
});
