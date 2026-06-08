import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { FeedStackParamList } from '@/types';
import { FeedScreen } from '@/screens/feed/FeedScreen';
import { FindPeopleScreen } from '@/screens/feed/FindPeopleScreen';

const Stack = createNativeStackNavigator<FeedStackParamList>();

export function FeedNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="FeedHome" component={FeedScreen} />
      <Stack.Screen name="FindPeople" component={FindPeopleScreen} options={{ presentation: 'modal' }} />
    </Stack.Navigator>
  );
}
