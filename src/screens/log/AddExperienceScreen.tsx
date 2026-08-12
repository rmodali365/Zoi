import React, { useEffect, useState } from 'react';
import {
  View, StyleSheet, TextInput, TouchableOpacity, SafeAreaView,
  ScrollView, Image, Alert, ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NavigationProp, RouteProp } from '@react-navigation/native';
import { Location, Tag, ExperienceDraft } from '@/types';
import { TAGS, TAG_LABELS } from '@/constants/experiences';
import { experienceLocations } from '@/lib/experienceDisplay';
import { LocationSearch } from '@/components/LocationSearch';
import { AppText } from '@/components/ui/AppText';
import { Chip } from '@/components/ui/Chip';
import { DateField } from '@/components/ui/DateField';
import { FormScrollView } from '@/components/ui/FormScrollView';
import { todayString } from '@/lib/dates';
import { getExperience, updateExperience } from '@/lib/experiences';
import { getMyTrips } from '@/lib/me';
import { qk } from '@/lib/queryKeys';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

// One form, three modes:
// - create:   normal log — Next hands an ExperienceDraft to RankExperience.
// - graduate: capture step for ranking a planned stop (#51) — prefilled from the
//             row, trip locked, Next goes to RankExperience with experienceId so
//             the save updates the row in place.
// - edit:     owner content edit (#53) — prefilled, Save updates the row directly
//             (rank/sentiment untouched) and pops back.
type Mode = 'create' | 'graduate' | 'edit';

// Registered across stacks (Log as AddExperience; Feed/Experiences/Profile as
// EditExperience), so navigation is typed structurally like TripDetailScreen.
type FormNav = NavigationProp<Record<string, object | undefined>>;

const MAX_PHOTOS = 5;
const MAX_TAGS = 3;

type AddProps = {
  navigation: FormNav;
  route: RouteProp<
    { AddExperience: { tripId?: string; graduateExperienceId?: string } | undefined },
    'AddExperience'
  >;
};

export function AddExperienceScreen({ navigation, route }: AddProps) {
  const graduateId = route.params?.graduateExperienceId;
  return (
    <ExperienceForm
      navigation={navigation}
      mode={graduateId ? 'graduate' : 'create'}
      presetTripId={route.params?.tripId ?? null}
      experienceId={graduateId}
    />
  );
}

type EditProps = {
  navigation: FormNav;
  route: RouteProp<{ EditExperience: { experienceId: string } }, 'EditExperience'>;
};

export function EditExperienceScreen({ navigation, route }: EditProps) {
  return (
    <ExperienceForm navigation={navigation} mode="edit" experienceId={route.params.experienceId} />
  );
}

type FormProps = {
  navigation: FormNav;
  mode: Mode;
  presetTripId?: string | null;
  experienceId?: string;
};

