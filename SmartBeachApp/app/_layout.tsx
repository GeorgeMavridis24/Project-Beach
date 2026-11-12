import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { C } from '@/constants/brand';
import { AuthProvider, useAuth } from '@/lib/auth';
import { isStaffLike } from '@/lib/roles';

function RootNavigator() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }
  const isStaff = isStaffLike(user);
  // Protected routes: χωρίς σύνδεση φαίνεται μόνο το login, και η "Διαχείριση"
  // υπάρχει μόνο για προσωπικό/διαχειριστές.
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(tabs)" />
        <Stack.Protected guard={isStaff}>
          <Stack.Screen name="admin" />
        </Stack.Protected>
      </Stack.Protected>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootNavigator />
        <StatusBar style="dark" />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
