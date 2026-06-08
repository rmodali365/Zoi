import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LogStackParamList } from '@/types';
import { COLORS, SPACING, RADIUS, FONT } from '@/constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<LogStackParamList, 'LogHome'>;
};

export function LogScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Add to your taste</Text>
        <Text style={styles.subtitle}>Log something you did, or start a trip to group experiences.</Text>
      </View>

      <View style={styles.options}>
        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('AddExperience')}
          activeOpacity={0.85}
        >
          <Text style={styles.cardEmoji}>📍</Text>
          <Text style={styles.cardTitle}>Log an experience</Text>
          <Text style={styles.cardDesc}>
            A hike, a dinner, a bar, a museum — one thing you did. Rank it against your favorites.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('StartTrip')}
          activeOpacity={0.85}
        >
          <Text style={styles.cardEmoji}>🧳</Text>
          <Text style={styles.cardTitle}>Start a trip</Text>
          <Text style={styles.cardDesc}>
            A container for experiences. Add things you've done, or keep it empty and fill it as you go.
          </Text>
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
  title: { fontSize: 28, ...FONT.bold, color: COLORS.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 16, color: COLORS.textSecondary, marginTop: SPACING.xs, lineHeight: 22 },
  options: { paddingHorizontal: SPACING.xl, gap: SPACING.md },
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
  },
  cardEmoji: { fontSize: 32, marginBottom: SPACING.sm },
  cardTitle: { fontSize: 19, ...FONT.semibold, color: COLORS.text },
  cardDesc: { fontSize: 14, color: COLORS.textMuted, marginTop: SPACING.xs, lineHeight: 20 },
});
