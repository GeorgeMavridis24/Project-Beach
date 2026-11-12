import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { BookingCard } from '@/components/BookingCard';
import { DateStrip } from '@/components/pickers';
import { Banner, Chip, ChipRow, Empty, Label, Loading, Screen } from '@/components/ui';
import { C } from '@/constants/brand';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { managedBeaches } from '@/lib/roles';
import type { Beach, Booking } from '@/lib/types';

type Period = 'all' | 'upcoming' | 'day';
type Status = 'all' | 'confirmed' | 'cancelled';

export default function AdminBookingsScreen() {
  const { user, config } = useAuth();
  const [beaches, setBeaches] = useState<Beach[]>([]);
  const [beachId, setBeachId] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>('confirmed');
  const [period, setPeriod] = useState<Period>('upcoming');
  const [day, setDay] = useState('');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [items, setItems] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Beach[]>('/beaches').then((list) => setBeaches(managedBeaches(user, list))).catch(() => {});
  }, [user]);
  useEffect(() => {
    if (config && !day) setDay(config.first_bookable_date);
  }, [config, day]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const today = config?.today;
    try {
      setItems(
        await api<Booking[]>('/admin/bookings', {
          query: {
            beach_id: beachId,
            status: status === 'all' ? undefined : status,
            q: debouncedQ,
            date_from: period === 'upcoming' ? today : period === 'day' ? day : undefined,
            date_to: period === 'day' ? day : undefined,
            limit: 200,
          },
        }),
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [beachId, status, debouncedQ, period, day, config]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Screen topInset={false} onRefresh={load}>
      <View style={st.search}>
        <Ionicons name="search" size={18} color={C.textFaint} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Όνομα ή email πελάτη"
          placeholderTextColor={C.textFaint}
          style={st.searchInput}
          autoCapitalize="none"
        />
      </View>
      <Label>Παραλία</Label>
      <ChipRow>
        <Chip label="Όλες" selected={beachId === null} onPress={() => setBeachId(null)} />
        {beaches.map((b) => (
          <Chip key={b.id} label={b.name} selected={beachId === b.id} onPress={() => setBeachId(b.id)} />
        ))}
      </ChipRow>
      <Label>Κατάσταση</Label>
      <ChipRow>
        <Chip label="Ενεργές" selected={status === 'confirmed'} onPress={() => setStatus('confirmed')} />
        <Chip label="Ακυρωμένες" selected={status === 'cancelled'} onPress={() => setStatus('cancelled')} />
        <Chip label="Όλες" selected={status === 'all'} onPress={() => setStatus('all')} />
      </ChipRow>
      <Label>Περίοδος</Label>
      <ChipRow>
        <Chip label="Από σήμερα" selected={period === 'upcoming'} onPress={() => setPeriod('upcoming')} />
        <Chip label="Συγκεκριμένη μέρα" selected={period === 'day'} onPress={() => setPeriod('day')} />
        <Chip label="Όλες (τελευταίες 200)" selected={period === 'all'} onPress={() => setPeriod('all')} />
      </ChipRow>
      {period === 'day' ? <DateStrip config={config} value={day} onChange={setDay} /> : null}

      {error ? <Banner text={error} /> : null}
      <Text style={st.count}>{items.length} κρατήσεις</Text>
      {loading && !items.length ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty text="Δεν βρέθηκαν κρατήσεις με αυτά τα φίλτρα." icon="search-outline" />
      ) : (
        items.map((b) => <BookingCard key={b.booking_id} booking={b} admin onChanged={load} />)
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: C.text },
  count: { fontSize: 13, color: C.textMuted, marginVertical: 8 },
});
