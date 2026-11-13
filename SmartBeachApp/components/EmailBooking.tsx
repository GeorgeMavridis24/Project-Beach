import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { C } from '@/constants/brand';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

import { Banner, Button, Field } from './ui';

/** "Αποστολή στο email": στέλνει την κράτηση με το QR στο email του χρήστη ή σε άλλο (π.χ. σε φίλο). */
export function EmailBooking({ bookingId, onClose }: { bookingId: number; onClose?: () => void }) {
  const { user } = useAuth();
  const [to, setTo] = useState(user?.email ?? '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'success' | 'warning' | 'danger'; text: string } | null>(null);

  const send = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await api<{ sent: boolean; detail: string }>(`/bookings/${bookingId}/email`, {
        method: 'POST',
        body: { to: to.trim() || undefined },
      });
      setResult({ tone: res.sent ? 'success' : 'warning', text: res.detail });
    } catch (e: any) {
      setResult({ tone: 'danger', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={st.box}>
      <Text style={st.title}>Αποστολή κράτησης στο email</Text>
      <Text style={st.help}>Θα σταλεί με τα στοιχεία και τον κωδικό QR. Μπορείς να βάλεις και email φίλου.</Text>
      <Field
        value={to}
        onChangeText={setTo}
        placeholder="email@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        accessibilityLabel="Email παραλήπτη"
      />
      {result ? <Banner text={result.text} tone={result.tone} /> : null}
      <View style={st.row}>
        <Button title="Αποστολή" icon="mail-outline" small onPress={send} loading={busy} disabled={!to.includes('@')} style={{ flex: 1 }} />
        {onClose ? <Button title="Κλείσιμο" small variant="ghost" onPress={onClose} style={{ flex: 1 }} /> : null}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  box: { backgroundColor: C.primarySoft, borderRadius: 12, padding: 12, marginTop: 10 },
  title: { fontSize: 15, fontWeight: '700', color: C.primaryDark },
  help: { fontSize: 13, color: C.textMuted, marginTop: 2, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8 },
});
