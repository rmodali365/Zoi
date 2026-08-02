import React, { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Experience, Tag } from '@/types';
import { TAG_LABELS } from '@/constants/experiences';
import { primaryLocation } from '@/lib/experienceDisplay';
import { Chip } from '@/components/ui/Chip';
import { SPACING } from '@/constants/theme';

// One active filter over a ranked list: everything, one city, or one tag (#62).
// View-only — positions stay global (#N overall), the ranking model is untouched.
export type ExperienceFilter =
  | { kind: 'all' }
  | { kind: 'city'; city: string }
  | { kind: 'tag'; tag: Tag };

export const ALL_FILTER: ExperienceFilter = { kind: 'all' };

export function matchesExperienceFilter(e: Experience, f: ExperienceFilter): boolean {
  if (f.kind === 'all') return true;
  if (f.kind === 'city') return primaryLocation(e)?.city === f.city;
  return e.tags.includes(f.tag);
}

type Props = {
  items: Experience[];
  value: ExperienceFilter;
  onChange: (f: ExperienceFilter) => void;
};

// Horizontal chip row: All · [cities…] · [tags…], derived from the items
// themselves so only filters with matches are offered. Renders nothing when
// there's only one option (no city/tag data to filter by).
export function ExperienceFilterChips({ items, value, onChange }: Props) {
  const { cities, tags } = useMemo(() => {
    const citySet = new Set<string>();
    const tagSet = new Set<Tag>();
    for (const e of items) {
      const city = primaryLocation(e)?.city;
      if (city) citySet.add(city);
      for (const t of e.tags) tagSet.add(t);
    }
    return { cities: [...citySet].sort(), tags: [...tagSet] };
  }, [items]);

  if (cities.length + tags.length === 0) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      <Chip label="All" selected={value.kind === 'all'} onPress={() => onChange(ALL_FILTER)} />
      {cities.map((city) => (
        <Chip
          key={`city-${city}`}
          label={city}
          selected={value.kind === 'city' && value.city === city}
          onPress={() => onChange({ kind: 'city', city })}
        />
      ))}
      {tags.map((tag) => (
        <Chip
          key={`tag-${tag}`}
          label={TAG_LABELS[tag]}
          selected={value.kind === 'tag' && value.tag === tag}
          onPress={() => onChange({ kind: 'tag', tag })}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: SPACING.xs, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.sm },
});
