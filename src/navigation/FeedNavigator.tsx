import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { FeedStackParamList } from '@/types';
import { FeedScreen } from '@/screens/feed/FeedScreen';
import { FindPeopleScreen } from '@/screens/feed/FindPeopleScreen';
import { UserProfileScreen } from '@/screens/profile/UserProfileScreen';
import { FollowListScreen } from '@/screens/profile/FollowListScreen';

const Stack = createNativeStackNavigator<FeedStackParamList>();

export function FeedNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="FeedHome" component={FeedScreen} />
      <Stack.Screen name="FindPeople" component={FindPeopleScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
      <Stack.Screen name="FollowList" component={FollowListScreen} />
    </Stack.Navigator>
  );
}
