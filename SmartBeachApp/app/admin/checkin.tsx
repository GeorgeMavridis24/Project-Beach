import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Badge, Banner, Button, Card, Chip, ChipRow, Empty, Field, Screen, SectionTitle } from '@/components/ui';
import { C } from '@/constants/brand';
import { api } from '@/lib/api';
import { longDate } from '@/lib/dates';
import type { Beach, Booking } from '@/lib/types';

export default function CheckinScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; booking?: Booking } | null>(null);
  const [beaches, setBeaches] = useState<Beach[]>([]);
  const [beachId, setBeachId] = useState<number | null>(null);
  const [today, setToday] = useState<Booking[]>([]);

  const loadToday = useCallback(async () => {
    try {
      setToday(await api<Booking[]>('/staff/bookings', { query: { beach_id: beachId } }));
    } catch {
      setToday([]);
    }
  }, [beachId]);

  useFocusEffect(
    useCallback(() => {
      api<Beach[]>('/beaches').then(setBeaches).catch(() => {});
      loadToday();
    }, [loadToday]),
  );

  const checkIn = async (value: string) => {
    const clean = value.replace(/\s/g, '');
    if (!clean || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const b = await api<Booking>('/staff/checkin', { method: 'POST', body: { code: clean } });
      setResult({ ok: true, text: 'Check-in επιτυχές!', booking: b });
      setCode('');
      loadToday();
    } catch (e: any) {
      setResult({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const startScan = async () => {
    setResult(null);
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        setResult({ ok: false, text: 'Χωρίς άδεια κάμερας μπορείς να γράψεις τον κωδικό με το χέρι.' });
        return;
      }
    }
    setScanning(true);
  };

  const done = today.filter((b) => b.checked_in).length;

  return (
    <Screen topInset={false} onRefresh={loadToday}>
      {scanning ? (
        <View style={st.cameraWrap}>
          <CameraView
            style={st.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => {
              setScanning(false);
              checkIn(data);
            }}
          />
          <View style={st.frame} pointerEvents="none" />
        </View>
      ) : null}
      <Button
        title={scanning ? 'Ακύρωση σάρωσης' : 'Σάρωση QR'}
        icon={scanning ? 'close-outline' : 'qr-code-outline'}
        variant={scanning ? 'secondary' : 'primary'}
        onPress={() => (scanning ? setScanning(false) : startScan())}
      />

      <Card style={{ marginTop: 12 }}>
        <Field
          label="Ή γράψε τον κωδικό"
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          placeholder="π.χ. A1B2 C3D4 E5F6"
          onSubmitEditing={() => checkIn(code)}
        />
        <Button title="Check-in" icon="enter-outline" variant="secondary" onPress={() => checkIn(code)} loading={busy} disabled={!code.trim()} />
      </Card>

      {result ? (
        <>
          <Banner text={result.text} tone={result.ok ? 'success' : 'danger'} />
          {result.booking ? (
            <Card>
              <Text style={st.big}>{result.booking.username}</Text>
              <Text style={st.line}>{result.booking.beach_name}</Text>
              <Text style={st.line}>
                Σειρά {result.booking.grid_x}, θέση {result.booking.grid_y} · {result.booking.type === 'premium' ? 'VIP' : 'Κανονική'}
              </Text>
              <Text style={st.line}>
                {longDate(result.booking.res_date)} · {result.booking.start_time}-{result.booking.end_time}
              </Text>
            </Card>
          ) : null}
        </>
      ) : null}

      <SectionTitle right={<Badge text={`${done}/${today.length} ήρθαν`} tone="primary" />}>Σημερινές κρατήσεις</SectionTitle>
      <ChipRow>
        <Chip label="Όλες" selected={beachId === null} onPress={() => setBeachId(null)} />
        {beaches.map((b) => (
          <Chip key={b.id} label={b.name} selected={beachId === b.id} onPress={() => setBeachId(b.id)} />
        ))}
      </ChipRow>
      {today.length === 0 ? (
        <Empty text="Δεν υπάρχουν κρατήσεις για σήμερα." icon="calendar-clear-outline" />
      ) : (
        today.map((b) => (
          <View key={b.booking_id} style={st.item}>
            <View style={{ flex: 1 }}>
              <Text style={st.itemTitle}>
                Σ{b.grid_x}-{b.grid_y} · {b.username}
              </Text>
              <Text style={st.itemSub}>
                {b.beach_name} · {b.start_time}-{b.end_time}
              </Text>
            </View>
            <Badge text={b.checked_in ? 'Ήρθε' : 'Αναμένεται'} tone={b.checked_in ? 'success' : 'neutral'} icon={b.checked_in ? 'checkmark' : 'time-outline'} />
          </View>
        ))
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  cameraWrap: { height: 280, borderRadius: 16, overflow: 'hidden', marginBottom: 12, backgroundColor: '#000' },
  camera: { flex: 1 },
  frame: {
    position: 'absolute',
    top: 50,
    left: '20%',
    right: '20%',
    bottom: 50,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 16,
  },
  big: { fontSize: 20, fontWeight: '700', color: C.text },
  line: { fontSize: 15, color: C.textMuted, marginTop: 3 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.card,
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  itemTitle: { fontSize: 15, fontWeight: '600', color: C.text },
  itemSub: { fontSize: 13, color: C.textMuted, marginTop: 2 },
});
