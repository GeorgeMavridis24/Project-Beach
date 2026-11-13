import { Stack } from 'expo-router';
import React from 'react';

import { C } from '@/constants/brand';
import { useAuth } from '@/lib/auth';
import { isManager } from '@/lib/roles';

export default function AdminLayout() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const manager = isManager(user);
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
      <Stack.Protected guard={manager}>
        <Stack.Screen name="dashboard" options={{ title: 'Στατιστικά' }} />
        <Stack.Screen name="bookings" options={{ title: 'Κρατήσεις' }} />
        <Stack.Screen name="sunbeds" options={{ title: 'Ξαπλώστρες' }} />
        <Stack.Screen name="beaches" options={{ title: isAdmin ? 'Καταστήματα' : 'Το κατάστημά μου' }} />
      </Stack.Protected>
      <Stack.Protected guard={isAdmin}>
        <Stack.Screen name="users" options={{ title: 'Χρήστες' }} />
        <Stack.Screen name="partners" options={{ title: 'Αιτήσεις συνεργατών' }} />
        <Stack.Screen name="request" options={{ title: 'Αίτηση' }} />
      </Stack.Protected>
    </Stack>
  );
}
