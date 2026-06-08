import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LogStackParamList } from '@/types';
import { LogScreen } from '@/screens/log/LogScreen';
import { AddExperienceScreen } from '@/screens/log/AddExperienceScreen';
import { RankExperienceScreen } from '@/screens/log/RankExperienceScreen';
import { StartTripScreen } from '@/screens/log/StartTripScreen';

const Stack = createNativeStackNavigator<LogStackParamList>();

export function LogNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="LogHome" component={LogScreen} />
      <Stack.Screen name="AddExperience" component={AddExperienceScreen} />
      <Stack.Screen name="RankExperience" component={RankExperienceScreen} />
      <Stack.Screen name="StartTrip" component={StartTripScreen} />
    </Stack.Navigator>
  );
}
