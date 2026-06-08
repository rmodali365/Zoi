import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { AuthStackParamList } from '@/types';
import { supabase } from '@/lib/supabase';
import { COLORS, SPACING, RADIUS, FONT } from '@/constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'VerifyOtp'>;
  route: RouteProp<AuthStackParamList, 'VerifyOtp'>;
};

export function VerifyOtpScreen({ navigation, route }: Props) {
  const { phone } = route.params;
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleVerify() {
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      phone,
      token: otp,
      type: 'sms',
    });
    setLoading(false);

    if (error) {
      Alert.alert('Invalid code', 'Please check the code and try again.');
      return;
    }
    // Auth state change in RootNavigator will handle redirect,
    // but navigate to Onboarding for new users
    navigation.navigate('Onboarding');
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
          <Text style={styles.title}>Enter the code</Text>
          <Text style={styles.subtitle}>Sent to {phone}</Text>

          <TextInput
            style={styles.input}
            value={otp}
            onChangeText={setOtp}
            placeholder="000000"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
          />

          <TouchableOpacity
            style={[styles.button, (otp.length < 6 || loading) && styles.buttonDisabled]}
            onPress={handleVerify}
            disabled={otp.length < 6 || loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.background} />
            ) : (
              <Text style={styles.buttonText}>Verify</Text>
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
    fontSize: 32,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
    letterSpacing: 8,
    textAlign: 'center',
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
