import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthStackParamList } from '@/types';
import { WelcomeScreen } from '@/screens/auth/WelcomeScreen';
import { PhoneAuthScreen } from '@/screens/auth/PhoneAuthScreen';
import { VerifyOtpScreen } from '@/screens/auth/VerifyOtpScreen';
import { SetupProfileScreen } from '@/screens/auth/SetupProfileScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="PhoneAuth" component={PhoneAuthScreen} />
      <Stack.Screen name="VerifyOtp" component={VerifyOtpScreen} />
      <Stack.Screen name="SetupProfile" component={SetupProfileScreen} />
    </Stack.Navigator>
  );
}
