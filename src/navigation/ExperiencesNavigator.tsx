import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ExperiencesStackParamList } from '@/types';
import { MyListScreen } from '@/screens/list/MyListScreen';
import { TripDetailScreen } from '@/screens/profile/TripDetailScreen';

const Stack = createNativeStackNavigator<ExperiencesStackParamList>();

// The Experiences tab is a stack so a trip card can push the itinerary screen.
// TripDetail is shared with the Profile stack (same screen, both register it).
export function ExperiencesNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ExperiencesHome" component={MyListScreen} />
      <Stack.Screen name="TripDetail" component={TripDetailScreen} />
    </Stack.Navigator>
  );
}
