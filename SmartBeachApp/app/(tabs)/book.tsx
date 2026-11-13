import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { openDirections } from '@/components/beachMapShared';
import { BookingQr } from '@/components/BookingQr';
import { EmailBooking } from '@/components/EmailBooking';
import { DateStrip, fitWindow, TimeRangePicker, TimeWindow } from '@/components/pickers';
import { MapCell, MapLegend, SunbedMap } from '@/components/SunbedMap';
import { Badge, Banner, Button, Card, Chip, ChipRow, Empty, Label, Loading, Screen } from '@/components/ui';
import { C } from '@/constants/brand';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { euro, longDate } from '@/lib/dates';
import type { Beach, Booking, Sunbed, SunbedMap as MapData, SunbedType } from '@/lib/types';

const PRICES = [10, 15, 20, 30];

export default function BookScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ beachId?: string; date?: string; start?: string; end?: string; type?: string }>();
  const { user, config } = useAuth();

  const [beaches, setBeaches] = useState<Beach[]>([]);
  const [beachId, setBeachId] = useState<number | null>(null);
  const [date, setDate] = useState('');
  const [win, setWin] = useState<TimeWindow | null>(null);
  const [type, setType] = useState<SunbedType | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [onlyFree, setOnlyFree] = useState(false);

  const [map, setMap] = useState<MapData | null>(null);
  const [selected, setSelected] = useState<Sunbed | null>(null);
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Booking | null>(null);

  // Παράμετροι από την οθόνη "Παραλίες"
  useEffect(() => {
    if (params.beachId) setBeachId(Number(params.beachId));
    if (params.date) setDate(params.date);
    setWin(params.start && params.end ? { start: params.start, end: params.end } : null);
    if (params.type === 'normal' || params.type === 'premium') setType(params.type);
    setDone(null);
  }, [params.beachId, params.date, params.start, params.end, params.type]);

  useEffect(() => {
    if (config && !date) setDate(config.first_bookable_date);
  }, [config, date]);

  useEffect(() => {
    api<Beach[]>('/beaches')
      .then((list) => {
        setBeaches(list);
        setBeachId((cur) => cur ?? list.find((b) => b.total_sunbeds > 0)?.id ?? list[0]?.id ?? null);
      })
      .catch((e) => setError(e.message));
  }, []);

  const beach = useMemo(() => beaches.find((b) => b.id === beachId) ?? null, [beaches, beachId]);

  // Οι ώρες πρέπει να είναι μέσα στο ωράριο του καταστήματος
  useEffect(() => {
    if (!beach) return;
    const fitted = fitWindow(win, beach.open_time, beach.close_time);
    if (fitted !== win) setWin(fitted);
  }, [beach, win]);

  const loadMap = useCallback(async () => {
    if (!beachId || !date || !win) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api<MapData>(`/beaches/${beachId}/sunbeds`, {
        query: { date, start_time: win.start, end_time: win.end },
      });
      setMap(data);
      setSelected((cur) => (cur ? data.sunbeds.find((s) => s.id === cur.id) ?? null : null));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [beachId, date, win]);

  useEffect(() => {
    loadMap();
  }, [loadMap]);

  const matches = useCallback(
    (s: Sunbed) =>
      (!type || s.type === type) && (maxPrice === null || s.price <= maxPrice) && (!onlyFree || s.status === 'available'),
    [type, maxPrice, onlyFree],
  );

  const cells: MapCell[] = useMemo(
    () => (map?.sunbeds ?? []).map((s) => ({ ...s, dim: !matches(s) })),
    [map, matches],
  );
  const freeMatching = (map?.sunbeds ?? []).filter((s) => matches(s) && s.status === 'available').length;

  const book = async () => {
    if (!selected || !map || !win) return;
    setBooking(true);
    setError(null);
    try {
      const b = await api<Booking>('/bookings', {
        method: 'POST',
        body: { sunbed_id: selected.id, res_date: date, start_time: win.start, end_time: win.end },
      });
      setDone(b);
      setSelected(null);
      loadMap();
    } catch (e: any) {
      setError(e.message);
      loadMap();
    } finally {
      setBooking(false);
    }
  };

  if (done) {
    return (
      <Screen title="Η κράτηση έγινε!" subtitle="Θα τη βρεις και στις «Κρατήσεις»">
        <Card style={{ alignItems: 'center' }}>
          <Badge text="Επιβεβαιωμένη" tone="success" icon="checkmark-circle" />
          <Text style={st.doneBeach}>{done.beach_name}</Text>
          <Text style={st.doneLine}>
            {longDate(done.res_date)} · {done.start_time}-{done.end_time}
          </Text>
          <Text style={st.doneLine}>
            Σειρά {done.grid_x}, θέση {done.grid_y} · {done.type === 'premium' ? 'VIP' : 'Κανονική'} · {euro(done.price)}
          </Text>
          {done.checkin_code ? <BookingQr code={done.checkin_code} /> : null}
        </Card>
        {config?.email_enabled ? (
          <Banner text={`Σου στείλαμε email επιβεβαίωσης με τον κωδικό QR στο ${user?.email ?? 'email σου'}.`} tone="info" />
        ) : null}
        <EmailBooking bookingId={done.booking_id} />
        <View style={{ height: 12 }} />
        <Button title="Οι κρατήσεις μου" icon="ticket-outline" onPress={() => router.navigate('/bookings')} />
        <Button
          title="Οδηγίες προς το κατάστημα"
          icon="navigate-outline"
          variant="secondary"
          style={{ marginTop: 10 }}
          onPress={() => openDirections(done.beach_ltd, done.beach_lgd)}
        />
        <Button title="Νέα κράτηση" variant="ghost" style={{ marginTop: 6 }} onPress={() => setDone(null)} />
      </Screen>
    );
  }

  const halfDay = selected && selected.quoted_price < selected.price;

  return (
    <Screen title="Νέα κράτηση" subtitle="Διάλεξε θέση πάνω στον χάρτη της παραλίας" onRefresh={loadMap}>
      <Label>Κατάστημα</Label>
      <ChipRow>
        {beaches.map((b) => (
          <Chip
            key={b.id}
            label={b.name}
            selected={beachId === b.id}
            onPress={() => {
              setBeachId(b.id);
              setSelected(null);
            }}
          />
        ))}
      </ChipRow>

      <Label>Ημερομηνία</Label>
      <DateStrip
        config={config}
        value={date}
        onChange={(d) => {
          setDate(d);
          setSelected(null);
        }}
      />
      {beach && win ? (
        <TimeRangePicker
          open={beach.open_time}
          close={beach.close_time}
          value={win}
          onChange={setWin}
          minMinutes={config?.min_booking_minutes ?? 60}
        />
      ) : null}

      <Label>Φίλτρα</Label>
      <ChipRow>
        <Chip label="Όλες" selected={!type} onPress={() => setType(null)} />
        <Chip label="Κανονική" selected={type === 'normal'} onPress={() => setType('normal')} />
        <Chip label="VIP ★" selected={type === 'premium'} onPress={() => setType('premium')} />
        {PRICES.map((p) => (
          <Chip key={p} label={`≤ ${p} €`} selected={maxPrice === p} onPress={() => setMaxPrice(maxPrice === p ? null : p)} />
        ))}
      </ChipRow>
      <View style={st.switchRow}>
        <Text style={st.switchText}>Μόνο ελεύθερες</Text>
        <Switch value={onlyFree} onValueChange={setOnlyFree} trackColor={{ true: C.primary, false: C.border }} />
      </View>

      {error ? <Banner text={error} /> : null}
      {map && !map.bookable && map.reason ? <Banner text={map.reason} tone="warning" /> : null}

      {loading && !map ? (
        <Loading />
      ) : !map || map.summary.total === 0 ? (
        <Empty text="Αυτό το κατάστημα δεν έχει ακόμα ξαπλώστρες." icon="grid-outline" />
      ) : (
        <>
          <Text style={st.summary}>
            {freeMatching} ελεύθερες που ταιριάζουν · {map.summary.booked} κλεισμένες · {longDate(date)}
          </Text>
          <MapLegend />
          <SunbedMap
            rows={map.rows}
            cols={map.cols}
            cells={cells}
            selectedId={selected?.id}
            onSelect={(c) => setSelected(map.sunbeds.find((s) => s.id === c.id) ?? null)}
          />
        </>
      )}

      {selected && win ? (
        <Card style={st.panel}>
          <View style={st.panelHead}>
            <Text style={st.panelTitle}>
              Σειρά {selected.grid_x} · Θέση {selected.grid_y}
            </Text>
            <Badge text={selected.type === 'premium' ? 'VIP ★' : 'Κανονική'} tone={selected.type === 'premium' ? 'warning' : 'primary'} />
          </View>
          <Text style={st.price}>
            {euro(selected.quoted_price)}
            <Text style={st.priceNote}>
              {halfDay ? `  μισή μέρα (ολόκληρη: ${euro(selected.price)})` : '  ολόκληρη μέρα'}
            </Text>
          </Text>
          {selected.booked_slots.length ? (
            <Text style={st.slots}>
              Κλεισμένη εκείνη τη μέρα: {selected.booked_slots.map((s) => `${s.start}-${s.end}`).join(', ')}
            </Text>
          ) : (
            <Text style={st.slots}>Ελεύθερη όλη τη μέρα</Text>
          )}
          {selected.status === 'available' ? (
            <Button
              title={`Κράτηση ${win.start}-${win.end}`}
              icon="checkmark-circle-outline"
              onPress={book}
              loading={booking}
              disabled={!map?.bookable}
              style={{ marginTop: 12 }}
            />
          ) : (
            <Banner
              text={
                selected.status === 'out_of_order'
                  ? 'Η ξαπλώστρα είναι εκτός λειτουργίας.'
                  : 'Κλεισμένη για τις ώρες που διάλεξες. Δοκίμασε άλλο διάστημα.'
              }
              tone="warning"
            />
          )}
        </Card>
      ) : map && map.summary.total > 0 ? (
        <Text style={st.hint}>Πάτησε μια ξαπλώστρα για λεπτομέρειες και κράτηση.</Text>
      ) : null}

      {beach ? (
        <Button
          title="Οδηγίες προς το κατάστημα"
          icon="navigate-outline"
          variant="ghost"
          small
          style={{ marginTop: 12 }}
          onPress={() => openDirections(beach.ltd, beach.lgd)}
        />
      ) : null}
    </Screen>
  );
}

const st = StyleSheet.create({
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 6 },
  switchText: { fontSize: 15, color: C.text },
  summary: { fontSize: 13, color: C.textMuted, marginTop: 8, marginBottom: 8 },
  hint: { fontSize: 14, color: C.textMuted, textAlign: 'center', marginTop: 8 },
  panel: { borderColor: C.primary, borderWidth: 1.5, marginTop: 8 },
  panelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  panelTitle: { fontSize: 18, fontWeight: '700', color: C.text },
  price: { fontSize: 24, fontWeight: '700', color: C.text, marginTop: 8 },
  priceNote: { fontSize: 13, fontWeight: '400', color: C.textMuted },
  slots: { fontSize: 13, color: C.textMuted, marginTop: 4 },
  doneBeach: { fontSize: 20, fontWeight: '700', color: C.text, marginTop: 10 },
  doneLine: { fontSize: 15, color: C.textMuted, marginTop: 4, textAlign: 'center' },
});
