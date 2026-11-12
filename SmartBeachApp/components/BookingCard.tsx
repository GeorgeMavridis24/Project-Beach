import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { C } from '@/constants/brand';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { euro, longDate } from '@/lib/dates';
import { confirm, notify } from '@/lib/dialogs';
import type { Booking } from '@/lib/types';

import { BookingQr } from './BookingQr';
import { openDirections } from './beachMapShared';
import { TimeRangePicker, TimeWindow } from './pickers';
import { Badge, Banner, Button, Card } from './ui';

/**
 * Κάρτα κράτησης. `admin` = προβολή διαχειριστή (δείχνει πελάτη, χρησιμοποιεί
 * τα /admin endpoints, χωρίς QR).
 */
export function BookingCard({ booking, admin = false, onChanged }: { booking: Booking; admin?: boolean; onChanged: () => void }) {
  const { config } = useAuth();
  const [showQr, setShowQr] = useState(false);
  const [editing, setEditing] = useState(false);
  const [win, setWin] = useState<TimeWindow>({ start: booking.start_time, end: booking.end_time });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = admin ? '/admin/bookings' : '/bookings';
  const canModify = admin ? booking.status === 'confirmed' && !booking.checked_in : booking.can_modify;
  const canCancel = admin ? booking.status === 'confirmed' && !booking.checked_in : booking.can_cancel;

  const status =
    booking.status === 'cancelled'
      ? { text: 'Ακυρώθηκε', tone: 'danger' as const, icon: 'close-circle' as const }
      : booking.checked_in
        ? { text: 'Check-in ✓', tone: 'success' as const, icon: 'enter-outline' as const }
        : booking.is_past
          ? { text: 'Ολοκληρώθηκε', tone: 'neutral' as const, icon: 'time-outline' as const }
          : { text: 'Ενεργή', tone: 'primary' as const, icon: 'checkmark-circle' as const };

  const cancel = async () => {
    const ok = await confirm('Ακύρωση κράτησης', `${booking.beach_name}, ${longDate(booking.res_date)} ${booking.start_time}-${booking.end_time}. Σίγουρα;`, 'Ακύρωση', true);
    if (!ok) return;
    setBusy(true);
    try {
      await api(`${base}/${booking.booking_id}/cancel`, { method: 'POST' });
      onChanged();
    } catch (e: any) {
      notify('Σφάλμα', e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveTime = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`${base}/${booking.booking_id}/time`, { method: 'PUT', body: { start_time: win.start, end_time: win.end } });
      setEditing(false);
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <View style={b.head}>
        <Text style={b.beach}>{booking.beach_name}</Text>
        <Badge text={status.text} tone={status.tone} icon={status.icon} />
      </View>
      {admin ? (
        <Row icon="person-outline" text={`${booking.username} · ${booking.email}`} />
      ) : null}
      <Row icon="calendar-outline" text={longDate(booking.res_date)} />
      <Row icon="time-outline" text={`${booking.start_time} - ${booking.end_time}`} />
      <Row
        icon={booking.type === 'premium' ? 'star' : 'grid-outline'}
        text={`Σειρά ${booking.grid_x}, θέση ${booking.grid_y} · ${booking.type === 'premium' ? 'VIP' : 'Κανονική'}`}
      />
      <Row icon="cash-outline" text={euro(booking.price)} strong />

      {showQr && booking.checkin_code ? <BookingQr code={booking.checkin_code} /> : null}

      {editing ? (
        <View style={{ marginTop: 8 }}>
          {error ? <Banner text={error} /> : null}
          <TimeRangePicker
            open={booking.open_time}
            close={booking.close_time}
            value={win}
            onChange={setWin}
            minMinutes={config?.min_booking_minutes ?? 60}
          />
          <View style={b.actions}>
            <Button title="Αποθήκευση" small onPress={saveTime} loading={busy} style={{ flex: 1 }} />
            <Button title="Άκυρο" small variant="ghost" onPress={() => setEditing(false)} style={{ flex: 1 }} />
          </View>
        </View>
      ) : (
        <View style={b.actions}>
          {!admin && booking.checkin_code && booking.status === 'confirmed' && !booking.is_past ? (
            <Button title={showQr ? 'Απόκρυψη QR' : 'QR εισόδου'} icon="qr-code-outline" small onPress={() => setShowQr(!showQr)} />
          ) : null}
          {canModify ? <Button title="Αλλαγή ώρας" icon="create-outline" small variant="secondary" onPress={() => setEditing(true)} /> : null}
          {canCancel ? <Button title="Ακύρωση" icon="close-outline" small variant="danger" onPress={cancel} loading={busy} /> : null}
          {!admin && booking.status === 'confirmed' && !booking.is_past ? (
            <Button title="Οδηγίες" icon="navigate-outline" small variant="ghost" onPress={() => openDirections(booking.beach_ltd, booking.beach_lgd)} />
          ) : null}
        </View>
      )}
    </Card>
  );
}

function Row({ icon, text, strong }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string; strong?: boolean }) {
  return (
    <View style={b.row}>
      <Ionicons name={icon} size={16} color={C.textMuted} />
      <Text style={[b.rowText, strong && { fontWeight: '700', color: C.text }]}>{text}</Text>
    </View>
  );
}

const b = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  beach: { fontSize: 17, fontWeight: '700', color: C.text, flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  rowText: { fontSize: 15, color: C.textMuted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
});
