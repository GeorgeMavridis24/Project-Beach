import { Stack } from 'expo-router';
import React from 'react';

import { C } from '@/constants/brand';

export default function PartnerLayout() {
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
      <Stack.Screen name="apply" options={{ title: 'Γίνε συνεργάτης' }} />
      <Stack.Screen name="status" options={{ title: 'Η αίτησή μου' }} />
    </Stack>
  );
}
