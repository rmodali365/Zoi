import React, { useEffect, useState } from 'react';
import {
  NavigationContainer, LinkingOptions, createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import { RootStackParamList } from '@/types';
import { AuthContext } from '@/contexts/AuthContext';
import { registerForPush, onPushTapped, PushTarget } from '@/lib/push';
import { qk } from '@/lib/queryKeys';
import { AuthNavigator } from './AuthNavigator';
import { AppNavigator } from './AppNavigator';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Needed to navigate from outside a screen — a push can be tapped while the app
// is backgrounded or not running at all.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// Route a tapped push to the screen it refers to. Every target lives in the Feed
// stack, which is where the existing deep links land too.
function openPushTarget(target: PushTarget) {
  if (!navigationRef.isReady() || !target.screen) return;

  const params =
    target.screen === 'TripDetail' && target.tripId ? { tripId: target.tripId }
    : target.screen === 'ExperienceDetail' && target.experienceId ? { experienceId: target.experienceId }
    : target.screen === 'UserProfile' && target.userId ? { userId: target.userId }
    : null;
  if (!params) return;

  // Opening it means it's been seen — clear the bell before the screen loads.
  queryClient.invalidateQueries({ queryKey: qk.notificationsUnread });

  // Three levels of nesting (root -> tab -> stack) defeats the generic typing;
  // same cast the cross-tab jumps in TripDetail/Activity use.
  (navigationRef.navigate as unknown as (name: string, params: object) => void)('App', {
    screen: 'Feed',
    params: { screen: target.screen, params },
  });
}

// Deep links: zoi://user/<id> (exp://… in dev) and the Universal Link
// https://zoisocial.com/user/<id> both open that user's profile inside the Feed tab.
// Only resolves when authenticated (the App stack is mounted).
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/'), 'zoi://', 'https://zoisocial.com'],
  config: {
    screens: {
      App: {
        screens: {
          Feed: {
            screens: {
              UserProfile: 'user/:userId',
            },
          },
        },
      },
    },
  },
};

export function RootNavigator() {
  const [session, setSession] = useState<Session | null>(null);
  const [profileComplete, setProfileComplete] = useState(false);
  const [loading, setLoading] = useState(true);

  async function checkProfile(userId: string) {
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    setProfileComplete(!!data);
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session) {
        await checkProfile(session.user.id);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session) {
        await checkProfile(session.user.id);
      } else {
        setProfileComplete(false);
        // Drop all cached data so the next account never sees the previous one's.
        queryClient.clear();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Register this device once the user is fully signed in — a token is useless
  // before there's an account to attach it to. Declining the permission is a
  // valid outcome, so failures here stay silent.
  const signedIn = !!session && profileComplete;
  useEffect(() => {
    if (!signedIn) return;
    registerForPush().catch(() => {});
    return onPushTapped(openPushTarget);
  }, [signedIn]);

  if (loading) return null;

  return (
    <AuthContext.Provider value={{ setProfileComplete }}>
      <NavigationContainer ref={navigationRef} linking={linking}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {session && profileComplete ? (
            <Stack.Screen name="App" component={AppNavigator} />
          ) : (
            <Stack.Screen name="Auth" component={AuthNavigator} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </AuthContext.Provider>
  );
}
