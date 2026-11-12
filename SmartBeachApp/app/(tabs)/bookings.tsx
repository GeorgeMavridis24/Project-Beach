import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';

import { BookingCard } from '@/components/BookingCard';
import { Banner, Button, Empty, Loading, Screen, Segmented } from '@/components/ui';
import { api } from '@/lib/api';
import type { Booking } from '@/lib/types';

type Scope = 'upcoming' | 'past' | 'cancelled';

export default function MyBookingsScreen() {
  const router = useRouter();
  const [scope, setScope] = useState<Scope>('upcoming');
  const [items, setItems] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await api<Booking[]>('/bookings/me', { query: { scope } }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  // Ανανέωση κάθε φορά που ανοίγει η καρτέλα
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const emptyText = {
    upcoming: 'Δεν έχεις επερχόμενες κρατήσεις.',
    past: 'Δεν υπάρχουν παλαιότερες κρατήσεις.',
    cancelled: 'Δεν έχεις ακυρωμένες κρατήσεις.',
  }[scope];

  return (
    <Screen title="Οι κρατήσεις μου" onRefresh={load}>
      <Segmented
        options={[
          { value: 'upcoming', label: 'Επερχόμενες' },
          { value: 'past', label: 'Παλαιότερες' },
          { value: 'cancelled', label: 'Ακυρωμένες' },
        ]}
        value={scope}
        onChange={setScope}
      />
      {error ? <Banner text={error} /> : null}
      {loading && !items.length ? (
        <Loading />
      ) : items.length === 0 ? (
        <>
          <Empty text={emptyText} icon="ticket-outline" />
          {scope === 'upcoming' ? <Button title="Κάνε κράτηση" icon="calendar-outline" onPress={() => router.navigate('/book')} /> : null}
        </>
      ) : (
        items.map((b) => <BookingCard key={b.booking_id} booking={b} onChanged={load} />)
      )}
    </Screen>
  );
}
