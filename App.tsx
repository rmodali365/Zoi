import 'react-native-gesture-handler';
import 'react-native-url-polyfill/auto';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { BannerProvider } from '@/contexts/BannerContext';
import { RootNavigator } from '@/navigation';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <BannerProvider>
          <RootNavigator />
        </BannerProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
