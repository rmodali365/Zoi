import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Experience, StopDetails, StopKind } from '@/types';
import { daysBetween, formatDay } from '@/lib/dates';

// Everything the itinerary needs to render a stop by its `kind` (Part 1 of #72):
// labels, icons, whether it can be ranked, a one-line subtitle (nights /
// reservation time), and auto-detecting the kind from a picked place's types.

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export const KIND_LABELS: Record<StopKind, string> = {
  experience: 'Experience',
  stay: 'Stay',
  eat: 'Food & drink',
  transport: 'Transport',
  other: 'Other',
};

export function kindLabel(kind: StopKind): string {
  return KIND_LABELS[kind] ?? KIND_LABELS.experience;
}

export function kindIcon(kind: StopKind): IoniconName {
  switch (kind) {
    case 'stay': return 'bed-outline';
    case 'eat': return 'restaurant-outline';
    case 'transport': return 'airplane-outline';
    case 'other': return 'pricetag-outline';
    default: return 'ellipse-outline';
  }
}

// A 'stay' or 'transport' is pure logistics and never becomes ranked content;
// everything else can graduate through the normal rank flow (matches the DB
// constraint experiences_kind_rankable).
export function isRankable(kind: StopKind): boolean {
  return kind !== 'stay' && kind !== 'transport';
}

// The four kinds a user picks from when adding a stop by hand (transport is
// auto-detected from place types but rarely hand-added, so it's folded here).
export const KIND_SEGMENTS: { value: StopKind; label: string }[] = [
  { value: 'experience', label: 'Do' },
  { value: 'stay', label: 'Stay' },
  { value: 'eat', label: 'Eat' },
  { value: 'other', label: 'Other' },
];

// Best-guess kind from a Google place's types (used to pre-select the picker,
// always user-overridable). Order matters: stay/transport before eat.
export function kindFromPlaceTypes(types?: string[] | null, primaryType?: string | null): StopKind {
  const all = new Set([...(types ?? []), primaryType].filter(Boolean) as string[]);
  const has = (...ts: string[]) => ts.some((t) => all.has(t));

  if (has('lodging', 'hotel', 'motel', 'resort_hotel', 'bed_and_breakfast', 'guest_house', 'campground')) return 'stay';
  if (has('airport', 'train_station', 'transit_station', 'subway_station', 'bus_station', 'car_rental', 'ferry_terminal', 'light_rail_station')) return 'transport';
  if (has('restaurant', 'cafe', 'bar', 'bakery', 'meal_takeaway', 'meal_delivery', 'coffee_shop', 'food')) return 'eat';
  return 'experience';
}

// 12-hour label for an 'HH:MM' time string ("19:30" -> "7:30 PM"); passthrough
// for anything that doesn't parse.
export function formatTime(hhmm: string | undefined | null): string | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return hhmm;
  let h = Number(m[1]);
  const min = m[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}`;
}

// One-line secondary text for a stop, driven by its kind + details:
//   stay      -> "Jun 3 – Jun 6 · 3 nights"
//   eat       -> "7:30 PM · party of 4"
//   transport -> "Delta · 6:00 AM"
// Returns null when there's nothing kind-specific to show.
export function stopSubtitle(item: Experience): string | null {
  const d = (item.details ?? {}) as Record<string, unknown>;
  const parts: string[] = [];

  if (item.kind === 'stay') {
    const checkOut = typeof d.check_out === 'string' ? d.check_out : null;
    if (checkOut) {
      const nights = daysBetween(item.experience_date, checkOut);
      const range = `${formatDay(item.experience_date)} – ${formatDay(checkOut)}`;
      parts.push(nights > 0 ? `${range} · ${nights} ${nights === 1 ? 'night' : 'nights'}` : range);
    }
  } else if (item.kind === 'eat') {
    const t = formatTime(typeof d.time === 'string' ? d.time : null);
    if (t) parts.push(t);
    if (typeof d.party_size === 'number' && d.party_size > 0) parts.push(`party of ${d.party_size}`);
  } else if (item.kind === 'transport') {
    if (typeof d.carrier === 'string' && d.carrier.trim()) parts.push(d.carrier.trim());
    const t = formatTime(typeof d.time === 'string' ? d.time : null);
    if (t) parts.push(t);
  }

  return parts.length ? parts.join(' · ') : null;
}
