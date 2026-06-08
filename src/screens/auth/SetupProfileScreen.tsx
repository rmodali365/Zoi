import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { AuthStackParamList } from '@/types';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { COLORS, SPACING, RADIUS, FONT } from '@/constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'SetupProfile'>;
  route: RouteProp<AuthStackParamList, 'SetupProfile'>;
};

export function SetupProfileScreen({ route }: Props) {
  const { phone } = route.params;
  const { setProfileComplete } = useAuthContext();
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [loading, setLoading] = useState(false);

  const handleClean = handle.toLowerCase().replace(/[^a-z0-9_]/g, '');
  const canContinue = name.trim().length > 0 && handleClean.length >= 2 && !loading;

  async function handleContinue() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert('Error', 'Session expired. Please sign in again.');
      setLoading(false);
      return;
    }

    // Check handle uniqueness
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('handle', handleClean)
      .maybeSingle();

    if (existing) {
      Alert.alert('Handle taken', 'That handle is already in use. Pick another.');
      setLoading(false);
      return;
    }

    const { error } = await supabase.from('users').insert({
      id: user.id,
      name: name.trim(),
      handle: handleClean,
      phone,
    });

    setLoading(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    // Signals RootNavigator to switch to App
    setProfileComplete(true);
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <Text style={styles.title}>Set up your profile</Text>
          <Text style={styles.subtitle}>This is how friends will find and recognize you.</Text>

          <View style={styles.fields}>
            <View style={styles.field}>
              <Text style={styles.label}>Your name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="First Last"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Handle</Text>
              <View style={styles.handleRow}>
                <Text style={styles.atSign}>@</Text>
                <TextInput
                  style={[styles.input, styles.handleInput]}
                  value={handle}
                  onChangeText={setHandle}
                  placeholder="yourhandle"
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                />
              </View>
              {handle.length > 0 && handle !== handleClean && (
                <Text style={styles.handleHint}>Will be saved as @{handleClean}</Text>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, !canContinue && styles.buttonDisabled]}
            onPress={handleContinue}
            disabled={!canContinue}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.background} />
            ) : (
              <Text style={styles.buttonText}>Continue</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  inner: { flex: 1, paddingHorizontal: SPACING.xl },
  content: { flex: 1, justifyContent: 'center', gap: SPACING.lg },
  title: { fontSize: 28, ...FONT.bold, color: COLORS.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 16, color: COLORS.textSecondary, lineHeight: 24, marginTop: -SPACING.sm },
  fields: { gap: SPACING.md },
  field: { gap: SPACING.xs },
  label: { fontSize: 13, ...FONT.medium, color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    fontSize: 17,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
  },
  handleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  atSign: { fontSize: 17, color: COLORS.textSecondary, paddingBottom: 1 },
  handleInput: { flex: 1 },
  handleHint: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  button: {
    backgroundColor: COLORS.text,
    borderRadius: RADIUS.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: COLORS.background, fontSize: 16, ...FONT.semibold },
});
