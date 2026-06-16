import React, { useEffect, useRef, useState } from 'react';
import {
  View, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet,
} from 'react-native';
import { Location } from '@/types';
import { autocompletePlaces, getPlaceDetails, PlaceSuggestion } from '@/lib/places';
import { AppText } from '@/components/ui/AppText';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

// Places session token groups autocomplete keystrokes + the final details call for billing.
function newSessionToken(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

type Props = {
  value: Location | null;
  onChange: (loc: Location | null) => void;
};

export function LocationSearch({ value, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const sessionToken = useRef(newSessionToken());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (value) return; // already selected — stop searching
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        setSuggestions(await autocompletePlaces(query, sessionToken.current));
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, value]);

  async function handleSelect(s: PlaceSuggestion) {
    setLoading(true);
    try {
      const loc = await getPlaceDetails(s.placeId, sessionToken.current);
      onChange(loc);
      setSuggestions([]);
      setQuery('');
      sessionToken.current = newSessionToken(); // fresh session after a completed selection
    } catch {
      // swallow — user can retry
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    onChange(null);
    setQuery('');
    setSuggestions([]);
  }

  if (value) {
    return (
      <View style={styles.selected}>
        <View style={styles.selectedInfo}>
          <AppText variant="body" weight="semibold">{value.name}</AppText>
          {!!value.formattedAddress && (
            <AppText variant="caption" numberOfLines={1} style={styles.selectedAddr}>{value.formattedAddress}</AppText>
          )}
        </View>
        <TouchableOpacity onPress={handleClear} hitSlop={8}>
          <AppText variant="subhead" weight="medium" color={COLORS.accent}>Change</AppText>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        placeholder="Search for a place"
        placeholderTextColor={COLORS.textMuted}
        autoCorrect={false}
      />
      {loading && <ActivityIndicator style={styles.loading} color={COLORS.textMuted} />}
      {suggestions.length > 0 && (
        <View style={styles.dropdown}>
          {suggestions.map((s) => (
            <TouchableOpacity key={s.placeId} style={styles.row} onPress={() => handleSelect(s)} activeOpacity={0.7}>
              <AppText variant="body" weight="medium">{s.primary}</AppText>
              {!!s.secondary && <AppText variant="caption" numberOfLines={1} style={styles.rowSecondary}>{s.secondary}</AppText>}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
  loading: { position: 'absolute', right: SPACING.md, top: 16 },
  dropdown: {
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
  },
  row: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  rowSecondary: { marginTop: 1 },
  selected: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.text,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
    gap: SPACING.sm,
  },
  selectedInfo: { flex: 1 },
  selectedAddr: { marginTop: 1 },
});
