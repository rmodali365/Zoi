import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { AppTabParamList } from '@/types';
import { FeedScreen } from '@/screens/feed/FeedScreen';
import { LogNavigator } from '@/navigation/LogNavigator';
import { ProfileScreen } from '@/screens/profile/ProfileScreen';
import { SearchScreen } from '@/screens/search/SearchScreen';
import { COLORS } from '@/constants/theme';

const Tab = createBottomTabNavigator<AppTabParamList>();

export function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.background,
          borderTopColor: COLORS.border,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarActiveTintColor: COLORS.text,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontFamily: 'System' },
      }}
    >
      <Tab.Screen
        name="Feed"
        component={FeedScreen}
        options={{ tabBarLabel: 'Friends' }}
      />
      <Tab.Screen
        name="Log"
        component={LogNavigator}
        options={{ tabBarLabel: 'Log' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarLabel: 'Profile' }}
      />
      <Tab.Screen
        name="Search"
        component={SearchScreen}
        options={{ tabBarLabel: 'Search' }}
      />
    </Tab.Navigator>
  );
}
