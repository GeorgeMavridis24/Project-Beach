import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MessageThread } from '@/components/MessageThread';
import { previewCells, SunbedMap } from '@/components/SunbedMap';
import { Badge, Banner, Button, Card, Empty, Loading, Screen, SectionTitle } from '@/components/ui';
import { C } from '@/constants/brand';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { euro } from '@/lib/dates';
import { confirm } from '@/lib/dialogs';
import type { PartnerRequest } from '@/lib/types';

const STATUS = {
  pending: { text: 'Σε εξέταση', tone: 'warning' as const },
  approved: { text: 'Εγκρίθηκε', tone: 'success' as const },
  rejected: { text: 'Δεν εγκρίθηκε', tone: 'danger' as const },
};

export default function PartnerStatusScreen() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const [req, setReq] = useState<PartnerRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await api<PartnerRequest[]>('/partner/requests/me', { query: { mark_read: true } });
      setReq(list[0] ?? null);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Ανανέωση κάθε 15'' όσο είναι ανοιχτή η οθόνη, για να φαίνονται οι απαντήσεις.
  useFocusEffect(
    useCallback(() => {
      load();
      const t = setInterval(load, 15000);
      return () => clearInterval(t);
    }, [load]),
  );

  const withdraw = async () => {
    if (!req) return;
    if (!(await confirm('Ακύρωση αίτησης', 'Θέλεις να ακυρώσεις την αίτηση;', 'Ακύρωση αίτησης', true))) return;
    try {
      await api(`/partner/requests/${req.id}`, { method: 'DELETE' });
      router.back();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const goToShop = async () => {
    await refreshUser();
    router.push('/admin/beaches');
  };

  if (loading) return <Loading />;
  if (!req) {
    return (
      <Screen topInset={false}>
        <Empty text="Δεν έχεις κάνει αίτηση ακόμα." icon="storefront-outline" />
        <Button title="Γίνε συνεργάτης" onPress={() => router.replace('/partner/apply')} />
      </Screen>
    );
  }

  return (
    <Screen topInset={false} onRefresh={load}>
      {error ? <Banner text={error} /> : null}
      <Card>
        <View style={st.head}>
          <Text style={st.title}>{req.business_name}</Text>
          <Badge text={STATUS[req.status].text} tone={STATUS[req.status].tone} />
        </View>
        <Text style={st.line}>Ωράριο {req.open_time} – {req.close_time} · τηλ. {req.phone}</Text>
        <Text style={st.line}>
          {req.total_sunbeds} ξαπλώστρες · VIP {euro(req.premium_price)} · κανονική {euro(req.price)}
        </Text>
        {req.admin_note ? <Banner text={`Σχόλιο διαχειριστή: ${req.admin_note}`} tone={req.status === 'rejected' ? 'danger' : 'info'} /> : null}
        <SunbedMap mode="admin" rows={req.rows} cols={req.cols} cells={previewCells(req.rows, req.cols, req.premium_rows)} />
        <View style={st.actions}>
          {req.status === 'pending' ? (
            <>
              <Button title="Διόρθωση αίτησης" icon="create-outline" small variant="secondary" onPress={() => router.push('/partner/apply')} />
              <Button title="Ακύρωση αίτησης" icon="close-outline" small variant="danger" onPress={withdraw} />
            </>
          ) : null}
          {req.status === 'approved' ? <Button title="Το κατάστημά μου" icon="storefront-outline" small onPress={goToShop} /> : null}
          {req.status === 'rejected' ? (
            <Button title="Νέα αίτηση" icon="refresh" small onPress={() => router.push('/partner/apply')} />
          ) : null}
        </View>
      </Card>

      <SectionTitle>Επικοινωνία με την ομάδα</SectionTitle>
      <Card>
        <MessageThread
          messages={req.messages ?? []}
          myId={user?.id ?? -1}
          placeholder="Γράψε στην ομάδα του SmartBeach…"
          onSend={async (body) => {
            const updated = await api<PartnerRequest>(`/partner/requests/${req.id}/messages`, { method: 'POST', body: { body } });
            setReq(updated);
          }}
        />
      </Card>
    </Screen>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { fontSize: 19, fontWeight: '700', color: C.text, flex: 1 },
  line: { fontSize: 14, color: C.textMuted, marginBottom: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
});
