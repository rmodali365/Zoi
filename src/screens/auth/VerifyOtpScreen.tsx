import React, { useState } from 'react';
import {
  View, StyleSheet, TextInput, TouchableOpacity,
  SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { AuthStackParamList } from '@/types';
import { AppText } from '@/components/ui/AppText';
import { verifyOtp } from '@/lib/auth';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

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
    let hasProfile: boolean;
    try {
      ({ hasProfile } = await verifyOtp(phone, otp));
    } catch {
      Alert.alert('Invalid code', 'Please check the code and try again.');
      return;
    } finally {
      setLoading(false);
    }

    if (!hasProfile) {
      // New user — collect their name and handle
      navigation.navigate('SetupProfile', { phone });
    }
    // Returning user — RootNavigator's onAuthStateChange will switch to App automatically
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
          <AppText variant="body" color={COLORS.textSecondary}>← Back</AppText>
        </TouchableOpacity>

        <View style={styles.content}>
          <AppText variant="display">Enter the code</AppText>
          <AppText variant="body" color={COLORS.textSecondary}>Sent to {phone}</AppText>

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
              <AppText variant="body" weight="semibold" color={COLORS.background}>Verify</AppText>
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
  content: { flex: 1, justifyContent: 'center', gap: SPACING.md },
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
    backgroundColor: COLORS.brand,
    borderRadius: RADIUS.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  buttonDisabled: { opacity: 0.4 },
});
