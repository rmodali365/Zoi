import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, Image, TouchableOpacity,
  ActivityIndicator, Modal, TextInput, Alert,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { NavigationProp, RouteProp } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Experience, Location } from '@/types';
import { TAG_LABELS } from '@/constants/experiences';
import {
  experienceTitle, localityLabel, primaryLocation, sentimentEmoji,
} from '@/lib/experienceDisplay';
import {
  getTripDetail, groupByCity, addPlannedStop, removeTripItem, setTripPosition,
  nextTripPosition, positionToMoveUp, positionToMoveDown, copyStopToTrip,
  updateTrip, parseDateInput,
} from '@/lib/trips';
import { getMyProfile, getMyTrips } from '@/lib/me';
import { getSavedIds, saveExperience, unsaveExperience } from '@/lib/saves';
import { uploadExperiencePhotos } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import { LocationSearch } from '@/components/LocationSearch';
import { COLORS, SPACING, RADIUS, FONT } from '@/constants/theme';

// TripDetail is registered in both the Profile and Experiences stacks, so type
// it structurally (it only needs goBack/navigate + the tripId param) rather than
// against one stack's param list.
type Props = {
  navigation: NavigationProp<Record<string, object | undefined>>;
  route: RouteProp<{ TripDetail: { tripId: string } }, 'TripDetail'>;
};

type ViewMode = 'list' | 'map';

function hasCoords(e: Experience): boolean {
  const loc = primaryLocation(e);
  if (!loc) return false;
  const { lat, lng } = loc;
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)
  );
}

// Bounding region framing every pin, with padding so markers aren't on the edge.
function regionForPins(pins: Experience[]): Region | undefined {
  const coords = pins.map(primaryLocation).filter(Boolean) as { lat: number; lng: number }[];
  if (coords.length === 0) return undefined;
  const lats = coords.map((c) => c.lat);
  const lngs = coords.map((c) => c.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.4, 0.05),
    longitudeDelta: Math.max((maxLng - minLng) * 1.4, 0.05),
  };
}

