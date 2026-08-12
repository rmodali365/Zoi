import React, { useEffect, useState } from 'react';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import { RootStackParamList } from '@/types';
import { AuthContext } from '@/contexts/AuthContext';
import { SplashScreen } from '@/components/SplashScreen';
import { AuthNavigator } from './AuthNavigator';
import { AppNavigator } from './AppNavigator';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Keep the splash up long enough for its fade-in to finish, so a fast (cached)
// session check doesn't flash the wordmark for a frame and vanish.
const SPLASH_MIN_MS = 700;

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
  const [splashDone, setSplashDone] = useState(false);

  async function checkProfile(userId: string) {
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    setProfileComplete(!!data);
  }

  useEffect(() => {
    const splashTimer = setTimeout(() => setSplashDone(true), SPLASH_MIN_MS);

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

    return () => {
      clearTimeout(splashTimer);
      subscription.unsubscribe();
    };
  }, []);

  if (loading || !splashDone) return <SplashScreen />;

  return (
    <AuthContext.Provider value={{ setProfileComplete }}>
      <NavigationContainer linking={linking}>
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
