import React from 'react';
import { View, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LogStackParamList } from '@/types';
import { AppText } from '@/components/ui/AppText';
import { COLORS, SPACING, RADIUS } from '@/constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<LogStackParamList, 'LogHome'>;
};

export function LogScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <AppText variant="display">Add to your taste</AppText>
        <AppText variant="body" color={COLORS.textSecondary} style={styles.subtitle}>
          Log something you did, or start a trip to group experiences.
        </AppText>
      </View>

      <View style={styles.options}>
        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('AddExperience')}
          activeOpacity={0.85}
        >
          <AppText style={styles.cardEmoji}>📍</AppText>
          <AppText variant="title" weight="semibold">Log an experience</AppText>
          <AppText variant="subhead" color={COLORS.textMuted} style={styles.cardDesc}>
            A hike, a dinner, a bar, a museum — one thing you did. Rank it against your favorites.
          </AppText>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('StartTrip')}
          activeOpacity={0.85}
        >
          <AppText style={styles.cardEmoji}>🧳</AppText>
          <AppText variant="title" weight="semibold">Start a trip</AppText>
          <AppText variant="subhead" color={COLORS.textMuted} style={styles.cardDesc}>
            A container for experiences. Add things you've done, or keep it empty and fill it as you go.
          </AppText>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  subtitle: { marginTop: SPACING.xs, lineHeight: 22 },
  options: { paddingHorizontal: SPACING.xl, gap: SPACING.md },
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
  },
  cardEmoji: { fontSize: 32, marginBottom: SPACING.sm },
  cardDesc: { marginTop: SPACING.xs, lineHeight: 20 },
});
