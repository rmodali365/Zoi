import React, { useEffect, useState } from 'react';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import { RootStackParamList } from '@/types';
import { AuthContext } from '@/contexts/AuthContext';
import { AuthNavigator } from './AuthNavigator';
import { AppNavigator } from './AppNavigator';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Deep links: zoi://user/<id> (exp://… in dev) opens that user's profile inside the
// Feed tab. Only resolves when authenticated (the App stack is mounted).
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/'), 'zoi://'],
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

  if (loading) return null;

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
