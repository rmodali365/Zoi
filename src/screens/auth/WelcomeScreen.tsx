import React from 'react';
import { View, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '@/types';
import { AppText } from '@/components/ui/AppText';
import { COLORS, SPACING, RADIUS, FONT } from '@/constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Welcome'>;
};

export function WelcomeScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.hero}>
          <AppText style={styles.wordmark}>Zoi</AppText>
          <AppText variant="title" weight="regular" color={COLORS.textSecondary} style={styles.tagline}>
            Rank what you do.{'\n'}Share your taste.
          </AppText>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate('PhoneAuth')}
            activeOpacity={0.8}
          >
            <AppText variant="body" weight="semibold" color={COLORS.background}>Get started</AppText>
          </TouchableOpacity>
          <AppText variant="footnote" style={styles.legal}>
            By continuing you agree to our Terms of Service and Privacy Policy.
          </AppText>
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
  legal: {
    textAlign: 'center',
    lineHeight: 18,
  },
});
