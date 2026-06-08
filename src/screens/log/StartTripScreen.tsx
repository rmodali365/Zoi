import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, SafeAreaView,
  ActivityIndicator, Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LogStackParamList } from '@/types';
import { COLORS, SPACING, RADIUS, FONT } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type Props = {
  navigation: NativeStackNavigationProp<LogStackParamList, 'StartTrip'>;
};

export function StartTripScreen({ navigation }: Props) {
  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!title.trim()) {
      Alert.alert('Name your trip', 'Give it a title so you can find it later.');
      return;
    }
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert('Error', 'Session expired.');
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('trips')
      .insert({
        user_id: user.id,
        title: title.trim(),
        destination: destination.trim() || null,
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

      <View style={styles.content}>
        <View style={styles.field}>
          <Text style={styles.label}>Trip name</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Lisbon 2026"
            placeholderTextColor={COLORS.textMuted}
            autoFocus
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

        <Text style={styles.hint}>
          A trip is just a container. You'll add individual experiences to it — each one gets ranked on its own.
        </Text>
      </View>
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
  hint: { fontSize: 14, color: COLORS.textMuted, lineHeight: 20 },
});