// "Jun 3 – Jun 10, 2026" / "Jun 3, 2026" — tolerant of missing dates.
function formatDates(start: string | null, end: string | null): string {
  const fmt = (s: string) =>
    new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  if (start && end) {
    const s = new Date(start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${s} – ${fmt(end)}`;
  }
  if (start) return fmt(start);
  if (end) return fmt(end);
  return '';
}

export function TripDetailScreen({ navigation, route }: Props) {
  const { tripId } = route.params;
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<ViewMode>('list');
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newLoc, setNewLoc] = useState<Location | null>(null);
  const [newNote, setNewNote] = useState('');
  // The stop a visitor is copying into one of their own trips (drives the picker).
  const [pickerItem, setPickerItem] = useState<Experience | null>(null);
  // Edit-trip-details sheet (owner).
  const [editingTrip, setEditingTrip] = useState(false);
  const [eTitle, setETitle] = useState('');
  const [eDest, setEDest] = useState('');
  const [eStart, setEStart] = useState('');
  const [eEnd, setEEnd] = useState('');
  const [eCover, setECover] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: qk.trip(tripId),
    queryFn: () => getTripDetail(tripId),
  });
  const { data: profile } = useQuery({ queryKey: qk.myProfile, queryFn: getMyProfile });
  const { data: savedIds = new Set<string>() } = useQuery({ queryKey: qk.savedIds, queryFn: getSavedIds });
  const { data: myTrips = [] } = useQuery({ queryKey: qk.myTrips, queryFn: getMyTrips });

  // Refetch on focus so items added/edited elsewhere show up on return.
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const trip = data?.trip ?? null;
  const items = useMemo(() => data?.items ?? [], [data]);
  const sections = useMemo(() => groupByCity(items), [items]);
  const pins = useMemo(() => items.filter(hasCoords), [items]);
  const region = useMemo(() => regionForPins(pins), [pins]);

  const isOwner = !!profile && !!trip && profile.id === trip.user_id;
  const plannedCount = items.filter((i) => i.status === 'planned').length;
  const dates = trip ? formatDates(trip.start_date, trip.end_date) : '';

  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.trip(tripId) });

  const addStop = useMutation({
    mutationFn: () =>
      addPlannedStop({
        tripId,
        location: newLoc as Location,
        note: newNote.trim() || null,
        position: nextTripPosition(items),
      }),
    onSuccess: () => { invalidate(); closeAdd(); },
    onError: (e: unknown) => Alert.alert('Could not add stop', e instanceof Error ? e.message : 'Try again.'),
  });

  const remove = useMutation({
    mutationFn: (item: Experience) => removeTripItem(item),
    onSuccess: invalidate,
    onError: (e: unknown) => Alert.alert('Could not remove', e instanceof Error ? e.message : 'Try again.'),
  });

  const move = useMutation({
    mutationFn: ({ id, position }: { id: string; position: string }) => setTripPosition(id, position),
    onSuccess: invalidate,
  });

  // Visitor: bookmark a ranked stop to Want-to-do.
  const toggleSave = useMutation({
    mutationFn: ({ id, saved }: { id: string; saved: boolean }) =>
      saved ? unsaveExperience(id) : saveExperience(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.savedIds });
      queryClient.invalidateQueries({ queryKey: qk.saves });
    },
  });

  // Visitor: copy a stop into one of your own trips as a planned stop.
  const copyStop = useMutation({
    mutationFn: ({ item, toTripId }: { item: Experience; toTripId: string }) =>
      copyStopToTrip(item, toTripId),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: qk.trip(vars.toTripId) });
      setPickerItem(null);
      Alert.alert('Added to your trip', 'Saved as a planned stop you can rank later.');
    },
    onError: (e: unknown) => Alert.alert('Could not add', e instanceof Error ? e.message : 'Try again.'),
  });

  function closeAdd() {
    setAdding(false);
    setNewLoc(null);
    setNewNote('');
  }

  function openEditTrip() {
    if (!trip) return;
    setETitle(trip.title);
    setEDest(trip.destination ?? '');
    setEStart(trip.start_date ?? '');
    setEEnd(trip.end_date ?? '');
    setECover(trip.cover_photo);
    setEditingTrip(true);
  }

  async function pickEditCover() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled) setECover(result.assets[0].uri);
  }

  const saveTrip = useMutation({
    mutationFn: async () => {
      if (!eTitle.trim()) throw new Error('Give the trip a name.');
      const start = parseDateInput(eStart);
      const end = parseDateInput(eEnd);
      let cover = eCover;
      if (eCover) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) [cover] = await uploadExperiencePhotos(user.id, [eCover]);
      }
      await updateTrip(tripId, {
        title: eTitle.trim(),
        destination: eDest.trim() || null,
        start_date: start,
        end_date: end,
        cover_photo: cover,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.trip(tripId) });
      queryClient.invalidateQueries({ queryKey: qk.myTrips });
      setEditingTrip(false);
    },
    onError: (e: unknown) => Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again.'),
  });

  function confirmRemove(item: Experience) {
    Alert.alert(
      item.status === 'planned' ? 'Remove this stop?' : 'Remove from trip?',
      item.status === 'planned'
        ? 'This planned stop will be deleted.'
        : 'The experience stays in your list — it just leaves this trip.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(item) },
      ],
    );
  }

  // "Log a ranked experience" routes to the Log tab's AddExperience, preset to this trip.
  function logExperience() {
    closeAdd();
    (navigation as NavigationProp<Record<string, object>>).navigate('Log', {
      screen: 'AddExperience',
      params: { tripId },
    } as object);
  }

  // Graduate a planned stop: hand its details to the ranking flow, which updates the
  // existing row in place (keeping it in the trip at its position) once ranked.
  function rankStop(item: Experience) {
    const locs = item.locations?.length ? item.locations : (item.location ? [item.location] : []);
    (navigation as NavigationProp<Record<string, object>>).navigate('Log', {
      screen: 'RankExperience',
      params: {
        draft: {
          title: experienceTitle(item),
          locations: locs,
          tags: item.tags,
          photos: item.photos,
          quick_take: item.quick_take,
          trip_id: item.trip_id,
        },
        experienceId: item.id,
      },
    } as object);
  }

  function countLine(): string {
    if (items.length === 0) return 'No stops yet';
    const parts = [`${items.length} ${items.length === 1 ? 'stop' : 'stops'}`];
    if (plannedCount > 0) parts.push(`${plannedCount} planned`);
    return parts.join(' · ');
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <View style={styles.topActions}>
          {isOwner && items.length > 0 && mode === 'list' && (
            <TouchableOpacity onPress={() => setEditing((e) => !e)} hitSlop={8}>
              <Text style={styles.editBtn}>{editing ? 'Done' : 'Edit'}</Text>
            </TouchableOpacity>
          )}
          {items.length > 0 && (
            <View style={styles.toggle}>
              <TouchableOpacity
                style={[styles.toggleBtn, mode === 'list' && styles.toggleBtnActive]}
                onPress={() => setMode('list')}
                activeOpacity={0.8}
              >
                <Ionicons name="list" size={18} color={mode === 'list' ? COLORS.background : COLORS.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, mode === 'map' && styles.toggleBtnActive]}
                onPress={() => { setMode('map'); setEditing(false); }}
                activeOpacity={0.8}
                disabled={pins.length === 0}
              >
                <Ionicons name="map" size={18} color={mode === 'map' ? COLORS.background : COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centered}><ActivityIndicator color={COLORS.text} /></View>
      ) : mode === 'map' && region ? (
        <MapView style={styles.map} initialRegion={region}>
          {pins.map((item) => {
            const loc = primaryLocation(item)!;
            return (
              <Marker
                key={item.id}
                coordinate={{ latitude: loc.lat, longitude: loc.lng }}
                title={experienceTitle(item)}
                description={item.status === 'planned' ? 'Planned' : localityLabel(item)}
              />
            );
          })}
        </MapView>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Header */}
          {!!trip?.cover_photo && <Image source={{ uri: trip.cover_photo }} style={styles.cover} />}
          <View style={styles.titleRow}>
            <Text style={styles.title}>{trip?.title ?? 'Trip'}</Text>
            {isOwner && (
              <TouchableOpacity onPress={openEditTrip} hitSlop={8}>
                <Ionicons name="create-outline" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
          {!!trip?.destination && <Text style={styles.destination}>{trip.destination}</Text>}
          {!!dates && <Text style={styles.dates}>{dates}</Text>}
          <Text style={styles.count}>{countLine()}</Text>

          {items.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>This itinerary is empty</Text>
              <Text style={styles.emptyBody}>
                {isOwner
                  ? 'Add a planned stop or log an experience to start building it.'
                  : 'Nothing here yet.'}
              </Text>
            </View>
          ) : (
            sections.map((section) => (
              <View key={section.city} style={styles.section}>
                <Text style={styles.cityHeader}>{section.city}</Text>
                {section.items.map((item, i) => (
                  <ItineraryRow
                    key={item.id}
                    item={item}
                    editing={editing}
                    canUp={i > 0}
                    canDown={i < section.items.length - 1}
                    onMoveUp={() => {
                      const p = positionToMoveUp(section.items, i);
                      if (p) move.mutate({ id: item.id, position: p });
                    }}
                    onMoveDown={() => {
                      const p = positionToMoveDown(section.items, i);
                      if (p) move.mutate({ id: item.id, position: p });
                    }}
                    onDelete={() => confirmRemove(item)}
                    isOwner={isOwner}
                    onRank={() => rankStop(item)}
                    saved={savedIds.has(item.id)}
                    onToggleSave={() => toggleSave.mutate({ id: item.id, saved: savedIds.has(item.id) })}
                    onAddToTrip={() => setPickerItem(item)}
                  />
                ))}
              </View>
            ))
          )}

          {isOwner && !editing && (
            <TouchableOpacity style={styles.addBtn} onPress={() => setAdding(true)} activeOpacity={0.8}>
              <Ionicons name="add" size={20} color={COLORS.brand} />
              <Text style={styles.addBtnText}>Add to itinerary</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {/* Add-stop modal */}
      <Modal visible={adding} animationType="slide" transparent onRequestClose={closeAdd}>
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Add a stop</Text>
              <TouchableOpacity onPress={closeAdd} hitSlop={8}>
                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <LocationSearch value={newLoc} onChange={setNewLoc} />

            {!!newLoc && (
              <>
                <TextInput
                  style={styles.noteInput}
                  value={newNote}
                  onChangeText={setNewNote}
                  placeholder="Add a note (optional) — e.g. book ahead"
                  placeholderTextColor={COLORS.textMuted}
                  multiline
                />
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => addStop.mutate()}
                  disabled={addStop.isPending}
                  activeOpacity={0.85}
                >
                  {addStop.isPending
                    ? <ActivityIndicator color={COLORS.surface} />
                    : <Text style={styles.primaryBtnText}>Add planned stop</Text>}
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity onPress={logExperience} hitSlop={8} style={styles.logLink}>
              <Text style={styles.logLinkText}>Or log a ranked experience instead</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Visitor "add to my trip" picker */}
      <Modal visible={!!pickerItem} animationType="slide" transparent onRequestClose={() => setPickerItem(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Add to which trip?</Text>
              <TouchableOpacity onPress={() => setPickerItem(null)} hitSlop={8}>
                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            {myTrips.length === 0 ? (
              <Text style={styles.pickerEmpty}>
                You don’t have any trips yet. Start one from the Log tab first.
              </Text>
            ) : (
              <ScrollView style={styles.pickerList}>
                {myTrips.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={styles.pickerRow}
                    onPress={() => pickerItem && copyStop.mutate({ item: pickerItem, toTripId: t.id })}
                    disabled={copyStop.isPending}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.pickerRowTitle}>{t.title}</Text>
                    {!!t.destination && <Text style={styles.pickerRowDest}>{t.destination}</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Edit trip details (owner) */}
      <Modal visible={editingTrip} animationType="slide" transparent onRequestClose={() => setEditingTrip(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Edit trip</Text>
              <TouchableOpacity onPress={() => setEditingTrip(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.editForm}>
              <TouchableOpacity style={styles.coverPicker} onPress={pickEditCover} activeOpacity={0.85}>
                {eCover ? (
                  <Image source={{ uri: eCover }} style={styles.editCover} />
                ) : (
                  <View style={[styles.editCover, styles.coverPlaceholder]}>
                    <Ionicons name="image-outline" size={26} color={COLORS.textMuted} />
                    <Text style={styles.coverHint}>Add a cover photo</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TextInput
                style={styles.noteInput} value={eTitle} onChangeText={setETitle}
                placeholder="Trip name" placeholderTextColor={COLORS.textMuted}
              />
              <TextInput
                style={styles.noteInput} value={eDest} onChangeText={setEDest}
                placeholder="Destination (optional)" placeholderTextColor={COLORS.textMuted} autoCorrect={false}
              />
              <View style={styles.dateRow}>
                <TextInput
                  style={[styles.noteInput, styles.dateInput]} value={eStart} onChangeText={setEStart}
                  placeholder="Start YYYY-MM-DD" placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="none" autoCorrect={false}
                />
                <TextInput
                  style={[styles.noteInput, styles.dateInput]} value={eEnd} onChangeText={setEEnd}
                  placeholder="End YYYY-MM-DD" placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="none" autoCorrect={false}
                />
              </View>
              <TouchableOpacity
                style={styles.primaryBtn} onPress={() => saveTrip.mutate()}
                disabled={saveTrip.isPending} activeOpacity={0.85}
              >
                {saveTrip.isPending
                  ? <ActivityIndicator color={COLORS.surface} />
                  : <Text style={styles.primaryBtnText}>Save</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

type RowProps = {
  item: Experience;
  editing: boolean;
  canUp: boolean;
  canDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  isOwner: boolean;
  onRank: () => void;
  saved: boolean;
  onToggleSave: () => void;
  onAddToTrip: () => void;
};

// One itinerary stop — planned (muted, with optional note) or ranked (sentiment +
// quick take + photo). Owners get edit/reorder/delete + "Rank" on planned stops;
// visitors get "save to Want-to-do" (ranked) + "add to my trip" on every stop.
function ItineraryRow({
  item, editing, canUp, canDown, onMoveUp, onMoveDown, onDelete,
  isOwner, onRank, saved, onToggleSave, onAddToTrip,
}: RowProps) {
  const planned = item.status === 'planned';
  const place = localityLabel(item);
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        {planned ? (
          <Ionicons name="ellipse-outline" size={18} color={COLORS.textMuted} />
        ) : (
          <Text style={styles.rowEmoji}>{sentimentEmoji(item.sentiment) || '📍'}</Text>
        )}
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>{experienceTitle(item)}</Text>
        {!!place && <Text style={styles.rowPlace} numberOfLines={1}>{place}</Text>}
        {planned && !!item.note && <Text style={styles.rowNote}>{item.note}</Text>}
        {!planned && !!item.quick_take && <Text style={styles.rowQuote}>“{item.quick_take}”</Text>}
        {!planned && item.tags.length > 0 && (
          <Text style={styles.rowTags} numberOfLines={1}>
            {item.tags.map((t) => TAG_LABELS[t]).join(' · ')}
          </Text>
        )}
      </View>
      {editing ? (
        <View style={styles.rowControls}>
          <TouchableOpacity onPress={onMoveUp} disabled={!canUp} hitSlop={6}>
            <Ionicons name="chevron-up" size={22} color={canUp ? COLORS.textSecondary : COLORS.border} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onMoveDown} disabled={!canDown} hitSlop={6}>
            <Ionicons name="chevron-down" size={22} color={canDown ? COLORS.textSecondary : COLORS.border} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} hitSlop={6}>
            <Ionicons name="trash-outline" size={20} color={COLORS.error} />
          </TouchableOpacity>
        </View>
      ) : !isOwner ? (
        <View style={styles.rowControls}>
          {!planned && (
            <TouchableOpacity onPress={onToggleSave} hitSlop={6}>
              <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={22} color={COLORS.accent} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onAddToTrip} hitSlop={6}>
            <Ionicons name="add-circle-outline" size={24} color={COLORS.brand} />
          </TouchableOpacity>
        </View>
      ) : planned ? (
        <TouchableOpacity style={styles.rankBtn} onPress={onRank} activeOpacity={0.85}>
          <Text style={styles.rankBtnText}>Rank</Text>
        </TouchableOpacity>
      ) : item.photos.length > 0 ? (
        <Image source={{ uri: item.photos[0] }} style={styles.thumb} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md,
  },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  back: { fontSize: 16, ...FONT.medium, color: COLORS.accent },
  editBtn: { fontSize: 16, ...FONT.semibold, color: COLORS.brand },
  toggle: {
    flexDirection: 'row', backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.full, padding: 2, gap: 2,
  },
  toggleBtn: { width: 38, height: 32, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center' },
  toggleBtnActive: { backgroundColor: COLORS.text },
  map: { flex: 1 },
  scroll: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxl },
  cover: {
    width: '100%', height: 180, borderRadius: RADIUS.lg,
    backgroundColor: COLORS.border, marginBottom: SPACING.md,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
  title: { fontSize: 28, ...FONT.bold, color: COLORS.text, letterSpacing: -0.5, flex: 1 },
  destination: { fontSize: 16, color: COLORS.textSecondary, marginTop: 2 },
  dates: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
  count: { fontSize: 14, color: COLORS.textMuted, marginTop: SPACING.xs, marginBottom: SPACING.lg },
  section: { marginBottom: SPACING.lg },
  cityHeader: {
    fontSize: 13, ...FONT.semibold, color: COLORS.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: SPACING.sm,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, padding: SPACING.sm + 2, marginBottom: SPACING.sm,
  },
  rowIcon: { width: 28, alignItems: 'center', justifyContent: 'center' },
  rowEmoji: { fontSize: 20 },
  rowBody: { flex: 1, gap: 1 },
  rowTitle: { fontSize: 16, ...FONT.semibold, color: COLORS.text },
  rowPlace: { fontSize: 13, color: COLORS.textSecondary },
  rowNote: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  rowQuote: { fontSize: 14, color: COLORS.text, fontStyle: 'italic', marginTop: 2 },
  rowTags: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  rowControls: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  thumb: { width: 48, height: 48, borderRadius: RADIUS.sm, backgroundColor: COLORS.border },
  rankBtn: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full, backgroundColor: COLORS.brand,
  },
  rankBtnText: { fontSize: 13, ...FONT.semibold, color: COLORS.surface },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs,
    borderWidth: 1.5, borderColor: COLORS.brand, borderRadius: RADIUS.md,
    paddingVertical: SPACING.md, marginTop: SPACING.sm,
  },
  addBtnText: { fontSize: 15, ...FONT.semibold, color: COLORS.brand },
  empty: { paddingTop: SPACING.xxl, alignItems: 'center', gap: SPACING.sm },
  emptyTitle: { fontSize: 17, ...FONT.semibold, color: COLORS.text, textAlign: 'center' },
  emptyBody: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: COLORS.overlay },
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg,
    padding: SPACING.xl, paddingBottom: SPACING.xxl, gap: SPACING.md, minHeight: 320,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 20, ...FONT.bold, color: COLORS.text },
  noteInput: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: 15, color: COLORS.text,
    backgroundColor: COLORS.surface, minHeight: 48,
  },
  primaryBtn: {
    backgroundColor: COLORS.brand, borderRadius: RADIUS.md,
    paddingVertical: SPACING.md, alignItems: 'center',
  },
  primaryBtnText: { fontSize: 16, ...FONT.semibold, color: COLORS.surface },
  logLink: { alignItems: 'center', paddingVertical: SPACING.sm },
  logLinkText: { fontSize: 14, ...FONT.medium, color: COLORS.textSecondary },
  pickerEmpty: { fontSize: 15, color: COLORS.textSecondary, lineHeight: 22, paddingVertical: SPACING.md },
  pickerList: { maxHeight: 320 },
  pickerRow: {
    paddingVertical: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  pickerRowTitle: { fontSize: 16, ...FONT.semibold, color: COLORS.text },
  pickerRowDest: { fontSize: 13, color: COLORS.textSecondary, marginTop: 1 },
  editForm: { gap: SPACING.md, paddingTop: SPACING.sm },
  coverPicker: { borderRadius: RADIUS.md, overflow: 'hidden' },
  editCover: { width: '100%', height: 140, borderRadius: RADIUS.md, backgroundColor: COLORS.border },
  coverPlaceholder: { alignItems: 'center', justifyContent: 'center', gap: SPACING.xs },
  coverHint: { fontSize: 13, color: COLORS.textMuted },
  dateRow: { flexDirection: 'row', gap: SPACING.md },
  dateInput: { flex: 1 },
});
