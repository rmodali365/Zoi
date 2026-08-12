import React, { useCallback, useMemo, useState } from 'react';
import {
  View, StyleSheet, SafeAreaView, ScrollView, Image, TouchableOpacity,
  ActivityIndicator, Modal, TextInput, Alert,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { NavigationProp, RouteProp } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Experience, Location, StopDetails, StopKind, Trip, RankedExperience } from '@/types';
import { TAG_LABELS } from '@/constants/experiences';
import {
  experienceTitle, localityLabel, primaryLocation, sentimentEmoji,
} from '@/lib/experienceDisplay';
import {
  getTripDetail, groupByCity, groupByDay, addStopFromPlace, removeTripStop,
  removalSummary, setTripPosition, setStopCity, positionToMoveUp, positionToMoveDown,
  updateTrip, parseDateInput, canEditTrip, CitySection,
} from '@/lib/trips';
import { leaveTrip } from '@/lib/tripMembers';
import { resolveTripCity } from '@/lib/cities';
import { KIND_SEGMENTS, kindFromPlaceTypes, kindIcon, isRankable, stopSubtitle } from '@/lib/stops';
import { todayString } from '@/lib/dates';
import { getSavedIds, saveExperience, unsaveExperience } from '@/lib/saves';
import { uploadExperiencePhotos } from '@/lib/storage';
import { getMyUserId } from '@/lib/auth';
import { qk } from '@/lib/queryKeys';
import { LocationSearch } from '@/components/LocationSearch';
import { InviteToTripSheet } from '@/components/InviteToTripSheet';
import { AppText } from '@/components/ui/AppText';
import { Avatar } from '@/components/ui/Avatar';
import { AvatarStack } from '@/components/ui/AvatarStack';
import { DateField } from '@/components/ui/DateField';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { SheetBackdrop } from '@/components/ui/SheetBackdrop';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

// TripDetail is registered in both the Profile and Experiences stacks, so type
// it structurally (it only needs goBack/navigate + the tripId param) rather than
// against one stack's param list.
type Props = {
  navigation: NavigationProp<Record<string, object | undefined>>;
  route: RouteProp<{ TripDetail: { tripId: string } }, 'TripDetail'>;
};

type ViewMode = 'list' | 'map';
type GroupMode = 'city' | 'day';

