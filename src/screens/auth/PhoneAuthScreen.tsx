import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '@/types';
import { supabase } from '@/lib/supabase';
import { COLORS, SPACING, RADIUS, FONT } from '@/constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'PhoneAuth'>;
};

export function PhoneAuthScreen({ navigation }: Props) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSendOtp() {
    const formatted = phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g, '')}`;
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: formatted });
    setLoading(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    navigation.navigate('VerifyOtp', { phone: formatted });
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.content}>
          <Text style={styles.title}>What's your number?</Text>
          <Text style={styles.subtitle}>We'll text you a code to log in.</Text>

          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+1 (555) 000-0000"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="phone-pad"
            autoFocus
          />

          <TouchableOpacity
            style={[styles.button, (!phone || loading) && styles.buttonDisabled]}
            onPress={handleSendOtp}
            disabled={!phone || loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.background} />
            ) : (
              <Text style={styles.buttonText}>Send code</Text>
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
  back: { paddingTop: SPACING.md },
  backText: { fontSize: 15, color: COLORS.textSecondary },
  content: { flex: 1, justifyContent: 'center', gap: SPACING.md },
  title: { fontSize: 28, ...FONT.bold, color: COLORS.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 16, color: COLORS.textSecondary },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    fontSize: 18,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
    marginTop: SPACING.sm,
  },
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
