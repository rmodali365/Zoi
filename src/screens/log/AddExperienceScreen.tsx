import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, SafeAreaView,
  ScrollView, Image, Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { LogStackParamList, Tag, Trip } from '@/types';
import { TAGS, TAG_LABELS } from '@/constants/experiences';
import { COLORS, SPACING, RADIUS, FONT } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type Props = {
  navigation: NativeStackNavigationProp<LogStackParamList, 'AddExperience'>;
  route: RouteProp<LogStackParamList, 'AddExperience'>;
};

const MAX_PHOTOS = 5;
const MAX_TAGS = 3;

export function AddExperienceScreen({ navigation, route }: Props) {
  const presetTripId = route.params?.tripId ?? null;

  const [locationName, setLocationName] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [quickTake, setQuickTake] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);
  const [tripId, setTripId] = useState<string | null>(presetTripId);
  const [trips, setTrips] = useState<Trip[]>([]);

  useEffect(() => {
    loadTrips();
  }, []);

  async function loadTrips() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('trips')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setTrips(data as Trip[]);
  }

  async function pickPhotos() {
    if (photos.length >= MAX_PHOTOS) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - photos.length,
      quality: 0.8,
    });
    if (!result.canceled) {
      setPhotos((prev) => [...prev, ...result.assets.map((a) => a.uri)].slice(0, MAX_PHOTOS));
    }
  }

  function removePhoto(uri: string) {
    setPhotos((prev) => prev.filter((p) => p !== uri));
  }

  function toggleTag(tag: Tag) {
    setTags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      if (prev.length >= MAX_TAGS) return prev;
      return [...prev, tag];
    });
  }

  function handleNext() {
    if (!locationName.trim()) {
      Alert.alert('Add a place', 'Where did this happen?');
      return;
    }
    navigation.navigate('RankExperience', {
      draft: {
        // TODO: replace with Google Places result (lat/lng/place_id) once integrated
        location: { name: locationName.trim(), lat: 0, lng: 0, place_id: '' },
        // TODO: upload photos to Supabase Storage and store public URLs instead of local URIs
        photos,
        quick_take: quickTake.trim(),
        tags,
        trip_id: tripId,
      },
    });
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>New experience</Text>
        <TouchableOpacity onPress={handleNext} hitSlop={8}>
          <Text style={styles.next}>Next</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Location */}
        <View style={styles.field}>
          <Text style={styles.label}>Place</Text>
          <TextInput
            style={styles.input}
            value={locationName}
            onChangeText={setLocationName}
            placeholder="Where were you?"
            placeholderTextColor={COLORS.textMuted}
            autoCorrect={false}
          />
        </View>

        {/* Photos */}
        <View style={styles.field}>
          <Text style={styles.label}>Photos ({photos.length}/{MAX_PHOTOS})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
            {photos.map((uri) => (
              <TouchableOpacity key={uri} onPress={() => removePhoto(uri)} activeOpacity={0.8}>
                <Image source={{ uri }} style={styles.photo} />
                <View style={styles.photoRemove}>
                  <Text style={styles.photoRemoveText}>×</Text>
                </View>
              </TouchableOpacity>
            ))}
            {photos.length < MAX_PHOTOS && (
              <TouchableOpacity style={styles.addPhoto} onPress={pickPhotos} activeOpacity={0.7}>
                <Text style={styles.addPhotoText}>+</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>

        {/* Quick take */}
        <View style={styles.field}>
          <Text style={styles.label}>Quick take</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={quickTake}
            onChangeText={setQuickTake}
            placeholder="What made it memorable?"
            placeholderTextColor={COLORS.textMuted}
            multiline
            maxLength={280}
          />
        </View>

        {/* Tags */}
        <View style={styles.field}>
          <Text style={styles.label}>Tags ({tags.length}/{MAX_TAGS})</Text>
          <View style={styles.chips}>
            {TAGS.map((tag) => {
              const selected = tags.includes(tag);
              return (
                <TouchableOpacity
                  key={tag}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => toggleTag(tag)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {TAG_LABELS[tag]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Add to trip */}
        {trips.length > 0 && (
          <View style={styles.field}>
            <Text style={styles.label}>Add to a trip</Text>
            <View style={styles.chips}>
              <TouchableOpacity
                style={[styles.chip, tripId === null && styles.chipSelected]}
                onPress={() => setTripId(null)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, tripId === null && styles.chipTextSelected]}>None</Text>
              </TouchableOpacity>
              {trips.map((trip) => {
                const selected = tripId === trip.id;
                return (
                  <TouchableOpacity
                    key={trip.id}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => setTripId(trip.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{trip.title}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
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
  next: { fontSize: 15, ...FONT.semibold, color: COLORS.accent },
  content: { padding: SPACING.xl, gap: SPACING.lg, paddingBottom: SPACING.xxl },
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
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  photoRow: { gap: SPACING.sm, paddingVertical: 2 },
  photo: { width: 88, height: 88, borderRadius: RADIUS.md, backgroundColor: COLORS.border },
  photoRemove: {
    position: 'absolute', top: -6, right: -6,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: COLORS.text,
    alignItems: 'center', justifyContent: 'center',
  },
  photoRemoveText: { color: COLORS.background, fontSize: 16, lineHeight: 18 },
  addPhoto: {
    width: 88, height: 88, borderRadius: RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface,
  },
  addPhotoText: { fontSize: 32, color: COLORS.textMuted, fontWeight: '300' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2, backgroundColor: COLORS.surface,
  },
  chipSelected: { backgroundColor: COLORS.text, borderColor: COLORS.text },
  chipText: { fontSize: 14, ...FONT.medium, color: COLORS.text },
  chipTextSelected: { color: COLORS.background },
});
