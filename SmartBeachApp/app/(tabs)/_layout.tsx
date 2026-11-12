import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { C } from '@/constants/brand';
import { useAuth } from '@/lib/auth';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function icon(name: IconName) {
  function TabIcon({ color, size }: { color: string; size: number }) {
    return <Ionicons name={name} size={size} color={color} />;
  }
  return TabIcon;
}

export default function TabLayout() {
  const { user } = useAuth();
  const isStaff = user?.role === 'admin' || user?.role === 'staff';
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.textFaint,
        tabBarButton: HapticTab,
        tabBarStyle: { backgroundColor: C.card, borderTopColor: C.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Παραλίες', tabBarIcon: icon('umbrella-outline') }} />
      <Tabs.Screen name="book" options={{ title: 'Κράτηση', tabBarIcon: icon('calendar-outline') }} />
      <Tabs.Screen name="bookings" options={{ title: 'Κρατήσεις', tabBarIcon: icon('ticket-outline') }} />
      <Tabs.Screen name="assistant" options={{ title: 'Βοηθός', tabBarIcon: icon('chatbubbles-outline') }} />
      <Tabs.Screen
        name="manage"
        options={{ title: 'Διαχείριση', tabBarIcon: icon('briefcase-outline'), href: isStaff ? undefined : null }}
      />
    </Tabs>
  );
}
