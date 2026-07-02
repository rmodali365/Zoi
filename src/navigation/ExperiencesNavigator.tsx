import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ExperiencesStackParamList } from '@/types';
import { MyListScreen } from '@/screens/list/MyListScreen';
import { TripDetailScreen } from '@/screens/profile/TripDetailScreen';
import { ExperienceDetailScreen } from '@/screens/experience/ExperienceDetailScreen';
import { EditExperienceScreen } from '@/screens/log/AddExperienceScreen';
import { UserProfileScreen } from '@/screens/profile/UserProfileScreen';
import { FollowListScreen } from '@/screens/profile/FollowListScreen';

const Stack = createNativeStackNavigator<ExperiencesStackParamList>();

// The Experiences tab is a stack so a trip card can push the itinerary screen.
// TripDetail/ExperienceDetail/UserProfile/FollowList are shared screens (registered
// in several stacks) — here they serve trips, experience detail and Wishlist authors.
export function ExperiencesNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ExperiencesHome" component={MyListScreen} />
      <Stack.Screen name="TripDetail" component={TripDetailScreen} />
      <Stack.Screen name="ExperienceDetail" component={ExperienceDetailScreen} />
      <Stack.Screen name="EditExperience" component={EditExperienceScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
      <Stack.Screen name="FollowList" component={FollowListScreen} />
    </Stack.Navigator>
  );
}
