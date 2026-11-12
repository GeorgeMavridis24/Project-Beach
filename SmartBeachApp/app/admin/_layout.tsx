import { Stack } from 'expo-router';
import React from 'react';

import { C } from '@/constants/brand';
import { useAuth } from '@/lib/auth';

export default function AdminLayout() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: C.primary,
        headerTitleStyle: { color: C.text, fontWeight: '700' },
        headerStyle: { backgroundColor: C.bg },
        headerShadowVisible: false,
        headerBackTitle: 'Πίσω',
        contentStyle: { backgroundColor: C.bg },
      }}
    >
      <Stack.Screen name="checkin" options={{ title: 'Check-in εισόδου' }} />
      <Stack.Protected guard={isAdmin}>
        <Stack.Screen name="dashboard" options={{ title: 'Στατιστικά' }} />
        <Stack.Screen name="bookings" options={{ title: 'Κρατήσεις' }} />
        <Stack.Screen name="sunbeds" options={{ title: 'Ξαπλώστρες' }} />
        <Stack.Screen name="beaches" options={{ title: 'Παραλίες' }} />
        <Stack.Screen name="users" options={{ title: 'Χρήστες' }} />
      </Stack.Protected>
    </Stack>
  );
}
