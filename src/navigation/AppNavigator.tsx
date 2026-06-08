import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { AppTabParamList } from '@/types';
import { FeedScreen } from '@/screens/feed/FeedScreen';
import { MyListScreen } from '@/screens/list/MyListScreen';
import { LogNavigator } from '@/navigation/LogNavigator';
import { ProfileScreen } from '@/screens/profile/ProfileScreen';
import { COLORS } from '@/constants/theme';

const Tab = createBottomTabNavigator<AppTabParamList>();

// Icon name per tab — outline when inactive, filled when active.
const ICONS: Record<keyof AppTabParamList, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  Feed: { active: 'people', inactive: 'people-outline' },
  List: { active: 'list', inactive: 'list-outline' },
  Log: { active: 'add-circle', inactive: 'add-circle-outline' },
  Profile: { active: 'person-circle', inactive: 'person-circle-outline' },
};

export function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
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
        tabBarIcon: ({ focused, color, size }) => {
          const icon = ICONS[route.name];
          return (
            <Ionicons
              name={focused ? icon.active : icon.inactive}
              size={size}
              color={color}
            />
          );
        },
      })}
    >
      <Tab.Screen name="Feed" component={FeedScreen} options={{ tabBarLabel: 'Feed' }} />
      <Tab.Screen name="List" component={MyListScreen} options={{ tabBarLabel: 'My List' }} />
      <Tab.Screen name="Log" component={LogNavigator} options={{ tabBarLabel: 'Log' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  );
}