function ExperienceForm({ navigation, mode, presetTripId = null, experienceId }: FormProps) {
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [quickTake, setQuickTake] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);
  const [tripId, setTripId] = useState<string | null>(presetTripId);
  // When it happened — required, pre-filled with today (past dates allowed).
  const [date, setDate] = useState(todayString());
  // Graduate/edit prefill happens once, after the row loads.
  const [hydrated, setHydrated] = useState(mode === 'create');

  // Trips the experience can be filed under — shared cache with My List / Profile.
  const { data: trips = [] } = useQuery({ queryKey: qk.myTrips, queryFn: getMyTrips });

  const { data: existing } = useQuery({
    queryKey: qk.experience(experienceId as string),
    queryFn: () => getExperience(experienceId as string),
    enabled: !!experienceId,
  });

  useEffect(() => {
    if (hydrated || !existing) return;
    setTitle(existing.title ?? '');
    setLocations(experienceLocations(existing));
    setPhotos(existing.photos);
    setQuickTake(existing.quick_take);
    setTags(existing.tags);
    setTripId(existing.trip_id);
    setDate(existing.experience_date);
    setHydrated(true);
  }, [existing, hydrated]);

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
  // authoritative — never let it drift to null. Graduation keeps the row's trip.
  const tripLocked = mode === 'graduate' || !!presetTripId;
  const lockedTripId = mode === 'graduate' ? (existing?.trip_id ?? null) : presetTripId;
  const lockedTrip = lockedTripId ? trips.find((t) => t.id === lockedTripId) : null;

  function buildDraft(): ExperienceDraft | null {
    if (locations.length === 0) {
      Alert.alert('Add a place', 'Add at least one location for this experience.');
      return null;
    }
    return {
      // Title is optional; default to the first place's name.
      title: title.trim() || locations[0].name,
      locations,
      // Local URIs upload at save time; remote URLs pass through unchanged.
      photos,
      quick_take: quickTake.trim(),
      tags,
      trip_id: tripLocked ? lockedTripId : tripId,
      experience_date: date,
    };
  }

  function handleNext() {
    const draft = buildDraft();
    if (!draft) return;
    navigation.navigate('RankExperience', {
      draft,
      // Graduation updates the planned row in place instead of inserting.
      experienceId: mode === 'graduate' ? experienceId : undefined,
    });
  }

  const saveEdit = useMutation({
    mutationFn: (draft: ExperienceDraft) =>
      updateExperience({
        id: experienceId as string,
        draft,
        onPhotoError: () =>
          Alert.alert('Photo upload failed', 'Saving your changes without the new photos.'),
      }),
    onSuccess: (_d, draft) => {
      queryClient.invalidateQueries({ queryKey: qk.experience(experienceId as string) });
      queryClient.invalidateQueries({ queryKey: qk.myExperiences });
      queryClient.invalidateQueries({ queryKey: qk.myTrips });
      queryClient.invalidateQueries({ queryKey: qk.saves });
      if (existing?.trip_id) queryClient.invalidateQueries({ queryKey: qk.trip(existing.trip_id) });
      if (draft.trip_id) queryClient.invalidateQueries({ queryKey: qk.trip(draft.trip_id) });
      navigation.goBack();
    },
    onError: (e: unknown) =>
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again.'),
  });

  function handleSave() {
    const draft = buildDraft();
    if (!draft) return;
    saveEdit.mutate(draft);
  }

  const heading =
    mode === 'edit' ? 'Edit experience'
    : mode === 'graduate' ? 'Finish this stop'
    : 'New experience';

  if (!hydrated) {
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
        <AppText variant="body" weight="semibold">{heading}</AppText>
        {mode === 'edit' ? (
          <TouchableOpacity onPress={handleSave} disabled={saveEdit.isPending} hitSlop={8}>
            {saveEdit.isPending
              ? <ActivityIndicator size="small" color={COLORS.accent} />
              : <AppText variant="body" weight="semibold" color={COLORS.accent}>Save</AppText>}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={handleNext} hitSlop={8}>
            <AppText variant="body" weight="semibold" color={COLORS.accent}>Next</AppText>
          </TouchableOpacity>
        )}
      </View>

      <FormScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {mode === 'graduate' && (
          <View style={styles.graduateBanner}>
            <AppText variant="subhead" weight="regular" color={COLORS.textSecondary}>
              Add photos and a quick take before you rank it — or hit Next to rank as-is.
            </AppText>
          </View>
        )}

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

        {/* When it happened */}
        <View style={styles.field}>
          <AppText variant="caption" weight="medium" color={COLORS.textSecondary} style={styles.label}>When</AppText>
          <DateField value={date} onChange={setDate} maximumDate={new Date()} />
          {mode === 'graduate' && (
            <AppText variant="caption">Confirm when it actually happened.</AppText>
          )}
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
            {TAGS.map((tag) => (
              <Chip
                key={tag}
                label={TAG_LABELS[tag]}
                selected={tags.includes(tag)}
                onPress={() => toggleTag(tag)}
              />
            ))}
          </View>
        </View>

        {/* Trip association */}
        {tripLocked ? (
          lockedTripId ? (
            <View style={styles.field}>
              <AppText variant="caption" weight="medium" color={COLORS.textSecondary} style={styles.label}>Trip</AppText>
              <View style={styles.tripBanner}>
                <AppText variant="body" weight="medium">
                  🧳 {mode === 'graduate' ? 'Stays in' : 'Adding to'} {lockedTrip?.title ?? 'your trip'}
                </AppText>
              </View>
            </View>
          ) : null
        ) : trips.length > 0 ? (
          <View style={styles.field}>
            <AppText variant="caption" weight="medium" color={COLORS.textSecondary} style={styles.label}>
              {mode === 'edit' ? 'Trip' : 'Add to a trip'}
            </AppText>
            <View style={styles.chips}>
              <Chip label="None" selected={tripId === null} onPress={() => setTripId(null)} />
              {trips.map((trip) => (
                <Chip
                  key={trip.id}
                  label={trip.title}
                  selected={tripId === trip.id}
                  onPress={() => setTripId(trip.id)}
                />
              ))}
            </View>
          </View>
        ) : null}
      </FormScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { alignItems: 'center', justifyContent: 'center' },
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
  graduateBanner: {
    backgroundColor: COLORS.brandLight,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
  },
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
  tripBanner: {
    backgroundColor: COLORS.accentLight,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
  },
});
