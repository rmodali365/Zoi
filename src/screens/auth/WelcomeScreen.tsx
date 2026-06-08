import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '@/types';
import { COLORS, SPACING, RADIUS, FONT } from '@/constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Welcome'>;
};

export function WelcomeScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.wordmark}>Zoi</Text>
          <Text style={styles.tagline}>Rank what you do.{'\n'}Share your taste.</Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate('PhoneAuth')}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>Get started</Text>
          </TouchableOpacity>
          <Text style={styles.legal}>
            By continuing you agree to our Terms of Service and Privacy Policy.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.xl,
    justifyContent: 'space-between',
    paddingBottom: SPACING.xl,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
  },
  wordmark: {
    fontSize: 64,
    ...FONT.bold,
    color: COLORS.text,
    letterSpacing: -2,
    marginBottom: SPACING.md,
  },
  tagline: {
    fontSize: 20,
    ...FONT.regular,
    color: COLORS.textSecondary,
    lineHeight: 28,
  },
  actions: {
    gap: SPACING.md,
  },
  primaryButton: {
    backgroundColor: COLORS.text,
    borderRadius: RADIUS.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: COLORS.background,
    fontSize: 16,
    ...FONT.semibold,
  },
  legal: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