function hasCoords(e: Experience | undefined): e is Experience {
  if (!e) return false;
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
  // Group the itinerary by city (default) or by day (#34; offered when dated).
  const [groupMode, setGroupMode] = useState<GroupMode>('city');
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newLoc, setNewLoc] = useState<Location | null>(null);
  const [newKind, setNewKind] = useState<StopKind>('experience');
  const [newNote, setNewNote] = useState('');
  const [newDate, setNewDate] = useState(todayString());
  // Roster / invite sheet (#67).
  const [showMembers, setShowMembers] = useState(false);
  // Kind-specific detail fields (only the relevant ones are read on save).
  const [checkOut, setCheckOut] = useState('');
  const [resTime, setResTime] = useState('');
  const [partySize, setPartySize] = useState('');
  const [carrier, setCarrier] = useState('');
  const [confirmation, setConfirmation] = useState('');
  // The stop whose section a member is reassigning (drives the move sheet).
  const [moveItem, setMoveItem] = useState<RankedExperience | null>(null);
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
  const { data: savedIds = new Set<string>() } = useQuery({ queryKey: qk.savedIds, queryFn: getSavedIds });

  // Refetch on focus so items added/edited elsewhere show up on return.
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const trip = data?.trip ?? null;
  const items = useMemo(() => data?.items ?? [], [data]);
  const members = useMemo(() => data?.members ?? [], [data]);
  const myUserId = data?.myUserId ?? null;

  // A stop is ONE shared post now, carrying every participant's ranking — so the
  // itinerary is a plain ordered list again, no grouping layer.
  const stops = items;

  // Day grouping is only offered when the trip has a start date to anchor Day 1.
  const canGroupByDay = !!trip?.start_date;
  const byDay = groupMode === 'day' && canGroupByDay;
  // City sections (independent of the day/city view) — reused for the "add stop"
  // section preview and the "move to section" picker.
  const citySections = useMemo<CitySection[]>(() => groupByCity(stops), [stops]);
  const sections = useMemo(
    () =>
      byDay
        ? groupByDay(stops, trip?.start_date ?? null).map((s) => ({ key: s.key, label: s.label, items: s.items }))
        : citySections.map((s) => ({ key: s.key, label: s.city, items: s.items })),
    [stops, byDay, trip?.start_date, citySections],
  );

  // Which section a new stop will land in, resolved from the picked place — shown
  // before saving ("Adding to Tokyo") and passed straight to the insert so the
  // preview and the actual placement can't disagree.
  const previewKey = useMemo(
    () => (newLoc ? resolveTripCity(newLoc, citySections, trip) : null),
    [newLoc, citySections, trip],
  );
  const previewLabel = useMemo(() => {
    if (!newLoc) return null;
    const existing = citySections.find((s) => s.key === previewKey);
    return existing?.city || newLoc.city || 'a new section';
  }, [newLoc, previewKey, citySections]);
  const pins = useMemo(() => stops.filter(hasCoords), [stops]);
  const region = useMemo(() => regionForPins(pins), [pins]);

  const isOwner = !!myUserId && !!trip && trip.user_id === myUserId;
  // Owner OR joined member — everyone who can build the itinerary (#67).
  const canEdit = canEditTrip(trip, members, myUserId);
  const joinedMembers = members.filter((m) => m.status === 'joined');
  const isShared = joinedMembers.length > 0 || members.length > 0;
  const rosterAvatars = [
    trip?.user?.avatar_url,
    ...joinedMembers.map((m) => m.user?.avatar_url),
  ];
  // Who's actually on the trip — the owner plus joined members. Used as the
  // denominator for per-stop progress, which is why it's ids and not a count:
  // people can be added to a single stop without joining the trip.
  const tripMemberIds = useMemo(
    () => new Set([
      ...(trip?.user_id ? [trip.user_id] : []),
      ...members.filter((m) => m.status === 'joined').map((m) => m.user_id),
    ]),
    // Derived from `members` rather than the already-filtered `joinedMembers`,
    // which is a fresh array every render and would defeat the memo.
    [trip?.user_id, members],
  );
  const plannedStops = stops.filter((s) => s.rankings.length === 0).length;
  const dates = trip ? formatDates(trip.start_date, trip.end_date) : '';

  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.trip(tripId) });

  const addStop = useMutation({
    mutationFn: () =>
      addStopFromPlace({
        tripId,
        location: newLoc as Location,
        kind: newKind,
        details: buildDetails(),
        note: newNote.trim() || null,
        date: newDate,
        cityKey: previewKey,
      }),
    onSuccess: () => { invalidate(); closeAdd(); },
    onError: (e: unknown) => Alert.alert('Could not add stop', e instanceof Error ? e.message : 'Try again.'),
  });

  // Owner: reassign a stop to a different city section ("Move to section").
  const moveSection = useMutation({
    mutationFn: ({ id, cityKey }: { id: string; cityKey: string | null }) => setStopCity(id, cityKey),
    onSuccess: () => { invalidate(); setMoveItem(null); },
    onError: (e: unknown) => Alert.alert('Could not move', e instanceof Error ? e.message : 'Try again.'),
  });

  const remove = useMutation({
    mutationFn: (stop: RankedExperience) => removeTripStop(stop),
    onSuccess: () => { invalidate(); queryClient.invalidateQueries({ queryKey: qk.myExperiences }); },
    onError: (e: unknown) => Alert.alert('Could not remove', e instanceof Error ? e.message : 'Try again.'),
  });

  const move = useMutation({
    mutationFn: ({ id, position }: { id: string; position: string }) => setTripPosition(id, position),
    onSuccess: invalidate,
    onError: (e: unknown) => Alert.alert('Could not reorder', e instanceof Error ? e.message : 'Try again.'),
  });

  // Leaving a shared trip. Your stops stay behind: planned ones are the group's,
  // and anything you ranked is already in your own list.
  const leave = useMutation({
    mutationFn: () => leaveTrip(tripId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.myTrips });
      navigation.goBack();
    },
    onError: (e: unknown) => Alert.alert('Could not leave', e instanceof Error ? e.message : 'Try again.'),
  });

  function confirmLeave() {
    Alert.alert(
      'Leave this trip?',
      'You’ll lose access to the itinerary. Anything you already ranked stays in your list.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => leave.mutate() },
      ],
    );
  }

  // Visitor: bookmark a ranked stop to Want-to-do.
  const toggleSave = useMutation({
    mutationFn: ({ id, saved }: { id: string; saved: boolean }) =>
      saved ? unsaveExperience(id) : saveExperience(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.savedIds });
      queryClient.invalidateQueries({ queryKey: qk.saves });
    },
  });

  function closeAdd() {
    setAdding(false);
    setNewLoc(null);
    setNewKind('experience');
    setNewNote('');
    setNewDate(todayString());
    setCheckOut('');
    setResTime('');
    setPartySize('');
    setCarrier('');
    setConfirmation('');
  }

  // Auto-detect the kind from the picked place's types (always overridable).
  function onPickLocation(loc: Location | null) {
    setNewLoc(loc);
    if (loc) setNewKind(kindFromPlaceTypes(loc.types, loc.primaryType));
  }

  // Assemble the kind-specific `details` jsonb from the relevant fields.
  function buildDetails(): StopDetails {
    const conf = confirmation.trim() || undefined;
    if (newKind === 'stay') {
      return { check_in: newDate, check_out: checkOut.trim() || undefined, confirmation: conf };
    }
    if (newKind === 'eat') {
      const size = parseInt(partySize, 10);
      return {
        time: resTime.trim() || undefined,
        party_size: Number.isFinite(size) && size > 0 ? size : undefined,
        confirmation: conf,
      };
    }
    if (newKind === 'transport') {
      return { time: resTime.trim() || undefined, carrier: carrier.trim() || undefined, confirmation: conf };
    }
    return {};
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
        const userId = await getMyUserId();
        if (userId) [cover] = await uploadExperiencePhotos(userId, [eCover]);
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

  function confirmRemove(stop: RankedExperience) {
    Alert.alert(
      stop.rankings.length === 0 ? 'Remove this stop?' : 'Remove from trip?',
      removalSummary(stop, myUserId),
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(stop) },
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

  // Graduate a planned stop: route through the capture step (AddExperience in
  // graduate mode, prefilled from the row) so photos/quick take/tags can be added
  // before ranking (#51). The save still updates the existing row in place.
  //
  // On a shared trip you might be ranking a stop a trip mate added. Nothing has
  // to be claimed or copied any more — it's one post, and ranking it just adds
  // YOUR ranking to it, with your own photos and take.
  function rankStop(stop: RankedExperience) {
    (navigation as NavigationProp<Record<string, object>>).navigate('Log', {
      screen: 'AddExperience',
      params: { graduateExperienceId: stop.id },
    } as object);
  }

  function countLine(): string {
    if (stops.length === 0) return 'No stops yet';
    const parts = [`${stops.length} ${stops.length === 1 ? 'stop' : 'stops'}`];
    const stays = stops.filter((s) => s.kind === 'stay').length;
    const eats = stops.filter((s) => s.kind === 'eat').length;
    if (stays > 0) parts.push(`${stays} ${stays === 1 ? 'stay' : 'stays'}`);
    if (eats > 0) parts.push(eats === 1 ? '1 spot to eat' : `${eats} spots to eat`);
    if (plannedStops > 0) parts.push(`${plannedStops} planned`);
    if (joinedMembers.length > 0) {
      parts.push(`${joinedMembers.length + 1} people`);
    }
    return parts.join(' · ');
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <AppText variant="body" weight="medium" color={COLORS.accent}>‹ Back</AppText>
        </TouchableOpacity>
        <View style={styles.topActions}>
          {/* Reordering acts on itinerary order, which day-grouping doesn't show —
              so Edit is only offered in the city view. */}
          {canEdit && stops.length > 0 && mode === 'list' && !byDay && (
            <TouchableOpacity onPress={() => setEditing((e) => !e)} hitSlop={8}>
              <AppText variant="body" weight="semibold" color={COLORS.brand}>{editing ? 'Done' : 'Edit'}</AppText>
            </TouchableOpacity>
          )}
          {stops.length > 0 && (
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
            <AppText variant="display" style={styles.title}>{trip?.title ?? 'Trip'}</AppText>
            {canEdit && (
              <TouchableOpacity onPress={openEditTrip} hitSlop={8}>
                <Ionicons name="create-outline" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
          {!!trip?.destination && <AppText variant="body" color={COLORS.textSecondary} style={styles.destination}>{trip.destination}</AppText>}
          {!!dates && <AppText variant="subhead" weight="regular" color={COLORS.textSecondary} style={styles.dates}>{dates}</AppText>}
          <AppText variant="subhead" weight="regular" color={COLORS.textMuted} style={styles.count}>{countLine()}</AppText>

          {/* Who's building this trip (#67). Members can invite more people;
              everyone else just sees who's on it. */}
          <View style={styles.roster}>
            <TouchableOpacity
              style={styles.rosterMain}
              onPress={() => canEdit && setShowMembers(true)}
              disabled={!canEdit}
              activeOpacity={0.7}
            >
              <AvatarStack uris={rosterAvatars} size={26} />
              <AppText variant="subhead" weight="regular" color={COLORS.textSecondary}>
                {isShared
                  ? `${trip?.user?.name ?? 'Someone'} + ${joinedMembers.length || members.length} ${
                      (joinedMembers.length || members.length) === 1 ? 'other' : 'others'
                    }`
                  : trip?.user?.name ?? ''}
              </AppText>
            </TouchableOpacity>
            {canEdit && (
              <TouchableOpacity style={styles.inviteChip} onPress={() => setShowMembers(true)} activeOpacity={0.8}>
                <Ionicons name="person-add-outline" size={15} color={COLORS.brand} />
                <AppText variant="caption" weight="semibold" color={COLORS.brand}>Invite</AppText>
              </TouchableOpacity>
            )}
          </View>


          {/* City vs day grouping (#34) — day needs a start date to anchor Day 1. */}
          {canGroupByDay && stops.length > 0 && (
            <View style={styles.groupToggle}>
              <SegmentedControl
                segments={[
                  { value: 'city', label: 'By city' },
                  { value: 'day', label: 'By day' },
                ]}
                value={groupMode}
                onChange={(v) => { setGroupMode(v); if (v === 'day') setEditing(false); }}
              />
            </View>
          )}

          {stops.length === 0 ? (
            <View style={styles.empty}>
              <AppText variant="headline" style={styles.emptyTitle}>This itinerary is empty</AppText>
              <AppText variant="body" color={COLORS.textSecondary} style={styles.emptyBody}>
                {canEdit
                  ? 'Add a planned stop or log an experience to start building it.'
                  : 'Nothing here yet.'}
              </AppText>
            </View>
          ) : (
            sections.map((section) => (
              <View key={section.key} style={styles.section}>
                <AppText variant="caption" weight="semibold" color={COLORS.textSecondary} style={styles.cityHeader}>{section.label}</AppText>
                {section.items.map((stop, i) => (
                  <ItineraryRow
                    key={stop.id}
                    stop={stop}
                    isShared={isShared}
                    editing={editing}
                    onOpen={() => navigation.navigate('ExperienceDetail', { experienceId: stop.id })}
                    canUp={i > 0}
                    canDown={i < section.items.length - 1}
                    onMoveUp={() => {
                      const p = positionToMoveUp(section.items, i);
                      if (p) move.mutate({ id: stop.id, position: p });
                    }}
                    onMoveDown={() => {
                      const p = positionToMoveDown(section.items, i);
                      if (p) move.mutate({ id: stop.id, position: p });
                    }}
                    onDelete={() => confirmRemove(stop)}
                    canEdit={canEdit}
                    onRank={() => rankStop(stop)}
                    saved={savedIds.has(stop.id)}
                    onToggleSave={() => toggleSave.mutate({ id: stop.id, saved: savedIds.has(stop.id) })}
                    onMove={() => setMoveItem(stop)}
                    memberIds={tripMemberIds}
                  />
                ))}
              </View>
            ))
          )}

          {canEdit && !editing && (
            <TouchableOpacity style={styles.addBtn} onPress={() => setAdding(true)} activeOpacity={0.8}>
              <Ionicons name="add" size={20} color={COLORS.brand} />
              <AppText variant="body" weight="semibold" color={COLORS.brand}>Add to itinerary</AppText>
            </TouchableOpacity>
          )}

          {/* A joined member can step out; the owner can't leave their own trip. */}
          {canEdit && !isOwner && (
            <TouchableOpacity style={styles.leaveBtn} onPress={confirmLeave} activeOpacity={0.7}>
              <AppText variant="subhead" weight="semibold" color={COLORS.error}>Leave this trip</AppText>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {/* Add-stop modal */}
      <Modal visible={adding} animationType="slide" transparent onRequestClose={closeAdd}>
        <SheetBackdrop>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <AppText variant="title">Add a stop</AppText>
              <TouchableOpacity onPress={closeAdd} hitSlop={8}>
                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <SegmentedControl segments={KIND_SEGMENTS} value={newKind} onChange={setNewKind} />

            <LocationSearch value={newLoc} onChange={onPickLocation} />

            {!!newLoc && (
              <ScrollView keyboardShouldPersistTaps="handled" style={styles.addScroll} contentContainerStyle={styles.addFields}>
                <AppText variant="caption" weight="medium" color={COLORS.textSecondary} style={styles.fieldLabel}>
                  {newKind === 'stay' ? 'Check-in' : 'Date'}
                </AppText>
                <DateField value={newDate} onChange={setNewDate} />

                {newKind === 'stay' && (
                  <>
                    <AppText variant="caption" weight="medium" color={COLORS.textSecondary} style={styles.fieldLabel}>Check-out</AppText>
                    <DateField value={checkOut || newDate} onChange={setCheckOut} minimumDate={new Date()} />
                  </>
                )}

                {(newKind === 'eat' || newKind === 'transport') && (
                  <TextInput
                    style={styles.noteInput}
                    value={resTime}
                    onChangeText={setResTime}
                    placeholder={newKind === 'eat' ? 'Reservation time (HH:MM, optional)' : 'Departure time (HH:MM, optional)'}
                    placeholderTextColor={COLORS.textMuted}
                    autoCapitalize="none"
                  />
                )}
                {newKind === 'eat' && (
                  <TextInput
                    style={styles.noteInput}
                    value={partySize}
                    onChangeText={setPartySize}
                    placeholder="Party size (optional)"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="number-pad"
                  />
                )}
                {newKind === 'transport' && (
                  <TextInput
                    style={styles.noteInput}
                    value={carrier}
                    onChangeText={setCarrier}
                    placeholder="Carrier / airline (optional)"
                    placeholderTextColor={COLORS.textMuted}
                  />
                )}
                {(newKind === 'stay' || newKind === 'eat' || newKind === 'transport') && (
                  <TextInput
                    style={styles.noteInput}
                    value={confirmation}
                    onChangeText={setConfirmation}
                    placeholder="Confirmation # (optional)"
                    placeholderTextColor={COLORS.textMuted}
                    autoCapitalize="characters"
                  />
                )}

                <TextInput
                  style={styles.noteInput}
                  value={newNote}
                  onChangeText={setNewNote}
                  placeholder="Add a note (optional) — e.g. book ahead"
                  placeholderTextColor={COLORS.textMuted}
                  multiline
                />

                {!!previewLabel && (
                  <AppText variant="subhead" weight="regular" color={COLORS.textSecondary} style={styles.previewLine}>
                    Adding to <AppText variant="subhead" weight="semibold" color={COLORS.text}>{previewLabel}</AppText>
                  </AppText>
                )}

                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => addStop.mutate()}
                  disabled={addStop.isPending}
                  activeOpacity={0.85}
                >
                  {addStop.isPending
                    ? <ActivityIndicator color={COLORS.surface} />
                    : <AppText variant="body" weight="semibold" color={COLORS.surface}>Add to itinerary</AppText>}
                </TouchableOpacity>
              </ScrollView>
            )}

            {newKind === 'experience' && (
              <TouchableOpacity onPress={logExperience} hitSlop={8} style={styles.logLink}>
                <AppText variant="subhead" color={COLORS.textSecondary}>Or log a ranked experience instead</AppText>
              </TouchableOpacity>
            )}
          </View>
        </SheetBackdrop>
      </Modal>

      {/* Move a stop to a different city section (members) */}
      <Modal visible={!!moveItem} animationType="slide" transparent onRequestClose={() => setMoveItem(null)}>
        <SheetBackdrop>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <AppText variant="title">Move to section</AppText>
              <TouchableOpacity onPress={() => setMoveItem(null)} hitSlop={8}>
                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.list}>
              {citySections.map((s) => {
                const current = moveItem?.city_key
                  ? moveItem.city_key === s.key
                  : s.items.some((it) => it.id === moveItem?.id);
                return (
                  <TouchableOpacity
                    key={s.key}
                    style={styles.moveRow}
                    onPress={() => moveItem && moveSection.mutate({ id: moveItem.id, cityKey: s.key === 'other' ? null : s.key })}
                    disabled={moveSection.isPending}
                    activeOpacity={0.7}
                  >
                    <AppText variant="body" weight={current ? 'semibold' : 'regular'}>{s.city}</AppText>
                    {current && <Ionicons name="checkmark" size={18} color={COLORS.brand} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </SheetBackdrop>
      </Modal>

      {/* Roster + invite (#67) */}
      <InviteToTripSheet
        visible={showMembers}
        trip={trip}
        members={members}
        owner={trip?.user}
        isOwner={isOwner}
        onClose={() => setShowMembers(false)}
      />

      {/* Edit trip details (owner) */}
      <Modal visible={editingTrip} animationType="slide" transparent onRequestClose={() => setEditingTrip(false)}>
        <SheetBackdrop>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <AppText variant="title">Edit trip</AppText>
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
                    <AppText variant="caption">Add a cover photo</AppText>
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
                  : <AppText variant="body" weight="semibold" color={COLORS.surface}>Save</AppText>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </SheetBackdrop>
      </Modal>
    </SafeAreaView>
  );
}

type RowProps = {
  stop: RankedExperience;
  // Shared trips show who's done what; solo trips stay visually unchanged.
  isShared: boolean;
  editing: boolean;
  canUp: boolean;
  canDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  canEdit: boolean;
  onMove: () => void;
  onRank: () => void;
  saved: boolean;
  onToggleSave: () => void;
  // Tapping the row body opens the experience detail screen.
  onOpen: () => void;
};

// "2 of 4 on the trip ranked it" — progress across the TRIP, so the denominator
// is trip members and the numerator counts only their rankings.
//
// Someone can be added to a single stop WITHOUT joining the trip: they rank it,
// and their ranking lands on the same shared post. Counting them here produced
// "3 of 2 ranked it". They're not lost — they're named beside the avatars on the
// row above; they just aren't part of a trip-progress fraction.
function rankedLine(stop: RankedExperience, memberIds: Set<string>): string | null {
  if (memberIds.size <= 1) return null; // solo trip: nothing to make progress against
  const byMembers = stop.rankings.filter((r) => memberIds.has(r.user_id)).length;
  if (byMembers === 0) return null;
  return `${byMembers} of ${memberIds.size} on the trip ranked it`;
}

// One itinerary stop — ONE shared post, showing YOUR ranking when you have one.
// Its icon and subtitle come from its `kind` (bed / fork / plane for logistics;
// sentiment emoji for an experience you've ranked). Members get
// edit/reorder/delete/move + "Rank" on rankable stops (which just adds your own
// ranking to the same post); non-members get "save to Want-to-do".
function ItineraryRow({
  stop, isShared, editing, canUp, canDown, onMoveUp, onMoveDown, onDelete, onMove,
  canEdit, onRank, saved, onToggleSave, onOpen, memberIds,
}: RowProps & { memberIds: Set<string> }) {
  // "Planned" for YOU: you haven't ranked this, whatever your trip mates did. A
  // stay/transport is never rankable, so it stays "planned" for everyone.
  const planned = !stop.mine;
  const place = localityLabel(stop);
  const subtitle = stopSubtitle(stop);
  const isExperience = stop.kind === 'experience';
  const ranked = rankedLine(stop, memberIds);
  // Everyone else who's ranked it — the shared half of the line.
  const others = stop.rankings.filter((r) => r.user_id !== stop.mine?.user_id);
  const showRank = canEdit && planned && isRankable(stop.kind);

  return (
    <TouchableOpacity style={styles.row} onPress={onOpen} disabled={editing} activeOpacity={0.7}>
      <View style={styles.rowIcon}>
        {isExperience && !planned ? (
          <AppText style={styles.rowEmoji}>{sentimentEmoji(stop.mine?.sentiment) || '📍'}</AppText>
        ) : isExperience ? (
          <Ionicons name="ellipse-outline" size={18} color={COLORS.textMuted} />
        ) : (
          <Ionicons name={kindIcon(stop.kind)} size={18} color={COLORS.textMuted} />
        )}
      </View>
      <View style={styles.rowBody}>
        <AppText variant="body" weight="semibold" numberOfLines={1}>{experienceTitle(stop)}</AppText>
        {!!place && <AppText variant="caption" color={COLORS.textSecondary} numberOfLines={1}>{place}</AppText>}
        {!!subtitle && <AppText variant="caption" color={COLORS.accent} numberOfLines={1} style={styles.rowNote}>{subtitle}</AppText>}
        {planned && !!stop.note && <AppText variant="caption" style={styles.rowNote}>{stop.note}</AppText>}
        {!!stop.mine?.quick_take && <AppText variant="subhead" weight="regular" color={COLORS.text} style={styles.rowQuote}>“{stop.mine.quick_take}”</AppText>}
        {!planned && stop.tags.length > 0 && (
          <AppText variant="footnote" numberOfLines={1} style={styles.rowTags}>
            {stop.tags.map((t) => TAG_LABELS[t]).join(' · ')}
          </AppText>
        )}
        {isShared && (others.length > 0 || !!ranked) && (
          <View style={styles.rowMeta}>
            {others.length > 0 && (
              <>
                <AvatarStack uris={others.map((r) => r.user?.avatar_url)} size={16} max={3} />
                <AppText variant="footnote" color={COLORS.textMuted} numberOfLines={1}>
                  {others.map((r) => r.user?.name?.split(' ')[0] ?? 'someone').join(', ')}
                </AppText>
              </>
            )}
            {!!ranked && <AppText variant="footnote" color={COLORS.textMuted}>{ranked}</AppText>}
          </View>
        )}
      </View>
      {editing ? (
        <View style={styles.rowControls}>
          <TouchableOpacity onPress={onMove} hitSlop={6}>
            <Ionicons name="albums-outline" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
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
      ) : !canEdit ? (
        // Visitors can only save a rankable stop to their Wishlist — the old
        // "add to my trip" + went away with stop-copying (Part 3 of #72), and
        // logistics were never savable content.
        stop.rankings.length > 0 && isRankable(stop.kind) ? (
          <TouchableOpacity onPress={onToggleSave} hitSlop={6}>
            <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={22} color={COLORS.accent} />
          </TouchableOpacity>
        ) : null
      ) : showRank ? (
        // "Rank" is offered to every member — ranking is opt-in per person, so a
        // stop you skipped never lands in your list.
        <TouchableOpacity style={styles.rankBtn} onPress={onRank} activeOpacity={0.85}>
          <AppText variant="caption" weight="semibold" color={COLORS.surface}>Rank</AppText>
        </TouchableOpacity>
      ) : stop.mine && stop.mine.photos.length > 0 ? (
        <Image source={{ uri: stop.mine.photos[0] }} style={styles.thumb} />
      ) : null}
    </TouchableOpacity>
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
  title: { flex: 1 },
  destination: { marginTop: 2 },
  dates: { marginTop: 2 },
  count: { marginTop: SPACING.xs, marginBottom: SPACING.lg },
  section: { marginBottom: SPACING.lg },
  cityHeader: {
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
  rowNote: { marginTop: 2 },
  rowQuote: { fontStyle: 'italic', marginTop: 2 },
  rowTags: { marginTop: 2 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: 3 },
  rowControls: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  thumb: { width: 48, height: 48, borderRadius: RADIUS.sm, backgroundColor: COLORS.border },
  rankBtn: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full, backgroundColor: COLORS.brand,
  },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs,
    borderWidth: 1.5, borderColor: COLORS.brand, borderRadius: RADIUS.md,
    paddingVertical: SPACING.md, marginTop: SPACING.sm,
  },
  groupToggle: { marginBottom: SPACING.lg },
  roster: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: SPACING.sm, marginBottom: SPACING.lg,
  },
  rosterMain: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flex: 1 },
  inviteChip: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    borderWidth: 1.5, borderColor: COLORS.brand, borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
  },
  leaveBtn: { alignItems: 'center', paddingVertical: SPACING.lg },
  empty: { paddingTop: SPACING.xxl, alignItems: 'center', gap: SPACING.sm },
  emptyTitle: { textAlign: 'center' },
  emptyBody: { textAlign: 'center', lineHeight: 22 },
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg,
    padding: SPACING.xl, paddingBottom: SPACING.xxl, gap: SPACING.md, minHeight: 320,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  noteInput: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: 12, fontSize: 15, color: COLORS.text,
    backgroundColor: COLORS.surface, minHeight: 48,
  },
  primaryBtn: {
    backgroundColor: COLORS.brand, borderRadius: RADIUS.md,
    paddingVertical: SPACING.md, alignItems: 'center',
  },
  logLink: { alignItems: 'center', paddingVertical: SPACING.sm },
  addScroll: { maxHeight: 340 },
  addFields: { gap: SPACING.md, paddingBottom: SPACING.sm },
  fieldLabel: { textTransform: 'uppercase', letterSpacing: 0.5 },
  previewLine: { textAlign: 'center', paddingTop: SPACING.xs },
  list: { maxHeight: 360 },
  moveRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  editForm: { gap: SPACING.md, paddingTop: SPACING.sm },
  coverPicker: { borderRadius: RADIUS.md, overflow: 'hidden' },
  editCover: { width: '100%', height: 140, borderRadius: RADIUS.md, backgroundColor: COLORS.border },
  coverPlaceholder: { alignItems: 'center', justifyContent: 'center', gap: SPACING.xs },
  dateRow: { flexDirection: 'row', gap: SPACING.md },
  dateInput: { flex: 1 },
});
