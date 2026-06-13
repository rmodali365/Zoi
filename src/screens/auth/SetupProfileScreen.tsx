import React, { useState } from 'react';
import {
  View, StyleSheet, TextInput, TouchableOpacity,
  SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { AuthStackParamList } from '@/types';
import { AppText } from '@/components/ui/AppText';
import { getMyUserId } from '@/lib/auth';
import { cleanHandle, createProfile, handleTaken } from '@/lib/users';
import { useAuthContext } from '@/contexts/AuthContext';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

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

  const handleClean = cleanHandle(handle);
  const canContinue = name.trim().length > 0 && handleClean.length >= 2 && !loading;

  async function handleContinue() {
    setLoading(true);
    try {
      const userId = await getMyUserId();
      if (!userId) {
        Alert.alert('Error', 'Session expired. Please sign in again.');
        return;
      }

      if (await handleTaken(handleClean)) {
        Alert.alert('Handle taken', 'That handle is already in use. Pick another.');
        return;
      }

      await createProfile({ id: userId, name: name.trim(), handle: handleClean, phone });
      // Signals RootNavigator to switch to App
      setProfileComplete(true);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not create your profile.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <AppText variant="display">Set up your profile</AppText>
          <AppText variant="body" color={COLORS.textSecondary} style={styles.subtitle}>
            This is how friends will find and recognize you.
          </AppText>

          <View style={styles.fields}>
            <View style={styles.field}>
              <AppText variant="caption" weight="medium" color={COLORS.textSecondary} style={styles.label}>Your name</AppText>
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
              <AppText variant="caption" weight="medium" color={COLORS.textSecondary} style={styles.label}>Handle</AppText>
              <View style={styles.handleRow}>
                <AppText variant="headline" weight="regular" color={COLORS.textSecondary} style={styles.atSign}>@</AppText>
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
                <AppText variant="caption" style={styles.handleHint}>Will be saved as @{handleClean}</AppText>
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
              <AppText variant="body" weight="semibold" color={COLORS.background}>Continue</AppText>
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
  subtitle: { lineHeight: 24, marginTop: -SPACING.sm },
  fields: { gap: SPACING.md },
  field: { gap: SPACING.xs },
  label: { textTransform: 'uppercase', letterSpacing: 0.5 },
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
  atSign: { paddingBottom: 1 },
  handleInput: { flex: 1 },
  handleHint: { marginTop: 2 },
  button: {
    backgroundColor: COLORS.text,
    borderRadius: RADIUS.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  buttonDisabled: { opacity: 0.4 },
});
