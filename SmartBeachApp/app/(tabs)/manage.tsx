import { Ionicons } from '@expo/vector-icons';
import { Href, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/ui';
import { C } from '@/constants/brand';
import { useAuth } from '@/lib/auth';

type Item = { href: Href; title: string; text: string; icon: React.ComponentProps<typeof Ionicons>['name']; roles: string[] };

const ITEMS: Item[] = [
  { href: '/admin/checkin', title: 'Check-in εισόδου', text: 'Σάρωση QR και σημερινές κρατήσεις', icon: 'qr-code-outline', roles: ['staff', 'admin'] },
  { href: '/admin/dashboard', title: 'Στατιστικά', text: 'Έσοδα, πληρότητα, δημοφιλείς θέσεις', icon: 'stats-chart-outline', roles: ['admin'] },
  { href: '/admin/bookings', title: 'Κρατήσεις', text: 'Αναζήτηση, ακύρωση, αλλαγή ώρας', icon: 'list-outline', roles: ['admin'] },
  { href: '/admin/sunbeds', title: 'Ξαπλώστρες', text: 'Πλέγμα, τιμές, εκτός λειτουργίας', icon: 'grid-outline', roles: ['admin'] },
  { href: '/admin/beaches', title: 'Παραλίες', text: 'Προσθήκη και επεξεργασία', icon: 'umbrella-outline', roles: ['admin'] },
  { href: '/admin/users', title: 'Χρήστες', text: 'Ρόλοι πελατών, προσωπικού, διαχειριστών', icon: 'people-outline', roles: ['admin'] },
];

export default function ManageScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const items = ITEMS.filter((i) => user && i.roles.includes(user.role));
  return (
    <Screen title="Διαχείριση" subtitle={user?.role === 'admin' ? 'Διαχειριστής' : 'Προσωπικό'}>
      {items.map((i) => (
        <Pressable key={i.title} onPress={() => router.push(i.href)} accessibilityRole="button" style={({ pressed }) => [st.item, pressed && { opacity: 0.85 }]}>
          <View style={st.icon}>
            <Ionicons name={i.icon} size={22} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.title}>{i.title}</Text>
            <Text style={st.text}>{i.text}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={C.textFaint} />
        </Pressable>
      ))}
    </Screen>
  );
}

const st = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: C.text },
  text: { fontSize: 13, color: C.textMuted, marginTop: 2 },
});
