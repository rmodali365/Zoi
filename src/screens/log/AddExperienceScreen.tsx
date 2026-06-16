import React, { useState } from 'react';
import {
  View, StyleSheet, TextInput, TouchableOpacity, SafeAreaView,
  ScrollView, Image, Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useQuery } from '@tanstack/react-query';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { LogStackParamList, Location, Tag } from '@/types';
import { TAGS, TAG_LABELS } from '@/constants/experiences';
import { LocationSearch } from '@/components/LocationSearch';
import { AppText } from '@/components/ui/AppText';
import { getMyTrips } from '@/lib/me';
import { qk } from '@/lib/queryKeys';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<LogStackParamList, 'AddExperience'>;
  route: RouteProp<LogStackParamList, 'AddExperience'>;
};

const MAX_PHOTOS = 5;
const MAX_TAGS = 3;

export function AddExperienceScreen({ navigation, route }: Props) {
  const presetTripId = route.params?.tripId ?? null;

  const [title, setTitle] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [quickTake, setQuickTake] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);
  const [tripId, setTripId] = useState<string | null>(presetTripId);

  // Trips the experience can be filed under — shared cache with My List / Profile.
  const { data: trips = [] } = useQuery({ queryKey: qk.myTrips, queryFn: getMyTrips });

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

  function addLocation(loc: Location) {
    setLocations((prev) => (prev.some((l) => l.place_id === loc.place_id) ? prev : [...prev, loc]));
  }

  function removeLocation(placeId: string) {
    setLocations((prev) => prev.filter((l) => l.place_id !== placeId));
  }

  // When we arrived from "Start a trip → Add experience", the trip is fixed and
  // authoritative — never let it drift to null. Otherwise use the picked trip.
  const presetTrip = presetTripId ? trips.find((t) => t.id === presetTripId) : null;

  function handleNext() {
    if (locations.length === 0) {
      Alert.alert('Add a place', 'Add at least one location for this experience.');
      return;
    }
    navigation.navigate('RankExperience', {
      draft: {
        // Title is optional; default to the first place's name.
        title: title.trim() || locations[0].name,
        locations,
        // Local URIs here; uploaded to Storage at save time in RankExperienceScreen
        photos,
        quick_take: quickTake.trim(),
        tags,
        // Preset trip wins; it can't be changed in the UI when coming from a trip.
        trip_id: presetTripId ?? tripId,
      },
    });
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <AppText variant="body" color={COLORS.textSecondary}>Cancel</AppText>
        </TouchableOpacity>
        <AppText variant="body" weight="semibold">New experience</AppText>
        <TouchableOpacity onPress={handleNext} hitSlop={8}>
          <AppText variant="body" weight="semibold" color={COLORS.accent}>Next</AppText>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Title */}
        <View style={styles.field}>
          <AppText variant="caption" weight="medium" color={COLORS.textSecondary} style={styles.label}>Title</AppText>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Name this experience (e.g. SoMa bar crawl)"
            placeholderTextColor={COLORS.textMuted}
            maxLength={60}
          />
          <AppText variant="caption">Optional — defaults to the first place's name.</AppText>
        </View>

        {/* Locations (one or more) */}
        <View style={styles.field}>
          <AppText variant="caption" weight="medium" color={COLORS.textSecondary} style={styles.label}>
            {locations.length === 1 ? 'Location' : 'Locations'} ({locations.length})
          </AppText>
          {locations.map((loc) => (
            <View key={loc.place_id} style={styles.locRow}>
              <View style={styles.locInfo}>
                <AppText variant="body" weight="semibold" numberOfLines={1}>{loc.name}</AppText>
                {!!loc.formattedAddress && (
                  <AppText variant="caption" numberOfLines={1}>{loc.formattedAddress}</AppText>
                )}
              </View>
              <TouchableOpacity onPress={() => removeLocation(loc.place_id)} hitSlop={8}>
                <AppText variant="subhead" weight="medium" color={COLORS.error}>Remove</AppText>
              </TouchableOpacity>
            </View>
          ))}
          <LocationSearch value={null} onChange={(loc) => loc && addLocation(loc)} />
        </View>

        {/* Photos */}
        <View style={styles.field}>
          <AppText variant="caption" weight="medium" color={COLORS.textSecondary} style={styles.label}>Photos ({photos.length}/{MAX_PHOTOS})</AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
            {photos.map((uri) => (
              <TouchableOpacity key={uri} onPress={() => removePhoto(uri)} activeOpacity={0.8}>
                <Image source={{ uri }} style={styles.photo} />
                <View style={styles.photoRemove}>
                  <AppText style={styles.photoRemoveText}>×</AppText>
                </View>
              </TouchableOpacity>
            ))}
            {photos.length < MAX_PHOTOS && (
              <TouchableOpacity style={styles.addPhoto} onPress={pickPhotos} activeOpacity={0.7}>
                <AppText style={styles.addPhotoText}>+</AppText>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>

        {/* Quick take */}
        <View style={styles.field}>
          <AppText variant="caption" weight="medium" color={COLORS.textSecondary} style={styles.label}>Quick take</AppText>
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
          <AppText variant="caption" weight="medium" color={COLORS.textSecondary} style={styles.label}>Tags ({tags.length}/{MAX_TAGS})</AppText>
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
                  <AppText variant="subhead" weight="medium" color={selected ? COLORS.background : COLORS.text}>
                    {TAG_LABELS[tag]}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Trip association */}
        {presetTripId ? (
          // Came from "Start a trip → Add experience": the trip is locked in and shown.
          <View style={styles.field}>
            <AppText variant="caption" weight="medium" color={COLORS.textSecondary} style={styles.label}>Trip</AppText>
            <View style={styles.tripBanner}>
              <AppText variant="body" weight="medium">🧳 Adding to {presetTrip?.title ?? 'your trip'}</AppText>
            </View>
          </View>
        ) : trips.length > 0 ? (
          <View style={styles.field}>
            <AppText variant="caption" weight="medium" color={COLORS.textSecondary} style={styles.label}>Add to a trip</AppText>
            <View style={styles.chips}>
              <TouchableOpacity
                style={[styles.chip, tripId === null && styles.chipSelected]}
                onPress={() => setTripId(null)}
                activeOpacity={0.7}
              >
                <AppText variant="subhead" weight="medium" color={tripId === null ? COLORS.background : COLORS.text}>None</AppText>
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
                    <AppText variant="subhead" weight="medium" color={selected ? COLORS.background : COLORS.text}>{trip.title}</AppText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : null}
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
  content: { padding: SPACING.xl, gap: SPACING.lg, paddingBottom: SPACING.xxl },
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
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  locRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    borderWidth: 1.5, borderColor: COLORS.text, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: 12, backgroundColor: COLORS.surface,
  },
  locInfo: { flex: 1 },
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
  tripBanner: {
    backgroundColor: COLORS.accentLight,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
  },
});
