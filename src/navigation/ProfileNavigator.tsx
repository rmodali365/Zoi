import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ProfileStackParamList } from '@/types';
import { ProfileScreen } from '@/screens/profile/ProfileScreen';
import { TripDetailScreen } from '@/screens/profile/TripDetailScreen';
import { UserProfileScreen } from '@/screens/profile/UserProfileScreen';
import { EditProfileScreen } from '@/screens/profile/EditProfileScreen';
import { FollowListScreen } from '@/screens/profile/FollowListScreen';

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export function ProfileNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileHome" component={ProfileScreen} />
      <Stack.Screen name="TripDetail" component={TripDetailScreen} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
      <Stack.Screen name="FollowList" component={FollowListScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ presentation: 'modal' }} />
    </Stack.Navigator>
  );
}
